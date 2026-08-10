import { mkdirSync, writeFileSync } from "node:fs";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";

const observedAt = "2026-08-10T04:53:48Z";
const profileDir = "docs/source-contracts/profiles";
const mappingDir = "docs/source-contracts/mappings";
const approvalDir = "docs/source-contracts/approvals";

type JsonObject = Record<string, CanonicalValue>;

function canonicalFile(value: CanonicalValue): string {
  return `${canonicalJson(value)}\n`;
}

function withSelfHash(value: JsonObject): JsonObject {
  return { ...value, profile_sha256: sha256(canonicalJson(value)) };
}

function withReceiptHash(value: JsonObject): JsonObject {
  return { ...value, receipt_sha256: sha256(canonicalJson(value)) };
}

function writeJson(path: string, value: CanonicalValue): string {
  const bytes = canonicalFile(value);
  writeFileSync(path, bytes);
  return sha256(bytes);
}

function profile(input: {
  sourceCode: string;
  locator: string;
  revision: string;
  surface: string;
  databaseColumns?: string[];
  tabs?: CanonicalValue[];
}): JsonObject {
  return withSelfHash({
    database_columns: input.databaseColumns ?? [],
    locator: input.locator,
    observed_at: observedAt,
    schema_version: "source-profile-v1",
    source_code: input.sourceCode,
    source_revision: input.revision,
    surface: input.surface,
    tabs: input.tabs ?? [],
  });
}

function column(targetField: string, recordKind: string, parserCode: string, sourceSelector: CanonicalValue, required = true): JsonObject {
  return {
    parser_code: parserCode,
    record_kind: recordKind,
    required,
    source_selector: sourceSelector,
    target_field: targetField,
  };
}

function mapping(input: {
  adapterCode: string;
  columns: JsonObject[];
  constants: JsonObject;
  locator: string;
  outputFamily: string;
  parsers: JsonObject;
  recordSelectors: CanonicalValue[];
  sourceCode: string;
  sourceProfileSha256: string;
  surface: string;
}): JsonObject {
  return {
    adapter_code: input.adapterCode,
    columns: [...input.columns].sort((a, b) => String(a.target_field).localeCompare(String(b.target_field))),
    constants: input.constants,
    locator: input.locator,
    output_family: input.outputFamily,
    parsers: input.parsers,
    record_selectors: input.recordSelectors,
    schema_version: "source-input-map-v1",
    source_code: input.sourceCode,
    source_profile_sha256: input.sourceProfileSha256,
    surface: input.surface,
  };
}

const ledgerLocator = "spreadsheet:1aStEZeCSHIUqS4W81umlW8B3pMCJpx-u5Oe_IHcD49k";
const bankLocator = "spreadsheet:1d9C3cMd_0MomQtF5cfAk-9doVKRxsy8OKiO1MqvYqA0";
const rosterLocator = "spreadsheet:1s8x9Oli94iD0Dwx1OYedmKbwSBRPkvcg3tjCML6iHPY;sheet:1501009351";
const ledgerRevision = "drive-version:20;modified:2026-08-10T04:43:12.956Z";
const bankRevision = "drive-version:24;modified:2026-07-27T02:53:06.843Z";
const rosterRevision = "drive-version:63;modified:2026-07-27T02:38:23.303Z";

