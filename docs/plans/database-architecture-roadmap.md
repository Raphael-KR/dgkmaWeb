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
| 현재 단계 | Todo 18 완료 → Todo 19 진행 중 |
| 완료 범위 | Todo 1–17, Todo 23 방향 전환, N1 |
| manifest | sequence-90 great-grandchild SHA-256 `19ac53ce74af375ab5eb6a9c96a3ca4d5fd7cc5127e9ad7bbd1da4cad33ea700` prepared |
| Development schema | ledger `[1,10,15,20,30,40,50,60,70,80]`; sequence 80 `applied → verified_noop`; startup/catalog 승인 |
| Todo 19 schema prerequisite | sequence 90 legacy cutover-code root correction implemented locally; disposable proof pending, Development apply not yet authorized |
| Todo 18 apply 구현 | synthetic group `1/28/28`, role `1/7/7`, individual dues `1/20/20` operation receipt/entity/audit; replay identity sequence 불변 및 exact KRW 50,000 합계 증명 |
| Todo 18 통합 검증 | exact commit `c3678d8`; happy 6개와 failure 2개를 독립 disposable DB에서 통과, 모든 DB·actor receipt·임시 worktree/evidence 부재 확인 |
| 관리자 CLI | exact commit `d6f1788`; fixed Development admin receipt와 live ledger/admin을 재검증하고 authenticated POST와 동일 service·transaction 실행; Replit `tsc`와 138개 테스트 통과 |
| 실제 source data | active release 28, batch/set/item `10/10/6996`; batch `9 applied/1 previewed`, set `9 approved/1 rejected/0 previewed`; open period 6, 회원·match·직책·분류·event·receipt·allocation downstream 전부 0; source-decision receipt/entity/audit `10/25/25` |
| Production/deploy | 작업 0건; 미승인·미검증 |

## 남은 실행 순서

| 순서 | Todo/Phase | 다음 완료 조건 |
|---:|---|---|
| 1 | 19 | legacy `payments` cross-link/backfill, double-count 0, DB-resident cutover proof |
| 2 | 20 ∥ 21 | 시간·금액·마감·동시성 불변식과 security/retention/workload 검증 |
| 3 | 22 | Development 최종 검증, measured restore drill, Production read-only dossier |
| 4 | F1–F4 | 동일 frozen SHA를 독립 검증한 provider-bound receipts |
| 5 | A1 | 최종 architecture attestation |
| 6 | C1 | 정식 오픈 직전 최종 source freeze·Production backup/restore·reconciliation 후 사용자 선언 시각부터 PostgreSQL을 회원·조직 SSOT로 전환 |

## 현재 운영 승인 경계

- 관리자 CLI로 먼저 7개 source를 Development에 원자 apply했고, 이어 owner 승인 AGM36 v3를 실제 Notion v4 경계 row에 결합했다. 기존 v2 set은 `rejected`, v3 set/batch는 `approved/applied`이며 `PRE_AGM36_2026`, `AGM36_TO_AGM37` 두 period가 생성됐다. 모든 exact replay는 receipt bytes와 identity-sequence digest를 보존했다.
- 전체 open period는 `CALENDAR_2022`–`CALENDAR_2025`, `PRE_AGM36_2026`, `AGM36_TO_AGM37` 6개다. 회원·직책·financial downstream은 0이고 Production·배포 작업도 0이다.
- Owner 승인에 따라 외래교수회 set `811462f6-de04-428b-99ba-a587eac4b0d7`의 name-only match 26개와 unbound allocation 26개를 기존 `quarantine` outcome 그대로 Development에 approve/apply했다. batch만 `applied`로 전환됐고 회원 match·receipt·group·allocation downstream은 모두 0이다.
- 동일 operation replay의 service receipt SHA-256 `2f8c6f1362f1a8b8cd038126bf9ffef878ae1198e15b651751b5c007446de6a8`, receipt file SHA-256 `d4b25889651bb1c71c1c4bae3517663985b987ff0778816cdffa57cdedd63477`, identity-sequence SHA-256 `c0b7dd1d1343026d74c4c897f57ce5a8df086c5482541e9a8f2bd8a9bba25778`이 전후 동일했다. 임시 receipt·worktree는 삭제 후 부재를 확인했다.
- 외래교수회 26행 × 50,000원은 여전히 후보 evidence일 뿐이다. 향후 실제 bank evidence가 추가되면 기존 terminal evidence를 변경하지 않고 새 source revision/release/preview와 별도 source-decision으로 처리한다.
- Todo 18 source coverage는 종료됐다. Todo 19의 legacy `payments` preflight와 v3 adapter는 완료됐고, cutover VCHAIN을 막는 all-version cutover-code UNIQUE를 보정하는 additive sequence 90의 disposable proof가 다음 실행 경로다. 그 proof까지는 추가 운영 승인이 필요하지 않다.
- Production DB 쓰기, Republish, 실제 결제 연동, C1 SSOT 전환은 각각 별도 운영 경계다.

## 문서 동기화 규칙

- SHA-bound 승인 명세의 체크박스는 역사적 실행 계약이며 진행상태 표시에 사용하지 않는다.
- DB 객체나 migration 변경은 같은 PR의 `docs/database-schema.md`, metadata-only catalog, 필요 시 `docs/database-operations.md`와 함께 닫는다.
- 이 roadmap은 완료 증거와 다음 startable Todo가 바뀔 때 현행화한다.
