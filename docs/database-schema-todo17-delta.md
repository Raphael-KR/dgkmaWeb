# Todo 17 Development schema delta

이 문서는 아직 Development Database에 적용되지 않은 Todo 16 생성 산출물의 결정적 변경 목록이다. 현재 검증 상태를 기술하는 `docs/database-schema.md`를 선반영하거나 적용 완료로 간주하지 않는다.

> Development 적용은 Todo 17의 단일 운영 승인 경계까지 미실행 상태다. 2026-08-10 disposable 검증에서 strict actor receipt, sequence 50–60, 여섯 category 승인, category 재실행 `verified_noop`, metadata-only catalog `ROLLBACK`, database 부재를 재현했다.

- sequence 10: 현재 13개 애플리케이션 테이블의 빈 disposable baseline을 재현한다.
- sequence 15: 기존 데이터의 `pre_anchor_blocking` 및 `legacy_not_valid` 예외를 append-only로 캡처한다.
- sequence 20: pre-anchor 차단을 재확인하고 기존 테이블 무결성 및 네 개의 legacy payment `NOT VALID` CHECK를 적용한다.
- sequence 30: manifest가 소유하는 회계·회비·출처·감사 테이블, 키, CHECK, FK와 인덱스를 생성한다.
- sequence 40: capability에 따라 preferred `btree_gist` 또는 deterministic fallback 범위 계약을 선택한다.
- sequence 50: logical-source identity 10개, 승인된 현재 editorial source release 2개, historical source release 0개, bank account/map 각 2개, draft policy 16개, draft position mapping 46개와 draft category 6개를 synthetic/frozen migration actor에 결합해 seed한다. 나머지 source release 8개는 Todo 18의 source별 profile·mapping 승인 뒤에만 생성한다.
- sequence 60: PUBLIC schema/table/sequence/routine 권한과 default privileges를 fail-closed 상태로 조정한다.
- sequence 65: sequence 15에 남은 legacy-payment 예외가 0일 때만 네 CHECK를 검증하는 선택적 validator다.

Todo 17 도구는 sequence 50의 actor를 임의의 첫 관리자가 아니라 receipt의 exact user ID·UID와 transaction-local 설정에 결합한다. Development receipt는 사용자 315, verified through-40 release와 여섯 ledger row digest에 결합된 closed canonical JSON+LF이며, 현재 `HEAD`에 같은 bytes로 commit된 경우에만 sequence 50을 허용한다. Category 승인은 여섯 draft root에 version 2 approved successor만 append하고, 16개 dues policy와 46개 position mapping은 draft로 유지한다.

다음 단계는 단일 운영 승인 후 Replit SSH에서 Development target identity를 다시 확인하고 1→40을 적용하는 것이다. 차단 예외가 없을 때만 strict receipt를 생성·단독 commit한 뒤 50→60과 category 승인을 계속한다. 마지막에는 migrated startup, metadata-only catalog `ROLLBACK`, 전체 reapply `verified_noop`을 확인하고, 그 실제 관찰 결과로만 `docs/database-schema.md`와 이 문서를 갱신한다.
