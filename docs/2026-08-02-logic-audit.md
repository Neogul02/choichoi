# 2026-08-02 핵심 로직 평가

> ralph 세션. 목표: 로직을 해치지 않는 선에서 도메인별 코드 품질 평가 + 안전한 개선 발굴·수정.
> "안전한 개선" = 버그·보안 격차·중복·미검증 경계 등 명백한 결함. 의도된 비즈니스 로직 판단이 필요한 사안은 수정하지 않고 여기에만 기록.

## 요약

| # | 영역 | 발견 | 심각도 |
|---|------|------|--------|
| 1 | 급여·근무시간 | `fetchMonthlyPayroll` 인증 체크 누락 — 계좌번호·급여 무인증 노출 가능 | 🔴 보안 |
| 2 | 로스터 자동배정 | 휴식시간 판정이 개별 연장근무 무시 — 9시간 휴식 규칙 사각지대 | 🔴 버그 |
| 3 | POS 주문 | 주문 생성 부분 실패 시 유령 주문이 매출 집계에 잔존 | 🔴 버그 |
| 4 | 인증·권한 전수 | 서버 액션 **68개**에서 role 검증 누락 — 페이지 미들웨어로는 보호 안 됨 | 🔴 보안(대형) |
| 5 | 재고 입고(`addRestock`) | select→JS계산→update 2단계 방식이라 동시 입고 시 delta 유실 가능 — 원자적 RPC로 교체 | 🟡 버그(동시성) |
| 6 | 계약서·셀프서비스·디스플레이 스팟체크 | 로직 결함 없음, `contracts.ts` 죽은 import만 정리 | ⚪ 정리 |
| 7 | 서버 액션 오류 처리(`wrap`·staff/workers/payroll 원시 try/catch) | Next.js 내부 제어 흐름(`DYNAMIC_SERVER_USAGE`·`NEXT_REDIRECT`·`NEXT_NOT_FOUND`)을 진짜 오류로 오인해 Discord 오탐 발송 — digest 기반으로 재던지도록 수정 | 🔴 버그(회귀) |

전부 기존 정상 동작(인증된 사용자의 반환값·계산 결과)은 바꾸지 않고, 누락된 방어·정합성 보정만 추가했다. 검증 기준·상세 근거는 각 절 참조.

## 1. 급여·근무시간 계산 (`lib/workhours.ts`, `app/actions/payroll.ts`)

### 평가
- **단일 기준 원칙이 실제로 지켜지고 있음**: `shiftRawMinutes`/`paidMinutes`/`minutesToHours` 세 함수를 서버 3곳(`fetchStaffAssignmentsInRange`, `fetchStaffMonthlyDetail`, `fetchMonthlyPayroll`)과 클라이언트 3곳(`StaffTotalsPanel`, `PayrollDetailModal`, `MySchedulePageClient`)이 전부 import해서 쓰고, 어디도 재구현하지 않음. 오늘 오전 커밋(`80a0742`)의 통일 작업이 코드베이스 전체에 걸쳐 유지되고 있음을 확인.
- **"합산 후 1회 반올림" 규칙 준수**: `fetchMonthlyPayroll`은 분 단위로 합산(`totals.minutes`)한 뒤 `minutesToHours`를 마지막에 1번만 호출 — 개별 반올림 후 합산했다면 발생했을 오차(`lib/workhours.test.ts`의 "합산 후 1회 반올림과 개별 반올림 후 합산은 다르다" 테스트가 이 회귀를 커버) 없음.
- **휴게시간 오버라이드 semantics 정확**: `a.break_minutes ?? DEFAULT_BREAK_MINUTES` — `0`(휴게 미포함)과 `null`(기본값 사용)을 구분. 테스트로 이미 커버됨.

