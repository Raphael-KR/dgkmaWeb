# accounting-dues-prd - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** 확정 장부와 은행 원거래를 안전하게 가져와 현금출납, 회비 배분, 약정·권리상태, 은행조정, 결산과 감사이력을 관리하는 통합 기능입니다. 관리자는 회계 전 과정을 처리하고 회원은 본인의 약정·납부·부족액·권리효력을 명확히 확인할 수 있습니다.

**Why this approach:** 은행 원본·수납·회비 배분·회계 판단을 분리해 정정 가능성과 감사 추적을 확보하고, 웹 계정과 회계 회원을 분리해 미가입·탈퇴·명예회원의 기록도 안정적으로 보존합니다. 불변 UUID 회원키, 공급자 중립 수납계층, 명시적 FK 삭제정책과 PostgreSQL 제약·지연 트리거가 동시 처리에서도 금액·기간 무결성을 보장합니다.

**What it will NOT do:** 복식부기나 결제선생 API·webhook·자동결제, 은행 자동연동을 도입하지 않습니다. 다만 다음 Phase에서 결제선생을 붙여도 배분·권리 엔진을 다시 만들지 않도록 수납계층만 공급자 중립으로 둡니다. 임의 엑셀 업로드나 자동 회계판단을 하지 않으며, 별도 승인 전에는 운영 DB·배포를 변경하지 않습니다.

**Effort:** XL
**Risk:** High - 불변 원거래, 역사 마이그레이션, 시간기준 권리판정과 금액 대사를 동시에 정확히 유지해야 합니다.
**Decisions to sanity-check:** 모든 DBA 보강안 승인 완료: 내부 bigint PK+외부 UUID, 신규 KRW bigint, Phase 1 `dues_receipts`; 연납은 즉시 권리효력, 월납은 익월 갱신; 연중 최고 직책이 연간 의무액을 정하지만 과거 권리이력은 유지; 현재 별도 부담금은 0원; 운영 반영은 별도 승인.

Your next move: 구현을 시작하거나, 그 전에 고정밀 이중 검토를 요청할 수 있습니다. Full execution detail follows below.

---

> TL;DR (machine): XL/high-risk full-stack accounting and dues system; 40 implementation todos across DBA-hardened domain/schema, immutable import, provider-neutral receipts, cashbook/close, dues/rights, APIs/UI, legacy migration and Development verification; no payment-provider integration or Production mutation.

## Scope

### Product requirements (PRD)

#### Outcome

동문회가 현재의 단식 현금출납 방식을 유지하면서 2022~2025 확정 장부와 2026 은행 원거래를 손실 없이 가져오고, 관리자가 수입·지출 분류, 회원별 회비 배분, 은행조정, 결산과 감사이력을 한 시스템에서 관리한다. 회원은 본인의 약정·납부·부족액·독촉·권리상태를 서로 구별해 조회하고 월 약정액을 다음 달부터 변경할 수 있다.

#### Primary users

- 재무·관리자: 원천 preview/apply, 미분류 거래 처리, 개인·단체 회비 배분, 환불·정정, 은행조정, 마감, 보고서와 감사이력 조회.
- 일반 회원: 본인의 개인 약정액, 직책상 최소 회비, 실제 납부누계, 약정 미달액, 정책 미달액, 독촉상태, 현재 권리상태와 과거 효력이력 조회.
- 명예회원: 기본 자격은 `명예회원`; 현재 회비와 부담금 부과액은 각각 0원이고 발언권만 가지며 회비 납부만으로 권리회원이 되지 않는다.

#### Source-of-truth inputs

| Source | Identifier / tabs | Authority and handling |
| --- | --- | --- |
| 2022~2025 확정 장부 | Google Sheet `1aStEZeCSHIUqS4W81umlW8B3pMCJpx-u5Oe_IHcD49k`; `회비수입`, `2025`, `2024`, `2023`, `2022` | 확정 현금출납·역사 회비 원천. 2022~2023은 회비 정책을 소급 생성하지 않고 원문 분류만 보존. |
| 외래교수회 단체납부 | Google Sheet `1s8x9Oli94iD0Dwx1OYedmKbwSBRPkvcg3tjCML6iHPY`; `2024`, `2025`, `2026` | 대표 입금 1건을 회원 N명에게 배분하기 위한 회차별 snapshot 원천. 연락처·직장·주소는 회계 DB에 복제하지 않는다. |
| 2026 은행 원거래 | Google Sheet `1d9C3cMd_0MomQtF5cfAk-9doVKRxsy8OKiO1MqvYqA0`; `토스뱅크(1/1~3/16)`, `기업은행(3/16~)` | 미분류 원거래. 표시 일시는 문서 timezone과 무관하게 KST 로컬 일시로 파싱. 2026-03-16 토스 출금과 기업 입금은 내부이체 후보. |
| 2026 회원관리·회계 규정안 | Notion `3aa2225d9c4d8188b661ce08b2cfed2f`; 별표 1 | 2026 직책별 회비 정책 원천. 총회의장은 부회장·감사와 같은 월 30,000원/연 400,000원 등급이다. 현재 이사회 의결 전 제정안이므로 정책 버전에 의결 상태·의결일·시행일을 보존하고 의결 전에는 운영 확정 정책으로 표시하지 않는다. |
| 레거시 DB | `payments` | 삭제·재해석하지 않는다. 멱등 backfill 뒤 새 쓰기는 종료하고 새 모델에서만 권리를 판정한다. |
| 현행 DB 메타데이터 기준선 | branch `codex/current-db-schema-documentation`, commits `bb88a02` and `0e299abce9509456de0e8bfe224cb7ef392228d8`; `docs/database-schema.md`, `scripts/database-schema-catalog.sql`, `docs/database-operations.md` | 구현 시작 전에 두 승인 커밋을 대상 branch에 병합하거나 두 커밋을 포함한 실행 worktree를 준비한다. Todo 1은 Replit Development에서 catalog를 다시 실행해 112/113 불일치를 정정하고 새 기준 commit/SHA를 고정한다. Todo 2 이후의 schema diff는 이 새 기준에만 의존한다. Production은 성공한 별도 read-only catalog 전까지 unverified이다. |

로컬 `KIKcd_B.20250701.xlsx`와 `KIKcd_B.20250701.txt`는 회계 원천이 아니며 모든 구현·테스트·import에서 열지 않는다.

#### Functional requirements

1. 원천 가져오기
   - 각 원천은 source registry, adapter code/version, 문서 ID, 탭, 범위, 원본 digest, 행 번호와 행 fingerprint를 가진다.
   - preview는 DB를 변경하지 않고 신규·중복·경고·차단·합계·잔액연속성을 보여준다.
   - apply는 advisory lock, source 재조회, fingerprint 재검증, 단일 transaction으로 실행하며 동일 원천 재실행은 0건을 추가한다.
   - 원본 row와 은행거래는 append-only이며 수정·삭제하지 않는다.
2. 단식 현금출납
   - 모든 신규 금액·잔액·합계는 PostgreSQL `bigint` KRW 정수 원 단위이다. API/JSON에서는 정규 십진 문자열로 직렬화하고 JavaScript unsafe number를 허용하지 않는다. 은행거래는 `credit|debit`와 양의 금액으로 정규화한다.
   - 승인된 분류 line의 합은 원거래 금액과 정확히 같아야 한다.
   - 내부이체는 서로 다른 계좌의 반대 방향·동일 금액 두 leg를 각각 한 번만 연결하며 수입·지출 합계에서 제외한다.
   - 오류 정정은 원거래를 바꾸지 않고 반대 부호의 단식 조정거래와 `supersedes/corrects` 관계를 생성한다.
3. 회계기간과 마감
   - 회계기간, 실제 거래일, 1월 시작 회비연도를 서로 분리한다.
   - 2025 회계기간은 2026-02-28 12:38 KST에 끝나고 2026 회계기간은 그 직후 시작한다.
   - 상태는 `open → reconciling → closed`; 미분류 거래, 미확인 회원배분, 미승인 배분, 은행잔액 차이가 있으면 마감할 수 없다.
   - closed 기간은 직접 수정하지 않는다. 재개방은 관리자 사유와 감사이력 후에만 가능하다.
4. 회비와 회원 식별
   - 웹 계정과 독립적인 회계용 회원 레코드는 내부 FK용 `bigint` identity와 외부 연동용 불변 UUID를 함께 가져 미가입 동문·명예회원·탈퇴 회원을 식별한다. `users`와 `alumni_database`는 nullable unique `ON DELETE SET NULL` 연결이다.
   - 이름만으로 자동 매칭하지 않는다. `unmatched|candidate|approved|rejected` 상태를 사용하고 동명이인·복수 후보는 관리자 확정 전 반영하지 않는다.
   - 단체 입금은 당시 명단 snapshot과 회원별 배분액을 보존하며 승인 합계가 은행 입금액과 일치해야 한다.
5. 회비 정책과 약정
   - 정식 정책은 2024부터 시작한다. 직책별 금액은 일반회원 회비를 포함한 총 회비이며 별도 2천원을 가산하지 않는다.
   - 2026 총회의장은 독립 임원 직책으로 저장하되 회비 등급은 부회장·감사와 동일한 월 30,000원 이상·연 400,000원 이상을 적용한다.
   - 월 기준과 연납 기준은 각각 저장하고 12배로 유도하지 않는다.
   - 입회 시 개인 월 약정액을 등록한다. 기존 회원에게 약정이 없으면 당시 직책상 최소 월회비를 기본값으로 생성한다.
   - 약정 변경은 다음 달 1일부터 적용하고 과거 약정·미달액은 바꾸지 않는다. 직책 변경도 개인 약정액을 자동 변경하지 않는다.
   - 한 회비연도에 맡은 직책 중 회비 기준이 가장 높은 직책을 그해 의무액에 사용하되, 직책 변경 전 확정된 과거 권리상태는 덮어쓰지 않는다.
6. 납부·선납·환불·정정
   - 은행거래 또는 레거시 결제를 먼저 공급자 중립 `dues_receipts`로 수납 확정하고, 하나의 수납을 `dues_allocations` N개로 배분한다. 결제선생 Phase 2는 provider payment/event를 receipt에 연결하며 배분·권리 엔진은 변경하지 않는다.
   - 승인된 실제 납부누계를 1월부터 계산하고 선납·몰아내기는 가장 오래된 미충당 월부터 이후 월로 순차 충당한다.
   - 연납 기준액 도달은 모든 직책에서 즉시 완납 및 권리 효력을 발생시킨다.
   - 일반 환불·배분취소로 누계가 부족해지면 다음 달부터 권리를 정지한다.
   - 허위·중복·오류 거래 정정만 원래 효력일까지 소급할 수 있다. 원 snapshot은 불변으로 남기고 정정 버전이 `supersedes`로 대체한다.
7. 권리 판정
   - 권리 판정은 `회비 충족 AND 현재 유효한 부담금 충족`이다. 현재 별도 부담금 부과액은 모든 회원과 명예회원에게 0원이며 이사회 정책 생성 전 미납을 만들지 않는다.
   - 매월 10일까지 정상 납부기간, 11일부터 말일까지 당월 누계 기준 독촉기간이다.
   - 월납 경로의 권리 효력은 말일까지 전월 확정상태를 유지하고 다음 달 1일 갱신한다. 1월은 직전 회비연도의 12월 권리상태를 이어받는다.
   - 개인 약정액·약정 누계·약정 미달액과 직책상 정책액·정책 부족액은 별도로 계산한다. 권리는 항상 정책액과 실제 납부누계로 판정한다.
   - 표시명은 일반 회원 중 권리 유지=`권리회원`, 권리 정지=`회원`, 명예 자격=`명예회원`이다. 권리 정지는 로그인·계정 비활성화가 아니다.
8. 보고·감사
   - 현금출납부: 회계기간·계좌·일시·수입/지출·금액·잔액·적요·분류·원천·승인상태.
   - 결산: 기초잔액 + 분류별 수입 - 분류별 지출 = 기말장부잔액; 내부이체는 순수입·순지출에서 제외; 은행잔액과 차이 0.
   - 회비현황: 회비연도·회원·직책기준·개인약정·정책누계·납부누계·두 부족액·독촉·권리효력·미확인 금액.
   - 작업대기열: 미분류 거래, 미확인 회원, 불일치 배분, 조정 차이, 마감 blocker.
   - 모든 create/approve/reject/reverse/correct/close/reopen에는 수행자, 기록시각, 효력일, 사유와 변경 전후가 남는다.

### Logical database schema

