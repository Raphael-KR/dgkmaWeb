import { sourceKeyDigest, sourceText } from "./admin-readable-source-v2";
import { normalizeNotionRoleRowV3 } from "./notion-organization-role-history-v3";

export const notionOrganizationRoleHistoryAdapterV4 = Object.freeze({
  adapterCode: "notion-organization-role-history-v4", sourceCode: "NOTION_ORGANIZATION_ROLE_HISTORY",
  outputFamily: "role-row-v5", normalizationVersion: "notion-organization-role-history-v4@4.0.0+generation-evidence-v1",
});

export function normalizeNotionRoleRowV4(row: Record<string, unknown>) {
  const generationSource = sourceText(row["졸업기수"]);
  const normalized = normalizeNotionRoleRowV3(generationSource === "대학원" ? { ...row, "졸업기수": null } : row);
  return Object.freeze({
    ...normalized,
    generation_source_snapshot: generationSource,
    generation_source_digest: sourceKeyDigest("role-generation-source", generationSource),
  });
}
