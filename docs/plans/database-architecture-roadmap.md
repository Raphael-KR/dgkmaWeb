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
| 실제 source data | active release 27, batch/set/item `9/9/6994`; 9개 set 전부 `previewed`; 회원·match·직책·분류·event·receipt·allocation downstream 전부 0 |
| Production/deploy | 작업 0건; 미승인·미검증 |

## 남은 실행 순서

| 순서 | Todo/Phase | 다음 완료 조건 |
|---:|---|---|
| 1 | 18 | 실제 9개 preview의 administrator-readable source decision을 확정하고, 승인 범위만 동일 service 경로로 Development에 원자 apply한 뒤 source별 합계·중복 0 검증 |
| 2 | 19 | legacy `payments` cross-link/backfill, double-count 0, DB-resident cutover proof |
| 3 | 20 ∥ 21 | 시간·금액·마감·동시성 불변식과 security/retention/workload 검증 |
| 4 | 22 | Development 최종 검증, measured restore drill, Production read-only dossier |
| 5 | F1–F4 | 동일 frozen SHA를 독립 검증한 provider-bound receipts |
| 6 | A1 | 최종 architecture attestation |
| 7 | C1 | 정식 오픈 직전 최종 source freeze·Production backup/restore·reconciliation 후 사용자 선언 시각부터 PostgreSQL을 회원·조직 SSOT로 전환 |

## 현재 운영 승인 경계

- 외래교수회 26개 행의 각 50,000원은 후보일 뿐 자동 배분 근거가 아니다. 실제 `include|reject|quarantine`, 총액 KRW 1,300,000 일치, primary bank receipt와 companion roster 결합은 별도 source-decision 승인을 요구한다.
- 현재 실제 preview의 제안값은 `AGM36_PERIOD_BOUNDARY` approve 2, `LEDGER_FINAL_2022_2025` approve 4/quarantine 3,014, 나머지 decision item 6,988개 quarantine이다. 이는 deterministic preview이지 운영 승인이나 apply가 아니다.
- PII-free read-only 충돌 점검에서 기존 period는 0개였다. 승인 후보 6개는 `CALENDAR_2022`–`CALENDAR_2025`, `PRE_AGM36_2026`, `AGM36_TO_AGM37`이며 코드 충돌이 없다.
- 다음 단일 운영안은 exact commit `85ee71c`를 Development에만 활성화하고, 저장된 관리자 세션의 authenticated GET/POST로 외래교수회 companion을 제외한 8개 preview를 그대로 승인·적용하는 것이다. 예상 결과는 batch/set `8/8 applied/approved`, 외래교수회 `1/1 previewed`, period 6개 생성, 나머지 회원·직책·financial downstream 0, 동일 POST replay no-op이다. 외래교수회는 exact primary bank receipt 결정 전 direct companion apply 금지를 유지한다. GUI saved-session 사용과 Development restart가 필요하므로 명시 승인 전에는 실행하지 않는다.
- 그 전까지 Codex는 synthetic/disposable 검증, Development additive schema, read-only preflight, deterministic preview, 테스트·문서·Git/GitHub 작업을 계속한다.
- Production DB 쓰기, Republish, 실제 결제 연동, C1 SSOT 전환은 각각 별도 운영 경계다.

## 문서 동기화 규칙

- SHA-bound 승인 명세의 체크박스는 역사적 실행 계약이며 진행상태 표시에 사용하지 않는다.
- DB 객체나 migration 변경은 같은 PR의 `docs/database-schema.md`, metadata-only catalog, 필요 시 `docs/database-operations.md`와 함께 닫는다.
- 이 roadmap은 완료 증거와 다음 startable Todo가 바뀔 때 현행화한다.