All new surrogate PKs are `bigint GENERATED ALWAYS AS IDENTITY`; existing `users.id`, `alumni_database.id`, and `payments.id` remain integer FKs. External/stable member and receipt identifiers are UUID v4 from PostgreSQL `gen_random_uuid()`. Instants use `timestamptz`; calendar-only values such as pledge month boundaries and posted dates use `date`; all ranges are half-open `[start,end)`. New money/balance/aggregate columns are nonnegative or positive `bigint` KRW as appropriate and cross the API as canonical decimal strings. `created_at/recorded_at` is never reused as business `effective_at`. State/role/kind fields remain text with named `CHECK` constraints rather than PostgreSQL enums. Every FK declares nullability, `ON DELETE`, `ON UPDATE`, and a supporting lookup index; approved financial/provenance/audit data never cascades.

| Table | Required columns and keys | Invariants / indexes |
| --- | --- | --- |
| `association_members` | `id bigint identity PK`, `member_uid uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE`, member kind/display name, nullable unique `user_id → users ON DELETE SET NULL`, nullable unique `alumni_record_id → alumni_database ON DELETE SET NULL`, status, joined/ended instants | Immutable internal/external identity survives account deletion and roster relink; `ended_at IS NULL OR ended_at >= joined_at`; active/ended consistency; no contact/workplace/address columns. |
| `accounting_periods` | bigint PK, unique code, start/end instants, status, close/reopen actor-member/time/reason | `starts_at < ends_at`; global half-open ranges cannot overlap through exclusion constraint or capability-tested deferred trigger; closed rows append-only except audited reopen. |
| `accounting_sources` | bigint PK, source kind/locator/display name, adapter code/version, source timezone, active interval | Exact unique active identity `(kind,source_locator,adapter_code,adapter_version)`; locator contains document/tab/range configuration but no credentials. |
| `accounting_import_batches` | bigint PK, `source_id FK RESTRICT`, fingerprint, status/counts, preview/apply actor-member and times | Unique `(source_id,fingerprint)`; stale preview and concurrent apply rejected; FK indexed. |
| `accounting_import_rows` | bigint PK, source/batch FKs RESTRICT, `sheet_name text NOT NULL`, `source_row_no bigint NOT NULL`, fingerprint, restricted raw JSON, redacted normalized JSON, issue status | Unique `(source_id,sheet_name,fingerprint)` and `(batch_id,sheet_name,source_row_no)`; immutable trigger; raw payload server-admin only and excluded from DTO/log/evidence. |
| `bank_accounts` | bigint PK, institution/display/masked identifier, owner type, active interval | Unique institution+masked identifier; interval checks; never store or expose full account number. |
| `bank_transactions` | bigint PK, `account_id FK RESTRICT`, nonnull unique `source_row_id FK RESTRICT`, occurred instant, posted date, direction, positive `amount bigint`, nullable `balance_after bigint`, redacted snapshots/fingerprint | Unique `(account_id,row_fingerprint)` and source row; immutable trigger; direction/balance checks; account/time/direction and FK indexes. |
| `bank_transfer_matches` | bigint PK, unique debit and credit transaction FKs RESTRICT, positive `amount bigint`, approval actor-member/time | IDs differ; deferred trigger enforces different accounts, opposite directions, equal amounts and prevents either transaction from reuse in either leg role. |
| `accounting_categories` | bigint PK, stable code, positive version, display name, report section, half-open active interval | Unique `(code,version)`; approved versions for the same code cannot overlap; `cashbook_entries.category_id` references the exact immutable version row and historical label snapshot is preserved. |
| `cashbook_entries` | bigint PK, nullable bank-transaction FK RESTRICT, period/category FKs RESTRICT, effective instant, direction, positive `amount bigint`, description, `status(draft|approved|discarded)`, nullable self correction FK RESTRICT, provenance/actor refs | Only drafts may become discarded; approved bank-backed lines sum exactly to transaction amount; non-bank entry requires explicit provenance; closed-period writes rejected; approved rows append-only. |
| `member_role_history` | bigint PK, `member_id FK RESTRICT`, role code, half-open timestamptz interval, provenance refs | Member ranges cannot overlap via GiST exclusion with capability-checked `btree_gist`, otherwise deferred trigger; start<end; role priority comes only from policy. |
| `dues_policies` | bigint PK, dues year, role/priority, positive version, `effective_from timestamptz`, nullable self `supersedes_policy_id FK RESTRICT`, monthly/annual bigint minima, due/reminder days, rights rule, approval actor/time | Immutable version rows; unique `(dues_year,role_code,version)` and `(dues_year,role_code,effective_from)`; deferred trigger enforces one acyclic supersession chain and monotonic version/effective time. Resolution selects the latest effective version and snapshots retain its FK. 2024+; annual amount independent. |
| `dues_pledges` | bigint PK, `member_id FK RESTRICT`, `monthly_amount bigint`, effective date interval, source, confirmed instant | First-of-month/start<end checks; member ranges cannot overlap; approved history append-only and changes start next month. |
| `member_assessments` | bigint PK, member/policy/source FKs RESTRICT, dues year, burden kind, `amount bigint`, due/effective dates, status/audit refs | Named amount/date/status checks; unique approved logical version; absent current row means 0원 and cannot create implicit debt. |
| `dues_receipts` | bigint PK, `receipt_uid uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE`, `source_kind(bank_transaction|legacy_payment|historical_import)`, nullable unique bank-transaction FK RESTRICT, nullable unique `legacy_payment_id → payments RESTRICT`, nullable unique `source_import_row_id FK RESTRICT`, direction, positive `gross_amount bigint`, occurred/recorded instants, `status(proposed|approved|rejected)` | Phase 1 source-specific XOR permits exactly one bank, legacy or historical Sheet provenance. Only proposed rows transition and approved/rejected rows are immutable. Phase 2 adds provider payment/event linkage and expands only the source contract, not allocation/rights tables. |
| `dues_payment_groups` | bigint PK, unique `receipt_id FK RESTRICT`, group/payer snapshots, roster provenance/hash, `expected_total bigint`, `status(proposed|approved|rejected)`, approval refs | Only proposed rows transition; snapshot excludes contact/workplace/address; approved child/allocation sum equals receipt gross amount; approved/rejected rows immutable. |
| `dues_group_members` | bigint PK, `group_id FK RESTRICT`, nullable `member_id FK RESTRICT`, display snapshot, `source_row_no bigint NOT NULL`, `source_import_row_id FK RESTRICT`, `proposed_amount bigint`, match status | Unique `(group_id,source_row_no)` plus partial unique `(group_id,member_id) WHERE member_id IS NOT NULL`; unresolved/duplicate candidates block approval; no approved-data cascade. |
| `dues_allocations` | bigint PK, `request_uid uuid NOT NULL UNIQUE`, nullable `receipt_id FK RESTRICT`, nullable `group_member_id FK RESTRICT`, `member_id FK RESTRICT`, dues year, `effect_kind(payment|refund|cancellation|correction)`, positive `amount bigint`, `status(proposed|approved|rejected)`, effective/recorded instants, nullable self `reverses_allocation_id FK RESTRICT`, approval refs | Only proposed rows transition; the effect matrix below is enforced by named checks+deferred triggers. Approved receipt allocations cannot exceed gross; debit effects cannot exceed refundable remainder; lineage is acyclic; approved/rejected rows append-only. |
| `dues_status_snapshots` | bigint PK, member/policy/role/pledge FKs RESTRICT, dues year, evaluated/effective instants, bigint cumulative/required/paid/shortfalls, statuses, nullable self supersedes FK RESTRICT, reason | Immutable version-unique snapshots; normal changes prospective; error correction appends a superseding backdated version. |
| `bank_reconciliations` | bigint PK, account/period FKs RESTRICT, statement-end instant, bank/ledger `bigint` balances, stored generated `difference = bank_balance-ledger_balance`, status/approval refs | Unique account+period+statement end; approved implies generated difference=0; approved rows immutable. |
| `bank_reconciliation_items` | bigint PK, reconciliation/transaction FKs RESTRICT, resolution status/note | Unique `(reconciliation_id,bank_transaction_id)`; deferred trigger prevents reuse across approved reconciliations. |
| `accounting_audit_events` | bigint PK, intentional non-FK entity type/id/key snapshot, action, nullable actor-member FK RESTRICT, nullable actor-user FK `ON DELETE SET NULL`, recorded/effective instants, reason, redacted before/after JSON, correlation UUID | Append-only trigger; named action/entity checks; entity/actor/correlation/time indexes; payload size/redaction contract; deliberate non-FK entity reference lets audit outlive mutable account links. |

Cross-row invariants that a normal `CHECK` cannot express are enforced twice: service-level transactional validation and PostgreSQL deferred constraint triggers for cashbook splits, group totals, receipt allocation/refundable remainder/reversal lineage, transfer legs, reconciliation reuse, policy supersession and capability-fallback temporal overlap. GiST exclusion constraints are preferred for supported period/role/pledge overlap cases after `btree_gist` capability and privilege verification. Immutable import rows, bank transactions, approved receipts/allocations/groups/snapshots/reconciliations/policy versions and audit events use database triggers that reject unauthorized `UPDATE/DELETE`. Trigger functions lock referenced rows in deterministic order and concurrency tests exercise competing approvals.

#### Allocation effect and lineage contract

| Effect | Required provenance | Sign in net paid | Cardinality / limit | Rights effective date |
| --- | --- | --- | --- | --- |
| `payment` | approved credit receipt required; `reverses_allocation_id IS NULL` | `+amount` | a receipt may fund N allocations; approved sum cannot exceed receipt gross; `request_uid` makes retries idempotent | allocation approval/effective instant; annual threshold is immediate |
| `refund` | approved debit receipt and approved original payment allocation required | `-amount` | N partial refunds are allowed; their approved aggregate plus cancellations/corrections cannot exceed the original refundable remainder; each request UID is unique | ordinary refund affects rights from next month |
| `cancellation` | no receipt; approved original payment allocation required | `-amount` | one approved terminal cancellation per original, enforced by partial unique index; amount equals its then-refundable remainder | next month |
| `correction` | no receipt; factually false/duplicate/error original allocation required, with reason/code and audit correlation | `-amount` | one direct approved correction per original, enforced by partial unique index; a corrected positive reallocation is a separate `payment` row against the restored original receipt remainder in the same transaction/correlation | may use the original effective instant; never rewrites the original |

All four effects require a unique client/server idempotency `request_uid`. Deferred triggers serialize on receipt then original-allocation IDs, reject cycles and double consumption, and evaluate only approved rows.

#### Foreign-key matrix

Unless a row below says otherwise, every FK uses `ON UPDATE RESTRICT`; `idx` means a dedicated supporting btree index and `uq` means the unique constraint is the supporting index. No approved financial, provenance, snapshot or audit child cascades.

| Child columns | Parent | Nullability | ON DELETE | Index |
| --- | --- | --- | --- | --- |
| `association_members.user_id`; `.alumni_record_id` | `users.id`; `alumni_database.id` | nullable | SET NULL | uq; uq |
| `accounting_periods.closed_by_member_id`; `.reopened_by_member_id` | `association_members.id` | nullable | RESTRICT | idx; idx |
| `accounting_import_batches.source_id`; `.previewed_by_member_id`; `.applied_by_member_id` | `accounting_sources.id`; `association_members.id`; `association_members.id` | nonnull; nullable; nullable | RESTRICT | idx; idx; idx |
| `accounting_import_rows.source_id`; `.batch_id` | `accounting_sources.id`; `accounting_import_batches.id` | nonnull; nonnull | RESTRICT | idx; idx |
| `bank_transactions.account_id`; `.source_row_id` | `bank_accounts.id`; `accounting_import_rows.id` | nonnull; nonnull | RESTRICT | idx; uq |
| `bank_transfer_matches.debit_transaction_id`; `.credit_transaction_id`; `.approved_by_member_id` | `bank_transactions.id`; `bank_transactions.id`; `association_members.id` | nonnull; nonnull; nullable until approval | RESTRICT | uq; uq; idx |
| `cashbook_entries.bank_transaction_id`; `.period_id`; `.category_id`; `.source_import_row_id`; `.corrects_entry_id`; `.acted_by_member_id` | `bank_transactions.id`; `accounting_periods.id`; `accounting_categories.id`; `accounting_import_rows.id`; `cashbook_entries.id`; `association_members.id` | nullable; nonnull; nonnull; nullable; nullable; nullable until mutation | RESTRICT | idx each |
| `member_role_history.member_id`; `.source_import_row_id` | `association_members.id`; `accounting_import_rows.id` | nonnull; nullable | RESTRICT | idx; idx |
| `dues_policies.supersedes_policy_id`; `.approved_by_member_id` | `dues_policies.id`; `association_members.id` | nullable; nonnull | RESTRICT | uq on nonnull superseded parent; idx |
| `dues_pledges.member_id`; `.confirmed_by_member_id` | `association_members.id`; `association_members.id` | nonnull; nullable until confirmation | RESTRICT | idx; idx |
| `member_assessments.member_id`; `.policy_id`; `.source_import_row_id`; `.approved_by_member_id` | `association_members.id`; `dues_policies.id`; `accounting_import_rows.id`; `association_members.id` | nonnull; nullable for explicit 0/no-policy; nullable; nullable until approval | RESTRICT | idx each |
| `dues_receipts.bank_transaction_id`; `.legacy_payment_id`; `.source_import_row_id`; `.approved_by_member_id` | `bank_transactions.id`; `payments.id`; `accounting_import_rows.id`; `association_members.id` | XOR nullable; XOR nullable; XOR nullable; nullable until approval | RESTRICT | uq; uq; uq; idx |
| `dues_payment_groups.receipt_id`; `.roster_source_row_id`; `.approved_by_member_id` | `dues_receipts.id`; `accounting_import_rows.id`; `association_members.id` | nonnull; nonnull; nullable until approval | RESTRICT | uq; idx; idx |
| `dues_group_members.group_id`; `.member_id`; `.source_import_row_id` | `dues_payment_groups.id`; `association_members.id`; `accounting_import_rows.id` | nonnull; nullable until match; nonnull | RESTRICT | idx; partial uq by group; idx |
| `dues_allocations.receipt_id`; `.group_member_id`; `.member_id`; `.reverses_allocation_id`; `.approved_by_member_id` | `dues_receipts.id`; `dues_group_members.id`; `association_members.id`; `dues_allocations.id`; `association_members.id` | effect-dependent nullable; nullable; nonnull; effect-dependent nullable; nullable until approval | RESTRICT | idx each plus effect partial uq |
| `dues_status_snapshots.member_id`; `.policy_id`; `.role_history_id`; `.pledge_id`; `.supersedes_snapshot_id` | `association_members.id`; `dues_policies.id`; `member_role_history.id`; `dues_pledges.id`; `dues_status_snapshots.id` | all nonnull except supersedes | RESTRICT | idx each; uq on nonnull superseded parent |
| `bank_reconciliations.account_id`; `.period_id`; `.approved_by_member_id` | `bank_accounts.id`; `accounting_periods.id`; `association_members.id` | nonnull; nonnull; nullable until approval | RESTRICT | idx; idx; idx |
| `bank_reconciliation_items.reconciliation_id`; `.bank_transaction_id` | `bank_reconciliations.id`; `bank_transactions.id` | nonnull; nonnull | RESTRICT | idx; idx |
| `accounting_audit_events.actor_member_id`; `.actor_user_id` | `association_members.id`; `users.id` | nullable; nullable | RESTRICT; SET NULL | idx; idx |

