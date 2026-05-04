<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-04 | Updated: 2026-05-04 -->

# lib/

## Purpose
Database access layer. Contains the Supabase client singleton and all query/mutation functions for the POS system. This module is **server-only** — it is imported exclusively from `app/actions.ts` (a Server Actions file). Never import it in client components.

## Key Files

| File | Description |
|------|-------------|
| `supabase.js` | Supabase client + all DB utility functions for menu items and orders |

## For AI Agents

### Working In This Directory
- The Supabase client is a module-level singleton — do not create additional clients.
- All functions throw on error (no internal try/catch) — error handling is done in `app/actions.ts`.
- Environment variables required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Exported Functions

| Function | Table(s) | Notes |
|----------|----------|-------|
| `getMenuItems()` | `menu_items` | Active items only (`is_active = true`), ordered by `display_order` then `id` |
| `getAllMenuItems()` | `menu_items` | All items including inactive, ordered by `display_order` then `id` |
| `addMenuItem(name, price, color)` | `menu_items` | Auto-assigns next `display_order` by querying max + 1 |
| `updateMenuItem(id, name, price, color)` | `menu_items` | Updates `updated_at` timestamp |
| `deleteMenuItem(id)` | `menu_items` | Soft-delete: sets `is_active = false` |
| `updateMenuOrder(orderedIds)` | `menu_items` | Bulk update `display_order` using `Promise.all` — not transactional |
| `createOrder(items, totalPrice)` | `orders`, `order_items` | Inserts order then order items; `payment_method` hardcoded to `'cash'` |
| `getTodaysSales()` | `orders` | Returns `{ totalOrders, totalRevenue }` for today (UTC date range) |
| `getTodaysOrderList()` | `orders` | Returns full order rows for today, descending by id |
| `clearTodaysOrders()` | `orders` | Hard-deletes all of today's orders; returns `{ deletedCount }` |
| `getMonthlySalesByDate(year, month)` | `orders` | Returns `{ byDate: Record<'YYYY-MM-DD', number>, monthTotal, totalOrders }` |

### Testing Requirements
- Functions require a live Supabase instance. No mocking setup exists.
- Date filtering uses UTC (`toISOString()`). Local time zone offsets can cause edge-case mismatches around midnight.

### Common Patterns
- Date range filter pattern: `.gte('created_at', todayT00:00:00Z).lte('created_at', todayT23:59:59Z)`
- `updateMenuOrder` uses `Promise.all` over individual `.update()` calls — not atomic. If partial failure occurs, `display_order` values may be inconsistent.

## Dependencies

### External
- `@supabase/supabase-js` — Supabase JS client v2

<!-- MANUAL: -->
