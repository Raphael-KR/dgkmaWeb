# 관리자 가독형 source mapping v2 승인 전 검토안

이 변경은 관리자 업무용 원문 snapshot과 시스템 무결성 키를 분리한다. 이름 변경 이력은 각 source coordinate의 immutable snapshot으로 남고, 회원의 현재 신원은 별도 stable member UID로 연결한다.

| source | mapping file SHA-256 | adapter | output family |
|---|---|---|---|
| `MEMBERSHIP_INTEGRATED_ADDRESS_BOOK` | `085dd5e71ce89ce6d1edb1e91454e283a551c4c0451869ce55d2565d6f8f5e81` | `membership-integrated-address-book-v2` | `member-identity-row-v2` |
| `NOTION_ORGANIZATION_ROLE_HISTORY` | `f360506e73bd55966bb5ae60b787db3ee5f7114c1d3ad2bb5b9557168673cf5e` | `notion-organization-role-history-v2` | `role-row-v3` |
| `AGM36_PERIOD_BOUNDARY` | `e301c01dadc4e493646419977e1aef24e40586aea5c6f631c6feb29be8c82169` | `agm-period-boundary-v2` | `period-boundary-v1` |
| `BANK_IBK_2026` | `fd2537d7002b37525d13af9325125523fa8b0d1a070bb45cf5d6dbaeb4cdf2be` | `ibk-bank-sheet-v2` | `bank-row-v2` |
| `BANK_TOSS_2026` | `5ad40321a6793e199e200d5c1b7763d9b4ebb8ec4a88ca34607d6f8a6ba38d01` | `toss-bank-sheet-v2` | `bank-row-v2` |
| `GROUP_FOREIGN_FACULTY_2025` | `62dd7b5336ac89439c942b8049f02c78100a87afe88c1688e1d75ba69537eba0` | `group-roster-v2` | `allocation-roster-row-v2` |
| `LEDGER_DUES_POLICY_2024_2025` | `b76846d674abbd0527b5340a3daffde813b6b9c34d9cd06af4734f99103ab238` | `dues-policy-sheet-v2` | `policy-row-v1` |
| `LEDGER_FINAL_2022_2025` | `a97ce27164475e8b9a3d44100fc32d0f41dec6ac9ca1920c4ded8920c9439235` | `final-ledger-v2` | `final-ledger-coordinate-v2` |
| `LEGACY_PAYMENTS` | `abddab5688feb0c27c44098e70c383a06c779ed6b0e4abeb7678e9dc00c75ee8` | `legacy-payments-v2` | `legacy-payment-row-v1` |
| `NOTION_DUES_REGULATION_DRAFT` | `618158340222566401ef616ee15e4cc2dcef88d0ceac4e1ce6b15ad2c533ede0` | `notion-dues-draft-v2` | `policy-row-v1` |

## 고정 경계

- 관리자 전용 검토 projection은 이름·적요·검증근거 등 업무상 필요한 source snapshot을 표시한다.
- key digest는 비밀키 없는 domain-separated SHA-256이며 bucket/index 및 변경 감지 보조값이다. 사람의 신원 확정값은 아니다.
- 회원 매칭과 개명 후 연속성은 stable member UID로 유지한다. 이름만으로 자동 매칭·회비 배분하지 않는다.
- 전화번호, 주소, 계좌번호, 상대계좌번호, CMS 코드, receipt URL, token/provider 원문 body는 계속 제외한다.
- decision manifest, operation receipt, 로그, Git evidence에는 원문 snapshot을 넣지 않는다.
- 외래교수회 26개 행의 50,000원은 candidate-only이며 include/reject/quarantine 및 합계는 별도 source-decision 승인을 요구한다.
- 이 문서 생성은 외부 source write 0건, Development/Production DB write 0건이다.
