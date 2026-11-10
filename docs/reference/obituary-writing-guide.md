# 부고 작성 기준과 구현 위치

현재 제품 정책은 [경조사 입력·등록](../product/planning-proposal.md#경조사-입력과-등록)과 [게시문 호칭](../product/planning-proposal.md#게시글과-경조사-통합)을 따른다. 통합 코드·DB·운영 적용은 완료됐으며 최신 적용 상태는 [Replit 기준서](../../replit.md#현재-적용-상태)에 있다.

## 현재 작성 경로

- 입력은 짧은 텍스트·공개 링크이며 상세 필드 폼은 사용하지 않는다. 누락·충돌한 사실만 질문하고 작성자가 미리보기 확인 후 게시한다.
- 사실 JSON은 `posts.event_data`, 생성 본문은 `posts.content`의 Tiptap JSONB로 구분한다. 회원 신원·등급·본인/관리자 대리 등록은 서버가 판단한다.
- 호칭은 동문·회원·권리회원이며 정회원은 회원으로 정규화한다. 없는 날짜·관계·계좌·연락처를 추측하지 않는다. 본인상은 대상 동문과 고인을 일치시키고 유가족 연락처를 사용한다.
- 공개 수집은 [공통 수집기](../../server/integrations/public-sources/notice-collector.ts), 자연어 해석은 [서버 추출](../../server/modules/events/notice-extraction.ts), 정규화·문안은 [렌더러](../../server/modules/events/notice-rendering.ts)를 사용한다.
- 부고 원본 스킬에서 가져온 Python 생성·형식 코드는 [저장소 작성기](../../server/modules/events/writer/README.md)에 포함돼 있다. Replit은 Mac의 스킬 경로에 의존하지 않는다. 원본 CLI의 외부 URL 조회를 앱 서버의 공개 주소 검사 대신 사용하지 않는다.
- 웹서비스 산출물은 홈페이지 게시문이다. 카카오톡·문자 발송 기능이나 전송 승인을 뜻하지 않는다.

## 과거 양식

[통합 전 부고 지침](../history/obituary-writing-before-integration.md)은 2026-07-11의 Notion 출처·양식·예시를 보존한다. 그 안의 상세 폼·정회원·기타 유형·옛 데이터 경로는 현재 계약이 아니다. 현재 제품 정책과 저장소 작성 코드보다 우선하지 않는다. 경사 기준은 [프로젝트 스킬](../../.agents/skills/dgkma-celebration-writer/SKILL.md)과 확정 제품 정책을 함께 따른다.
