# 서비스화 2단계(contract) 계획 — 다른 사업장도 쓰게 하기

작성 2026-10-18. 아직 시작하지 않았다. 시작할 때 이 문서부터 읽고, 끝낸 단계는 체크하며 진행한다.

## 지금 어디까지 왔나

| 단계 | 상태 | 내용 |
|---|---|---|
| expand (런북 4단계) | **SQL 준비·검증 완료, 미적용** | `supabase/pending/04_organizations_expand.sql` — `organizations`·`org_members` 생성, 업무 테이블 28개에 `org_id NOT NULL DEFAULT 1`. 기존 데이터는 전부 사업장 1(Hiyorisando). 앱 동작 변화 없음. 절차·급여 기준선 비교는 `supabase/pending/RUNBOOK.md` 4단계 |
| contract | **이 문서** | 코드가 `org_id`로 읽고 쓰게 바꾼 뒤 `DEFAULT 1`을 걷어낸다 |

expand는 contract를 시작하는 날 같이 적용한다. 혼자 먼저 적용해도 안전하지만(기본값) 운영상 얻는 게 없다.

## 왜 단계를 이렇게 나누나

이 앱은 RLS를 켜 두고 서버 액션이 **service role로 RLS를 우회**한다(`lib/supabase-admin-client.ts`, 액션 17개 파일).
즉 사업장 격리는 DB가 아니라 **액션 코드가 `org_id`로 거르는 것**에 전부 달려 있다. 한 군데라도 빠뜨리면
다른 사업장의 매출·급여·주민번호가 보이거나, 남의 사업장에 주문이 들어간다. 그래서:

1. 사업장 컨텍스트를 **한 곳**(`app/actions/_base.ts`)에서 만들고, 액션은 그걸 받아서만 쿼리하게 한다.
2. 쓰기를 먼저 고치고(새 행에 올바른 `org_id`), 읽기를 고치고, 마지막에 `DEFAULT 1`을 지워 **빠진 쓰기가 에러로 드러나게** 한다.
3. 서버 액션 인증 검사처럼 **정적 테스트로 누락을 막는다**(`lib/serverActionAuth.test.ts`와 같은 방식).

---

## 0단계 — 서비스화 전에 반드시 막을 보안 구멍 (지금도 프로덕션에 있음)

다른 사업장이 들어오기 전에 고쳐야 한다. 사실 사업장이 하나인 지금도 고쳐야 한다.

- [x] (코드 2026-10-18 배포 · **백필은 2026-10-21에야 적용** — 그 사이 사흘간 관리자·키오스크가 일반 user로 판정됐다.
  백필 결과 역할별 전/후 admin 2·kiosk 1·user 44 동일, 불일치 0. 재발 방지로 `worker_role` → `app_metadata.role`
  동기화 트리거(`supabase/pending/05_role_sync_trigger.sql`)와 판정 일원화(`lib/auth-role.ts`)) **권한을 `user_metadata.role`로 판단한다.** `proxy.ts`, `_base.ts`의 `getAuthUser`·`requireAdmin`,
  `roster-view.ts`가 JWT의 `user_metadata.role`을 믿는다. `user_metadata`는 **로그인한 사용자가 브라우저에서
  `supabase.auth.updateUser({ data: { role: 'admin' } })`로 직접 바꿀 수 있는 값**이다(Supabase 문서가
  권한 판단에 쓰지 말라고 명시). 직원 계정 하나로 관리자 화면·급여·인사 데이터에 접근할 수 있다.
  → 역할을 `app_metadata`(서버만 쓸 수 있음)로 옮기고 `setUserRole`·`createUser`가 거기에 쓰게 한다.
  기존 계정은 `user_profiles.worker_role` 기준으로 `app_metadata.role` 백필. contract에서는 이 자리를
  `org_members.role`이 대신한다(1단계).
- [x] (2026-10-18 수정 — `users_update_own`·`users_insert_own` 삭제, `20261018135538`) **`user_profiles`의 `users_update_own` 정책에 컬럼 제한이 없다.** 본인 행이면 `worker_role`까지 REST로
  고칠 수 있다(`workers.ts`가 일부 판단에 `worker_role`을 쓴다). 본인 수정은 서버 액션으로만 하게 하고
  정책을 지우거나, 수정 가능한 컬럼을 트리거로 제한한다.
- [x] (관리자 2차 코드를 서버에서 강제 — `lib/auth-role.ts`) **관리자 코드(`ADMIN_LOGIN_CODE`)를 로그인 화면만 확인했다.**
  `signInWithPassword`가 이미 admin 세션을 발급한 뒤 코드를 물어서, 비밀번호만 알면 그 쿠키로 `/hr`·서버 액션
  (주민번호 복호화 포함)에 바로 들어갈 수 있었다. 이제 코드 통과 증명(사용자·세션에 묶인 HMAC, httpOnly 쿠키)이
  없으면 proxy와 `getAuthUser`가 일반 user로 본다. 코드 시도 횟수 제한은 아직 없다.
