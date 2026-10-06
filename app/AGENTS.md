# app/

Next.js 16 App Router. 모든 데이터 접근은 **Server Actions**(`app/actions/`)로 하고,
`app/api/`에는 HTTP 엔드포인트가 하나도 없다 (`app/api/AGENTS.md` 참고).

## 라우트와 권한

| 라우트 | 파일 | 게이트 |
|---|---|---|
| `/` | `page.tsx` | **없음** — 화면 선택 랜딩. `PasswordGate`가 경로로 면제한다 |
| `/display` | `display/page.tsx` | **없음** — 고객용 미러링(결제 기능 없음). 같이 면제된다 |
| `/pos` | `pos/page.tsx` | 루트 `PasswordGate` |
| `/orders` | `orders/page.tsx` | 루트 `PasswordGate` |
| `/memo` | `memo/page.tsx` | 루트 `PasswordGate` |
| `/my`, `/my/schedule` | `my/` | 루트 `PasswordGate` (본인 데이터) |
| `/inventory` | `(staff)/inventory/` | `(staff)/layout.tsx` — 로그인만 |
| `/roster` | `(staff)/roster/` | `(staff)/roster/layout.tsx` — admin\|manager |
| `/hr` | `(admin)/hr/` | `(admin)/layout.tsx` — admin |
| `/stats` | `(admin)/stats/` | `(admin)/layout.tsx` — admin |
| `/settings` | `(admin)/settings/` | `(admin)/layout.tsx` — admin |

인증은 **Supabase Auth**다. 역할은 `session.user.user_metadata.role`에 `admin` / `manager` /
`user`로 들어 있다. 세션 쿠키 갱신은 `proxy.ts`(미들웨어)가 담당한다.
`PasswordGate`는 이름이 옛날 그대로지만 실제로는 Supabase 로그인·회원가입 화면이다
(SHA256 비밀번호 토큰 방식은 폐기됐다). 레이아웃에 상주해 **라우트 전환 시 리마운트되지 않으므로**
`pathname`을 effect 의존성에 넣어야 한다 — 빠뜨리면 경로가 바뀌어도 게이트 상태가 갱신되지 않는다.

`(staff)` 그룹 레이아웃은 **로그인 여부만** 본다. 재고탭이 `user` 역할에게도 열려야 해서
admin|manager 검사를 `/roster`로 내렸다 — 그룹 레이아웃에 역할 검사를 다시 올리지 말 것.

## 레이아웃 게이트를 믿지 말 것

게이트는 화면 진입만 막는다. **Server Action은 직접 호출 가능한 POST 엔드포인트**이므로
액션 안에서 권한을 다시 검사한다.

```ts
export async function myAction(arg: string): Promise<ApiResponse<MyType>> {
  return wrap(async () => {
    await requireAdmin()          // 또는 requireAuth / requireManagerOrAdmin
    // ...
  })
}
```

- `wrap<T>()`이 try/catch·오류 메시지 변환을 전담한다 — 액션마다 try/catch를 쓰지 않는다.
  단, Next 내부 제어흐름 오류(redirect 등)는 `isNextInternalControlFlowError`로 되던져야 하므로
  `wrap`을 쓰지 않고 직접 try/catch하는 액션도 있다(그 패턴을 복사해 쓸 것).
- **역할 검사 없는 내부 구현 함수를 export하지 말 것.** export하는 순간 인증 없는 공개
  엔드포인트가 생긴다. `fetchRosterShiftsUnchecked`처럼 `Unchecked` 접미사를 붙여 모듈 안에만 둔다.
- 반환은 항상 `ApiResponse<T>` (`{ success, data?, error? }`). 클라이언트는 `r.success`로 분기한다.

## app/actions/ — 도메인별 파일

