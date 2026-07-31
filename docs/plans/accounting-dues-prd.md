# Accounting and dues product contract

## Status and authority

This tracked plan is the product-facing handoff for the approved database architecture. Its former physical-schema proposal and implementation todo list are superseded. Product behavior remains in scope, but every physical object, dependency, action, lock, source binding, migration sequence and catalog expectation is owned by the canonical database architecture plan and its sole expanded manifest.

- Canonical manifest: `docs/database-manifest.yaml`
- Manifest SHA-256: `ea8f0d484b99cf93ffb51f11681e5f62e4474f5bbac1735286f1173c0132e785`
- Manifest-containing Todo 2 commit: `47a9cf63545371ea258fc1c2264acf531fe5facf`
- Architecture authority: [database-architecture-audit.md](database-architecture-audit.md)

No table count in this document is executable. Object inventory, schema ownership, FK/delete/index rules, actor/action registries, lock ordering, artifacts and rollout predicates are read from the canonical manifest bytes above. A different schema list, generated inventory or migration outline is not an implementation input.

## Product outcome and boundaries

The system preserves single-entry cashbook operation while importing finalized ledger evidence and bank transactions without loss, supports reviewed income/expense classification, member dues allocation, bank reconciliation, period close and immutable audit history, and lets a member distinguish pledge, policy obligation, paid total, shortfalls and current rights status.

The first release does not introduce double-entry bookkeeping, arbitrary file upload, payment-provider API/webhook/automatic payment, automatic bank connection, automatic business approval, Production mutation or Republish. Browser clients use authenticated server APIs and never receive a database credential. Raw contact, address, workplace, complete bank identifier, credential and unrelated source payload are outside the accounting persistence and evidence boundary.

## Superseding architecture contracts

### Authority and actors

Every business mutation is authorized against a live `users.id` at decision time. The database records the exact actor scope plus immutable user UID/display snapshots; a nullable association-member link is context, never the authorization identity. Account deletion may null declared actor FKs only through the closed account-delete operation and preserves immutable snapshots, financial provenance and audit history. Schema bootstrap alone uses a non-person executor identity.

### Durable identity

Web accounts, alumni roster rows and association members are separate identities connected by nullable reviewed links. Association members retain stable internal and UUID identities across signup, roster relink and account deletion. Name-only evidence never approves a match. Match cases, candidates and identity-link changes remain source-bound, versioned and auditable.

### Logical sources and immutable versions

A logical source keeps one stable identity across adapter releases. Release bytes bind the adapter, normalized schema, normalization implementation, mapping table and mapping approval receipt. Source coordinates and immutable row versions are separate; identical content may be reused, while changed content creates a successor or blocker. An import batch links exact row versions and never overwrites source evidence.

Authority is explicit: finalized ledger evidence outranks bank and legacy compatibility evidence for economic-event meaning; bank evidence remains authoritative for bank transaction facts; roster, role, period-boundary, policy and publication sources have only their declared non-economic roles. Mapping approval authorizes deterministic parsing, not a business decision.

### Organizational role overlap and dues derivation

Organizational assignments may overlap. Primary, branch and class assignments remain distinct versioned facts with source appointment date separate from effective interval. The 21st administration ends at the AGM36 close instant `2026-02-28T12:38:00+09:00`; the 22nd source appointment facts and effective boundary are retained separately.

Every director display role maps to the director dues tier. Branch and class roles are concurrent secondary facts and add no dues obligation. General assembly chair is an independent position; its unapproved 2026 policy candidate uses monthly KRW 30,000 and annual KRW 400,000. A dues tier is derived only from the complete approved policy/mapping set and is versioned independently from assignments. Draft policy produces preview only and persists no tier or rights row.

### Economic-event identity and provenance

Logical source coordinates create source-unique claims. A canonical economic event may have multiple provenance rows, but each source coordinate has one claim path and financial children bind only to a non-rejected canonical root. Equal or conflicting candidates create a durable collision. Childless proposed duplicates may be resolved only by the registered reject-duplicate, create-canonicalization and resolve-collision operation; events with financial children remain quarantined for an approved correction workflow.

Receipts are provider-neutral funding records. Cashbook category splits, receipt gross/reversal values and dues allocations obey the manifest's mutually exclusive payment, cancellation and refund equations. Corrections append successors or reversals and never rewrite approved source, financial or audit rows.

### Period reconciliation and close

Accounting periods use authoritative source-bound half-open intervals. A period can enter reconciliation only after current releases and applied batches cover every overlapping source interval. Close requires zero unresolved source decision, member allocation, collision, proposed financial row, reconciliation difference and carryforward blocker. Reopen and re-close append audited state and reconciliation successors; a closed row is not edited in place.

### Rollout and recovery

Rollout order is expand → capability/catalog preflight → ordinary artifact → manual variant → verify → backfill → compatibility comparison → explicit cutover. An artifact and ledger row commit atomically. Failure rolls back only the current transaction and resumes forward from the first missing sequence. Earlier additive objects remain inert until cutover. Post-cutover inconsistency uses feature-read rollback or an additive forward fix; destructive contraction is outside this plan.

## Dues amount and rights contract

`monthly_minimum` and `annual_minimum` are independent policy inputs. Neither value is calculated from the other. The persisted and displayed monthly target, annual target, personal monthly pledge, paid total, policy shortfall and pledge shortfall remain distinct values.

