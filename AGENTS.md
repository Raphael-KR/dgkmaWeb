# AGENTS.md
Project-specific instructions for Codex working in this repository.
## Project context
This repository is the web application for the Dongguk University Korean Medicine Alumni Association.
The app is developed mainly through Replit and GitHub. The production app is published through Replit and uses environment variables from Replit Secrets.
The current authentication flow uses Kakao Login v5 with REST OAuth authorization.
## Communication rules
Respond in Korean even when the prompt is written in English.
Write logs and user-facing feedback in Korean.
Use concise, everyday language for user communication.
## Environment rules
This repository is primarily developed and deployed on Replit.
Development homepage:
```text
https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev
```
Production homepage:
```text
https://dgkma.org
```
Use the Replit development homepage as the default browser target during implementation and iterative verification. Do not require a Republish just to inspect an in-progress change.
Use the production homepage only for post-Republish smoke checks and production-specific verification.
Codex may use the configured Replit SSH connection to update and validate the development workspace and Development Database. Replit SSH does not connect to the Production Database or an autoscale production instance.
When the temporary Replit Secret `PROD_DATABASE_URL` exists, SSH processes can connect directly to the Production Database. Follow `docs/database-operations.md` for every direct database operation.
Keep Development Database as the default. Replit `PG*` variables take precedence over `DATABASE_URL` in `server/db.ts`; never unset them for normal development, app execution, or tests.
Select Production Database only with an explicit production command. Verify `current_database()` and pre-change counts first, use a transaction where practical, then verify through a new connection.
Treat owner-level `PROD_DATABASE_URL` as temporary and remove it after the approved production work. Prefer `PROD_DATABASE_READONLY_URL` for recurring production inspection.
Never store either production URL in a local Mac `.env`, repository file, document, shell history, or chat.
Do not assume local Mac npm scripts are reliable. Local `node_modules`, `tsc`, build tools, or dev dependencies may be missing or stale.
When validation is needed, run it in the Replit development workspace through SSH when available. Ask the user to run commands only when Codex cannot access the required Replit surface.
Preferred validation commands:
```bash
npm run check
npm run build
```
Run this only when the database schema changes:
```bash
npm run db:push
```
## Work rules
Make small, task-focused edits.
Do not run codebase graph or indexing tools unless explicitly requested.
Do not clean, rename, normalize, or delete files in `attached_assets/` unless explicitly instructed.
Do not reintroduce Supabase client login unless explicitly requested.
## Pre-launch data reset policy
This project is still under development and has not formally opened.
Until the user explicitly states that existing data must be preserved, records in both the Development Database and Production Database are disposable test data. Codex may delete or reset those records when development requires it without requesting repeated approval.
Before resetting data, identify affected tables and foreign-key dependencies, use a transaction where practical, and verify counts afterward.
This standing authorization does not include dropping schemas or tables, deleting Replit Secrets, rewriting Git history, deleting Object Storage files, or deleting local user files.
Once the user declares that data must be preserved, stop treating existing records as disposable.
## Kakao login rules
The current Kakao Login flow uses REST authorize URL navigation. Replit provides one App Secrets pane for this project; `REPLIT_DEPLOYMENT="1"` selects production, and every other value selects development.

The six environment-specific Kakao Secrets are:

- Development: `KAKAO_DEV_REST_API_KEY`, `KAKAO_DEV_CLIENT_SECRET`, `KAKAO_DEV_REDIRECT_URI`
- Production: `KAKAO_PROD_REST_API_KEY`, `KAKAO_PROD_CLIENT_SECRET`, `KAKAO_PROD_REDIRECT_URI`

The browser starts login through `/api/auth/kakao/start`. The server alone selects the REST API key, client secret, and redirect URI for the selected environment. The exact callback values are:

- Development: `https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev/kakao-callback`
- Production: `https://dgkma.org/kakao-callback`

The development and production callback values must be registered exactly as shown and must match the selected `KAKAO_*_REDIRECT_URI` value. The five generic Kakao Secrets are deprecated. Remove them only after both development and production smoke checks pass.

Do not use Kakao JavaScript SDK login for the current v5 flow.
Do not expose server-only secrets through `VITE_`.
Never log full secrets, access tokens, refresh tokens, or full authorization codes.
## Session and onboarding rules
Use `req.session.userId` consistently across auth routes.
After Kakao login, save the session before responding.
Keep `app.set("trust proxy", 1)` for Replit production proxy behavior.
If a logged-in user has no `activityRegion`, redirect to `/onboarding/region`.
Region save endpoint:
```text
POST /api/users/activity-region
```
Preferred request body:
```JSON
{
  "activityRegion": "서울특별시"
}
```
