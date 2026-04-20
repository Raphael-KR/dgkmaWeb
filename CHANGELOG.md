# Changelog

All notable changes to dgkmaWeb (동국대학교한의과대학동문회 웹) are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-04-20

### Added
- 비로그인 외부인용 **공개 홈페이지** 신설 (다크그린/골드 브랜드 테마, 노션 공식 자산 기반)
- 4개 안내 페이지: `/about/intro`(소개), `/about/bylaws`(회칙), `/about/join`(회원가입 안내), `/about/dues`(회비), `/about/condolence`(경조사)
- 인증 게이트(`AuthGate`) + 로그인 모달(`LoginModal`) — 회원 메뉴 접근 시 비로그인 사용자에게 모달 노출, 로그인 후 원래 위치(`returnTo`)로 자동 이동
- 루트 라우트(`/`)에서 로그인 여부에 따라 회원 홈/공개 홈 자동 분기
- 공개 푸터에 공식 단체 정보(대표자 최윤용, 고유번호 504-82-90335, 소재지 서울 양천구 오목로 181, 이메일 alumni.dkom@gmail.com) 노출
- SEO 메타 태그 (`client/src/lib/seo.ts`) — 페이지별 title/description/OG/Twitter 카드
- 검색 미리보기용 **OG 대표 이미지** `/og-image.png` (1200×630, 다크그린 그라디언트 + 화이트 엠블럼)
- `sitemap.xml`, `robots.txt` 정적 파일 (회원 전용 경로 차단)
- **Google Search Console** 소유권 인증 메타 태그
- **Naver Search Advisor** 소유권 인증 메타 태그

### Changed
- 단체명 표기 통일: "동국대학교 한의과대학 동문회" → **"동국대학교한의과대학동문회"** (공백 제거, 학교 단독 언급은 기존 띄어쓰기 유지)
- 헤더 로고를 단일 라인 단체명 표기로 정리 (학교 부제 제거 — 독립 단체)
- 회원 구분 정의 갱신:
  - **회원**: 졸업자 + 대학원 졸업자 + 가입자
  - **권리회원**: 당해 회비 완납자 (의결권·피선거권·전용혜택)
  - **명예회원**: 회장 추천 + 이사회 승인
  - 회칙 제4·5·8조, 공개 홈 비교표, 가입/소개/경조사 페이지에 일괄 반영
- 헤더가 로그인 상태를 인지해 사용자 이름과 로그아웃 버튼을 노출 (공개 페이지에서도 동작)
- 하단 내비게이션이 공개 페이지에서도 표시되며, 회원 전용 탭 클릭 시 로그인 모달로 유도
- 공개 내비게이션 메뉴: 홈 / 소개 / 회칙 / 회원가입 / 회비 / 경조사 / 공지

### Fixed
- 카카오 로그인 콜백 후 `returnTo` 경로로 정상 복귀하도록 Supabase 인증 콜백 보정

## [1.0.0] - 2025-08-30

### Added
- 카카오 로그인 기반 인증 시스템
- Supabase PostgreSQL 17.4 백엔드 (Neon에서 마이그레이션)
- 동문 명부 (Google Sheets 연동, 3,390+ 동문 데이터)
- 회비 관리 및 영수증 기능
- 통합 게시판 + 동적 카테고리
- 통합 검색(게시글·동문)
- 관리자 도구 (Google SSO, 가입 승인, 시트 동기화 모니터링)
- 서비스 이용약관 / 개인정보 처리방침 페이지
