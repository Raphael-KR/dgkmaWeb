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
| 현재 단계 | Todo 20 진행 중 ∥ Todo 21 보안·보존 기준선 진행 중 |
| 완료 범위 | Todo 1–19, Todo 23 방향 전환, N1 |
| manifest | sequence-130 descendant SHA-256 `ec18e2c2a60ee9fed75ac97bd77f56b281804313de624cf7d18bce0f43a86b1e` verified |
| Development schema | ledger `[1,10,15,20,30,40,50,60,70,80,90,100,110,120,130]`; sequence 130 `applied → verified_noop`; schema-exception CHECK/trigger `6/1`, 행 0; business-reason CHECK/trigger `8/8`; startup/catalog 승인 |
| Todo 20 현재 단위 | strict payload/live-service, 48개 reason, 25-code exception, KST rights·close/balance·62-class lock trace 완료. registry disposable, stored payload/hash/result·same-UID replay sequence 불변, 서로 다른 operation UID의 동일 stable-key race `1 commit/1 serialization abort`·loser receipt 0·DB absence를 증명했다. `48fda9a` activation DB writer와 fresh disposable run `21f7c263-25ab-47ef-9cab-047a81de44d5`가 정책 6개 선행→매핑 24개, binding 오류 0, failure residue 0, Development digest/teardown을 닫았다. `c157218` refund DB tail writer는 승인 원본 receipt/allocation과 source-bound debit event·bound claim·bank transaction을 잠근 뒤 ordinary next-month 및 두 correction retroactive 저장 분기만 예약/기록하도록 구현됐고 Replit `tsc`·집중 테스트 10/10을 통과했다. refund fresh disposable FK/trigger probe, 두 writer의 operation receipt/audit wrapper와 나머지 workflow 전체 harness가 남음 |
| Todo 21 현재 단위 | Replit 기준선이 canonical phone fixture와 Todo 19 legacy payment write fence를 따르지 않던 계정 삭제 통합 fixture 두 결함을 발견했다. `28b0014`/`244c3fe`로 fixture를 현재 physical contract에 맞췄고 Replit `npm run check`와 계정 삭제·Kakao 종료 경합·route security·startup retention 34/34가 통과했다. Development metadata-only catalog는 owner mismatch, PUBLIC privilege, RLS/policy/SECURITY DEFINER 모두 0과 role membership digest `15ca7b04…`를 기록하고 `ROLLBACK`했다. `e57c743`/`dd48a0d`/`2f58989`은 workload runner를 CLI화하고 current manifest/materialization index set 432개에 결박했다. 13개 table cardinality 불변, 15 workload×2 plan 안정, business/schema write 0, ANALYZE-only와 중복 index 후보 DB-call 0 거부를 증명했다. 미설치 `payments__user_id__idx` runtime effectiveness는 `false`로 보존했다. `2993f2d`/`3d4d82a`는 credential-shaped synthetic log와 PUBLIC/RLS/owner/unsafe SECURITY DEFINER drift를 fail-closed로 만들었다. fresh disposable `5497f710-fd6e-497d-b6bc-469a9db5a420`에서 sequence 130 baseline을 닫고 PUBLIC routine grant를 `security_catalog_drift`로 탐지한 뒤 rollback catalog 동일성·role membership digest 불변·DB/receipt/worktree 부재를 증명했다. exact happy/failure Todo 21 통합 harness가 남음 |
| Todo 19 schema prerequisite | sequence 90 legacy cutover-code root correction committed; disposable와 Development 모두 `applied → verified_noop`, startup/catalog 승인; cutover/payment/legacy-decision row 0 유지 |
| Todo 19 zero-row cutover | sequence 100과 Development legacy v3 release·preview·`legacy→fenced→new` 완료; five-service operation `created → verified_noop`; phase `new`, watermark 0, payment/decision 0, receipt/entity/audit `5/6/6` |
| Todo 19 nonzero/disposable | exact commit `a6944d1`; eligible cross-link/new, signed zero·negative exclusion, ambiguity rollback, concurrent writer snapshot-drift 차단, audited `new→read_rollback→new`, replay no-op와 DB absence 증명 |
| Todo 19 regression | exact commit `c00f25e`; Replit `npx tsc --noEmit`, accounting·admin route·security 167/167 통과; historical Todo 12–15 manifest 검증은 SHA를 바꾸지 않고 exact archived-parent ancestry를 검증 |
| Todo 18 apply 구현 | synthetic group `1/28/28`, role `1/7/7`, individual dues `1/20/20` operation receipt/entity/audit; replay identity sequence 불변 및 exact KRW 50,000 합계 증명 |
| Todo 18 통합 검증 | exact commit `c3678d8`; happy 6개와 failure 2개를 독립 disposable DB에서 통과, 모든 DB·actor receipt·임시 worktree/evidence 부재 확인 |
| 관리자 CLI | exact commit `d6f1788`; fixed Development admin receipt와 live ledger/admin을 재검증하고 authenticated POST와 동일 service·transaction 실행; Replit `tsc`와 138개 테스트 통과 |
| 실제 source data | active release 29, batch/set/item `11/10/6996`; batch `10 applied/1 previewed`, set `9 approved/1 rejected/0 previewed`; legacy cutover `legacy→fenced→new`, payment/decision 0; open period 6, 기존 회원·financial downstream 0 |
| Production/deploy | 작업 0건; 미승인·미검증 |

