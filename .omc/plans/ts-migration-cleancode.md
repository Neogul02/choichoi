# choichoi POS — JS→TS 마이그레이션 + Clean Code 리팩터 계획

**작성일**: 2026-05-06  
**범위**: 전체 10개 JS/JSX 파일 변환 + 전체 clean code 리팩터  
**TS 수준**: 최소 변환 (strict: false 유지, 명백한 타입만 추가)

---

## 요구사항 요약

| 구분 | 내용 |
|------|------|
| TS 변환 | `.js/.jsx` → `.ts/.tsx` 확장자 변경 + DB/API 타입 정의 파일 생성 |
| 타입 강도 | `strict: false` 유지, 함수 파라미터·반환값에 명시적 타입 추가 |
| Clean Code | 중복 제거, 매직 넘버 상수화, 컴포넌트 분리, 네이밍 정리 |
| 기능 변경 | 없음 — 동작은 100% 동일하게 유지 |

---

## 검수 기준 (Acceptance Criteria)

- [ ] `yarn build` 오류 0개
- [ ] `yarn lint` 경고 0개
- [ ] 모든 `.js`/`.jsx` 파일이 `.ts`/`.tsx`로 변환됨
- [ ] `types/database.ts`, `types/api.ts` 생성됨
- [ ] Supabase 쿼리 반환값에 인터페이스 적용됨
- [ ] 서버 액션 반환 타입이 generic `ApiResponse<T>` 패턴으로 통일됨
- [ ] 매직 넘버·하드코딩 문자열이 상수로 추출됨 (파악된 것 전부)
- [ ] 300줄 초과 파일은 컴포넌트 분리로 200줄 이하로 축소됨
- [ ] 중복 유틸 함수가 `lib/utils.ts`로 통합됨
- [ ] 수동 기능 테스트 통과 (주문, 설정, 통계, 메모, 스케줄)

---

## 현황 (탐색 결과 요약)

### 변환 대상 파일 (10개)

| 파일 | 현재 | 변환 후 | 특이사항 |
|------|------|---------|---------|
| `app/layout.js` | JSX | `.tsx` | Metadata 타입 필요 |
| `app/page.js` | JSX | `.tsx` | 가장 큰 파일, POS 핵심 로직 |
| `app/password-gate.js` | JSX | `.tsx` | localStorage 접근 |
| `app/providers.js` | JSX | `.tsx` | QueryClient 제네릭 |
| `app/memo/page.js` | JSX | `.tsx` | CRUD 폼 |
| `app/schedule/page.js` | JSX | `.tsx` | 드래그&드롭, 날짜 계산 복잡 |
| `app/settings/page.js` | JSX | `.tsx` | 메뉴 CRUD, 재정렬 |
| `app/stats/page.js` | JSX | `.tsx` | 달력 집계, 동적 상태 |
| `app/api/auth/verify/route.js` | JS | `.ts` | NextRequest/Response 타입 |
| `components/NavBar.jsx` | JSX | `.tsx` | Link, usePathname |

**이미 TS**: `app/actions.ts` (타입 강화만 필요)  
**자동생성**: `next-env.d.ts` (건드리지 않음)

### 주요 Clean Code 이슈 (탐색에서 식별)

1. **거대 컴포넌트**: `app/page.js` (POS 주문 페이지) — 단일 파일에 주문 처리, 수량 관리, 체크아웃, 단축키 핸들러가 모두 혼재
2. **동적 키 상태**: `counts: {}` (Record<number, number> 타입 없음), `calendarSales.byDate: {}` (날짜 → 금액 Record)
3. **Supabase 응답 전부 `any`**: `lib/supabase.js` 모든 쿼리 반환이 암묵적 any
4. **반환 타입 불일치**: `app/actions.ts` — 일부 액션은 `{ success, orderId, sales }` 등 제각각
5. **중복 날짜 포매팅**: 여러 페이지에 `YYYY-MM-DD` 문자열 변환 로직 중복
6. **매직 넘버**: 색상 hex값, 가격 계산 소수점, API 경로 `/api/auth/verify`

