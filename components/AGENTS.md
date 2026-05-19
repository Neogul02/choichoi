# components/

Two active components:

| File | Role |
|------|------|
| `NavBar.tsx` | Collapsible top nav. Manages admin login modal (discriminated union state), `useMemo` for visible links, `usePresence` hook for cashier badges. No direct Supabase calls. |
| `SalesBanner.tsx` | Animated sales counter (Framer Motion). Pure display — all data via props. |

All components are `'use client'`. No direct DB or server action calls — data comes from parent pages via props.