- Formal dues policy begins with dues year 2024; earlier ledger labels remain historical evidence only.
- Officer policy amounts are total dues obligations and do not add a separate ordinary-member amount.
- A member's confirmed pledge does not set the rights threshold and a position change does not rewrite that pledge.
- A complete annual payment grants rights immediately for every applicable tier.
- Ordinary cancellation or refund affects rights at the next KST month boundary; proven source error may use the audited original effective instant.
- Current special-assessment liability is zero until an approved policy creates a versioned liability.
- Honorary membership is a distinct member kind and does not become rights membership through payment.

## Owner-decision traceability

Every owner-approved input retained from the prior product plan or added by the architecture correction appears exactly once below. “Authority” names the controlling contract, not a second schema definition.

| Decision ID | Preserved decision | Authority |
|---|---|---|
| `bookkeeping-basis` | Phase 1 remains a single-entry cashbook rather than mandatory double-entry bookkeeping. | Product boundary contract |
| `transaction-allocation` | Funding transactions and member-level dues allocations remain separate one-to-many records. | Receipt/allocation contract |
| `period-separation` | Transaction instant, AGM accounting period and January dues year are separate axes. | Period and source-boundary contract |
| `membership-monthly-current` | Monthly compliance uses the current cumulative target while rights change at the defined month boundary. | Rights evaluation contract |
| `dues-policy-table` | Monthly and annual minima are independently stored policy inputs. | Dues policy contract |
| `compliance-vs-rights` | Reminder/compliance state and rights state are separate outputs. | Rights evaluation contract |
| `dues-start-year` | Formal dues obligation begins in 2024. | Policy seed contract |
| `role-tier-replacement` | Officer-tier amount is the total obligation, without an added member amount. | Policy/mapping contract |
| `rights-not-member-type` | Rights membership is an evaluated status, not the base member kind. | Member/rights contract |
| `legacy-member-labels` | Historical labels remain source evidence and are not current enums. | Compatibility contract |
| `honorary-dues-policy` | Current honorary dues and assessment amounts are zero pending approved policy. | Policy seed contract |
| `member-pledge` | Pledge, policy obligation and rights threshold remain distinct. | Pledge/rights contract |
| `annual-role-recalculation` | A higher applicable tier changes future evaluations without rewriting prior snapshots. | Tier-history contract |
| `default-member-pledge` | Activation creates a policy-bound default pledge when one is missing. | Annual activation contract |
| `prospective-pledge-change` | A pledge successor starts on a later first day of month. | Pledge version contract |
| `highest-annual-role-tier` | The approved highest-priority applicable mapping selects the annual tier. | Tier derivation contract |
| `refund-rights-effect` | Ordinary negative effects begin at the next month boundary. | Allocation/rights contract |
| `correction-retroactivity` | Proven error correction may retain the original effective instant with audit evidence. | Correction contract |
| `pledge-role-independence` | Position changes do not mutate personal pledge history. | Pledge/position contract |
| `annual-payment-immediate-rights` | Annual completion grants immediate rights independent of tier. | Rights evaluation contract |
| `association-member-uuid` | Association members retain internal identity and stable UUID identity. | Identity contract |
| `bigint-decimal-wire` | New bigint IDs and KRW values cross external JSON as canonical decimal strings. | Type/wire contract |
| `provider-neutral-receipt` | Phase 1 receipts are provider-neutral and allocations remain separate children. | Receipt contract |
| `server-only-db-boundary` | Server authorization is the application boundary; RLS remains explicitly disabled in this topology. | Security contract |
| `agm36-close` | The 21st term and new accounting boundary meet at the exact AGM36 close instant. | Period boundary contract |
| `appointment-effective-separation` | Source appointment date and effective interval remain separate facts. | Position/source contract |
| `overlapping-organizational-roles` | Primary, branch and class positions may coexist. | Position assignment contract |
| `director-tier-map` | Every approved director display position maps to the director tier. | Position mapping contract |
| `secondary-role-no-dues` | Branch/class secondary roles do not add an obligation. | Position mapping contract |
| `assembly-chair-position-tier` | General assembly chair is distinct and the draft candidate is 30,000 monthly / 400,000 annual. | Position and draft-policy contract |
| `logical-source-stability` | Logical source identity survives immutable release changes. | Source registry contract |
| `source-coordinate-versioning` | Coordinates have immutable content-version chains. | Source row contract |
| `economic-event-canonical-root` | Multiple evidence rows converge only through claims, collisions and reviewed canonicalization. | Economic-event contract |
| `close-completeness` | Unresolved source, financial, reconciliation or carry state blocks close. | Close contract |
| `additive-forward-rollout` | Releases resume forward and never reverse applied ledger bytes destructively. | Rollout contract |

## Execution and verification handoff

Implementation proceeds only through the database architecture plan's dependency graph. Static plan verification checks the manifest binding, this complete traceability table, the absence of obsolete executable schema assumptions, independent monthly/annual inputs and the empty attestation gate. Runtime, database and browser verification remain assigned to their architecture tasks; this document does not authorize a DB, source, Production or deployment mutation.

The following empty byte-delimited gate may be populated only by A1 after F1–F4 approve the same frozen implementation and the owner supplies the required platform-bound approval. No other marker pair is permitted.

<!-- ARCHITECTURE_ATTESTATION_GATE_BEGIN v1 -->
<!-- ARCHITECTURE_ATTESTATION_GATE_END v1 -->
