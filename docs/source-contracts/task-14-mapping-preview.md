# Todo 14 source mapping preview

상태: provider-bound 사용자 mapping 승인 및 manifest amendment 완료
작성 시각: 2026-08-10 KST
범위: metadata·header/schema digest only; live record import 0건; Development/Production DB write 0건

## Source registry amendment

| Source code | Fixed UUID | Kind / authority | Locator | Adapter |
|---|---|---|---|---|
| `MEMBERSHIP_INTEGRATED_ADDRESS_BOOK` | `5a47bd83-4d99-59bf-8525-7d0f4667ec75` | `google_sheet / member_identity / rank 0` | workbook `1YBu0MtJ3lt2AB1-DB3-u7NP-TSgehKmGK3Ox4PJCzLw`, sheetId `876761083` | `membership-integrated-address-book-v1` |
| `NOTION_ORGANIZATION_ROLE_HISTORY` | `75dd7485-9c2b-51a9-845f-e7baa6ba8dc1` | `notion / role_history / rank 0` | data source `dae9352c-122b-4902-bdb8-31328c35940f` | `notion-organization-role-history-v1` |

두 UUID는 URL namespace UUIDv5와 각각 `dgkma://logical-source/<SOURCE_CODE>` preimage로 결정했다. 기존 `MEMBERSHIP_OFFICER_WORKBOOK`과 `NOTION_22ND_OFFICERS` source rows는 새 계약으로 재사용하지 않고 manifest amendment에서 대체한다. 전체 literal seed 수는 10을 유지한다. `AGM36_PERIOD_BOUNDARY`는 동결 payload의 폐회 경계 provenance로만 남고 role source가 아니다.

## Profile and exact mapping bytes

| Source | Observed revision | Profile SHA-256 | Mapping SHA-256 |
|---|---|---|---|
| Sheets 통합주소록 | Drive version `2128`; modified `2026-08-09T15:49:34.017Z`; 3,459×12 | `2de3f3eec7f35dad213f6d3acb46b5cca398e557f7267e6f6732b69418e33ec4` | `d4ab36ea3cfb437cc0fa189496afdc26aceaad4274d4ea332232ce9c2a71538d` |
| Notion 조직·직책 이력 | N1 activated `2026-08-10T00:53:18+09:00`; activation receipt SHA `9039d7fc6afb4bfa2dd5ad0e02b4cf17d19b8f3c41480b5a705872d607df49d5` | `710fe3fba7c0fdb4a66c109171352fb8d6888d6ac9301dacba8dfaab7a76b998` | `bfeacd9f85136f5c6a882f355d884a5179c3a1343df1759f081f486c74b924e5` |

## Mapping summary

### Sheets `통합주소록` → `member-identity-row-v1`

| Source header | Normalized field | Rule |
|---|---|---|
| `성명` | `name_digest` | NFC+trim 후 keyed HMAC; 필수 |
| `기수` | `generation` | nullable 기수 정규화 |
| `입학일자` | `admitted_on` | nullable Google serial/ISO date |
| `졸업일자` | `graduated_on` | nullable Google serial/ISO date |
| `그룹` | `member_kind_evidence_digest` | NFC+trim 후 keyed HMAC; member kind 결정은 별도 승인 item |
| `상태` | `source_status_digest` | NFC+trim 후 keyed HMAC; active/ended 자동 판정 금지 |
| constant | `source_timezone` | `Asia/Seoul` |

`학과`, `주소`, `핸드폰번호`, `전화번호`, `동문회직책`, `메모`는 source row payload와 `association_members`로 복제하지 않는다. 원본의 전체 행 내용은 import 시 비공개 content digest의 입력일 수 있으나 Git/evidence/API에 원문을 남기지 않는다. 이 source는 member identity/contact 편집 권위지만 회계 event 또는 role-history 권위가 아니다.

### Notion 조직·직책 DB → `role-row-v2`

| Source property | Normalized field |
|---|---|
| `표기명` | `name_digest` |
| `졸업기수`, `입학년도` | `generation`, `admission_year` |
| `대수` | `administration_no` |
| `조직구분` | `organization_code` |
| `직위` | `display_position`, approved `position_code` |
| `임기` | `effective_from`, nullable `effective_to`, `date_precision` |
| `임명일`, `임명근거` | `source_appointment_date`, `source_date_text`, `appointment_basis` |
| `상태`, `공개여부` | `editorial_status`, `publication_allowed` |
| `회원매칭상태`, `matched_member_uid` | `member_match_status`, nullable stable member UID |
| `출처`, `검증근거`, `비고` | digest-only provenance fields |
| constant | `source_timezone=Asia/Seoul` |

직위·임명근거 parser는 `조직구분`을 context column으로 사용하며 미지 값은 `mapping_review_required`로 차단한다. Mapping 승인은 record별 `검토필요`를 `승인`으로 바꾸지 않고, 회원 이름만으로 매칭하거나 홈페이지 공개를 허용하지 않는다. 회비 등급·회비기준직책은 어느 source mapping에도 없다.

## Approval effect

승인 메시지는 위 profile과 exact mapping bytes 두 개만 결합한다. 승인 뒤 Codex는 provider-bound message receipt를 만들고, canonical manifest의 pre-N1 두 source 계약을 위 두 source로 교체하며 `member_identity` authority와 `member-identity-row-v1`·`role-row-v2` 계약을 추가한 새 manifest SHA-256을 생성한다. 그 전에는 기존 manifest SHA `4691d969300653ae13d850c02a411181ed5ec19debece8a2e95bbe0a899db23a`가 sequence 50을 승인할 수 없고 live import도 실행하지 않는다.

## Provider approval blocker

사용자는 `Todo 14 source mapping 승인`을 명시했다. 계획이 요구하는 exact call은 `codex_app.read_thread`의 `turnLimit=20`, `maxOutputCharsPerItem=200000`이지만 현재 provider는 각각 최대 `10`, `20000`만 허용해 argument validation에서 거부했다. 계획은 축소 호출이나 repository fixture 대체를 금지하므로 provider-bound receipt, manifest amendment와 새 manifest digest는 생성하지 않았다. 상태는 `blocked_provider_approval`이다.

사용자는 이어서 mapping을 재승인하고 provider call을 `turnLimit=10`, `maxOutputCharsPerItem=20000`으로 바꾸는 amendment를 승인했다. 변경된 호출은 성공했지만 user message item에는 `type`, `id`, `content`만 있고 message-level RFC-3339 `createdAt`이 없다. 상위 turn의 `startedAt=1786293307`은 존재하지만 이를 message timestamp로 사용하는 계약 amendment는 아직 승인되지 않았다. 따라서 provider-bound receipt와 manifest amendment는 계속 생성하지 않았다.