const ledgerTabs: CanonicalValue[] = [
  { header_candidates: [{ row: 1, values_sha256: "36a38c1e808ebf4a8ae3db70425b678dd6c393019eade88c60b5f2eaa59f05c7" }], max_column: 23, max_row: 1297, tab_id: "379091912", title: "회비수입" },
  { header_candidates: [{ row: 3, values_sha256: "0912ec999ef9e71b8335c0e12514b6d7cc251722a0aa66f847780d2fad0adf76" }], max_column: 14, max_row: 1089, tab_id: "1672944742", title: "2025" },
  { header_candidates: [{ row: 3, values_sha256: "e61cda4387a9f642ce7fabde7c93fb45fc93d369abecceb6b20eaef25f30fa40" }], max_column: 15, max_row: 515, tab_id: "970372127", title: "2024" },
  { header_candidates: [{ row: 4, values_sha256: "383ac08876ed8751a6eed6b3a1dc14fd2ea79f8d3f075c91f393a328d07a2c60" }], max_column: 22, max_row: 1000, tab_id: "124466042", title: "2023" },
  { header_candidates: [{ row: 2, values_sha256: "1f2a4e131c1553670d95605fa0fb052223f2228e1cacb62663620351ad842ac3" }], max_column: 28, max_row: 663, tab_id: "1520038075", title: "2022" },
];

const profiles: Record<string, JsonObject> = {
  LEDGER_FINAL_2022_2025: profile({ sourceCode: "LEDGER_FINAL_2022_2025", locator: ledgerLocator, revision: ledgerRevision, surface: "google_sheet", tabs: ledgerTabs }),
  LEDGER_DUES_POLICY_2024_2025: profile({ sourceCode: "LEDGER_DUES_POLICY_2024_2025", locator: `${ledgerLocator};ranges:회비수입!O2:O7,회비수입!O9:O14`, revision: ledgerRevision, surface: "google_sheet", tabs: [ledgerTabs[0]] }),
  BANK_TOSS_2026: profile({ sourceCode: "BANK_TOSS_2026", locator: `${bankLocator};sheet:1331785013`, revision: bankRevision, surface: "google_sheet", tabs: [{ header_candidates: [{ row: 9, values_sha256: "f0238d237811629bb2ba3dbde4c7a78ca55d437c4ebddae286caa3560a21801e" }], max_column: 26, max_row: 1000, tab_id: "1331785013", title: "토스뱅크(1/1~3/16)" }] }),
  BANK_IBK_2026: profile({ sourceCode: "BANK_IBK_2026", locator: `${bankLocator};sheet:1080212396`, revision: bankRevision, surface: "google_sheet", tabs: [{ header_candidates: [{ row: 1, values_sha256: "2587517d2951f8c588d23363ce5275fb612a742bf5c55a6c5c5a606089c02e59" }], max_column: 12, max_row: 1001, tab_id: "1080212396", title: "기업은행(3/16~)" }] }),
  GROUP_FOREIGN_FACULTY_2025: profile({ sourceCode: "GROUP_FOREIGN_FACULTY_2025", locator: rosterLocator, revision: rosterRevision, surface: "google_sheet", tabs: [{ header_candidates: [{ row: 2, values_sha256: "76ef821b2c6209cf8d6ffc0020ac0bd0143ada9e56be3cbe722176a0b0c3c8af" }], max_column: 14, max_row: 28, tab_id: "1501009351", title: "2025" }] }),
  AGM36_PERIOD_BOUNDARY: profile({ sourceCode: "AGM36_PERIOD_BOUNDARY", locator: "payload:docs/source-authority/22nd-officers.json#AGM36_CLOSE", revision: "payload-sha256:8c8d1d94dfb39d571adc4dee4578c7227a62dc8c5936871a06a0c0c32b29dc27;receipt-sha256:a7a7ef3de86972042f1df0d33be291e02ef2c7f3611ea217a4cd05811951438d;commit:9922cf3eccb65fa565380f9e7549628721602041", surface: "local_payload" }),
  NOTION_DUES_REGULATION_DRAFT: profile({ sourceCode: "NOTION_DUES_REGULATION_DRAFT", locator: "page:3aa2225d9c4d8188b661ce08b2cfed2f", revision: "notion-last-edited:2026-07-27T15:39:51.488Z", surface: "notion_page", databaseColumns: ["url", "생성일시", "제목", "최종 편집 일시", "최종 편집자"] }),
  LEGACY_PAYMENTS: profile({ sourceCode: "LEGACY_PAYMENTS", locator: "public.payments", revision: "development-target:b3f038ee10e11f57fa524477ce393d82a67b71c223ef582776a83b828d239971;row-count:0;constraints-validated:4", surface: "postgresql_table", databaseColumns: ["id:integer:not-null", "user_id:integer:nullable", "amount:integer:not-null", "year:integer:not-null", "type:text:not-null", "status:text:not-null", "receipt_url:text:nullable", "created_at:timestamp-without-time-zone:nullable"] }),
};

