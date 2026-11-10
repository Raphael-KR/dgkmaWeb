import type { NoticeData, NoticeFacts, NoticeFieldSource } from "@shared/contracts/notices";
import type { FieldEvidence } from "../../integrations/public-sources/collection-contract";

function comparable(text: string): string {
  return text.normalize("NFKC").replace(new RegExp("[^\\p{L}\\p{N}]", "gu"), "").toLowerCase();
}

function comparableValues(value: NoticeFacts[keyof NoticeFacts]): string[] {
  if (typeof value === "string") return [comparable(value)];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [comparable(item)];
    return Object.values(item)
      .filter((part): part is string => typeof part === "string")
      .map(comparable);
  });
}

function matchesEvidence(field: string, values: string[], evidence: FieldEvidence): boolean {
  return (
    values.length > 0 &&
    values.every(
      (value) =>
        value.length > 0 &&
        (evidence.field === field || (evidence.field === "sourceText" && value.length >= 4)) &&
        comparable(evidence.value).includes(value),
    )
  );
}

// Store source references without duplicating personal source text. Unmatched facts stay explicit.
export function noticeFieldSources(
  facts: NoticeFacts,
  input: string,
  evidence: FieldEvidence[] = [],
): NoticeData["fieldSources"] {
  const userText = comparable(input.replace(/https?:\/\/\S+/g, ""));
  const result: NonNullable<NoticeData["fieldSources"]> = {};
  for (const [key, value] of Object.entries(facts)) {
    if (
      value === null ||
      value === false ||
      (Array.isArray(value) && !value.length) ||
      key === "questions"
    )
      continue;
    const field = key as keyof NoticeFacts;
    const values = comparableValues(value);
    if (values.length && values.every((part) => part.length > 0 && userText.includes(part))) {
      result[field] = [{ kind: "user", locator: "author-input" }];
      continue;
    }
    const matches = evidence.filter((item) => matchesEvidence(key, values, item));
    const references: NoticeFieldSource[] = matches
      .slice(0, 8)
      .map(({ kind, url, locator, collectedAt }) => ({ kind, url, locator, collectedAt }));
    result[field] = references.length ? references : [{ kind: "unresolved" }];
  }
  return result;
}