- [ ] **anon(비로그인) 읽기 정책 `using (true)`**: `orders`, `menu_items`, `memos`. anon 키는 브라우저에 공개돼
  있어 **누구나 REST로 전체 주문(매출)을 읽을 수 있다.** 실시간 구독 때문에 열어 둔 것으로 보인다.
  → 구독을 로그인 세션(authenticated)으로 하게 하고 정책을 `authenticated` + 사업장 조건으로 좁힌다(4단계).
  `menu_items`는 로그인 전 화면에서 쓰는지 확인 후 결정.

## 1단계 — 사업장 컨텍스트 만들기

- [ ] **JWT에 사업장 넣기:** Supabase Auth의 Custom Access Token Hook(무료 플랜 가능)으로
  `org_members`를 읽어 `app_metadata` 자리에 `org_id`, `org_role`을 넣는다.
  - 한 사람이 여러 사업장에 속할 수 있다(`org_members` PK가 `(org_id, user_id)`). 처음엔 "사업장 하나만
    소속"으로 제한하고, 여러 곳 소속은 사업장 전환 UI가 생길 때 연다. 그 전까지 hook은 소속이 2곳 이상이면
    로그인을 거부하는 쪽이 안전하다(조용히 첫 번째를 고르면 엉뚱한 사업장에 쓴다).
- [ ] **`_base.ts`를 사업장 기준으로:** `getAuthUser()`가 `orgId`·`orgRole`을 돌려주고,
  `requireAuth()`·`requireAdmin()`·`requireManagerOrAdmin()`·`requireKioskOrAdmin()`이 `{ user, orgId }`를
  반환한다. 역할 판단은 `orgRole`로. `orgId`가 없으면 `AuthError`.
- [ ] **`proxy.ts`도 같은 클레임으로.** 화면 리다이렉트와 액션 권한이 다른 값을 보면 안 된다.
- [ ] 로그인 화면의 근무지(팝업) 목록 `fetchActivePopupEvents`는 지금 의도적 공개 액션이다. 사업장이 여럿이면
  로그인 전에는 어느 사업장인지 모른다 → 사업장 코드(서브도메인 또는 URL 경로 `/o/<slug>`)로 고르게 한다.
  키오스크 아이패드 홈 화면 URL도 이 경로로 바꿔야 한다.

## 2단계 — 쓰기 경로에 org_id

`DEFAULT 1`이 있는 동안에는 빠뜨려도 에러가 안 난다 — 그래서 이 단계는 테스트로 지킨다.

- [ ] 모든 insert/upsert에 `org_id: orgId`. 주요 경로: `orders.ts`(`createOrder`, order_items 포함),
  `stats.ts`(수기 매출·정정 6종), `roster.ts`(배정·파트·요구 인원, **`materializeFromShift()` 포함**),
  `attendance.ts`, `payroll.ts`, `inventory.ts`·`storage.ts`, `menu.ts`, `schedule.ts`(팝업·휴무일),
  `pos-note.ts`, `contracts.ts`, `staff.ts`·`staffPopups.ts`, `workers.ts`(가입 시 `org_members` 행 생성).
- [ ] **RPC·트리거:** `decrement_menu_stock`, `apply_restock`, `attendance_clock_out`, `attendance_void`가 다른
  사업장 행을 건드리지 못하게 인자로 `p_org_id`를 받아 조건에 넣는다. 집계 트리거(`_orders_rollup`,
  `_order_items_rollup`)는 `sales_daily`·`menu_sales_daily`에 `org_id`를 함께 쓰고 PK에 `org_id`를 넣는다.
- [ ] 배정 복제·이동 코드(지난주 복사, 되돌리기 스냅샷, 파트 이동)가 `org_id`도 옮기는지 — `break_minutes`를
  빠뜨렸던 것과 같은 실수 지점이다(CLAUDE.md).

## 3단계 — 읽기 경로에 org_id

- [ ] 모든 select에 `.eq('org_id', orgId)`. id로 단건 조회·수정·삭제하는 곳도 **반드시** `org_id`를 같이 건다
  (`removeOrder(id)`처럼 id만 받으면 남의 사업장 주문을 지울 수 있다).
- [ ] 매출 RPC 전부(`get_menu_sales_by_period`, `get_monthly_sales_by_date(_popup)`,
  `get_lifetime_sales_totals`, `get_todays_*`, `get_orders_daily_totals`)에 `p_org_id`.
  누적 합계의 `since`(첫 팝업 시작일), `popup_count`, 산도 판정(`menu_items.name ilike '%산도%'`)도 사업장별이다.
  산도 판정은 히요리산도 전용 규칙이라 사업장 설정(대표 품목)으로 빼야 한다.
- [ ] 날짜: `kstToday()`·`+ 9 hours`가 전부 KST 고정이다. `organizations.timezone`이 생기므로, 해외 사업장을
  받을 계획이 없으면 KST 고정을 명시적 제약으로 문서화하고 넘어간다(있으면 별도 큰 작업 — `orders.created_at`
  timestamptz 전환과 함께, 런북 '아직 하지 않는 것').