const ledgerSelectors: CanonicalValue[] = [
  ["dues_rows", "379091912", "회비수입", "A1:H1218", 1, 2],
  ["year_2025", "1672944742", "2025", "B3:H1089", 3, 4],
  ["year_2024", "970372127", "2024", "B3:H515", 3, 4],
  ["year_2023_primary", "124466042", "2023", "B4:H113", 4, 5],
  ["year_2023_secondary", "124466042", "2023", "O4:U16", 4, 5],
  ["year_2022_primary", "1520038075", "2022", "B2:H74", 2, 3],
  ["year_2022_secondary", "1520038075", "2022", "O2:U8", 2, 3],
].map(([selector, tabId, title, range, header, start]) => ({ a1_range_or_null: range, data_start_row_or_null: start, header_row_or_null: header, record_kind: "economic", selector_code: selector, tab_id_or_null: tabId, tab_title_snapshot_or_null: title }));

const sharedParsers: JsonObject = {
  constant_v1: { operation: "constant" },
  hmac_sha256_nullable_nfc_trim_v1: { key_ref: "ACCOUNTING_PII_HMAC_KEY_V1", nullable: true, operation: "hmac_sha256", preprocess: ["nfc", "trim"] },
  hmac_sha256_required_nfc_trim_v1: { key_ref: "ACCOUNTING_PII_HMAC_KEY_V1", nullable: false, operation: "hmac_sha256", preprocess: ["nfc", "trim"] },
  row_coordinate_v1: { operation: "sheet_id_and_row_coordinate" },
};

const mappings: Record<string, JsonObject> = {};