---

## 구현 단계

### Phase 0: 타입 기반 파일 생성 (선행 작업)

**목표**: 모든 파일이 공유할 타입 정의 생성

**0-1. `types/database.ts` 생성**
```typescript
export interface MenuItem {
  id: number;
  name: string;
  price: number;
  color: string;
  stock: number;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: number;
  total_price: number;
  payment_method: string;
  payment_status: string;
  created_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  menu_item_id: number;
  quantity: number;
  unit_price: number;
  subtotal: number;
  menu_items?: MenuItem;
}

export interface PopupEvent {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

export interface ScheduleSlot {
  id: number;
  event_id: number;
  schedule_date: string;
  role: string;
  person_name: string;
  work_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface Memo {
  id: number;
  title: string | null;
  content: string;
  color: string;
  created_at: string;
  updated_at: string;
}
```

**0-2. `types/api.ts` 생성**
```typescript
import type { MenuItem, Order, ScheduleSlot, Memo } from './database';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SaveOrderResponse {
  success: boolean;
  orderId?: number;
  sales?: { totalOrders: number; totalRevenue: number };
  error?: string;
}

export interface MenuSalesItem {
  id: number;
  name: string;
  color: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface CalendarSalesData {
  byDate: Record<string, number>;
  monthTotal: number;
  totalOrders: number;
}
```

**0-3. `lib/utils.ts` 생성** — 중복 유틸 통합
- `formatDate(date: Date): string` — YYYY-MM-DD 변환 (현재 여러 파일에 중복)
- `formatPrice(price: number): string` — `Intl.NumberFormat('ko-KR')` 래퍼
- `getToday(): string` — 오늘 날짜 YYYY-MM-DD

검증: 파일 생성 후 `yarn build` 통과 확인

---

### Phase 1: lib/supabase.js → lib/supabase.ts

**목표**: Supabase 쿼리 반환 타입 적용

- 파일 이름 변경: `.js` → `.ts`
- 각 함수 파라미터·반환값에 `types/database.ts` 타입 적용
- `data | null` 패턴 명시적 처리

```typescript
// Before
export async function getMenuItems() {
  const { data, error } = await supabase.from('menu_items').select('*')
  return data
}

// After
export async function getMenuItems(): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .order('display_order')
  if (error) throw error
  return data ?? []
}
```

검증: `yarn build` 통과

---

### Phase 2: app/actions.ts 타입 강화

**목표**: 이미 TS인 파일의 반환 타입을 `types/api.ts` 패턴으로 통일

- `saveOrder` → `Promise<SaveOrderResponse>`
- `fetchMenuItems` → `Promise<ApiResponse<MenuItem[]>>`
- `getMenuSalesByPeriod` → `Promise<ApiResponse<MenuSalesItem[]>>`
- `getCalendarSales` → `Promise<ApiResponse<CalendarSalesData>>`
- 나머지 액션들 → `Promise<ApiResponse>`

검증: `yarn build` 통과

---

### Phase 3: 서버/레이아웃 파일 변환

**순서**: 의존성 낮은 순서대로

**3-1. `app/api/auth/verify/route.js` → `route.ts`**
- `NextRequest`, `NextResponse` 타입 import

**3-2. `app/layout.js` → `layout.tsx`**
- `Metadata` 타입 import (`import type { Metadata } from 'next'`)
- `children: React.ReactNode` prop 타입

**3-3. `app/providers.js` → `providers.tsx`**
- `QueryClient` 이미 타입 있음 — `children: React.ReactNode` 추가

**3-4. `app/password-gate.js` → `password-gate.tsx`**
- `localStorage` 접근 타입 (`string | null`)
- `onSuccess: () => void` prop 타입

검증: `yarn build` 통과

---

### Phase 4: 페이지 컴포넌트 변환 + 분리

