'use client';

import { useMemo, useState } from 'react';
import { formatPrice } from '@/lib/utils';
import { feePercentOf, monthSettlement } from '@/lib/popupSettlement';
import { monthPopupsOf, popupTotalsOf } from '../_lib/monthPopups';
import type { CalendarSalesData } from '@/types/api';
import type { PopupEvent } from '@/types/database';

const MATERIAL_COST_KEY = 'choichoi_material_cost';
const OTHER_COST_KEY = 'choichoi_other_cost';
const FEE_PERCENT_KEY = 'choichoi_fee_percent';

const readNum = (key: string, fallback: number) => {
  try { const s = localStorage.getItem(key); return s ? Number(s) || 0 : fallback; } catch { return fallback; }
};
const writeNum = (key: string, v: number) => { try { localStorage.setItem(key, String(v)); } catch { /* ignore */ } };
const fmtInput = (v: number) => (v === 0 ? '' : v.toLocaleString('ko-KR'));
const parseWon = (raw: string) => { const n = parseInt(raw.replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n; };

/**
 * 예상 정산 계산기 — 달력에서 보고 있는 달의 매출에서 팝업 수수료·재료비·기타를 뺀다.
 * 수수료는 팝업마다 설정한 값(설정 › 팝업 관리), 미설정 팝업·팝업 미지정 매출에만 아래 기본 수수료를 쓴다.
 * 재료비·기타·기본 수수료는 이 기기에 기억한다.
 */
export default function SettlementCalculator({ calendarSales, popupEvents, calendarMonth }: {
  calendarSales: CalendarSalesData;
  popupEvents: PopupEvent[];
  calendarMonth: Date;
}) {
  const [materialCost, setMaterialCost] = useState(() => readNum(MATERIAL_COST_KEY, 0));
  const [otherCost, setOtherCost] = useState(() => readNum(OTHER_COST_KEY, 0));
  const [feePercent, setFeePercent] = useState(() => readNum(FEE_PERCENT_KEY, 32));

  const monthPopups = useMemo(() => monthPopupsOf(popupEvents, calendarMonth), [popupEvents, calendarMonth]);
  const popupTotals = useMemo(() => popupTotalsOf(calendarSales), [calendarSales]);
  const settlement = useMemo(
    () => monthSettlement(
      calendarSales.monthTotal,
      monthPopups.map(p => ({ revenue: popupTotals.get(p.id)?.revenue ?? 0, feePercent: feePercentOf(p) })),
      feePercent,
    ),
    [calendarSales.monthTotal, monthPopups, popupTotals, feePercent],
  );
  const estimated = settlement.afterFee - materialCost - otherCost;
  const inputCls = 'text-right text-sm border border-hairline rounded-lg px-2.5 py-1.5 outline-none focus:border-primary-700 focus:ring-1 focus:ring-primary-700/20 bg-canvas-soft';

  return (
    <div className="text-[13px]">
      <p className="m-0 mb-1 text-[11px] font-semibold text-ink-faint">
        {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월 기준 · 달력에서 달을 바꾸면 따라 바뀝니다
      </p>
      <div className="flex items-center justify-between py-2.5 border-b border-hairline">
        <span className="text-ink-muted">최종 월매출</span>
        <strong className="font-bold text-ink tabular-nums">₩{formatPrice(calendarSales.monthTotal)}</strong>
      </div>

      {monthPopups.length > 0 && (
        <div className="py-2 border-b border-hairline flex flex-col gap-1">
          {monthPopups.map(p => {
            const rev = popupTotals.get(p.id)?.revenue ?? 0;
            const fee = feePercentOf(p);
            return (
              <div key={p.id} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="min-w-0 truncate text-ink-secondary">{p.name}</span>
                <span className="shrink-0 whitespace-nowrap text-ink-muted tabular-nums">
                  ₩{formatPrice(rev)} · {fee != null ? `${fee}%` : <span className="text-amber-700">기본 {feePercent}%</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 py-2.5 border-b border-hairline">
        <label className="flex items-center gap-2 text-ink-muted">
          기본 수수료
          <span className="relative">
            <input
              type="number" min={0} max={100} step={1}
              value={feePercent}
              onChange={e => { const v = Number(e.target.value) || 0; setFeePercent(v); writeNum(FEE_PERCENT_KEY, v); }}
              className={`w-16 pr-5 ${inputCls}`}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-ink-muted font-bold pointer-events-none">%</span>
          </span>
        </label>
        <span className="text-right">
          <span className="block text-[11px] text-ink-faint">수수료 −₩{formatPrice(settlement.fee)}</span>
          <strong className="font-bold text-primary-700 tabular-nums">₩{formatPrice(settlement.afterFee)}</strong>
        </span>
      </div>
      {!settlement.usesFallback && (
        <p className="m-0 pt-1 text-[10px] text-ink-faint">이 달은 모든 팝업에 수수료가 설정돼 있어 기본 수수료를 쓰지 않아요.</p>
      )}

      {([['재료비', materialCost, setMaterialCost, MATERIAL_COST_KEY], ['기타', otherCost, setOtherCost, OTHER_COST_KEY]] as const).map(([label, value, set, key]) => (
        <div key={label} className="flex items-center justify-between gap-3 py-2.5 border-b border-hairline">
          <span className="text-ink-muted">{label}</span>
          <span className="flex items-center gap-1">
            <span className="text-ink-faint">₩</span>
            <input
              type="text" inputMode="numeric" placeholder="0"
              value={fmtInput(value)}
              onChange={e => { const v = parseWon(e.target.value); set(v); writeNum(key, v); }}
              onFocus={e => e.target.select()}
              className={`w-32 ${inputCls}`}
            />
          </span>
        </div>
      ))}

      <div className="flex items-center justify-between pt-3">
        <span className="text-[15px] font-extrabold text-ink">예상 정산금액</span>
        <strong className={`text-[16px] font-extrabold tabular-nums ${estimated >= 0 ? 'text-primary-700' : 'text-red-600'}`}>
          {estimated < 0 && '-'}₩{formatPrice(Math.abs(estimated))}
        </strong>
      </div>
    </div>
  );
}