mappings.LEDGER_FINAL_2022_2025 = mapping({
  adapterCode: "final-ledger-v1",
  sourceCode: "LEDGER_FINAL_2022_2025",
  sourceProfileSha256: String(profiles.LEDGER_FINAL_2022_2025.profile_sha256),
  locator: ledgerLocator,
  surface: "google_sheet",
  outputFamily: "final-ledger-coordinate-v1",
  constants: { normalization_version: "final-ledger-v1+pii-hmac-v1", period_codes: ["CALENDAR_2022", "CALENDAR_2023", "CALENDAR_2024", "CALENDAR_2025"], source_timezone: "Asia/Seoul" },
  parsers: { ...sharedParsers, absolute_money_v1: { operation: "absolute_canonical_money" }, calendar_period_v1: { operation: "calendar_year_period", prefix: "CALENDAR_" }, ledger_description_digest_v1: { fields: ["내용", "거래구분", "메모"], operation: "hmac_sha256_joined", key_ref: "ACCOUNTING_PII_HMAC_KEY_V1" }, ledger_direction_v1: { label_map: { "수입": "credit", "지출": "debit" }, operation: "label_then_signed_amount", signed_labels: ["분개", "이월", "통장이전"] }, sheet_datetime_kst_v1: { operation: "sheet_datetime", timezone: "Asia/Seoul" }, nullable_year_v1: { operation: "null" }, period_boundary_reference_v1: { operation: "adjacent_calendar_boundary_evidence" } },
  columns: [
    column("boundary_content_digest", "period_metadata", "period_boundary_reference_v1", { kind: "computed", value: "boundary_content_digest" }),
    column("boundary_coordinate_key", "period_metadata", "period_boundary_reference_v1", { kind: "computed", value: "boundary_coordinate_key" }),
    column("boundary_source_code", "period_metadata", "constant_v1", { kind: "constant", value: "LEDGER_FINAL_2022_2025" }),
    column("coordinate_key", "economic", "row_coordinate_v1", { kind: "computed", value: "sheet_id:row" }),
    column("coordinate_kind", "economic", "constant_v1", { kind: "constant", value: "economic" }),
    column("description_digest", "economic", "ledger_description_digest_v1", { kind: "headers", values: ["내용", "거래구분", "메모"] }),
    column("direction", "economic", "ledger_direction_v1", { kind: "headers", values: ["구분", "거래금액"] }),
    column("dues_year", "economic", "nullable_year_v1", { kind: "constant", value: null }, false),
    column("ends_at", "period_metadata", "period_boundary_reference_v1", { kind: "computed", value: "next_calendar_year_start" }),
    column("occurred_at", "economic", "sheet_datetime_kst_v1", { kind: "header", occurrence: 1, value: "거래일시" }),
    column("occurred_date", "economic", "sheet_datetime_kst_v1", { kind: "computed", value: "occurred_at_kst_date" }),
    column("payer_digest", "economic", "hmac_sha256_nullable_nfc_trim_v1", { kind: "headers_joined", values: ["내용", "메모"] }, false),
    column("period_code", "economic", "calendar_period_v1", { kind: "computed", value: "occurred_at_kst_year" }),
    column("starts_at", "period_metadata", "period_boundary_reference_v1", { kind: "computed", value: "calendar_year_start" }),
    column("amount", "economic", "absolute_money_v1", { kind: "header", occurrence: 1, value: "거래금액" }),
  ],
  recordSelectors: [...ledgerSelectors, ...[2022, 2023, 2024, 2025].map((year) => ({ a1_range_or_null: null, data_start_row_or_null: null, header_row_or_null: null, record_kind: "period_metadata", selector_code: `period_calendar_${year}`, tab_id_or_null: null, tab_title_snapshot_or_null: null }))],
});

function policyMapping(sourceCode: string, sourceProfileSha256: string, locator: string, adapterCode: string, surface: string, selector: CanonicalValue, sourceKind: "sheet" | "notion"): JsonObject {
  return mapping({ adapterCode, sourceCode, sourceProfileSha256, locator, surface, outputFamily: "policy-row-v1", constants: { due_day: 10, reminder_day: 11, status_effect: "draft_only" }, parsers: { ...sharedParsers, policy_amount_v1: { operation: "korean_money_phrase" }, policy_tier_v1: { operation: "korean_tier_label", values: ["회장", "수석부회장", "부회장,감사", "부회장·감사·총회의장", "이사", "정회원", "회원", "명예회원"] }, policy_year_v1: { operation: sourceKind === "sheet" ? "section_heading_year" : "constant", value: sourceKind === "sheet" ? null : 2026 } }, columns: [column("annual_minimum", "policy", "policy_amount_v1", { kind: "phrase", value: "연납" }), column("due_day", "policy", "constant_v1", { kind: "constant", value: 10 }), column("dues_year", "policy", "policy_year_v1", { kind: "section_or_constant", value: sourceKind === "sheet" ? "#YYYY년회비" : 2026 }), column("monthly_minimum", "policy", "policy_amount_v1", { kind: "phrase", value: "월" }), column("reminder_day", "policy", "constant_v1", { kind: "constant", value: 11 }), column("tier_code", "policy", "policy_tier_v1", { kind: "label", value: "직책·구분" })], recordSelectors: [selector] });
}

mappings.LEDGER_DUES_POLICY_2024_2025 = policyMapping("LEDGER_DUES_POLICY_2024_2025", String(profiles.LEDGER_DUES_POLICY_2024_2025.profile_sha256), `${ledgerLocator};ranges:회비수입!O2:O7,회비수입!O9:O14`, "dues-policy-sheet-v1", "google_sheet", { a1_range_or_null: "O2:O14", data_start_row_or_null: 2, header_row_or_null: null, record_kind: "policy", selector_code: "dues_policy_sections", tab_id_or_null: "379091912", tab_title_snapshot_or_null: "회비수입" }, "sheet");

