# 2026-08-02 핵심 로직 평가

> ralph 세션. 목표: 로직을 해치지 않는 선에서 도메인별 코드 품질 평가 + 안전한 개선 발굴·수정.
> "안전한 개선" = 버그·보안 격차·중복·미검증 경계 등 명백한 결함. 의도된 비즈니스 로직 판단이 필요한 사안은 수정하지 않고 여기에만 기록.

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
