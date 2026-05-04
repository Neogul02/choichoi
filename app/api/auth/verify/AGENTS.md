<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-04 | Updated: 2026-05-04 -->

# app/api/auth/verify/

## Purpose
Single POST endpoint that validates the site access password. Called by `app/password-gate.js` on form submit. No session or cookie is created — the client stores auth state in `localStorage` after a successful response.

## Key Files

| File | Description |
|------|-------------|
| `route.js` | Next.js Route Handler — `POST /api/auth/verify` |

## For AI Agents

### API Contract

**Request**
```json
POST /api/auth/verify
Content-Type: application/json

{ "password": "<user-input>" }
```

**Responses**

| Status | Body | Condition |
|--------|------|-----------|
| 200 | `{ "success": true }` | Password matches `POPUP_PASSWORD` |
| 401 | `{ "success": false, "message": "..." }` | Wrong password |
| 500 | `{ "success": false, "message": "..." }` | `POPUP_PASSWORD` env var not set |
| 400 | `{ "success": false, "message": "..." }` | Malformed request body |

### Working In This Directory
- Password comparison is plain string equality (`===`) — not hashed. This is intentional for a simple shared-password gate.
- The `POPUP_PASSWORD` environment variable must be set in `.env.local` (development) and Vercel environment settings (production).
- No rate limiting is implemented. If adding brute-force protection, do it here.

### Testing Requirements
- Set `POPUP_PASSWORD=test` in `.env.local` and POST `{ "password": "test" }` → expect 200.
- POST with wrong password → expect 401.
- Unset `POPUP_PASSWORD` → expect 500.

<!-- MANUAL: -->
