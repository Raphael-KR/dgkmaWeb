import { readFileSync, writeFileSync } from "node:fs";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";

type Json = Record<string, CanonicalValue>;
type Column = Record<string, CanonicalValue>;

const sources = [
  "membership-integrated-address-book",
  "notion-organization-role-history",
  "agm36-period-boundary",
  "bank-ibk-2026",
  "bank-toss-2026",
  "group-foreign-faculty-2025",
  "ledger-dues-policy-2024-2025",
  "ledger-final-2022-2025",
  "legacy-payments",
  "notion-dues-regulation-draft",
] as const;

function read(name: string): Json {
  return JSON.parse(readFileSync(`docs/source-contracts/mappings/${name}-v1.json`, "utf8")) as Json;
}
function selector(kind: string, value: string | string[], domain?: string): Json {
  return domain ? { digest_domain: domain, kind, ...(Array.isArray(value) ? { values: value } : { value }) }
    : { kind, ...(Array.isArray(value) ? { values: value } : { value }) };
}
function column(target: string, recordKind: string, parser: string, sourceSelector: Json, required = true): Column {
  return { parser_code: parser, record_kind: recordKind, required, source_selector: sourceSelector, target_field: target };
}
function clean(mapping: Json): Json {
  const parsers = mapping.parsers as Json;
  const cleanParsers = Object.fromEntries(Object.entries(parsers).filter(([, value]) => !/hmac|key_ref|source-row-hmac|ACCOUNTING_PII_HMAC_KEY_V1/i.test(canonicalJson(value))));
  return {
    ...mapping,
    adapter_code: `${String(mapping.adapter_code).replace(/-v1$/, "")}-v2`,
    parsers: {
      ...cleanParsers,
      source_display_v2: { operation: "admin_readable_source_snapshot", preprocess: ["nfc", "trim", "collapse_whitespace"] },
      source_key_digest_v2: { operation: "domain_separated_sha256", preprocess: ["nfc", "trim", "collapse_whitespace"], secret_ref: null },
    },
  };
}
function sorted(mapping: Json): Json {
  return { ...mapping, columns: [...(mapping.columns as Column[])].sort((a, b) => String(a.target_field).localeCompare(String(b.target_field))) };
}

const mappings = Object.fromEntries(sources.map((name) => [name, clean(read(name))])) as Record<string, Json>;

Object.assign(mappings["membership-integrated-address-book"], {
  adapter_code: "membership-integrated-address-book-v2",
  output_family: "member-identity-row-v2",
  columns: [
    column("admitted_on", "member_identity", "date_serial_or_iso_nullable_v1", selector("header", "입학일자"), false),
    column("generation", "member_identity", "korean_generation_nullable_v1", selector("header", "기수"), false),
    column("graduated_on", "member_identity", "date_serial_or_iso_nullable_v1", selector("header", "졸업일자"), false),
    column("member_kind_evidence_digest", "member_identity", "source_key_digest_v2", selector("header", "그룹", "member-kind-evidence"), false),
    column("member_kind_evidence_snapshot", "member_identity", "source_display_v2", selector("header", "그룹"), false),
    column("name_key_digest", "member_identity", "source_key_digest_v2", selector("header", "성명", "member-name-key")),
    column("name_snapshot", "member_identity", "source_display_v2", selector("header", "성명")),
    column("source_status_digest", "member_identity", "source_key_digest_v2", selector("header", "상태", "member-status-evidence"), false),
    column("source_status_snapshot", "member_identity", "source_display_v2", selector("header", "상태"), false),
    column("source_timezone", "member_identity", "constant_v1", selector("constant", "Asia/Seoul")),
  ],
});

const notion = mappings["notion-organization-role-history"];
const notionColumns = (notion.columns as Column[]).filter((entry) => !["name_digest", "note_digest", "source_locator_digest", "verification_evidence_digest"].includes(String(entry.target_field)));
notionColumns.push(
  column("name_key_digest", "role_history", "source_key_digest_v2", selector("database_column", "표기명", "role-name-key")),
  column("name_snapshot", "role_history", "source_display_v2", selector("database_column", "표기명")),
  column("note_digest", "role_history", "source_key_digest_v2", selector("database_column", "비고", "role-note"), false),
  column("note_snapshot", "role_history", "source_display_v2", selector("database_column", "비고"), false),
  column("source_locator_digest", "role_history", "source_key_digest_v2", selector("database_column", "출처", "role-source-locator"), false),
  column("source_locator_snapshot", "role_history", "source_display_v2", selector("database_column", "출처"), false),
  column("verification_evidence_digest", "role_history", "source_key_digest_v2", selector("database_column", "검증근거", "role-verification-evidence"), false),
  column("verification_evidence_snapshot", "role_history", "source_display_v2", selector("database_column", "검증근거"), false),
);
Object.assign(notion, { adapter_code: "notion-organization-role-history-v2", output_family: "role-row-v3", columns: notionColumns });

