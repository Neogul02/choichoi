# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any Next.js code. Heed deprecation notices.

# choichoi

Korean café/bakery POS. Staff take orders via a touch/keyboard menu grid; checkout goes through Supabase. Admin screens handle menu CRUD, sales stats, scheduling, and memos.

## Stack
- Next.js 16 + React 19, App Router, TypeScript 6
- Tailwind CSS 4 (CSS-first, no config file — theme in `globals.css`)
- TanStack React Query 5, Framer Motion, Recharts, Sonner toasts
- Supabase (Postgres + Realtime)

## Directory Map
| Path | Role |
|------|------|
| `app/page.tsx` | Main POS screen (menu grid, cart, checkout) |
| `app/orders/page.tsx` | Live pending orders view |
| `app/memo/page.tsx` | Memos (public — no admin gate) |
| `app/(admin)/` | Admin-only routes wrapped in `AdminGate` |
| `app/actions.ts` | All Server Actions (`'use server'`) — only entry point to DB |
| `app/password-gate.tsx` | Cashier auth modal (localStorage token) |
| `app/admin-gate.tsx` | Admin auth modal (localStorage token) |
| `lib/supabase.ts` | Supabase client + all DB functions (server-only) |
| `lib/utils.ts` | `formatPrice`, `formatKSTTime`, `toLocalDateStr`, luminance check |
| `components/NavBar.tsx` | Top nav with admin login modal, presence badges |
| `components/SalesBanner.tsx` | Animated today's sales display |
| `hooks/usePresence.ts` | Supabase Realtime presence hook |
| `types/database.ts` | DB row types |
| `types/api.ts` | Server action response types (`ApiResponse<T>`) |

## Critical Rules
- **Never** import `lib/supabase.ts` from client components — use `app/actions.ts` only.
- All server actions return `ApiResponse<T>` = `{ success: boolean; data?: T; error?: string }`. Always check `result.success` before accessing `data`.
- All UI text is **Korean (ko-KR)**.
- Path alias `@/` = project root.
- Run `yarn lint && yarn build` to verify changes.

## Auth
Two-tier, localStorage-based (no sessions):
- Cashier gate: `choichoi_popup_token` — required to use the app at all
- Admin gate: `choichoi_admin_token` — required for `(admin)` routes + admin features
- Both validated against `/api/auth/*/validate` on load

## Data Patterns
- Server actions: thin `async function wrap<T>(fn)` helper in `actions.ts` — no try/catch boilerplate needed.
- React Query: `staleTime: 5min`, `gcTime: 10min`, `refetchOnWindowFocus: false` (POS left open on locked screens).
- Realtime: Supabase channel → `queryClient.invalidateQueries()` pattern.
- KST dates: always use `getKSTDateBounds()` from `lib/supabase.ts`; never raw UTC for today's orders.
- Prices: `new Intl.NumberFormat('ko-KR').format(price)` + `원`.

## Database Schema
| Table | Key Columns |
|-------|-------------|
| `menu_items` | `id`, `name`, `price`, `color` (hex), `stock`, `is_active`, `display_order`, `updated_at` |
| `orders` | `id`, `total_price`, `payment_method`, `payment_status`, `cashier_name`, `is_prepared`, `created_at` |
| `order_items` | `order_id`, `menu_item_id`, `quantity`, `unit_price`, `subtotal` |
| `popup_events` | `id`, `name`, `start_date`, `end_date`, `created_at` |
| `schedule_slots` | `id`, `event_id`, `schedule_date`, `role`, `person_name`, `work_time`, `break_time`, `worker_id`, `updated_at` |
| `workers` | `id`, `event_id`, `name`, `color`, `phone`, `bank_name`, `bank_account`, `hourly_rate`, `payment_done`, `updated_at` |
| `memos` | `id`, `title`, `content`, `color`, `updated_at` |

Soft-delete: `menu_items` uses `is_active = false`.
