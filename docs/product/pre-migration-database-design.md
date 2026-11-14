# 이관 전 DB 변경안: 동문 사전 등록·게시글 메타데이터

동문 데이터의 users 전환과 posts 출처 저장을 위한 설계다. 관리 원본·탈퇴 보존 범위·고정 ID에 관한 제품 결정은 아래에 반영했다. users 변경과 초기 복사는 미적용이다. posts 메타데이터의 적용 상태는 [스키마 기준서](../reference/database-schema.md#게시글-이관-출처-저장)를 따른다.

## 목표와 범위

- 목표: 전 동문을 users.id로 식별하고 미가입 기록을 연결하며, 카페 원작성자·작성일·출처를 posts에 저장한다.
- 범위: 필드·상태·관리 원본·가입/탈퇴·동기화 종료·집계·전환 순서.
- 완료 조건: 현재 구조와 변경안, 확정 결정, 구현 영향·적용 조건을 설명한다.
- 제외: DB 조회/DDL/DML·Sheets 쓰기·자료 이관·배포·실계정 QA.
- 확인: 현재 소스와 문서 대조, 문서 링크·diff 정합성만 확인한다.

## 확정한 관리 원본과 보존 기준

1. 명부는 최초 이관 입력이다. 한 번 users에 반영한 뒤에는 Google Sheets·alumni_database를 로그인·동문 조회·심사·수정·재가입의 원천으로 다시 참조하지 않는다.
2. 전환 후 지속적인 인물 정보의 정본은 users다. 카카오가 제공하는 가입자 이름·이메일·전화·사진·생일은 기존 사용자 카카오 신원으로 확인한 뒤 갱신한다. 카카오가 제공하지 않는 학과·기수·입학/졸업 정보·직책·관리 메모는 변경하지 않는다.
3. 탈퇴 후에도 users의 동문 행·고정 ID·동문 기본 이름·명부 전화번호·학적/동문 관리 기록은 유지한다. 카카오 연결·가입 이메일·가입 전화·사진·생일·동의/동기화 상태·활동지역과 로그인 세션을 정리한다. 미발행 초안·게시된 글·댓글·결제 보존은 기존 제품 정책과 아래 전환 영향에 맞춰 처리한다.
4. 전화번호 변경과 관계없는 고정 동문 ID를 추가한다. 최초 이관 준비 시 원본에 ID를 부여하고 users에 함께 저장한다. 이관 후 Sheets 재조회·지속 동기화에는 사용하지 않는다.
5. 다음카페 이관 글은 users와 연결하지 않는다. 가입 후에도 수정·삭제 권한을 부여하지 않으며 이름·시각·출처는 posts 메타데이터로 제공한다.

## 현재와 변경 후

| 영역 | 현재 코드 | 변경안 |
|---|---|---|
| users | 로그인 회원 중심. name·email 필수, kakao_id NULL 허용 | 모든 동문의 인물 행. 이메일 NULL 허용, 가입 상태·고정 동문 ID·기본 동문 정보 추가 |
| 명부 | Sheets → alumni_database, matched_user_id로 users 연결 | 일회성 preview·대조·이관 후 users만 사용. 기존 복제본은 런타임에서 제외 |
| 신규 가입 | 명부 미연결 행에 대해 users INSERT | users의 미가입 인물과 일치시키고 같은 행에 카카오 신원을 연결 |
| 탈퇴 | users DELETE, 명부/콘텐츠/회비 연결 해제 | 인물 행 유지·가입 정보 정리. 회원 접근 차단과 카카오 종료 경쟁 처리는 유지 |
| 통계 | users 전체가 membersTotal | 전체 동문·미가입·가입 완료·승인 대기 구분 |
| posts | author_name은 개발에 추가됨. 출처는 본문·로컬 대응표 중심 | author_name과 구조화 import_data로 읽기·중복 판정·메타데이터 UI 제공 |

실제 DB 건수·중복·현재 원본은 이번에 조회하지 않았다. [작성자 이름 개발 적용](../history/post-author-name-2026-11-14.md)과 운영 적용을 구분한다.

## users 필드 변경안

| 필드 | 형식·역할 |
|---|---|
| id | 기존 INTEGER PK. 기존 회원 ID와 모든 FK를 보존 |
| alumni_uid | UUID UNIQUE. 최초 이관 대상 동문에게 부여하는 불변 ID. 이관되지 않은 기존 행은 매핑 확정 전 NULL 허용 |
| registration_status | TEXT NOT NULL: pre_registered / registered / withdrawn. 회원 등급과 별개 |
| joined_at | TIMESTAMPTZ NULL. 실제 가입 완료 시각. 인물 행의 created_at과 구분 |
| email | 기존 UNIQUE 유지, NOT NULL만 해제. 미가입·탈퇴는 NULL이며 가짜 이메일을 만들지 않음 |
| alumni_name / alumni_mobile | TEXT NULL. 최초 명부의 기본 이름·핸드폰. 가입 프로필과 구분해 보존하며 관리자 정정 대상 |
| department / generation | TEXT NULL. 학과·기수 |
| admission_date / graduation_date | TEXT NULL. 원문에 있는 날짜 정밀도 유지 |
| alumni_group / alumni_status / alumni_position / alumni_memo | TEXT NULL. 명부의 그룹·상태·동문회직책·메모. 관리자용 범위를 유지 |
| 기존 name·phone_number·email·profile_image·birthday 등 | 카카오 가입 프로필. name은 사전 등록 시 기본 동문 이름으로 초기화하며, 가입 이후 카카오 이름 갱신. 탈퇴 시 name은 users.alumni_name으로 되돌리고 가입 프로필을 비움 |
| 기존 graduation_year | 학적 정보에서 도출하는 기존 호환 필드. 카카오 값으로 덮어쓰지 않음 |

주소·일반 전화는 추가 수집·복사하지 않는다. 메모·고정 ID·기본 전화 등 추가 저장 필드를 회원 DTO에 일괄 노출하지 않는다. 현재 명부의 회원 열람 범위와 관리자 조회 범위를 users 조회로 옮기며 확대하지 않는다.

사전 등록·탈퇴 행은 is_verified=false, is_admin=false, kakao_sync_enabled=false이고 kakao_id=NULL이다. registered 상태만으로 접근을 허용하지 않으며 기존 승인·관리자 가드를 함께 검사한다. 승인 취소/거부를 pre_registered로 덮어써 재로그인을 자동 허용하지 않는다.

카카오 연결 후에는 kakao_id로 기존 사람을 먼저 찾는다. 같은 사람의 프로필이 갱신되어도 명부와 다시 대조하거나 신규 인물을 만들지 않는다. 필수 동의 값 누락·타 계정 이메일/전화 충돌은 구체적으로 처리하며 정상 값을 빈 값으로 덮어쓰지 않는다. 고정 동문 ID는 비밀번호나 인증 수단이 아니다.

### 최초 이관과 등록

- 기존 users와 최초 명부의 이름·정규화 휴대전화 및 기존 연결을 대조한다. 이미 가입한 계정은 같은 users.id를 유지하고 확인된 동문 기본 필드만 추가한다. 가입 프로필을 명부로 덮어쓰지 않는다.
- 미가입 동문은 새 users 행을 만들되 로그인·가입 동의·권리회원 자격을 부여하지 않는다. 가입일은 NULL로 둔다.
- 동명이인·다중 연결·원본 중복·기존 계정 충돌은 임의 병합하지 않고 개별 보류한다. 같은 고정 ID로 두 행이 만들어지지 않도록 제약과 트랜잭션을 사용한다.
- 최초 가입은 users.alumni_name·alumni_mobile의 유일 일치와 기존 카카오 연결 유무를 확인해 해당 행을 잠근 뒤 연결한다. 일반 이름만으로 선택하지 않는다. 일치하지 않으면 기존 관리자 심사를 사용한다.
- 가입 대기·거부·재심사·승인 취소·재가입의 후보 검색은 users의 동문 기본 정보로 바꾼다. 기존 pending_registrations는 심사 기록으로 유지한다.

### 탈퇴

카카오 unlink 확인 → OAuth 종료 marker·세션 종료 → 가입 정보 정리 → withdrawn 전환을 기존 신원 잠금·트랜잭션과 맞춘다. 명부에서 다시 복원하거나 초기화를 반복하지 않는다. 기존에 보존한 alumni_name·alumni_mobile 등 users 내부 동문 기본 필드만 유지한다.

카카오에서 수집한 현재 전화와 최초 명부 전화는 서로 다른 필드이므로 동일한 값이더라도 가입 전화 필드는 삭제하고 동문 기본 전화 필드는 유지한다. 재가입은 새 동의·확인·심사를 거치며 거부·취소·탈퇴 상태를 우회하지 않는다.

동문 관리용 납부·수상·기부 등 이미 연결된 기록은 같은 users.id를 유지하는 안이다. 기존 정상 가입자가 직접 작성한 게시글·댓글의 탈퇴 시 익명화와 미발행 초안 삭제는 기존 정책을 유지한다. 이관 글은 계속 author_id=NULL이다. 회비 계산식·새 납부 관리 기능은 이번 작업에 포함하지 않는다.

## posts 필드 변경안

| 항목 | 저장·표시 |
|---|---|
| author_id | 기존 users FK. 이관 글은 NULL. 표시명으로 회원을 자동 연결하지 않음 |
| author_name | 원작성자 이름 TEXT NULL. 개발 구현 유지 |
| import_data | JSONB NULL 신설. 원본 정체성·원작성일·출처·이관 시각 저장. 일반 작성/수정 API는 입력 불가 |
| content | 본문·허용 서식. 작성자/날짜/출처 안내 문단은 합성하지 않음. 학술 자료는 첫 문단 #학술 |
| published_at | 원작성 시각으로 기존 정렬 유지. 시간대 변환을 명시하고 원본 정밀도에 맞춰 표시 |
| created_at | 대상 행 생성 시각. 원작성일과 구분 |

import_data의 필수 항목은 schemaVersion=1, platform(daum-cafe 또는 band), containerId, sourceId(게시판ID:글번호), boardPath, url, originalCreatedAt(시간대 포함 ISO), timePrecision(minute 또는 day), importedAt이다. 계약은 코드의 검증 스키마와 DB CHECK를 함께 정의한다. 인증정보·원문 전체·로컬 경로는 넣지 않는다. 경조사의 event_data·source_text를 전용하지 않는다.

플랫폼/컨테이너/복합 원본 ID에 부분 UNIQUE 표현식 인덱스를 추가해 중복 이관을 막는 안이다. 원본 ID 없는 항목은 임의 식별자를 만들지 않고 개별 보류한다. 날짜만 확인되는 원문은 KST 날짜와 day 정밀도를 유지하고 UI에 임의의 00:00을 노출하지 않는다. published_at의 기존 timestamp without time zone에는 ISO 시각을 UTC 기준으로 명시적으로 변환해 저장한다.

목록·상세·검색·가린 글은 연결 users.name → author_name → 작성자 정보 없음으로 표시한다. 원작성일·플랫폼·게시판·출처 링크는 본문 밖의 메타데이터 UI에서 제공한다. 적용 상태·원본/대상 ID·영수증은 로컬 SQLite로 추적하며 서버에 이관 전용 테이블을 추가하지 않는다.

## 구현과 전환 순서

1. 구체적인 필드·제약·영향과 개발 적용 범위를 확인한다. 승인된 범위에서 실제 users/명부 매핑·중복·충돌의 읽기 전용 preview를 준비한다. 현재 원본 상태와 과거 기록을 구분한다.
2. 개발 DB에 additive 컬럼과 제약을 적용하고 catalog·스키마 기준서를 갱신한다. 기존 계정 ID·회원 글·납부 연결은 보존한다. 별도 백업은 자동 생성하지 않는다.
3. 가입·탈퇴·관리자 심사·명부 조회·동문 권한/기수 조회·호칭·통계·신원 충돌 조회를 users 기준으로 구현한다. 단순 FK 연결이나 users 행 존재를 가입 완료로 처리하지 않는다.
4. 일회성 동문 이관을 preview/apply로 수행한다. 기존 회원·사전 등록·동일·충돌·보류를 구분하고 새 연결에서 고정 ID·건수·기존 ID/연결 보존을 확인한다.
5. 런타임과 운영 도구의 Sheets/alumni_database 읽기·동기화 경로를 제거한다. 더 이상 읽지 않는 것을 사용처로 확인한다. 기존 원본·옛 테이블·Secrets의 실제 삭제는 대상과 영향이 정해진 별도 작업으로 구분한다. 무단 삭제하거나 운영까지 자동 적용하지 않는다.
6. posts 메타데이터·표시·이관 도구를 구현한 뒤 최종 카페 자료를 재생성한다. 기존 테스트 글의 출처 문단 변경은 실제 적용 preview와 분리한다.
7. 개발 직후에는 필요한 타입·lint·서식 정적 검사만 수행한다. 실제 가입·탈퇴·원본 연동 시험은 별도 실행 범위이며 정적 검사로 경쟁/트랜잭션 성공을 주장하지 않는다.
8. 운영 스키마·코드 릴리스·동문/카페 데이터 적용의 대상·순서를 별도로 정한다. 이관 결과는 다음카페와 밴드를 합산하지 않는다.

## 확인한 소스와 한계

[스키마](../../server/db/schema/index.ts), [카카오 가입](../../server/modules/identity/kakao-login.ts), [명부 등록](../../server/modules/registry/alumni-record-storage.ts), [탈퇴](../../server/modules/identity/registration-support.ts), [Sheets 동기화](../../server/modules/registry/alumni-sync-storage.ts), [동문 열람](../../server/modules/registry/directory-storage.ts), [통계](../../server/modules/statistics/queries.ts)를 정적으로 대조했다. 이번 단계에서는 DB·Sheets·외부 서비스·서버 상태를 변경하거나 조회하지 않았다. API·화면·실계정 QA는 미실행이다.
