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
  
  // 동기화 진행상황 추적
  private syncProgress = {
    isRunning: false,
    currentStep: '',
    processed: 0,
    total: 0,
    startTime: 0,
    errors: 0
  };

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
      
      // 휴대전화번호 중복 분석 (새로운 고유키 기준)
      const mobileGroups = new Map<string, number>();
      const nameGroups = new Map<string, number>();
      
      alumniData.forEach(alumni => {
        // 휴대전화번호 중복 체크
        if (alumni.mobile) {
          const mobile = alumni.mobile.trim();
          mobileGroups.set(mobile, (mobileGroups.get(mobile) || 0) + 1);
        }
        
        // 동명이인 분석 (참고용)
        const nameKey = `${alumni.name}_${alumni.generation}`;
        nameGroups.set(nameKey, (nameGroups.get(nameKey) || 0) + 1);
      });
      
      const mobileDuplicates = Array.from(mobileGroups.entries())
        .filter(([mobile, count]) => count > 1);
        
      const nameDuplicates = Array.from(nameGroups.entries())
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
      console.log(`- Mobile number duplicates: ${mobileDuplicates.length}`);
      console.log(`- Same name/generation combinations: ${nameDuplicates.length} (동명이인)`);
      
      if (mobileDuplicates.length > 0) {
        console.log('==== MOBILE NUMBER DUPLICATES (문제) ====');
        mobileDuplicates.forEach(([mobile, count]) => {
          console.log(`DUPLICATE MOBILE: ${mobile} appears ${count} times`);
        });
        console.log('==== END MOBILE DUPLICATES ====');
      }
      
      if (nameDuplicates.length > 0) {
        console.log('==== SAME NAME/GENERATION (동명이인, 정상) ====');
        nameDuplicates.slice(0, 5).forEach(dup => {
          console.log(`동명이인: ${dup.name} (${dup.generation}기) ${dup.count}명`);
        });
        if (nameDuplicates.length > 5) {
          console.log(`... 및 ${nameDuplicates.length - 5}개 더`);
        }
        console.log('==== END SAME NAME ====');
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
        console.log(`Found phone match for ${phone}: ${phoneMatches.length} record(s)`);
        return phoneMatches;
      }
    }

    // 2순위: 이름 일치 (단, 1건일 때만 자동 등록 허용)
    const nameMatches = alumni.filter(a => a.name === name);
    if (nameMatches.length === 1) {
      console.log(`Found unique name match for ${name}`);
      return nameMatches;
    }
    if (nameMatches.length > 1) {
      console.log(`Multiple name matches for ${name} (${nameMatches.length}) — blocking auto-match`);
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