function replaceTarget(mapping: Json, oldTarget: string, additions: Column[]) {
  mapping.columns = [...(mapping.columns as Column[]).filter((entry) => String(entry.target_field) !== oldTarget), ...additions];
}
const ledger = mappings["ledger-final-2022-2025"];
const ledgerDescription = selector("headers_joined", ["내용", "거래구분", "메모"]);
const ledgerPayer = selector("headers_joined", ["내용", "메모"]);
replaceTarget(ledger, "description_digest", [
  column("description_digest", "economic", "source_key_digest_v2", { ...ledgerDescription, digest_domain: "ledger-description" }),
  column("description_snapshot", "economic", "source_display_v2", ledgerDescription),
]);
replaceTarget(ledger, "payer_digest", [
  column("payer_name_key_digest", "economic", "source_key_digest_v2", { ...ledgerPayer, digest_domain: "ledger-payer-name" }, false),
  column("payer_name_snapshot", "economic", "source_display_v2", ledgerPayer, false),
]);
Object.assign(ledger, { adapter_code: "final-ledger-v2", output_family: "final-ledger-coordinate-v2", constants: { ...(ledger.constants as Json), normalization_version: "final-ledger-v2+admin-readable-v1" } });

for (const [name, payerHeader, descriptionHeaders] of [
  ["bank-toss-2026", "적요", ["거래 유형", "거래 기관", "메모"]],
  ["bank-ibk-2026", "상대계좌예금주명", ["거래내용", "상대은행", "메모"]],
] as const) {
  const bank = mappings[name];
  replaceTarget(bank, "payer_digest", [
    column("payer_name_key_digest", "bank", "source_key_digest_v2", selector("header", payerHeader, "bank-payer-name"), false),
    column("payer_name_snapshot", "bank", "source_display_v2", selector("header", payerHeader), false),
    column("transaction_description_digest", "bank", "source_key_digest_v2", selector("headers_joined", [...descriptionHeaders], "bank-transaction-description"), false),
    column("transaction_description_snapshot", "bank", "source_display_v2", selector("headers_joined", [...descriptionHeaders]), false),
  ]);
  Object.assign(bank, { output_family: "bank-row-v2", constants: { ...(bank.constants as Json), normalization_version: `${String(bank.adapter_code)}+admin-readable-v1` } });
}

const group = mappings["group-foreign-faculty-2025"];
replaceTarget(group, "group_digest", [
  column("group_key_digest", "allocation_roster", "source_key_digest_v2", selector("constant", "외래교수회", "allocation-group-key")),
  column("group_name_snapshot", "allocation_roster", "source_display_v2", selector("constant", "외래교수회")),
]);
replaceTarget(group, "member_name_digest", [
  column("member_name_key_digest", "allocation_roster", "source_key_digest_v2", selector("header", "성  명", "allocation-member-name-key")),
  column("member_name_snapshot", "allocation_roster", "source_display_v2", selector("header", "성  명")),
]);
Object.assign(group, { adapter_code: "group-roster-v2", output_family: "allocation-roster-row-v2" });

const rows: string[] = [];
for (const name of sources) {
  const mapping = sorted(mappings[name]);
  const bytes = `${canonicalJson(mapping)}\n`;
  const path = `docs/source-contracts/mappings/${name}-v2.json`;
  if (/HMAC|ACCOUNTING_PII_HMAC_KEY_V1|source-row-hmac|key_ref/i.test(bytes)) throw new Error(`secret_reference_present:${name}`);
  writeFileSync(path, bytes);
  rows.push(`| \`${String(mapping.source_code)}\` | \`${sha256(bytes)}\` | \`${String(mapping.adapter_code)}\` | \`${String(mapping.output_family)}\` |`);
}

const preview = `# 관리자 가독형 source mapping v2 승인 전 검토안\n\n이 변경은 관리자 업무용 원문 snapshot과 시스템 무결성 키를 분리한다. 이름 변경 이력은 각 source coordinate의 immutable snapshot으로 남고, 회원의 현재 신원은 별도 stable member UID로 연결한다.\n\n| source | mapping file SHA-256 | adapter | output family |\n|---|---|---|---|\n${rows.join("\n")}\n\n## 고정 경계\n\n- 관리자 전용 검토 projection은 이름·적요·검증근거 등 업무상 필요한 source snapshot을 표시한다.\n- key digest는 비밀키 없는 domain-separated SHA-256이며 bucket/index 및 변경 감지 보조값이다. 사람의 신원 확정값은 아니다.\n- 회원 매칭과 개명 후 연속성은 stable member UID로 유지한다. 이름만으로 자동 매칭·회비 배분하지 않는다.\n- 전화번호, 주소, 계좌번호, 상대계좌번호, CMS 코드, receipt URL, token/provider 원문 body는 계속 제외한다.\n- decision manifest, operation receipt, 로그, Git evidence에는 원문 snapshot을 넣지 않는다.\n- 외래교수회 26개 행의 50,000원은 candidate-only이며 include/reject/quarantine 및 합계는 별도 source-decision 승인을 요구한다.\n- 이 문서 생성은 외부 source write 0건, Development/Production DB write 0건이다.\n`;
writeFileSync("docs/source-contracts/task-18-admin-readable-mapping-amendment-preview.md", preview);
console.log(JSON.stringify({ mapping_count: rows.length, preview_sha256: sha256(preview), result: "materialized" }));
