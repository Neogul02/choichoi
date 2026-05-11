<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-04 | Updated: 2026-05-04 -->

# app/settings/

## Purpose
Settings page for the ChoiChoi POS. Provides three management panels: (1) menu item CRUD with drag-to-reorder, (2) today's sales dashboard with a destructive reset action, and (3) a monthly revenue calendar with prev/next navigation.

## Key Files

| File | Description |
|------|-------------|
| `page.js` | Single-file settings page — all three panels rendered inline as a Client Component |

## For AI Agents

### Working In This Directory
- This is a `'use client'` page. All data fetching uses direct server action calls (`await actionFn()`) rather than React Query — unlike `app/page.js`.
- State management is entirely local `useState` — no global store.
- The page loads three datasets on mount: menu items (`loadMenuItems`), today's orders (`loadTodaySales`), and the current month's calendar (`loadMonthlyCalendar`).

### Key UI Sections

| Section | State Variables | Actions |
|---------|----------------|---------|
| Menu editor form | `formData`, `editingId` | Add, edit, cancel |
| Menu list | `menuItems`, `draggedId`, `dragOverId` | Reorder (drag & drop + touch), delete |
| Today's sales | `todayOrders`, `isResettingSales` | Refresh, destructive reset (double-confirm) |
| Monthly calendar | `calendarMonth`, `calendarSales` | Prev/next month navigation |

### Drag-and-Drop Pattern
- Desktop: native HTML5 drag events (`onDragStart`, `onDragOver`, `onDrop`, `onDragEnd`) on `<li>` elements.
- Mobile: touch events (`onTouchStart`, `onTouchMove`, `onTouchEnd`) on the `⠿` drag-handle element only.
- Both paths call `handleReorder(fromId, toId)` which calls `reorderMenuItems()` server action.
- Each `<li>` carries `data-menu-id={item.id}` for touch target detection via `document.elementFromPoint`.

### Destructive Reset Safety
`handleResetTodaysSales` requires two confirmations:
1. `window.confirm` with order count and revenue amount.
2. `window.prompt` requiring the user to type `"초기화"` exactly.

### Color Palette
8 hardcoded colors (`COLOR_PALETTE` array) shown as clickable swatches. Color is stored as a hex string in Supabase. Colors outside the palette default to `COLOR_PALETTE[0].value` in the edit form.

### Testing Requirements
- Test drag reorder with at least 2 active menu items.
- Test the reset flow: confirm it requires both confirmation steps and calls `clearTodaysOrders`.
- Calendar navigation: verify prev/next month loads correct data from `getMonthlySalesByDate`.

## Dependencies

### Internal
- `app/actions.ts` — `getAllMenu`, `createNewMenuItem`, `editMenuItem`, `removeMenuItem`, `reorderMenuItems`, `fetchTodaysOrders`, `resetTodaysSales`, `fetchMonthlySalesCalendar`

<!-- MANUAL: -->
