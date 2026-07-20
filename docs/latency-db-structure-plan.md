# 2차 성능·구조 개선 계획 — 레이턴시, 미사용 DB 정리, 계층 통일

> 2026-07-20 수립. 1차 계획(`performance-improvement-plan.md`, 7/16)에서 흰 화면 제거·미들웨어 로컬 검증·stats 서버 프리페치·폰트 셀프호스팅은 완료됨.
> 이번 계획은 (A) 남은 레이턴시 요인 제거, (B) 코드가 참조하지 않는 DB 구조 삭제, (C) 데이터 접근 계층 통일을 다룬다.

## 진단 요약

### A. 레이턴시

| # | 문제 | 위치 | 영향 |
|---|------|------|------|
| ① | 클라이언트 페이지 8곳이 마운트 후에야 서버 액션 fetch | `pos` `orders` `memo` `my` `my/schedule` `inventory` `settings` `devtools` (`'use client'` page.tsx) | JS 로드 → 마운트 → 액션 POST 왕복. hr·stats·roster처럼 서버 프리페치하면 첫 데이터가 HTML과 함께 도착 |
| ② | NavBar가 모든 페이지 마운트마다 `getSession()` + `user_profiles` SELECT | `components/NavBar.tsx` `loadProfile()` | 페이지 이동마다 네트워크 1왕복. 이름·역할은 이미 localStorage 캐시가 있는데도 매번 재조회 |
| ③ | HR 우측 패널이 탭 전환·시그널마다 전체 refetch | `PayrollPanel`(월·역할 변경마다), `ContractsPanel`(refreshKey마다 전체), `useRosterRange` | react-query 미적용 구간 — 탭을 오갈 때마다 같은 데이터 재요청 |
| ④ | `my` 페이지가 recharts 정적 import | `app/my/page.tsx:6` (AreaChart 1개용) | 직원용 페이지 First Load JS에 recharts 전체 포함 (stats는 1차에서 dynamic 처리 완료, my만 누락) |
| ⑤ | FK 인덱스 누락 14건 | Supabase advisor | `roster_assignments(shift_id·store_id)`, `staff_profiles(store_id·user_profile_id)`, `contracts(created_by)`, `order_items(menu_item_id)` 등 — 현재 행수(수백~1만)에선 체감 작지만 조인·삭제 시 비용, 추가 리스크 0 |
| ⑥ | RLS initplan 경고 3건 | `user_profiles` 정책 (`users_read_own` 등) | `auth.uid()`가 행마다 재평가 → `(select auth.uid())`로 교체 |

### B. 미사용 DB 구조 (코드 전체 grep 결과 참조 0건)

| 테이블 | 행수 | 판단 |
|--------|------|------|
| `workers` | 29 | 레거시 — `user_profiles`/`staff_profiles`로 대체됨. 미사용 인덱스 `idx_workers_event_id`도 advisor에 보고됨 |
| `schedule_slots` | 79 | 레거시 — `roster_assignments` 체계로 대체됨 |
| `cheers` | 4 | 레거시 |

- 코드 참조 테이블 18개 확인: roster_assignments, staff_profiles, contracts, user_profiles, orders, roster_shifts, menu_items, popup_events, ingredients, memos, stores, roster_shift_requirements, daily_sales, roster_memos, manual_menu_sales, pos_note, order_items, restock_events
- 코드 측 미사용: `axios` 의존성 (import 0건 — fetch로 대체된 흔적)

### ⚠️ 보안 (계획과 별개로 즉시 결정 필요)

- **`pos_note` 테이블 RLS 비활성** — anon 키만 있으면 누구나 읽기/쓰기 가능. 서버 액션은 service role로 접근하므로 RLS를 켜도 동작에 지장 없음(클라이언트 직접 접근이 없다면). 조치안:
  ```sql
  ALTER TABLE public.pos_note ENABLE ROW LEVEL SECURITY;
  ```
  클라이언트에서 직접 조회하는 코드는 없음(`lib/supabase-admin.ts` 경유만 확인됨) → 정책 없이 켜도 안전할 것으로 판단되나, 적용 후 POS 메모 동작 확인 필요.

### C. 구조

