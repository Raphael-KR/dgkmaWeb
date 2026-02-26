# CLAUDE.md — AI Assistant Guide for dgkmaWeb

This file provides essential context for AI assistants working on this codebase. Read it before making any changes.

---

## Project Overview

**dgkmaWeb** is a full-stack alumni association web platform for the **Dongguk University Korean Medicine Alumni Association** (동국대학교 한의과대학 동문회). It handles alumni authentication via Kakao OAuth, alumni directory management (synced from Google Sheets), bulletin boards, obituary notifications, membership fee payment tracking, and organizational heritage content.

---

## Technology Stack

### Frontend
- **React 18** + **TypeScript 5** with strict mode
- **Vite 5** as build tool and dev server
- **Wouter** for client-side routing (lightweight, not React Router)
- **TanStack React Query 5** for server state / data fetching
- **shadcn/ui** (55+ components, new-york style) + **Tailwind CSS 3**
- **React Hook Form** + **Zod** for forms and validation
- **Framer Motion** for animations
- **Recharts** for data visualization
- **Lucide React** + **React Icons** for icons

### Backend
- **Node.js 20** + **Express.js 4** + **TypeScript** (ESM modules)
- **Drizzle ORM** with **PostgreSQL** (Supabase-hosted)
- **Zod** for runtime validation
- **express-session** + **connect-pg-simple** for sessions
- **Google Sheets API** for alumni data sync
- **Kakao OAuth 2.0** for authentication

### Build & Deploy
- Dev: `tsx` runs TypeScript server directly
- Production: `vite build` (frontend) + `esbuild` (server bundle)
- Hosted on **Replit** (port 5000, mapped externally to 80)

---

## Repository Structure

```
dgkmaWeb/
├── client/src/
│   ├── pages/           # Route-level page components
│   ├── components/
│   │   ├── ui/          # shadcn/ui components (do not hand-edit)
│   │   ├── heritage/    # Heritage section sub-components
│   │   └── layout/      # Header, bottom navigation
│   ├── hooks/           # use-auth, use-mobile, use-toast
│   ├── lib/             # auth.ts, queryClient.ts, supabase.ts, utils.ts
│   ├── App.tsx          # Router, providers
│   └── main.tsx         # React root
├── server/
│   ├── index.ts         # Express entry, middleware, HTTP listen
│   ├── routes.ts        # All API route handlers
│   ├── db.ts            # Drizzle ORM + PostgreSQL pool
│   ├── storage.ts       # IStorage interface + DatabaseStorage class
│   └── google-sheets.ts # GoogleSheetsService (sync + caching)
├── shared/
│   └── schema.ts        # Drizzle table definitions + Zod insert schemas
├── migrations/          # Drizzle-generated SQL migrations
├── attached_assets/     # Static uploaded files served at /attached_assets
├── vite.config.ts
├── tailwind.config.ts
├── drizzle.config.ts
├── tsconfig.json
└── .env / .env.example
```

---

## Path Aliases

Defined in `tsconfig.json` and `vite.config.ts`:

| Alias | Resolves To |
|-------|-------------|
| `@/*` | `client/src/*` |
| `@shared/*` | `shared/*` |

Always use these aliases — never use relative `../../` paths from client code to reach shared types.

---

## NPM Scripts

```bash
npm run dev       # Start dev server (tsx + Vite HMR) on port 5000
npm run build     # Build frontend (Vite) + bundle server (esbuild)
npm run start     # Run production build
npm run check     # TypeScript type-check only (no emit)
npm run db:push   # Push schema changes to DB via drizzle-kit
```

No test runner is configured. `npm run check` is the closest equivalent — run it to catch type errors.

---

## Database Schema (`shared/schema.ts`)

All Drizzle table definitions live here and are imported by both client and server.

