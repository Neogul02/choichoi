'use client';

import { useMemo, useState } from 'react';
import { formatPrice } from '@/lib/utils';
import { afterFee, feePercentOf } from '@/lib/popupSettlement';
import { monthPopupsOf, popupTotalsOf } from '../_lib/monthPopups';
import { getDayTierSwatch } from '../_lib/tierSwatch';
import { makePopupColorOf, UNASSIGNED_POPUP_COLOR } from '../_lib/popupColor';
import type { CalendarSalesData, ManualSalesEntry } from '@/types/api';
import type { PopupEvent } from '@/types/database';
import DayDetailModal from './DayDetailModal';
import SectionHeader from './SectionHeader';
import { DAY_NAMES } from '@/lib/staffing';



/** 2026-10-02 ~ 2026-10-15 → 10.2~10.15 */
function formatRangeLabel(start: string, end: string): string {
  const short = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
  return `${short(start)}~${short(end)}`;
}

function formatDayRevenue(n: number): string {
  if (n <= 0) return '·';
  const man = n / 10000;
  if (man < 1) return `₩${n.toLocaleString('ko-KR')}`;
  if (man < 10) return `${man.toFixed(1)}만`;
  return `${Math.round(man)}만`;
}

interface Props {
  calendarSales: CalendarSalesData;
  /** 팝업 일정을 달력에 겹쳐 그리기 위한 전체 팝업 목록 — 매출이 0인 날도 기간 안이면 띠가 보여야 한다 */
  popupEvents: PopupEvent[];
  calendarMonth: Date;
  isLoading: boolean;
  todayStr: string;
  onMonthChange: (offset: number) => void;
  saveDay: (date: string, revenue: number, orders: number, note: string | null) => Promise<boolean>;
  removeDay: (id: number) => Promise<void>;
  /** 팝업별 정정을 저장한 뒤 달력·팝업 통계를 다시 읽는다 */
  onPopupSaved: () => void;
}

