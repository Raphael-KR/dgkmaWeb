import { google } from "googleapis";
import type { AlumniSyncIssue } from "@shared/alumni-sync";
import type { AlumniSourceRecord, AlumniSourceSnapshot } from "./alumni-sync-plan";
import { getErrorType } from "./safe-logging";

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
  address: "주소",
  mobile: "핸드폰번호",
  phone: "전화번호",
  group: "그룹",
  status: "상태",
  alumniPosition: "동문회직책",
  memo: "메모",
} as const;

const REQUIRED_SOURCE_VALUE_COLUMNS = [
  "department",
  "generation",
  "name",
  "mobile",
] as const;

const MANAGED_SOURCE_COLUMNS = Object.keys(SOURCE_COLUMNS) as Array<
  keyof typeof SOURCE_COLUMNS
>;

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
  const missingRequiredHeaders = MANAGED_SOURCE_COLUMNS.filter(
    (field) => columnIndexes[field] < 0,
  );

  if (missingRequiredHeaders.length > 0) {
    return {
      records: [],
      sourceTotal: sourceRows.length,
      issues: [{
        code: "MISSING_REQUIRED_HEADER",
        count: missingRequiredHeaders.length,
      }],
    };
  }

  const records = sourceRows.map((row, index): AlumniSourceRecord => ({
    rowNumber: index + 2,
    department: cellValue(row, columnIndexes.department),
    generation: cellValue(row, columnIndexes.generation),
    name: cellValue(row, columnIndexes.name),
    admissionDate: cellValue(row, columnIndexes.admissionDate) || undefined,
    graduationDate: cellValue(row, columnIndexes.graduationDate) || undefined,
    address: cellValue(row, columnIndexes.address) || undefined,
    mobile: cellValue(row, columnIndexes.mobile),
    phone: cellValue(row, columnIndexes.phone) || undefined,
    group: cellValue(row, columnIndexes.group) || undefined,
    status: cellValue(row, columnIndexes.status) || undefined,
    alumniPosition: cellValue(row, columnIndexes.alumniPosition) || undefined,
    memo: cellValue(row, columnIndexes.memo) || undefined,
  }));
  const missingRequiredValues = records.filter((record) =>
    REQUIRED_SOURCE_VALUE_COLUMNS.some((field) => !record[field]?.trim())
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
  
  // 동기화 진행상황 추적
  private syncProgress = {
    isRunning: false,
    currentStep: '',
    processed: 0,
    total: 0,
    startTime: 0,
    errors: 0
  };

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
        project_id: "dynamic-waters-446615-e5",
        private_key_id: "5f36c0c4a2ad8b5673a97d72cead8833ed6e4f30",
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        client_id: "105977463169766845056",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '')}`
      };

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
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
        range: "A:L",
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

  // Task 5 전환 전까지 기존 호출부의 배열 계약을 유지하되 오류는 성공으로 숨기지 않는다.
  async fetchAlumniData(): Promise<AlumniRecord[]> {
    const snapshot = await this.fetchAlumniSnapshot();
    if (snapshot.issues.length > 0) throw new AlumniSourceReadError(snapshot.issues);
    return snapshot.records.map(({ rowNumber: _rowNumber, ...record }) => record);
  }

  /**
   * v5 추가 — 휴대전화번호 1순위 + 이름 1건일 때만 2순위 매칭.
   * 동명이인은 자동 매칭 차단 (pendingRegistration로 fallback).
   *
   * Google Sheets 명부의 휴대전화번호는 모두 "010-XXXX-XXXX" 형식이다.
   * 카카오 phone_number 원본값은 변형하지 않는다.
   * 명부 mobile만 카카오 REST API phone_number 비교용 형식으로 변환한다.
   *
   * 기본 변환:
   *   "010-1234-5678" → "+82 10-1234-5678"
   *
   * 주의:
   *   실제 TEST API 응답에서 카카오 phone_number가 다른 형식으로 확인되면
   *   카카오 원본값을 바꾸지 말고 명부 변환식만 수정한다.
   *
   * v5의 name은 카카오 REST API kakao_account.name에서 받은 성명(본명)이다.
   * 명부 매칭은 휴대전화번호 1순위, 성명 2순위로 수행한다.
   * 성명 매칭은 nameMatches.length === 1인 경우에만 자동 등록을 허용한다.
   */
  async findAlumniByPhoneAndName(phone: string | null, name: string): Promise<AlumniRecord[]> {
    const alumni = await this.fetchAlumniData();

    // 명부 mobile("010-XXXX-XXXX") → 카카오 phone_number 비교용 형식("+82 10-XXXX-XXXX")
    const toKakaoPhoneFormat = (mobile?: string | null): string | null => {
      if (!mobile) return null;
      const match = mobile.match(/^010-(\d{4})-(\d{4})$/);
      if (!match) return null;
      // 이 변환식은 현재 문서 기준의 v5 기본값이다.
      // TEST API 실제 응답값이 "+82 010-XXXX-XXXX" 등 다른 형식이면
      // 카카오 phone_number 원본은 바꾸지 말고 이 명부 변환식만 수정한다.
      return `+82 10-${match[1]}-${match[2]}`;
    };

    // 1순위: 휴대전화번호 정확 일치 (카카오 응답 원본값 == 명부 변환값)
    if (phone) {
      const phoneMatches = alumni.filter(a => toKakaoPhoneFormat(a.mobile) === phone);
      if (phoneMatches.length > 0) {
        console.log(`Found ${phoneMatches.length} phone match record(s)`);
        return phoneMatches;
      }
    }

    // 2순위: 이름 일치 (단, 1건일 때만 자동 등록 허용)
    const nameMatches = alumni.filter(a => a.name === name);
    if (nameMatches.length === 1) {
      console.log('Found one unique name match');
      return nameMatches;
    }
    if (nameMatches.length > 1) {
      console.log(`Found ${nameMatches.length} name matches; blocking auto-match`);
    }
    return [];
  }

  /**
   * @deprecated v5에서는 findAlumniByPhoneAndName 사용. 후속 ⑩(referenceAlumni 테이블) 착수 시 폐기 예정.
   */
  async findAlumniByName(name: string): Promise<AlumniRecord[]> {
    const allAlumni = await this.fetchAlumniData();

    // 정확한 이름 매칭 우선
    const exactMatches = allAlumni.filter(alumni => alumni.name === name);
    if (exactMatches.length > 0) {
      console.log(`Found ${exactMatches.length} exact name match record(s)`);
      return exactMatches;
    }

    // 부분 매칭
    const partialMatches = allAlumni.filter(alumni =>
      alumni.name.includes(name) || name.includes(alumni.name)
    );

    console.log(`Found ${partialMatches.length} partial name match record(s)`);
    return partialMatches;
  }

  // 정확한 이름과 기수로 매칭
  async findExactMatch(name: string, generation?: string): Promise<AlumniRecord | null> {
    const allAlumni = await this.fetchAlumniData();
    
    // 이름이 정확히 일치하는 경우 우선
    let exactMatch = allAlumni.find(alumni => alumni.name === name);
    
    // 기수 정보가 있으면 더 정확한 매칭
    if (generation && exactMatch) {
      const generationMatch = allAlumni.find(alumni => 
        alumni.name === name && alumni.generation === generation
      );
      if (generationMatch) {
        exactMatch = generationMatch;
      }
    }
    
    return exactMatch || null;
  }

  // 동기화 진행상황 조회
  getSyncProgress() {
    return { ...this.syncProgress };
  }

  // 동기화 진행상황 업데이트
  updateSyncProgress(step: string, processed?: number, total?: number, errors?: number) {
    this.syncProgress.currentStep = step;
    if (processed !== undefined) this.syncProgress.processed = processed;
    if (total !== undefined) this.syncProgress.total = total;
    if (errors !== undefined) this.syncProgress.errors = errors;
    
    console.log(`Sync Progress: ${step} (${this.syncProgress.processed}/${this.syncProgress.total})`);
  }

  // 동기화 시작
  startSync() {
    this.syncProgress = {
      isRunning: true,
      currentStep: '동기화 준비 중...',
      processed: 0,
      total: 0,
      startTime: Date.now(),
      errors: 0
    };
  }

  // 동기화 완료
  finishSync() {
    this.syncProgress.isRunning = false;
    this.syncProgress.currentStep = '동기화 완료';
    
    // 3초 후 상태 초기화 (다음 동기화를 위해)
    setTimeout(() => {
      this.syncProgress = {
        isRunning: false,
        currentStep: '',
        processed: 0,
        total: 0,
        startTime: 0,
        errors: 0
      };
    }, 3000);
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
