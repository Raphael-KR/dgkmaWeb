import { google } from 'googleapis';

export interface AlumniRecord {
  department: string; // 학과
  generation: string; // 기수
  name: string; // 성명
  admissionDate?: string; // 입학일자
  graduationDate?: string; // 졸업일자
  address?: string; // 주소
  mobile?: string; // 핸드폰번호
  phone?: string; // 전화번호
  group?: string; // 그룹
  status?: string; // 상태
  alumniPosition?: string; // 동문회직책
  memo?: string; // 메모
}

export class GoogleSheetsService {
  private sheets: any;
  private spreadsheetId: string | undefined;
  private cachedAlumniData: AlumniRecord[] | null = null;
  private headersLogged = false;

  constructor() {
    this.spreadsheetId = process.env.ALUMNI_SPREADSHEET_ID;
    
    if (!this.spreadsheetId) {
      console.log('Google Sheets not configured - ALUMNI_SPREADSHEET_ID not found');
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

      this.sheets = google.sheets({ version: 'v4', auth });
      console.log('Google Sheets service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Google Sheets service:', error);
    }
  }

  // 스프레드시트에서 동문 데이터 가져오기
  async fetchAlumniData(): Promise<AlumniRecord[]> {
    if (!this.sheets || !this.spreadsheetId) {
      console.log('Google Sheets not available, returning empty array');
      return [];
    }

    // 캐시 강제 초기화
    this.cachedAlumniData = null;
    this.headersLogged = false;
    console.log('Cache cleared for fresh duplicate analysis');

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'A:L', // A부터 L까지 (12개 컬럼: 학과~메모)
      });

      const rows = response.data.values || [];
      const alumniData: AlumniRecord[] = [];

      // 헤더와 첫 몇 행 데이터 구조 확인 (한 번만 로그)
      if (!this.headersLogged && rows.length > 0) {
        console.log(`Google Sheets raw data analysis:`);
        console.log(`- Total rows from API: ${rows.length}`);
        console.log('- Spreadsheet headers:', rows[0]);
        for (let i = 1; i < Math.min(6, rows.length); i++) {
          console.log(`- Row ${i}:`, rows[i]);
        }
        this.headersLogged = true;
      }

      // 첫 번째 행은 헤더로 건너뛰기
      // 스프레드시트 구조: [학과, 기수, 성명, 입학일자, 졸업일자, 주소, 핸드폰번호, 전화번호, 그룹, 상태, 동문회직책, 메모]
      let skippedRows = 0;
      let validRows = 0;
      
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        
        // 헤더 행인지 확인
        if (row[0] === '학과' || row[2] === '성명') {
          skippedRows++;
          continue;
        }
        
        // 필수 데이터(학과, 기수, 성명)가 있는 경우만 처리
        if (row[0] && row[1] && row[2]) {
          alumniData.push({
            department: row[0]?.toString().trim() || '',
            generation: row[1]?.toString().trim() || '',
            name: row[2]?.toString().trim() || '',
            admissionDate: row[3]?.toString().trim() || undefined,
            graduationDate: row[4]?.toString().trim() || undefined,
            address: row[5]?.toString().trim() || undefined,
            mobile: row[6]?.toString().trim() || undefined,
            phone: row[7]?.toString().trim() || undefined,
            group: row[8]?.toString().trim() || undefined,
            status: row[9]?.toString().trim() || undefined,
            alumniPosition: row[10]?.toString().trim() || undefined,
            memo: row[11]?.toString().trim() || undefined,
          });
          validRows++;
        } else {
          // 누락된 데이터 로그
          if (i <= 10 || (row[0] || row[1] || row[2])) { // 첫 10개 또는 부분 데이터가 있는 경우만 로그
            console.log(`Skipped row ${i} (missing required data):`, {
              department: row[0],
              generation: row[1], 
              name: row[2]
            });
          }
          skippedRows++;
        }
      }
      
      // 중복 이름 분석
      const nameGroups = new Map<string, number>();
      alumniData.forEach(alumni => {
        const key = `${alumni.name}_${alumni.generation}`;
        nameGroups.set(key, (nameGroups.get(key) || 0) + 1);
      });
      
      const duplicates = Array.from(nameGroups.entries())
        .filter(([key, count]) => count > 1)
        .map(([key, count]) => {
          const [name, generation] = key.split('_');
          return { name, generation, count };
        });
      
      console.log(`Data processing summary:`);
      console.log(`- Total raw rows: ${rows.length}`);
      console.log(`- Valid alumni records: ${validRows}`);
      console.log(`- Skipped rows: ${skippedRows}`);
      console.log(`- Expected count: ${rows.length - 1} (excluding header)`);
      console.log(`- Actual processed: ${alumniData.length}`);
      console.log(`- Duplicate name/generation combinations: ${duplicates.length}`);
      
      if (duplicates.length > 0) {
        console.log('==== FOUND DUPLICATES IN GOOGLE SHEETS ====');
        duplicates.forEach(dup => {
          console.log(`DUPLICATE: ${dup.name} (${dup.generation}기) appears ${dup.count} times`);
        });
        console.log('==== END DUPLICATES ====');
      } else {
        console.log('NO DUPLICATES FOUND in Google Sheets data');
      }

      console.log(`Fetched ${alumniData.length} alumni records from Google Sheets`);
      
      // 첫 몇 개 동문 정보 출력
      if (alumniData.length > 0) {
        console.log('Sample alumni data:', alumniData.slice(0, 3).map(a => 
          `${a.name} (${a.generation}기, ${a.department})`
        ));
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