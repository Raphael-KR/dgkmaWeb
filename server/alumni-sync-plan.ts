import { createHash } from "node:crypto";
import type {
  AlumniSyncIssue,
  AlumniSyncIssueCode,
  AlumniSyncReport,
} from "@shared/alumni-sync";

export type AlumniSourceRecord = {
  rowNumber: number;
  department: string;
  generation: string;
  name: string;
  admissionDate?: string | null;
  graduationDate?: string | null;
  address?: string | null;
  mobile?: string | null;
  phone?: string | null;
  group?: string | null;
  status?: string | null;
  alumniPosition?: string | null;
  memo?: string | null;
};

export type AlumniSourceSnapshot = {
  records: AlumniSourceRecord[];
  sourceTotal: number;
  issues: AlumniSyncIssue[];
};

export type AlumniDatabaseRecord = Omit<AlumniSourceRecord, "rowNumber"> & {
  id: number;
  isMatched?: boolean | null;
  matchedUserId?: number | null;
};

export type AlumniManagedRecord = Omit<AlumniSourceRecord, "rowNumber"> & {
  admissionDate: string | null;
  graduationDate: string | null;
  address: string | null;
  mobile: string;
  phone: string | null;
  group: string | null;
  status: string | null;
  alumniPosition: string | null;
  memo: string | null;
};

export type AlumniSyncChange =
  | { kind: "insert"; source: AlumniManagedRecord }
  | { kind: "update"; databaseId: number; source: AlumniManagedRecord };

export type AlumniSyncPlan = {
  report: AlumniSyncReport;
  changes: AlumniSyncChange[];
};

