'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { fetchMenuItems } from '@/app/actions/menu';
import {
  fetchManualDailyMenuSales, saveManualDailyMenuSales,
  fetchManualSalesForRange, saveManualSales,
  fetchManualHourlySales, saveManualHourlySales,
  fetchManualMenuSales, saveManualMenuSales,
} from '@/app/actions/stats';
import { formatPrice } from '@/lib/utils';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { useModalKeyboard } from '@/lib/useModalKeyboard';
import type { MenuItem } from '@/types/database';
import type { ManualHourlyEntry, ApiResponse } from '@/types/api';

interface Props {
  popupId: number;
  popupName: string;
  startDate: string;
  endDate: string;
  onClose: () => void;
  onSaved: () => void;
}

const numInputCls = 'w-20 text-right text-[13px] font-semibold bg-transparent outline-none border-none text-ink';

function parseNum(raw: string): number {
  const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

export default function PopupManualEntryModal({ popupId, popupName, startDate, endDate, onClose, onSaved }: Props) {
  useBodyScrollLock();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalKeyboard({ active: true, onClose, containerRef: panelRef });

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedDate, setSelectedDate] = useState(startDate);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [dayRevenue, setDayRevenue] = useState(0);
  const [dayOrders, setDayOrders] = useState(0);
  const [hourlyByHour, setHourlyByHour] = useState<Record<number, { revenue: number; orders: number }>>({});
  const [extraHours, setExtraHours] = useState<number[]>([]);
  const [addHourValue, setAddHourValue] = useState('');
  const [wholeQuantities, setWholeQuantities] = useState<Record<number, number>>({});
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [loadingDay, setLoadingDay] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMenuItems().then((res) => {
      if (res.success && res.data) setMenuItems(res.data);
      else if (!res.success) toast.error(`메뉴 조회 실패: ${res.error}`);
      setLoadingMenu(false);
    });
  }, []);

  useEffect(() => {
    fetchManualHourlySales(popupId).then((res) => {
      if (!res.success || !res.data) return;
      const map: Record<number, { revenue: number; orders: number }> = {};
      for (const e of res.data as ManualHourlyEntry[]) map[e.hour] = { revenue: e.totalRevenue, orders: e.totalOrders };
      setHourlyByHour(map);
      setExtraHours(Object.keys(map).map(Number).filter((h) => h < 9 || h > 21));
    });
  }, [popupId]);

  useEffect(() => {
    fetchManualMenuSales(popupId).then((res) => {
      if (!res.success || !res.data) return;
      const map: Record<number, number> = {};
      for (const item of res.data) map[item.id] = item.totalQuantity;
      setWholeQuantities(map);
    });
  }, [popupId]);

  useEffect(() => {
    let isCurrent = true;
    setLoadingDay(true);
    Promise.all([
      fetchManualDailyMenuSales(popupId, selectedDate),
      fetchManualSalesForRange(selectedDate, selectedDate),
    ]).then(([menuRes, dayRes]) => {
      if (!isCurrent) return;
      const qtyMap: Record<number, number> = {};
      if (menuRes.success && menuRes.data) {
        for (const row of menuRes.data) qtyMap[row.menuItemId] = row.quantity;
      }
      setQuantities(qtyMap);
      if (dayRes.success && dayRes.data && dayRes.data.length > 0) {
        setDayRevenue(dayRes.data[0].total_revenue);
        setDayOrders(dayRes.data[0].total_orders);
      } else {
        setDayRevenue(0);
        setDayOrders(0);
      }
      setLoadingDay(false);
    });
    return () => { isCurrent = false; };
  }, [popupId, selectedDate]);

  const hourRows = useMemo(() => {
    const base = Array.from({ length: 13 }, (_, i) => i + 9);
    const all = [...new Set([...base, ...extraHours])].sort((a, b) => a - b);
    return all;
  }, [extraHours]);

  const availableHoursToAdd = useMemo(
    () => Array.from({ length: 24 }, (_, h) => h).filter((h) => !hourRows.includes(h)),
    [hourRows]
  );

  const menuTotalRevenue = menuItems.reduce((sum, item) => sum + (quantities[item.id] ?? 0) * item.price, 0);

  const handleQuantityChange = (id: number, raw: string) => {
    setQuantities((prev) => ({ ...prev, [id]: parseNum(raw) }));
  };

  const handleWholeQuantityChange = (id: number, raw: string) => {
    setWholeQuantities((prev) => ({ ...prev, [id]: parseNum(raw) }));
  };

  const wholeTotalRevenue = menuItems.reduce((sum, item) => sum + (wholeQuantities[item.id] ?? 0) * item.price, 0);

  const handleHourChange = (hour: number, field: 'revenue' | 'orders', raw: string) => {
    setHourlyByHour((prev) => ({ ...prev, [hour]: { revenue: prev[hour]?.revenue ?? 0, orders: prev[hour]?.orders ?? 0, [field]: parseNum(raw) } }));
  };

  const handleAddHour = () => {
    const h = parseInt(addHourValue, 10);
    if (isNaN(h) || h < 0 || h > 23) return;
    setExtraHours((prev) => [...prev, h]);
    setAddHourValue('');
  };

  const handleSave = async () => {
    setSaving(true);
    const menuEntries = menuItems.map((item) => ({ menuItemId: item.id, quantity: quantities[item.id] ?? 0 }));
    const wholeMenuEntries = menuItems.map((item) => ({ menuItemId: item.id, quantity: wholeQuantities[item.id] ?? 0 }));
    const hourlyEntries = hourRows.map((h) => ({
      hour: h,
      totalRevenue: hourlyByHour[h]?.revenue ?? 0,
      totalOrders: hourlyByHour[h]?.orders ?? 0,
    }));

    const results = await Promise.all([
      saveManualDailyMenuSales(popupId, selectedDate, menuEntries),
      dayRevenue > 0 || dayOrders > 0 ? saveManualSales(selectedDate, dayRevenue, dayOrders, null) : Promise.resolve<ApiResponse>({ success: true }),
      saveManualHourlySales(popupId, hourlyEntries),
      saveManualMenuSales(popupId, wholeMenuEntries),
    ]);
    setSaving(false);

    const failed = results.find((r) => !r.success);
    if (failed && !failed.success) { toast.error(`저장 실패: ${failed.error}`); return; }
    toast.success('저장됐습니다.');
    onSaved();
  };

  return (
    <AnimatePresence>
      <motion.div
        key="popup-manual-entry-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="popup-manual-entry-panel"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="bg-canvas w-full sm:max-w-[440px] rounded-t-2xl sm:rounded-xl shadow-level-2 border border-hairline overflow-hidden max-h-[90dvh] flex flex-col pb-[env(safe-area-inset-bottom)] sm:pb-0"
          ref={panelRef}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
            <div>
              <p className="text-[11px] text-ink-faint font-medium mb-0.5">매출 수기 입력</p>
              <h3 className="m-0 text-[17px] font-bold text-ink">{popupName}</h3>
            </div>
            <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-canvas-soft text-ink-faint transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="contents">
          <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-4 [scrollbar-width:thin]">

            {/* 날짜 선택 */}
            <section>
              <p className="text-[11px] text-ink-faint font-semibold uppercase tracking-wide mb-2">날짜 선택</p>
              <input
                type="date"
                value={selectedDate}
                min={startDate}
                max={endDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-hairline rounded-lg text-[13px] bg-canvas-soft text-ink outline-none focus:border-primary-700"
              />
            </section>

            {/* 날짜별 메뉴 판매 수량 */}
            <section>
              <p className="text-[11px] text-ink-faint font-semibold uppercase tracking-wide mb-2">{selectedDate} 메뉴별 판매 수량</p>
              {loadingMenu || loadingDay ? (
                <p className="text-sm text-ink-faint py-4 text-center">불러오는 중...</p>
              ) : menuItems.length === 0 ? (
                <p className="text-sm text-ink-faint py-4 text-center">등록된 메뉴가 없습니다.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {menuItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 bg-canvas-soft rounded-lg border border-hairline px-3 py-2.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-[13px] text-ink-secondary truncate">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={quantities[item.id] ? String(quantities[item.id]) : ''}
                          onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className="w-16 text-right text-[13px] font-semibold bg-transparent outline-none border-none text-ink"
                        />
                        <span className="text-[12px] text-ink-faint">개</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-ink-muted">
                    <span>메뉴 매출 합계</span>
                    <span className="font-semibold text-ink">₩{formatPrice(menuTotalRevenue)}</span>
                  </div>
                </div>
              )}
            </section>

            {/* 날짜별 순매출 */}
            <section>
              <p className="text-[11px] text-ink-faint font-semibold uppercase tracking-wide mb-2">{selectedDate} 순매출</p>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3 bg-canvas-soft rounded-lg border border-hairline px-3 py-2.5">
                  <span className="text-[13px] text-ink-secondary shrink-0">총 매출</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[12px] text-ink-faint">₩</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={dayRevenue === 0 ? '' : dayRevenue.toLocaleString('ko-KR')}
                      onChange={(e) => setDayRevenue(parseNum(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      placeholder="0"
                      className="w-28 text-right text-[13px] font-semibold bg-transparent outline-none border-none text-ink"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 bg-canvas-soft rounded-lg border border-hairline px-3 py-2.5">
                  <span className="text-[13px] text-ink-secondary shrink-0">주문 수</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={dayOrders === 0 ? '' : String(dayOrders)}
                      onChange={(e) => setDayOrders(parseNum(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      placeholder="0"
                      className="w-16 text-right text-[13px] font-semibold bg-transparent outline-none border-none text-ink"
                    />
                    <span className="text-[12px] text-ink-faint">건</span>
                  </div>
                </div>
              </div>
            </section>

            {/* 시간대별 매출 (팝업 전체 기간 공통) */}
            <section>
              <p className="text-[11px] text-ink-faint font-semibold uppercase tracking-wide mb-2">시간대별 매출 <span className="normal-case text-ink-faint">— 팝업 전체 기간 기준</span></p>
              <div className="rounded-lg border border-hairline overflow-hidden">
                <div className="flex items-center px-3 py-1.5 bg-canvas-soft text-[10px] text-ink-faint font-semibold">
                  <span className="w-10">시간</span>
                  <span className="flex-1 text-right pr-2">매출</span>
                  <span className="w-16 text-right">주문 수</span>
                </div>
                <div className="max-h-[220px] overflow-y-auto [scrollbar-width:thin]">
                  {hourRows.map((h) => (
                    <div key={h} className="flex items-center px-3 py-1.5 border-t border-hairline">
                      <span className="w-10 text-[12px] text-ink-secondary">{String(h).padStart(2, '0')}시</span>
                      <div className="flex-1 flex items-center justify-end gap-1 pr-2">
                        <span className="text-[11px] text-ink-faint">₩</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={hourlyByHour[h]?.revenue ? hourlyByHour[h].revenue.toLocaleString('ko-KR') : ''}
                          onChange={(e) => handleHourChange(h, 'revenue', e.target.value)}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className={numInputCls}
                        />
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={hourlyByHour[h]?.orders ? String(hourlyByHour[h].orders) : ''}
                        onChange={(e) => handleHourChange(h, 'orders', e.target.value)}
                        onFocus={(e) => e.target.select()}
                        placeholder="0"
                        className="w-16 text-right text-[12px] bg-transparent outline-none border-none text-ink"
                      />
                    </div>
                  ))}
                </div>
              </div>
              {availableHoursToAdd.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2">
                  <select
                    value={addHourValue}
                    onChange={(e) => setAddHourValue(e.target.value)}
                    className="flex-1 px-2 py-1.5 border border-hairline rounded-lg text-[12px] bg-canvas text-ink outline-none focus:border-primary-700"
                  >
                    <option value="">시간 추가...</option>
                    {availableHoursToAdd.map((h) => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}시</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddHour}
                    disabled={!addHourValue}
                    className="px-3 py-1.5 rounded-lg border border-hairline bg-canvas-soft text-[12px] font-semibold text-ink-muted hover:bg-canvas disabled:opacity-40 cursor-pointer"
                  >
                    추가
                  </button>
                </div>
              )}
            </section>

            {/* 상품별 매출 (팝업 전체 기간 공통) */}
            <section>
              <p className="text-[11px] text-ink-faint font-semibold uppercase tracking-wide mb-2">상품별 매출 <span className="normal-case text-ink-faint">— 팝업 전체 기간 기준</span></p>
              {loadingMenu ? (
                <p className="text-sm text-ink-faint py-4 text-center">불러오는 중...</p>
              ) : menuItems.length === 0 ? (
                <p className="text-sm text-ink-faint py-4 text-center">등록된 메뉴가 없습니다.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {menuItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 bg-canvas-soft rounded-lg border border-hairline px-3 py-2.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-[13px] text-ink-secondary truncate">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={wholeQuantities[item.id] ? String(wholeQuantities[item.id]) : ''}
                          onChange={(e) => handleWholeQuantityChange(item.id, e.target.value)}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className="w-16 text-right text-[13px] font-semibold bg-transparent outline-none border-none text-ink"
                        />
                        <span className="text-[12px] text-ink-faint">개</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-ink-muted">
                    <span>메뉴 매출 합계</span>
                    <span className="font-semibold text-ink">₩{formatPrice(wholeTotalRevenue)}</span>
                  </div>
                </div>
              )}
              <p className="m-0 mt-1.5 text-[10px] text-ink-faint leading-relaxed">날짜별로 따로 입력하지 않고 기간 전체 수량을 한 번에 입력합니다. 날짜별 입력이 있는 메뉴는 날짜별 값이 우선 반영됩니다.</p>
            </section>
          </div>

          <div className="px-4 py-3 border-t border-hairline flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-hairline bg-canvas text-[13px] font-semibold text-ink-muted hover:bg-canvas-soft transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving || loadingMenu || loadingDay}
              className="flex-1 py-2.5 rounded-lg bg-primary-700 text-white text-[13px] font-bold hover:bg-primary-800 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
