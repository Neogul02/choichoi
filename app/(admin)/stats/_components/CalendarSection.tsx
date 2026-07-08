'use client';

import { useState } from 'react';
import { formatPrice } from '@/lib/utils';
import { getDayTierSwatch } from '../_lib/tierSwatch';
import type { CalendarSalesData, ManualSalesEntry } from '@/types/api';
import DayDetailModal from './DayDetailModal';
import SectionHeader from './SectionHeader';

const MATERIAL_COST_KEY = 'choichoi_material_cost';
const OTHER_COST_KEY = 'choichoi_other_cost';
const FEE_PERCENT_KEY = 'choichoi_fee_percent';

function formatDayRevenue(n: number): string {
  if (n <= 0) return '·';
  const man = n / 10000;
  if (man < 1) return `₩${n.toLocaleString('ko-KR')}`;
  if (man < 10) return `${man.toFixed(1)}만`;
  return `${Math.round(man)}만`;
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  calendarSales: CalendarSalesData;
  calendarMonth: Date;
  isLoading: boolean;
  todayStr: string;
  onMonthChange: (offset: number) => void;
  saveDay: (date: string, revenue: number, orders: number, note: string | null) => Promise<boolean>;
  removeDay: (id: number) => Promise<void>;
}

export default function CalendarSection({ calendarSales, calendarMonth, isLoading, todayStr, onMonthChange, saveDay, removeDay }: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const manualByDate: Record<string, ManualSalesEntry> = calendarSales.manualByDate ?? {};
  const [materialCost, setMaterialCost] = useState(() => {
    try { const s = localStorage.getItem(MATERIAL_COST_KEY); return s ? parseInt(s, 10) : 0; } catch { return 0; }
  });
  const [otherCost, setOtherCost] = useState(() => {
    try { const s = localStorage.getItem(OTHER_COST_KEY); return s ? parseInt(s, 10) : 0; } catch { return 0; }
  });
  const [feePercent, setFeePercent] = useState(() => {
    try { const s = localStorage.getItem(FEE_PERCENT_KEY); return s ? parseFloat(s) : 32; } catch { return 32; }
  });

  const monthYearLabel = `${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월`;
  const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const clampedFee = Math.min(100, Math.max(0, feePercent));
  const afterFee = Math.round(calendarSales.monthTotal * (1 - clampedFee / 100));
  const estimatedSettlement = afterFee - materialCost - otherCost;

  const handleFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const next = isNaN(val) ? 0 : val;
    setFeePercent(next);
    try { localStorage.setItem(FEE_PERCENT_KEY, String(next)); } catch { /* ignore */ }
  };

  const buildDateKey = (year: number, monthIndex: number, day: number) =>
    `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const handleCostChange = (setter: (v: number) => void, storageKey: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    const value = raw ? parseInt(raw, 10) : 0;
    setter(value);
    try { localStorage.setItem(storageKey, String(value)); } catch { /* ignore */ }
  };

  const formatCostDisplay = (val: number) => val === 0 ? '' : val.toLocaleString('ko-KR');

  return (
    <>
    <div className="bg-canvas-soft rounded-xl p-4 mb-4 md:mb-5 border border-hairline">
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
                  className="mt-1.5 text-[10px] font-semibold leading-tight tabular-nums"
                  style={{ color: swatch ? swatch.text : '#a39e98' }}
                >
                  {formatDayRevenue(effectiveRevenue)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 bg-canvas border border-[#dce8e0] rounded-xl overflow-hidden">
        <div className="bg-primary-700 px-4 py-3">
          <h4 className="m-0 text-[14px] font-bold text-white">{monthYearLabel} 예상 정산 계산기</h4>
        </div>
        <div className="px-4 py-1">
          <div className="flex items-center justify-between py-3 border-b border-hairline">
            <span className="text-sm text-ink-muted">최종 월매출</span>
            <strong className="text-sm font-bold text-[#111]">₩{formatPrice(calendarSales.monthTotal)}</strong>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 border-b border-hairline">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-ink-muted">팝업 수수료</span>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={feePercent}
                  onChange={handleFeeChange}
                  className="w-16 text-right text-sm border border-hairline rounded-lg px-2 py-1 pr-5 outline-none focus:border-primary-700 focus:ring-1 focus:ring-primary-700/20 bg-canvas-soft"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-ink-muted font-bold pointer-events-none">%</span>
              </div>
            </div>
            <strong className="text-sm font-bold text-primary-700">₩{formatPrice(afterFee)}</strong>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 border-b border-hairline">
            <span className="text-sm text-ink-muted shrink-0">재료비</span>
            <div className="flex items-center gap-1">
              <span className="text-[13px] text-ink-faint">₩</span>
              <input type="text" inputMode="numeric" value={formatCostDisplay(materialCost)} onChange={handleCostChange(setMaterialCost, MATERIAL_COST_KEY)} onFocus={(e) => e.target.select()} placeholder="0" className="w-28 md:w-36 text-right text-sm border border-hairline rounded-lg px-2.5 py-1.5 outline-none focus:border-primary-700 focus:ring-1 focus:ring-primary-700/20 bg-canvas-soft" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 border-b border-hairline">
            <span className="text-sm text-ink-muted shrink-0">기타</span>
            <div className="flex items-center gap-1">
              <span className="text-[13px] text-ink-faint">₩</span>
              <input type="text" inputMode="numeric" value={formatCostDisplay(otherCost)} onChange={handleCostChange(setOtherCost, OTHER_COST_KEY)} onFocus={(e) => e.target.select()} placeholder="0" className="w-28 md:w-36 text-right text-sm border border-hairline rounded-lg px-2.5 py-1.5 outline-none focus:border-primary-700 focus:ring-1 focus:ring-primary-700/20 bg-canvas-soft" />
            </div>
          </div>
          <div className="flex items-center justify-between py-4">
            <span className="text-[15px] font-extrabold text-[#111]">예상 정산금액</span>
            <strong className={`text-[15px] font-extrabold ${estimatedSettlement >= 0 ? 'text-primary-700' : 'text-red-600'}`}>
              {estimatedSettlement < 0 && '-'}₩{formatPrice(Math.abs(estimatedSettlement))}
            </strong>
          </div>
        </div>
      </div>
    </div>

      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          manualEntry={manualByDate[selectedDate]}
          onClose={() => setSelectedDate(null)}
          onSaved={() => setSelectedDate(null)}
          saveDay={saveDay}
          removeDay={removeDay}
        />
      )}
    </>
  );
}