export default function CalendarSection({ calendarSales, popupEvents, calendarMonth, isLoading, todayStr, onMonthChange, saveDay, removeDay, onPopupSaved }: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // ?? {}가 매 렌더 새 객체를 만들어 아래 useMemo 의존성이 매번 바뀌는 것을 막는다
  const manualByDate: Record<string, ManualSalesEntry> = useMemo(
    () => calendarSales.manualByDate ?? {},
    [calendarSales.manualByDate],
  );

  const monthYearLabel = `${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월`;
  const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const buildDateKey = (year: number, monthIndex: number, day: number) =>
    `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // 이 달에 걸치는 팝업 — 일정 띠·범례·색 배정이 모두 이 목록 하나를 기준으로 돈다
  const monthPopups = useMemo(() => monthPopupsOf(popupEvents, calendarMonth), [popupEvents, calendarMonth]);

  const colorOf = useMemo(() => makePopupColorOf(monthPopups.map((p) => p.id)), [monthPopups]);

  // 팝업별 월 합계(팝업 정정 반영) — _lib/monthPopups
  const popupTotals = useMemo(() => popupTotalsOf(calendarSales), [calendarSales]);

  // 수동 입력으로 정정한 날은 칸 금액(수동값)과 팝업 내역 합(POS)이 어긋난다 — 범례에 한 줄로 밝힌다
  const hasManualInMonth = useMemo(() => {
    const prefix = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-`;
    return Object.keys(manualByDate).some((d) => d.startsWith(prefix));
  }, [manualByDate, calendarMonth]);

  // 이 달 팝업 합계 — 정산 예상은 수수료를 정한 팝업만 더한다(미설정은 개수로 알린다)
  const monthTotals = useMemo(() => {
    let revenue = 0, orders = 0, settlement = 0, noFee = 0;
    for (const p of monthPopups) {
      const t = popupTotals.get(p.id);
      if (!t) continue;
      revenue += t.revenue;
      orders += t.orders;
      const fee = feePercentOf(p);
      if (fee == null) noFee += 1;
      else settlement += afterFee(t.revenue, fee);
    }
    return { revenue, orders, settlement, noFee, count: monthPopups.length };
  }, [monthPopups, popupTotals]);

  // 미지정 몫은 팝업 목록에 없지만 매출이 있으면 범례에 꼭 띄운다 — 조용히 사라지면 합이 안 맞는 이유를 알 수 없다
  const unassigned = popupTotals.get(null) ?? null;


  return (
    <>
    <div className="min-w-0 bg-canvas-soft rounded-xl p-4 border border-hairline">
      <SectionHeader
        title="날짜별 매출 프리뷰"
        right={
          <div className="flex items-center gap-1.5">
            <button className="w-8 h-8 rounded-lg bg-canvas border border-[#d8d8d8] flex items-center justify-center cursor-pointer text-ink-secondary hover:bg-canvas-soft text-lg leading-none font-bold" onClick={() => onMonthChange(-1)}>‹</button>
            <strong className="min-w-[104px] text-center text-[13px] font-bold text-ink-secondary">{monthYearLabel}</strong>
            <button className="w-8 h-8 rounded-lg bg-canvas border border-[#d8d8d8] flex items-center justify-center cursor-pointer text-ink-secondary hover:bg-canvas-soft text-lg leading-none font-bold" onClick={() => onMonthChange(1)}>›</button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-canvas border border-[#e4e4e4] rounded-xl px-3 py-2.5 text-center">
          <div className="text-[11px] text-ink-muted font-medium mb-0.5">월 주문</div>
          <div className="text-[17px] font-extrabold text-ink-secondary">{calendarSales.totalOrders}<span className="text-[13px] font-semibold ml-0.5">건</span></div>
        </div>
        <div className="bg-primary-50 border border-primary-700 rounded-xl px-3 py-2.5 text-center">
          <div className="text-[11px] text-ink-muted font-medium mb-0.5">월 매출</div>
          <div className="text-[17px] font-extrabold text-primary-700">₩{formatPrice(calendarSales.monthTotal)}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-ink-faint text-sm">달력 매출을 불러오는 중입니다...</div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {DAY_NAMES.map((name, i) => (
            <div key={name} className={`text-center text-[11px] font-bold py-1.5 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-ink-muted'}`}>
              {name}
            </div>
          ))}
          {Array.from({ length: firstDay }).map((_, idx) => (
            <div key={`blank-${idx}`} className="min-h-[64px]" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const day = idx + 1;
            const dayOfWeek = (firstDay + idx) % 7;
            const dateKey = buildDateKey(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
            const dayRevenue = Number(calendarSales.byDate?.[dateKey] || 0);
            const isManual = Boolean(manualByDate[dateKey]);
            const effectiveRevenue = isManual ? manualByDate[dateKey].total_revenue : dayRevenue;
            const swatch = getDayTierSwatch(effectiveRevenue);
            const isToday = dateKey === todayStr;
            // 그날 일정이 걸린 팝업(매출 0이어도 보여야 한다) + 그날 실제로 판 팝업(일정 밖 매출도 놓치지 않는다)
            const scheduled = monthPopups.filter((p) => p.start_date <= dateKey && p.end_date >= dateKey);
            const sold = calendarSales.popupByDate?.[dateKey] ?? [];
            const stripeIds: Array<number | null> = [
              ...scheduled.map((p) => p.id),
              ...sold.map((r) => r.popupId).filter((id) => !scheduled.some((p) => p.id === id)),
            ];
            const soldById = new Map(sold.map((r) => [r.popupId, r]));
            return (
              <div
                key={dateKey}
                onClick={() => setSelectedDate(dateKey)}
                className="min-h-[64px] rounded-lg p-1.5 cursor-pointer active:scale-[0.97] transition-transform"
                style={{
                  backgroundColor: swatch ? swatch.bg : '#f8faf9',
                  border: isToday
                    ? '2px solid #084431'
                    : swatch
                      ? `1.5px solid ${swatch.ring}`
                      : '1px solid #e4e9e6',
                }}
              >
                <div className="flex items-start justify-between">
                  <span className={`text-[11px] font-extrabold leading-none ${dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : isToday ? 'text-primary-700' : 'text-ink-secondary'}`}>
                    {day}{isToday && <span className="ml-0.5 text-primary-700">•</span>}
                  </span>
                  {isManual && <span className="w-1.5 h-1.5 rounded-full bg-[#b8842f] shrink-0 mt-0.5" title="수동 정정" />}
                </div>
                <div
                  className="mt-1.5 text-[10px] font-semibold leading-tight tabular-nums whitespace-nowrap overflow-hidden text-ellipsis"
                  style={{ color: swatch ? swatch.text : '#a39e98' }}
                >
                  {formatDayRevenue(effectiveRevenue)}
                </div>

                {/* 팝업 일정 띠 — 색은 아래 범례와 같다. 판 날은 꽉 찬 띠, 일정만 있고 매출이 없는 날은 옅은 띠 */}
                {stripeIds.length > 0 && (
                  <div className="mt-1 flex flex-col gap-[2px]">
                    {stripeIds.slice(0, 3).map((id) => {
                      const row = soldById.get(id);
                      const color = colorOf(id);
                      return (
                        <span
                          key={String(id)}
                          className="block h-[3px] rounded-full"
                          style={{ backgroundColor: color, opacity: row ? 1 : 0.28 }}
                        />
                      );
                    })}
                    {stripeIds.length > 3 && (
                      <span className="text-[8px] font-bold leading-none text-ink-faint">+{stripeIds.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 팝업 일정 범례 — 달력의 띠 색과 짝이 맞고, "언제 얼마나 팔았는지"를 팝업 단위로 읽는 칸 */}
      {!isLoading && (monthPopups.length > 0 || unassigned) && (
        <div className="mt-3 rounded-xl border border-hairline bg-canvas overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-hairline bg-canvas-soft">
            <span className="text-[12px] font-bold text-ink-secondary">이 달의 팝업 일정</span>
            <span className="text-[10px] text-ink-faint">POS 결제 기준</span>
          </div>
          {monthPopups.map((p) => {
            const t = popupTotals.get(p.id);
            const fee = feePercentOf(p);
            return (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2 border-b border-hairline last:border-b-0">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(p.id) }} />
                {/* 이름·기간·수수료는 왼쪽에 쌓고, 금액은 오른쪽에 한 줄로 — 금액이 길어도 줄바꿈되지 않게 */}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-bold text-ink">{p.name}</span>
                  <span className="block text-[10px] text-ink-faint tabular-nums">
                    {formatRangeLabel(p.start_date, p.end_date)}
                    {fee != null && <> · 수수료 {fee}%</>}
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums whitespace-nowrap">
                  <span className="block text-[12px] font-extrabold text-primary-700">
                    {t ? `₩${formatPrice(t.revenue)}` : '—'}
                  </span>
                  {t && (
                    <span className="block text-[10px] text-ink-faint">
                      {t.orders.toLocaleString('ko-KR')}건
                      {fee != null && <> · 정산 <b className="font-bold text-ink-secondary">₩{formatPrice(afterFee(t.revenue, fee))}</b></>}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
          {unassigned && (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-hairline">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: UNASSIGNED_POPUP_COLOR }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-bold text-ink-muted">팝업 미지정</span>
                <span className="block text-[10px] text-ink-faint">주문에 팝업이 안 붙은 건</span>
              </span>
              <span className="shrink-0 text-right tabular-nums whitespace-nowrap">
                <span className="block text-[12px] font-extrabold text-ink-muted">₩{formatPrice(unassigned.revenue)}</span>
                <span className="block text-[10px] text-ink-faint">{unassigned.orders.toLocaleString('ko-KR')}건</span>
              </span>
            </div>
          )}
          {/* 합계 — 이 달 팝업 매출·건수와 정산 예상(매출 − 팝업별 수수료) 총합 */}
          {monthPopups.length > 1 && (
            <div className="flex items-center gap-2 px-3 py-2.5 border-t-2 border-hairline bg-primary-50/60">
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-extrabold text-ink">합계</span>
                <span className="block text-[10px] text-ink-faint">
                  팝업 {monthTotals.count}곳
                  {monthTotals.noFee > 0 && <> · 수수료 미설정 {monthTotals.noFee}곳은 정산에서 빠짐</>}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums whitespace-nowrap">
                <span className="block text-[13px] font-extrabold text-primary-700">₩{formatPrice(monthTotals.revenue)}</span>
                <span className="block text-[10px] text-ink-faint">
                  {monthTotals.orders.toLocaleString('ko-KR')}건 · 정산 <b className="font-extrabold text-ink">₩{formatPrice(monthTotals.settlement)}</b>
                </span>
              </span>
            </div>
          )}
          {hasManualInMonth && (
            <p className="m-0 border-t border-hairline bg-canvas-soft px-3 py-2 text-[10px] leading-relaxed text-ink-muted">
              수동 정정(<span className="mx-0.5 inline-block h-1.5 w-1.5 translate-y-[1px] rounded-full bg-[#b8842f]" />)한 날은
              달력 칸 금액이 수동값으로 대체됩니다. 수동 입력은 날짜 단위라 팝업으로 나눌 수 없어, 위 팝업별 금액과 월 매출이 다를 수 있습니다.
            </p>
          )}
        </div>
      )}

    </div>

      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          manualEntry={manualByDate[selectedDate]}
          onClose={() => setSelectedDate(null)}
          onSaved={() => setSelectedDate(null)}
          saveDay={saveDay}
          removeDay={removeDay}
          popups={popupEvents.filter((p) => p.start_date <= selectedDate && selectedDate <= p.end_date)}
          popupSales={calendarSales.popupByDate?.[selectedDate] ?? []}
          onPopupChanged={onPopupSaved}
        />
      )}
    </>
  );
}
