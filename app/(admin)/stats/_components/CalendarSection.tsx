'use client';

import { useState } from 'react';
import { formatPrice } from '@/lib/utils';
import type { CalendarSalesData } from '@/types/api';

const MATERIAL_COST_KEY = 'choichoi_material_cost';
const OTHER_COST_KEY = 'choichoi_other_cost';
const FEE_PERCENT_KEY = 'choichoi_fee_percent';

function getCellBgStyle(revenue: number, maxRevenue: number) {
  if (revenue <= 0 || maxRevenue <= 0) return { backgroundColor: '#f8faf9' };
  const ratio = Math.min(revenue / maxRevenue, 1);
  const r = Math.round(230 + (61 - 230) * ratio);
  const g = Math.round(244 + (153 - 244) * ratio);
  const b = Math.round(238 + (102 - 238) * ratio);
  return { backgroundColor: `rgb(${r},${g},${b})` };
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  calendarSales: CalendarSalesData;
  calendarMonth: Date;
  isLoading: boolean;
  todayStr: string;
  maxDayRevenue: number;
  onMonthChange: (offset: number) => void;
}

export default function CalendarSection({ calendarSales, calendarMonth, isLoading, todayStr, maxDayRevenue, onMonthChange }: Props) {
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
    <div className="bg-[#f4f7f5] rounded-xl p-4 mb-4 md:mb-5">
      <div className="flex justify-between items-center mb-3">
        <h3 className="m-0 text-lg font-bold">날짜별 매출 프리뷰</h3>
        <div className="flex items-center gap-1.5">
          <button className="w-8 h-8 rounded-lg bg-white border border-[#d8d8d8] flex items-center justify-center cursor-pointer text-[#444] hover:bg-[#f0f0f0] text-lg leading-none font-bold" onClick={() => onMonthChange(-1)}>‹</button>
          <strong className="min-w-[108px] text-center text-[13px] font-bold text-[#333]">{monthYearLabel}</strong>
          <button className="w-8 h-8 rounded-lg bg-white border border-[#d8d8d8] flex items-center justify-center cursor-pointer text-[#444] hover:bg-[#f0f0f0] text-lg leading-none font-bold" onClick={() => onMonthChange(1)}>›</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-white border border-[#e4e4e4] rounded-xl px-3 py-2.5 text-center">
          <div className="text-[11px] text-[#888] font-medium mb-0.5">월 주문</div>
          <div className="text-[17px] font-extrabold text-[#333]">{calendarSales.totalOrders}<span className="text-[13px] font-semibold ml-0.5">건</span></div>
        </div>
        <div className="bg-primary-50 border border-primary-700 rounded-xl px-3 py-2.5 text-center">
          <div className="text-[11px] text-[#888] font-medium mb-0.5">월 매출</div>
          <div className="text-[17px] font-extrabold text-primary-700">₩{formatPrice(calendarSales.monthTotal)}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-[#999] text-sm">달력 매출을 불러오는 중입니다...</div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {DAY_NAMES.map((name, i) => (
            <div key={name} className={`text-center text-[11px] font-bold py-1.5 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-[#888]'}`}>
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
            const isToday = dateKey === todayStr;
            return (
              <div key={dateKey} className="min-h-[64px] rounded-lg p-1.5 transition-shadow" style={{ ...getCellBgStyle(dayRevenue, maxDayRevenue), border: isToday ? '2px solid #084431' : '1px solid #dce8e0' }}>
                <div className={`text-[11px] font-extrabold leading-none ${dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : isToday ? 'text-primary-700' : 'text-[#444]'}`}>
                  {day}{isToday && <span className="ml-0.5 text-primary-700">•</span>}
                </div>
                <div className={`mt-1.5 text-[10px] font-semibold leading-tight ${dayRevenue > 0 ? 'text-[#1a3d2b]' : 'text-[#ccc]'}`}>
                  {dayRevenue > 0 ? `₩${formatPrice(dayRevenue)}` : '·'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 bg-white border border-[#dce8e0] rounded-xl overflow-hidden">
        <div className="bg-primary-700 px-4 py-3">
          <h4 className="m-0 text-[14px] font-bold text-white">{monthYearLabel} 예상 정산 계산기</h4>
        </div>
        <div className="px-4 py-1">
          <div className="flex items-center justify-between py-3 border-b border-[#f0f0f0]">
            <span className="text-sm text-[#555]">최종 월매출</span>
            <strong className="text-sm font-bold text-[#111]">₩{formatPrice(calendarSales.monthTotal)}</strong>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 border-b border-[#f0f0f0]">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-[#555]">팝업 수수료</span>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={feePercent}
                  onChange={handleFeeChange}
                  className="w-16 text-right text-sm border border-[#ddd] rounded-lg px-2 py-1 pr-5 outline-none focus:border-primary-700 focus:ring-1 focus:ring-primary-700/20 bg-[#fafafa]"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[#888] font-bold pointer-events-none">%</span>
              </div>
            </div>
            <strong className="text-sm font-bold text-primary-700">₩{formatPrice(afterFee)}</strong>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 border-b border-[#f0f0f0]">
            <span className="text-sm text-[#555] shrink-0">재료비</span>
            <div className="flex items-center gap-1">
              <span className="text-[13px] text-[#aaa]">₩</span>
              <input type="text" inputMode="numeric" value={formatCostDisplay(materialCost)} onChange={handleCostChange(setMaterialCost, MATERIAL_COST_KEY)} onFocus={(e) => e.target.select()} placeholder="0" className="w-28 md:w-36 text-right text-sm border border-[#ddd] rounded-lg px-2.5 py-1.5 outline-none focus:border-primary-700 focus:ring-1 focus:ring-primary-700/20 bg-[#fafafa]" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 border-b border-[#f0f0f0]">
            <span className="text-sm text-[#555] shrink-0">기타</span>
            <div className="flex items-center gap-1">
              <span className="text-[13px] text-[#aaa]">₩</span>
              <input type="text" inputMode="numeric" value={formatCostDisplay(otherCost)} onChange={handleCostChange(setOtherCost, OTHER_COST_KEY)} onFocus={(e) => e.target.select()} placeholder="0" className="w-28 md:w-36 text-right text-sm border border-[#ddd] rounded-lg px-2.5 py-1.5 outline-none focus:border-primary-700 focus:ring-1 focus:ring-primary-700/20 bg-[#fafafa]" />
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
  );
}