function bankMapping(sourceCode: string, profileSha: string, locator: string, adapterCode: string, selector: CanonicalValue, kind: "toss" | "ibk"): JsonObject {
  const isToss = kind === "toss";
  return mapping({ adapterCode, sourceCode, sourceProfileSha256: profileSha, locator, surface: "google_sheet", outputFamily: "bank-row-v1", constants: { normalization_version: `${adapterCode}+pii-hmac-v1`, source_timezone: "Asia/Seoul" }, parsers: { ...sharedParsers, bank_amount_v1: { operation: isToss ? "signed_amount_absolute" : "exclusive_debit_credit_amount" }, bank_balance_v1: { operation: "canonical_nonnegative_money" }, bank_datetime_kst_v1: { operation: "sheet_datetime", timezone: "Asia/Seoul" }, bank_direction_v1: { operation: isToss ? "signed_amount_direction" : "exclusive_debit_credit_direction" }, bank_payer_digest_v1: { excluded_headers: ["계좌번호", "상대계좌번호", "CMS코드"], key_ref: "ACCOUNTING_PII_HMAC_KEY_V1", operation: "hmac_sha256_joined" } }, columns: [column("amount", "bank", "bank_amount_v1", { kind: "headers", values: isToss ? ["거래 금액"] : ["출금", "입금"] }), column("balance_after", "bank", "bank_balance_v1", { kind: "header", occurrence: 1, value: isToss ? "거래 후 잔액" : "거래후 잔액" }), column("direction", "bank", "bank_direction_v1", { kind: "headers", values: isToss ? ["거래 금액"] : ["출금", "입금"] }), column("occurred_at", "bank", "bank_datetime_kst_v1", { kind: "header", occurrence: 1, value: isToss ? "거래 일시" : "거래일시" }), column("payer_digest", "bank", "bank_payer_digest_v1", { kind: "headers_joined", values: isToss ? ["적요", "거래 유형", "거래 기관", "메모"] : ["거래내용", "상대은행", "상대계좌예금주명", "메모"] }, false), column("posted_date", "bank", "bank_datetime_kst_v1", { kind: "computed", value: "occurred_at_kst_date" }), column("provider_row_id", "bank", "row_coordinate_v1", { kind: "computed", value: "sheet_id:row" })], recordSelectors: [selector] });
}

mappings.BANK_TOSS_2026 = bankMapping("BANK_TOSS_2026", String(profiles.BANK_TOSS_2026.profile_sha256), `${bankLocator};sheet:1331785013`, "toss-bank-sheet-v1", { a1_range_or_null: "A9:I209", data_start_row_or_null: 10, header_row_or_null: 9, record_kind: "bank", selector_code: "toss_rows", tab_id_or_null: "1331785013", tab_title_snapshot_or_null: "토스뱅크(1/1~3/16)" }, "toss");
mappings.BANK_IBK_2026 = bankMapping("BANK_IBK_2026", String(profiles.BANK_IBK_2026.profile_sha256), `${bankLocator};sheet:1080212396`, "ibk-bank-sheet-v1", { a1_range_or_null: "A1:L176", data_start_row_or_null: 2, header_row_or_null: 1, record_kind: "bank", selector_code: "ibk_rows", tab_id_or_null: "1080212396", tab_title_snapshot_or_null: "기업은행(3/16~)" }, "ibk");

