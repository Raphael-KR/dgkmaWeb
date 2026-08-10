import { createHash } from "node:crypto";
import { canonicalJson, sha256, type CanonicalValue } from "../source-contracts";

export function sourceText(value: unknown, required = false): string | null {
  if (value === null || value === undefined) {
    if (required) throw new Error("source_display_required");
    return null;
  }
  const normalized = String(value).normalize("NFC").trim().replace(/\s+/g, " ");
  if (!normalized) {
    if (required) throw new Error("source_display_required");
    return null;
  }
  return normalized;
}

export function sourceKeyDigest(domain: string, value: unknown, required = false): string | null {
  const normalized = sourceText(value, required);
  return normalized === null ? null : createHash("sha256").update(`${domain}-v1\n${normalized}`).digest("hex");
}

export function adminReviewProjection(input: {
  sourceCode: string;
  coordinateKey: string;
  display: Record<string, string | null>;
  normalizedPayload: CanonicalValue;
}) {
  const display = Object.fromEntries(Object.entries(input.display).map(([key, value]) => [key, sourceText(value)]));
  const contentDigest = sha256(canonicalJson(input.normalizedPayload));
  return Object.freeze({
    sourceCode: input.sourceCode,
    coordinateKey: input.coordinateKey.normalize("NFC").trim(),
    sourceContentDigest: contentDigest,
    reviewDisplay: display,
  });
}
