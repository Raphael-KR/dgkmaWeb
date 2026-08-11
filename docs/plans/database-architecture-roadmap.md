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
| 실제 source data | active release 28, batch/set/item `10/10/6996`; batch `8 applied/2 previewed`, set `8 approved/1 rejected/1 previewed`; open period 6, 회원·match·직책·분류·event·receipt·allocation downstream 전부 0; source-decision receipt/entity/audit `9/23/23` |
| Production/deploy | 작업 0건; 미승인·미검증 |

## 남은 실행 순서

| 순서 | Todo/Phase | 다음 완료 조건 |
|---:|---|---|
| 1 | 18 | 외래교수회 후보 KRW 1,300,000과 결합할 exact primary bank receipt를 read-only로 식별·대조하고, include/reject/quarantine 및 합계 일치의 단일 source-decision 승인을 받은 뒤 primary+companion 원자 apply |
| 2 | 19 | legacy `payments` cross-link/backfill, double-count 0, DB-resident cutover proof |
| 3 | 20 ∥ 21 | 시간·금액·마감·동시성 불변식과 security/retention/workload 검증 |
| 4 | 22 | Development 최종 검증, measured restore drill, Production read-only dossier |
| 5 | F1–F4 | 동일 frozen SHA를 독립 검증한 provider-bound receipts |
| 6 | A1 | 최종 architecture attestation |
| 7 | C1 | 정식 오픈 직전 최종 source freeze·Production backup/restore·reconciliation 후 사용자 선언 시각부터 PostgreSQL을 회원·조직 SSOT로 전환 |

## 현재 운영 승인 경계

- 관리자 CLI로 먼저 7개 source를 Development에 원자 apply했고, 이어 owner 승인 AGM36 v3를 실제 Notion v4 경계 row에 결합했다. 기존 v2 set은 `rejected`, v3 set/batch는 `approved/applied`이며 `PRE_AGM36_2026`, `AGM36_TO_AGM37` 두 period가 생성됐다. 모든 exact replay는 receipt bytes와 identity-sequence digest를 보존했다.
- 전체 open period는 `CALENDAR_2022`–`CALENDAR_2025`, `PRE_AGM36_2026`, `AGM36_TO_AGM37` 6개다. 회원·직책·financial downstream은 0이고 Production·배포 작업도 0이다.
- 외래교수회 26개 행 × 50,000원은 계속 후보일 뿐이며, exact primary bank receipt equality와 companion 결합 승인이 있기 전에는 direct apply하지 않는다.
- 다음 운영 승인 전까지 Codex는 exact primary receipt 후보의 PII-minimized read-only 대조, 합계·중복 검증, synthetic/disposable 검증과 문서·Git/GitHub 작업을 계속한다.
- Production DB 쓰기, Republish, 실제 결제 연동, C1 SSOT 전환은 각각 별도 운영 경계다.

## 문서 동기화 규칙

- SHA-bound 승인 명세의 체크박스는 역사적 실행 계약이며 진행상태 표시에 사용하지 않는다.
- DB 객체나 migration 변경은 같은 PR의 `docs/database-schema.md`, metadata-only catalog, 필요 시 `docs/database-operations.md`와 함께 닫는다.
- 이 roadmap은 완료 증거와 다음 startable Todo가 바뀔 때 현행화한다.
