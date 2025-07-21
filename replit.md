# Replit.md

## Overview

This is a full-stack web application for the Dongguk University Korean Medicine Alumni Association (동국한의동문회). The system is built with a modern React frontend and Express.js backend, using PostgreSQL for data persistence. It provides core functionality for alumni management, bulletin board system, membership fee management, and KakaoTalk integration.

## User Preferences

Preferred communication style: Simple, everyday language.

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