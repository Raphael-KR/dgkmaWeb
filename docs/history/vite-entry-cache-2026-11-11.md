# 개발 진입 파일의 캐시 무효화 제거 — 2026-11-11

이 문서는 이번 개발 작업의 승인 범위와 실행 결과를 기록한다. 현재 개발 절차는 [replit.md](../../replit.md#개발-html과-변경-감지)를 따른다.

## 확정 범위

- 목표: 개발 HTML이 매번 진입 파일 주소를 바꾸는 처리를 제거해 같은 파일의 캐시 재사용을 허용한다.
- 변경: `server/vite.ts`의 난수 쿼리와 사용하지 않게 되는 직접 `nanoid` 의존성만 제거한다. PostCSS의 간접 `nanoid` 의존성은 유지한다.
- 완료 조건: Replit 개발 환경에 반영하고 진입 주소 안정성, 기존 Vite 변경 감지 설정 보존과 `/about` 로딩 전후 수치를 확인한다.
- 제외: 기존 미커밋 UI 변경 재작업, 운영 배포·DB 변경·실계정 QA·Git 게시와 릴리스.
- 확인: 변경 파일의 lint·서식·앱 타입 및 경계, 문서 연결·diff 검사와 공개 개발 화면 로딩 비교. 서버 시작 시 읽는 코드이므로 적용에 필요한 개발 서버 재시작을 포함한다.

## 코드와 개발 적용

`server/vite.ts`에서 진입 URL 치환과 `nanoid` import를 제거하고 템플릿 변수를 `const`로 바꿨다. 요청마다 HTML을 읽는 처리, `vite.transformIndexHtml`, SEO 처리, HMR 서버 연결과 React 플러그인 설정은 유지했다. 운영 정적 파일 경로는 변경하지 않았다.

Replit에서 `npm uninstall nanoid --package-lock-only --ignore-scripts --offline --no-audit --no-fund`를 실행하고 결과를 로컬에도 반영했다. package/lockfile에서 직접 `nanoid` 5.1.16 항목만 제거됐으며 PostCSS의 간접 `nanoid` 3.3.19와 다른 패키지는 바뀌지 않았다. 설치 스크립트나 네트워크 의존성 설치는 실행하지 않았다.

2026-11-11 21:52:06 KST 개발 서버를 재시작했다. 기존 앱 PID 437을 종료한 뒤 개발 워크스페이스에서 `npm run dev`를 시작했다(npm PID 1033). `/about` 응답에서 고정된 `/src/main.tsx`, Vite 클라이언트·React Refresh 주입과 공개 canonical을 확인했다. 이후 CLI 브라우저에서 Vite WebSocket의 `connected` 프레임 4건을 확인했다. 실제 소스 편집에 따른 화면 갱신 시험은 추가하지 않았다.

## 정적 검사

Replit `/home/runner/workspace`, Node 20.20.0·npm 10.8.2에서 수행했다.

| 검사 | 결과 |
|---|---|
| `./node_modules/.bin/eslint server/vite.ts` | 통과 |
| `./node_modules/.bin/prettier --check server/vite.ts` | 통과 |
| `npm run check` | 앱 타입·브라우저/서버·sandbox 경계 통과, 앱 파일 243개 |
| `git diff --check` | 통과 |

타입 검사 실행에는 기존 `C.UTF-8` locale 경고가 있었으며 검사 종료 코드는 0이었다. 변경 파일에 집중했으며 빌드·단위/전체 회귀·DB 시험은 실행하지 않았다. 승인된 공개 `/about` 시간 비교는 위 정적 검사와 별개다.

## 로딩 비교

같은 Mac의 Ego CLI 브라우저 탭과 Replit 개발 URL에서 측정했다. 양쪽 모두 공개 화면을 한 번 연 뒤 캐시가 채워진 상태에서 새로고침 3회를 측정했다. 개발 회원 API 요청은 각 측정에서 차단했으며 로그인·회원 기능을 조작하지 않았다. 브라우저 캐시를 삭제하지 않았고 비교 탭은 종료했다. 변경 전은 21:44:23~28, 변경 후는 21:53:13~18 KST다.

| 항목 | 변경 전 | 변경 후 |
|---|---:|---:|
| 첫 내용 표시(FCP), 3회 | 2.564 / 2.564 / 2.608초 | 2.444 / 2.572 / 2.440초 |
| FCP 중앙값 | 2.564초 | 2.444초 |
| load 이벤트 중앙값 | 2.644초 | 2.527초 |
| 자산 전송량, 3회 동일 | 102,349바이트 | 18,000바이트 |
| JavaScript 자산 항목 수 | 91 | 91 |
| HTML 진입 주소 | 요청마다 다른 난수 쿼리 | `/src/main.tsx`로 고정 |

전송량은 브라우저 Resource Timing의 `transferSize` 합계이며 HTML 문서를 제외하고 헤더를 포함한다. 진입 파일과 직접 import하는 앱·CSS의 불필요한 재전송이 사라져 약 82.4% 줄었다. FCP 중앙값은 0.120초 줄었지만 표본이 각 3회이고 네트워크 변동을 포함하므로 큰 속도 향상으로 해석하지 않는다. 개발용 모듈 요청 수와 HTTP/1.1 요청 대기는 남아 있다.

직전 진단의 첫 내용 표시 4.51초·새로고침 2.54초는 별도 관찰 이력이다. 이번 비교는 캐시가 비어 있는 최초 방문, 휴면 복귀, 내부 메뉴 전환, 운영 속도를 검증하지 않는다.

## 근거와 종료 상태

상세 자료는 로컬·Replit의 `.superpowers/vite-entry-cache-20261111/`에 보존한다. `baseline-local.json`·`baseline-remote.json`은 기존 변경과 적용 전 파일 해시, `checks.json`은 실제 검사 명령·출력, 로컬 `before-browser.json`·`after-browser.json`·`comparison.json`은 전후 측정값이다. `dependency-diff.json`에는 직접 의존성 외 패키지 변경이 없음을 기록했다.

기존 미커밋 UI·문서 변경을 보존했다. 이번 변경은 개발 환경에만 적용했으며 커밋·push·PR·운영 릴리스·실계정 QA는 수행하지 않았다.
