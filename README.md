# ChoiChoi POS

한국 카페·베이커리 팝업스토어를 위한 웹 기반 POS 시스템.
터치·키보드 친화적인 캐셔 화면, 고객 실시간 디스플레이(단방향/양방향), 재고 관리, AI 매출 분석, 어드민 통계·일정 기능을 제공합니다.

---

## 스크린샷

<table>
  <tr>
    <td align="center"><b>POS 캐셔 화면</b><br/><img src="public/screenshots/pos.png" alt="POS" width="100%"/></td>
    <td align="center"><b>주문 현황</b><br/><img src="public/screenshots/orders.png" alt="주문현황" width="100%"/></td>
  </tr>
  <tr>
    <td align="center"><b>매출 통계 — 오늘·메뉴별·시간대별</b><br/><img src="public/screenshots/stats_1.png" alt="통계1" width="100%"/></td>
    <td align="center"><b>매출 통계 — 주문 내역·월간 캘린더</b><br/><img src="public/screenshots/stats_2.png" alt="통계2" width="100%"/></td>
  </tr>
  <tr>
    <td align="center"><b>매출 통계 — 팝업별 분석·정산</b><br/><img src="public/screenshots/stats_3.png" alt="통계3" width="100%"/></td>
    <td align="center"><b>일정 관리 — 팝업·근무자 배정</b><br/><img src="public/screenshots/schedule.png" alt="일정" width="100%"/></td>
  </tr>
  <tr>
    <td align="center"><b>재고 관리 — 식재료·레시피·차감 로그</b><br/><img src="public/screenshots/inventory.png" alt="재고" width="100%"/></td>
    <td align="center"><b>설정 — 메뉴 CRUD·순서 변경</b><br/><img src="public/screenshots/settings.png" alt="설정" width="100%"/></td>
  </tr>
</table>

---

## 기술 스택

| 영역 | 기술 | 선택 이유 |
|------|------|-----------|
| 프레임워크 | Next.js 16 (App Router) | Server Actions로 서버·클라이언트 경계 최소화, 별도 API 서버 불필요 |
| 언어 | TypeScript 6 | Server Action 반환 타입을 클라이언트까지 end-to-end 보장 |
| UI | React 19 + Tailwind CSS 4 + Framer Motion | 선언형 애니메이션, 서버 컴포넌트와 병행 |
| 실시간 | Supabase Realtime Broadcast + Presence | WebSocket 인프라 직접 관리 불필요, Vercel 서버리스 완전 호환 |
| 데이터베이스 | Supabase (PostgreSQL) | RLS + service role 분리로 최소 권한 원칙 구현 |
| 서버 상태 | TanStack Query v5 | Optimistic update + 쿼리 캐시 무효화로 낙관적 UI |
| 배포 | Vercel | Edge 네트워크, 재배포 시 토큰 자동 만료 활용 |

---

## 아키텍처 결정 기록

### Server Actions vs API Routes
**결정:** 모든 DB 호출을 Server Actions(`app/actions/`)로 통일  
**이유:** API Routes는 별도의 `fetch` 호출과 직렬화가 필요하지만, Server Actions는 함수 호출처럼 사용하면서 번들에는 포함되지 않음. `wrap()` 헬퍼 하나로 모든 에러를 `ApiResponse<T>` 형태로 일관되게 처리 가능.

**리팩토링:** 초기에는 `app/actions.ts` 단일 파일로 관리했으나, 도메인별 파일로 분리해 관심사 분리와 유지보수성을 개선했습니다.

```
app/actions/
├── _base.ts       # wrap() 헬퍼, 공통 에러 처리
├── menu.ts        # 메뉴 CRUD
├── orders.ts      # 주문 저장·조회·삭제
├── stats.ts       # 매출 통계, 수동 매출 입력
├── inventory.ts   # 재고 차감·입고·레시피
├── schedule.ts    # 팝업·근무자 일정
└── memos.ts       # 운영 메모
```

### Broadcast vs DB Polling
**결정:** 카트 상태 동기화에 Supabase Realtime Broadcast 사용  
**이유:** 카트는 결제 전까지 휘발성 데이터 — DB에 저장할 이유가 없음. Broadcast는 DB I/O 없이 WebSocket으로 중계되며, Vercel 서버리스 함수 재시작에도 영향받지 않음.

### Service Role Key 격리
**결정:** `lib/supabase-admin.ts`를 별도 모듈로 분리  
**이유:** `NEXT_PUBLIC_` 접두사 실수를 물리적으로 방지. 파일 자체가 Server Actions에서만 import되므로 클라이언트 번들에 절대 포함되지 않음. anon 클라이언트(`supabase.ts`)와 admin 클라이언트(`supabase-admin.ts`)의 역할을 코드 레벨에서 명확히 분리.