`accounting_sources`, `bank_accounts`, and `accounting_categories` have no outbound FKs. All new bigint columns in Drizzle use `bigint(..., { mode: "bigint" })`; every API-exposed new bigint PK/FK and every bigint money/balance/aggregate value is serialized as a canonical decimal string, and external JSON number input for those fields is rejected.

#### Schema ownership boundary

Drizzle owns table/column definitions, identity/UUID defaults, ordinary PK/FK/UNIQUE/CHECK constraints, generated columns and ordinary indexes. A reviewed, SHA-pinned manual PostgreSQL migration owns `btree_gist`/EXCLUDE objects, trigger functions, deferred constraint triggers, immutability triggers and schema/table/routine ACL changes; `db:push` is not an apply mechanism for those objects. Todo 2 selects and hashes one of two explicit additive SQL variants—`btree_gist` EXCLUDE or deferred-overlap fallback—after Todo 1 capability evidence; it must not generate environment-dependent SQL at apply time. The catalog reports `contype='x'`, `tgconstraint/tgdeferrable/tginitdeferred`, `pg_get_functiondef`, `proconfig`, relation/routine/schema owners and ACL/grants so both ownership layers are independently verifiable.

Phase 1 keeps RLS disabled because browsers never connect to PostgreSQL and the current modular monolith uses one server-side database boundary. This is an explicit decision, not an omission: verify no client credential/direct DB surface, keep all authorization in admin/self APIs, use non-`SECURITY DEFINER` trigger routines with fixed safe `search_path`, revoke unnecessary `PUBLIC` routine/table privileges, and record actual grants in the catalog. If a direct client/analytics DB role is introduced later, RLS becomes a separate reviewed migration.

### API and UI contract

- Admin route: `/admin/accounting`, linked from the current administrator panel without expanding non-admin access.
- Admin APIs under `/api/admin/accounting/*` and `/api/admin/dues/*`; every mutation uses `requireAdmin`, strict Zod request schemas, preview fingerprint/idempotency, and PII-safe errors.
- Member APIs: `GET /api/dues/me/status`, `GET /api/dues/me/payments`, `GET/PUT /api/dues/me/pledge`; no arbitrary member ID parameter.
- Onboarding route: `/onboarding/dues-pledge`, after activity-region onboarding. New members confirm or raise the default pledge; existing members receive a confirmed migration default and are not forced through onboarding.
- Profile shows current display status plus individual pledge, role minimum, cumulative targets/payments, two shortfalls, reminder state, annual-completion state and effective history.

### Must have

- All eight functional requirement groups and the full logical schema above.
- Privacy-safe synthetic fixtures that reproduce header-order changes, bank sign differences, group allocation, KST parsing, 2026-03-16 internal transfer and invalid historical dates without copying real contact/workplace/account details.
- Additive schema and idempotent data migration; no deletion of legacy records.
- Development Database schema/apply verification and Replit development homepage browser QA.
- Tests-after using Node `test`/`tsx`, schema catalog tests, pure table-driven rule tests, route authorization tests, development DB integration tests, and agent-executed browser QA.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No debit/credit journal UI or mandatory double-entry bookkeeping.
- No arbitrary XLSX upload/OCR, 결제선생/payment-gateway API, webhook, automatic payment, automatic bank connection, tax filing or legal-accounting conclusion. `dues_receipts` is an internal provider-neutral boundary only; Phase 1 does not create provider intents/events, store provider credentials or call provider APIs.
- No automatic approval of classifier suggestions, name-only member matches, group allocations, corrections or closes.
- No rewrite/delete of imported raw rows, bank transactions, approved allocations, approved snapshots or audit events.
- No reuse of source sheet timezone for bank timestamps; displayed transaction strings are parsed as KST.
- No use of `KIKcd_B.20250701.xlsx` or `.txt`.
- No production DB mutation, live production import, Republish or production smoke check without a separate explicit user authorization after the Development preview and evidence are presented.
- No unrelated cleanup of the current dirty/untracked worktree.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after with Node `node:test` through `tsx`; every implementation todo includes focused tests before its commit.
- Focused commands: `npm exec -- tsx --test server/<target>.test.ts`.
- Full gates in Replit Development workspace: `npm test`, `npm run check`, `npm run build`, and `git diff --check`.
- Schema change gate: before implementation, include approved baseline commits `bb88a02` and `0e299ab`; Todo 1 confirms `current_database() = heliumdb`, resolves 112/113 through a fresh read-only catalog, corrects/commits the baseline and records metadata/row aggregates plus capability evidence. Todo 2 then generates the explicit SHA-pinned additive SQL variant from that baseline. Todo 36 applies only that reviewed variant and verifies tables, columns, PK/FK/UNIQUE/CHECK/EXCLUDE, indexes, sequences, extensions, routines/functions/config, constraint-trigger deferrability, owners, ACL/grants, RLS and counts through a new connection. `npm run db:push` may compare Development intent only; it never applies manual PostgreSQL objects or unreviewed Production SQL.
- Browser gate: use the Replit development homepage and the in-app browser; test admin, member, anonymous and failure states, capture screenshots, network responses and console errors. Do not ask the user to verify.
- Numeric reconciliation gates:
  - every exposed new bigint PK/FK/money/balance/aggregate crosses JSON as a canonical decimal string and rejects JSON numbers;
  - imported row count and signed total equal preview;
  - each approved receipt has exactly one Phase-1 provenance path and allocated/refunded remainder is never negative;
  - approved cashbook line sum equals each bank transaction;
  - internal transfer net income/expense equals 0;
  - approved group allocation sum equals source credit;
  - opening balance + credits - debits equals ending balance per account;
  - report ledger balance equals approved cashbook projection and bank reconciliation difference is 0.
- Evidence: `<attemptDir>/task-<N>-accounting-dues-prd.<ext>` where `attemptDir` is `currentAttemptDir` from `omo ulw-loop status --json`; outside ulw-loop use `.omo/evidence/accounting-dues-prd/`.
- PII guard: evidence and logs contain only counts, hashes, masked account labels and synthetic names; never real contact numbers, full account identifiers, sheet raw rows or Secrets.

## Execution strategy
### Pre-execution baseline gate

Before Todo 1 or any implementation branch is created, the target branch/worktree must contain the already approved schema-documentation commits `bb88a02` and `0e299ab`. The start-work coordinator may merge `codex/current-db-schema-documentation` while preserving both commits, or prepare a worktree whose HEAD already contains them; it must not silently recreate the files or cherry-pick an inferred subset. Record `git merge-base --is-ancestor 0e299ab HEAD`, the three file hashes and the resulting HEAD. Failure stops execution before source or schema edits.

### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- Wave 1, domain and persistence: Todos 1-6. Todo 1 verifies and corrects the committed current-schema baseline; Todo 2 fixes the bigint/UUID/receipt schema contract, Todo 3 seeds only after that schema exists, while privacy-safe fixtures in Todo 4 can proceed independently; Todos 5-6 close immutable member and deletion-lifecycle risks.
- Wave 2, source import: Todos 7-13. Source gateway/adapters run in parallel, then preview/apply/API/UI integrate them.
- Wave 3, cashbook and close: Todos 14-20. Seed/classifier can run in parallel; approval, transfer, correction, reconciliation, close/report follow.
- Wave 4, dues engine: Todos 21-27. Policy/role/pledge modules run in parallel; allocation/refund/rights snapshots integrate afterward.
- Wave 5, application surfaces and cutover: Todos 28-34. Admin/member APIs precede admin/onboarding/profile UI; legacy cutover follows the new read path.
- Wave 6, Development data and release evidence: Todos 35-40. Full gates, Development schema/data preview/apply, browser QA and production-ready runbook. Production changes remain explicitly out of scope.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | — | 2-40 | — |
| 2 | 1 | 3, 5, 7-40 | 4 |
| 3 | 2 | 21-34 | 4 |
| 4 | 1 | 7-20 | 2, 3 |
| 5 | 2 | 21-34 | 6 |
| 6 | 2, 5 | 35-40 | — |
| 7 | 2, 4 | 8-13 | 21-23 |
| 8-10 | 7 | 11 | each other |
| 11 | 8-10 | 12-13, 35-36 | — |
| 12 | 11 | 13, 35-36 | — |
| 13 | 12 | 37 | 24-27 |
| 14 | 2, 3, 4 | 16-20 | 15 |
| 15 | 2, 4 | 16-20 | 14 |
| 16 | 14-15 | 17-20 | — |
| 17 | 16 | 18-20 | 24-27 |
| 18 | 16-17 | 19-20 | 24-27 |
| 19 | 16-18 | 20, 35-36 | — |
| 20 | 19 | 33, 37-40 | — |
| 21-23 | 2, 3, 5 | 24-27 | each other, 7-13 |
| 24 | 11, 21-23 | 25-27, 29-34 | — |
| 25 | 18, 24 | 26-27, 29-34 | — |
| 26 | 21-25 | 27, 29-34 | — |
| 27 | 26 | 29-34 | — |
| 28 | 12, 16-20 | 30-31, 33 | 29 |
| 29 | 24-27 | 30-34 | 28 |
| 30-31 | 28-29 | 37 | each other |
| 32 | 5, 23, 29 | 37 | 30-31 |
| 33 | 20, 28-29 | 37 | 30-32 |
| 34 | 27, 29 | 35-40 | 30-33 |
| 35 | 6, 13, 20, 30-34 | 36-40 | — |
| 36 | 35 | 37-40 | — |
| 37 | 13, 20, 30-36 | 38-40 | — |
| 38 | 37 | 39-40 | — |
| 39 | 35-38 | 40 | — |
| 40 | 35-39 | Final verification | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. Persist the approved product and domain contracts
  What to do / Must NOT do: Enforce the pre-execution baseline gate. Through Replit SSH run the existing metadata-only catalog against the Development `heliumdb`, reconcile the documented 112-column count with the 113-column TABLE_ROW sum, correct all three baseline artifacts, and commit/hash the new authoritative pre-change baseline before any schema diff. In the same read-only pass record PostgreSQL version plus `btree_gist` availability/privilege; do not apply schema/data changes. Create `docs/accounting-dues.md`, `shared/accounting.ts`, and `shared/dues.ts`. Copy the PRD/DBA rules and source registry into the durable document; define strict contracts for UUID member/receipt IDs and every new bigint PK/FK/money/balance/aggregate as canonical decimal strings. Reject JSON numbers for all those bigint fields at external boundaries. Keep `member_kind` separate from rights state and use `회원`, `권리회원`, `명예회원`.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2-40.
  References (executor has NO interview context - be exhaustive): `.omo/drafts/accounting-dues-prd.md`; this plan `Product requirements` and `Logical database schema`; `docs/database-schema.md`; `scripts/database-schema-catalog.sql`; `docs/database-operations.md`; `shared/schema.ts:355-370`; `client/src/pages/about/bylaws.tsx:67-85`; latest bylaw source `https://app.notion.com/p/2142225d9c4d81eea09dd42e149dcbfc`.
  Acceptance criteria (agent-executable): evidence contains the ancestry check, Development DB identity, pre-change catalog, resolved exact table/column counts, corrected baseline commit and three file hashes, PostgreSQL/capability result; `server/accounting-contracts.test.ts` round-trips every exposed bigint PK/FK and money value as decimal strings while rejecting number-valued, fractional, negative, unknown-status, unsafe arbitrary-member, raw-payload and legacy-label cases.
  QA scenarios (name the exact tool + invocation): Happy—fresh Development catalog and TABLE_ROW derivation agree, then Node tests serialize IDs and values above 32-bit without precision loss; Failure—wrong DB, missing baseline ancestry/file, unresolved count, invalid UUID/status, numeric bigint field, `-1`, `tier="일반회원"` or raw payload blocks Todo 2. Evidence `<attemptDir>/task-1-accounting-dues-prd.json` and `.tap`.
  Commit: Y | `feat(accounting): define accounting and dues contracts`

