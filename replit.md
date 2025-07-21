# Replit.md

## Overview

This is a full-stack web application for the Dongguk University Korean Medicine Alumni Association (동국한의동문회). The system is built with a modern React frontend and Express.js backend, using PostgreSQL for data persistence. It provides core functionality for alumni management, bulletin board system, membership fee management, and KakaoTalk integration.

## User Preferences

- **언어**: 영어 프롬프트를 받아도 항상 한국어로 응답
- **로그 작성**: 모든 로그와 피드백을 한국어로 작성
- **커뮤니케이션 스타일**: 간단하고 일상적인 언어 사용

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query for server state, React Context for authentication
- **Build Tool**: Vite with custom configuration

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM
- **Session Management**: connect-pg-simple for PostgreSQL sessions
- **API Design**: RESTful endpoints with JSON responses

### Database Design
- **Primary Database**: PostgreSQL (configured for Neon serverless)
- **ORM**: Drizzle with schema-first approach
- **Migration System**: Drizzle-kit for schema management
- **Connection**: WebSocket-based connection pooling

## Key Components

### Authentication System
- KakaoTalk OAuth integration for login
- Automatic alumni verification against graduation database
- Two-tier user system (regular users and administrators)
- Pending registration workflow for unverified alumni

### Content Management
- Unified bulletin board system supporting multiple categories (announcements, obituaries, congratulations, general posts)
- Markdown-based content creation and editing
- Category-based content organization
- Administrative content moderation
- Static content pages (About, Executives, Bylaws, History) with Korean placeholder content
- Mobile-optimized navigation drawer with contextual menu items

### Payment System
- Membership fee tracking and management
- Automatic receipt generation
- Payment history and status tracking
- Annual fee management with year-based organization

### Alumni Directory
- Integration with Google Spreadsheet-based graduation database
- Automatic matching of KakaoTalk users with alumni records
- Manual verification workflow for unmatched users
- Privacy-conscious directory with masked personal information

### Administrative Tools
- Google SSO for administrator authentication
- Pending registration approval system
- Content management and moderation
- Bulk operations for content migration

## Data Flow

1. **User Authentication**: Users authenticate via KakaoTalk OAuth → System checks against alumni database → Auto-approval or pending review
2. **Content Creation**: Users create posts → Content stored with metadata → Category-based organization → Display in relevant sections
3. **Payment Processing**: Payment initiation → Transaction recording → Receipt generation → History tracking
4. **Admin Workflows**: Pending registrations → Admin review → Approval/rejection → User notification

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL database connectivity
- **drizzle-orm**: Database operations and schema management
- **@tanstack/react-query**: Server state management
- **wouter**: Client-side routing

