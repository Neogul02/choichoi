<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-04 | Updated: 2026-05-04 -->

# app/api/

## Purpose
Next.js App Router API route handlers. These are true HTTP endpoints (not Server Actions) used for cases where a fetch-based API call is preferable — specifically the password verification flow which is called from a client component before React Query is involved.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `auth/` | Authentication endpoints (see `auth/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- Follow Next.js 16 Route Handler conventions: export named functions (`GET`, `POST`, etc.) from `route.js` files.
- Use `NextResponse.json()` for all responses.
- Do not add business logic here — keep handlers thin and delegate to `lib/supabase.js` via server actions or direct import (server-side only).

<!-- MANUAL: -->
