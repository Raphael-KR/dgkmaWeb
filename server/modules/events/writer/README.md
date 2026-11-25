# 부고 작성기 원본

2026-11-09 `dgkma-obituary-writer`의 Python 스크립트 3개를 복제했다. 2026-11-25에 [기준 스킬](/Users/raphael/Playground/codex-agent-governance/codex-personal-assets/skills/dgkma-obituary-writer/SKILL.md)의 명예회장 형식을 생성기와 검증기에 반영했다. 웹 어댑터는 직함이 명시된 경우 검증한 머리말을 게시글 제목에도 전달한다. 스킬 경로는 출처 기록이다.

`bridge.py`는 stdin의 JSON만 받아 홈페이지 본문을 작성·검증한다. upstream CLI의 URL 조회 기능은 웹에서 실행하지 않는다. 공개 링크는 기존 서버의 SSRF 방어 fetcher로 읽는다. Python 3.10+ 표준 라이브러리만 필요하며 서버 실행 cwd에 이 디렉터리가 포함되어야 한다.

| 프로젝트 파일 | SHA-256 |
|---|---|
| render_obituary.py | `4c0302ef9c27e3bd45c04ef0cd3b203b75442f2e566e613ff19438d3a9b9ed23` |
| validate_obituary.py | `d475627448171b3f4ebec69117b107efb88806f2171c8ccdd62bfe3c3982a075` |
| extract_gipoom.py | `c88b0692d494e5a514cb7a66f4be940f79e3a09b44e3ffc89b6502c5b1598437` |