mappings.GROUP_FOREIGN_FACULTY_2025 = mapping({ adapterCode: "group-roster-v1", sourceCode: "GROUP_FOREIGN_FACULTY_2025", sourceProfileSha256: String(profiles.GROUP_FOREIGN_FACULTY_2025.profile_sha256), locator: rosterLocator, surface: "google_sheet", outputFamily: "allocation-roster-row-v1", constants: { candidate_only: true, group_label: "외래교수회", proposed_amount: "50000", proposed_amount_basis: "LEDGER_DUES_POLICY_2024_2025:2025:member", source_timezone: "Asia/Seoul" }, parsers: { ...sharedParsers, canonical_money_constant_v1: { operation: "constant", value: "50000" }, korean_generation_required_v1: { nullable: false, operation: "generation_integer" } }, columns: [column("generation", "allocation_roster", "korean_generation_required_v1", { kind: "header", occurrence: 1, value: "졸업기수" }), column("group_digest", "allocation_roster", "hmac_sha256_required_nfc_trim_v1", { kind: "constant", value: "외래교수회" }), column("member_name_digest", "allocation_roster", "hmac_sha256_required_nfc_trim_v1", { kind: "header", occurrence: 1, value: "성  명" }), column("proposed_amount", "allocation_roster", "canonical_money_constant_v1", { kind: "constant", value: "50000" })], recordSelectors: [{ a1_range_or_null: "A2:N28", data_start_row_or_null: 3, header_row_or_null: 2, record_kind: "allocation_roster", selector_code: "foreign_faculty_2025_candidates", tab_id_or_null: "1501009351", tab_title_snapshot_or_null: "2025" }] });

mappings.AGM36_PERIOD_BOUNDARY = mapping({ adapterCode: "agm-period-boundary-v1", sourceCode: "AGM36_PERIOD_BOUNDARY", sourceProfileSha256: String(profiles.AGM36_PERIOD_BOUNDARY.profile_sha256), locator: "payload:docs/source-authority/22nd-officers.json#AGM36_CLOSE", surface: "local_payload", outputFamily: "period-boundary-v1", constants: { boundary_instant: "2026-02-28T12:38:00+09:00", owner_override_reason: "OWNER_APPROVED_21ST_TERM_TO_AGM36_CLOSE" }, parsers: { ...sharedParsers, payload_digest_reference_v1: { operation: "frozen_payload_digest_reference" } }, columns: [column("boundary_content_digest", "period_boundary", "payload_digest_reference_v1", { kind: "computed", value: "22nd-president-row-content-digest" }), column("boundary_coordinate_key", "period_boundary", "constant_v1", { kind: "constant", value: "notion-role:22:president:2026-02-28" }), column("boundary_source_code", "period_boundary", "constant_v1", { kind: "constant", value: "NOTION_ORGANIZATION_ROLE_HISTORY" }), column("ends_at", "period_boundary", "constant_v1", { kind: "constant_pair", values: ["2026-02-28T12:38:00+09:00", null] }, false), column("period_code", "period_boundary", "constant_v1", { kind: "constant_pair", values: ["PRE_AGM36_2026", "AGM36_TO_AGM37"] }), column("starts_at", "period_boundary", "constant_v1", { kind: "constant_pair", values: ["2026-01-01T00:00:00+09:00", "2026-02-28T12:38:00+09:00"] })], recordSelectors: [{ a1_range_or_null: null, data_start_row_or_null: null, header_row_or_null: null, record_kind: "period_boundary", selector_code: "agm36_period_pair", tab_id_or_null: null, tab_title_snapshot_or_null: null }] });

mappings.NOTION_DUES_REGULATION_DRAFT = policyMapping("NOTION_DUES_REGULATION_DRAFT", String(profiles.NOTION_DUES_REGULATION_DRAFT.profile_sha256), "page:3aa2225d9c4d8188b661ce08b2cfed2f", "notion-dues-draft-v1", "notion_page", { a1_range_or_null: null, data_start_row_or_null: null, header_row_or_null: null, record_kind: "policy", selector_code: "appendix_1_2026_tiers", tab_id_or_null: null, tab_title_snapshot_or_null: "별표 1. 2026년 직책별 회비 기준" }, "notion");

