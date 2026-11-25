import type { File } from "@google-cloud/storage";
import type { Request, Response } from "express";
import { logObjectStorageFailure } from "../../lib/safe-logging";

function byteRange(value: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start <= end ? { start, end } : null;
}

export function streamPrivateMp4(req: Request, res: Response, version: File, size: number) {
  res.set({
    "Content-Type": "video/mp4",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  });
  // No validators are advertised. If-Range cannot match this representation.
  const requested = req.method === "GET" && !req.headers["if-range"] && req.headers.range;
  const range = requested ? byteRange(requested, size) : null;
  if (requested && !range) {
    res.set("Content-Range", `bytes */${size}`).status(416).end();
    return;
  }
  if (range) {
    res.status(206).set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  }
  res.set("Content-Length", String(range ? range.end - range.start + 1 : size));
  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const stream = version.createReadStream({ ...range, decompress: false });
  res.once("close", () => stream.destroy());
  stream.once("error", (error) => {
    logObjectStorageFailure("stream", error, { resource: "band-video" });
    if (res.headersSent) return res.destroy();
    res.removeHeader("Content-Range");
    res.removeHeader("Content-Length");
    res.status(500).type("text/plain").end("영상을 불러오지 못했습니다.");
  });
  stream.pipe(res);
}
