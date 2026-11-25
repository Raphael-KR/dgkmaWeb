/* global window, document, location */
// DOM access runs inside the BAND page. Download through the original viewer's Save action.
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  chmod,
  copyFile,
  link,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

const positiveId = (value) => /^[1-9][0-9]*$/.test(String(value));
const disabled = (source) =>
  source?.is_restricted ||
  source?.is_secret ||
  source?.is_visible_only_to_author ||
  source?.savable_state === "disabled";
const photoAnchors =
  ".commentBody a.photo:has(img.photoImage), .cComment a._multiplePhoto:has(img.photoItemImage)";
const videoAnchors = '[data-viewname="DCommentAttachedVideoView"]';
const closeViewer = "button._directCloseButton";

function sourceIdentity(url) {
  const parsed = new URL(url);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !/(?:^|\.)(?:naver\.net|campmobile\.net|pstatic\.net)$/.test(parsed.hostname)
  ) {
    throw new Error("unexpected-comment-media-source");
  }
  return {
    path: parsed.pathname,
    key: createHash("sha256")
      .update(parsed.hostname + parsed.pathname)
      .digest("hex"),
  };
}

export function commentMediaRequests(
  group,
  cutoff,
  { onlyKeys, since = 0, postRestricted = false } = {},
) {
  const posts = String(group.postNo);
  if (!positiveId(posts)) throw new Error("invalid-source-post");
  const output = new Map();
  for (const page of group.pages)
    for (const top of page.items) {
      const parent = String(top.comment_id);
      for (const item of [top, ...(top.latest_comment ?? [])]) {
        const id = String(item.comment_id);
        if (
          !positiveId(id) ||
          !positiveId(parent) ||
          String(item.post_no) !== posts ||
          (item !== top && String(item.origin_comment_id) !== parent)
        )
          throw new Error("comment-parent-mismatch");
        if (
          !Number.isSafeInteger(item.created_at) ||
          item.created_at < since ||
          Math.max(
            item.created_at,
            item.updated_at || 0,
            item.modified_at || 0,
            item.edited_at || 0,
          ) >= cutoff
        )
          continue;
        const key = "post:" + posts + "/comment:" + parent + (item === top ? "" : "/reply:" + id);
        if (onlyKeys && !onlyKeys.has(key)) continue;
        const media = [];
        for (const [i, photo] of (item.photos ?? []).entries()) {
          media.push({
            kind: "photo",
            position: i + 1,
            ...sourceIdentity(photo.url),
            restricted: Boolean(
              postRestricted || disabled(top) || disabled(item) || disabled(photo),
            ),
          });
        }
        if (item.video) {
          if (!positiveId(item.video.id)) throw new Error("invalid-comment-video");
          media.push({
            kind: "video",
            position: 1,
            ...sourceIdentity(item.video.logo_image),
            videoId: String(item.video.id),
            sizes: Object.values(item.video.file_size ?? {}),
            restricted: Boolean(
              postRestricted || disabled(top) || disabled(item) || disabled(item.video),
            ),
          });
        }
        if (media.length) {
          const previous = output.get(key);
          if (previous && JSON.stringify(previous.media) !== JSON.stringify(media))
            throw new Error("conflicting-comment-pages");
          output.set(key, { key, media, commentId: id });
        }
      }
    }
  return [...output.values()];
}

async function digest(file) {
  const hash = createHash("sha256");
  for await (const data of createReadStream(file)) hash.update(data);
  return hash.digest("hex");
}

export async function readMediaReceipt(root, postNo) {
  if (!positiveId(postNo)) throw new Error("invalid-receipt-post");
  try {
    const data = JSON.parse(await readFile(join(root, "comment-media", postNo + ".json"), "utf8"));
    if (data.postNo !== postNo || data.format !== "band-comment-media-v1")
      throw new Error("wrong-comment-media-receipt");
    return data;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { format: "band-comment-media-v1", postNo, entries: {} };
  }
}

async function writeReceipt(root, receipt) {
  const dir = join(root, "comment-media");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const dest = join(dir, receipt.postNo + ".json");
  const tmp = dest + "." + randomUUID();
  await writeFile(tmp, JSON.stringify(receipt) + "\n", { flag: "wx", mode: 0o600 });
  await rename(tmp, dest);
}

function receiptKey(request, media) {
  return request.key + "/" + media.kind + ":" + (media.videoId ?? media.position);
}

