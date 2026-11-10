# 부고 작성기 원본

2026-11-09 `dgkma-obituary-writer`의 검증된 Python 스크립트 3개를 변경 없이 복제했다. 원본: `/Users/raphael/.agents/skills/dgkma-obituary-writer/scripts/`. 개인 경로는 출처 기록이며 런타임 의존이 아니다.

`bridge.py`는 stdin의 JSON만 받아 홈페이지 본문을 작성·검증한다. upstream CLI의 URL 조회 기능은 웹에서 실행하지 않는다. 공개 링크는 기존 서버의 SSRF 방어 fetcher로 읽는다. Python 3.10+ 표준 라이브러리만 필요하며 서버 실행 cwd에 이 디렉터리가 포함되어야 한다.

| 원본 파일 | SHA-256 |
|---|---|
| render_obituary.py | `ec1904715cadcdf0825bbe2fbac455e82d682d255d6fd8c74f519c53568a203e` |
| validate_obituary.py | `b51f260b57f9ac437d89abe2132cb174e3bead7b578b90990c858f5f4cd3df92` |
| extract_gipoom.py | `c88b0692d494e5a514cb7a66f4be940f79e3a09b44e3ffc89b6502c5b1598437` |
