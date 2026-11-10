# 초기 Drizzle migration 보관

이 폴더의 `0000_cheerful_nick_fury.sql`과 `meta/`는 초기 생성 시점의 migration·snapshot·journal이다. 현재 전체 스키마의 설치·업그레이드 순서를 나타내지 않는다.

이후 변경에는 `scripts/`의 수동 SQL과 본문 변환기, 앱 시작의 session DDL이 포함돼 있다. 초기 파일이나 `drizzle-kit migrate`만으로 현행 DB가 재현된다고 가정하지 않는다. 새 빈 DB의 baseline을 구성하는 작업은 별도 범위로 진행한다.

- 현행 구조: [DB 스키마 기준서](../docs/reference/database-schema.md)
- 도구별 대상·효과·완료 여부: [DB 스크립트 분류](../docs/reference/database-scripts.md)
- 실제 DB 작업: [DB 운영 런북](../docs/runbooks/database-operations.md)
