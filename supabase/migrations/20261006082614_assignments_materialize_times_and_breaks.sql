-- 근로내역(roster_assignments)을 자기완결 행으로 만드는 1단계 — 시간·휴게를 배정 행에 확정 기록한다.
--
-- 지금까지 배정 493건 중 418건은 start_time/end_time이 NULL이라, 실제 근무 시간을 알려면
-- roster_shifts(파트)를 조인해야 했다. 파트 하나가 "시간 템플릿 + 휴게 정책 + 요구 인원 +
-- 화면 묶음 + 중복 방지 키"를 전부 겸하고 있었고, 그 결과:
--   · 팝업을 비활성화하면 달력 파트 라벨이 '?'로 깨졌다 (RosterCalendar getShiftLabel)
--   · 파트 행을 못 찾은 배정은 급여·인원별 합계에서 조용히 빠졌다 (`if (!shift) continue`)
--   · 파트를 삭제하면 FK cascade로 과거 근로내역까지 함께 지워졌다
-- 시간이 배정 행에 있으면 위 세 가지가 파트 존재 여부와 무관해진다.
--
-- 이 마이그레이션은 값만 채운다. NOT NULL 제약은 쓰기 경로가 시간을 항상 기록하도록
-- 배포된 뒤에 별도 마이그레이션으로 건다 (그 전에 걸면 구 코드의 insert가 깨진다).

-- 1) 시간 백필 — 파트 기본 시간을 그 배정의 확정 시간으로 굳힌다.
--    start/end 한쪽만 NULL인 행은 없음을 사전 확인했으나, 컬럼별 coalesce로 안전하게 처리한다.
update roster_assignments a
set start_time = coalesce(a.start_time, s.start_time),
    end_time   = coalesce(a.end_time,   s.end_time)
from roster_shifts s
where s.id = a.shift_id
  and (a.start_time is null or a.end_time is null);

-- 2) 휴게 백필 — lib/workhours.ts의 resolveBreakMinutes 우선순위를 그대로 재현한다.
--    roster_shifts.break_minutes는 NOT NULL DEFAULT 0이라 0이 "휴게 없음"이 아니라 "미설정"을 뜻했고,
--    미설정은 기본 60분으로 차감돼 왔다(DEFAULT_BREAK_MINUTES).
--    nullif을 빼고 파트값을 그대로 복사하면 389건이 0분이 되어 주방 전원의 유급 시간이
--    하루 1시간씩 늘어난다 — 이 nullif이 이 마이그레이션에서 가장 중요한 한 줄이다.
update roster_assignments a
set break_minutes = coalesce(nullif(s.break_minutes, 0), 60)
from roster_shifts s
where s.id = a.shift_id
  and a.break_minutes is null;