| 파일 | 담당 |
|---|---|
| `_base.ts` | `wrap`, `getAuthUser`, `requireAuth/Admin/ManagerOrAdmin`, 오류 판별 |
| `roster.ts` | 파트(roster_shifts) CRUD, 배정 추가·삭제·시간·휴게, 일괄 편집·되돌리기, 인쇄·직원 근무표 |
| `payroll.ts` | 월별·팝업별 급여 집계, 근무일 상세, 지급 완료·조정 항목, 고용신고 주민번호 열람 |
| `roster-view.ts` | 매니저용 읽기 전용 일정표(주방 + 팝업별 캐셔 한 번에) |
| `staff.ts` | 근무자 프로필 CRUD, 상태 변경, 보건증 업로드 |
| `staffPopups.ts` | 근무자 ↔ 팝업 N:M 배정, 근무 이력 기반 자동 분류 |
| `contracts.ts` | 근로계약서 생성·서명·조회 |
| `workers.ts` | 계정(user_profiles), 역할 부여, 비밀번호, 주민번호 암복호화 경유 |
| `schedule.ts` | 팝업 이벤트(popup_events) CRUD, 활성 토글 |
| `orders.ts` · `menu.ts` · `inventory.ts` · `storage.ts` | POS·메뉴·재고·보관함 |
| `stats.ts` | 매출 통계, 수동 입력 매출 |
| `memos.ts` · `pos-note.ts` · `discord.ts` · `error-report.ts` · `devtools.ts` | 부가 기능 |

## (admin)/hr — 가장 복잡한 화면

`HrPageClient.tsx`가 좌측 근무자 목록 + 우측 탭(근무표 / 급여 / 계약서 / 고용신고)을 들고 있다.
근무표는 `RosterCalendar.tsx` → `roster/` 하위(`MonthGrid`·`DayCell`·`DayPanel`·`WeekMatrix`·
`useRosterView`·`useRosterRange`)로 쪼개져 있다.

주의할 점:

- **`popups`와 `allPopups`는 다른 prop이다.** `popups`는 활성 팝업만(캐셔 팝업 선택 줄의 클러터
  방지), `allPopups`는 비활성·보관 포함 전체다. 과거 달의 근무 기록·팝업 이름·기간 배경은 전부
  `allPopups`로 판단해야 한다 — 활성 목록으로 조회하면 보관된 팝업의 라벨이 `?`로 떨어지고
  근무 기록이 달력에서 사라진다.
- `MonthGrid`·`DayCell`은 `memo`로 감싸여 있다. 거기에 넘기는 함수는 `useCallback`으로 참조를
  고정해야 셀 35~42개가 무관한 상태 변화에 다시 그려지지 않는다.
- 배정 추가·삭제·시간·휴게 변경은 **낙관적 업데이트**다. 서버 응답으로 치환하고 실패 시 원복하며,
  급여 화면의 react-query 캐시(`['payroll']`)를 무효화해야 두 화면 금액이 어긋나지 않는다.
- 캐셔 달력 "전체" 보기는 `popupId`에 `ALL_POPUPS`(-1) 센티널을 쓴다. **조회 전용**이며,
  insert에 쓰이면 안 되므로 일괄 편집·파트 생성 등은 `isAllPopups()`로 막는다.
- 배정을 만들 때는 파트 시간을 `materializeFromShift()`로 확정 기록한다 (`lib/AGENTS.md` 참고).

## 공통 규칙

- 모든 컴포넌트 파일은 `'use client'`가 필요한 경우에만 붙인다. 서버 컴포넌트에서 액션을 호출해
  초기 데이터를 프리페치하고 클라이언트에 props로 내리는 패턴을 쓴다(`hr/page.tsx` 참고).
- 오늘 날짜는 `kstToday()`. `new Date()`로 계산하면 타임존에 따라 하루가 밀린다.
- 토스트는 `lib/toast.ts`의 `showMsg()`. 확인 대화상자는 `components/ConfirmDialog`
  (엔터가 '확인'으로 동작하도록 통일돼 있다).