### 🔴 발견 및 수정 — `fetchMonthlyPayroll` 인증 체크 누락 (보안)
`fetchStaffMonthlyDetail`(같은 파일)은 `getAuthUser()` + admin/manager 권한 체크가 있는데, `fetchMonthlyPayroll`은 전혀 없었음. 이 함수는 특정 role 전 직원의 **이름·전화번호·계좌번호·시급·월급**을 반환한다. 호출부(`PayrollPanel.tsx`)는 admin 레이아웃 안에 있어 페이지 진입은 막히지만, **서버 액션 자체는 페이지 라우팅 보호와 무관하게 직접 호출 가능** — 인증 없이도 이 액션만 호출하면 전 직원 계좌번호가 그대로 노출되는 상태였음.

**조치**: 같은 파일에 이미 있던 `fetchStaffMonthlyDetail`의 검증 패턴을 그대로 적용 — `getAuthUser()` 실패 또는 role이 admin/manager가 아니면 거부. 비즈니스 로직(정상 인증 시 반환값)은 변경 없음.

### 부수 정리
- `payroll.ts`에서 미사용 `createClient`(`@supabase/supabase-js`) import 제거 — 실제 쿼리는 전부 `supabaseAdmin` 경유, 이 import는 본문 어디서도 참조되지 않던 죽은 코드.
- 중복 빈 줄 1곳 정리.

### 보류 (비즈니스 판단 필요 — 미수정)
- 없음.

## 2. 로스터 자동배정·규칙 검증 (`lib/roster/autofill.ts`, `lib/staffing.ts`)

### 평가
- `runGreedy`의 가변 상태 복사(각 후보 트라이얼마다 `Map` 얕은 복사)는 정상 — 트라이얼 간 상태 오염 없음. 12후보 재시도 + 연속성 점수 최소 채택, `bestScore === 0` 조기종료 로직도 원본과 동일하게 동작(오늘 오전 리팩터링에서 byte-identical 이동 확인됨).
- `findRosterViolations`의 주 경계 판정은 `getWeekStart`(일요일 시작, 달력 표시 기준과 동일) 하나로 일관 — 위반 검출과 근무표 화면의 주 구분이 어긋나지 않음.
- `checkStaffAvailability`는 죽은 코드가 아님 — `DayPanel.tsx`가 실제로 호출해 배정 UI에 사유를 표시함. (`roster.ts`가 이 함수를 안 쓰는 것은 맞지만, 그건 자동배정이 자체 `isAvailable` 클로저를 쓰기 때문이고 함수 자체는 살아있음 — 오늘 오전 리팩터링 때 `roster.ts`의 죽은 *import*만 제거한 것이 맞는 판단이었음을 재확인.)

### 🔴 발견 및 수정 — 자동배정 휴식시간 판정이 개별 수정 퇴근시간을 무시함
`autoFillRoster`(`app/actions/roster.ts`)가 "전날 몇 시에 퇴근했는지"(`staffEndByDate`)를 만들 때 **항상 파트의 기본 퇴근시간**(`shift.end_time`)을 썼음 — 근무표에서 개별적으로 늦게까지 연장한 배정이 있어도 그 값을 무시. 반면 근무표 화면에 실제로 위반을 표시하는 `findRosterViolations`(`lib/staffing.ts:116`)는 `a.end_time ?? shift.end_time`으로 개별 오버라이드를 우선 적용 — 같은 "9시간 휴식" 규칙인데 자동배정 내부 판정과 화면 표시 판정이 서로 다른 데이터를 보고 있었음.

**시나리오**: A 직원이 어제 저녁 파트(기본 22:00 종료)를 23:30까지 연장 근무했다면, 자동배정은 "22:00에 퇴근했다"고 착각해 오늘 06:00 시작 파트에 배정할 수 있음(실제 휴식 6.5시간 < 9시간, 규칙 위반이지만 자동배정은 이를 인지하지 못함).

