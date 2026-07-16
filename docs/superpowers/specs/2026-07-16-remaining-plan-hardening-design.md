# 잔여 개발 보강 설계

## 목표

통합 QA 전에 자동화와 개발 환경에서 해결할 수 있는 실제 결함을 제거한다. 사용자 계정이 필요한 확인은 계속 `walkthrough.md`에 누적하며, 운영 데이터나 명부 원본을 임의로 변경하지 않는다.

## 1. 개발 인증과 관리자 보안

- 공개 Development URL에서 계정 1번으로 로그인시키는 `/api/debug/login`과 `debug_login=true` 클라이언트 우회 경로를 제거한다.
- 개발 로그인도 승인된 카카오 OAuth만 사용한다. 자동화는 라우트 의존성 주입과 테스트 세션 주입을 사용한다.
- 모든 관리자 API의 비로그인 `401`, 일반회원 `403`을 실행 테스트로 확인한다.
- Google Sheets·DB 예외의 원문 메시지를 HTTP 응답에 포함하지 않고 고정된 한국어 오류만 반환한다. 서버 로그에는 오류 종류만 기록한다.
- 실제 결제 계약이 확정되기 전에는 결제 데이터 검증 규칙을 확장하지 않고, 관리자 전용 생성과 권한 없는 요청의 무변경만 보장한다.

## 2. 경조사 회귀 보강

- 기본 `readEventSources` 호출에서도 요청 deadline과 연결 종료 `AbortSignal`이 외부 DNS·본문 읽기까지 전달되도록 함수 경계를 맞춘다.
- 네 경조사 유형의 초안·게시·목록 필터 행렬, 성공적인 부고 링크 분석, 필수 누락 항목, 공개 응답의 원문·비공개 URL 제거를 자동화한다.
- Development Database 통합 테스트는 일회용 회원·초안을 사용하고 종료 시 모두 삭제한다.
- 실제 공개 사이트별 정확도, 모바일 레이아웃, 클립보드와 실제 회원 간 소유권은 통합 QA에 남긴다.

## 3. 명부 동기화 안전장치

- Google Sheets 읽기 결과를 쓰기 전에 전부 검사한다. 필수 헤더, 이름·기수·학과·정규화 휴대전화, 중복 휴대전화와 빈 소스를 검사하며 하나라도 차단 오류가 있으면 DB를 변경하지 않는다.
- 명부 원문 대신 집계만 포함하는 dry-run 보고서를 만든다. 보고 항목은 `sourceTotal`, `databaseTotal`, `insert`, `update`, `unchanged`, `conflict`, `invalid`, `sourceOnly`, `databaseOnly`이다.
- DB에만 존재하는 행은 보고만 하고 자동 삭제하지 않는다.
- 실제 적용은 dry-run에서 발급한 비식별 fingerprint가 같은 소스에만 허용한다. PostgreSQL advisory lock과 단일 transaction으로 insert·update를 적용해 동시 실행과 부분 반영을 막는다.
- 기존 `isMatched`와 `matchedUserId`는 보존한다. 업데이트 가능한 필드는 Sheets 관리 필드로 제한한다.
- 관리자 화면은 먼저 `변경 미리보기`를 실행하고, 차단 오류가 없고 변경이 있을 때만 `변경 적용`을 노출한다.
- 명부 데이터나 전화번호, 이름, 주소, 메모는 로그·응답·브라우저 상태에 포함하지 않는다.

## 4. 검증과 배포

- 모든 변경은 TDD로 집중 테스트를 먼저 실패시킨 뒤 구현한다.
- Replit에서 집중 테스트, 전체 `npm test`, `npm run check`, `npm run build`를 실행한다.
- 스키마 변경은 하지 않는다. Development Database에서만 동기화 dry-run과 일회용 fixture를 검증하고 실제 Sheets 명부 적용은 수행하지 않는다.
- GitHub `main` 반영 후 Replit 개발 서버를 확인한다. Production Database 변경과 Republish는 이번 범위에 포함하지 않는다.
