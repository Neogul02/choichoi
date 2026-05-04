<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-04 | Updated: 2026-05-04 -->

# components/

## Purpose
Reusable React client components for the POS UI. These components are extracted building blocks — note that `app/page.js` currently renders its own inline JSX for the menu grid and order summary rather than importing these. The components here represent an alternative/earlier composition approach and may be used in future refactoring.

## Key Files

| File | Description |
|------|-------------|
| `MenuItem.jsx` | Single menu card — shows name, price (colored background), +/− quantity buttons |
| `MenuGrid.jsx` | Grid wrapper — maps over items and renders `<MenuItem>` for each |
| `OrderSummary.jsx` | Order sidebar — lists selected items with subtotals, total, and checkout button |
| `SalesDisplay.jsx` | Today's sales banner — shows total order count and total revenue |

## For AI Agents

### Working In This Directory
- All components are `'use client'` — they receive data and callbacks as props; no direct Supabase or server action calls.
- `MenuItem` uses inline `style` props (not Tailwind/CSS modules). If styling is added, match this pattern.
- `MenuGrid` and `OrderSummary` are compositional wrappers — keep them thin.
- `app/page.js` does **not** currently import these components — it renders its own equivalent JSX inline with CSS class names from `globals.css`. Before using these components in `page.js`, align the styling approach.

### Testing Requirements
- No unit tests. Test visually via `yarn dev` by importing into a page.

### Common Patterns
- Props contract for `MenuItem`: `{ item: { id, name, price, color }, count: number, onIncrease: () => void, onDecrease: () => void }`
- Props contract for `MenuGrid`: `{ items, counts, onIncrease, onDecrease }`
- Props contract for `OrderSummary`: `{ items, counts, totalPrice, onCheckout, isLoading }`
- Props contract for `SalesDisplay`: `{ sales: { totalOrders, totalRevenue }, isLoading }`

## Dependencies

### Internal
- `MenuGrid` → `MenuItem` (direct import)

### External
- None (pure React)

<!-- MANUAL: -->
