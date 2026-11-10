import type { NoticeFacts, NoticeType } from "@shared/contracts/notices";

/** Normalize only supplied facts. Identity, membership and publication authority stay in the renderer. */
export function normalizeCelebrationFacts(type: NoticeType, facts: NoticeFacts): NoticeFacts {
  if (type === "obituary") return facts;
  const result: NoticeFacts = {
    ...facts,
    notes: facts.notes.map((note) => note.trim()).filter(Boolean),
    accounts: facts.accounts.map((account) => ({ ...account })),
  };
  for (const key of ["relation", "deceasedName", "deceasedAge", "deathDate", "cemetery"] as const)
    result[key] = null;
  result.visitationDeclined = false;
  for (const key of [
    "meal",
    "parking",
    "flowerPolicy",
    "address",
    "groomName",
    "brideName",
  ] as const)
    result[key] = result[key]?.trim() || null;
  // Promote labelled legacy notes without inventing an optional section or losing other guidance.
  const optional = { meal: "식사", parking: "주차", flowerPolicy: "화환" } as const;
  for (const [key, label] of Object.entries(optional)) {
    const field = key as keyof typeof optional;
    if (!result[field])
      result[field] =
        result.notes
          .map((note) => new RegExp(`^${label}\\s*[:：]\\s*(.+)$`).exec(note))
          .find(Boolean)?.[1] || null;
  }
  if (type === "opening") {
    for (const key of [
      "weddingRelation",
      "childName",
      "childAlumniInfo",
      "childMemberType",
      "childTitle",
      "partnerName",
      "groomName",
      "brideName",
      "weddingPartyRole",
      "childAdmissionYear",
      "childGraduationClass",
    ] as const)
      result[key] = null;
  } else {
    result.clinicName = null;
    // Role facts can identify the participant, but must not overwrite an author's supplied name.
    if (!result.childName && result.weddingRelation !== "본인" && result.weddingPartyRole)
      result.childName =
        result.weddingPartyRole === "신랑"
          ? result.groomName || null
          : result.weddingPartyRole === "신부"
            ? result.brideName || null
            : null;
  }
  return result;
}
