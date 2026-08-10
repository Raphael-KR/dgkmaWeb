# Todo 18 deferred source profile·mapping 승인안

관측 시각: `2026-08-10T04:53:48Z`

아래 8개 profile과 mapping은 source release 생성 전에 독립 승인되어야 한다. 이 문서는 승인 대상의 해시와 비즈니스 경계를 고정하며, 승인 자체는 provider-resolved 사용자 메시지 receipt로 별도 기록한다.

| source | profile self SHA-256 | mapping file SHA-256 | adapter | output family |
|---|---|---|---|---|
| `AGM36_PERIOD_BOUNDARY` | `8cbf7c722a241774d90554bc14209f6d5c4ae4b9bce16fd08b2fe3c2a3f078d4` | `ce450331d84e1bf038af57d906b5f6c63f4bf8b359ad8eeac316168abc69a235` | `agm-period-boundary-v1` | `period-boundary-v1` |
| `BANK_IBK_2026` | `e008ecca3e03d1830a4dd85b0b802451518ed0c45dd4342c324a26c346eccce3` | `c5360b8eedca45a578ebf431b31c588743a97dad3adb5b9d3ae5bb03cf5d6792` | `ibk-bank-sheet-v1` | `bank-row-v1` |
| `BANK_TOSS_2026` | `0d9cbc0b56cfb017ac182cb8fb343f3f17eec078bcb0a27afa8784f5490ed1a9` | `add7bcaaa6cd5d5ca689f096f15ec2b218d957dd0fe35cf5cd63f7519fd86f13` | `toss-bank-sheet-v1` | `bank-row-v1` |
| `GROUP_FOREIGN_FACULTY_2025` | `7b01646e03e4a87781d0cf85ac72781710c654cfdc561770338ae00caa739403` | `e61c644bd8417d3cfa3d4033d0726d1a14ea3c4f25d1743dd0c94ff2d81d7050` | `group-roster-v1` | `allocation-roster-row-v1` |
| `LEDGER_DUES_POLICY_2024_2025` | `34cb7e019fe2d703e019058a333b7e59e99c638a0f9d52730af2a06efd6bb80a` | `bb0eb644fbd2e71497326300e73f5dcf7669cfc12ba2c24d40738e958ac57b9f` | `dues-policy-sheet-v1` | `policy-row-v1` |
| `LEDGER_FINAL_2022_2025` | `c82f052c96969c0ed0f3fdcc276c51709194b4d4e12f80b6b4a76d6fe3f9c168` | `2b2861c48e68f9a680d53c7a89c9755f1bf6c35f534ce3e5c13a2751e9c5fcae` | `final-ledger-v1` | `final-ledger-coordinate-v1` |
| `LEGACY_PAYMENTS` | `e125b3aa343f4a7cd2f2e46fd39e0f1bed49793fb29414a1e40c5e06f8b701c2` | `e965a0f2d3913717563890aaadc88335b92657930529ed251312737683c0bcd4` | `legacy-payments-v1` | `legacy-payment-row-v1` |
| `NOTION_DUES_REGULATION_DRAFT` | `e726dfdf6403def6cfffe523f773362b69438f13ac50cb84ea11155d5e838ba0` | `17f2b2a120561905c7385f34f4d987cd92b810dbde095d6a388cd1cda66c07d6` | `notion-dues-draft-v1` | `policy-row-v1` |

## 승인 경계

- Google Sheets 3개 workbook은 Replit service account의 Sheets read-only 및 Drive metadata-read-only로 관측했다. 원본 수정은 0건이다.
- `LEDGER_FINAL_2022_2025`는 7개 실제 거래 block만 읽고 달력연도 period metadata를 별도 생성한다. 중복·분개·이월·통장이전은 자동 합치지 않고 source-decision preview에서 판단한다.
- `LEDGER_DUES_POLICY_2024_2025`는 `회비수입!O2:O7,O9:O14`의 10개 tier만 정규화하며 due day 10, reminder day 11을 사용한다.
- 두 bank source는 계좌번호/CMS 코드를 payload와 digest 입력에서 제외한다. Toss 200행, IBK 175행의 현재 구조에 묶인다.
- `GROUP_FOREIGN_FACULTY_2025`는 26명을 모두 2025 일반회원 연납 50,000원 후보로만 정규화한다. 현재 source에는 개인별 배분금액/선정표식이 없고 2025 primary payment 연결도 검증되지 않았으므로 자동 승인·자동 배분은 금지한다. 각 member의 include/reject/quarantine은 이후 human source-decision에서 결정하고, 승인 합계가 primary receipt와 정확히 같지 않으면 apply를 차단한다.
- `AGM36_PERIOD_BOUNDARY`는 동결 payload를 직접 role source로 사용하지 않고 `2026-02-28T12:38:00+09:00` period boundary 두 행만 생성한다.
- `NOTION_DUES_REGULATION_DRAFT`는 이사회 의결 전 초안의 2026 tier 6개를 preview-only로 정규화한다. 정책·tier·rights 활성화는 0건이다.
- `LEGACY_PAYMENTS`는 현재 Development 0행이며 evidence row만 만든다. 분류·결제 이관은 Todo 19 전까지 0건이고 `receipt_url`은 제외한다.

## 승인 문구

`Todo 18 deferred source 8개 profile·mapping을 위 해시와 경계대로 승인한다. 외래교수회 26개 행은 50,000원 후보일 뿐 자동 배분 근거가 아니며, 실제 include/reject/quarantine 및 합계 일치는 별도 source-decision 승인을 요구한다.`