**조치**: 조회 쿼리에 `start_time, end_time` 컬럼 추가, `staffEndByDate` 구성 시 `a.end_time ?? sh.end_time`으로 `findRosterViolations`와 동일한 규칙 적용. 자동배정의 다른 로직(그룹 부하·스트릭·선호도 정렬 등)은 변경 없음 — 순수하게 "실제 퇴근 시각을 정확히 아는가"만 고친 버그 수정.

### 보류 (비즈니스 판단 필요 — 미수정)
- 없음.

## 3. POS 주문·재고 (`app/actions/orders.ts`)

### 평가
- **인증 모델 확인**: `orders.ts`·`menu.ts`·`memos.ts`·`inventory.ts`·`schedule.ts`·`pos-note.ts`·`stats.ts` 전부 `getAuthUser()` 호출이 없음 — POS/운영 도메인 전체가 동일한 패턴. `middleware`(`proxy.ts`)도 `/pos`·`/orders`를 보호 대상에 넣지 않음. HR/급여/계약 도메인(`staff.ts`·`payroll.ts`·`roster.ts`·`contracts.ts`·`workers.ts`)만 `getAuthUser()`를 씀. **결론: POS 도메인이 인증 체크가 없는 건 일관된 설계(클라이언트 PasswordGate + 팝업 쿠키로 게이트, 물리적 POS 단말 환경 가정)이지 개별 함수의 누락이 아님** — US-001의 `fetchMonthlyPayroll`과 다른 사례. 같은 파일 안에 이미 검증 패턴이 있었던 payroll과 달리, POS 도메인 전체에 그런 선례가 없어 "의도된 아키텍처"로 판단, 수정하지 않음.
- **재고 RPC 원자성**: `decrement_menu_stock`은 `UPDATE menu_items SET stock = stock - x WHERE id = ...` 단일 SQL문 — Postgres 행 잠금으로 동시 결제 시에도 카운트가 유실되지 않음(레이스 없음). 확인 완료.

### 🔴 발견 및 수정 — 주문 생성 실패 시 유령 주문 잔존 가능
`createOrder`가 `orders` insert와 `order_items` insert를 별도 호출로 처리(트랜잭션 없음). `order_items` insert가 실패하면 `orders` 행은 이미 커밋된 상태로 남아 — 캐셔에게는 "결제 실패"로 보이지만 항목 없는 주문이 매출 집계(`getTodaysSales` 등)에 그대로 잡힘. 재시도 시 캐셔가 다시 결제하면 사실상 중복 매출이 될 수 있음.

**조치**: `order_items` insert가 실패하면 방금 만든 `orders` 행을 즉시 삭제(best-effort)한 뒤 에러를 던지도록 수정 — 실패가 실제로 "아무 일도 없었던 것"이 되도록 정합성만 보정. 성공 경로·재고 차감·알림 로직은 전혀 변경하지 않음.

### 보류 (비즈니스 판단 필요 — 미수정)
- **재고 음수 허용**: `decrement_menu_stock`은 재고를 0 아래로 클램프하지 않음(`stock = stock - x`, 음수 가능). 동시 결제가 몰리면 화면에 "-1개" 같은 음수 재고가 표시될 수 있음. 오버셀을 허용하고 음수로 "초과 판매됨"을 알리는 의도적 설계일 수도, 0에서 막아야 할 버그일 수도 있어 판단 보류 — DB RPC 수정이 필요해 리스크도 있음. `inventory.ts`의 다른 재고(`sealed_count`/`opened_remaining`)는 `Math.max(0, ...)`로 클램프하는 것과 대조적이라는 점만 기록.
- **`removeOrder`의 2단계 삭제**(`order_items` 삭제 → `orders` 삭제)도 트랜잭션 없음 — 두 번째 삭제가 실패하면 항목 없는 빈 주문이 남을 수 있음. 발생 가능성은 낮음(별도 테이블이 orders를 참조하는 FK 없음)이나, 완전한 해결은 RPC/트랜잭션 도입이 필요해 이번 범위에서는 관찰만 기록.

