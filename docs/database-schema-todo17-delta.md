# Todo 17 Development schema delta

이 문서는 Todo 17에서 Development Database에 적용·검증한 결정적 변경 기록이다. 현재 검증 상태는 `docs/database-schema.md`가 권위다.

> 2026-08-10 Development에 sequence `1,10,15,20,30,40,50,60`을 적용했다. strict actor receipt commit은 `4711badbb13e236df8a1f00f4f87156d31960d98`; 전체 재실행 8개와 category 재실행은 `verified_noop`, migrated startup DDL은 0, metadata-only catalog는 `ROLLBACK`으로 끝났다. Production 작업은 0이다.

- sequence 10: 현재 13개 애플리케이션 테이블의 빈 disposable baseline을 재현한다.
- sequence 15: 기존 데이터의 `pre_anchor_blocking` 및 `legacy_not_valid` 예외를 append-only로 캡처한다.
- sequence 20: pre-anchor 차단을 재확인하고 기존 테이블 무결성 및 네 개의 legacy payment `NOT VALID` CHECK를 적용한다.
- sequence 30: manifest가 소유하는 회계·회비·출처·감사 테이블, 키, CHECK, FK와 인덱스를 생성한다.
- sequence 40: capability에 따라 preferred `btree_gist` 또는 deterministic fallback 범위 계약을 선택한다.
- sequence 50: logical-source identity 10개, 승인된 현재 editorial source release 2개, historical source release 0개, bank account/map 각 2개, draft policy 16개, draft position mapping 46개와 draft category 6개를 synthetic/frozen migration actor에 결합해 seed한다. 나머지 source release 8개는 Todo 18의 source별 profile·mapping 승인 뒤에만 생성한다.
- sequence 60: PUBLIC schema/table/sequence/routine 권한과 default privileges를 fail-closed 상태로 조정한다.
- sequence 65: sequence 15에 남은 legacy-payment 예외가 0일 때만 네 CHECK를 검증하는 선택적 validator다.

Todo 17 도구는 sequence 50의 actor를 receipt의 exact user ID·UID와 transaction-local 설정에 결합했다. Development receipt는 사용자 315, verified through-40 release와 여섯 ledger row digest에 결합되었고 현재 `HEAD` bytes를 재증명한 뒤에만 sequence 50을 허용했다. Category 여섯 tip은 승인되었으며, 16개 dues policy와 46개 position mapping은 모두 draft로 유지된다.

Brownfield 적용 중 두 fail-closed 결함을 수정했다. Sequence 10은 13-table/112-column baseline 객체 digest를 검증한 뒤 idempotent DDL을 실행하도록 고쳤고, sequence 20은 raw pre-anchor predicate를 독립 재검사한 뒤 정확한 `10…/82 10…→010…` generated canonical column으로 교체한다. 관리자 후보 315의 원본 전화번호 교정 시도는 정확한 정규화상 유효함이 확인되어 transaction이 사전조건에서 rollback됐고 데이터 변경은 0건이었다.

다음 단계는 Todo 18의 source별 profile·mapping 승인과 explicit decision preview다. Sequence 65, dues policy/mapping 승인, Production, merge·deploy는 계속 제외된다.
