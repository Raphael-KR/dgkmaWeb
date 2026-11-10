# 문서 안내

프로젝트 소개는 루트 [README](../README.md), 개발 착수는 [개발 시작 안내](runbooks/development.md), 소스·개발·운영의 마지막 확인 상태는 [replit.md](../replit.md#현재-적용-상태)에서 확인한다. 아래는 문서별 책임을 찾는 색인이다. 결정 반영과 실행 순서는 [AGENTS.md](../AGENTS.md)를 따른다.

## 목적별 위치

| 목적 | 위치와 기준 문서 |
|---|---|
| 제품 목표·확정 정책·남은 기능 | `product/` — [제품·개발 계획](product/planning-proposal.md) |
| 구조·의존 경계·보안 설명 | `architecture/` — [프로젝트 구조](architecture/project-structure.md), [위협 모델](architecture/threat-model.md), [정적 자산 배포 정책](architecture/static-asset-release-policy.md) |
| 데이터·기능 계약과 도구 사전 | `reference/` — [DB 스키마](reference/database-schema.md), [DB 스크립트 분류](reference/database-scripts.md), [본문 편집기](reference/post-editor.md), [부고 작성](reference/obituary-writing-guide.md) |
| 작업 수행 절차 | `runbooks/` — [개발 시작](runbooks/development.md), [DB 운영](runbooks/database-operations.md), [별도 기능 점검](runbooks/feature-checks.md), [카카오 동의 심사](runbooks/kakao-consent-review-guide.md) |
| 결정 배경·대안·결과 | `decisions/` — [ADR 색인](decisions/README.md) |
| 수행 결과·당시 상태 | `history/` — [이력 색인](history/README.md) |
| 과거 설계·구현 계획 원문 | `superpowers/` — [보관 계획 색인](superpowers/README.md) |

루트 `replit.md`와 코드 폴더의 위치는 유지한다. 실행 도구는 [scripts 색인](../scripts/README.md), 초기 migration은 [migrations 안내](../migrations/README.md)에서 찾는다. [프로젝트 메모](../.agents/memory/MEMORY.md)는 구현 배경을 보충하며, [경사 스킬](../.agents/skills/dgkma-celebration-writer/SKILL.md)과 [부고 작성기 출처](../server/modules/events/writer/README.md)는 작성 규칙·원본의 근거를 관리한다.

## 정본·결정·이력 구분

- 담당 기준 문서는 현재 정책·계약·절차를 관리한다. 같은 내용을 다른 문서에서 재정의하지 않고 해당 절로 연결한다. 새 사용자 결정은 기준서부터 반영한다.
- ADR은 확정된 결정의 이유를 기록한다. 과거 결정을 기록한 날짜와 실제 결정·적용 시점을 구분하며, 구현 완료나 운영 반영을 ADR 상태로 대신하지 않는다.
- 이력과 과거 계획의 명령·체크박스·당시 “현재” 표현은 새 실행 지시나 다음 개발 과제가 아니다. 적용 결과에는 환경·버전·관찰 시각을 함께 남긴다.
- 전역 지침과 프로젝트 메모가 참조하는 `docs/database-schema.md`·`docs/database-operations.md`, 프로젝트 AGENTS가 연결하는 `roadmap.md`는 위치 안내로 유지한다. 새 참조는 정본 경로를 사용한다. 과거 원문의 경로 문자열은 당시 위치의 기록이다.

## 문서 정리 기준

- 소개·색인은 목적과 연결을, 기준서는 현재 계약을, 이력은 당시 수행 결과를 설명한다. 기준서에 개별 수정 내역을 계속 덧붙이지 않는다.
- 결정 확정, 코드 구현, Git 통합, 개발 반영, 운영 배포와 실제 실행 확인을 구분한다. 문서 검토일로 DB 관찰일이나 배포 시각을 갱신하지 않는다.
- 현재 안내의 “이번 작업·다음에·최신” 같은 표현은 구체적인 대상이나 날짜로 바꾼다. 보관 원문은 당시 표현을 유지한다.
- 문서 이동·축소 시 실제 참조와 보존 근거를 확인한다. 원문 스킬·작성기 출처·DB 전환·승인·릴리스 기록과 사용자 자산은 형식 통일만을 위해 고치거나 없애지 않는다.

문서 변경의 확인 범위는 내용·링크·정합성과 필요한 파일 기반 정적 검사다. 문서를 옮겼다는 이유로 DB·배포·실계정 QA를 실행하지 않는다.