> **⚠️ 정정 (US-4에서 발견)**: 위 "POS 도메인 전체가 인증 체크 없음은 일관된 설계"라는 결론은 **부분적으로 틀렸다**. `orders.ts` 자체의 결제·조회 함수(saveOrder 등)는 맞지만, 같은 파일의 `fetchOrdersByPeriod`는 실제로는 `/stats`(admin 전용) 화면에서만 쓰이는 함수였고, `menu.ts`의 메뉴 CRUD·`inventory.ts` 전체·`stats.ts` 전체도 마찬가지로 admin/manager 전용 페이지에서만 쓰이면서 체크가 빠져 있었음 — "POS 도메인"이라는 하나의 카테고리로 뭉뚱그린 게 오류였다. 상세는 4번 항목 참조.

## 4. 인증·권한 전수 검사 (`app/actions/*.ts` 전체, `proxy.ts` 기준)

### 방법
`proxy.ts` 미들웨어가 곧 이 앱의 "의도된 권한 모델" 그 자체다 — 함부로 추측하지 않고 이 파일을 유일한 기준으로 삼았다.

```
adminOnlyPrefixes = ['/settings', '/devtools', '/hr', '/stats']   → role === 'admin'
managerPrefixes   = ['/inventory', '/roster']                     → role === 'admin' | 'manager'
(그 외 /pos·/orders·/memo·/my 등은 미들웨어 보호 대상 아님 — 로그인 여부만 각 액션이 알아서 판단)
```
**핵심 함정**: Next.js 서버 액션은 페이지 라우트가 아니라 별도 POST 엔드포인트라, 위 미들웨어의 페이지 진입 차단이 액션 자체를 보호하지 않는다. "관리자만 들어가는 페이지에서만 이 함수를 부른다"는 것과 "이 함수 자체가 관리자인지 검사한다"는 건 다른 문제다. 액션 46개 전체를 실제 호출부(grep으로 페이지별 소비처 확인) 기준으로 재분류해 미들웨어 요구 role과 대조했다.

### 🔴 발견 및 수정 — 서버 액션 68개에서 역할 검증 누락
아래 파일들의 함수가 미들웨어 기준 role(대부분 admin, 일부 manager+admin)을 요구하는 페이지에서**만** 쓰이는데도 액션 자체엔 검증이 없어, 페이지를 거치지 않고 액션을 직접 호출하면 인증·역할 없이 데이터를 읽거나 조작할 수 있었다.

| 파일 | 요구 role | 대상 함수 | 근거(유일한 소비처) |
|------|-----------|-----------|---------------------|
| `roster.ts` | admin | 23개(파트·배정 CRUD, 자동배정, 인쇄용 조회 등) | `/hr` 컴포넌트 전용(grep 전수 확인) |
| `schedule.ts` | admin | `createNewPopupEvent`·`editPopupEvent`·`removePopupEvent`·`togglePopupEventActive` | `/settings` `PopupManagementSection.tsx` 전용 |
| `staffPopups.ts` | admin | 6개 전부 | `/hr` 전용 |
| `contracts.ts` | admin | `generateContract`·`deleteContract`·`fetchContractedStaffIds`·`fetchAllContracts`·`getWorkerContracts` | `/hr` 전용. **`getWorkerContracts`는 workerId를 임의로 넘기면 서명된 PDF URL(주소·서명 포함 근로계약서)이 그대로 나오는 구조였음** — 가장 심각한 사례 |
| `staff.ts` | admin(대부분)·manager+admin(`fetchStaffProfiles`·`getStaffById`) | 8개(건강증명서 업로드/조회 포함, 계좌번호 등 PII) | `/hr` + `fetchStaffProfiles`만 `/roster`(manager)와 공유 |
| `inventory.ts` | manager+admin | 6개 전부 | `/inventory` 전용 |
| `stats.ts` | admin | 9개 전부 | `/stats`·`/settings`(DevTools) 전용 |
| `orders.ts` | admin | `fetchOrdersByPeriod` 1개만 | `/stats` `HourlySalesSection` 전용 — 나머지(`saveOrder` 등)는 `/pos`와 공유라 그대로 둠 |
| `menu.ts` | admin | `createNewMenuItem`·`editMenuItem`·`removeMenuItem`·`reorderMenuItems`·`getAllMenu` | `/settings` 전용 — `fetchMenuItems`·`updateMenuStock`은 `/pos`와 공유라 그대로 둠 |

