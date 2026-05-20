# ChoiChoi POS

한국 카페·베이커리 팝업스토어를 위한 웹 기반 POS 시스템. 터치·키보드 친화적인 캐셔 화면, 고객 실시간 디스플레이(단방향/양방향), 관리자 매출 통계·일정·메모 기능을 제공합니다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS 4 + Framer Motion |
| 데이터베이스 | Supabase (PostgreSQL + Realtime Broadcast) |
| 상태 관리 | TanStack Query v5 |
| 언어 | TypeScript 6 |
| 배포 | Vercel |

---

## 환경 변수

`.env` 파일에 아래 변수를 설정합니다. 실제 값은 절대 커밋하지 않습니다.

```env
POPUP_PASSWORD=...                # 캐셔 화면 접근 비밀번호
ADMIN_PASSWORD=...                # 관리자 전용 비밀번호
NEXT_PUBLIC_SUPABASE_URL=...      # Supabase 프로젝트 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=... # Supabase anon 키
```

---

## 실행

```bash
yarn install
yarn dev      # http://localhost:3000
yarn build    # 프로덕션 빌드
yarn lint     # 린트 검사
```

---

## 사용자 역할 (3-Role)

| 역할 | 설명 | 접근 가능 경로 |
|------|------|--------------|
| **손님** (Guest) | 주문하는 고객 | `/display` |
| **캐셔** (Cashier) | 알바생·직원 | `/pos`, `/orders`, `/memo` |
| **어드민** (Admin) | 운영 관리자 | 위 전체 + `/stats`, `/schedule`, `/settings` |

---

## 유저 플로우

### 손님 (Guest)

```
접속 (/)
  └─ 고객 화면 선택 → /display  (인증 불필요)
        │
        ├─ 보기 모드 (단방향)
        │     캐셔가 담은 카트 내역을 실시간으로 확인
        │     메뉴별 색상·수량·합계 표시
        │     카트가 비면 환영 화면으로 복귀
        │
        └─ 주문 모드 (양방향)
              메뉴 그리드에서 직접 항목 탭
              수량 증감 → Supabase Broadcast로 캐셔 화면에 즉시 반영
              하단 요약 바에 선택 수량·합계 표시
              초기화 버튼으로 전체 취소
```

### 캐셔 (Cashier)

```
접속 (/)
  └─ 캐셔 화면 선택 → /pos
        │
        ├─ 비밀번호 게이트
        │     이름 + POPUP_PASSWORD 입력
        │     인증 토큰 발급 → localStorage 저장
        │     재배포 또는 비밀번호 변경 시 자동 만료
        │
        └─ POS 메인 (/pos)
              메뉴 그리드 클릭 또는 숫자키 1~9 단축키
              Enter: 결제 / Esc: 초기화
              카트 변경 시 → Broadcast(cart_update) → 고객 화면 실시간 반영
              손님 주문 모드 입력 수신(customer_update) → 카트 자동 업데이트
              결제 완료 → DB 저장 + 컨페티 애니메이션
              최근 주문 5건·오늘 매출 배너 하단 표시
              접속 중인 캐셔 이름 NavBar에 실시간 표시 (Supabase Presence)

        └─ 메모 (/memo)
              운영 메모 카드 형태로 CRUD
              색상 지정 가능, 레시피·공지 등 반복 참조 정보 저장
```

### 어드민 (Admin)

```
NavBar 관리자 버튼 → ADMIN_PASSWORD 입력
  └─ 어드민 전용 메뉴 활성화
        │
        ├─ 통계 (/stats)
        │     오늘 주문 현황 + 결제 수단별 매출
        │     메뉴별 판매량 차트
        │     월간 캘린더로 일별 매출 흐름 파악
        │     재료비·기타 비용 입력 → 순이익 계산
        │
        ├─ 일정 (/schedule)
        │     팝업·행사 일정 목록 추가·삭제
        │     근무자별 시급·배정 설정
        │
        └─ 설정 (/settings)
              메뉴 항목 추가·수정·삭제
              이름, 가격, 색상(hex) 설정
              드래그(PC) / 핸들(모바일)로 표시 순서 변경
              삭제 = 소프트 딜리트 (is_active = false, 주문 이력 보존)
```

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

채널명: cart-display
이벤트: cart_update      (캐셔 → 손님) — 전체 카트 상태 + 메뉴 색상
        customer_update  (손님 → 캐셔) — { itemId, delta: +1 | -1 }
```

---

## 인증 구조

```
PasswordGate (app/password-gate.tsx)
  공개 경로 (바이패스): /, /display
  인증 필요 경로: /pos, /orders, /memo 등
  인증 방식: POPUP_PASSWORD → 서버 토큰 → localStorage

AdminGate (app/admin-gate.tsx)
  적용 범위: app/(admin)/ 라우트 그룹
            /stats, /schedule, /settings, /devtools
  인증 방식: ADMIN_PASSWORD → 서버 토큰 → localStorage