export function normalizeAlumniMobile(value: string | null | undefined): string | null {
  if (!value) return null;

  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("82010")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("8210")) {
    digits = `0${digits.slice(2)}`;
  }

  if (!/^010\d{8}$/.test(digits)) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function required(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function optional(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeManagedRecord(
  record: Omit<AlumniSourceRecord, "rowNumber">,
): AlumniManagedRecord | null {
  const department = required(record.department);
  const generation = required(record.generation);
  const name = required(record.name);
  const mobile = normalizeAlumniMobile(record.mobile);
  if (!department || !generation || !name || !mobile) return null;

  return {
    department,
    generation,
    name,
    admissionDate: optional(record.admissionDate),
    graduationDate: optional(record.graduationDate),
    address: optional(record.address),
    mobile,
    phone: optional(record.phone),
    group: optional(record.group),
    status: optional(record.status),
    alumniPosition: optional(record.alumniPosition),
    memo: optional(record.memo),
  };
}

function addIssue(
  counts: Map<AlumniSyncIssueCode, number>,
  code: AlumniSyncIssueCode,
  count = 1,
) {
  counts.set(code, (counts.get(code) ?? 0) + count);
}

function ensureIssueCount(
  counts: Map<AlumniSyncIssueCode, number>,
  code: AlumniSyncIssueCode,
  count: number,
) {
  counts.set(code, Math.max(counts.get(code) ?? 0, count));
}

function toIssues(counts: Map<AlumniSyncIssueCode, number>): AlumniSyncIssue[] {
  return Array.from(counts, ([code, count]) => ({ code, count }));
}

function sameManagedRecord(left: AlumniManagedRecord, right: AlumniManagedRecord): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createSourceFingerprint(records: Iterable<AlumniManagedRecord>): string {
  const canonicalRecords = Array.from(records, (record) => JSON.stringify(record)).sort();
  const digest = createHash("sha256")
    .update(JSON.stringify(canonicalRecords))
    .digest("hex");
  return `sha256:${digest}`;
}

export function planAlumniSync(
  snapshot: AlumniSourceSnapshot,
  database: AlumniDatabaseRecord[],
): AlumniSyncPlan {
  const issueCounts = new Map<AlumniSyncIssueCode, number>();
  for (const issue of snapshot.issues) {
    ensureIssueCount(issueCounts, issue.code, issue.count);
  }

  if (snapshot.sourceTotal === 0 && !issueCounts.has("SOURCE_UNAVAILABLE")) {
    ensureIssueCount(issueCounts, "EMPTY_SOURCE", 1);
  }
  if (
    snapshot.sourceTotal !== snapshot.records.length
    && !issueCounts.has("SOURCE_UNAVAILABLE")
    && !issueCounts.has("MISSING_REQUIRED_HEADER")
  ) {
    addIssue(
      issueCounts,
      "SOURCE_ROW_COUNT_MISMATCH",
      Math.abs(snapshot.sourceTotal - snapshot.records.length),
    );
  }

  const normalizedSource = new Map<number, AlumniManagedRecord>();
  const invalidRows = new Set<number>();
  const sourceMobiles = new Map<string, number[]>();
  let missingRequiredValues = 0;
  let invalidMobiles = 0;

  for (const record of snapshot.records) {
    const hasRequiredValues = Boolean(
      required(record.department)
      && required(record.generation)
      && required(record.name)
      && required(record.mobile),
    );
    if (!hasRequiredValues) {
      missingRequiredValues++;
      invalidRows.add(record.rowNumber);
      continue;
    }

    const normalizedMobile = normalizeAlumniMobile(record.mobile);
    if (!normalizedMobile) {
      invalidMobiles++;
      invalidRows.add(record.rowNumber);
      continue;
    }

    const managed = normalizeManagedRecord(record);
    if (!managed) continue;
    normalizedSource.set(record.rowNumber, managed);
    const rows = sourceMobiles.get(normalizedMobile) ?? [];
    rows.push(record.rowNumber);
    sourceMobiles.set(normalizedMobile, rows);
  }
  if (missingRequiredValues > 0) {
    ensureIssueCount(issueCounts, "MISSING_REQUIRED_VALUE", missingRequiredValues);
  }
  if (invalidMobiles > 0) {
    ensureIssueCount(issueCounts, "INVALID_MOBILE", invalidMobiles);
  }

  const conflictRows = new Set<number>();
  for (const rows of Array.from(sourceMobiles.values())) {
    if (rows.length < 2) continue;
    for (const rowNumber of rows) conflictRows.add(rowNumber);
  }
  if (conflictRows.size > 0) {
    ensureIssueCount(issueCounts, "DUPLICATE_MOBILE", conflictRows.size);
  }

  const databaseByMobile = new Map<string, AlumniDatabaseRecord[]>();
  for (const record of database) {
    const mobile = normalizeAlumniMobile(record.mobile);
    if (!mobile) continue;
    const records = databaseByMobile.get(mobile) ?? [];
    records.push(record);
    databaseByMobile.set(mobile, records);
  }
  let databaseConflictCount = 0;
  for (const records of Array.from(databaseByMobile.values())) {
    if (records.length > 1) {
      databaseConflictCount += records.length;
    }
  }
  if (databaseConflictCount > 0) {
    ensureIssueCount(issueCounts, "DATABASE_DUPLICATE_MOBILE", databaseConflictCount);
  }

  const issues = toIssues(issueCounts);
  const blocked = issues.length > 0;
  const report: AlumniSyncReport = {
    sourceTotal: snapshot.sourceTotal,
    databaseTotal: database.length,
    insert: 0,
    update: 0,
    unchanged: 0,
    conflict: conflictRows.size + databaseConflictCount,
    invalid: invalidRows.size,
    sourceOnly: 0,
    databaseOnly: 0,
    blocked,
    sourceFingerprint: null,
    issues,
  };

  if (blocked) return { report, changes: [] };
  report.sourceFingerprint = createSourceFingerprint(normalizedSource.values());

  const changes: AlumniSyncChange[] = [];
  const matchedDatabaseIds = new Set<number>();
  for (const record of snapshot.records) {
    const source = normalizedSource.get(record.rowNumber)!;
    const databaseMatches = databaseByMobile.get(source.mobile) ?? [];
    const existing = databaseMatches[0];
    if (!existing) {
      report.insert++;
      report.sourceOnly++;
      changes.push({ kind: "insert", source });
      continue;
    }

    matchedDatabaseIds.add(existing.id);
    const normalizedDatabase = normalizeManagedRecord(existing);
    if (normalizedDatabase && sameManagedRecord(source, normalizedDatabase)) {
      report.unchanged++;
    } else {
      report.update++;
      changes.push({ kind: "update", databaseId: existing.id, source });
    }
  }

  report.databaseOnly = database.filter((record) => !matchedDatabaseIds.has(record.id)).length;
  return { report, changes };
}