- [ ] 2. Add the additive accounting and dues schema
  What to do / Must NOT do: Depend on Todo 1's corrected, committed baseline. Extend `shared/schema.ts` with all 22 tables and relations using `bigint(..., { mode: "bigint" })` for every new bigint PK/FK/money/balance/aggregate column, the full FK matrix, category versions, three-way receipt provenance XOR and exact NULL/partial-unique semantics. Drizzle owns ordinary relational objects. Create and SHA-pin the explicit Todo-1-selected manual SQL variant for EXCLUDE or overlap fallback, trigger functions, deferred constraint triggers, immutability triggers and ACL; `db:push` must not apply those objects. Update the catalog for `contype='x'`, `tgconstraint/tgdeferrable/tginitdeferred`, `pg_get_functiondef`, `proconfig`, extension state, relation/routine/schema owner and ACL/grants. Prohibit destructive SQL and changes to legacy tables.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3, 5, 7-40 | Can parallelize with: 4.
  References (executor has NO interview context - be exhaustive): this plan `Logical database schema`; `.omo/drafts/accounting-dues-prd.md` `DBA review addendum`; `shared/schema.ts:1-4,30-109,153-174,176-225,271-370`; `migrations/0000_cheerful_nick_fury.sql`; `drizzle.config.ts`; `docs/database-schema.md`; `scripts/database-schema-catalog.sql`; `docs/database-operations.md`; PostgreSQL 16 docs for UUID, constraints, range/exclusion and constraint triggers.
  Acceptance criteria (agent-executable): Drizzle and manual-SQL ownership manifests are disjoint and complete; the chosen additive variant is SHA-bound; `server/accounting-schema-contract.test.ts` verifies all 22 tables, bigint mode/decimal-wire contract, UUID/defaults, every FK matrix row/action/index, category versioning, effect/XOR/partial-unique rules, EXCLUDE-or-trigger objects, generated difference, routine search paths/ACL and immutable classes; no destructive SQL/provider integration.
  QA scenarios (name the exact tool + invocation): Happy—catalog fixture recognizes exact constraints, trigger functions and preservation-safe links and concurrent DB fixture commits only valid totals/nonoverlap; Failure—missing XOR/refund trigger, nullable-source duplicate, absent FK index, raw UPDATE, missing EXCLUDE catalog branch, destructive SQL or provider table/API fails. Evidence `<attemptDir>/task-2-accounting-dues-prd.tap`.
  Commit: Y | `feat(db): add accounting and dues schema`

- [ ] 3. Implement versioned policy/reference seeds
  What to do / Must NOT do: Add idempotent seed data/functions for immutable version-1 2024-2026 dues policies, role priority, 0원 current burden behavior, accounting categories, the nonoverlapping 2025/2026 AGM period boundary, and Toss/IBK accounts. Store monthly and annual bigint figures independently. Policy rows are inserted already approved and never updated; correction appends a monotonic superseding version with its own effective instant, while rights snapshots retain the exact earlier FK. Preserve historical labels as snapshots but use stable codes.
  Parallelization: Wave 1 | Blocked by: 2 | Blocks: 14, 21-34 | Can parallelize with: 4.
  References (executor has NO interview context - be exhaustive): `.omo/drafts/accounting-dues-prd.md` rows `dues-policy-table`, `dues-start-year`, `role-tier-replacement`, `current-assessment-policy`; this plan `Product requirements`; `client/src/pages/about/dues.tsx:28-75,132-139`.
  Acceptance criteria (agent-executable): `server/accounting-reference-seed.test.ts` asserts exact decimal-string 2024/2025/2026 rates, monotonic acyclic version/supersedes rules and as-of latest-version resolution, no 2022/2023 policy, 0원 burden, exact due/reminder days, independent annual values, nonoverlapping AGM boundary and idempotent double-run.
  QA scenarios (name the exact tool + invocation): Happy—seed twice yields identical hashes and a synthetic corrected policy appends version 2 without changing snapshots bound to version 1; Failure—updating approved version, overlapping policy/period, deriving annual value or creating 2023 policy fails. Evidence `<attemptDir>/task-3-accounting-dues-prd.tap`.
  Commit: Y | `feat(accounting): seed periods categories accounts and dues policies`

- [ ] 4. Create privacy-safe canonical source fixtures
  What to do / Must NOT do: Add synthetic fixtures under `server/fixtures/accounting/` for 2022-2025 ledger column-order changes, Toss signed rows, IBK separate credit/debit rows, 2026-03-16 internal transfer, group 1:N payment, duplicate row, balance discontinuity and invalid/cross-year date. Fixtures must reproduce shapes, not real names, contact data, workplaces, full accounts or raw rows; never open or reference the ignored KIK files.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 7-20 | Can parallelize with: 2, 3.
  References (executor has NO interview context - be exhaustive): this plan `Source-of-truth inputs`; `.omo/drafts/accounting-dues-prd.md` findings for sheet/tab shapes and KST parsing; `server/alumni-sync-plan.test.ts`; `server/alumni-sync-storage.test.ts:84-103`.
  Acceptance criteria (agent-executable): `server/accounting-fixture-safety.test.ts` verifies every required edge shape exists, no real spreadsheet raw value/phone/account/workplace pattern appears, and neither ignored filename is opened/imported/referenced by product code or fixtures.
  QA scenarios (name the exact tool + invocation): Happy—all fixture manifests hash and parse deterministically; Failure—fixture containing a phone pattern, full account number, contact/workplace key or `KIKcd_B` path is rejected. Evidence `<attemptDir>/task-4-accounting-dues-prd.tap`.
  Commit: Y | `test(accounting): add privacy-safe source fixtures`

- [ ] 5. Implement the durable association-member lifecycle
  What to do / Must NOT do: Add services in `server/accounting-members.ts` that create one bigint identity plus one immutable random UUID per association member, link nullable unique alumni/user rows, create honorary members, maintain match decisions and refuse name-only/multi-candidate approval. Backfill current alumni records idempotently without copying PII; a later phone/name/roster-row change relinks to the same association member and never regenerates `member_uid`. Unknown roles enter review.
  Parallelization: Wave 1 | Blocked by: 2 | Blocks: 21-34 | Can parallelize with: 6.
  References (executor has NO interview context - be exhaustive): `shared/schema.ts:30-47,93-109`; `server/alumni-sync-plan.ts:57-69,137-273`; `server/storage.ts:709-715`; this plan `Functional requirements` items 4-5 and `association_members` schema.
  Acceptance criteria (agent-executable): `server/accounting-members.test.ts` verifies unique valid UUIDs, immutable UUID across relink/account deletion, exact nullable links, unmatched/duplicate blocking, honorary creation, unknown-role review, idempotent backfill and prohibited-PII absence.
  QA scenarios (name the exact tool + invocation): Happy—unique alumni/user pair and honorary each retain the same UUID across rerun/relink; Failure—duplicate UUID, regenerated UUID, two same-name alumni or roster-only name cannot receive an approved receipt allocation. Evidence `<attemptDir>/task-5-accounting-dues-prd.tap`.
  Commit: Y | `feat(accounting): add durable association member identities`

- [ ] 6. Preserve accounting identity through account deletion
  What to do / Must NOT do: Extend deletion logic so a departing web user only loses the nullable `association_members.user_id` link while cashbook, allocation, rights and audit records remain. Preserve existing cleanup behavior and do not retain Kakao ID/email/phone in accounting tables. Update privacy documentation to distinguish web-account deletion from legally/operationally retained accounting records without inventing an unsupported retention period.
  Parallelization: Wave 1 | Blocked by: 2, 5 | Blocks: 35-40.
  References (executor has NO interview context - be exhaustive): `server/storage.ts:184-223`; `server/account-deletion-storage.test.ts`; `client/src/pages/privacy.tsx:66-67,203-207`; `docs/database-operations.md:202-223`; this plan `association_members` and audit requirements.
  Acceptance criteria (agent-executable): expanded `server/account-deletion-storage.test.ts` proves user links become null, no accounting/dues/audit row is deleted, no dangling nonnullable FK remains, and existing session/Kakao termination behavior is unchanged.
  QA scenarios (name the exact tool + invocation): Happy—delete fixture user and reconcile preserved member/accounting counts; Failure—any source, allocation, snapshot or audit deletion, or residual direct user FK, fails. Evidence `<attemptDir>/task-6-accounting-dues-prd.tap`.
  Commit: Y | `fix(accounting): preserve records when web accounts are deleted`

- [ ] 7. Add the read-only accounting Google Sheets gateway
  What to do / Must NOT do: Extract a reusable injected Sheets client and add `server/accounting-source.ts`. Read only registry-approved spreadsheet IDs, exact tabs/ranges and spreadsheet metadata using the existing service-account readonly scope. Return raw displayed values plus provenance and adapter version; errors/logs expose only source code, counts and hash. Do not embed credentials or full raw rows in responses.
  Parallelization: Wave 2 | Blocked by: 2, 4 | Blocks: 8-13 | Can parallelize with: 21-23.
  References (executor has NO interview context - be exhaustive): `server/google-sheets.ts:8-21,122-198`; `docs/database-operations.md:143-156`; this plan `Source-of-truth inputs` and `accounting_sources`.
  Acceptance criteria (agent-executable): `server/accounting-source.test.ts` verifies registry allowlisting, exact range calls, readonly scope, missing source/tab/range behavior, injected client, timeout/error normalization and PII-safe logs.
  QA scenarios (name the exact tool + invocation): Happy—synthetic client returns a deterministic snapshot with metadata; Failure—unknown spreadsheet ID, missing tab or error containing fake PII yields a blocked PII-free result. Evidence `<attemptDir>/task-7-accounting-dues-prd.tap`.
  Commit: Y | `feat(accounting): add readonly accounting source gateway`

- [ ] 8. Parse the 2022-2025 historical cashbook source
  What to do / Must NOT do: Implement `server/accounting-import/historical-ledger.ts` with explicit adapters for the 2022-2023 and 2024-2025 column orders plus the `회비수입` tab. Normalize displayed timestamps as KST, signed amounts/directions, balance, description, original category and exact import-row provenance. Treat 2022-2023 `회비수입` only as historical labels; for 2024-2025 emit privacy-safe proposed historical receipt/allocation/group records sourced from `source_import_row_id`, with explicit dues year and member-match review. Flag cross-year/anomalous dates rather than silently fixing them.
  Parallelization: Wave 2 | Blocked by: 7 | Blocks: 11 | Can parallelize with: 9, 10.
  References (executor has NO interview context - be exhaustive): `.omo/drafts/accounting-dues-prd.md` historical findings; this plan source ID/tabs and requirements 1-3; `server/fixtures/accounting/` from Todo 4.
  Acceptance criteria (agent-executable): `server/historical-ledger-import.test.ts` table-tests both header layouts, credit/debit signs, balances, carry/transfer/adjustment labels, 2026 payment attributed to dues-year 2025, anomalous 2022 warning, exact row provenance, 2024/2025 receipt/allocation proposals and per-year count/amount totals without creating a pre-2024 policy.
  QA scenarios (name the exact tool + invocation): Happy—valid fixture rows produce canonical records and stable hashes; Failure—missing required header/value, non-integer amount, impossible date or unreviewed cross-year row blocks apply without changing DB. Evidence `<attemptDir>/task-8-accounting-dues-prd.tap`.
  Commit: Y | `feat(accounting): parse historical cashbook sheets`