mappings.LEGACY_PAYMENTS = mapping({ adapterCode: "legacy-payments-v1", sourceCode: "LEGACY_PAYMENTS", sourceProfileSha256: String(profiles.LEGACY_PAYMENTS.profile_sha256), locator: "public.payments", surface: "postgresql_table", outputFamily: "legacy-payment-row-v1", constants: { captured_timezone_required: true, receipt_url_excluded: true }, parsers: { ...sharedParsers, legacy_amount_parse_v1: { operation: "signed_integer_evidence_envelope" }, legacy_created_at_v1: { operation: "timestamp_without_timezone", timezone_source: "batch.captured_timezone" }, nullable_integer_v1: { operation: "nullable_integer" }, text_enum_v1: { operation: "nfc_trim" } }, columns: [column("amount_parse", "legacy_payment", "legacy_amount_parse_v1", { kind: "column", value: "amount" }), column("created_at", "legacy_payment", "legacy_created_at_v1", { kind: "column", value: "created_at" }, false), column("payment_id", "legacy_payment", "nullable_integer_v1", { kind: "column", value: "id" }), column("source_amount_signed", "legacy_payment", "legacy_amount_parse_v1", { kind: "column", value: "amount" }, false), column("source_timezone", "legacy_payment", "constant_v1", { kind: "batch_field", value: "captured_timezone" }), column("status", "legacy_payment", "text_enum_v1", { kind: "column", value: "status" }), column("type", "legacy_payment", "text_enum_v1", { kind: "column", value: "type" }), column("user_id", "legacy_payment", "nullable_integer_v1", { kind: "column", value: "user_id" }, false), column("year", "legacy_payment", "nullable_integer_v1", { kind: "column", value: "year" })], recordSelectors: [{ a1_range_or_null: null, data_start_row_or_null: null, header_row_or_null: null, record_kind: "legacy_payment", selector_code: "payments_primary_key_order", tab_id_or_null: null, tab_title_snapshot_or_null: "public.payments" }] });

mkdirSync(profileDir, { recursive: true });
mkdirSync(mappingDir, { recursive: true });
mkdirSync(approvalDir, { recursive: true });

const rows: string[] = [];
const slug = (code: string) => code.toLowerCase().replaceAll("_", "-");
const approvalText = "Todo 18 deferred source 8개 profile·mapping을 위 해시와 경계대로 승인한다. 외래교수회 26개 행은 50,000원 후보일 뿐 자동 배분 근거가 아니며, 실제 include/reject/quarantine 및 합계 일치는 별도 source-decision 승인을 요구한다.\n";
const platformReceipt = {
  author: "user",
  created_at: "2026-08-10T05:15:03Z",
  message_id: "item-368",
  text_sha256: sha256(approvalText),
  thread_id: "019fe3d1-7669-7911-b30f-2ebc99d3245a",
};
const readResponseSha256 = sha256(canonicalJson(platformReceipt));
for (const sourceCode of Object.keys(profiles).sort()) {
  const profilePath = `${profileDir}/${slug(sourceCode)}.json`;
  const mappingPath = `${mappingDir}/${slug(sourceCode)}-v1.json`;
  const profileFileSha = writeJson(profilePath, profiles[sourceCode]);
  const mappingFileSha = writeJson(mappingPath, mappings[sourceCode]);
  const approval = withReceiptHash({
    approval_text_sha256: platformReceipt.text_sha256,
    approved_at: platformReceipt.created_at,
    host_id_or_null: "local",
    mapping_sha256: mappingFileSha,
    platform_message_created_at: platformReceipt.created_at,
    platform_message_id: platformReceipt.message_id,
    platform_message_timestamp_source: "parent_turn_started_at_projection_v1",
    platform_thread_id: platformReceipt.thread_id,
    project_id: "local-fcb170b4427ba4e258ce8af48e487c64",
    provider: "codex-app",
    read_response_sha256: readResponseSha256,
    schema_version: "source-mapping-approval-v1",
    source_code: sourceCode,
    source_profile_sha256: profiles[sourceCode].profile_sha256,
  });
  writeJson(`${approvalDir}/${slug(sourceCode)}-v1.json`, approval);
  rows.push(`| \`${sourceCode}\` | \`${profiles[sourceCode].profile_sha256}\` | \`${mappingFileSha}\` | \`${mappings[sourceCode].adapter_code}\` | \`${mappings[sourceCode].output_family}\` |`);
  if (profileFileSha !== sha256(canonicalFile(profiles[sourceCode]))) throw new Error("profile_write_digest_mismatch");
}

