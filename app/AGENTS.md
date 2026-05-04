<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-04 | Updated: 2026-05-04 -->

# app/

## Purpose
Next.js 16 App Router root. Contains the global layout, the two main pages (POS and Settings), server actions for all data mutations, the password-gate client component, and API route handlers. All routing is file-system based under this directory.

## Key Files

| File | Description |
|------|-------------|
| `layout.js` | Root layout — applies Geist fonts, wraps app in `<Providers>` and `<PasswordGate>` |
| `page.js` | Main POS screen — menu grid, quantity counters, keyboard shortcuts (1–9 / Esc), checkout |
| `actions.ts` | All Next.js Server Actions (`'use server'`) — thin wrappers over `lib/supabase.js` |
| `providers.js` | `QueryClientProvider` wrapper for TanStack React Query (staleTime 60s, no refetch on focus) |
| `password-gate.js` | Client-side password modal — verifies via `/api/auth/verify`, persists auth in `localStorage` |
| `globals.css` | Global CSS — layout tokens, POS card styles, settings form styles, calendar grid |
| `page.module.css` | CSS module (currently minimal, most styles live in `globals.css`) |
| `favicon.ico` | Site favicon |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `api/` | Next.js API Route handlers (see `api/AGENTS.md`) |
| `settings/` | Settings page — menu CRUD, sales dashboard, monthly calendar (see `settings/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- `page.js` is a **Client Component** (`'use client'`). Do not add `async` to the default export — use React Query mutations/queries for server communication.
- `actions.ts` is the **only** file with `'use server'`. Add new server-side data operations here; never import from `lib/supabase.js` in client components directly.
- `providers.js` intentionally disables `refetchOnWindowFocus` — the POS is often left open on a locked screen.
- `password-gate.js` renders children immediately but overlays the modal if unauthenticated. The gate key in localStorage is `choichoi_popup_auth`.

### Testing Requirements
- Auth flow: clear `localStorage` key `choichoi_popup_auth` and reload to test the gate.
- Checkout flow: requires active Supabase connection and at least one `is_active` menu item.
- Keyboard shortcuts: keys `1`–`9` increase quantity for the Nth menu item; `Esc` resets all counts.

### Common Patterns
- All server actions return `{ success: boolean, data?: T, error?: string }`.
- React Query keys: `['menu-items']` and `['today-sales']`.
- `today-sales` refetches every 5 seconds (`refetchInterval: 5000`).
- Price display: `new Intl.NumberFormat('ko-KR').format(price)` + `원` suffix.
- Color contrast for shortcut badges: luminance check (threshold 0.62) → black or white text.

## Dependencies

### Internal
- `lib/supabase.js` — called only from `actions.ts`
- `components/` — `MenuGrid`, `MenuItem`, `OrderSummary`, `SalesDisplay` exist but the main `page.js` renders inline JSX instead

### External
- `@tanstack/react-query` — data fetching
- `next/font/google` — Geist font loading

<!-- MANUAL: -->