### 소프트 딜리트
**결정:** 메뉴 삭제 시 `is_active = false`  
**이유:** `order_items.menu_item_id`는 `menu_items.id`를 FK로 참조함. 하드 딜리트 시 과거 주문의 FK가 깨져 통계 집계 불가. 소프트 딜리트로 주문 이력·매출 정합성을 영구 보존.

### 토큰 자동 만료
**결정:** 인증 토큰에 배포 시 변경되는 시크릿을 포함  
**이유:** 비밀번호 변경이나 재배포 시 기존 localStorage 토큰을 무효화해야 함. Vercel의 `VERCEL_DEPLOYMENT_ID`를 서명 재료로 사용하면 별도의 토큰 블랙리스트 DB 없이 자동 만료 구현 가능.

---

## 실시간 동기화 아키텍처

캐셔와 고객 화면은 Supabase Realtime Broadcast로 DB 저장 없이 WebSocket 중계합니다. Vercel 서버리스와 완전 호환됩니다.

```
캐셔 (/pos)                                  고객 (/display)
┌────────────────────────┐                  ┌────────────────────────┐
│  counts 상태 변경       │  cart_update     │  보기 모드             │
│  → cart_update 송신    │ ──── Broadcast ──→│  실시간 카트 미러링    │
│                        │                  │  색상·수량·합계 표시   │
│  customer_update 수신  │←─── Broadcast ───│  주문 모드             │
│  → counts 업데이트     │  customer_update  │  메뉴 탭 → delta 송신  │
└────────────────────────┘                  └────────────────────────┘
       │  checkout_complete ──────────────────────────────→ 결제 완료 오버레이
       │                                                    + 컨페티 애니메이션
       └── Presence ──────────────────── 접속 중인 캐셔 목록 실시간 표시

채널명: cart-display
이벤트: cart_update       (캐셔 → 손님) — 전체 카트 상태 + 메뉴 색상
        customer_update   (손님 → 캐셔) — { itemId, delta: +1 | -1 }
        checkout_complete (캐셔 → 손님) — 결제 완료 항목 + 합계
        cart_reset        (캐셔 → 손님) — 카트 전체 초기화
        request_sync      (손님 → 캐셔) — 채널 접속 시 현재 카트 동기화 요청
```

---

## 인증 & 보안 설계

```
PasswordGate (app/password-gate.tsx)
  공개 경로 (바이패스): /, /display
  인증 필요 경로: /pos, /orders, /memo, /inventory 등
  인증 방식: POPUP_PASSWORD → POST /api/auth/verify → 서명 토큰 → localStorage
  만료 조건: 재배포(Vercel Deployment ID 변경) 또는 비밀번호 변경 시 자동 무효화

AdminGate (app/admin-gate.tsx)
  적용 범위: app/(admin)/ 라우트 그룹 (layout.tsx에서 일괄 적용)
             /stats, /schedule, /settings, /inventory, /devtools
  인증 방식: ADMIN_PASSWORD → POST /api/auth/admin → 서명 토큰 → localStorage
```

**클라이언트·서버 키 격리**

```
lib/supabase.ts          ← NEXT_PUBLIC_ 키 사용, 브라우저·서버 모두 사용 가능
lib/supabase-admin.ts    ← SUPABASE_SERVICE_ROLE_KEY 사용, Server Actions에서만 import
```

`supabase-admin.ts`는 서버 전용 모듈로, 클라이언트 번들에 절대 포함되지 않습니다. Supabase RLS와 함께 최소 권한 원칙을 코드 레벨에서 강제합니다.

---

## 사용자 역할 (3-Role)

| 역할 | 설명 | 접근 경로 |
|------|------|-----------|
| **손님** (Guest) | 주문하는 고객 | `/display` |
| **캐셔** (Cashier) | 알바생·직원 | `/pos`, `/orders`, `/memo`, `/inventory` |
| **어드민** (Admin) | 운영 관리자 | 위 전체 + `/stats`, `/schedule`, `/settings` |

---

## 프로젝트 구조

