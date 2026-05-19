# lib/

**Server-only.** Never import from client components — use `app/actions.ts`.

## supabase.ts
Supabase client singleton + all DB functions. Functions throw on error; `actions.ts` handles try/catch via `wrap()`.

Key function groups:
- **Menu**: `getMenuItems` (active only), `getAllMenuItems`, `addMenuItem`, `updateMenuItem`, `deleteMenuItem` (soft), `updateMenuOrder` (Promise.all, not atomic)
- **Orders**: `createOrder`, `getTodaysSales`, `getTodaysOrderList`, `getTodaysOrderListWithItems`, `getPendingOrders`, `prepareOrder`, `deleteOrder`, `clearTodaysOrders`
- **Stats**: `getMonthlySalesByDate` (RPC), `getMenuSalesByPeriod` (RPC), `getDailySalesByPeriod` (paginated)
- **Popup Events**: `getPopupEvents`, `createPopupEvent`, `deletePopupEvent`
- **Schedule**: `getScheduleByEvent`, `addScheduleSlot`, `removeScheduleSlot`, `updateScheduleSlot`, `moveScheduleSlot`, `copyScheduleSlot`
- **Workers**: `getWorkers`, `createWorker`, `updateWorker`, `deleteWorker`, `setWorkerPaymentDone`
- **Memos**: `getAllMemos`, `createMemo`, `updateMemo`, `deleteMemo`

KST helpers: `getKSTDateStr()`, `getKSTDateBounds(dateStr?)` — use these for today's date filtering.

## utils.ts
`formatPrice(n)`, `formatKSTTime(isoStr)`, `toLocalDateStr(date)`, luminance check for text color on colored backgrounds.