- [ ] 9. Parse the 2026 Toss and IBK bank sources
  What to do / Must NOT do: Implement separate adapters for `토스뱅크(1/1~3/16)` signed amount rows and `기업은행(3/16~)` separate withdrawal/deposit rows. Parse displayed timestamps as Asia/Seoul regardless of spreadsheet metadata, normalize to direction plus exact bigint KRW/decimal-string wire values, preserve bigint balance-after and masked counterpart information, and validate balance continuity without mutating source or passing money through JavaScript `number`.
  Parallelization: Wave 2 | Blocked by: 7 | Blocks: 11 | Can parallelize with: 8, 10.
  References (executor has NO interview context - be exhaustive): `.omo/drafts/accounting-dues-prd.md` 2026 bank findings; this plan 2026 source ID/tabs; `server/korea-date.ts`; fixture outputs from Todo 4.
  Acceptance criteria (agent-executable): `server/bank-import-adapters.test.ts` verifies KST conversion, signed/separate-column normalization, exact running balance, zero/dual-sided invalid rows, duplicate fingerprints, final Toss zero balance and the exact 2026-03-16 transfer candidate shape.
  QA scenarios (name the exact tool + invocation): Happy—both bank fixtures normalize to one canonical contract and continuous balances; Failure—sheet timezone reinterpretation, both credit/debit populated, non-integer amount or broken balance becomes a blocked issue. Evidence `<attemptDir>/task-9-accounting-dues-prd.tap`.
  Commit: Y | `feat(accounting): parse Toss and IBK bank sheets`

- [ ] 10. Parse privacy-minimized group-payment roster snapshots
  What to do / Must NOT do: Implement `server/accounting-import/group-roster.ts` for the 2024-2026 external-lecturer tabs. Extract only source row, minimal display identity, candidate member ID and proposed amount; drop contact/workplace/address columns before normalized payload persistence. Generate a snapshot hash tied to a specific bank transaction and its eventual receipt; do not auto-approve name matches or create an approved receipt.
  Parallelization: Wave 2 | Blocked by: 7 | Blocks: 11, 24 | Can parallelize with: 8, 9.
  References (executor has NO interview context - be exhaustive): `.omo/drafts/accounting-dues-prd.md` `group-roster-snapshot` and group source findings; this plan group source ID/tabs, `dues_payment_groups`, `dues_group_members`; Todo 5 member-match rules.
  Acceptance criteria (agent-executable): `server/group-roster-import.test.ts` verifies 26-line synthetic group snapshot, stable hash, candidate/unmatched states, amount total, and prohibited PII key/value absence in normalized payload and DTO.
  QA scenarios (name the exact tool + invocation): Happy—26 unique approved candidates produce the expected proposed total; Failure—duplicate member, ambiguous name, roster/bank amount mismatch or PII field blocks approval. Evidence `<attemptDir>/task-10-accounting-dues-prd.tap`.
  Commit: Y | `feat(dues): parse group-payment roster snapshots`

- [ ] 11. Build idempotent import preview planning
  What to do / Must NOT do: Add `server/accounting-import-plan.ts` to canonicalize adapter output, compute SHA-256 source/batch/row fingerprints, compare against stored source rows and bank transactions, and return counts, signed totals, balance discontinuities, duplicates, warnings and blockers. Preview must have zero writes and never return raw PII.
  Parallelization: Wave 2 | Blocked by: 8-10 | Blocks: 12-13, 35-36.
  References (executor has NO interview context - be exhaustive): `server/alumni-sync-plan.ts:129-156,228-273`; `shared/alumni-sync.ts`; `server/alumni-sync-plan.test.ts`; this plan import functional requirements.
  Acceptance criteria (agent-executable): `server/accounting-import-plan.test.ts` proves deterministic fingerprints, zero DB mutation, same-source rerun insert 0, one-cell change produces a different fingerprint, duplicate/balance/required-header blockers and PII-free summary.
  QA scenarios (name the exact tool + invocation): Happy—new and already-applied fixture rows are counted exactly; Failure—stale/malformed/duplicate source returns blocked with no apply plan and no raw values. Evidence `<attemptDir>/task-11-accounting-dues-prd.tap`.
  Commit: Y | `feat(accounting): plan idempotent accounting imports`

- [ ] 12. Apply imports atomically with concurrency protection
  What to do / Must NOT do: Add `server/accounting-import-storage.ts` using a dedicated PostgreSQL advisory xact lock. On apply, reacquire source, recompute fingerprint, reject stale/blocked plans, and insert batch/raw rows/bank transactions or historical entries in one transaction. Approved historical cashbook entries may retain source classifications; 2024-2025 회비수입 rows create only proposed historical-import receipts/allocations/groups tied to exact source rows until member and aggregate review; 2026 bank entries remain unclassified. Never update existing raw/bank rows or auto-approve a member match.
  Parallelization: Wave 2 | Blocked by: 11 | Blocks: 13, 35-36.
  References (executor has NO interview context - be exhaustive): `server/storage.ts:92,1160+` alumni preview/apply pattern; `server/alumni-sync-storage.test.ts:22-42,174-254`; `docs/database-operations.md:143-156`; schema triggers from Todo 2.
  Acceptance criteria (agent-executable): `server/accounting-import-storage.test.ts` on an explicit Development fixture verifies one winner under concurrent apply, stale fingerprint 409-domain error, complete rollback after forced failure, repeat apply adds 0, and immutable update/delete attempts fail.
  QA scenarios (name the exact tool + invocation): Happy—preview/apply persists exact rows and sums once; Failure—concurrent/stale/blocked/trigger-failure leaves no partial batch or transaction. Evidence `<attemptDir>/task-12-accounting-dues-prd.tap`.
  Commit: Y | `feat(accounting): apply source imports atomically`

- [ ] 13. Expose and render the administrator import workflow
  What to do / Must NOT do: Add admin endpoints for source list, preview, apply and batch status under `/api/admin/accounting/imports/*`, then create `/admin/accounting` with an import panel and link it from the existing admin surface. Require `requireAdmin`, strict fingerprint input and fixed PII-free status mapping. UI must show source, adapter version, counts/totals, warnings/blockers and stale re-preview; it must never auto-apply.
  Parallelization: Wave 2 | Blocked by: 12 | Blocks: 37.
  References (executor has NO interview context - be exhaustive): `server/routes.ts:1347-1362,1363-1445`; `server/alumni-sync-routes.test.ts:52-146`; `client/src/pages/admin.tsx:108-180,205-260`; `client/src/pages/admin-alumni-sync-state.ts`; `client/src/App.tsx:64-85`.
  Acceptance criteria (agent-executable): `server/accounting-import-routes.test.ts` covers 401/403/400/409/422/200 and zero writes on rejection; UI contract test confirms route/tab/link, preview-before-apply, disabled blocked apply and no raw data rendering; focused tests exit 0.
  QA scenarios (name the exact tool + invocation): Happy—injected approved preview renders and apply sends only fingerprint; Failure—anonymous/member/stale/blocked cases show Korean errors and zero mutation. Evidence `<attemptDir>/task-13-accounting-dues-prd.tap` plus `<attemptDir>/task-13-accounting-dues-prd.png`.
  Commit: Y | `feat(admin): add accounting import preview and apply`

- [ ] 14. Implement versioned categories, periods and bank-account services
  What to do / Must NOT do: Add `server/accounting-reference.ts` with read/query services for periods, accounts and categories and an idempotent seed runner using Todo 3 data. Enforce KST boundary conversion, nonoverlapping half-open periods/category validity and `open|reconciling|closed` transitions through explicit methods plus DB constraints; do not expose free-text category creation through transaction APIs.
  Parallelization: Wave 3 | Blocked by: 2, 3, 4 | Blocks: 16-20 | Can parallelize with: 15.
  References (executor has NO interview context - be exhaustive): this plan tables `accounting_periods`, `bank_accounts`, `accounting_categories`; `server/category-seed.test.ts`; `server/category-policy.test.ts`; `client/src/pages/about/dues.tsx:132-139`.
  Acceptance criteria (agent-executable): `server/accounting-reference.test.ts` validates exact seeded values, KST period containment at boundary-1ms/boundary/boundary+1ms, idempotency, stable codes and invalid transition rejection.
  QA scenarios (name the exact tool + invocation): Happy—transaction at 2026-02-28 12:38 KST maps to the intended boundary contract; Failure—overlapping period or mutation of a closed category label used in reports is rejected. Evidence `<attemptDir>/task-14-accounting-dues-prd.tap`.
  Commit: Y | `feat(accounting): manage periods accounts and categories`

- [ ] 15. Build a suggestion-only cashbook classifier
  What to do / Must NOT do: Add `server/accounting-classifier.ts` that uses approved historical category mappings, normalized counterparty/summary patterns and direction to return ranked candidates with rule IDs and explanations. It may prefill a draft but must never approve or influence reports/rights without administrator action. Do not add ML/external services.
  Parallelization: Wave 3 | Blocked by: 2, 4 | Blocks: 16-20 | Can parallelize with: 14.
  References (executor has NO interview context - be exhaustive): `.omo/drafts/accounting-dues-prd.md` classification workflow and historical categories; this plan functional requirement 2 and guardrails.
  Acceptance criteria (agent-executable): `server/accounting-classifier.test.ts` verifies deterministic candidate order, direction compatibility, cited rule IDs, ambiguous/no-match handling and always-draft output.
  QA scenarios (name the exact tool + invocation): Happy—known synthetic descriptions yield the expected category candidate; Failure—ambiguous or unseen description returns unclassified, and high confidence still cannot produce approved status. Evidence `<attemptDir>/task-15-accounting-dues-prd.tap`.
  Commit: Y | `feat(accounting): suggest auditable cashbook classifications`

- [ ] 16. Approve single and split cashbook classifications
  What to do / Must NOT do: Add `server/accounting-ledger.ts` transactional services for draft lines, preview and approval. Require positive bigint lines expressed as canonical decimal strings at the API, direction consistency and exact bigint per-bank-transaction sum; historical non-bank carry/adjustment entries require explicit provenance. Use stale-version/idempotency protection and the deferred DB trigger with deterministic row locking. Closed-period direct writes fail.
  Parallelization: Wave 3 | Blocked by: 14-15 | Blocks: 17-20.
  References (executor has NO interview context - be exhaustive): this plan `cashbook_entries` and cross-row invariants; `server/storage.ts:680-683` simple legacy contrast; import output from Todo 12.
  Acceptance criteria (agent-executable): `server/accounting-ledger.test.ts` covers one-line/split approval, values above 32-bit range without precision loss, exact sum, under/over allocation, wrong direction, zero/negative/number-valued amount, stale version, two-session concurrent approval, historical carry and closed-period rejection.
  QA scenarios (name the exact tool + invocation): Happy—30,000 credit splits 20,000+10,000 and becomes reportable exactly once; Failure—29,999/30,001, opposite direction, second approval or direct closed write rolls back. Evidence `<attemptDir>/task-16-accounting-dues-prd.tap`.
  Commit: Y | `feat(accounting): approve balanced cashbook classifications`

- [ ] 17. Match internal transfers without counting income or expense
  What to do / Must NOT do: Add `server/accounting-transfer.ts` to suggest and approve two-leg matches only when accounts differ, directions oppose, bigint amounts equal and each transaction is unused in either debit or credit role. Match the 2026-03-16 Toss debit/IBK credit candidate after admin confirmation. Lock both transaction rows in deterministic ID order and rely on the deferred DB trigger as the final race guard. Reports classify both legs as transfer and net them out.
  Parallelization: Wave 3 | Blocked by: 16 | Blocks: 18-20 | Can parallelize with: 24-27.
  References (executor has NO interview context - be exhaustive): `.omo/drafts/accounting-dues-prd.md` exact transfer finding; this plan `bank_transfer_matches`; synthetic fixture from Todo 4.
  Acceptance criteria (agent-executable): `server/accounting-transfer.test.ts` verifies exact candidate/approval, cross-role transaction uniqueness, KST match window, different-account/opposite-direction/equal-bigint checks, two-session race behavior and report net 0.
  QA scenarios (name the exact tool + invocation): Happy—synthetic Toss→IBK pair links once and remains visible as transfer; Failure—same account/direction, amount mismatch, debit reused as a later credit or concurrent second match rejects with no partial row. Evidence `<attemptDir>/task-17-accounting-dues-prd.tap`.
  Commit: Y | `feat(accounting): match internal bank transfers`