const preview = `# Todo 18 deferred source profile·mapping 승인안\n\n관측 시각: \`${observedAt}\`\n\n아래 8개 profile과 mapping은 source release 생성 전에 독립 승인되어야 한다. 이 문서는 승인 대상의 해시와 비즈니스 경계를 고정하며, 승인 자체는 provider-resolved 사용자 메시지 receipt로 별도 기록한다.\n\n| source | profile self SHA-256 | mapping file SHA-256 | adapter | output family |\n|---|---|---|---|---|\n${rows.join("\n")}\n\n## 승인 경계\n\n- Google Sheets 3개 workbook은 Replit service account의 Sheets read-only 및 Drive metadata-read-only로 관측했다. 원본 수정은 0건이다.\n- \`LEDGER_FINAL_2022_2025\`는 7개 실제 거래 block만 읽고 달력연도 period metadata를 별도 생성한다. 중복·분개·이월·통장이전은 자동 합치지 않고 source-decision preview에서 판단한다.\n- \`LEDGER_DUES_POLICY_2024_2025\`는 \`회비수입!O2:O7,O9:O14\`의 10개 tier만 정규화하며 due day 10, reminder day 11을 사용한다.\n- 두 bank source는 계좌번호/CMS 코드를 payload와 digest 입력에서 제외한다. Toss 200행, IBK 175행의 현재 구조에 묶인다.\n- \`GROUP_FOREIGN_FACULTY_2025\`는 26명을 모두 2025 일반회원 연납 50,000원 후보로만 정규화한다. 현재 source에는 개인별 배분금액/선정표식이 없고 2025 primary payment 연결도 검증되지 않았으므로 자동 승인·자동 배분은 금지한다. 각 member의 include/reject/quarantine은 이후 human source-decision에서 결정하고, 승인 합계가 primary receipt와 정확히 같지 않으면 apply를 차단한다.\n- \`AGM36_PERIOD_BOUNDARY\`는 동결 payload를 직접 role source로 사용하지 않고 \`2026-02-28T12:38:00+09:00\` period boundary 두 행만 생성한다.\n- \`NOTION_DUES_REGULATION_DRAFT\`는 이사회 의결 전 초안의 2026 tier 6개를 preview-only로 정규화한다. 정책·tier·rights 활성화는 0건이다.\n- \`LEGACY_PAYMENTS\`는 현재 Development 0행이며 evidence row만 만든다. 분류·결제 이관은 Todo 19 전까지 0건이고 \`receipt_url\`은 제외한다.\n\n## 승인 문구\n\n\`Todo 18 deferred source 8개 profile·mapping을 위 해시와 경계대로 승인한다. 외래교수회 26개 행은 50,000원 후보일 뿐 자동 배분 근거가 아니며, 실제 include/reject/quarantine 및 합계 일치는 별도 source-decision 승인을 요구한다.\`\n`;
writeFileSync("docs/source-contracts/task-18-source-profile-mapping-preview.md", preview);

console.log(JSON.stringify({ source_count: rows.length, observed_at: observedAt, preview_sha256: sha256(preview), result: "materialized" }));
