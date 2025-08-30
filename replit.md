## Overview

This is a full-stack web application for the Dongguk University Korean Medicine Alumni Association (동국한의동문회). It serves as a centralized, mobile-optimized platform to replace fragmented communication channels, integrating seamlessly with KakaoTalk workflows common in Korean organizations. The system provides core functionality for alumni management, a unified bulletin board system, membership fee management, and robust KakaoTalk integration, aiming to connect and support alumni effectively.

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
- **UI/UX**: Mobile-first responsive design, Kakao-inspired yellow and brown branding, Noto Sans KR font, unified info page with tabbed navigation, simplified header with logo, consolidated navigation.

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM
- **Session Management**: connect-pg-simple for PostgreSQL sessions
- **API Design**: RESTful endpoints with JSON responses

### Database Design
- **Primary Database**: PostgreSQL (Supabase)
- **ORM**: Drizzle with schema-first approach
- **Migration System**: Drizzle-kit for schema management
- **Connection**: Connection pooling with SSL for Supabase
- **Key Data**: Alumni records (synced from Google Sheets), user authentication data, post content, membership fee records, dynamic categories.

### Key Features
- **Authentication**: KakaoTalk OAuth, automatic alumni verification via Google Sheets, two-tier user system (regular/admin), pending registration workflow.
- **Content Management**: Unified bulletin board with dynamic categories, Markdown support, administrative moderation, static info pages.
- **Payment System**: Membership fee tracking, receipt generation, payment history.
- **Alumni Directory**: Integration with Google Spreadsheet graduation database, automatic matching, privacy-conscious display, unique identification via mobile number.
- **Administrative Tools**: Google SSO for admin login, pending registration approval, content management, Google Sheets synchronization monitoring.
- **Search Functionality**: Integrated search across posts and alumni records with tab-based filtering and real-time results.

### Data Flow
- **Authentication**: KakaoTalk OAuth -> Alumni database check -> Auto-approval/pending review.
- **Content**: User creation -> Metadata storage -> Categorization -> Display.
- **Payment**: Initiation -> Transaction recording -> Receipt generation -> History.
- **Admin**: Pending registrations -> Admin review -> Approval/rejection.

## External Dependencies

- **Database**:
    - **@neondatabase/serverless**: PostgreSQL connectivity
    - **drizzle-orm**: ORM for database operations
- **Frontend**:
    - **@tanstack/react-query**: Server state management
    - **wouter**: Client-side routing
    - **@radix-ui/***: Accessible UI primitives
    - **tailwindcss**: CSS framework
    - **class-variance-authority**: Component variant management
    - **lucide-react**: Icon library
- **Integrations**:
    - **KakaoTalk API**: For authentication and messaging.
    - **Google Sheets API**: For alumni database synchronization.
    - **Google SSO**: For administrator authentication.
- **Development Tools**:
    - **TypeScript**: For type safety
    - **Vite**: Fast development server and build tool
    - **tsx**: TypeScript execution for Node.js
    - **esbuild**: Fast JavaScript bundling