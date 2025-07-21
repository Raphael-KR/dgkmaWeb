import { google } from 'googleapis';

interface AlumniRecord {
  name: string;
  graduationYear: number;
  phoneNumber?: string;
  email?: string;
}

export class GoogleSheetsService {
  private sheets: any;
  private spreadsheetId: string;

  constructor() {
    this.spreadsheetId = process.env.ALUMNI_SPREADSHEET_ID || '';
    
    // 서비스 계정 인증 설정 (뷰어 권한만 필요)
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'], // 읽기 전용
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  // 스프레드시트에서 동문 데이터 가져오기
  async fetchAlumniData(): Promise<AlumniRecord[]> {
    try {
      if (!this.spreadsheetId) {
        console.warn('ALUMNI_SPREADSHEET_ID not configured');
        return [];
      }

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'A:D', // A열부터 D열까지 (이름, 졸업년도, 전화번호, 이메일)
      });

      const rows = response.data.values || [];
      const alumniData: AlumniRecord[] = [];

      // 첫 번째 행은 헤더로 건너뛰기
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[0] && row[1]) { // 이름과 졸업년도가 있는 경우만
          alumniData.push({
            name: row[0]?.toString().trim() || '',
            graduationYear: parseInt(row[1]?.toString() || '0'),
            phoneNumber: row[2]?.toString().trim() || undefined,
            email: row[3]?.toString().trim() || undefined,
          });
        }
      }

      console.log(`Fetched ${alumniData.length} alumni records from Google Sheets`);
      return alumniData;
    } catch (error) {
      console.error('Error fetching alumni data from Google Sheets:', error);
      return [];
    }
  }

  // 특정 이름으로 동문 검색
  async findAlumniByName(name: string): Promise<AlumniRecord[]> {
    const allAlumni = await this.fetchAlumniData();
    return allAlumni.filter(alumni => 
      alumni.name.includes(name) || name.includes(alumni.name)
    );
  }

  // 정확한 이름과 졸업년도로 매칭
  async findExactMatch(name: string, graduationYear?: number): Promise<AlumniRecord | null> {
    const allAlumni = await this.fetchAlumniData();
    
    // 이름이 정확히 일치하는 경우 우선
    let exactMatch = allAlumni.find(alumni => alumni.name === name);
    
    // 졸업년도도 일치하는지 확인
    if (exactMatch && graduationYear && exactMatch.graduationYear !== graduationYear) {
      // 이름은 같지만 졸업년도가 다른 경우, 졸업년도도 맞는 것을 찾기
      const yearMatch = allAlumni.find(alumni => 
        alumni.name === name && alumni.graduationYear === graduationYear
      );
      if (yearMatch) {
        exactMatch = yearMatch;
      }
    }
    
    return exactMatch || null;
  }

  // 연결 테스트
  async testConnection(): Promise<boolean> {
    try {
      if (!this.spreadsheetId) {
        console.log('Google Sheets not configured - using local alumni database');
        return false;
      }

      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      console.log(`Connected to Google Sheets: ${response.data.properties?.title}`);
      return true;
    } catch (error) {
      console.error('Google Sheets connection test failed:', error);
      return false;
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();