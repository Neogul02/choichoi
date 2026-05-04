<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- Generated: 2026-05-04 | Updated: 2026-05-04 -->

# choichoi (Root)

## Purpose
ChoiChoi is a Korean café/bakery Point-of-Sale (POS) web application. It lets staff take orders from a touch/keyboard-friendly menu grid, processes checkout via Supabase, and provides a settings screen for menu CRUD, daily sales management, and a monthly revenue calendar.

## Key Files

| File | Description |
|------|-------------|
| `package.json` | Dependencies and scripts (`dev`, `build`, `start`, `lint`) |
| `next.config.mjs` | Minimal Next.js config (no special options currently set) |
| `tsconfig.json` | TypeScript config (strict mode implied by `typescript 6.x`) |
| `jsconfig.json` | JS path aliases (`@/` → project root) |
| `eslint.config.mjs` | ESLint flat-config with `eslint-config-next` |
| `tailwind.config` / `postcss.config` | Tailwind CSS 4 via PostCSS |
| `vercel.json` | Vercel deployment config |
| `.yarnrc.yml` | Yarn Berry config |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `app/` | Next.js App Router pages, layouts, server actions, API routes (see `app/AGENTS.md`) |
| `components/` | Reusable React components (see `components/AGENTS.md`) |
| `lib/` | Supabase client and all DB utility functions (see `lib/AGENTS.md`) |
| `public/` | Static SVG assets |

## For AI Agents

### Working In This Directory
- This is **Next.js 16** with **React 19** and **App Router** — check `node_modules/next/dist/docs/` for current APIs before writing any Next.js code.
- Path alias `@/` resolves to the project root. Use it for cross-directory imports.
- All UI text is in **Korean (ko-KR)**. Keep it that way.
- Run `yarn lint` and `yarn build` to verify changes don't break compilation.

### Testing Requirements
- No test suite is currently set up. Verify features manually via `yarn dev`.
- Supabase calls require `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `POPUP_PASSWORD` environment variables.

### Common Patterns
- Server Actions (`'use server'`) in `app/actions.ts` wrap all Supabase calls — never call `lib/supabase.js` directly from client components.
- All server actions return `{ success: boolean, data?: ..., error?: string }` — handle both branches on the client.
- Korean number formatting: `new Intl.NumberFormat('ko-KR')` for prices.
- Auth is a localStorage-based password gate, not a session/cookie system.

## Dependencies

### Internal
All cross-cutting concerns flow through `app/actions.ts` (server) → `lib/supabase.js` (DB layer).

### External
- `next@16.2.1` — App Router framework
- `react@19` / `react-dom@19` — UI
- `@supabase/supabase-js@^2` — Database client
- `@tanstack/react-query@^5` — Client-side data fetching and caching
- `tailwindcss@^4` — Utility-first CSS (PostCSS integration, no `tailwind.config.js`)
- `typescript@6` — Type checking

## Database Schema (Supabase)

| Table | Key Columns |
|-------|------------|
| `menu_items` | `id`, `name`, `price`, `color` (hex), `stock`, `is_active`, `display_order`, `updated_at` |
| `orders` | `id`, `total_price`, `payment_method`, `payment_status`, `created_at` |
| `order_items` | `order_id`, `menu_item_id`, `quantity`, `unit_price`, `subtotal` |

Soft-delete pattern: `deleteMenuItem` sets `is_active = false` rather than removing rows.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