- [ ] **정적 테스트:** `supabaseAdmin.from('<업무 테이블>')` 체인에 `org_id` 조건이 없으면 실패하는 테스트를
  `serverActionAuth.test.ts`처럼 추가. 의도적 예외는 목록으로.

## 4단계 — 실시간·외부 연동

- [ ] 실시간 구독 11곳(`.channel(`)에 `filter: 'org_id=eq.<orgId>'`. 구독 대상 테이블: `orders`, `menu_items`,
  `memos`, `pos_note`, `ingredients`, `storage_objects`, `storage_object_items`.
- [ ] RLS 정책을 `authenticated` + `org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::bigint`로 교체하고
  anon `using (true)` 정책 삭제(0단계 연장). 서버 액션은 여전히 service role이라 영향 없음 — 실시간과 브라우저
  직접 조회만 이 정책을 탄다.
- [ ] Discord 웹훅(`DISCORD_WEBHOOK_URL`, `lib/discord.ts`)이 환경변수 하나다 → `organizations`에 사업장별
  웹훅 URL 컬럼(없으면 알림 안 보냄). 오류 리포트(`reportError`)는 운영자용이라 전역 유지.
- [ ] 보건증·계약서 등 Storage 파일 경로에 `org_id` 접두어, 버킷 정책도 사업장 기준.

## 5단계 — 사업장마다 하나여야 하는 값

- [ ] 유니크 키에 `org_id` 추가:
  - `daily_sales (sale_date)` → `(org_id, sale_date)` — 안 바꾸면 두 사업장이 같은 날 수기 매출을 못 넣는다
  - `payroll_adjustment_presets (label, amount)` → `(org_id, label, amount)`
  - `payroll_payments (period_key, staff_id)` — staff_id가 사업장 소속이라 지금도 겹치진 않지만 명시적으로 포함
  - `pos_note`는 `id = 1` 단일 행 → `org_id`를 PK로
  - 나머지(`popup_daily_sales`, `manual_*`, `roster_*`, `popup_closed_days`, `staff_popup_assignments`,
    `storage_object_items`)는 이미 사업장 소속 FK(popup_id·shift_id·staff_id·object_id)로 갈라지지만,
    부모와 자식의 `org_id`가 다를 수 없게 복합 FK `(org_id, popup_id)` 등을 건다.
- [ ] `upsert`의 `onConflict`도 새 키에 맞게(`stats.ts`의 `'sale_date'` 등).

## 6단계 — 직무·가입·온보딩

- [ ] 직무 CHECK(`staff_role in ('kitchen','cashier')`, `roster_*`의 "kitchen이면 popup_id NULL" 제약)는
  히요리산도 운영 방식이다 → 사업장별 직무 테이블(`org_roles`: 이름, 팝업 소속 여부)로. 근무표·급여 화면이
  직무를 고정 두 개로 가정하는 곳을 같이 고친다. **급여 로직을 건드리므로 CLAUDE.md의 전/후 금액 증명 필수.**
- [ ] 가입: 지금은 `SIGNUP_CODE` 하나로 가입한다 → 사업장 초대 코드(사업장별, 만료·1회용)로 `org_members` 생성.
  사업장 생성은 처음엔 운영자가 수동(SQL/관리 화면)으로 — 셀프 가입·결제는 범위 밖.
- [ ] 메뉴·브랜딩: 로고(`public/choichoi-logo.png`), 앱 이름 "ChoiChoi", 매니페스트가 하드코딩 →
  `organizations`에 이름·로고 URL.

## 7단계 — DEFAULT 1 제거 (마지막)

- [ ] 2~6단계 배포 후 며칠 운영하며 `org_id = 1` 외 값이 섞이지 않았는지, 새 행이 전부 명시적 `org_id`로
  들어오는지 확인(DEFAULT를 지우기 전에 `alter ... set default null`이 아니라 쿼리 로그로).
- [ ] 28개 테이블 `alter column org_id drop default`. 이제 `org_id`를 빠뜨린 쓰기는 NOT NULL 에러로 드러난다.
  → 빠뜨린 경로가 있으면 **결제가 실패**하므로, 영업 종료 후 적용하고 다음 날 첫 결제를 지켜본다.
  롤백은 `set default 1` 한 줄.
- [ ] 두 번째 사업장(테스트용)을 만들어 사업장 1 데이터가 하나도 안 보이는지 화면별로 확인한 뒤 실제 사업장을 받는다.

## 검증 원칙

- 급여에 닿는 단계(2·5·6·7)는 `supabase/pending/payroll_baseline_before.sql` / `_compare.sql`로 직원·월별 유급 분
  불일치 0을 확인한다. `payroll_payments`에 정산 완료된 달의 금액이 바뀌면 실제 돈 차이다.
- 매출에 닿는 단계는 누적 합계·달력 월합계를 적용 전후로 비교(런북 3단계 방식).
- 각 단계는 따로 배포한다. 한 번에 몰아서 배포하면 어디서 깨졌는지 모른다.

## 범위 밖 (지금 계획하지 않음)

셀프 가입·구독 결제, 사업장 간 데이터 이동, 여러 사업장 소속자의 사업장 전환 UI, 해외 시간대.