- [ ] 18. Add immutable corrections, reversals and audit events
  What to do / Must NOT do: Add `server/accounting-corrections.ts` to distinguish normal refund/cancellation from false/duplicate/error correction. Corrections append an opposite-sign adjustment with reason, persistent `actor_member_id`, nullable account actor, recorded/effective times, correlation UUID and `corrects/supersedes`; they never change raw rows or approved entries. Audit entity type/id/key is intentionally polymorphic and non-FK, redacted before persistence, size-bounded and immutable. Closed-period financial correction requires an audited reopen or current open-period adjustment; only rights snapshots may backdate through superseding versions.
  Parallelization: Wave 3 | Blocked by: 16-17 | Blocks: 19-20 | Can parallelize with: 24-27.
  References (executor has NO interview context - be exhaustive): `.omo/drafts/accounting-dues-prd.md` `refund-rights-effect`, `correction-retroactivity`; this plan requirements 2, 6, 8 and audit table.
  Acceptance criteria (agent-executable): `server/accounting-corrections.test.ts` proves append-only/acyclic correction chains, persistent actor-member after user deletion, required reason/correlation, redacted bounded payloads, no raw/audit mutation, prospective refund, backdated rights correction and closed-period guard.
  QA scenarios (name the exact tool + invocation): Happy—duplicate payment is corrected with original/superseding/audit rows visible after actor account deletion; Failure—blank reason, over-reversal, cycle, oversized/unredacted JSON, direct UPDATE/DELETE or unapproved closed-period backdate fails. Evidence `<attemptDir>/task-18-accounting-dues-prd.tap`.
  Commit: Y | `feat(accounting): add immutable corrections and audit trails`

- [ ] 19. Reconcile bank balances and enforce the close state machine
  What to do / Must NOT do: Add `server/accounting-reconciliation.ts` and `server/accounting-close.ts`. Compute bigint per-account opening, credits, debits, ending ledger/bank balances and unresolved items; persist only bank/ledger balances and let the DB generated column derive difference. Permit `open→reconciling→closed` only when every transaction is classified/transfer-matched, all receipt allocations are resolved/approved and generated difference is 0. Prevent a transaction from reuse across approved reconciliations through deferred trigger. Reopen only with reason/audit.
  Parallelization: Wave 3 | Blocked by: 16-18 | Blocks: 20, 35-36.
  References (executor has NO interview context - be exhaustive): this plan requirements 3 and `bank_reconciliations`; `docs/database-operations.md:128-141`; `.omo/drafts/accounting-dues-prd.md` `close-state-machine`.
  Acceptance criteria (agent-executable): reconciliation/close tests cover generated difference (including >32-bit balances), balanced close, missing/duplicate/reused item, discontinuity, unclassified/match/receipt-allocation blockers, concurrent close, repeated close, immutable approved reconciliation, closed write and audited reopen.
  QA scenarios (name the exact tool + invocation): Happy—fully resolved synthetic account closes with DB-derived difference 0; Failure—client-supplied difference, reused transaction, each blocker or competing close leaves state unchanged. Evidence `<attemptDir>/task-19-accounting-dues-prd.tap`.
  Commit: Y | `feat(accounting): reconcile accounts and enforce period close`

- [ ] 20. Produce deterministic cashbook, closing and work-queue reports
  What to do / Must NOT do: Add `server/accounting-report.ts` projections for cashbook rows, category income/expense totals, opening/closing balances, transfer exclusion, reconciliation and unresolved queues. Reports use approved current versions only while retaining drill-down to superseded/audit history; no spreadsheet export is required.
  Parallelization: Wave 3 | Blocked by: 19 | Blocks: 33, 37-40.
  References (executor has NO interview context - be exhaustive): this plan requirement 8 report contracts; historical report categories in `.omo/drafts/accounting-dues-prd.md`; `cashbook_entries`, `bank_reconciliations`, `accounting_audit_events`.
  Acceptance criteria (agent-executable): `server/accounting-report.test.ts` matches hand-calculated fixture totals exactly and proves drafts, voided/superseded lines and both internal-transfer legs are excluded from income/expense without disappearing from audit views.
  QA scenarios (name the exact tool + invocation): Happy—opening + approved income - approved expense = closing and bank difference 0; Failure—injecting draft/void/transfer as income causes assertion failure. Evidence `<attemptDir>/task-20-accounting-dues-prd.tap`.
  Commit: Y | `feat(accounting): generate cashbook close and queue reports`

- [ ] 21. Resolve annual role obligations from effective-dated history
  What to do / Must NOT do: Add `server/dues-role.ts`. Insert role intervals transactionally under the DB nonoverlap constraint/trigger. For each member/dues-year/as-of time, select the highest priority from the exact approved policy version among roles effective that year; apply it to January-to-current obligation, include prior approved receipt allocations, and never rewrite earlier snapshots. Demotion/termination cannot lower that year's tier. Unknown roles remain review items.
  Parallelization: Wave 4 | Blocked by: 2, 3, 5 | Blocks: 24-27 | Can parallelize with: 22, 23, 7-13.
  References (executor has NO interview context - be exhaustive): `.omo/drafts/accounting-dues-prd.md` `annual-role-recalculation`, `highest-annual-role-tier`; this plan requirements 5 and `member_role_history`; example: member pays 12,000 Jan-Jun then becomes director.
  Acceptance criteria (agent-executable): `server/dues-role.test.ts` covers concurrent overlapping insert rejection, member→director, director→member, multiple roles, same-rate roles, future role, unknown role, exact policy-version FK and snapshot-before-change preservation.
  QA scenarios (name the exact tool + invocation): Happy—June member paid `12000` then July director resolves required `70000` from the bound policy with paid `12000` and June unchanged; Failure—overlapping/racing role intervals, demotion lowering tier or future role changing earlier status fails. Evidence `<attemptDir>/task-21-accounting-dues-prd.tap`.
  Commit: Y | `feat(dues): resolve highest annual role obligations`

- [ ] 22. Implement effective-dated personal pledge history
  What to do / Must NOT do: Add `server/dues-pledge.ts`. Generate bigint confirmed/unconfirmed defaults, accept canonical decimal-string member amounts, and create nonoverlapping half-open date versions under the DB exclusion/trigger. Later changes start next KST month and do not rewrite prior targets; role changes do not alter pledge amounts.
  Parallelization: Wave 4 | Blocked by: 2, 3, 5 | Blocks: 24-27, 32 | Can parallelize with: 21, 23.
  References (executor has NO interview context - be exhaustive): `.omo/drafts/accounting-dues-prd.md` `member-pledge`, `default-member-pledge`, `prospective-pledge-change`, `pledge-role-independence`; `client/src/pages/onboarding/region.tsx:18-67`.
  Acceptance criteria (agent-executable): `server/dues-pledge.test.ts` verifies bigint wire safety, defaults, confirmation, next-month effect, DB-enforced nonoverlap under two sessions, immutable prior targets, authorization and role independence.
  QA scenarios (name the exact tool + invocation): Happy—member raises `2000`→`5000` on July 27 and new range begins August 1; Failure—numeric/negative value, backdate, concurrent overlap, below-minimum initial pledge or cross-member edit fails. Evidence `<attemptDir>/task-22-accounting-dues-prd.tap`.
  Commit: Y | `feat(dues): preserve versioned personal pledges`

- [ ] 23. Encode dues and burden assessment behavior
  What to do / Must NOT do: Add `server/dues-policy.ts` and `server/dues-assessment.ts`. Resolve bigint thresholds from the latest effective immutable policy version in its single supersession chain; correction appends a later version and never mutates history. Treat burden as 0 unless an explicit approved assessment exists; keep honorary policy 0; reject broken/branching/cyclic policy chains, duplicate logical assessment versions and silent 12× derivation.
  Parallelization: Wave 4 | Blocked by: 2, 3, 5 | Blocks: 24-27 | Can parallelize with: 21, 22.
  References (executor has NO interview context - be exhaustive): this plan requirement 5-7; `.omo/drafts/accounting-dues-prd.md` 2024-2026 policy findings, `current-assessment-policy`, honorary decisions.
  Acceptance criteria (agent-executable): `server/dues-policy.test.ts` table-tests every versioned role/year bigint amount, immutable monotonic supersession/as-of selection, 0 burden default, explicit future burden, honorary behavior, no pre-2024 policy and duplicate/branch/cycle rejection.
  QA scenarios (name the exact tool + invocation): Happy—2026 director resolves `10000`/`200000` and 0 burden from the referenced policy version; Failure—updating approved policy, adding general dues, treating officer dues as burden or missing burden as unpaid fails. Evidence `<attemptDir>/task-23-accounting-dues-prd.tap`.
  Commit: Y | `feat(dues): resolve versioned dues and burden policies`

- [ ] 24. Create receipts and approve individual and group allocations
  What to do / Must NOT do: Add `server/dues-receipt.ts` and `server/dues-allocation.ts`. Idempotently create one immutable receipt from each eligible bank credit, completed legacy payment or 2024-2025 historical 회비수입 row, then allocate it to one or more members and an explicit dues year. Apply the allocation effect matrix and three-way source XOR exactly. Proposed/unmatched rows do not affect rights. Validate stable member UUID, decimal-string bigint IDs/amounts, request UID, remaining amount, group snapshot hash, partial-unique member lines and exact group total. Lock receipt then original allocations deterministically. No provider intent/event/API exists in Phase 1.
  Parallelization: Wave 4 | Blocked by: 11, 21-23 | Blocks: 25-27, 29-34.
  References (executor has NO interview context - be exhaustive): this plan requirements 4 and 6, `dues_receipts`, `dues_payment_groups`, `dues_group_members`, `dues_allocations`; `.omo/drafts/accounting-dues-prd.md` DBA/2025 group/2026-Feb findings; Todo 10 roster parser.
  Acceptance criteria (agent-executable): tests cover bank/legacy/historical-import receipts, UUID/idempotency/three-way XOR, single/split/group, 2024-2025 per-year totals, 26-member fixture, explicit dues-year, unmatched blocking, partial proposal, >32-bit exact sum, over-allocation, duplicate member, stale snapshot, two-session race and approval idempotency; assert no provider table/client/secret.
  QA scenarios (name the exact tool + invocation): Happy—one group bank credit creates one receipt then N allocations whose sum equals gross; Failure—duplicate provenance, ambiguous member, wrong year, sum mismatch, reused remainder, unbacked receipt or concurrent second approval rolls back. Evidence `<attemptDir>/task-24-accounting-dues-prd.tap`.
  Commit: Y | `feat(dues): approve individual and group allocations`

- [ ] 25. Implement allocation reversals, refunds and corrections
  What to do / Must NOT do: Add `server/dues-refund.ts`. Implement the allocation effect matrix exactly: N partial cash refunds use approved debit receipts; one terminal cancellation and one direct factual correction per original use partial unique indexes and no receipt; corrected positive reallocation consumes restored receipt remainder in the same audited correlation. Deferred triggers enforce aggregate refundable remainder, acyclic lineage, request-UID idempotency and deterministic competing-request serialization. Normal effects start next month; verified false/duplicate/error corrections require reason/code and may supersede backdated rights snapshots. Never edit/delete originals.
  Parallelization: Wave 4 | Blocked by: 18, 24 | Blocks: 26-27, 29-34.
  References (executor has NO interview context - be exhaustive): `.omo/drafts/accounting-dues-prd.md` `refund-rights-effect`, `correction-retroactivity`; this plan requirement 6 and `dues_allocations`; Todo 18 audit semantics.
  Acceptance criteria (agent-executable): `server/dues-refund.test.ts` covers multiple partial debit-receipt refunds, terminal cancellation, correction+positive reallocation, exact effect/source/cardinality/sign rules, full/partial bigint remainder, duplicate/concurrent request UID, over-refund, cycle/double reversal, draft rejection, prospective effect and audited backdate.
  QA scenarios (name the exact tool + invocation): Happy—partial debit receipt reduces net paid once and schedules next-month reevaluation; Failure—missing/wrong receipt, over-refund, competing/repeated cancellation, reversal cycle, blank reason or original mutation fails. Evidence `<attemptDir>/task-25-accounting-dues-prd.tap`.
  Commit: Y | `feat(dues): track refunds reversals and corrections`

- [ ] 26. Implement the authoritative dues compliance and rights engine
  What to do / Must NOT do: Add pure `server/dues-entitlement.ts`. Consume only approved receipt-backed/reversal allocations and exact policy versions; calculate all money with bigint, serializing only at DTO boundaries. Calculate January-to-as-of net payments, oldest-month prepayment, pledge/policy cumulative shortfalls, annual completion, burdens, reminder and rights. Preserve the approved timing, honorary, refund and correction rules.
  Parallelization: Wave 4 | Blocked by: 21-25 | Blocks: 27, 29-34.
  References (executor has NO interview context - be exhaustive): this plan requirements 5-7; `.omo/drafts/accounting-dues-prd.md` owner-approved timing, pledge, role, refund and honorary decisions; `server/korea-date.ts`; legacy boundary tests `server/membership-status.test.ts`.
  Acceptance criteria (agent-executable): `server/dues-entitlement.test.ts` uses table-driven KST cases for days 1/10/11/month-end/next-month, Jan rollover, partial/late/prepaid/lump/annual payments, every role, role change, pledge above/below minimum, burden, refund, correction and honorary.
  QA scenarios (name the exact tool + invocation): Happy—monthly and annual examples return exact decimal-string targets, two shortfalls and effective statuses without precision loss; Failure—float/number arithmetic, unapproved receipt, pledge controlling rights, delayed annual effect, immediate refund suspension or rewritten history fails. Evidence `<attemptDir>/task-26-accounting-dues-prd.tap`.
  Commit: Y | `feat(dues): evaluate compliance reminders and member rights`