| Table | Key Columns |
|-------|------------|
| `users` | `id`, `kakaoId` (unique), `email`, `name`, `graduationYear`, `isVerified`, `isAdmin` |
| `categories` | `id`, `name` (unique), `displayName`, `color`, `isActive`, `sortOrder` |
| `posts` | `id`, `title`, `content`, `categoryId` (FK), `authorId` (FK), `isPublished` |
| `payments` | `id`, `userId` (FK), `amount`, `year`, `type`, `status` |
| `alumniDatabase` | `id`, `name`, `department`, `generation`, `mobile` (unique key), `isMatched`, `matchedUserId` (FK) |
| `pendingRegistrations` | `id`, `kakaoId`, `email`, `name`, `userData` (JSON), `status` |

### Adding/Modifying Schema
1. Edit `shared/schema.ts`
2. Run `npm run db:push` to sync to the database
3. Migrations are stored in `/migrations/`
4. Both server storage layer (`server/storage.ts`) and client query types must be updated accordingly

---

## API Routes (`server/routes.ts`)

All endpoints are prefixed with `/api/`.

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth/callback` | OAuth redirect handler |
| `POST` | `/api/auth/kakao/authorize` | Initiate Kakao OAuth |
| `POST` | `/api/auth/kakao` | Complete login/register |
| `GET` | `/api/auth/me` | Current session user |
| `POST` | `/api/auth/logout` | Clear session |

### Content
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/categories` | All categories |
| `POST` | `/api/categories` | Create category (admin) |
| `GET` | `/api/posts` | List posts (filter by `categoryId`) |
| `GET` | `/api/posts/search` | Full-text search |
| `GET` | `/api/posts/:id` | Single post |
| `POST` | `/api/posts` | Create post |
| `GET` | `/api/payments/user/:userId` | User payments |
| `POST` | `/api/payments` | Record payment |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/pending-registrations` | Awaiting approval |
| `PATCH` | `/api/admin/pending-registrations/:id` | Approve/reject |
| `POST` | `/api/admin/sync-alumni` | Sync from Google Sheets |
| `GET` | `/api/admin/sync-progress` | SSE stream of sync status |
| `GET` | `/api/admin/test-google-sheets` | Connectivity test |

---

## Authentication Flow

1. User taps "카카오로 시작하기" (KakaoTalk login button)
2. `client/src/lib/auth.ts` initializes Kakao SDK with `VITE_KAKAO_JAVASCRIPT_KEY`
3. Client calls `POST /api/auth/kakao/authorize` → server returns Kakao OAuth URL
4. User authorizes on Kakao → redirect to `/auth/callback`
5. Server POSTs to `POST /api/auth/kakao` with the code
6. Server calls Kakao REST API to get user profile
7. Server checks `alumniDatabase` for a matching record
   - **Match found** → user auto-verified, session created
   - **No match** → `pendingRegistrations` entry created, admin review required
8. Admin approves/rejects via `/admin` page

Session is cookie-based (`express-session`). Frontend includes `credentials: "include"` in all fetch calls. Use `useAuth()` hook to access user state client-side.

---

## Adding New Pages

1. Create `client/src/pages/your-page.tsx`
2. Add route in `client/src/App.tsx` using `<Route path="/your-path" component={YourPage} />`
3. Add navigation link in `client/src/components/navigation.tsx` and/or `bottom-navigation.tsx`
4. Routes use **Wouter** syntax, not React Router — use `useLocation`, `useRoute`, `Link` from `wouter`

---

## Adding New API Endpoints

1. Add handler in `server/routes.ts`
2. If data access is needed, add method to `IStorage` interface in `server/storage.ts`
3. Implement in `DatabaseStorage` class in the same file
4. Use Drizzle ORM queries — never raw SQL strings
5. Validate request bodies with Zod schemas from `shared/schema.ts`

---

## UI Components

- **shadcn/ui components** live in `client/src/components/ui/` — do not manually edit these files; re-run `npx shadcn@latest add <component>` to update them
- Use `cn()` from `@/lib/utils` for conditional Tailwind classes
- Color palette: Kakao yellow `#FFE000`, Kakao brown `#3C2415`
- Korean typography: `font-family: 'Noto Sans KR'` (loaded via Google Fonts in `index.html`)
- Dark mode is supported via Tailwind's `class` strategy and `next-themes`

