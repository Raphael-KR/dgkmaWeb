export type SecurityCatalogAggregate = Readonly<{
  publicSchemaCreate: boolean;
  publicRelationPrivileges: number;
  publicSequencePrivileges: number;
  publicRoutinePrivileges: number;
  defaultPublicPrivileges: number;
  rlsEnabled: number;
  rlsForced: number;
  policies: number;
  securityDefiner: number;
  securityDefinerWithoutSafeSearchPath: number;
  relationOwnerMismatch: number;
  routineOwnerMismatch: number;
  roleMembershipCount: number;
  roleMembershipDigest: string;
}>;

const SHA256_HEX = /^[0-9a-f]{64}$/;
const SENSITIVE_EVIDENCE =
  /postgres(?:ql)?:\/\/|(?:password|passwd|pwd)\s*[:=]|(?:api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;

function fail(code: string): never {
  throw new Error(code);
}

export function assertClosedSecurityCatalog(value: SecurityCatalogAggregate): void {
  if (
    value.publicSchemaCreate ||
    value.publicRelationPrivileges !== 0 ||
    value.publicSequencePrivileges !== 0 ||
    value.publicRoutinePrivileges !== 0 ||
    value.defaultPublicPrivileges !== 0 ||
    value.rlsEnabled !== 0 ||
    value.rlsForced !== 0 ||
    value.policies !== 0 ||
    value.securityDefiner !== 0 ||
    value.securityDefinerWithoutSafeSearchPath !== 0 ||
    value.relationOwnerMismatch !== 0 ||
    value.routineOwnerMismatch !== 0 ||
    value.roleMembershipCount < 0 ||
    !SHA256_HEX.test(value.roleMembershipDigest)
  ) {
    fail("security_catalog_drift");
  }
}

export function assertSensitiveEvidenceAbsent(chunks: readonly string[]): void {
  for (const chunk of chunks) {
    if (SENSITIVE_EVIDENCE.test(chunk)) {
      fail("sensitive_evidence_detected");
    }
  }
}