```

---

## 프로젝트 구조

```
app/
├── page.tsx                  # 랜딩 — 역할 선택 (손님/캐셔)
├── password-gate.tsx         # 캐셔 인증 게이트
├── admin-gate.tsx            # 어드민 인증 게이트
├── actions.ts                # 모든 Supabase 호출 (Server Actions)
├── pos/
│   └── page.tsx              # 캐셔 POS 메인
├── display/
│   └── page.tsx              # 고객 디스플레이 (보기/주문 모드)
├── memo/
│   └── page.tsx              # 메모 (캐셔 이상 접근)
├── orders/
│   └── page.tsx              # 주문 현황 (캐셔 이상 접근)
├── (admin)/
│   ├── layout.tsx            # AdminGate 일괄 적용
│   ├── stats/                # 매출 통계
│   ├── schedule/             # 일정 관리
│   ├── settings/             # 메뉴 설정
│   └── devtools/             # 개발 도구
└── api/
    └── auth/
        ├── verify/           # 캐셔 인증 토큰 발급·검증
        └── admin/            # 어드민 인증 토큰 발급·검증

components/
├── NavBar.tsx                # 네비게이션 (접이식, 접속 캐셔 Presence 표시)
└── SalesBanner.tsx           # 오늘 매출 요약 배너

hooks/
└── usePresence.ts            # Supabase Presence — 접속 캐셔 목록 실시간 구독

lib/
├── supabase.ts               # Supabase 클라이언트 + DB 유틸 함수
└── utils.ts                  # formatPrice, hexWithAlpha, formatKSTTime 등
```

---

## 데이터베이스 스키마

| 테이블 | 주요 컬럼 |
|--------|-----------|
| `menu_items` | `id`, `name`, `price`, `color` (hex), `stock`, `is_active`, `display_order`, `updated_at` |
| `orders` | `id`, `total_price`, `payment_method`, `payment_status`, `cashier_name`, `created_at` |
| `order_items` | `order_id`, `menu_item_id`, `quantity`, `unit_price`, `subtotal` |

**주요 설계:**
- `menu_items.is_active = false` — 소프트 딜리트, 주문 이력 보존
- `orders.created_at` — UTC `timestamp without time zone` 저장
- KST 변환 — JS: `+9h 오프셋`, DB RPC: `created_at + INTERVAL '9 hours'`
- `get_monthly_sales_by_date` RPC — KST 기준 일별 매출 그룹핑

---

## 개발 이력

### 2026-05 — 실시간 고객 디스플레이 & 3-Role 권한 분리

**역할 분리 및 라우팅 재설계**
- 랜딩 페이지(`/`) 신설: 캐셔 화면·고객 화면 역할 선택
- POS를 `/` → `/pos`로 이동, NavBar POS 링크 업데이트
- `PasswordGate` 바이패스 경로에 `/` 추가 (랜딩 공개)
- 메모 페이지 `app/(admin)/memo` → `app/memo` 이동 (캐셔 접근 허용)

**고객 디스플레이(`/display`) 전면 재설계**
- 플립 배너: Framer Motion `rotateX` 3D 애니메이션, 3.5초 순환
- 보기 / 주문 토글 (탭 UI, AnimatePresence 전환)
- 보기 모드: 캐셔 카트 실시간 미러링, 메뉴 색상 뱃지·tint 표시
- 주문 모드: 메뉴 그리드, 색상 강조, +/− 수량 조작
- 선택 내역 하단 sticky 요약 바 (spring 슬라이드 애니메이션)

**Supabase Broadcast 양방향 실시간 연동**
- `cart_update`: 캐셔 → 손님 (전체 카트 상태 + 메뉴 색상)
- `customer_update`: 손님 → 캐셔 (`{ itemId, delta }` delta 방식)
- DB 저장 없이 WebSocket 중계, Vercel 서버리스 완전 호환

**버그 수정**
- KST 통계 오류: `AT TIME ZONE 'Asia/Seoul'`이 UTC 값에 역방향 변환 적용되던 문제 → `+ INTERVAL '9 hours'`로 교체

**NavBar 리팩토링**
- Supabase Presence 로직을 `hooks/usePresence.ts`로 분리
- 어드민 모달 상태를 discriminated union 타입으로 강화

### 2026-04 — 기능 완성 및 UX 개선

- `orders` 페이지 분리 (주문 현황, 결제 상태 관리)
- NavBar 내 어드민 로그인 모달 통합 (별도 페이지 제거)
- Framer Motion 전면 적용: 메뉴 카드 탭, 카트 항목 추가·제거, 금액 spring
- 메뉴 카드 선택 상태: ring border → hex 색상 tint 배경으로 개선
- `hexWithAlpha` 유틸로 색상 투명도 계산 로직 통합
- 결제 대기 박스 안 초기화 버튼 이동, POS 헤더 컴팩트화
- 캐셔 이름 localStorage 저장 + Supabase Presence 실시간 접속 목록 표시
- 일별 주문 번호 KST 자정 기준 리셋
- `SalesBanner` 컴포넌트 분리 (결제 완료 flash 애니메이션 포함)

### 2026-03 — 초기 구축

- Next.js 16 App Router 기반 POS MVP
- Supabase PostgreSQL 연동 (메뉴, 주문, 주문 상세 테이블)
- 캐셔 비밀번호 게이트 + 서버 토큰 인증 (재배포 시 자동 만료)
- 메뉴 그리드 단축키 (1–9), Enter 결제, Esc 초기화
- 설정 페이지: 메뉴 CRUD, 드래그(PC)·터치(모바일) 순서 변경
- 통계 페이지: 일별·월별 매출, 메뉴별 판매량 차트, 비용·순이익 계산
- 메모·일정 탭 (어드민 전용)
- JS → TypeScript 전환 및 코드 클린업
- Vercel 배포 구성
