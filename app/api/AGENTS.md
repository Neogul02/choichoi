# app/api/

HTTP endpoints (not Server Actions) for auth flows called before React Query is available.

- `POST /api/auth/verify` — validate cashier password, return token
- `POST /api/auth/verify/validate` — check existing cashier token
- `POST /api/auth/admin` — validate admin password, return token
- `POST /api/auth/admin/validate` — check existing admin token

Token = SHA256(password + VERCEL_DEPLOYMENT_ID). Env vars: `POPUP_PASSWORD`, `ADMIN_PASSWORD`.
All handlers use `NextResponse.json()`. Keep thin — no business logic here.
