'use client';

import { useEffect, useMemo, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekMatrix from '@/app/(admin)/hr/_components/WeekMatrix';
import { createRosterMemo, deleteRosterMemo, fetchRosterOverview } from '@/app/actions/roster-view';
import type { RosterOverview, RosterUnitOverview } from '@/app/actions/roster-view';
import { DAY_NAMES, findRosterViolations, getWeekStart, requiredFor, buildAssignMap } from '@/lib/staffing';
import { addDays, dayOfWeek } from '@/lib/date';
import { MatrixSkeleton } from '@/components/Skeleton';
import type { RosterShift } from '@/types/database';
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
  const [memoDate, setMemoDate] = useState(today);
  const [memoContent, setMemoContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const weekEnd = addDays(weekStart, 6);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const load = async (ws: string) => {
    setIsLoading(true);
    const r = await fetchRosterOverview(ws, addDays(ws, 6));
    if (r.success && r.data) setOverview(r.data);
    else showMsg(`오류: ${r.error}`);
    setIsLoading(false);
  };

  // 서버 프리페치가 실패한 드문 경우에만 클라이언트에서 재시도
  useEffect(() => {
    if (!initialOverview) load(initialWeekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveWeek = (delta: number) => {
    const next = delta === 0 ? getWeekStart(today) : addDays(weekStart, delta * 7);
    if (next === weekStart) return;
    const nextEnd = addDays(next, 6);
    // 오늘이 새 주에 있으면 오늘, 아니면 기존 선택 요일을 보존해 이동
    const base = today >= next && today <= nextEnd ? today : addDays(next, dayOfWeek(selectedDate));
    setWeekStart(next);
    setSelectedDate(base);
    setMemoDate(base);
    load(next);
  };

  const handleDateClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    setMemoDate(dateStr);
  };

  const handleAddMemo = async () => {
    if (!memoContent.trim()) { showMsg('메모 내용을 입력하세요'); return; }
    setIsSaving(true);
    const r = await createRosterMemo(memoDate, memoContent);
    if (r.success && r.data) {
      setOverview(p => p ? {
        ...p,
        memos: [...p.memos, r.data!].sort((a, b) =>
          a.memo_date.localeCompare(b.memo_date) || a.created_at.localeCompare(b.created_at)),
      } : p);
      setMemoContent('');
      showMsg('메모가 등록되었습니다');
    } else {
      showMsg(`오류: ${r.error}`);
    }
    setIsSaving(false);
  };

  const handleDeleteMemo = async (id: number) => {
    if (!confirm('이 메모를 삭제할까요?')) return;
    const r = await deleteRosterMemo(id);
    if (r.success) setOverview(p => p ? { ...p, memos: p.memos.filter(m => m.id !== id) } : p);
    else showMsg(`오류: ${r.error}`);
  };

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3 md:mb-4">
          <h1 className="m-0 text-[19px] font-extrabold">전체 근무표</h1>
          <p className="m-0 text-[12px] text-ink-faint">열람·메모 전용 — 배정 편집은 인사 탭에서 합니다</p>
        </div>

        {/* 주 이동 */}
        <div className="flex items-center gap-1.5 mb-3">
          <button onClick={() => moveWeek(-1)} aria-label="이전 주" className="w-9 h-9 rounded-xl bg-canvas border border-hairline shadow-level-1 cursor-pointer font-bold text-ink-muted hover:bg-canvas-soft transition text-base flex items-center justify-center">‹</button>
          <button onClick={() => moveWeek(0)} className="px-3 h-9 rounded-xl bg-canvas border border-hairline shadow-level-1 text-[13px] font-semibold text-ink-muted cursor-pointer hover:bg-canvas-soft transition">이번주</button>
          <button onClick={() => moveWeek(1)} aria-label="다음 주" className="w-9 h-9 rounded-xl bg-canvas border border-hairline shadow-level-1 cursor-pointer font-bold text-ink-muted hover:bg-canvas-soft transition text-base flex items-center justify-center">›</button>
          <span className="ml-1.5 text-[13px] font-bold text-ink whitespace-nowrap">
            <span className="text-ink-faint font-semibold">{weekStart.slice(0, 4)}년</span> {fmtMD(weekStart)} ~ {fmtMD(weekEnd)}
          </span>
          {isLoading && <span className="text-[12px] text-ink-faint">불러오는 중...</span>}
        </div>

        {/* 모바일 전용 날짜 선택 칩 — 매트릭스는 가로 스크롤이 필요해 폰에서는 요일 탭이 더 빠르다 */}
        <div className="grid grid-cols-7 gap-1 mb-3 md:hidden">
          {weekDates.map(d => {
            const day = dayOfWeek(d);
            const isSelected = d === selectedDate;
            const isToday = d === today;
            return (
              <button
                key={d}
                onClick={() => handleDateClick(d)}
                className={`py-1.5 rounded-xl border cursor-pointer text-center transition ${
                  isSelected ? 'bg-primary-700 border-primary-700 text-white' : 'bg-canvas border-hairline'
                }`}
              >
                <span className={`block text-[10px] font-bold leading-none ${isSelected ? 'opacity-80' : dayTextColor(day, 'text-ink-faint')}`}>
                  {DAY_NAMES[day]}
                </span>
                <span className={`block mt-1 text-[13px] font-extrabold leading-none ${
                  isSelected ? '' : isToday ? 'text-primary-700' : 'text-ink'
                }`}>
                  {Number(d.slice(8))}
                </span>
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

            {/* ── 일정 메모 ── */}
            <section className="bg-canvas rounded-2xl p-3 md:p-4 shadow-level-1 border border-hairline">
              <h2 className="m-0 mb-1 text-[15px] font-extrabold">일정 메모</h2>
              <p className="m-0 mb-3 text-[11px] text-ink-faint">날짜를 누르면 메모 날짜가 바뀝니다. 이 주의 메모만 표시됩니다.</p>

              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                  type="date" value={memoDate} min={weekStart} max={weekEnd}
                  onChange={e => setMemoDate(e.target.value)}
                  className="px-3 py-2 border border-hairline rounded-xl text-[13px] bg-canvas shadow-level-1 focus:outline-none focus:border-primary-700 shrink-0"
                />
                <input
                  type="text" value={memoContent} maxLength={500}
                  onChange={e => setMemoContent(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddMemo(); }}
                  placeholder="예: 15일 오후 행사로 캐셔 1명 추가 필요"
                  className="flex-1 min-w-0 px-3 py-2 border border-hairline rounded-xl text-[13px] bg-canvas shadow-level-1 focus:outline-none focus:border-primary-700"
                />
                <button
                  onClick={handleAddMemo} disabled={isSaving}
                  className="px-4 py-2 rounded-xl border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-50 shrink-0"
                >
                  등록
                </button>
              </div>

              {overview.memos.length === 0 ? (
                <p className="m-0 text-[13px] text-ink-faint">이번 주 메모가 없습니다.</p>
              ) : (
                <ul className="m-0 p-0 list-none flex flex-col">
                  {overview.memos.map((memo, i) => (
                    <li key={memo.id} className={`flex items-start gap-2.5 py-2.5 ${i > 0 ? 'border-t border-hairline' : ''}`}>
                      <button
                        onClick={() => handleDateClick(memo.memo_date)}
                        className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-full border cursor-pointer transition ${
                          memo.memo_date === selectedDate
                            ? 'bg-primary-700 text-white border-primary-700'
                            : 'bg-primary-50 text-primary-700 border-primary-100 hover:bg-primary-100'
                        }`}
                      >
                        {fmtDate(memo.memo_date)}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="m-0 text-[13px] text-ink whitespace-pre-wrap break-words">{memo.content}</p>
                        <p className="m-0 mt-0.5 text-[11px] text-ink-faint">
                          {memo.author_name ?? '이름 없음'} · {new Date(memo.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteMemo(memo.id)}
                        aria-label="메모 삭제"
                        className="shrink-0 w-6 h-6 rounded-lg bg-transparent border-none text-ink-faint cursor-pointer hover:bg-rose-50 hover:text-rose-500 transition text-[13px] leading-none"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
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
  return (
    <section className="bg-canvas rounded-2xl p-3 md:p-4 shadow-level-1 border border-hairline">
      <h2 className="m-0 mb-2.5 text-[15px] font-extrabold">
        {fmtDate(dateStr)} 근무 인원
        {dateStr === today && <span className="ml-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary-700 text-white align-middle">오늘</span>}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {overview.units.map(u => {
          const overrides = Object.fromEntries(u.data.requirements.map(q => [`${q.work_date}|${q.shift_id}`, q.required]));
          const rows = u.data.shifts
            .map(shift => ({
              shift,
              required: requiredFor(dateStr, shift, overrides),
              assigned: u.data.assignments.filter(a => a.work_date === dateStr && a.shift_id === shift.id),
            }))
            .filter(r => r.required > 0 || r.assigned.length > 0);
          return (
            <div key={u.key} className="rounded-xl border border-hairline bg-canvas-soft/40 p-2.5 min-w-0">
              <p className="m-0 mb-1.5 text-[13px] font-extrabold text-ink">{u.label}</p>
              {rows.length === 0 ? (
                <p className="m-0 text-[12px] text-ink-faint">근무 없음</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {rows.map(({ shift, required, assigned }) => (
                    <div key={shift.id} className="flex items-start gap-1.5">
                      <span className={`shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded leading-tight ${
                        assigned.length >= required ? 'bg-emerald-50 text-emerald-700'
                          : assigned.length === 0 ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {shift.name} {assigned.length}/{required}
                      </span>
                      <span className="text-[12px] text-ink leading-snug min-w-0 break-keep">
                        {assigned.length === 0 ? (
                          <span className="text-ink-faint">미배정</span>
                        ) : (
                          assigned.map((a, i) => (
                            <span key={a.id} className="font-semibold whitespace-nowrap">
                              {a.staff_profiles?.name ?? `#${a.staff_id}`}
                              {a.start_time && <span className="text-ink-faint font-normal"> {a.start_time.slice(0, 5)}</span>}
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

// ── 단위별(주방/매장) 읽기 전용 주간 매트릭스 ─────────────────────────────────

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
    () => staff.filter(s => s.staff_role === unit.staffRole && (unit.staffRole === 'kitchen' || s.store_id === unit.storeId)),
    [staff, unit],
  );

  const assignMap = useMemo(() => buildAssignMap(data.assignments), [data.assignments]);

  const overrides = useMemo(
    () => Object.fromEntries(data.requirements.map(q => [`${q.work_date}|${q.shift_id}`, q.required])),
    [data.requirements],
  );

  const violations = useMemo(
    () => findRosterViolations(data.assignments, data.shifts, unitStaff),
    [data.assignments, data.shifts, unitStaff],
  );

  const getAssigned = (dateStr: string, shiftId: number) => assignMap.get(`${dateStr}|${shiftId}`) ?? [];
  const getRequired = (dateStr: string, shift: RosterShift) => requiredFor(dateStr, shift, overrides);

  return (
    <section className="bg-canvas rounded-2xl p-3 md:p-4 shadow-level-1 border border-hairline">
      <h2 className="m-0 mb-2.5 text-[15px] font-extrabold">{label}</h2>
      <WeekMatrix
        weekStart={weekStart}
        todayStr={todayStr}
        shifts={data.shifts}
        staffList={unitStaff}
        getAssigned={getAssigned}
        getRequired={getRequired}
        violations={violations}
        selectedDate={selectedDate}
        onDateClick={onDateClick}
      />
    </section>
  );
}
