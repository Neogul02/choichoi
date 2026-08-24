'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekMatrix from '@/app/(admin)/hr/_components/WeekMatrix';
import StaffTotalsPanel from '@/app/(admin)/hr/_components/StaffTotalsPanel';
import { shiftBgColor, shiftTextColor } from '@/app/(admin)/hr/_components/constants';
import { fetchRosterOverview } from '@/app/actions/roster-view';
import type { RosterOverview, RosterUnitOverview } from '@/app/actions/roster-view';
import { DAY_NAMES, findRosterViolations, getWeekStart, buildAssignMap } from '@/lib/staffing';
import { addDays, dayOfWeek } from '@/lib/date';
import { MatrixSkeleton } from '@/components/Skeleton';
import { showMsg } from '@/lib/toast';

interface Props {
  today: string;
  initialWeekStart: string;
  initialOverview: RosterOverview | null;
}

const fmtMD = (dateStr: string): string => {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
};

function fmtDate(dateStr: string): string {
  return `${fmtMD(dateStr)} (${DAY_NAMES[dayOfWeek(dateStr)]})`;
}

const dayTextColor = (day: number, fallback: string) =>
  day === 0 ? 'text-red-400' : day === 6 ? 'text-blue-400' : fallback;

export default function RosterOverviewClient({ today, initialWeekStart, initialOverview }: Props) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [overview, setOverview] = useState<RosterOverview | null>(initialOverview);
  const [isLoading, setIsLoading] = useState(initialOverview === null);
  const [selectedDate, setSelectedDate] = useState(today);

  // 주별 캐시 — 캐시 히트 시 즉시 표시 후 백그라운드 재검증(SWR), 미스 시 스켈레톤
  const cacheRef = useRef<Map<string, RosterOverview>>(
    new Map(initialOverview ? [[initialWeekStart, initialOverview]] : []),
  );
  // 표시 중인 주 미러 — 비동기 응답이 도착했을 때 아직 그 주를 보고 있는지 판정
  const weekStartRef = useRef(initialWeekStart);
  // 연타 시 응답 역전 방지: 나중에 발행된 요청만 화면에 반영
  const reqSeq = useRef(0);
  const appliedSeq = useRef(0);
  const prefetching = useRef(new Set<string>());

  const weekEnd = addDays(weekStart, 6);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const fetchWeek = async (ws: string, background = false) => {
    const seq = ++reqSeq.current;
    if (!background) setIsLoading(true);
    const r = await fetchRosterOverview(ws, addDays(ws, 6));
    if (r.success && r.data) {
      cacheRef.current.set(ws, r.data);
      if (weekStartRef.current === ws && seq > appliedSeq.current) {
        appliedSeq.current = seq;
        setOverview(r.data);
      }
    } else if (!background && weekStartRef.current === ws) {
      showMsg(`오류: ${r.error}`);
    }
    if (!background && weekStartRef.current === ws) setIsLoading(false);
  };

  // 서버 프리페치가 실패한 드문 경우에만 클라이언트에서 재시도
  useEffect(() => {
    if (!initialOverview) fetchWeek(initialWeekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 인접 주(±7일) 프리페치 — 주 이동을 체감 즉시로 만든다. 화면 상태는 건드리지 않고 캐시만 채움
  const prefetch = (ws: string) => {
    if (cacheRef.current.has(ws) || prefetching.current.has(ws)) return;
    prefetching.current.add(ws);
    fetchRosterOverview(ws, addDays(ws, 6)).then(r => {
      prefetching.current.delete(ws);
      if (r.success && r.data && !cacheRef.current.has(ws)) cacheRef.current.set(ws, r.data);
    });
  };
  useEffect(() => {
    const t = setTimeout(() => { prefetch(addDays(weekStart, -7)); prefetch(addDays(weekStart, 7)); }, 400);
    return () => clearTimeout(t);
  }, [weekStart]);

  const moveWeek = (delta: number) => {
    const next = delta === 0 ? getWeekStart(today) : addDays(weekStart, delta * 7);
    if (next === weekStart) return;
    const nextEnd = addDays(next, 6);
    // 오늘이 새 주에 있으면 오늘, 아니면 기존 선택 요일을 보존해 이동
    const base = today >= next && today <= nextEnd ? today : addDays(next, dayOfWeek(selectedDate));
    weekStartRef.current = next;
    setWeekStart(next);
    setSelectedDate(base);
    const cached = cacheRef.current.get(next);
    if (cached) {
      setOverview(cached);
      setIsLoading(false);
      void fetchWeek(next, true); // 캐시를 먼저 보여주고 백그라운드에서 최신화
    } else {
      setOverview(null); // 이전 주 데이터가 새 주 라벨에 매핑돼 보이는 스테일 표시 방지 — 스켈레톤으로 전환
      void fetchWeek(next);
    }
  };

  const handleDateClick = (dateStr: string) => {
    setSelectedDate(dateStr);
  };

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        {/* 주 이동 */}
        <div className="flex items-center gap-1.5 mb-3">
          <button onClick={() => moveWeek(-1)} aria-label="이전 주" className="w-9 h-9 rounded-xl bg-canvas border border-hairline shadow-level-1 cursor-pointer font-bold text-ink-muted hover:bg-canvas-soft transition text-base flex items-center justify-center">‹</button>
          <button onClick={() => moveWeek(0)} className="px-3 h-9 rounded-xl bg-canvas border border-hairline shadow-level-1 text-[13px] font-semibold text-ink-muted cursor-pointer hover:bg-canvas-soft transition">이번주</button>
          <button onClick={() => moveWeek(1)} aria-label="다음 주" className="w-9 h-9 rounded-xl bg-canvas border border-hairline shadow-level-1 cursor-pointer font-bold text-ink-muted hover:bg-canvas-soft transition text-base flex items-center justify-center">›</button>
          <span className="ml-2 text-[15px] font-extrabold text-ink whitespace-nowrap">
            <span className="text-ink-faint font-semibold text-[13px]">{weekStart.slice(0, 4)}년</span> {fmtMD(weekStart)} ~ {fmtMD(weekEnd)}
          </span>
          {isLoading && <span className="text-[12px] text-ink-faint">불러오는 중...</span>}
        </div>

        {/* 모바일 전용 날짜 선택 칩 — 매트릭스는 가로 스크롤이 필요해 폰에서는 요일 탭이 더 빠르다 */}
        <div className="grid grid-cols-7 gap-1.5 mb-4 md:hidden">
          {weekDates.map(d => {
            const day = dayOfWeek(d);
            const isSelected = d === selectedDate;
            const isToday = d === today;
            return (
              <button
                key={d}
                onClick={() => handleDateClick(d)}
                className={`py-2 rounded-xl border cursor-pointer text-center transition ${
                  isSelected ? 'bg-primary-700 border-primary-700 text-white shadow-level-1' : 'bg-canvas border-hairline hover:border-primary-300'
                }`}
              >
                <span className={`block text-[11px] font-bold leading-none ${isSelected ? 'opacity-80' : dayTextColor(day, 'text-ink-faint')}`}>
                  {DAY_NAMES[day]}
                </span>
                <span className={`block mt-1 text-[15px] font-extrabold leading-none ${
                  isSelected ? '' : isToday ? 'text-primary-700' : 'text-ink'
                }`}>
                  {Number(d.slice(8))}
                </span>
                {isToday && !isSelected && <span className="block mt-1 w-1 h-1 rounded-full bg-primary-700 mx-auto" />}
              </button>
            );
          })}
        </div>

        {overview === null ? (
          isLoading
            ? <MatrixSkeleton rows={6} />
            : <p className="text-ink-faint text-sm">근무표를 불러오지 못했습니다. 새로고침해 주세요.</p>
        ) : (
          <div className="flex flex-col gap-3 md:gap-4">
            <DayDetailCard overview={overview} dateStr={selectedDate} today={today} />

            {overview.units.map(u => (
              <UnitSection
                key={u.key}
                unitOverview={u}
                staff={overview.staff}
                weekStart={weekStart}
                todayStr={today}
                selectedDate={selectedDate}
                onDateClick={handleDateClick}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

// ── 선택한 날짜의 근무 인원 요약 — 모바일에서 매트릭스 스크롤 없이 핵심만 ──────

function DayDetailCard({ overview, dateStr, today }: {
  overview: RosterOverview;
  dateStr: string;
  today: string;
}) {
  const [copying, setCopying] = useState(false);

  // 인사 탭(DayPanel)의 일간 복사와 같은 포맷에 파트(주방/팝업) 구분을 더한 전 유닛 근무 안내
  const handleCopy = async () => {
    setCopying(true);
    try {
      const lines: string[] = [`📋 ${fmtDate(dateStr)} 근무 안내`, ''];
      let hasAny = false;
      for (const u of overview.units) {
        const unitLines: string[] = [];
        for (const shift of u.data.shifts) {
          const assigned = u.data.assignments.filter(a => a.work_date === dateStr && a.shift_id === shift.id);
          if (assigned.length === 0) continue;
          unitLines.push(`[${shift.name}] ${shift.start_time}~${shift.end_time}`);
          for (const a of assigned) {
            const extras = [
              a.start_time || a.end_time
                ? `${(a.start_time ?? shift.start_time).slice(0, 5)}~${(a.end_time ?? shift.end_time).slice(0, 5)}`
                : '',
              a.break_minutes === 0 ? '휴게 미포함' : '',
            ].filter(Boolean);
            unitLines.push(`· ${a.staff_profiles?.name ?? ''}${extras.length > 0 ? ` (${extras.join(', ')})` : ''}`);
          }
        }
        if (unitLines.length === 0) continue;
        hasAny = true;
        lines.push(`◾ ${u.label}`, ...unitLines, '');
      }
      await navigator.clipboard.writeText(
        hasAny ? lines.join('\n').trimEnd() : `${lines[0]}\n\n배정된 근무자가 없습니다.`,
      );
      showMsg('클립보드에 복사됐습니다!');
    } catch {
      showMsg('복사 실패 — 브라우저 권한을 확인해주세요.');
    } finally {
      setCopying(false);
    }
  };

  return (
    <section className="bg-canvas rounded-2xl p-3 md:p-4 shadow-level-1 border border-hairline">
      <div className="flex items-center justify-between mb-3">
        <h2 className="m-0 text-[16px] font-extrabold">
          {fmtDate(dateStr)} 근무 인원
          {dateStr === today && <span className="ml-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary-700 text-white align-middle">오늘</span>}
        </h2>
        <button
          onClick={handleCopy}
          disabled={copying}
          className="px-2.5 py-1 rounded-lg bg-canvas-soft border border-hairline text-[11px] font-semibold text-ink-muted cursor-pointer hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 transition disabled:opacity-50"
        >
          {copying ? '복사 중...' : '복사'}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {overview.units.map(u => {
          const rows = u.data.shifts
            .map((shift, idx) => ({
              shift,
              idx,
              assigned: u.data.assignments.filter(a => a.work_date === dateStr && a.shift_id === shift.id),
            }))
            .filter(r => r.assigned.length > 0);
          return (
            <div key={u.key} className="rounded-xl border border-hairline bg-canvas p-3 min-w-0">
              <p className="m-0 mb-2 text-[14px] font-extrabold text-ink">{u.label}</p>
              {rows.length === 0 ? (
                <p className="m-0 text-[12px] text-ink-faint">근무 없음</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {rows.map(({ shift, idx, assigned }) => (
                    <div key={shift.id} className="flex items-start gap-1.5">
                      <span className={`shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded leading-tight ${shiftBgColor(idx)} ${shiftTextColor(idx)}`}>
                        {shift.name} {assigned.length}명
                      </span>
                      <span className="text-[13px] text-ink leading-snug min-w-0 break-keep">
                        {assigned.length === 0 ? (
                          <span className="text-ink-faint">미배정</span>
                        ) : (
                          assigned.map((a, i) => (
                            <span key={a.id} className="font-semibold whitespace-nowrap">
                              {a.staff_profiles?.name ?? `#${a.staff_id}`}
                              {(a.start_time || a.end_time) && (
                                <span className="text-ink-faint font-normal"> {(a.start_time ?? shift.start_time).slice(0, 5)}~{(a.end_time ?? shift.end_time).slice(0, 5)}</span>
                              )}
                              {a.break_minutes === 0 && <span className="text-amber-600 font-normal text-[11px]"> 휴게X</span>}
                              {i < assigned.length - 1 && <span className="text-ink-faint font-normal">, </span>}
                            </span>
                          ))
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── 단위별(주방/팝업) 읽기 전용 주간 매트릭스 ─────────────────────────────────

function UnitSection({ unitOverview, staff, weekStart, todayStr, selectedDate, onDateClick }: {
  unitOverview: RosterUnitOverview;
  staff: RosterOverview['staff'];
  weekStart: string;
  todayStr: string;
  selectedDate: string | null;
  onDateClick: (dateStr: string) => void;
}) {
  const { label, unit, data } = unitOverview;

  const unitStaff = useMemo(
    () => staff.filter(s => s.staff_role === unit.staffRole && (unit.staffRole === 'kitchen' || s.popup_id === unit.popupId)),
    [staff, unit],
  );

  const assignMap = useMemo(() => buildAssignMap(data.assignments), [data.assignments]);

  const violations = useMemo(
    () => findRosterViolations(data.assignments, data.shifts, unitStaff),
    [data.assignments, data.shifts, unitStaff],
  );

  const getAssigned = (dateStr: string, shiftId: number) => assignMap.get(`${dateStr}|${shiftId}`) ?? [];

  return (
    <section className="bg-canvas rounded-2xl p-3 md:p-4 shadow-level-1 border border-hairline">
      <h2 className="m-0 mb-3 text-[16px] font-extrabold">{label}</h2>
      <WeekMatrix
        weekStart={weekStart}
        todayStr={todayStr}
        shifts={data.shifts}
        staffList={unitStaff}
        getAssigned={getAssigned}
        getShiftLabel={s => s.name}
        violations={violations}
        selectedDate={selectedDate}
        onDateClick={onDateClick}
      />
      {/* 인원별 근무일·유급시간 합계 — 급여정산과 동일한 lib/workhours 기준이라 여기 시간 × 시급 = 예상 급여 */}
      <StaffTotalsPanel staffList={unitStaff} shifts={data.shifts} assignments={data.assignments} isLoading={false} />
    </section>
  );
}
