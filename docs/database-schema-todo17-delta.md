# Todo 17 Development schema delta

이 문서는 아직 Development Database에 적용되지 않은 Todo 16 생성 산출물의 결정적 변경 목록이다. 현재 검증 상태를 기술하는 `docs/database-schema.md`를 선반영하거나 적용 완료로 간주하지 않는다.

> 운영 적용 차단: sequence 50의 source-release, bank-account/source-map, draft policy/mapping seed 폐쇄성이 Todo 17 계약과 일치하고 전체 catalog 검증이 이를 재현하기 전에는 이 산출물을 Development에 적용하지 않는다.

- sequence 10: 현재 13개 애플리케이션 테이블의 빈 disposable baseline을 재현한다.
- sequence 15: 기존 데이터의 `pre_anchor_blocking` 및 `legacy_not_valid` 예외를 append-only로 캡처한다.
- sequence 20: pre-anchor 차단을 재확인하고 기존 테이블 무결성 및 네 개의 legacy payment `NOT VALID` CHECK를 적용한다.
- sequence 30: manifest가 소유하는 회계·회비·출처·감사 테이블, 키, CHECK, FK와 인덱스를 생성한다.
- sequence 40: capability에 따라 preferred `btree_gist` 또는 deterministic fallback 범위 계약을 선택한다.
- sequence 50: 승인된 logical-source registry와 여섯 개의 draft accounting category root를 synthetic/frozen migration actor에 결합해 seed한다.
- sequence 60: PUBLIC schema/table/sequence/routine 권한과 default privileges를 fail-closed 상태로 조정한다.
- sequence 65: sequence 15에 남은 legacy-payment 예외가 0일 때만 네 CHECK를 검증하는 선택적 validator다.

Todo 17은 Replit SSH에서 Development target identity, authority commit과 actor receipt를 다시 확인한 뒤 1→40과 50→60을 분리 적용하고, metadata-only catalog를 `ROLLBACK`으로 끝낸 후에만 `docs/database-schema.md`를 실제 관찰 결과로 갱신한다.
