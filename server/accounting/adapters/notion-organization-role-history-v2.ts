import { sourceKeyDigest, sourceText } from "./admin-readable-source-v2";
import { normalizeNotionRoleFields } from "./notion-organization-role-history-v1";

export const notionOrganizationRoleHistoryAdapterV2 = Object.freeze({
  adapterCode: "notion-organization-role-history-v2",
  sourceCode: "NOTION_ORGANIZATION_ROLE_HISTORY",
  outputFamily: "role-row-v3",
  normalizationVersion: "notion-organization-role-history-v2@2.0.0+admin-readable-v1",
});

export function normalizeNotionRoleRowV2(row: Record<string, unknown>) {
  const name = sourceText(row["표기명"], true)!;
  const note = sourceText(row["비고"]);
  const locator = sourceText(row["출처"]);
  const verification = sourceText(row["검증근거"]);
  return Object.freeze({
    ...normalizeNotionRoleFields(row),
    name_snapshot: name,
    name_key_digest: sourceKeyDigest("role-name-key", name, true),
    note_snapshot: note,
    note_digest: sourceKeyDigest("role-note", note),
    source_locator_snapshot: locator,
    source_locator_digest: sourceKeyDigest("role-source-locator", locator),
    verification_evidence_snapshot: verification,
    verification_evidence_digest: sourceKeyDigest("role-verification-evidence", verification),
  });
}