```
app/
├── page.tsx                   # 랜딩 — 역할 선택 (손님/캐셔)
├── password-gate.tsx          # 캐셔 인증 게이트
├── admin-gate.tsx             # 어드민 인증 게이트
├── actions/                   # Server Actions — 도메인별 파일로 분리
│   ├── _base.ts               # wrap() 헬퍼, 공통 에러 처리
│   ├── menu.ts                # 메뉴 CRUD
│   ├── orders.ts              # 주문 저장·조회·삭제
│   ├── stats.ts               # 매출 통계, 수동 매출 입력
│   ├── inventory.ts           # 재고 차감·입고·레시피
│   ├── schedule.ts            # 팝업·근무자 일정
│   └── memos.ts               # 운영 메모
├── providers.tsx              # TanStack Query Provider
├── pos/page.tsx               # 캐셔 POS 메인
├── display/page.tsx           # 고객 디스플레이 (보기/주문 모드)
├── memo/page.tsx              # 운영 메모
├── orders/page.tsx            # 주문 현황 (결제 확인·삭제)
├── inventory/page.tsx         # 재고 관리
├── (admin)/
│   ├── layout.tsx             # AdminGate 일괄 적용
│   ├── stats/                 # 매출 통계 (커스텀 훅 분리 구조)
│   │   ├── page.tsx
│   │   ├── _hooks/            # useCalendar, useTodayStats, useBreakdown ...
│   │   ├── _components/       # CalendarSection, ManualSalesModal ...
│   │   └── _lib/              # period 유틸
│   ├── schedule/              # 일정 관리
│   ├── settings/              # 메뉴 설정
│   └── devtools/              # 개발 도구
└── api/auth/
    ├── verify/                # 캐셔 인증 토큰 발급·검증
    └── admin/                 # 어드민 인증 토큰 발급·검증

components/
├── NavBar.tsx                 # 네비게이션 (접이식, Presence 표시)
└── SalesBanner.tsx            # 오늘 매출 요약 배너

hooks/
└── usePresence.ts             # Supabase Presence — 접속 캐셔 목록 구독

lib/
├── supabase.ts                # anon 클라이언트 (브라우저·서버 공용)
├── supabase-admin.ts          # service role 클라이언트 (서버 전용)
├── tiers.ts                   # 매출 등급 시스템 정의
└── utils.ts                   # formatPrice, hexWithAlpha, formatKSTTime ...

types/
├── api.ts                     # ApiResponse<T>, 각 액션 반환 타입
└── database.ts                # Supabase 테이블 인터페이스 (MenuItem, Order ...)
```

---

## 데이터베이스 스키마

### 핵심 도메인

| 테이블 | 주요 컬럼 | 비고 |
|--------|-----------|------|
| `menu_items` | `id`, `name`, `price`, `color`(hex), `stock`, `is_active`, `display_order` | 소프트 딜리트 |
| `orders` | `id`, `total_price`, `payment_method`, `payment_status`, `cashier_name`, `is_prepared`, `created_at` | UTC 저장 |
| `order_items` | `order_id`, `menu_item_id`, `quantity`, `unit_price`, `subtotal` | FK 보존 목적 |

### 재고 관리

| 테이블 | 주요 컬럼 | 비고 |
|--------|-----------|------|
| `ingredients` | `id`, `name`, `category`(`빵`\|`크림`\|`과일`\|`패키지`), `unit_type`(`count`\|`weight`), `sealed_count`, `opened_remaining`, `reorder_at_containers` | 봉·박스 이중 단위 |
| `recipes` | `menu_id`, `ingredient_id`, `qty_per_unit` | 메뉴↔재료 N:M |
| `deduction_events` | `id`, `order_id`, `ingredient_id`, `qty_deducted`, `created_at` | 주문 시 자동 생성 |
| `restock_events` | `id`, `ingredient_id`, `sealed_delta`, `opened_delta`, `note`, `created_by` | 수동 입고 기록 |

### 운영 관리

| 테이블 | 주요 컬럼 | 비고 |
|--------|-----------|------|
| `popup_events` | `id`, `name`, `start_date`, `end_date` | 팝업 행사 단위 |
| `schedule_slots` | `id`, `event_id`, `schedule_date`, `role`, `person_name`, `work_time`, `worker_id` | 근무 배정 |
| `workers` | `id`, `event_id`, `name`, `color`, `phone`, `bank_name`, `bank_account`, `hourly_rate`, `payment_done`, `worker_role` | 정산 추적 |
| `memos` | `id`, `title`, `content`, `color` | 캐셔 이상 접근 |
| `daily_sales` | `id`, `sale_date`(UNIQUE), `total_revenue`, `total_orders`, `note` | 수동 매출 입력 |

**주요 설계 결정:**
- `menu_items.is_active = false` — 소프트 딜리트, `order_items` FK 정합성 유지
- `orders.created_at` — UTC `timestamp without time zone` 저장, KST 변환은 `+ INTERVAL '9 hours'`
- `get_monthly_sales_by_date` RPC — KST 기준 일별 매출 그룹핑
- `daily_sales.sale_date` UNIQUE 제약 — upsert-on-conflict 보장

---

## 환경 변수

`.env.example`을 복사해 `.env`로 사용합니다.

```bash
cp .env.example .env
```

| 변수 | 용도 | 노출 범위 |
|------|------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 브라우저 공개 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 | 브라우저 공개 |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS 우회 admin 키 | **서버 전용** |
| `POPUP_PASSWORD` | 캐셔 화면 접근 비밀번호 | 서버 전용 |
| `ADMIN_PASSWORD` | 어드민 화면 접근 비밀번호 | 서버 전용 |
| `DISCORD_WEBHOOK_URL` | 메뉴 설정 변경 알림 (선택) | 서버 전용 |

---

## 실행

```bash
yarn install
yarn dev      # http://localhost:3000
yarn build    # 프로덕션 빌드 (TypeScript 타입 검사 포함)
yarn lint     # ESLint 검사
```

