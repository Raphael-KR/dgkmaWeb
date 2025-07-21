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