**조치**: `app/actions/_base.ts`에 `requireAdmin()`·`requireManagerOrAdmin()` 공용 헬퍼 신설(기존 `fetchStaffMonthlyDetail` 등이 쓰던 인라인 체크와 동일한 로직, throw 기반이라 `wrap()`과 자연스럽게 맞물림). 위 68개 함수 각각의 본문 첫 줄에 삽입. **정상 인증된 요청의 동작·반환값은 전혀 바뀌지 않는다** — 오직 미인증/권한 부족 요청만 새로 거부된다.

### 확인 — 이미 올바르게 구현돼 있던 것들 (손대지 않음)
- `roster-view.ts`(`fetchRosterOverview`·`createRosterMemo`·`deleteRosterMemo`) — `getAuthUser()`가 아니라 자체 `getManagerSession()`(직접 `auth.getSession()` 호출) 패턴으로 이미 manager+admin 검증 중. 최초 grep이 `getAuthUser` 문자열만 찾아 놓쳤던 것 — 실제 파일을 읽고서야 이미 정확함을 확인.
- `contracts.ts`의 `getMyContracts`·`signContract`는 세션 존재 + 본인 소유 확인(`ownerRecord`가 `session.user.id`와 일치하는지)까지 정확히 되어 있음 — 직원 셀프서비스 함수로 올바르게 설계됨.
- `getMyRoster`·`getStaffRosterAsManager`·`fetchStaffPickerList`·`fetchMonthlyPayroll`(US-1)·`fetchStaffMonthlyDetail`은 이미 정확.
- `fetchTomorrowRosterDigest`(`roster.ts`)는 유저 세션이 아예 없는 Vercel Cron 전용 호출(`CRON_SECRET` 헤더로 라우트 단에서 별도 보호) — 여기에 `requireAdmin()`을 넣으면 크론이 깨지므로 의도적으로 제외.
- `fetchActivePopupEvents`(`schedule.ts`)는 로그인 전 화면(`password-gate.tsx`)·디스플레이 보드(`/display`)에서 쓰는 함수라 의도적으로 인증 없음 유지.
- `saveOrder`·`removeOrder`·`fetchTodaysSales` 등 `orders.ts`의 나머지 함수, `menu.ts`의 `fetchMenuItems`/`updateMenuStock`, `memos.ts`·`pos-note.ts` 전체는 `/pos`·`/orders`·`/memo`처럼 미들웨어 보호 대상이 아닌 페이지 전용이라 그대로 둠(POS 단말 환경이 물리적 접근으로 게이트된다는 전제).

### 보류 (비즈니스 판단 필요 — 미수정)
- `fetchPopupEvents`(`schedule.ts`, 읽기 전용)는 `/hr`·`/settings`(admin)와 `roster-view.ts`(manager) 양쪽에서 쓰여 요구 role이 갈린다. 저민감(팝업 이름·날짜) 데이터라 관찰만 하고 손대지 않음 — 굳이 조인다면 manager+admin이 맞겠지만, 범위 확장 판단은 보류.

## 5. 재고 관리 (`app/actions/inventory.ts`)

### 평가
- `physicalInventory`(실사 입력)는 절대값으로 덮어쓰는 단일 `UPDATE` 문이라 원자적 — 동시 실사는 "나중 값이 이긴다"는 의도된 semantics 그대로 안전.
- `deduct_for_order` RPC(`20260521063801_create_deduct_for_order_rpc.sql`)는 이미 `for update of ig`로 행 잠금까지 거는 원자적 차감을 쓰고 있어, 주문 시 재고 차감 경로는 처음부터 정합성이 보장돼 있었음.
- `addIngredient`·`deleteIngredient`·`updateIngredientMeta`는 단일 쿼리라 별도 위험 없음.