---

## Google Sheets Sync

`server/google-sheets.ts` exports `GoogleSheetsService`:
- Reads alumni records from a configured spreadsheet
- Results are cached in memory to avoid repeated API calls
- Sync progress is reported via Server-Sent Events (SSE) at `/api/admin/sync-progress`
- Configure via environment variables: `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_CLIENT_EMAIL`, `GOOGLE_SHEETS_PRIVATE_KEY`

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values. Never commit `.env`.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (Supabase) |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Individual PG credentials |
| `JWT_SECRET` | Session secret |
| `VITE_KAKAO_JAVASCRIPT_KEY` | Kakao SDK (client-side, exposed to browser) |
| `KAKAO_REST_API_KEY` | Kakao OAuth server-side |
| `KAKAO_ADMIN_KEY` | Kakao admin operations |
| `KAKAO_CLIENT_SECRET` | Kakao OAuth secret |
| `GOOGLE_SHEETS_SPREADSHEET_ID` / `ALUMNI_SPREADSHEET_ID` | Target spreadsheet |
| `GOOGLE_SHEETS_CLIENT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account |
| `GOOGLE_SHEETS_PRIVATE_KEY` | Service account private key |
| `VITE_SUPABASE_URL` | Supabase project URL (legacy, DB-only now) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (legacy) |
| `PORT` | Server port (default 5000) |
| `NODE_ENV` | `development` or `production` |

Variables prefixed with `VITE_` are exposed to the browser bundle. Never put secrets in `VITE_` variables.

---

## Key Conventions

### TypeScript
- Strict mode is enabled — no implicit `any`, all types must be explicit
- Shared types go in `shared/schema.ts` (imported by both client and server)
- Use `z.infer<typeof insertXSchema>` for form/API payload types

### Data Fetching (Client)
- All server data fetching goes through **TanStack React Query**
- Use `queryClient.ts` for the shared `QueryClient` instance
- Always pass `credentials: "include"` in fetch options for authenticated requests
- Invalidate queries after mutations: `queryClient.invalidateQueries({ queryKey: [...] })`

### Storage Layer (Server)
- All DB operations go through `IStorage` interface — never call Drizzle directly from route handlers
- This pattern enables future testing/mocking without database

### Error Handling
- Server returns JSON `{ message: string }` with appropriate HTTP status codes
- Client shows errors via `useToast()` hook

### Styling
- Tailwind utility classes only — no inline styles, no CSS modules
- CSS variables defined in `client/src/index.css` control theme colors
- Mobile-first responsive design; use Tailwind breakpoint prefixes (`sm:`, `md:`, `lg:`)

### Korean Language
- UI text is in Korean (한국어) — maintain Korean for all user-facing strings
- File names and code identifiers are in English

---

## Common Pitfalls

- **Do not use React Router** — this project uses Wouter. Import `Link`, `useLocation`, `useRoute` from `"wouter"`.
- **Do not import from `supabase.ts` for auth** — authentication is custom Kakao-based, not Supabase Auth. The `supabase.ts` file contains legacy/stub exports.
- **`VITE_` prefix** is required for any environment variable the client needs to access at runtime.
- **Session cookies** require `credentials: "include"` on every fetch call — missing this breaks authentication silently.
- **`db:push` vs migrations** — `db:push` is fast for development but use proper migration files for production schema changes.
- **Port 5000** — both dev and prod servers listen on port 5000. Replit maps this to port 80 externally.

---

## Documentation Files

| File | Content |
|------|---------|
| `replit.md` | System architecture overview and external dependencies |
| `walkthrough.md` | Feature implementation and verification guide |
| `planning_proposal.md` | Version 3.0 feature planning proposal (Korean) |
| `README.md` | Minimal project title only |
