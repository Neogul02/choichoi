'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import ConfirmDialog from '@/components/ConfirmDialog';
import { fetchPopupClosedDays, addPopupClosedDays, removePopupClosedDay } from '@/app/actions/schedule';
import { fetchPopupAssignmentCounts, clearPopupAssignmentsOnDates } from '@/app/actions/roster';
import { weekdayDatesInRange } from '@/lib/closedDays';
import { DAY_NAMES } from '@/lib/staffing';
import { dayOfWeek } from '@/lib/date';
import type { PopupClosedDay, PopupEvent } from '@/types/database';

interface Props {
  popup: PopupEvent;
  /** 목록의 "휴무일 N" 배지를 갱신하기 위해 바뀐 개수를 올려준다 */
  onCountChange: (count: number) => void;
}

const mdLabel = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}(${DAY_NAMES[dayOfWeek(d)]})`;

/**
 * 팝업 휴무일 관리 — 운영 기간 안이지만 영업하지 않는 날(백화점 정기휴점 등)을 지정한다.
 *
 * 저장은 날짜 행 하나로만 한다(lib/closedDays.ts 참고). "매주 ○요일"은 요일 규칙을 따로
 * 저장하지 않고 운영 기간에 펼쳐 날짜로 넣는다 — 그래야 임시 휴점·명절 휴점이 섞여도,
 * 반대로 휴점일에 특별 영업을 하는 예외가 생겨도 "그 날이 휴무인가"를 한 곳에서 판정한다.
 *
 * 휴무 지정은 급여를 바꾸지 않는다 — 이미 찍힌 배정 행은 남는다(급여는 배정 기준).
 * 그래서 남은 배정 건수를 날짜마다 보여주고, 삭제는 건수를 확인한 뒤 따로 눌러야 한다.
 */
export default function PopupClosedDaysPanel({ popup, onCountChange }: Props) {
  const [days, setDays] = useState<PopupClosedDay[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [newDate, setNewDate] = useState('');
  const [newReason, setNewReason] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [weekdayTarget, setWeekdayTarget] = useState<number | null>(null);
  const [clearTarget, setClearTarget] = useState<PopupClosedDay | null>(null);

  // 휴무일과 "그 날 남아 있는 배정 건수"는 같이 봐야 의미가 있어 한 번에 불러온다
  const load = useCallback(async () => {
    const res = await fetchPopupClosedDays([popup.id]);
    if (!res.success || !res.data) {
      toast.error(`휴무일을 불러올 수 없습니다: ${res.error}`);
      setIsLoading(false);
      return;
    }
    setDays(res.data);
    onCountChange(res.data.length);
    setIsLoading(false);
    if (res.data.length > 0) {
      const countRes = await fetchPopupAssignmentCounts(popup.id, res.data.map(d => d.closed_date));
      if (countRes.success && countRes.data) setCounts(countRes.data);
    } else {
      setCounts({});
    }
  }, [popup.id, onCountChange]);

  useEffect(() => { void load(); }, [load]);

  const handleAdd = async (dates: string[], reason: string | null) => {
    if (dates.length === 0) return;
    setIsBusy(true);
    const res = await addPopupClosedDays(popup.id, dates, reason);
    setIsBusy(false);
    if (!res.success || !res.data) { toast.error(`오류: ${res.error}`); return; }
    const { added, skipped } = res.data;
    toast.success(
      added.length === 0
        ? '이미 휴무일로 지정된 날짜입니다'
        : `휴무일 ${added.length}일 지정됨${skipped > 0 ? ` · ${skipped}일은 이미 지정됨` : ''}`,
    );
    setNewDate('');
    setNewReason('');
    await load();
  };

  const handleRemove = async (day: PopupClosedDay) => {
    setIsBusy(true);
    const res = await removePopupClosedDay(popup.id, day.closed_date);
    setIsBusy(false);
    if (!res.success) { toast.error(`오류: ${res.error}`); return; }
    toast.success(`${mdLabel(day.closed_date)} 휴무가 해제됐습니다`);
    await load();
  };

  const confirmClear = async () => {
    const target = clearTarget;
    setClearTarget(null);
    if (!target) return;
    setIsBusy(true);
    const res = await clearPopupAssignmentsOnDates(popup.id, [target.closed_date]);
    setIsBusy(false);
    if (!res.success || !res.data) { toast.error(`오류: ${res.error}`); return; }
    toast.success(`${mdLabel(target.closed_date)} 배정 ${res.data.removed}건이 삭제됐습니다`);
    await load();
  };

  const closedSet = new Set(days.map(d => d.closed_date));
  // 요일 칩에 "운영 기간 중 이 요일 N일" 안내 — 눌렀을 때 몇 일이 지정되는지 미리 보이게
  const weekdayStats = DAY_NAMES.map((_, w) => {
    const dates = weekdayDatesInRange(popup.start_date, popup.end_date, w);
    return { dates, remaining: dates.filter(d => !closedSet.has(d)).length };
  });

  const inputCls = 'px-2.5 py-1.5 border border-hairline rounded-lg text-[12px] bg-canvas focus:outline-none focus:border-primary-700';

  return (
    <div className="px-3 pb-3 pt-0">
      <div className="rounded-xl border border-hairline bg-canvas-soft p-3">
        <p className="m-0 mb-2 text-[11px] text-ink-muted leading-snug">
          운영 기간 안이지만 영업하지 않는 날입니다. 근무표에서 휴무로 표시되고, 요구 인원은 0으로 보며,
          일괄 배정·지난주 복사에서 제외됩니다. <strong className="text-ink-secondary">이미 배정된 근무는 지워지지 않습니다</strong> —
          급여는 배정 기준이라 날짜별로 확인한 뒤 지웁니다.
        </p>

        {/* 매주 ○요일 일괄 지정 — 백화점 정기휴점이 이 형태다 */}
        <p className="m-0 mb-1 text-[11px] font-bold text-ink-muted">매주 휴무 요일</p>
        <div className="flex gap-1 mb-3">
          {DAY_NAMES.map((label, w) => {
            const { dates, remaining } = weekdayStats[w];
            return (
              <button
                key={w}
                type="button"
                disabled={isBusy || dates.length === 0 || remaining === 0}
                onClick={() => setWeekdayTarget(w)}
                title={dates.length === 0
                  ? '운영 기간에 이 요일이 없습니다'
                  : remaining === 0
                    ? `이 요일 ${dates.length}일 모두 휴무로 지정돼 있습니다`
                    : `${label}요일 ${remaining}일을 휴무로 지정합니다`}
                className={`flex-1 py-1.5 rounded-lg text-[12px] font-bold border transition cursor-pointer disabled:cursor-default ${
                  dates.length > 0 && remaining === 0
                    ? 'bg-ink/5 text-ink-secondary border-hairline'
                    : 'bg-canvas text-ink-muted border-hairline hover:border-primary-300 disabled:opacity-40'
                }`}
              >
                {label}
                {dates.length > 0 && (
                  <span className="block text-[9px] font-semibold opacity-70 tabular-nums">
                    {dates.length - remaining}/{dates.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 개별 날짜 추가 — 임시 휴점·명절 휴점 */}
        <form
          className="flex gap-1.5 mb-3"
          onSubmit={e => { e.preventDefault(); handleAdd([newDate], newReason.trim() || null); }}
        >
          <input
            type="date" value={newDate} min={popup.start_date} max={popup.end_date}
            onChange={e => setNewDate(e.target.value)}
            className={`flex-1 ${inputCls}`}
          />
          <input
            type="text" value={newReason} placeholder="사유 (선택)" maxLength={100}
            onChange={e => setNewReason(e.target.value)}
            className={`flex-1 min-w-0 ${inputCls}`}
          />
          <button
            type="submit" disabled={isBusy || !newDate}
            className="shrink-0 px-3 py-1.5 rounded-lg border-none bg-primary-700 text-white text-[12px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-40"
          >
            추가
          </button>
        </form>

        {/* 지정된 휴무일 */}
        {isLoading ? (
          <p className="m-0 text-[12px] text-ink-faint">불러오는 중…</p>
        ) : days.length === 0 ? (
          <p className="m-0 text-[12px] text-ink-faint">지정된 휴무일이 없습니다.</p>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {days.map(day => {
              const leftover = counts[day.closed_date] ?? 0;
              return (
                <li key={day.id} className="flex items-center gap-2 rounded-lg border border-hairline bg-canvas px-2.5 py-1.5">
                  <span className="text-[12px] font-bold text-ink tabular-nums shrink-0">{mdLabel(day.closed_date)}</span>
                  {day.reason && <span className="text-[11px] text-ink-muted truncate">{day.reason}</span>}
                  {leftover > 0 && (
                    <button
                      type="button"
                      onClick={() => setClearTarget(day)}
                      disabled={isBusy}
                      title="휴무일인데 남아 있는 근무 배정 — 지우지 않으면 급여에 그대로 계산됩니다"
                      className="ml-auto shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold border border-rose-200 bg-rose-50 text-rose-600 cursor-pointer hover:bg-rose-100 transition disabled:opacity-50"
                    >
                      배정 {leftover}건 삭제
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(day)}
                    disabled={isBusy}
                    aria-label={`${day.closed_date} 휴무 해제`}
                    className={`shrink-0 bg-transparent border-none text-ink-faint cursor-pointer text-[14px] leading-none hover:text-ink transition disabled:opacity-50 ${leftover > 0 ? '' : 'ml-auto'}`}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={weekdayTarget != null}
        title={weekdayTarget == null ? '' : `매주 ${DAY_NAMES[weekdayTarget]}요일을 휴무일로 지정할까요?`}
        description={weekdayTarget == null ? undefined
          : `${popup.name} 운영 기간(${popup.start_date} ~ ${popup.end_date})의 ${DAY_NAMES[weekdayTarget]}요일 ${weekdayStats[weekdayTarget].remaining}일이 휴무로 지정됩니다. 이미 배정된 근무는 지워지지 않습니다.`}
        confirmLabel="지정"
        busy={isBusy}
        onConfirm={() => {
          const w = weekdayTarget;
          setWeekdayTarget(null);
          if (w == null) return;
          void handleAdd(weekdayStats[w].dates, '정기휴점');
        }}
        onClose={() => setWeekdayTarget(null)}
      />

      <ConfirmDialog
        open={clearTarget != null}
        title={clearTarget == null ? '' : `${mdLabel(clearTarget.closed_date)} 배정 ${counts[clearTarget.closed_date] ?? 0}건을 삭제할까요?`}
        description="휴무일에 남아 있는 근무 배정을 지웁니다. 지우지 않으면 그 시간이 급여에 계산됩니다."
        confirmLabel="삭제"
        danger
        busy={isBusy}
        onConfirm={confirmClear}
        onClose={() => setClearTarget(null)}
      />
    </div>
  );
}
