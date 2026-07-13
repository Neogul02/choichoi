# app/

Next.js 16 App Router root.

## Route Structure
| Route | File | Gate |
|-------|------|------|
| `/` | `page.tsx` | PasswordGate |
| `/orders` | `orders/page.tsx` | PasswordGate |
| `/memo` | `memo/page.tsx` | PasswordGate |
| `/stats` | `(admin)/stats/page.tsx` | AdminGate |
| `/settings` | `(admin)/settings/page.tsx` | AdminGate |
| `/devtools` | `(admin)/devtools/page.tsx` | AdminGate |

`(admin)/layout.tsx` wraps all admin routes with `<AdminGate>`. Root `layout.tsx` wraps everything in `<PasswordGate>`.

## Key Files
- `actions.ts` — all Server Actions. Uses `wrap<T>(fn)` helper; no per-action try/catch needed.
- `providers.tsx` — `QueryClientProvider` + Sonner `Toaster`.
- `password-gate.tsx` — cashier auth, token key: `choichoi_popup_token`, name key: `choichoi_cashier_name`.
- `admin-gate.tsx` — admin auth, token key: `choichoi_admin_token`.
- `not-found.tsx` — custom 404 page.

## Adding Server Actions
Add to `actions.ts`:
```ts
export async function myAction(arg: string): Promise<ApiResponse<MyType>> {
  return wrap(() => libFunction(arg));
}
```
Import the lib function from `lib/supabase.ts`. No try/catch needed — `wrap` handles it.
