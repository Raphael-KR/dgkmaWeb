export type AlumniSyncIssueCode =
  | "SOURCE_UNAVAILABLE"
  | "EMPTY_SOURCE"
  | "MISSING_REQUIRED_HEADER"
  | "SOURCE_ROW_COUNT_MISMATCH"
  | "MISSING_REQUIRED_VALUE"
  | "INVALID_MOBILE"
  | "DUPLICATE_MOBILE"
  | "DATABASE_DUPLICATE_MOBILE";

export type AlumniSyncIssue = {
  code: AlumniSyncIssueCode;
  count: number;
};

export type AlumniSyncReport = {
  sourceTotal: number;
  databaseTotal: number;
  insert: number;
  update: number;
  unchanged: number;
  conflict: number;
  invalid: number;
  sourceOnly: number;
  databaseOnly: number;
  blocked: boolean;
  sourceFingerprint: string | null;
  issues: AlumniSyncIssue[];
};
