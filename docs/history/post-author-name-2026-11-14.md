# 게시글 작성자 이름 — 2026-11-14

연결 회원 이름 → 원작성자 이름 → 작성자 정보 없음 순서로 표시한다. posts.author_name TEXT NULL 컬럼을 개발 heliumdb에 트랜잭션으로 추가했다. 사전/새 연결 posts 건수는 87→87, 컬럼 text·NULL 허용을 확인했다. 기존 글·본문·계정 연결은 변환하지 않았다. 별도 백업·운영 작업은 하지 않았다.

metadata-only catalog marker를 확인했다. Replit .superpowers/post-author-name-catalog.csv의 SHA-256은 29e405a77d3a6666ce1b8889874b9473c50da31afaced227ffe9adb3839f65b2다.

앱 타입·의존 경계 통과. 테스트 타입에서 새 필드가 빠진 기존 대역 한 곳을 수정했다. Replit 개발 환경에서 앱 타입·의존 경계, 테스트 타입, 변경 6개 파일 lint·서식 검사를 통과했다. 초기 테스트 대역 누락과 두 파일 서식 지적은 수정 후 해당 검사를 재수행했다. 실행형 테스트·빌드는 추가하지 않았다. 런타임·실계정 QA·이관·배포는 미실행이다.
