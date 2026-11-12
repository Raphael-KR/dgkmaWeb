import { google } from "googleapis";
import type { AlumniSyncIssue } from "@shared/alumni-sync";
import type {
  AlumniSourceRecord,
  AlumniSourceSnapshot,
} from "../modules/registry/alumni-sync-plan";
import { getErrorType } from "../lib/safe-logging";

export type AlumniRecord = Omit<AlumniSourceRecord, "rowNumber">;

type SheetsClient = {
  spreadsheets: {
    values: {
      get(input: { spreadsheetId: string; range: string }): Promise<{
        data: { values?: unknown[][] | null };
      }>;
    };
    get(input: { spreadsheetId: string }): Promise<unknown>;
  };
};

type GoogleSheetsServiceOptions = {
  spreadsheetId?: string;
  sheets?: SheetsClient;
};

const SOURCE_COLUMNS = {
  department: "학과",
  generation: "기수",
  name: "성명",
  admissionDate: "입학일자",
  graduationDate: "졸업일자",
  mobile: "핸드폰번호",
  group: "그룹",
  status: "상태",
  alumniPosition: "동문회직책",
  memo: "메모",
} as const;

const REQUIRED_SOURCE_VALUE_COLUMNS = ["department", "generation", "name", "mobile"] as const;

const MANAGED_SOURCE_COLUMNS = Object.keys(SOURCE_COLUMNS) as Array<keyof typeof SOURCE_COLUMNS>;

function cellValue(row: unknown[], index: number | undefined): string {
  if (index === undefined || index < 0) return "";
  const value = row[index];
  return value === null || value === undefined ? "" : String(value).trim();
}

export function buildAlumniSourceSnapshot(rows: unknown[][]): AlumniSourceSnapshot {
  if (rows.length === 0) {
    return {
      records: [],
      sourceTotal: 0,
      issues: [{ code: "EMPTY_SOURCE", count: 1 }],
    };
  }

  const header = rows[0].map((value) => String(value ?? "").trim());
  const sourceRows = rows.slice(1);
  const columnIndexes = Object.fromEntries(
    Object.entries(SOURCE_COLUMNS).map(([field, label]) => [field, header.indexOf(label)]),
  ) as Record<keyof typeof SOURCE_COLUMNS, number>;
  const missingRequiredHeaders = MANAGED_SOURCE_COLUMNS.filter((field) => columnIndexes[field] < 0);

  if (missingRequiredHeaders.length > 0) {
    return {
      records: [],
      sourceTotal: sourceRows.length,
      issues: [
        {
          code: "MISSING_REQUIRED_HEADER",
          count: missingRequiredHeaders.length,
        },
      ],
    };
  }

  const records = sourceRows.map((row, index): AlumniSourceRecord => ({
    rowNumber: index + 2,
    department: cellValue(row, columnIndexes.department),
    generation: cellValue(row, columnIndexes.generation),
    name: cellValue(row, columnIndexes.name),
    admissionDate: cellValue(row, columnIndexes.admissionDate) || undefined,
    graduationDate: cellValue(row, columnIndexes.graduationDate) || undefined,
    mobile: cellValue(row, columnIndexes.mobile),
    group: cellValue(row, columnIndexes.group) || undefined,
    status: cellValue(row, columnIndexes.status) || undefined,
    alumniPosition: cellValue(row, columnIndexes.alumniPosition) || undefined,
    memo: cellValue(row, columnIndexes.memo) || undefined,
  }));
  const missingRequiredValues = records.filter((record) =>
    REQUIRED_SOURCE_VALUE_COLUMNS.some((field) => !record[field]?.trim()),
  ).length;
  const issues: AlumniSyncIssue[] = [];
  if (sourceRows.length === 0) issues.push({ code: "EMPTY_SOURCE", count: 1 });
  if (missingRequiredValues > 0) {
    issues.push({ code: "MISSING_REQUIRED_VALUE", count: missingRequiredValues });
  }

  return { records, sourceTotal: sourceRows.length, issues };
}

export class AlumniSourceReadError extends Error {
  readonly issues: AlumniSyncIssue[];

  constructor(issues: AlumniSyncIssue[]) {
    super("Google Sheets 명부를 안전하게 읽지 못했습니다");
    this.name = "AlumniSourceReadError";
    this.issues = issues;
  }
}

export class GoogleSheetsService {
  private sheets: SheetsClient | undefined;
  private spreadsheetId: string | undefined;

  constructor(options: GoogleSheetsServiceOptions = {}) {
    this.spreadsheetId = options.spreadsheetId ?? process.env.ALUMNI_SPREADSHEET_ID;

    if (options.sheets) {
      this.sheets = options.sheets;
      return;
    }

    if (!this.spreadsheetId) {
      return;
    }

    // Google Sheets API 인증 설정
    try {
      const credentials = {
        type: "service_account",
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      };

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      });

      this.sheets = google.sheets({ version: "v4", auth }) as unknown as SheetsClient;
      console.log("Google Sheets 서비스를 초기화했습니다");
    } catch (error) {
      console.error("Google Sheets 서비스 초기화 실패:", getErrorType(error));
    }
  }

  async fetchAlumniSnapshot(): Promise<AlumniSourceSnapshot> {
    if (!this.sheets || !this.spreadsheetId) {
      return {
        records: [],
        sourceTotal: 0,
        issues: [{ code: "SOURCE_UNAVAILABLE", count: 1 }],
      };
    }

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "'통합주소록'!A:J",
      });
      return buildAlumniSourceSnapshot(response.data.values ?? []);
    } catch (error) {
      console.error("Google Sheets 명부 읽기 실패:", getErrorType(error));
      return {
        records: [],
        sourceTotal: 0,
        issues: [{ code: "SOURCE_UNAVAILABLE", count: 1 }],
      };
    }
  }

  // 관리자 연결 상태 조회 등에 필요한 배열 계약. 원본 오류는 성공 결과로 숨기지 않는다.
  async fetchAlumniData(): Promise<AlumniRecord[]> {
    const snapshot = await this.fetchAlumniSnapshot();
    if (snapshot.issues.length > 0) throw new AlumniSourceReadError(snapshot.issues);
    return snapshot.records.map(({ rowNumber: _rowNumber, ...record }) => record);
  }

  // 연결 테스트
  async testConnection(): Promise<boolean> {
    try {
      if (!this.spreadsheetId || !this.sheets) {
        console.log("Google Sheets가 설정되지 않았습니다");
        return false;
      }

      await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      console.log("Google Sheets 연결을 확인했습니다");
      return true;
    } catch (error) {
      console.error("Google Sheets 연결 확인 실패:", getErrorType(error));
      return false;
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();
