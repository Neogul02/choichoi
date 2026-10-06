# lib/

순수 함수와 Supabase 클라이언트. **DB 접근 로직은 `app/actions/`에 있다** — 예전처럼
`lib/supabase.ts` 한 파일에 모든 DB 함수가 모여 있는 구조가 아니다.

`.test.ts`가 있는 모듈은 규칙이 돈·법·시간대에 직결된 곳이다. 손대면 `yarn test`를 돌린다.

## Supabase 클라이언트 — 셋을 구분해서 쓴다

| 파일 | 용도 |
|---|---|
| `supabase-admin-client.ts` | service role. **RLS를 우회한다.** 서버 액션 전용이며, 쓰는 액션은 반드시 `require*`로 권한을 먼저 검사해야 한다 |
| `supabase-server.ts` | 세션 기반 서버 클라이언트. 레이아웃 게이트·`getAuthUser`가 쓴다 |
| `supabase-browser.ts` | 클라이언트 컴포넌트의 로그인·세션 조회 |
| `supabase.ts` | 레거시. 새 코드에서 쓰지 말 것 |

## workhours.ts — 급여 계산의 유일한 기준 ⚠️

급여정산·근무표·인원별 합계·직원 예상급여가 **전부** 이 파일을 쓴다.
규칙이 바뀌면 여기만 고친다. 복사본을 만들면 화면마다 금액이 달라진다.

- `shiftRawMinutes(start, end)` — 출근~퇴근 실근무 분. **직접 빼지 말 것.**
  종료가 시작보다 이르거나 같으면 자정을 넘긴 것으로 보며, `09:00~09:00`은 길이 0이 아니라
  24시간이다. `00:00~24:00`은 1440분.
- `resolveBreakMinutes(assignmentBreak, shiftBreak)` — 우선순위는
  **근무일별 값 > 파트 고정 휴게 > 기본 60분**.
  **`roster_shifts.break_minutes = 0`은 "휴게 없음"이 아니라 "미설정"이다** (NOT NULL DEFAULT 0
  이라 둘을 구분하지 못한다). 그래서 0은 기본값으로 넘어간다.
  SQL에서 복사할 때는 `coalesce(nullif(s.break_minutes, 0), 60)` — 그대로 복사하면 유급 시간이
  하루 1시간씩 늘어난다.
- `paidMinutes(start, end, assignmentBreak, shiftBreak)` — 4번째 인자를 **생략하지 말 것.**
  빠뜨리면 파트에 설정한 휴게가 조용히 무시되고 기본 1시간이 차감된다.
- 합계는 **분을 모두 더한 뒤 마지막에 한 번만** `minutesToHours()`를 거친다. 중간에 시간으로
  바꿔 더하면 0.1h 반올림 오차가 누적돼 화면마다 값이 달라진다.
- 하루를 `00:00~24:00` 한 축으로 다룬다. 오전/오후로 나누지 않는다.

## staffing.ts — 근무표 규칙

- `requiredFor(date, shift, overrides)` — 그날 그 파트의 요구 인원. 활성 기간 밖이면 0,
  날짜별 예외가 우선. **활성 기간을 설정하지 않은 파트는 0을 돌려준다** (그러지 않으면 기간 없는
  파트가 모든 날짜에서 미충원으로 빨갛게 표시된다). 주방 파트는 전부 기간이 없어서 이 기능이
  사실상 동작하지 않는 상태다.
- `findRosterViolations()` — 전일 퇴근 후 9시간 미만 휴식(`MIN_REST_MINUTES`), 주 최대 근무일 초과.
  전달된 배정 범위 안에서만 판정하므로 범위 밖 인접 주는 반영되지 않는다.
- `checkStaffAvailability()` — 선호 파트·선호 요일·가용 기간. 조건이 비어 있으면 가능으로 본다.
- `getWeekStart()` — 주의 시작은 **일요일**(달력 표시 기준).

## roster/ — 근무표 쿼리 헬퍼

- `ASSIGNMENT_COLUMNS` / `SNAPSHOT_COLUMNS` — select 컬럼 목록.
  **`SNAPSHOT_COLUMNS`에서 `break_minutes`를 빼지 말 것.** 빠지면 초기화·일괄 해제를 되돌릴 때
  휴게 오버라이드가 사라져 급여가 달라진다.
- `materializeFromShift(shift)` — 파트의 시간·휴게를 그 근무일의 **확정값**으로 굳힌다.
  배정을 새로 만들거나 다른 파트로 옮길 때 반드시 쓴다. 시간을 NULL로 두고 파트에서 빌려 쓰면
  파트를 수정·삭제했을 때 지난 급여까지 바뀐다.
- `ALL_POPUPS` / `isAllPopups()` — 캐셔 달력 "전체" 보기의 센티널(-1). **조회 전용**이며
  실제 `popup_id`로 insert되면 안 된다.
- `applyUnitFilter()` — 스케줄 단위(주방 전체 / 특정 팝업) 필터. 전체 보기에서는 `popup_id` 조건을
  아예 생략해 role만으로 걸러 모든 팝업을 합쳐 보여준다.
- `shiftStartPriority()` — 파트 정렬 기준은 이름이 아니라 **시작 시각**이다.

## date.ts — KST 기준

- `kstToday()` — 오늘 날짜(YYYY-MM-DD). **오늘을 구할 때는 항상 이것을 쓴다.**
  `new Date()` 로컬 타임존을 쓰면 서버·해외 접속에서 하루가 밀린다.
- `getKSTDateBounds(dateStr?)` — 그 날의 UTC 경계. 오늘 매출 필터링용.
- `utcToKst` / `utcToKstDateStr` — Supabase timestamp 컬럼이 오프셋 없는 naive UTC로 올 때가 있어
  UTC임을 명시해 파싱한다. `new Date(ts)`로 바로 파싱하지 말 것.
- `parseDate` / `toDateStr` / `addDays` / `prevDate` / `dayOfWeek` / `monthEndDateStr`

## 개인정보

- `pii-crypto.ts` — 주민번호 암복호화. 평문을 DB에 넣거나 로그·디스코드로 내보내지 말 것.
  열람 액션은 admin 전용이다.
- `resident-id.ts` / `phone.ts` / `bank.ts` — 형식 검증·마스킹·정규화. DB에 제약이 걸려 있으므로
  (`enforce_phone_and_bank_account_digit_format`) 저장 전에 정규화한다.

## 그 외

`tiers.ts`(매출 티어) · `popupPeriod.ts`(팝업 기간 상태·달력 배경 그라데이션) ·
`staff-columns.ts`(공통 select 목록) · `storage-keys.ts`(localStorage 키) ·
`toast.ts`(`showMsg`) · `discord.ts`(웹훅) · `utils.ts`(`formatPrice`·`formatBreakMinutes` 등) ·
`useModal`·`useModalKeyboard`·`useBodyScrollLock`·`useCurrentRole`(공통 훅)
