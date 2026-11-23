'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePopupDayCompare, usePopupEventsAll } from '@/hooks/usePopupDayCompare';
import { useKstTime } from '@/hooks/useKstTime';
import { kstToday } from '@/lib/date';
import { pastPopupsFor, popupDayIndex, sameDayOfRun } from '@/lib/popupDayCompare';
import { sumUptoMinute } from '@/lib/salesCurve';
import { DAY_NAMES } from '@/lib/staffing';
import SalesDelta from './SalesDelta';

const COMPARE_POPUP_KEY = 'pos_compare_popup_id';

/**
 * 지난 팝업 같은 운영 일차·같은 시각 비교 — POS 오늘 현황과 통계 오늘 섹션이 같이 쓴다.
 * 오늘이 N일차면 고른 지난 팝업의 N일차 같은 시각(분 단위)까지 누적과 맞댄다. 같은 매장 지난 회차만 고를 수 있다.
 */
export default function PastPopupCompare({ currentPopupId, todayUptoNow, enabled = true }: {
  currentPopupId: number | null;
  todayUptoNow: number;
  enabled?: boolean;
}) {
  const today = kstToday();
  const { hour: nowHour, minute: nowMinute } = useKstTime();
  const popupsQuery = usePopupEventsAll(enabled && currentPopupId != null);
  const currentPopup = popupsQuery.data?.find(p => p.id === currentPopupId) ?? null;
  const pastPopups = useMemo(
    () => (currentPopup ? pastPopupsFor(currentPopup, popupsQuery.data ?? [], today) : []),
    [currentPopup, popupsQuery.data, today],
  );
  const [comparePopupId, setComparePopupId] = useState<number | null>(null);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(COMPARE_POPUP_KEY));
      if (saved) setComparePopupId(saved);
    } catch { /* 저장소를 못 쓰면 기본값(같은 매장 최근 회차) */ }
  }, []);
  const comparePopup = pastPopups.find(p => p.id === comparePopupId) ?? pastPopups[0] ?? null;
  const pick = (id: number) => {
    setComparePopupId(id);
    try { localStorage.setItem(COMPARE_POPUP_KEY, String(id)); } catch { /* 무시 */ }
  };
  const run = currentPopup && comparePopup ? sameDayOfRun(currentPopup, comparePopup, today) : null;
  const pastDay = usePopupDayCompare(run?.date ?? null, nowHour, nowMinute, enabled);
  const past = useMemo(() => {
    if (!comparePopup || !run || !pastDay.full) return null;
    const full = pastDay.full.filter(r => r.popupId === comparePopup.id);
    const partial = pastDay.partial.filter(r => r.popupId === comparePopup.id);
    return {
      uptoNow: full.length > 0 ? sumUptoMinute(full, partial, nowHour) : null,
      dayTotal: full.reduce((s, r) => s + r.totalRevenue, 0),
    };
  }, [comparePopup, run, pastDay.full, pastDay.partial, nowHour]);

  if (!enabled || pastPopups.length === 0 || !comparePopup) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
      <select
        value={comparePopup.id}
        onChange={e => pick(Number(e.target.value))}
        aria-label="비교할 지난 팝업"
        className="max-w-[140px] truncate rounded-md border border-hairline bg-canvas px-1.5 py-0.5 text-[11px] font-semibold text-ink-secondary cursor-pointer"
      >
        {pastPopups.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {run ? (
        <>
          <SalesDelta
            label={`${run.dayNo}일차(${DAY_NAMES[new Date(`${run.date}T00:00:00`).getDay()]}) 같은 시각`}
            now={todayUptoNow}
            before={past?.uptoNow ?? null}
          />
          {past && past.dayTotal > 0 && (
            <span className="text-ink-faint whitespace-nowrap tabular-nums">그날 전체 ₩{past.dayTotal.toLocaleString('ko-KR')}</span>
          )}
        </>
      ) : (
        <span className="text-ink-faint">그 팝업은 {currentPopup ? (popupDayIndex(currentPopup, today) ?? 0) + 1 : ''}일차까지 운영하지 않았어요</span>
      )}
    </div>
  );
}
