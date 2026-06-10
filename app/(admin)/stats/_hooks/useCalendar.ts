'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { fetchMonthlySalesCalendar, fetchManualSalesForMonth, saveManualSales, removeManualSales } from '@/app/actions/stats';
import type { CalendarSalesData, ManualSalesEntry } from '@/types/api';

function getInitialMonth(): Date {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  return new Date(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1);
}

const EMPTY: CalendarSalesData = { byDate: {}, monthTotal: 0, totalOrders: 0, manualByDate: {} };

export function useCalendar() {
  const [calendarMonth, setCalendarMonth] = useState<Date>(getInitialMonth);
  const [calendarSales, setCalendarSales] = useState<CalendarSalesData>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (month: Date) => {
    setIsLoading(true);
    const [calResult, manualResult] = await Promise.all([
      fetchMonthlySalesCalendar(month.getFullYear(), month.getMonth() + 1),
      fetchManualSalesForMonth(month.getFullYear(), month.getMonth() + 1),
    ]);
    if (!calResult.success) { toast.error(`캘린더 조회 실패: ${calResult.error}`); setIsLoading(false); return; }
    const manualByDate: Record<string, ManualSalesEntry> = {};
    if (manualResult.success && manualResult.data) {
      for (const entry of manualResult.data) manualByDate[entry.sale_date] = entry;
    }
    setCalendarSales({ ...(calResult.data ?? EMPTY), manualByDate });
    setIsLoading(false);
  }, []);

  useEffect(() => { load(calendarMonth); }, [calendarMonth, load]);

  const changeMonth = useCallback((offset: number) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }, []);

  const refresh = useCallback(() => load(calendarMonth), [load, calendarMonth]);

  const saveDay = useCallback(async (date: string, revenue: number, orders: number, note: string | null) => {
    const result = await saveManualSales(date, revenue, orders, note);
    if (!result.success) { toast.error(`저장 실패: ${result.error}`); return false; }
    toast.success('저장됐습니다.');
    await load(calendarMonth);
    return true;
  }, [calendarMonth, load]);

  const removeDay = useCallback(async (id: number) => {
    const result = await removeManualSales(id);
    if (!result.success) { toast.error(`삭제 실패: ${result.error}`); return; }
    toast.success('삭제됐습니다.');
    await load(calendarMonth);
  }, [calendarMonth, load]);

  return { calendarMonth, calendarSales, isLoading, changeMonth, refresh, saveDay, removeDay };
}