| # | 문제 | 상세 |
|---|------|------|
| ⑦ | 데이터 접근 계층 이중화 | POS 계열 액션(orders·menu·stats·inventory·memos·pos-note·schedule)은 `lib/supabase-admin.ts`(946줄, 46개 함수) 경유. HR 계열(roster·staff·contracts·payroll·workers)은 각자 admin client 직접 생성 + 인라인 쿼리. 두 패턴 혼재로 같은 일을 찾는 위치가 두 곳 |
| ⑧ | admin client 생성 코드 중복 | `createClient(URL, SERVICE_ROLE…)` 보일러플레이트가 액션 파일마다 반복 |
| ⑨ | `app/actions/workers.ts` 이름 오도 | 실제로는 user_profiles 계정 관리 — `workers` 테이블과 무관 (테이블 삭제 시 혼동 방지 위해 주석 또는 개명) |

## 실행 계획

### P0 — 리스크 낮고 즉효 (반나절)

1. **미사용 테이블 백업 후 삭제** — `workers`, `schedule_slots`, `cheers`를 CSV로 덤프해 보관 후 `DROP TABLE`. 삭제 전 Supabase 대시보드에서 최근 접근 로그 확인.
2. **`pos_note` RLS 활성화** (위 보안 항목 — 사용자 승인 후).
3. **FK 인덱스 추가** — advisor 14건 중 실제 조인·필터 경로인 8건 우선: `roster_assignments(shift_id)`, `roster_assignments(store_id)`, `staff_profiles(store_id)`, `staff_profiles(user_profile_id)`, `contracts(created_by)`, `order_items(menu_item_id)`, `roster_shift_requirements(shift_id)`, `popup_events(store_id)`.
4. **RLS initplan 수정** — `user_profiles` 정책 3개 `auth.uid()` → `(select auth.uid())`.
5. **`axios` 제거** — `yarn remove axios`.
6. **`my` 페이지 recharts dynamic 전환** — 차트 섹션만 `next/dynamic`.

### P1 — 체감 레이턴시 (페이지당 0.5~1일)

7. **서버 프리페치 확산 (hr·stats 패턴)** — 사용 빈도 순: `pos` → `my/schedule` → `inventory` → `orders` → `memo` → `my` → `settings`.
   - page.tsx를 서버 컴포넌트로 전환, 초기 데이터 `Promise.all` 병렬 조회 → 기존 클라이언트 컴포넌트에 `initial*` props 주입 (hr/page.tsx가 참조 구현).
   - react-query 사용 페이지(pos·orders·memo)는 `initialData` 옵션으로 주입해 마운트 refetch 생략.
8. **NavBar 프로필 캐시 우선** — 캐시된 이름·역할 있으면 `user_profiles` SELECT 생략하고 세션당 1회만 백그라운드 갱신 (`sessionStorage` 플래그).

### P2 — 구조 정리 (2~3일, 기능 변경 없음)

9. **admin client 공용화** — `lib/supabase-admin-client.ts` 하나로 통일, 각 액션 파일의 중복 `createClient` 제거.
10. **`lib/supabase-admin.ts` 도메인 분해** — 46개 함수를 해당 도메인 액션 파일로 흡수(orders → actions/orders.ts 등), wrapper 계층 제거. 파일 단위로 나눠 진행해 diff를 작게 유지.
11. **HR 우측 패널 react-query 전환** — `PayrollPanel`·`ContractsPanel`·`useRosterRange`를 useQuery로, `refreshKey` 시그널은 `invalidateQueries`로 대체. 탭 재방문 시 캐시 히트.
12. **`workers.ts` 정리** — `user-accounts.ts`로 개명 또는 파일 상단에 역할 주석 (테이블 삭제와 같은 PR에서).

### 검증 기준

- 각 P1 페이지: 전환 전후 네트워크 탭에서 첫 데이터 도착 시점 비교 (마운트 후 POST 소멸 확인).
- P0-1 테이블 삭제: 삭제 후 전체 페이지 스모크 테스트 + `yarn build`.
- P2: `yarn build` + 각 도메인 화면 동작 확인, Speed Insights로 배포 후 LCP·INP 추이 관찰.

### 미착수 이월 (1차 계획에서)

- P2-7 번들 측정 (Turbopack 미지원으로 보류 중)
- P2-9 POS·RosterCalendar 실기기 프로파일 후 memo화
