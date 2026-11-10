# 미사용 코드·문서 삭제·축소 — 2026-11-10

## 승인 범위

- 목표: 직전 사용처 검토에서 지적한 9개 삭제·축소 항목을 정리한다.
- 범위: 미사용 코드·의존성·계약·스타일·호환 처리와 문서 복제. 기준은 [제품 정책](../product/planning-proposal.md)·[구조 기준](../architecture/project-structure.md)·[Replit 운영](../../replit.md)이다.
- 완료 조건: 기준 문서 선반영, 로컬·Replit 개발 적용, 필요한 정적 검사와 기존 경계 보존 대조.
- 제외: DB 접속·변경·migration, 앱/브라우저·외부 API 실행, 서버 재시작·빌드·배포·실계정 QA, 커밋·push·PR·병합.
- 검사: Replit 앱/테스트 타입, 변경 파일 lint, 관련 파일 기반 계약·삭제 참조·보존 소스·파일 해시.

검토 시작 사본은 로컬 `main d7184ca5238e0cdc3e91515ac0616e3b33332f41`, Replit 개발 `main 587202723e943cb2cc9c3d3e1daf022770f33342`의 관리 파일 529개다. 기존 미커밋 작업을 보존한다.

| 항목 | 확정한 정리 |
|---|---|
| 1. UI·의존성 | 미사용 UI 30개·모바일 훅과 전용 직접 의존성 25개 제거. 실제 공통 UI·반응형 화면 유지 |
| 2. 첨부 진입점 | 소비자가 없는 Object Storage index만 제거. 라우트·업로드·다운로드 구현 유지 |
| 3. 저장 메서드 | getCategoryByName·updateCategory·deleteCategory·getPayment·createUser·claimAlumniRecord와 사용하지 않는 계약·DI·mock 제거. 실제 가입·승인의 원자적 생성/연결 경로·잠금 유지 |
| 4. 명부 선언 | 사용하지 않는 insertAlumniSchema·InsertAlumniRecord·AlumniNameAlias 제거. SQL 객체·DB 상태 유지 |
| 5. 업로드 훅 | 소비하지 않는 error·progress 상태/반환값과 onSuccess 옵션 제거. 업로드 결과·isUploading·onError 유지 |
| 6. Query 함수 | 사용하지 않는 returnNull 선택지·export 제거. 기존 HTTP 오류 처리·쿠키·query key 유지 |
| 7. 스타일 | 미사용 클래스·색상 변수·UI 전용 Tailwind 설정 제거. 사이트 브랜드·본문·레이아웃 유지 |
| 8. 인증 호환 | 사용처 없는 /api/auth/callback과 region 별칭 제거. 실제 Kakao callback·세션·본인 변경 정책 유지 |
| 9. 문서 | 참조 없는 옛 안내문 4개와 중복 회원등급 메모 제거. 고유한 과거 이유는 아래 보존하고 정본 연결·보존 기준 갱신 |

## 문서 통합과 보존 근거

이전 안내 파일 `planning_proposal.md`, `threat_model.md`, `walkthrough.md`, `docs/project-structure.md`는 현재 실제 링크 소비자가 없어 제거한다. 과거 원문에 남은 경로 문자열은 당시 위치 기록이며 새 실행·조회 기준이 아니다. 전역 지침이 직접 가리키는 `docs/database-operations.md`, 프로젝트 메모가 참조하는 `docs/database-schema.md`, 프로젝트 AGENTS가 연결하는 `roadmap.md`는 유지한다.

기존 `membership-tier.md`는 완료 납부 한 건을 완납으로 오판했던 경위와 부분납부·기타납부·미완료 제외 이유를 설명했다. 이 이유는 여기 보존하고, 등급·금액·표시 판단의 현행 기준은 [회원 등급과 회비](../product/planning-proposal.md#회원-등급과-회비) 한 곳을 따른다.

현재 소비자가 있는 shared 호환 4개, 단일 storage receiver·원자적 가입/승인 트랜잭션, Drizzle 테이블·relations, OCR/Tiptap/PG 타입 의존성, Python 작성기 원본·bridge, 첨부 자산·sandbox·플랫폼 설정, DB 전환 SQL·migration·ADR·릴리스·심사 자료는 보존한다. 작업 임시 사본과 기존 미커밋 파일을 일괄 정리하지 않는다.

후속 사용자 결정(2026-11-10): `artifacts/mockup-sandbox`의 유지를 확정했다. 목업은 0개지만 Replit에서 실제 실행 중인 설계 미리보기 서비스라는 사용자 확인을 보존 근거로 반영했다. 현행 운영 기준은 [설계 미리보기 서비스](../../replit.md#설계-미리보기-서비스)를 따른다. 이 결정 반영은 문서 변경이며 서비스 재시작이나 실행 상태의 재검증은 수행하지 않았다.

## 적용·검사 결과

2026-11-10 KST, 기준 문서를 먼저 반영한 뒤 로컬·Replit 개발 사본에 적용했다. 시작 사본과 비교해 37개 파일을 삭제하고, 기존 29개 파일을 수정했으며 이 기록 1개를 추가했다. 기존 미커밋 작업은 유지했고 Git HEAD는 변경하지 않았다.

- Replit에서 `npm prune --ignore-scripts --offline --no-audit --no-fund`를 실행했다. 직접 의존성 25개와 이에 따른 설치/lockfile 항목 63개를 제거했으며, 남은 패키지 버전은 바뀌지 않았다. `npm ls --depth=0`도 통과했다.
- `npm run check`(타입·앱 파일 219개의 의존 경계), `npm run check:tests`, 변경 소스 18개의 ESLint를 통과했다.
- 문서·라우트·개인정보 로그·명부 별칭·가입 잠금의 파일 기반 계약 23건을 통과했다. 아래 별도 실행 1건은 정적 검사 건수에 넣지 않았다.
- 소스 대조로 보존 대상 저장 메서드 32개, 스키마 선언 48개, 로그아웃 라우트, 프로필 변경의 권한·검증·저장 순서, 업로드 URL 발급·PUT 구현이 동일함을 확인했다. 활동지역 입력은 승인된 `region` 별칭 제거만 적용했다.
- Markdown 75개의 내부 링크 685개와 앵커 252개에서 오류가 없었다. 로컬·Replit의 남은 관리 파일 493개는 해시가 일치하며 삭제 대상 37개는 양쪽 모두 없다. 승인 범위 밖 변경은 없고 기존 파일 463개는 시작 사본과 동일하다. 두 환경의 `git diff --check`도 통과했다.

검사 범위 이탈: 실행 제외용 이름 패턴이 의도대로 작동하지 않아 기존 전화번호 정규화 단위 검사 1건도 실행됐다. 이때 registry storage의 import로 DB pool과 Google Sheets 클라이언트 초기화 로그가 남았다. 이후 해당 시험과 연결 코드·Replit 설치 라이브러리의 생성자를 소스로 확인했다. 검사 본문은 문자열 정규화만 호출하며, 초기화 경로는 pool/클라이언트 구성이고 SQL 실행·Sheets 조회/쓰기 호출은 없다. 별도 DB 조회로 상태를 확인하거나 실행 검사를 추가하지 않았다. 따라서 이번 수행 전체를 “정적 검사만 실행”했다고 보고하지 않는다.

DB 스키마·데이터 변경, 서버 재시작·빌드·배포·실계정 QA, 커밋·push·PR·병합은 수행하지 않았다. 운영 상태와 마지막 DB 관찰 시각은 갱신하지 않았다.
