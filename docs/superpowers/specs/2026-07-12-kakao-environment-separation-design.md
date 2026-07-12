# Kakao development and production environment separation design

**Date:** 2026-07-12
**Status:** Approved design

## Goal

Keep one Replit project while ensuring that the development server always uses the Kakao TEST app and the published app always uses the Kakao business app.

The selected Kakao REST API key, client secret, and redirect URI must come from one environment decision so the authorization request and token exchange cannot drift apart.

## Constraints

- Replit App Secrets are managed in one Secrets pane and are available to both development and published processes.
- The project remains a single Replit project.
- A published process is identified only when `REPLIT_DEPLOYMENT` is exactly `"1"`.
- Development remains the default in every other environment, including the Replit development workspace and local execution.
- Server-only client secrets must never be exposed through `VITE_` variables or API responses.
- Existing generic Kakao Secrets remain in place until both environments pass login verification.

## Secret contract

The Replit Secrets pane will contain these six environment-specific values:

| Secret | Purpose |
| --- | --- |
| `KAKAO_DEV_REST_API_KEY` | TEST app REST API key |
| `KAKAO_DEV_CLIENT_SECRET` | TEST app Kakao Login client secret |
| `KAKAO_DEV_REDIRECT_URI` | Development callback URI |
| `KAKAO_PROD_REST_API_KEY` | Business app REST API key |
| `KAKAO_PROD_CLIENT_SECRET` | Business app Kakao Login client secret |
| `KAKAO_PROD_REDIRECT_URI` | Production callback URI |

Redirect URI values are fixed:

```text
KAKAO_DEV_REDIRECT_URI=https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev/kakao-callback
KAKAO_PROD_REDIRECT_URI=https://dgkma.org/kakao-callback
```

No actual key or client-secret value is stored in Git, documentation, logs, or chat.

## Runtime configuration

A server-only Kakao OAuth configuration module will:

1. Read `REPLIT_DEPLOYMENT`.
2. Select the `PROD` set only when the value is exactly `"1"`.
3. Select the `DEV` set otherwise.
4. Validate that all three selected values are present.
5. Return an immutable configuration containing the environment label, REST API key, client secret, and redirect URI.

There is no fallback to the old generic names, request headers, `APP_URL`, or a hard-coded legacy production domain. A missing selected Secret is a configuration error, not a reason to guess another value.

## Login flow

### Authorization start

The browser login command navigates to:

```text
GET /api/auth/kakao/start
```

The server resolves the active configuration, constructs the Kakao REST authorization URL, and responds with an HTTP redirect. The request includes the selected REST API key, the selected exact redirect URI, the existing approved scopes, response type, and state value.

The browser no longer reads `VITE_KAKAO_REST_API_KEY` or `VITE_KAKAO_REDIRECT_URI`.

### Token exchange

`POST /api/auth/kakao/authorize` resolves configuration through the same server module. It uses the same REST API key and redirect URI used by the authorization-start route and adds only the selected Kakao Login client secret.

The existing user-information, session, and onboarding behavior remains unchanged.

## Error and logging policy

- Missing selected configuration returns HTTP 500 with a generic Kakao configuration error.
- Server logs identify whether development or production configuration was selected and which variable names are missing.
- Logs may contain a masked REST key prefix and a client-secret presence boolean when Kakao debugging is explicitly enabled.
- Logs never contain full keys, client secrets, access tokens, refresh tokens, or authorization codes.
- The client secret is never included in an authorization URL or browser response.

## Transition sequence

1. Add all six environment-specific Secrets without changing or deleting the current generic Secrets.
2. Implement the shared resolver and server authorization-start route.
3. Update the client to use the server authorization-start route.
4. Update tests and operating documentation.
5. Restart and verify Kakao login on the Replit development domain.
6. Commit and push the verified code, align the Replit workspace, and Republish.
7. Verify Kakao login on `https://dgkma.org` and confirm that the production callback and Production Database are used.
8. After both environments pass, remove these obsolete Secrets:
   - `KAKAO_REST_API_KEY`
   - `KAKAO_CLIENT_SECRET`
   - `KAKAO_REDIRECT_URI`
   - `VITE_KAKAO_REST_API_KEY`
   - `VITE_KAKAO_REDIRECT_URI`

Keeping the old values through the verification window prevents an avoidable interruption to the currently published login flow.

## Verification

### Automated

- Configuration resolver selects development values when `REPLIT_DEPLOYMENT` is absent.
- Configuration resolver selects production values only for `REPLIT_DEPLOYMENT="1"`.
- Missing values report only variable names and never secret values.
- Authorization-start route uses the selected REST key and exact redirect URI.
- Token exchange uses the same selected REST key, redirect URI, and client secret.
- Client source no longer references the two `VITE_KAKAO_*` login variables.
- `npm run check` passes in the Replit development workspace.
- `npm run build` passes in the Replit development workspace.

### Development smoke check

- Login begins from the development domain.
- Kakao identifies the TEST app.
- Callback returns to the exact development callback URI.
- Session and onboarding behavior succeed against the Development Database.

### Production smoke check

- Login begins from `https://dgkma.org` after Republish.
- Kakao identifies the business app.
- Callback returns to `https://dgkma.org/kakao-callback`.
- Session and onboarding behavior succeed against the Production Database.

Pre-launch login records created by these smoke checks may be reset under the existing pre-launch data-reset policy.

## Alternatives considered

### Vite build-time substitution

Deriving `VITE_KAKAO_*` variables during each build would require the client and server to resolve the environment independently. This preserves a configuration mismatch risk and is therefore rejected.

### Separate Replit projects

Separate development and production projects provide stronger infrastructure isolation but add synchronization, Secret management, and publishing overhead. This is unnecessary for the current project and is therefore deferred.