- [ ] 27. Persist immutable and superseding rights snapshots
  What to do / Must NOT do: Add `server/dues-rights-storage.ts` to create monthly/event-driven snapshots transactionally from Todo 26, retaining exact member, role, pledge and immutable policy-version FKs plus bigint values. Normal reruns are idempotent; allowed changes affect only permitted instants; correction appends a linked superseding snapshot. Never recompute closed history in place.
  Parallelization: Wave 4 | Blocked by: 26 | Blocks: 29-34.
  References (executor has NO interview context - be exhaustive): this plan `dues_status_snapshots`; `.omo/drafts/accounting-dues-prd.md` rights history decisions; Todo 18 correction/audit semantics.
  Acceptance criteria (agent-executable): `server/dues-rights-storage.test.ts` proves idempotency, immutable history, prospective role/refund changes, immediate annual event, backdated correction version, current-as-of selection and atomic audit linkage.
  QA scenarios (name the exact tool + invocation): Happy—querying before/after a role change returns preserved then new snapshots; Failure—UPDATE of prior snapshot, duplicate current version or normal refund backdate is rejected. Evidence `<attemptDir>/task-27-accounting-dues-prd.tap`.
  Commit: Y | `feat(dues): persist versioned rights history`

- [ ] 28. Expose protected accounting operations and reports
  What to do / Must NOT do: Create `server/accounting-routes.ts` and register it from `server/routes.ts`. Provide admin-only endpoints for periods/accounts/categories, classification preview/approve, transfer approve, correction, reconciliation preview/approve, close/reopen, cashbook/closing/work-queue reports and audit drill-down. Every mutation validates stale/idempotency input and actor/reason; responses are redacted.
  Parallelization: Wave 5 | Blocked by: 12, 16-20 | Blocks: 30-31, 33 | Can parallelize with: 29.
  References (executor has NO interview context - be exhaustive): `server/routes.ts:781-815,1325-1362`; `server/auth-middleware.ts`; `server/route-security.test.ts`; Todos 13, 16-20 contracts.
  Acceptance criteria (agent-executable): `server/accounting-routes.test.ts` covers anonymous 401, member 403, strict 400, stale/conflict 409, invariant blocker 422 and success responses; forbidden requests cause zero storage writes and errors/logs contain no raw rows/account identifiers.
  QA scenarios (name the exact tool + invocation): Happy—admin completes classification→transfer/reconcile→close via injected storage exactly once; Failure—member mutation, missing reason, stale version or close blocker returns fixed Korean response and zero writes. Evidence `<attemptDir>/task-28-accounting-dues-prd.tap`.
  Commit: Y | `feat(accounting): expose protected accounting operations`

- [ ] 29. Expose administrator and self-service dues APIs
  What to do / Must NOT do: Create `server/dues-routes.ts`. Admin endpoints manage member matches, roles, immutable policy versions/assessments, receipt/allocation preview/approve, group snapshots, refunds/corrections and rights history. Self endpoints are exactly `GET /api/dues/me/status`, `GET /api/dues/me/payments`, `GET/PUT /api/dues/me/pledge`; derive identity only from `req.session.userId`, never accept another member ID. Serialize every exposed new bigint PK/FK/money/balance/aggregate as a canonical decimal string and reject JSON numbers for any such input.
  Parallelization: Wave 5 | Blocked by: 24-27 | Blocks: 30-34 | Can parallelize with: 28.
  References (executor has NO interview context - be exhaustive): `server/routes.ts:781-793,1325-1362`; `server/membership-status.test.ts`; `server/route-security.test.ts`; this plan API contract and Todos 21-27.
  Acceptance criteria (agent-executable): `server/dues-routes.test.ts` verifies admin 401/403/strict body/stale/invariant errors, self 401/session binding, no cross-user surface, UUID validation, decimal-string serialization for every new bigint field, JSON-number rejection for IDs and amounts, raw receipt/source redaction, pledge next-month response, and receipt/allocation/refund/rights-history success.
  QA scenarios (name the exact tool + invocation): Happy—member sees only own exact targets/payments/status and updates future pledge; Failure—query/body user ID cannot change identity, member admin mutation and malformed allocation produce zero writes. Evidence `<attemptDir>/task-29-accounting-dues-prd.tap`.
  Commit: Y | `feat(dues): expose administration and member APIs`

- [ ] 30. Build the administrator cashbook and reconciliation interface
  What to do / Must NOT do: Add `client/src/pages/admin-accounting.tsx` and focused components under `client/src/components/accounting/` for transaction queue, suggestion rationale, split classification, transfer match, corrections, reconciliation, close/reopen blockers and cashbook/closing reports. Preserve mobile-first patterns and make every destructive/closing action explicit; do not auto-approve or render raw PII.
  Parallelization: Wave 5 | Blocked by: 28-29 | Blocks: 37 | Can parallelize with: 31.
  References (executor has NO interview context - be exhaustive): `client/src/pages/admin.tsx:183-260`; `client/src/App.tsx:64-85`; `client/src/components/ui/{table,dialog,alert-dialog,tabs,badge}.tsx`; Todos 13, 20, 28.
  Acceptance criteria (agent-executable): `server/admin-accounting-ui-contract.test.ts` verifies route/nav, admin gating, each state/action, confirmation dialogs, blocker text, no raw contact/account display and accessible labels; TypeScript check passes.
  QA scenarios (name the exact tool + invocation): Happy—browser fixture completes import queue→split classification→transfer→reconcile→report; Failure—sum mismatch/stale/blocked close remains disabled with Korean explanation and no mutation. Evidence `<attemptDir>/task-30-accounting-dues-prd.png` and `.md`.
  Commit: Y | `feat(admin): add cashbook reconciliation and close UI`

- [ ] 31. Build the administrator dues and member-matching interface
  What to do / Must NOT do: Add components for unmatched candidates, member/role history, policy/assessment version display, individual/group receipt allocation, roster snapshot, refund/correction, pledge comparison and rights history. Show receipt gross/remaining versus proposed/approved totals using lossless decimal strings and prevent approval when unresolved or unequal. Never render roster contact/workplace/address or raw receipt payloads.
  Parallelization: Wave 5 | Blocked by: 28-29 | Blocks: 37 | Can parallelize with: 30.
  References (executor has NO interview context - be exhaustive): `client/src/pages/admin.tsx:211-260`; this plan requirements 4-8 and admin API; Todo 10 group snapshot and Todos 21-27.
  Acceptance criteria (agent-executable): `server/admin-dues-ui-contract.test.ts` asserts all states, role/pledge separation, group sum indicator, unmatched blocker, refund/correction distinction, immutable history view and privacy exclusion.
  QA scenarios (name the exact tool + invocation): Happy—admin approves a matched group whose sum equals credit and sees rights impact; Failure—duplicate/ambiguous member, sum mismatch or correction without reason prevents submit and sends zero mutation. Evidence `<attemptDir>/task-31-accounting-dues-prd.png` and `.md`.
  Commit: Y | `feat(admin): add dues allocation and rights UI`

- [ ] 32. Add pledge confirmation to joining and later profile changes
  What to do / Must NOT do: Add `/onboarding/dues-pledge` after region onboarding for newly created members, update `App.tsx`, Kakao callback/onboarding routing and auth DTOs, and add a profile pledge-change form. New members must confirm at least the current role minimum; existing members receive a confirmed migration default and are not redirected. Later valid changes display the exact next KST effective date.
  Parallelization: Wave 5 | Blocked by: 5, 22, 29 | Blocks: 37 | Can parallelize with: 30, 31.
  References (executor has NO interview context - be exhaustive): `client/src/pages/onboarding/region.tsx:18-67`; `client/src/pages/kakao-callback.tsx`; `client/src/hooks/use-auth.tsx:32-74`; `client/src/App.tsx:25-70,131-148`; `server/routes.ts:657+`; Todo 22.
  Acceptance criteria (agent-executable): route/onboarding tests verify new auto-matched and admin-approved users cannot bypass unconfirmed pledge, existing migration users are not trapped, returnTo survives both steps, invalid/below-minimum input is rejected, and later edit becomes next-month version.
  QA scenarios (name the exact tool + invocation): Happy—new member completes region then accepts/raises pledge and reaches returnTo; Failure—skip URL, below-minimum pledge, stale role minimum or duplicate submit cannot complete onboarding. Evidence `<attemptDir>/task-32-accounting-dues-prd.png` and `.tap`.
  Commit: Y | `feat(onboarding): collect and version monthly dues pledges`

- [ ] 33. Replace the member profile and public terminology with policy-based status
  What to do / Must NOT do: Replace fixed `ANNUAL_DUES`/calendar-year presentation with the self API. Update `profile.tsx`, `membership-badge.tsx`, public dues/join copy and any remaining current `일반회원` references. Format decimal-string bigint values without number coercion; show pledge, role minimum, cumulative targets, approved receipt allocations, two shortfalls, reminder, annual completion, effective date and history; explain rights suspension without blocking login.
  Parallelization: Wave 5 | Blocked by: 20, 28-29 | Blocks: 37 | Can parallelize with: 30-32.
  References (executor has NO interview context - be exhaustive): `client/src/pages/profile.tsx:32-76,110,147-240`; `client/src/components/membership-badge.tsx`; `client/src/pages/about/dues.tsx:28-75,82-139`; `client/src/pages/about/join.tsx:48-83`; `shared/schema.ts:355-370`.
  Acceptance criteria (agent-executable): `server/member-dues-ui-contract.test.ts` proves no current `일반회원/정회원/준회원`, correct rights/member/honorary states, numeric separation of pledge vs policy, annual/immediate and reminder copy, and no login-disable wording; `npm run check` passes.
  QA scenarios (name the exact tool + invocation): Happy—browser fixtures show rights member, suspended member and honorary with exact fields; Failure—pledge shortfall alone labels rights suspended or historical term appears in current UI fails. Evidence `<attemptDir>/task-33-accounting-dues-prd.png` and `.tap`.
  Commit: Y | `feat(profile): show policy-based dues and rights status`

- [ ] 34. Migrate legacy payments and cut over reads without double counting
  What to do / Must NOT do: Add `scripts/migrate-legacy-payments.ts` with `--dry-run` default and explicit `--apply`, mapping each eligible legacy row to exactly one unique legacy-provenance `dues_receipts` row and one or more reviewed allocations; ambiguous/orphan/ineligible rows become review issues. Convert integer legacy amounts losslessly to bigint. Preserve failed/pending/other rows without rights. After verified backfill, cut reads to the receipt/allocation engine, retire old POST with fixed 410, and retain `payments`.
  Parallelization: Wave 5 | Blocked by: 27, 29 | Blocks: 35-40.
  References (executor has NO interview context - be exhaustive): `shared/schema.ts:82-91,271-274,355-370`; `server/storage.ts:669-706`; `server/routes.ts:1325-1357`; `server/membership-status.test.ts`; `server/account-deletion-storage.test.ts`; `docs/database-operations.md:128-141`.
  Acceptance criteria (agent-executable): migration test verifies dry-run zero writes, exact counts/bigint sums, receipt+allocation transaction rollback, unique legacy provenance, rerun 0, orphan preservation and no double count; compatibility routes pass.
  QA scenarios (name the exact tool + invocation): Happy—eligible completed legacy row appears once as receipt+allocation with unchanged total; Failure—duplicate receipt, failed/ambiguous rights, precision loss, rerun duplicate, old POST write or orphan deletion fails. Evidence `<attemptDir>/task-34-accounting-dues-prd.tap` and `.json`.
  Commit: Y | `refactor(dues): migrate legacy payments and cut over rights reads`

- [ ] 35. Run the complete code-level verification gates in Replit
  What to do / Must NOT do: From the Replit Development workspace, run every focused accounting/dues test plus the complete suite, type check, production build and diff whitespace check. Record actual commands, exit codes, skipped tests and final commit SHA. Do not substitute local Mac tools or a prior green log.
  Parallelization: Wave 6 | Blocked by: 6, 13, 20, 30-34 | Blocks: 36-40.
  References (executor has NO interview context - be exhaustive): project `AGENTS.md` Environment/Verification rules; `package.json:6-11`; this plan Verification strategy.
  Acceptance criteria (agent-executable): on Replit, `npm test`, `npm run check`, `npm run build`, and `git diff --check` each exit 0; no relevant test is skipped except a documented environment-gated integration test that is run in Todo 36.
  QA scenarios (name the exact tool + invocation): Happy—all logs identify command, working directory, exit code and SHA; Failure—nonzero, misleading empty test run, unexpected skip or stale SHA blocks later waves. Evidence `<attemptDir>/task-35-accounting-dues-prd.md` plus `.log` files.
  Commit: N | verification only

