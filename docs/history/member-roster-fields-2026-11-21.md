# 개발 동문 기본명부 직접 반영

2026-11-21(KST) Replit 개발 DB `heliumdb`에 적용했다. 구글 시트 `통합주소록` A:K를 읽어 A열 UUID와 기존 `users.id`를 일대일로 대조했다. B~K열 10개 명부 전용 컬럼을 nullable TEXT로 추가한 뒤 별도 트랜잭션에서 시트 값만 반영했다.

| 확인 항목 | 결과 |
|---|---:|
| 시트 UUID / 기존 회원 행 | 3,458 / 3,458 |
| UUID 누락·중복·한쪽에만 있는 행 | 0 |
| 업데이트 / 기존값 동일 / 신규 / 삭제 | 3,458 / 0 / 0 / 0 |
| 새 연결에서 10개 필드 전체 일치 / 불일치 | 3,458 / 0 |

트랜잭션 전후와 새 연결에서 명부 10개 필드를 제외한 기존 회원 컬럼 전체의 지문이 일치했다. 시트가 유일한 쓰기 원본이었다. 최종 CLI는 복제본을 조회하지 않으며, 이 CLI로 시트를 새로 읽은 후의 읽기 전용 대조에서도 변경 예정 0건·동일 3,458건이었다.

적용 후 metadata-only catalog에서 `heliumdb`, 읽기 전용 안전 조건, ROLLBACK, 완료 표식을 확인했다. public 테이블 13개·컬럼 119개, users 컬럼 26개다. 추가된 10개 모두 nullable TEXT·기본값 없음이다. catalog SHA-256은 `8b4b34ce787a891d359ee0821b17fb4057581c58197e266b2ee9f51e36362423`이다.

Replit에서 변경 소스의 ESLint와 앱 타입·의존 경계, 테스트 타입 검사가 통과했다. 최종 CLI에 대해 Node 구문 검사와 ESLint도 통과했다. 운영 DB·배포·실계정 QA는 보류했다. [절차](../runbooks/database-operations.md#개발-기본명부-직접-반영) · [스키마](../reference/database-schema.md#table_row-users)