### 🟡 발견 및 수정 — `addRestock`의 비원자적 델타 갱신 (동시성 버그)
`addRestock`은 `restock_events` insert 후 **별도 SELECT로 현재 수량을 읽고, JS에서 델타를 더해 다시 UPDATE**하는 3단계 방식이었다. 같은 재료를 두 스태프가 거의 동시에 입고 처리하면(예: 바코드 스캔 연속 입력), 두 요청이 같은 SELECT 결과를 읽고 각자 계산한 값으로 순차 UPDATE — 나중 write가 앞선 write를 덮어써 한쪽 delta가 조용히 유실된다. 위 `deduct_for_order`(주문 차감)는 처음부터 DB 레벨 원자적 처리로 이 문제가 없었는데, `addRestock`(입고)만 이 패턴에서 벗어나 있던 비일관 지점.

**조치**: `apply_restock(p_ingredient_id, p_sealed_delta, p_opened_delta, p_note, p_created_by)` RPC를 신설(`supabase/migrations/20260803022654_atomic_restock_rpc.sql`) — insert + 델타 반영 update를 단일 함수 트랜잭션으로 묶어 원자화. 기존 `decrement_menu_stock`과 동일하게 `security definer` + `public/anon/authenticated`로부터 `revoke execute`해 서버(service role)만 호출 가능하도록 제한. `addRestock` 본문을 `supabaseAdmin.rpc('apply_restock', ...)` 호출 한 줄로 교체. **입력·출력 semantics(델타 반영 후 0 미만 클램프)는 동일** — 오직 두 동시 요청 사이의 레이스 윈도우만 제거됐다.

### 보류 (비즈니스 판단 필요 — 미수정)
- 없음.

## 6. 계약서 발급·서명, 스태프 셀프서비스, 고객 디스플레이 (스팟 체크)

### 평가
- **`contracts.ts`**: `generateContract`/`signContract` 모두 PDF 렌더링 → 업로드 → SHA-256 해시 저장 흐름이 일관됨. `signContract`는 `staff_profiles.user_profile_id`로 본인 소유를 확인한 뒤에만 서명을 허용하고, `worker_signed_at` 존재 시 재서명을 막는 것도 정상 동작. `getWorkerContracts`(admin 전용)는 이미 `requireAdmin()`으로 게이트됨(4절 US-004에서 처리) — PDF 서명 URL이 무인증으로 노출되던 원 문제는 해결됨. 미사용 `createClient` import는 `payroll.ts`와 동일한 패턴의 죽은 코드라 제거.
- **`MySchedulePageClient.tsx`**: `ownStaffId`(고정)와 `viewingId`(현재 조회 대상)를 분리해 관리자가 타인 스케줄을 봐도 "내 스케줄" 전환이 꼬이지 않게 설계됨. `skipFirstDetailRef`로 `handlePickStaff`가 직접 상세를 조회한 직후 뒤따르는 `[cursor, viewingId]` effect의 중복 조회를 정확히 건너뜀. 총 근무시간도 분 단위 합산 후 1회 반올림으로 급여 계산과 동일 기준 사용. 안전한 개선 없음.
- **`/display`(고객 디스플레이)**: Supabase Realtime broadcast(`cart_update`/`cart_reset`/`checkout_complete`) 구독 기반, 서버 뮤테이션 없이 순수 화면 반영 로직 — 결제/재고 등 정합성에 영향 없는 프레젠테이션 레이어. 안전한 개선 없음.

### 보류 (비즈니스 판단 필요 — 미수정)
- 없음.
- `getStaffById`(`staff.ts`)는 현재 앱 어디서도 호출되지 않는 죽은 export. 그래도 서버 액션으로 계속 노출돼 있어 방어적으로 manager+admin 체크는 넣었음(공짜 방어). 삭제 여부는 이번 범위 밖.

