function fail(code: string): never { throw new Error(code); }
const ROOT_KEYS = ["asOf", "currentDuesYear", "dues", "member", "schemaVersion"].sort();

export type SelfSource = { sessionUserId: number | null; requestedUserId?: number; asOf: string; currentDuesYear: number; member: null | { memberUid: string; memberKind: "member" | "honorary"; status: "active" | "ended"; displayName: string; generation: string }; dues: null | { tierCode: string | null; monthlyMinimum: bigint | null; annualMinimum: bigint | null; personalPledgeMonthly: bigint | null; paidTotal: bigint | null; policyShortfall: bigint | null; pledgeShortfall: bigint | null; specialAssessmentRequired: bigint | null; specialAssessmentPaid: bigint | null; rightsStatus: "rights_member" | "member" | "honorary" | "unavailable"; reasonCode: string | null } };

export function projectAccountingSelf(source: SelfSource) {
  if (source.sessionUserId === null) fail("accounting_self_unauthenticated");
  if (source.requestedUserId !== undefined) fail("accounting_self_other_identity_forbidden");
  const amounts = source.dues === null ? null : Object.fromEntries(Object.entries(source.dues).map(([key, value]) => [key, typeof value === "bigint" ? value.toString(10) : value]));
  const result = { schemaVersion: "accounting-self-v1", asOf: source.asOf, currentDuesYear: source.currentDuesYear, member: source.member, dues: amounts };
  if (JSON.stringify(Object.keys(result).sort()) !== JSON.stringify(ROOT_KEYS)) fail("accounting_self_root_shape_mismatch");
  if (JSON.stringify(result).includes("phone") || JSON.stringify(result).includes("address") || JSON.stringify(result).includes("workplace")) fail("accounting_self_pii_leak");
  return result;
}

export function assertAccountingSelfJsonSafe(value: unknown): void {
  const walk = (entry: unknown): void => {
    if (typeof entry === "bigint") fail("accounting_self_numeric_bigint_forbidden");
    if (Array.isArray(entry)) entry.forEach(walk);
    else if (entry && typeof entry === "object") Object.values(entry).forEach(walk);
  };
  walk(value);
  JSON.stringify(value);
}
