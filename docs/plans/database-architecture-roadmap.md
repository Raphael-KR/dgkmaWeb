# 회계·회비 DB 아키텍처 실행 로드맵

> 기준일: 2026-08-11  
> 진행상태 권위: 이 문서  
> 불변 승인 명세: [database-architecture-audit.md](database-architecture-audit.md)  
> 제품 계약: [accounting-dues-prd.md](accounting-dues-prd.md)

## 목표 재앵커링

Phase 1의 목표는 회원·조직 원본을 임의 추정 없이 반복 이관할 수 있고, 은행 거래·회비 receipt·회원별 allocation·환불·정정·기간 마감·권리 판정을 하나의 감사 가능한 PostgreSQL 원장으로 운영하는 것이다. 정식 오픈 직전 C1에서 사용자가 최종 전환을 선언하기 전까지 Google Sheets `통합주소록`은 회원 identity/contact 편집 SSOT, Notion 조직·직책 DB는 조직·직책 이력 편집 SSOT다. Development와 Production DB는 그 전까지 반복 초기화·검증 가능한 runtime/test projection이다.

## 현재 체크포인트

| 항목 | 확인된 상태 |
|---|---|
| 구현 브랜치 | `codex/database-architecture-todo16` |
| 현재 단계 | Todo 18 진행 중 |
| 완료 범위 | Todo 1–17, Todo 23 방향 전환, N1 |
| manifest | grandchild SHA-256 `bf7216af6f30a366c0adad4b355fc6c4bed0aaf625154a70d063db2864d86b3b` |
| Development schema | ledger `[1,10,15,20,30,40,50,60,70,80]`; sequence 80 `applied → verified_noop`; startup/catalog 승인 |
| Todo 18 apply 구현 | synthetic group `1/28/28`, role `1/7/7`, individual dues `1/20/20` operation receipt/entity/audit; replay identity sequence 불변 및 exact KRW 50,000 합계 증명 |
| Todo 18 통합 검증 | exact commit `c3678d8`; happy 6개와 failure 2개를 독립 disposable DB에서 통과, 모든 DB·actor receipt·임시 worktree/evidence 부재 확인 |
| 관리자 CLI | exact commit `d6f1788`; fixed Development admin receipt와 live ledger/admin을 재검증하고 authenticated POST와 동일 service·transaction 실행; Replit `tsc`와 138개 테스트 통과 |
| 실제 source data | active release 27, batch/set/item `9/9/6994`; 7개 batch/set `applied/approved`, AGM36·외래교수회 2개 `previewed`; open period 4, 회원·match·직책·분류·event·receipt·allocation downstream 전부 0; apply receipt/entity/audit `7/18/18` |
| Production/deploy | 작업 0건; 미승인·미검증 |

## 남은 실행 순서

| 순서 | Todo/Phase | 다음 완료 조건 |
|---:|---|---|
| 1 | 18 | AGM36의 잘못 동결된 v2 boundary evidence를 immutable v3 mapping/release와 fresh preview로 교정·승인·apply하고, 외래교수회는 exact primary bank receipt 결정 전 preview 상태 유지 |
| 2 | 19 | legacy `payments` cross-link/backfill, double-count 0, DB-resident cutover proof |
| 3 | 20 ∥ 21 | 시간·금액·마감·동시성 불변식과 security/retention/workload 검증 |
| 4 | 22 | Development 최종 검증, measured restore drill, Production read-only dossier |
| 5 | F1–F4 | 동일 frozen SHA를 독립 검증한 provider-bound receipts |
| 6 | A1 | 최종 architecture attestation |
| 7 | C1 | 정식 오픈 직전 최종 source freeze·Production backup/restore·reconciliation 후 사용자 선언 시각부터 PostgreSQL을 회원·조직 SSOT로 전환 |

## 현재 운영 승인 경계

- 관리자 CLI로 결함 없는 7개 source를 Development에 원자 apply했다. exact replay는 동일 receipt bytes와 identity-sequence digest를 재현했고, `CALENDAR_2022`–`CALENDAR_2025` 4개만 생성됐다. 나머지 회원·직책·financial downstream은 0이다.
- AGM36 v2는 동결 payload의 boundary coordinate/content digest가 활성 Notion v4 source row와 일치하지 않아 reservation/DML 전 `source_decision_period_boundary_mismatch`로 실패했다. operation receipt 0과 상태 불변을 확인했으므로 기존 v2 row 수정, DB 직접 변경, service 검증 완화는 금지한다.
- 다음 단일 승인안은 기존 AGM36 v2 release·preview를 immutable 이력으로 보존하면서, 실제 유일한 Notion v4 22대 회장 경계 coordinate `notion:page:3b72225d-9c4d-81b6-9fbb-f30287bfe90e`와 content digest `2e0b0afea037bca10fd6ff405e629794367edd590031a409a8073d99eb2bfbc2`에 묶인 v3 mapping/release를 등록하고 fresh preview의 `PRE_AGM36_2026`, `AGM36_TO_AGM37` 2개 period만 승인·apply하는 것이다. 기존 v2 set은 reject하고 v3 fresh set을 별도 approve한다.
- 외래교수회 26개 행 × 50,000원은 계속 후보일 뿐이며, exact primary bank receipt equality와 companion 결합 승인이 있기 전에는 direct apply하지 않는다.
- 그 전까지 Codex는 승인된 v3 교정 준비, synthetic/disposable 검증, Development additive work, 테스트·문서·Git/GitHub 작업을 계속한다.
- Production DB 쓰기, Republish, 실제 결제 연동, C1 SSOT 전환은 각각 별도 운영 경계다.

## 문서 동기화 규칙

- SHA-bound 승인 명세의 체크박스는 역사적 실행 계약이며 진행상태 표시에 사용하지 않는다.
- DB 객체나 migration 변경은 같은 PR의 `docs/database-schema.md`, metadata-only catalog, 필요 시 `docs/database-operations.md`와 함께 닫는다.
- 이 roadmap은 완료 증거와 다음 startable Todo가 바뀔 때 현행화한다.