## 7. 서버 액션 오류 처리 — Next.js 내부 제어 흐름 오탐 (`app/actions/_base.ts`, `staff.ts`, `workers.ts`, `payroll.ts`)

### 배경
이번 패스에서 `/inventory`·`/hr` 관련 서버 액션에 `requireAdmin()`/`requireManagerOrAdmin()`(내부적으로 `cookies()` 사용)을 추가한 뒤, 실제 프로덕션 Discord 채널에 "서버 액션 실패" 알림이 다수 발생했다. 메시지: `Dynamic server usage: Route /inventory(또는 /hr) couldn't be rendered statically because it used cookies`.

### 🔴 발견 및 수정 — 오탐(오류 아님)을 진짜 오류로 보고
Next.js는 어떤 라우트가 정적 렌더링 가능한지 판별할 때, `cookies()` 등 동적 API가 호출되면 내부적으로 `DynamicServerError`(digest: `DYNAMIC_SERVER_USAGE`)를 던져 스스로 감지한다 — 이건 버그가 아니라 Next.js의 **정상적인 내부 제어 흐름**이다. `redirect()`/`notFound()`도 동일한 방식(digest: `NEXT_REDIRECT`/`NEXT_NOT_FOUND`)으로 동작한다.

`/inventory`·`/hr`는 서버 컴포넌트(`page.tsx`)에서 `fetchIngredients()`·`fetchAllRosterShifts()` 등 서버 액션 함수를 빌드/데이터수집 시점에 직접 호출한다(HTTP 왕복 없는 in-process 호출 최적화, 코드 내 주석 "서버 컴포넌트에서 서버 액션 함수를 직접 호출하면..." 참조). 오늘 이 액션들에 `requireAdmin()`을 추가하기 전에는 `cookies()`를 전혀 건드리지 않아 이 신호가 발생하지 않았다. 추가 후, 빌드의 "정적 렌더링 가능한가" 판별 시도 중 `cookies()`에 도달해 `DynamicServerError`가 발생했고 — 이는 정상이며 실제로 빌드 결과 `/inventory`·`/hr` 모두 `ƒ`(Dynamic)로 올바르게 판별됐다 — 문제는 `app/actions/_base.ts`의 `wrap()`이 **모든 예외를 무조건 캐치**해 이 정상 신호까지 "서버 액션 실패"로 오인, Discord로 오탐 보고를 보낸 것이다. `staff.ts`·`workers.ts`·`payroll.ts`의 원시 `try/catch(err) { return { success:false, error:String(err) } }` 패턴도 동일한 결함을 갖고 있었다(다만 Discord 보고는 하지 않고 반환값으로 삼켜 정적 판별 신호 자체를 막는 형태) — `redirect()`/`notFound()`가 이 액션들 안에서 나중에 쓰인다면 그마저 정상 동작하지 않았을 잠재 결함.

**조치**: `_base.ts`에 `isNextInternalControlFlowError(e)`를 신설 — `e.digest`가 `DYNAMIC_SERVER_USAGE`·`NEXT_REDIRECT`(prefix)·`NEXT_NOT_FOUND`·`NEXT_HTTP_ERROR_FALLBACK`(prefix) 중 하나면 캐치하지 않고 그대로 재던짐(Next.js 렌더러가 처리하도록). `wrap()`과 `staff.ts`/`workers.ts`/`payroll.ts`의 모든 catch 블록(12+7+3곳)에 동일 가드 적용. **일반 애플리케이션 오류의 처리·응답 형식은 전혀 바뀌지 않음** — 오직 Next.js 자체 제어 신호만 통과시킨다. 부수적으로 `workers.ts`의 미사용 `createClient` import(4번째 동일 패턴)도 제거.

### 보류 (비즈니스 판단 필요 — 미수정)
- 없음.
