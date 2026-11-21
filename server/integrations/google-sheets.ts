import { google } from "googleapis";
import { getErrorType } from "../lib/safe-logging";

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

function cellValue(row: unknown[], index: number | undefined): string {
  if (index === undefined || index < 0) return "";
  const value = row[index];
  return value === null || value === undefined ? "" : String(value).trim();
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

  // One-time bootstrap. Read A and B:K in one request to keep IDs paired with their row.
  async fetchBasicRoster() {
    if (!this.sheets || !this.spreadsheetId) throw new Error("동문 명부 연결 설정이 필요합니다.");
    const { data } = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "'통합주소록'!A:K",
    });
    const [header = [], ...rows] = data.values ?? [];
    const columns = ["alumni_uid", ...Object.values(SOURCE_COLUMNS)];
    if (columns.some((label, index) => cellValue(header, index) !== label))
      throw new Error("명부 A:K 열 구성이 다릅니다.");
    const ids = new Set<string>();
    return rows.map((row) => {
      const id = cellValue(row, 0).toLowerCase();
      const name = cellValue(row, 3);
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ||
        ids.has(id) ||
        !name ||
        !cellValue(row, 2)
      )
        throw new Error("명부에 잘못된 UUID, 중복 UUID 또는 필수값 누락이 있습니다.");
      ids.add(id);
      return {
        id,
        name,
        department: cellValue(row, 1),
        generation: cellValue(row, 2),
        admissionDate: cellValue(row, 4),
        graduationDate: cellValue(row, 5),
        mobile: cellValue(row, 6),
        group: cellValue(row, 7),
        status: cellValue(row, 8),
        alumniPosition: cellValue(row, 9),
        memo: cellValue(row, 10),
      };
    });
  }

  async fetchIdentityRoster() {
    const rows = await this.fetchBasicRoster();
    return rows.map(({ id, name, department, generation, graduationDate, mobile }) => ({
      id,
      name,
      department,
      generation,
      graduation: graduationDate,
      mobile,
    }));
  }
}

export const googleSheetsService = new GoogleSheetsService();