### UI Dependencies
- **@radix-ui/***: Accessible UI primitives
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Component variant management
- **lucide-react**: Icon library

### Planned Integrations
- **KakaoTalk API**: For authentication and messaging
- **Google Sheets API**: For alumni database synchronization
- **Google SSO**: For administrator authentication

### Development Tools
- **TypeScript**: Type safety and developer experience
- **Vite**: Fast development server and build tool
- **tsx**: TypeScript execution for Node.js
- **esbuild**: Fast JavaScript bundling

## Deployment Strategy

### Development Environment
- **Platform**: Replit hosting with hot module replacement
- **Database**: Neon PostgreSQL serverless instance
- **Build Process**: Vite development server with Express.js proxy

### Production Deployment
- **Platform**: AWS (planned migration from Replit)
- **Database**: Neon PostgreSQL or AWS RDS PostgreSQL
- **Build Process**: Static frontend build served by Express.js
- **Process Management**: Node.js process with environment-based configuration

### Mobile Optimization
- **Primary Target**: KakaoTalk in-app browser
- **Design Approach**: Mobile-first responsive design
- **Font Strategy**: Noto Sans KR for Korean text readability
- **Color Scheme**: Kakao-inspired yellow and brown branding

The application is designed to replace fragmented communication channels with a centralized, mobile-optimized platform that integrates seamlessly with KakaoTalk workflows commonly used by Korean organizations.

## Recent Changes

### 2025-07-21: Header Redesign and Logo Integration
- Completely redesigned application header to match user's screenshot requirements
- Moved hamburger menu from right to left side of header per user request
- Integrated actual Dongguk University Korean Medicine Alumni Association logo
- Replaced star icon with authentic organizational logo (dgkmalogo_1753111820390.png)
- Added static file serving for attached assets via Express server
- Applied consistent header across all pages including static content pages
- Header now features: hamburger menu (left) + logo + title (center-left) + notification bell (right)

### 2025-07-21: Static Pages Consolidation
- Consolidated four static pages (About, Executives, Bylaws, History) into single unified info page
- Created tabbed navigation system for easy section switching within the info page
- Each section maintains distinct visual separation while being part of unified experience
- Updated navigation menu to show "동문회 정보" instead of individual page links
- Implemented automatic redirection from old individual page URLs to new consolidated page
- User feedback: "좋네. 마음에 들어" - confirmed satisfaction with consolidated design

### 2025-07-21: 앱 오류 수정 및 안정화
- React Hook 순서 위반 문제 해결: Home 컴포넌트 리팩터링으로 모든 Hook을 조건문 이전에 배치
- 누락된 Link 컴포넌트 import 추가 (wouter에서)
- Kakao 색상 유틸리티 CSS 클래스 문제 수정
- CSS 파일에 적절한 bg-kakao-yellow, text-kakao-brown 클래스 추가
- 데이터베이스 연결 확인 및 정상 작동 검증
- 사용자 선호도 추가: 모든 응답과 로그를 한국어로 작성

### 2025-07-21: UI 개선 및 통합
- /admin 페이지의 헤더-제목 간 간격 문제 해결: 다른 페이지와 일치하도록 pt-4 클래스 제거
- /profile 페이지에 /payments 기능 통합: 회비 관리를 별도 페이지가 아닌 프로필 내 섹션으로 이동
- 네비게이션 구조 개편: 기존 payments 라우트 제거, 모든 결제 관련 기능을 profile로 통합
- 햄버거 메뉴 위치 변경: 헤더에서 제거하고 하단 네비게이션 맨 오른쪽에 '전체' 메뉴로 배치
- 하단 네비게이션에 '정보' 메뉴 추가: 홈과 게시판 사이(두 번째 위치)에 /info 페이지 연결
- 홈 페이지 회원 정보 표시: 사이드 네비게이션과 동일한 정보를 홈 최상단에 추가
- 회원 정보 스타일링: 노란색 원형 아바타, 이름/졸업년도, 인증완료 태그로 구성
- 관리자 패널 네비게이션: 프로필 페이지의 관리자 패널 버튼에서 /admin 페이지 이동 기능 구현
- 페이지 이동 스크롤 최적화: admin 페이지 진입 시 자동으로 스크롤 위치를 맨 위로 리셋
- 홈-프로필 연결 기능: 홈의 회비 관리 버튼 클릭 시 프로필 페이지 회비 관리 섹션으로 직접 스크롤
- React Hook 순서 위반 문제 해결 및 헤더 가림 현상 방지를 위한 스크롤 오프셋 적용
- 홈 화면 관리자 플로팅 메뉴 제거: 우하단 주황색 버튼 삭제로 UI 정리
- 사이드바 완전 제거: SimpleNavigation 컴포넌트 삭제 및 모든 관련 코드 정리
- 네비게이션 단순화: 하단 네비게이션을 5개 메뉴로 최종 정리 (홈, 정보, 게시판, 동문록, 내정보)
- 사용자 피드백: "좋아요. 많이 깔끔해 졌습니다" - UI 단순화 및 모바일 최적화 완성

### 2025-07-21: 검색 기능 구현
- 우상단 알림 아이콘을 검색 아이콘으로 변경: 카카오톡 알림 방식에 맞춰 불필요한 알림 기능 제거
- 전용 검색 페이지 구현 (/search): 게시글, 동문 정보 통합 검색 제공
- 백엔드 검색 API 구현: 게시글 제목/내용 대상 Like 쿼리 기반 검색 기능
- 탭 기반 필터링: 전체/게시글/동문 별도 검색 결과 분류 표시
- 검색 결과 상호작용: 게시글 클릭 시 해당 카테고리 게시판으로 이동, 동문 클릭 시 동문록 페이지로 이동
- 실시간 검색: 입력과 동시에 TanStack Query를 통한 자동 검색 실행
- 모바일 최적화: 뒤로가기 버튼, 자동포커스, 터치 친화적 UI 구성
- 검색어 하이라이팅 및 미리보기: 게시글 내용 100자 미리보기로 관련성 확인 지원
- 검색 상태 관리: 검색어 없음/로딩중/결과 없음/결과 표시 상태별 적절한 UI 제공
- 검색 페이지 헤더 제거: 사용자 요청에 따라 개별 헤더 삭제하여 UI 단순화 완료
- API 라우트 충돌 해결: /api/posts/search와 /api/posts/:id 라우트 순서 수정으로 검색 기능 정상화
- 사용자 피드백: "깔끔합니다" - 검색 기능 및 UI 개선 완료 확인

### 2025-07-21: 게시판 카테고리 용어 정리
- '경조사' 카테고리를 '경사'로 변경: 부고(조사)와 경사 구분 명확화
- 데이터베이스 기존 게시글 카테고리 일괄 업데이트 완료
- 카테고리 배지 스타일링 및 관련 코드 전면 수정
- 사용자 피드백: "네. 좋아요" - 카테고리 용어 정리 승인

### 2025-07-21: 동적 카테고리 시스템 구현
- 새로운 categories 테이블 생성: 카테고리 관리를 데이터베이스 기반으로 전환
- posts 테이블 스키마 수정: category 컬럼을 categoryId 외래키로 변경
- 카테고리 속성 추가: displayName, color, badgeVariant, isActive, sortOrder 필드 구성
- 기존 게시글 마이그레이션: 하드코딩된 카테고리명을 새 시스템으로 자동 변환
- 백엔드 API 확장: categories CRUD 엔드포인트 추가 (/api/categories)
- 프론트엔드 업데이트: boards, search, home 페이지에서 동적 카테고리 정보 활용
- 카테고리별 배지 스타일: 데이터베이스에서 관리되는 badgeVariant로 동적 스타일 적용
- 사용자 피드백: "잘 됩니다 :)" - 동적 카테고리 시스템 구현 완료

### 2025-07-21: 카카오로그인 및 카카오싱크 구현
- 카카오 JavaScript SDK 초기화 및 환경 변수 설정 완료
- 실제 카카오 로그인 플로우 구현: scope 추가로 프로필 및 이메일 정보 수집
- users 테이블에 kakaoSyncEnabled 필드 추가: 카카오싱크 연동 사용자 구분
- 카카오싱크 간편가입 로직 구현: 동문 데이터베이스 자동 매칭 및 즉시 가입
- 백엔드 인증 API 개선: 카카오 사용자 정보 검증 및 등록 프로세스 자동화
- 로그인 UI 개선: "카카오로 시작하기" 버튼 및 카카오싱크 안내 문구 적용
- 승인 대기 메시지 개선: 동적 메시지 표시로 사용자 경험 향상
- 실제 카카오 로그인 테스트 성공: 승인 대기 플로우 정상 동작 확인
- 사용자 피드백: 카카오 로그인 버튼 클릭 시 가입 신청 팝업 정상 표시

### 2025-07-21: Google Sheets 동문 데이터베이스 연동 완료
- Google Sheets API 연동 구현: googleapis 라이브러리 설치 및 서비스 설정
- 보안 중심 뷰어 권한: 개인정보 보호를 위해 읽기 전용 액세스로 제한
- GoogleSheetsService 클래스 구현: 동문 데이터 조회, 검색, 연결 테스트 기능
- 자동 동기화 시스템: Google Sheets ↔ 로컬 데이터베이스 양방향 동기화
- 관리자 패널 통합: Google Sheets 연결 상태 모니터링 및 수동 동기화 기능
- 실시간 동문 매칭: 카카오 로그인 시 Google Sheets에서 직접 검색하여 즉시 매칭
- 환경 변수 보안: 서비스 계정 키, 스프레드시트 ID 등 민감정보 암호화 저장
- 오류 처리 및 폴백: Google Sheets 연결 실패 시 로컬 데이터베이스 자동 사용
- 데이터 파싱 최적화: 스프레드시트 구조 분석 및 정확한 이름/졸업년도 추출
- 3,390건 동문 데이터 연동 성공: 실시간 검색 및 자동 가입 승인 시스템 완료
- 캐시 시스템 구현: 반복 API 호출 방지 및 성능 최적화
- 동문 정확 매칭 성공: "강호권" 동문 실시간 검증 및 즉시 가입 처리 확인

### 2025-07-21: 헤더 알림 아이콘 기능 구현
- 공통 헤더 파일 확인: client/src/components/layout/app-header.tsx가 실제 전역 헤더
- 알림 아이콘 추가: 헤더 우측에 Bell 아이콘 및 빨간 알림 점 표시
- 클릭 이벤트 구현: 알림 아이콘 클릭 시 홈 페이지 '최근게시글' 섹션으로 자동 스크롤
- 부드러운 스크롤 애니메이션: scrollIntoView를 통한 사용자 친화적 네비게이션
- 모든 페이지 적용: App.tsx를 통해 전역적으로 헤더가 렌더링되어 모든 페이지에서 동일한 알림 기능 제공