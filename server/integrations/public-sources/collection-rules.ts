import type { NoticeType } from "@shared/contracts/notices";
import {
  collectionRuleSchema,
  type CollectionRule,
  type FieldEvidence,
} from "./collection-contract";
import { atPath, enoughFields, jsonFields } from "./collection-fields";
import { assertSafeSourceUrl } from "../../modules/events/event-source-policy";

const sensitive = /(?:token|auth|secret|password|session|signature|api.?key|cookie)/i;
const opaque = /^(?:[0-9]{1,12}|[a-f0-9]{16,64}|[A-Za-z0-9_-]{16,100})$/;
const slug = /^[A-Za-z0-9_-]{3,100}$/;
export function pageIdentity(raw: string) {
  const u = assertSafeSourceUrl(raw);
  const parts = u.pathname.split("/");
  const q = Array.from(u.searchParams).find(
    ([k, v]) =>
      !sensitive.test(k) &&
      /^(?:id|seq|idx|no|code|uuid|key|invitationId|cardId|uid)$/i.test(k) &&
      (opaque.test(v) || slug.test(v)),
  );
  if (q)
    return {
      domain: u.hostname,
      pattern: u.pathname + "?" + q[0] + "={id}",
      id: { source: "query" as const, key: q[0], transform: "identity" as const },
      value: q[1],
    };
  // Preserve existing opaque-ID selection before accepting shorter invitation slugs.
  let index = parts.findLastIndex((v) => opaque.test(v));
  if (index < 1) index = parts.findLastIndex((v) => slug.test(v));
  if (
    index < 1 ||
    parts.some(
      (v, i) =>
        i !== index &&
        (!/^[A-Za-z0-9_.~-]*$/.test(v) || /^[a-f0-9]{16,64}$/i.test(v) || /[0-9]{7,}/.test(v)),
    )
  )
    return;
  const pattern = parts.map((v, i) => (i === index ? "{id}" : v)).join("/");
  return {
    domain: u.hostname,
    pattern,
    id: { source: "path" as const, key: String(index), transform: "identity" as const },
    value: parts[index],
  };
}
export function ruleUrl(rule: CollectionRule, page: string): string | undefined {
  const identity = pageIdentity(page);
  if (!identity || identity.domain !== rule.domain || identity.pattern !== rule.pagePattern) return;
  let value = identity.value;
  if (rule.id.source !== identity.id.source || rule.id.key !== identity.id.key) return;
  if (rule.id.transform === "base64url") {
    try {
      value = Buffer.from(value, "base64url").toString("utf8");
    } catch {
      return;
    }
  }
  if (!opaque.test(value) && !slug.test(value)) return;
  const url = rule.request.urlTemplate.replaceAll("{id}", encodeURIComponent(value));
  return assertSafeSourceUrl(url).href;
}
export function buildRule(
  page: string,
  api: string,
  value: unknown,
  noticeType: NoticeType = "obituary",
): CollectionRule | undefined {
  const identity = pageIdentity(page);
  if (!identity || unavailableJson(value)) return;
  const endpoint = assertSafeSourceUrl(api);
  if (Array.from(endpoint.searchParams.keys()).some((k) => sensitive.test(k))) return;
  const found = jsonFields(value, api, "api", noticeType);
  if (!enoughFields(found.evidence, noticeType)) return;
  let id = identity.value;
  let transform: "identity" | "base64url" = "identity";
  const segments = [...endpoint.pathname.split("/"), ...Array.from(endpoint.searchParams.values())];
  if (!segments.includes(id)) {
    const decoded = Buffer.from(id, "base64url").toString("utf8");
    if ((!opaque.test(decoded) && !slug.test(decoded)) || !segments.includes(decoded)) return;
    id = decoded;
    transform = "base64url";
  }
  // Replace whole path/query values only. Never persist other per-page identifiers or query values.
  endpoint.pathname = endpoint.pathname
    .split("/")
    .map((s) => (s === id ? "{id}" : s))
    .join("/");
  for (const [k, v] of Array.from(endpoint.searchParams)) {
    if (v === id) endpoint.searchParams.set(k, "{id}");
    else if (
      !["format", "lang", "locale"].includes(k) ||
      !["json", "ko", "ko-KR", "kr", "en"].includes(v)
    )
      return;
  }
  const template = endpoint.href.replaceAll("%7Bid%7D", "{id}");
  if (
    endpoint.pathname
      .split("/")
      .some(
        (s) =>
          s !== "%7Bid%7D" &&
          s !== "{id}" &&
          (/[0-9]{7,}/.test(s) ||
            /^[a-f0-9]{16,64}$/i.test(s) ||
            !/^[-A-Za-z0-9_.~]*$/.test(s) ||
            s.length > 80),
      )
  )
    return;
  const reusable = JSON.stringify({
    template,
    pattern: identity.pattern,
    fields: found.fields,
  }).toLowerCase();
  if (
    found.evidence.some(
      (e) =>
        [
          "deceasedName",
          "contactName",
          "contactPhone",
          "accountNumber",
          "accountHolder",
          "groomName",
          "brideName",
          "groomFather",
          "groomMother",
          "brideFather",
          "brideMother",
        ].includes(e.field) &&
        e.value.length >= 3 &&
        reusable.includes(e.value.toLowerCase()),
    )
  )
    return;
  const candidate = {
    schemaVersion: 1,
    noticeTypes: [noticeType],
    domain: identity.domain,
    pagePattern: identity.pattern,
    id: { ...identity.id, transform },
    request: { method: "GET", urlTemplate: template },
    fields: found.fields,
    shape: found.shape,
  };
  const parsed = collectionRuleSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}
export function applyRule(
  rule: CollectionRule,
  value: unknown,
  url: string,
  noticeType: NoticeType = "obituary",
): FieldEvidence[] | undefined {
  if (!(rule.noticeTypes ?? ["obituary"]).includes(noticeType) || unavailableJson(value)) return;
  if (rule.shape.some((s) => typeof atPath(value, s.path) !== s.type)) return;
  const collectedAt = new Date().toISOString();
  const evidence = rule.fields
    .map((f) => ({
      field: f.field,
      value: String(atPath(value, f.path) ?? "").slice(0, 500),
      url,
      locator: JSON.stringify(f.path),
      kind: "api" as const,
      collectedAt,
    }))
    .filter(
      (e) =>
        e.value.trim() && !/^(?:null|undefined|미입력|미정|정보 없음|[-–—])$/i.test(e.value.trim()),
    );
  return enoughFields(evidence, noticeType) ? evidence : undefined;
}

export function unavailableJson(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object" || depth > 10) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      (/^(?:isDeleted|requiresLogin|isPrivate)$/i.test(key) && child === true) ||
      (key === "isPublic" && child === false) ||
      (typeof child === "object" && unavailableJson(child, depth + 1)),
  );
}
