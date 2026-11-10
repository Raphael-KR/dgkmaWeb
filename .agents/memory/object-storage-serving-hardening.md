# Object Storage 보안 경계 참고

과거 Replit blueprint의 공개 업로드·다운로드와 저장된 Content-Type 신뢰 문제를 확인한 것이 이 메모의 배경이다. 당시 경로·예제 구현은 현행 코드가 아니며, 현재 정책과 구현의 기준은 [위협 모델](../../docs/architecture/threat-model.md#browser-to-application-to-object-storage)과 아래 소스다.

- [업로드·조회 라우트](../../server/integrations/object-storage/routes.ts): 세션·실제 회원 확인, 앱 경유 업로드의 서명 토큰·MIME·바이트 제한, 첨부를 참조하는 게시글의 열람 권한을 유지한다.
- [오브젝트 제공](../../server/integrations/object-storage/objectStorage.ts): 경로 검증, `private, no-store`, 비이미지의 `application/octet-stream`·attachment와 `nosniff` 처리를 따른다.
- [게시글 첨부 입력](../../shared/contracts/post-input.ts): `/objects/` 접두사 확인만으로 대신하지 않고 공통 경로 문법을 검증한다. 실제 열람 권한은 서버에서 별도로 확인한다.

서명된 업로드 대상과 세션 존재만으로 파일 소유권이 증명되는 것은 아니다. 현행 미참조 업로드의 회원 미리보기 경계와 가린 글의 첨부 제한을 구분하며, 이 메모를 새 권한·보안 동작의 도입 승인으로 사용하지 않는다.
