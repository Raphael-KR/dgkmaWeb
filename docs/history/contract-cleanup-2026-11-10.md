# 잔여 계약·설정과 측정 진단 정리

2026-11-10 사용자가 승인한 삭제·축소 후보 7건과 모바일 측정 진단 오류 1건의 작업 기록이다. 현재 기준은 [제품 계획](../product/planning-proposal.md), [구조 기준](../architecture/project-structure.md), [Replit 운영](../../replit.md), [실행 스크립트 안내](../../scripts/README.md)를 따른다.

## 범위와 완료 조건

| 항목 | 변경 범위 | 보존할 동작 |
|---|---|---|
| 별도 VERSION | 미사용 파일 제거 | package.json 표시 버전·CHANGELOG 이력 |
| 가입 승인 계약 | approvePendingRegistration(id)로 좁히고 승인 외 상태 저장 분기 제거 | 승인/거절 요청 검증, 거절 unlink·삭제, 승인 잠금·명부 연결·트랜잭션 |
| 업로드 metadata | 미사용 응답 echo·클라이언트 타입 제거 | 요청 name·size·contentType, 크기·MIME·HMAC·만료·권한 검사 |
| 회원 판정 missingFields | 차단 결과 타입·반환 필드 제거 | 진단 로그, 부고 파서의 동명 필드와 실제 누락 판정 |
| 비활성 다크 스타일 | 앱 .dark 토큰 블록 제거 | 기본 토큰·공식 UI 확장 API·sandbox 테마 |
| SEO 선택 옵션 | 미사용 image·keywords 인수와 분기 제거 | 사이트 기본값·canonical·noindex·실제 공개 메타데이터 |
| 링크 wrapper | post-content.ts를 제거하고 공유 링크 직접 import | shared/post-link의 입력·안전성 검사 |
| 모바일 진단 | 기준 자산 필터도 all scope를 포함하도록 수정 | 실제 측정 방식·지표 임계 판정·기존 baseline |

기준 문서 6개를 먼저 로컬·Replit 개발 사본에 반영한 뒤 구현했다. 기존 호출부·검사 대역·소스 계약의 메서드 참조도 승인 전용 계약에 맞췄다. 완료 조건은 로컬·Replit 개발 코드 일치, 필요한 타입·lint·문서 정적 검사와 기존 권한·보안 코드 보존 확인이다.

## 적용·검사 상태

위 8개 항목을 로컬·Replit 개발 사본에 적용했다. 기존 파일 22개 수정·2개 제거, 이력 1개 추가이며 나머지 기존 파일 474개는 시작 해시와 같다. 삭제한 파일은 VERSION과 client/src/lib/post-content.ts다. package.json의 표시 버전은 변경하지 않았다.

가입 승인은 신원 잠금 → 신청 행 잠금 → 전화번호 잠금 → 중복 확인 → 회원 생성·명부 연결 → 승인 저장 순서를 유지한다. HTTP의 승인/거절 검증과 거절의 unlink·삭제 본문은 그대로다. 업로드 라우트는 metadata 응답 두 줄 외에 바꾸지 않았고, 경조사 회원 판정은 반환 필드 외의 판단·로그 코드를 그대로 유지했다. 모바일 도구는 기준 자산 필터 한 줄만 수정했으며 임계값·측정 baseline은 변경하지 않았다.

2026-11-10 15:53 KST, Replit 개발 워크스페이스 `/home/runner/workspace`에서 다음 정적 검사를 수행했다.

- `npm run check`: 통과. 앱 타입과 소스 221개의 의존 경계·순환 참조 검사.
- `npm run check:tests`: 통과. 승인 계약에 맞춰 참조를 바꾼 기존 검사 파일 6개를 포함한 타입 확인이며 검사 실행은 아니다.
- 변경 JS/TS 16개 ESLint: 통과.
- PostCSS로 변경 CSS 파일 구문 분석: 통과. 화면 렌더링은 하지 않았다.
- `git diff --check`: 통과. npm 명령에는 기존 `C.UTF-8` locale 경고가 있었으며 모든 검사 exit code는 0이다.

로컬·Replit 문서 79개·내부 링크 721개·앵커 259개를 파일 읽기로 확인했고 오류는 없었다. 개발 사본의 관리 파일 497개가 로컬과 일치하며 승인된 파일 2개의 제거도 확인했다. DB 스키마·마이그레이션·공유 계약·링크 검사·Python 원본·sandbox·package/lock·Umami는 시작 해시와 같다. 로컬 main `d7184ca5238e0cdc3e91515ac0616e3b33332f41`, Replit main `587202723e943cb2cc9c3d3e1daf022770f33342`의 기존 Git 이력은 유지했다.

DB 연결·변경, 실행형 단위/통합 검사, 모바일 측정·baseline 갱신, 외부 수집·LLM·HTTP, 빌드·서버 재시작·배포·실계정 QA와 커밋·push·PR·병합은 수행하지 않았다. 실제 승인·업로드·화면·측정 동작은 이번 정적 검사로 검증한 범위가 아니다.