## 남은 실행 순서

| 순서 | Todo/Phase | 다음 완료 조건 |
|---:|---|---|
| 1 | 20 ∥ 21 | 시간·금액·마감·동시성 불변식과 security/retention/workload 검증 |
| 2 | 22 | Development 최종 검증, measured restore drill, Production read-only dossier |
| 3 | F1–F4 | 동일 frozen SHA를 독립 검증한 provider-bound receipts |
| 4 | A1 | 최종 architecture attestation |
| 5 | C1 | 정식 오픈 직전 최종 source freeze·Production backup/restore·reconciliation 후 사용자 선언 시각부터 PostgreSQL을 회원·조직 SSOT로 전환 |

## 현재 운영 승인 경계

- 관리자 CLI로 먼저 7개 source를 Development에 원자 apply했고, 이어 owner 승인 AGM36 v3를 실제 Notion v4 경계 row에 결합했다. 기존 v2 set은 `rejected`, v3 set/batch는 `approved/applied`이며 `PRE_AGM36_2026`, `AGM36_TO_AGM37` 두 period가 생성됐다. 모든 exact replay는 receipt bytes와 identity-sequence digest를 보존했다.
- 전체 open period는 `CALENDAR_2022`–`CALENDAR_2025`, `PRE_AGM36_2026`, `AGM36_TO_AGM37` 6개다. 회원·직책·financial downstream은 0이고 Production·배포 작업도 0이다.
- Owner 승인에 따라 외래교수회 set `811462f6-de04-428b-99ba-a587eac4b0d7`의 name-only match 26개와 unbound allocation 26개를 기존 `quarantine` outcome 그대로 Development에 approve/apply했다. batch만 `applied`로 전환됐고 회원 match·receipt·group·allocation downstream은 모두 0이다.
- 동일 operation replay의 service receipt SHA-256 `2f8c6f1362f1a8b8cd038126bf9ffef878ae1198e15b651751b5c007446de6a8`, receipt file SHA-256 `d4b25889651bb1c71c1c4bae3517663985b987ff0778816cdffa57cdedd63477`, identity-sequence SHA-256 `c0b7dd1d1343026d74c4c897f57ce5a8df086c5482541e9a8f2bd8a9bba25778`이 전후 동일했다. 임시 receipt·worktree는 삭제 후 부재를 확인했다.
- 외래교수회 26행 × 50,000원은 여전히 후보 evidence일 뿐이다. 향후 실제 bank evidence가 추가되면 기존 terminal evidence를 변경하지 않고 새 source revision/release/preview와 별도 source-decision으로 처리한다.
- Todo 18 source coverage와 Todo 19의 zero-row Development cutover는 완료됐다. 관리자 CLI의 다섯 service operation은 `created → verified_noop`, identity sequence와 receipt collection digest 불변을 증명했다. 임시 receipt 10개와 exact Replit worktree는 삭제 후 부재를 확인했고 원래 Replit dirty 상태는 보존했다.
- Todo 19 nonzero fixture는 5개 frozen legacy row에서 결정 5개, 호환 이벤트·receipt·allocation 각 1개와 double-count 0을 증명했다. 다섯 고정 operation과 `read_rollback|recutover`는 모두 `created → verified_noop`이고 rollback 중에도 legacy write fence가 유지됐다.
- ambiguity는 `legacy_materialization_unresolved_decision`, 선행 concurrent writer는 lock 대기 후 새 snapshot의 `legacy_payment_batch_binding_mismatch`로 각각 phase `legacy`, 결정·호환 이벤트·fence receipt 0을 유지했다. 이 검증은 기존 actor 조회가 SERIALIZABLE snapshot을 너무 일찍 고정하던 결함을 발견했고, fence/cutover가 첫 조회 전에 `payments` 배타 lock을 잡도록 교정했다.
- fresh happy/ambiguity/concurrent UUID의 disposable DB와 임시 receipt는 모두 부재다. 현재 Development business row, Production, 배포는 이 완료 작업에서 변경하지 않았다. 다음 안전 범위는 Todo 20·21이다.
- Production DB 쓰기, Republish, 실제 결제 연동, C1 SSOT 전환은 각각 별도 운영 경계다.
- Production DB write, Republish, 실제 결제 연동, C1 SSOT 전환만 현재 사용자 운영 승인 경계다. Todo 20·21의 synthetic/disposable 및 read-only 검증은 Codex 책임 범위에서 계속한다.

## 문서 동기화 규칙

- SHA-bound 승인 명세의 체크박스는 역사적 실행 계약이며 진행상태 표시에 사용하지 않는다.
- DB 객체나 migration 변경은 같은 PR의 `docs/database-schema.md`, metadata-only catalog, 필요 시 `docs/database-operations.md`와 함께 닫는다.
- 이 roadmap은 완료 증거와 다음 startable Todo가 바뀔 때 현행화한다.
