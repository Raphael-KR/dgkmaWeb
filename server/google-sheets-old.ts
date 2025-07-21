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
  private headersLogged: boolean = false;
  private cachedAlumniData: AlumniRecord[] | null = null;

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
    // 캐시된 데이터가 있으면 반환
    if (this.cachedAlumniData) {
      return this.cachedAlumniData;
    }
    
    try {
      if (!this.spreadsheetId) {
        console.warn('ALUMNI_SPREADSHEET_ID not configured');
        return [];
      }

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'A:F', // A열부터 F열까지 더 넓은 범위로 데이터 확인
      });

      const rows = response.data.values || [];
      const alumniData: AlumniRecord[] = [];

      // 첫 번째 행 확인 (헤더 정보 로깅) - 1회만 실행
      if (rows.length > 0 && !this.headersLogged) {
        console.log('Spreadsheet headers:', rows[0]);
        
        // 첫 5개 행 데이터 구조 확인
        for (let i = 1; i < Math.min(6, rows.length); i++) {
          console.log(`Row ${i}:`, rows[i]);
        }
        this.headersLogged = true;
      }

      // 첫 번째 행은 헤더로 건너뛰기
      // 스프레드시트 구조: [학과, 기수, 성명, 입학일자, 졸업일자, 주소]
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        
        // 헤더 행인지 확인 (학과 컬럼에 '학과'라는 텍스트가 있으면 헤더)
        if (row[0] === '학과' || row[2] === '성명') {
          continue; // 헤더 행 건너뛰기
        }
        
        if (row[2] && row[1]) { // 성명(3번째 컬럼)과 기수(2번째 컬럼)가 있는 경우만
          const cleanName = row[2]?.toString().trim() || ''; // 성명은 3번째 컬럼
          const gradeString = row[1]?.toString().trim() || '0'; // 기수는 2번째 컬럼
          const graduationDateString = row[4]?.toString().trim() || ''; // 졸업일자는 5번째 컬럼
          
          // 졸업년도 추출 (졸업일자에서 년도만 추출)
          let graduationYear = 0;
          if (graduationDateString) {
            const yearMatch = graduationDateString.match(/(\d{4})/);
            if (yearMatch) {
              graduationYear = parseInt(yearMatch[1]);
            }
          }
          
          // 기수 정보도 활용 (1기 = 1985년 졸업 기준으로 계산)
          if (!graduationYear && gradeString) {
            const grade = parseInt(gradeString);
            if (grade > 0) {
              graduationYear = 1984 + grade; // 1기가 1985년 졸업
            }
          }
          
          alumniData.push({
            name: cleanName,
            graduationYear: graduationYear || 0,
            phoneNumber: undefined, // 전화번호는 스프레드시트에 없음
            email: undefined, // 이메일도 스프레드시트에 없음
          });
        }
      }

      console.log(`Fetched ${alumniData.length} alumni records from Google Sheets`);
      
      // 첫 몇 개 동문 이름 출력으로 데이터 확인
      if (alumniData.length > 0) {
        console.log('Sample alumni names:', alumniData.slice(0, 5).map(a => `${a.name} (${a.graduationYear})`));
      }
      
      // 캐시에 저장
      this.cachedAlumniData = alumniData;
      return alumniData;
    } catch (error) {
      console.error('Error fetching alumni data from Google Sheets:', error);
      return [];
    }
  }

  // 특정 이름으로 동문 검색
  async findAlumniByName(name: string): Promise<AlumniRecord[]> {
    const allAlumni = await this.fetchAlumniData();
    
    // 정확한 이름 매칭 우선
    const exactMatches = allAlumni.filter(alumni => alumni.name === name);
    if (exactMatches.length > 0) {
      console.log(`Found exact match for ${name}: ${exactMatches.length} records`);
      return exactMatches;
    }
    
    // 부분 매칭
    const partialMatches = allAlumni.filter(alumni => 
      alumni.name.includes(name) || name.includes(alumni.name)
    );
    
    console.log(`Found ${partialMatches.length} partial matches for ${name}`);
    return partialMatches;
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