각 페이지 변환과 동시에 clean code 리팩터 적용.

#### 4-1. `app/page.js` → `app/page.tsx` (가장 복잡)

**Clean Code 분리 목표**:
- `<OrderGrid />` — 메뉴 그리드 (현재 page.js 내부에 인라인)
- `<OrderSummary />` — 주문 내역 + 체크아웃 버튼
- `useOrderState` — 수량 카운트, 합계 계산 커스텀 훅
- `useKeyboardShortcuts` — 1~9 단축키 핸들러 커스텀 훅

**타입**:
- `counts: Record<number, number>` (메뉴ID → 수량)
- `checkoutFnRef: React.MutableRefObject<(() => Promise<void>) | null>`
- `menuQuery.data: MenuItem[] | undefined`

#### 4-2. `app/stats/page.js` → `app/stats/page.tsx`

**Clean Code**:
- `calendarSales: CalendarSalesData` 타입 적용
- `periodSales: MenuSalesItem[]` 타입 적용
- 날짜 관련 헬퍼를 `lib/utils.ts`에서 import

#### 4-3. `app/settings/page.js` → `app/settings/page.tsx`

**Clean Code**:
- `editingItem: MenuItem | null` 상태 타입
- 드래그 순서 변경: `items: MenuItem[]` 배열 타입

#### 4-4. `app/memo/page.js` → `app/memo/page.tsx`

**타입**:
- `memos: Memo[]`
- 폼 상태: `{ title: string; content: string; color: string }`

#### 4-5. `app/schedule/page.js` → `app/schedule/page.tsx`

**타입**:
- `slots: ScheduleSlot[]`
- `events: PopupEvent[]`
- 드래그 이벤트: `React.DragEvent<HTMLDivElement>`

검증 (각 페이지 후): `yarn build` + 수동 기능 확인

---

### Phase 5: components/NavBar.jsx → NavBar.tsx

- `usePathname(): string` 타입 확인
- `Link` props 타입 확인

검증: `yarn build` 통과

---

### Phase 6: tsconfig.json 정리

- `allowJs: false` 변경 (JS 파일 전부 변환 완료 후)
- `noUnusedLocals: true` 추가 (잠재적 데드 코드 감지)
- `noImplicitReturns: true` 추가

검증: `yarn build` 오류 0개

---

### Phase 7: 최종 lint + 빌드 검증

```bash
yarn lint   # 경고 0개
yarn build  # 오류 0개
```

---

## 리스크 & 대응

| 리스크 | 대응 |
|--------|------|
| Supabase `.data`가 `null` 반환 | `?? []` / `?? null` 방어 처리 명시 |
| React Query `queryFn` 반환 타입 | `useQuery<MenuItem[]>` 제네릭 명시 |
| 드래그이벤트 타입 충돌 (schedule) | `React.DragEvent<HTMLElement>` 통일 |
| 날짜 문자열 vs Date 객체 혼재 | `formatDate()`를 utils로 통일, 전부 string 처리 |
| tsconfig `allowJs: false` 후 빌드 실패 | Phase 6는 Phase 5 완전 완료 후에만 실행 |

---

## 실행 순서 요약

```
Phase 0: types/ 파일 생성 + lib/utils.ts
  ↓
Phase 1: lib/supabase.ts 변환
  ↓
Phase 2: app/actions.ts 타입 강화
  ↓
Phase 3: 서버/레이아웃 파일 변환 (병렬 가능)
  ↓
Phase 4: 페이지 컴포넌트 변환 + 리팩터 (page.js 먼저, 나머지 병렬)
  ↓
Phase 5: NavBar.tsx 변환
  ↓
Phase 6: tsconfig 정리
  ↓
Phase 7: yarn lint + yarn build 최종 검증
```

**예상 작업량**: 총 약 15~20개 파일 생성/수정  
**기능 영향**: 없음 (순수 타입·구조 변경)