export async function alreadySaved(root, receipt, request, media) {
  if (media.restricted) return false;
  const stored = receipt.entries[receiptKey(request, media)];
  if (
    stored?.status !== "saved" ||
    stored.sourceKey !== media.key ||
    !/^assets\/comment-[a-f0-9]{64}\.(?:jpg|png|gif|webp|mp4)$/.test(stored.file)
  )
    return false;
  try {
    const file = join(root, stored.file);
    return (await stat(file)).size === stored.bytes && (await digest(file)) === stored.sha256;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function signature(header) {
  if (header.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return ["jpg", "image/jpeg"];
  if (header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return ["png", "image/png"];
  if (["GIF87a", "GIF89a"].includes(header.toString("ascii", 0, 6))) return ["gif", "image/gif"];
  if (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP")
    return ["webp", "image/webp"];
  if (header.toString("ascii", 4, 8) === "ftyp") return ["mp4", "video/mp4"];
  throw new Error("unrecognized-download-bytes");
}

async function archiveDownload(root, source, spec) {
  const bytes = (await stat(source)).size;
  const file = await open(source, "r");
  const header = Buffer.alloc(16);
  try {
    await file.read(header, 0, header.length, 0);
  } finally {
    await file.close();
  }
  const [extension, contentType] = signature(header);
  if ((spec.kind === "video") !== (extension === "mp4") || bytes <= 0)
    throw new Error("wrong-download-type");
  if (spec.kind === "video" && spec.sizes.length && !spec.sizes.includes(bytes))
    throw new Error("video-source-size-mismatch");
  const sha256 = await digest(source);
  const relative = "assets/comment-" + sha256 + "." + extension;
  const destination = join(root, relative);
  const temp = destination + "." + randomUUID();
  try {
    await copyFile(source, temp);
    await chmod(temp, 0o600);
    try {
      await link(temp, destination);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    if ((await stat(destination)).size !== bytes || (await digest(destination)) !== sha256)
      throw new Error("archive-readback-mismatch");
  } finally {
    await unlink(temp).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  return { status: "saved", file: relative, bytes, sha256, contentType, sourceKey: spec.key };
}

async function downloadCommentVideo(page, root, postNo, request, spec) {
  // BAND supplies distinct playback and download fields. Only consume a
  // download offered for this exact comment in the original page.
  const source = await page.evaluate(
    ({ postNo, cid }) => {
      for (const r of [...window.__dgCommunityBackup.responses].reverse()) {
        if (r.path !== "/v2.0.0/get_video_url_by_comment" || r.data.result_code !== 1) continue;
        const key = JSON.parse(r.scope.content_key || "{}");
        if (String(key.post_no) !== postNo || String(key.comment_id) !== cid) continue;
        const qualities = Object.entries(r.data.result_data?.download ?? {}).filter(
          ([q, url]) => /^\d+p$/.test(q) && typeof url === "string",
        );
        qualities.sort(([a], [b]) => parseInt(b) - parseInt(a));
        if (qualities.length) return qualities[0][1];
      }
      return null;
    },
    { postNo, cid: request.commentId },
  );
  if (!source) throw new Error("source-video-download-unavailable");
  const u = new URL(source);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    !/(?:^|\.)(?:band\.us|pstatic\.net|naver\.net)$/.test(u.hostname)
  )
    throw new Error("unexpected-video-download-origin");
  const tmp = join(root, "assets", ".comment-video-" + randomUUID());
  try {
    const res = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(60000) });
    if (!res.ok || !res.body) throw new Error("video-download-http-failure");
    await pipeline(
      Readable.fromWeb(res.body),
      createWriteStream(tmp, { flags: "wx", mode: 0o600 }),
    );
    return await archiveDownload(root, tmp, spec);
  } finally {
    await unlink(tmp).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}

async function openCommentViewer(page, request, spec) {
  // The list may show just two thumbnails for a five-photo comment. Open one that
  // belongs to this comment and navigate the viewer to the source image.
  const selector = spec.kind === "video" ? videoAnchors : photoAnchors;
  const paths = request.media.filter((m) => m.kind === spec.kind).map((m) => m.path);
  const find = () =>
    page.evaluate(
      ({ selector, paths, wanted }) => {
        const links = [...document.querySelectorAll(selector)];
        const matches = [];
        for (const [index, el] of links.entries()) {
          for (const image of el.querySelectorAll("img")) {
            const src = image.currentSrc || image.src;
            if (!src) continue;
            const path = new URL(src, location.href).pathname;
            const position = paths.indexOf(path);
            if (position >= 0) matches.push({ index, position, exact: path === wanted });
          }
        }
        return matches.find((m) => m.exact) ?? matches[0] ?? null;
      },
      { selector, paths, wanted: spec.path },
    );
  let found = await find();
  while (!found) {
    const more = await page.evaluate(() =>
      [...document.querySelectorAll(".dPostCommentMainView button.prevComment")].some(
        (e) => e.getClientRects().length && !e.disabled,
      ),
    );
    if (!more) break;
    const before = await page.evaluate(() => document.querySelectorAll(".cComment").length);
    await page.click("loc=css:.dPostCommentMainView button.prevComment");
    await page.waitForFunction((n) => document.querySelectorAll(".cComment").length > n, before, {
      timeout: 5000,
    });
    found = await find();
  }
  if (!found) throw new Error("source-comment-media-not-visible");
  await page.evaluate(
    ({ selector, index }) =>
      document
        .querySelectorAll(selector)
        .item(index)
        .scrollIntoView({ block: "center", inline: "nearest" }),
    { selector, index: found.index },
  );
  await page.click("loc=css:" + selector + " >> nth=" + found.index);
  if (spec.kind === "photo") {
    for (let i = found.position; i < paths.length; i++) {
      await page.waitForFunction(
        (path) =>
          [...document.querySelectorAll(".mediaWrap img")].some(
            (img) =>
              img.getClientRects().length &&
              img.src &&
              new URL(img.currentSrc || img.src).pathname === path,
          ),
        paths[i],
        { timeout: 5000 },
      );
      if (paths[i] === spec.path) return;
      await page.click("loc=css:button.btnNext");
    }
    throw new Error("source-photo-not-in-viewer");
  }
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".mediaWrap video")].some(
        (v) => v.getClientRects().length && v.currentSrc,
      ),
    undefined,
    { timeout: 8000 },
  );
}

export async function collectCommentMedia(page, root, postNo, requests) {
  const receipt = await readMediaReceipt(root, postNo);
  const result = { saved: 0, reused: 0, pending: 0 };
  for (const request of requests)
    for (const spec of request.media) {
      const id = receiptKey(request, spec);
      if (await alreadySaved(root, receipt, request, spec)) {
        result.reused++;
        continue;
      }
      let entry;
      try {
        if (spec.restricted) throw new Error("source-download-restricted");
        await openCommentViewer(page, request, spec);
        if (spec.kind === "video") {
          entry = await downloadCommentVideo(page, root, postNo, request, spec);
        } else {
          const button = "button._downloadButton";
          await page.waitForFunction(
            (s) =>
              [...document.querySelectorAll(s)].some(
                (b) =>
                  b.getClientRects().length &&
                  !b.disabled &&
                  b.getAttribute("aria-disabled") !== "true" &&
                  !b.classList.contains("-disabled"),
              ),
            button,
            { timeout: 4000 },
          );
          const event = page.waitForEvent("download", { timeout: 12000 }).then(
            (d) => d,
            () => null,
          );
          await page.click("loc=css:" + button);
          const download = await event;
          if (!download) throw new Error("source-save-returned-no-file");
          if (new URL(download.url()).pathname !== spec.path)
            throw new Error("download-source-path-mismatch");
          entry = await archiveDownload(root, await download.path(), spec);
        }
        result.saved++;
      } catch (error) {
        if (error.code || /EGO_|lost control|control was|not owned/i.test(error.message))
          throw error;
        entry = {
          status: spec.restricted ? "restricted" : "pending",
          sourceKey: spec.key,
          reason: /^[a-z][a-z-]+$/.test(error.message)
            ? error.message
            : "source-viewer-unavailable",
        };
        result.pending++;
      } finally {
        if (
          await page.evaluate(
            (s) => [...document.querySelectorAll(s)].some((b) => b.getClientRects().length),
            closeViewer,
          )
        ) {
          await page.click("loc=css:" + closeViewer);
        }
      }
      receipt.entries[id] = {
        ...entry,
        ...(spec.videoId ? { videoId: spec.videoId } : {}),
        capturedAt: new Date().toISOString(),
      };
      await writeReceipt(root, receipt);
    }
  return result;
}

// A dated manifest limits recovery to reviewed historical comments. Without a
// manifest the caller supplies candidate post IDs from its daily discovery.
export async function recoverFromArchive(
  page,
  root,
  {
    through,
    manifestStatus,
    postIds,
    since = 0,
    limit = Infinity,
    skipPosts = [],
    hook,
    photosOnly = false,
  } = {},
) {
  const cutoff = Date.parse(through + "T00:00:00+09:00") + 86400000;
  const today = Date.parse(
    new Date(Date.now() + 32400000).toISOString().slice(0, 10) + "T00:00:00+09:00",
  );
  if (!Number.isSafeInteger(cutoff) || cutoff > today) throw new Error("open-date");
  const index = JSON.parse(await readFile(join(root, "index.json"), "utf8"));
  if (String(index.bandNo) !== "11089836") throw new Error("wrong-source-band");
  let onlyKeys;
  if (manifestStatus) {
    const manifest = JSON.parse(await readFile(manifestStatus, "utf8"));
    if (manifest.containerId !== "11089836" || manifest.throughKst !== through)
      throw new Error("wrong-manifest-cutoff");
    onlyKeys = new Set(
      manifest.comments
        .filter((c) => c.state === "held" && c.reasons.includes("media:source-not-backed-up"))
        .map((c) => c.sourceKey),
    );
    postIds = [...new Set([...onlyKeys].map((k) => k.split("/")[0].slice(5)))];
  }
  if (!Array.isArray(postIds)) throw new Error("missing-archive-selection");
  await page.cdp("Page.addScriptToEvaluateOnNewDocument", { source: hook });
  const totals = { visited: 0, saved: 0, reused: 0, pending: 0, attemptedPosts: [] };
  for (const pid of postIds) {
    if (skipPosts.includes(pid)) continue;
    if (!positiveId(pid) || !index.posts[pid]) throw new Error("invalid-archive-post");
    const raw = JSON.parse(await readFile(join(root, index.posts[pid].file), "utf8")).sourceData;
    if (
      String(raw.post_no) !== pid ||
      !Number.isSafeInteger(raw.created_at) ||
      raw.created_at >= cutoff
    )
      throw new Error("invalid-archive-post-date");
    const group = JSON.parse(await readFile(join(root, "comments", pid + ".json"), "utf8"));
    const requests = commentMediaRequests(group, cutoff, {
      onlyKeys,
      since,
      postRestricted: disabled(raw),
    });
    const receipt = await readMediaReceipt(root, pid);
    const pending = [];
    for (const req of requests) {
      const media = [];
      for (const m of req.media) {
        if (photosOnly && m.kind !== "photo") continue;
        if (await alreadySaved(root, receipt, req, m)) totals.reused++;
        else media.push(m);
      }
      // Keep sibling positions for the viewer even if only one image is missing.
      if (media.length)
        pending.push(
          photosOnly ? { ...req, media: req.media.filter((m) => m.kind === "photo") } : req,
        );
    }
    if (!pending.length) continue;
    let res;
    try {
      await page.goto("https://band.us/band/11089836/post/" + pid, { timeout: 30000 });
      await page.waitForFunction(
        (id) =>
          window.__dgCommunityBackup?.responses?.some(
            (r) =>
              r.path === "/v2.3.0/get_comments" &&
              r.data.result_code === 1 &&
              String(JSON.parse(r.scope.content_key).post_no) === id,
          ),
        pid,
        { timeout: 15000 },
      );
      res = await collectCommentMedia(page, root, pid, pending);
    } catch (error) {
      if (!/timeout|timed out|did not answer|unresponsive/i.test(error.message)) throw error;
      // Keep completed downloads if this particular original becomes unresponsive.
      const saved = await readMediaReceipt(root, pid);
      let missing = 0;
      for (const req of pending)
        for (const m of req.media) {
          if (await alreadySaved(root, saved, req, m)) continue;
          saved.entries[receiptKey(req, m)] = {
            status: "pending",
            reason: "source-viewer-timeout",
            sourceKey: m.key,
            capturedAt: new Date().toISOString(),
          };
          missing++;
        }
      await writeReceipt(root, saved);
      res = { saved: 0, pending: missing };
    }
    totals.visited++;
    totals.attemptedPosts.push(pid);
    totals.saved += res.saved;
    totals.pending += res.pending;
    if (totals.visited >= limit) break;
  }
  return totals;
}