- [ ] 36. Apply and verify the additive schema in the Development Database
  What to do / Must NOT do: Through Replit SSH, verify non-production `heliumdb` and Todo 1's committed baseline/capability hashes. Compare `npm run db:push` intent if useful but apply only the exact Todo-2 reviewed additive SQL variant with recorded SHA-256, `lock_timeout` and `statement_timeout`; separately run idempotent seed/member backfill transactions. Then execute Todo 34's legacy migration `--dry-run → --apply → --dry-run` and require the last run to propose 0 new rows; record eligible/orphan/ineligible/status counts and bigint sums, plus forced rollback evidence. Through a fresh connection verify all relational/manual objects, ACL/RLS stance, bigint/UUID defaults, seed/backfill hashes, orphan/duplicate checks and counts. Never connect to Production.
  Parallelization: Wave 6 | Blocked by: 35 | Blocks: 37-40.
  References (executor has NO interview context - be exhaustive): project `AGENTS.md`; `docs/database-schema.md`; `scripts/database-schema-catalog.sql`; `docs/database-operations.md`; `server/alumni-sync-storage.test.ts:44-260`; Todos 2-6; reviewed migration SHA artifact.
  Acceptance criteria (agent-executable): evidence identifies DB/version, baseline commit/hash, migration variant/SHA, pre/post catalog+aggregates, lock settings, trigger definitions/config, owners/ACL/grants/RLS stance, seed/member/legacy backfill hashes and fresh-connection verification; legacy eligible/orphan/status count+sum reconcile and rerun is 0; all integration/concurrency tests run unskipped; no unrelated row loss.
  QA scenarios (name the exact tool + invocation): Happy—reviewed schema/seed/member/legacy backfill applies once, every second data run is no-op, catalog diff matches declared objects; Failure—wrong DB, SQL SHA drift, timeout/capability mismatch, missing manual object/FK index, legacy double count/orphan loss, precision error or forced race aborts with verified rollback. Evidence `<attemptDir>/task-36-accounting-dues-prd.json` and `.tap`.
  Commit: N | Development database operation only

- [ ] 37. Preview and apply the approved live sources to Development
  What to do / Must NOT do: Register only the three approved Google Sheets, perform read-only previews, capture adapter versions/fingerprints/counts/signed bigint totals/warnings, and apply raw/historical source data to Development after blockers resolve. Import 2026 bank transactions as unclassified. Materialize 2024-2025 회비수입 and group sources as historical-import receipts plus proposed allocations with exact source-row provenance and per-year totals; create member/group candidates but never auto-approve ambiguous matches. Identify the 2026-03-16 transfer candidate. Re-run each source to prove 0 additional rows. Never read KIK files.
  Parallelization: Wave 6 | Blocked by: 13, 20, 30-36 | Blocks: 38-40.
  References (executor has NO interview context - be exhaustive): this plan `Source-of-truth inputs`, import requirements and guardrails; `docs/database-operations.md:143-156`; Todos 7-13.
  Acceptance criteria (agent-executable): source-by-source preview/apply/repreview evidence proves exact row and aggregate reconciliation, 2024/2025 historical receipt/allocation count+sum by dues year, idempotent 0-row repeat, no duplicate bank/source provenance, no auto-approved ambiguous/group match, and expected transfer candidate. Real raw rows/PII are absent from artifacts.
  QA scenarios (name the exact tool + invocation): Happy—three sources apply atomically with expected unresolved queues and stable second preview; Failure—source drift, balance break, duplicate, PII leak or KIK access blocks apply and preserves pre-counts. Evidence `<attemptDir>/task-37-accounting-dues-prd.json` and `.md`.
  Commit: N | Development data operation only

- [ ] 38. Perform real Development browser QA across all roles and failures
  What to do / Must NOT do: Use the in-app browser at `https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev`. With isolated Development fixtures, exercise anonymous/member/admin access, import preview, classification split, transfer, member match, individual/group allocation, refund/correction, reconciliation/close blocker/success, reports, onboarding pledge, pledge update and profile rights states. Capture console/network errors and clean up only fixture rows.
  Parallelization: Wave 6 | Blocked by: 37 | Blocks: 39-40.
  References (executor has NO interview context - be exhaustive): project `AGENTS.md` development browser rule; `client/src/App.tsx`; `client/src/pages/admin.tsx:183-260`; `client/src/pages/profile.tsx`; Todos 13, 28-33.
  Acceptance criteria (agent-executable): all named scenarios are observed in the rendered UI; unauthorized mutation requests are 401/403 with zero writes; sum/close blockers are visible; profile displays exact computed fields; console/page errors are 0; fixture cleanup count is 0 residue.
  QA scenarios (name the exact tool + invocation): Happy—admin and member end-to-end paths show persisted results after reload; Failure—anonymous/member admin access, mismatch approval, closed write and cross-user attempt remain blocked. Evidence `<attemptDir>/task-38-accounting-dues-prd.md` and screenshots.
  Commit: N | browser QA only

- [ ] 39. Finalize operations, privacy and production-readiness documentation
  What to do / Must NOT do: Update `docs/database-schema.md`, `scripts/database-schema-catalog.sql`, `docs/database-operations.md`, `docs/accounting-dues.md`, privacy copy and production rollout checklist. Record the exact Development post-schema catalog, all new FK/delete/index/check/exclusion/trigger/grant objects, receipt boundary, UUID/bigint wire contract and chosen `btree_gist` path. Document source registry, backup/snapshot identifier procedure, restore drill with RPO/RTO, lock monitoring, immutable records, account deletion, audit access/retention as policy-pending, close/reopen, resumable backfill checkpoints, aggregate reconciliation and rollback. Prepare SHA-pinned Production SQL commands with variable names only; do not run them, access Production, modify Secrets/import data or Republish.
  Parallelization: Wave 6 | Blocked by: 35-38 | Blocks: 40.
  References (executor has NO interview context - be exhaustive): project `AGENTS.md`; current schema baseline commit `0e299abce9509456de0e8bfe224cb7ef392228d8`; `docs/database-schema.md`; `scripts/database-schema-catalog.sql`; `docs/database-operations.md`; privacy page; this plan guardrails.
  Acceptance criteria (agent-executable): documentation contract test confirms exact object counts derive from post-migration catalog, EXCLUDE/constraint-trigger coverage, Development/Production separation, read-only Production preflight, snapshot+restore evidence requirement, migration SHA/timeout/rollback/orphan/sum checks, server-only grants or explicit RLS rationale, new approval gate, no secret/unsupported retention claim.
  QA scenarios (name the exact tool + invocation): Happy—an agent can perform Development revalidation and prepare a no-write Production diff/restore checklist without guessing; Failure—112/113 inconsistency, omitted exclusion/trigger, blind db:push, implicit production write, missing backup/restore, secret/KIK/unverified Republish/deletion instruction fails. Evidence `<attemptDir>/task-39-accounting-dues-prd.tap`.
  Commit: Y | `docs(accounting): document operations privacy and rollout`

- [ ] 40. Re-run final gates and publish the evidence manifest
  What to do / Must NOT do: After the last commit, re-run full Replit gates, verify the Development catalog/data through a new connection, including migration SHA, 22 new-table contract, bigint/UUID, FK/index, exclusion/fallback, trigger/routine, receipt/allocation and orphan/sum checks; repeat browser smoke and write a manifest binding evidence to the exact commit. Record Production catalog as still unverified unless a separately authorized read-only check occurred, and Production data/schema as unchanged. Do not claim from summaries or stale logs.
  Parallelization: Wave 6 | Blocked by: 35-39 | Blocks: Final verification wave.
  References (executor has NO interview context - be exhaustive): this plan Verification strategy and Success criteria; project `AGENTS.md` Verification/Reporting rules.
  Acceptance criteria (agent-executable): manifest lists exact SHA, command/exit codes, Development DB identity and aggregate checks, browser URLs/scenarios, artifact paths, no PII, and explicit `Production Database: unchanged`, `Republish: not performed`; all gates exit 0.
  QA scenarios (name the exact tool + invocation): Happy—manifest hashes and referenced artifacts verify at current SHA; Failure—missing/stale/mismatched artifact, nonzero command, wrong DB or production mutation blocks final reviewers. Evidence `<attemptDir>/task-40-accounting-dues-prd-manifest.json`.
  Commit: N | final verification only

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
  Verify every PRD/DBA decision, all 22 new logical tables, source/receipt/allocation/API/UI contracts, baseline commit, migration SHA, guardrails and evidence row against implementation. Reject missing bigint/UUID/FK/EXCLUDE-trigger/catalog requirements, KIK access, provider implementation, unsupported Production claims or prose-only criteria. Evidence `<attemptDir>/final-F1-plan-compliance.md`.

- [ ] F2. Code quality and security review
  Audit bigint wire safety, UUID immutability, every FK delete/index policy, transactions/row-lock ordering/advisory locks, named checks, EXCLUDE/fallback/deferred triggers, generated reconciliation difference, append-only enforcement, server-only grants/RLS rationale, authorization, PII/redaction/payload bounds, account deletion, idempotency and migration/restore rollback. Run focused DB concurrency tests at the manifest SHA. Evidence `<attemptDir>/final-F2-quality-security.md`.

- [ ] F3. Real manual QA
  Independently repeat the Development browser happy and failure journeys for admin/member/anonymous, including actual persistence after reload, console/network inspection, responsive layout and fixture cleanup. No grep-only or mocked-page substitute. Evidence `<attemptDir>/final-F3-manual-qa.md` and screenshots.

- [ ] F4. Scope fidelity and accounting-number audit
  Reconcile source preview/apply counts and bigint amounts, receipt provenance/gross/remaining, cashbook split sums, transfer net 0, group/refund totals, immutable policy versions, rights timelines, generated bank difference, reports and legacy receipt backfill; confirm no precision loss, duplicate provenance, double-entry UI, provider API/webhook, arbitrary XLSX or Production work slipped in. Evidence `<attemptDir>/final-F4-scope-numbers.md`.

## Commit strategy

- Keep implementation and its focused tests in the same atomic commit; use the Commit line in each todo as the intended boundary.
- Never stage `.omo/` planning/evidence artifacts unless the repository convention explicitly tracks them; never stage the ignored KIK files or unrelated user changes.
- Before each commit run the focused tests for that todo and `git diff --check`; before handoff run the full Todo 40 gates.
- Suggested sequence: contracts → schema → seeds/fixtures → member lifecycle → import gateway/adapters/plan/apply/UI → cashbook/transfer/correction/reconciliation/report → dues role/pledge/policy/allocation/refund/rights → APIs/UI/onboarding → legacy cutover → docs.
- Database operations and browser QA do not create commits; their evidence is bound to the most recent code SHA.

## Success criteria

- All 40 implementation todos and F1-F4 have terminal evidence; every final verifier returns APPROVE and the user gives the final explicit okay.
- `npm test`, `npm run check`, `npm run build`, and `git diff --check` exit 0 in Replit at the exact final SHA.
- Development Database has the exact reviewed additive migration SHA, all 22 new logical tables, bigint/UUID contracts, explicit FK/delete/index policy, named checks, EXCLUDE-or-trigger temporal enforcement, cross-row/immutability triggers, generated reconciliation difference, required seeds, no unintended row loss, and idempotent backfills/imports.
- Historical/live Development import reconciliation matches source counts and signed totals; raw bank rows remain immutable and 2026 unclassified items remain visibly pending rather than guessed.
- Every approved receipt has unique provenance; receipt allocations/refunds never exceed gross/refundable remainder; cashbook/group splits reconcile exactly; the 2026-03-16 transfer nets to 0; a fully resolved period closes only at DB-generated bank difference 0.
- Policy tests prove 2024-2026 amounts, pledge/policy separation, highest annual role tier, KST timing, immediate annual rights, prospective refund suspension, backdated error correction and honorary behavior.
- Admin, member and anonymous browser flows work on the Development homepage with no console/page errors, cross-user exposure or unauthorized writes.
- Existing payments and account-deletion history are preserved; stable member UUIDs survive account/roster relink; legacy rows become unique receipt+allocation provenance without double counting.
- Evidence/logs contain no real PII, raw source rows, full account identifiers or Secrets.
- `docs/database-schema.md` and metadata catalog agree on exact post-migration counts and include EXCLUDE/constraint-trigger coverage; the historical 112/113-column discrepancy is resolved with recorded catalog evidence.
- Production Database, Replit Secrets, published application and production data remain unchanged until a separate explicit authorization; Production remains schema-unverified unless a separately authorized read-only catalog was completed and recorded.
