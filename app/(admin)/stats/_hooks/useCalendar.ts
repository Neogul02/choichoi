'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { fetchMonthlySalesCalendar } from '@/app/actions';
import type { CalendarSalesData } from '@/types/api';

function getInitialMonth(): Date {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  return new Date(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1);
}

export function useCalendar() {
  const [calendarMonth, setCalendarMonth] = useState<Date>(getInitialMonth);
  const [calendarSales, setCalendarSales] = useState<CalendarSalesData>({ byDate: {}, monthTotal: 0, totalOrders: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (month: Date) => {
    setIsLoading(true);
    const result = await fetchMonthlySalesCalendar(month.getFullYear(), month.getMonth() + 1);
    if (result.success && result.data) setCalendarSales(result.data);
    else if (!result.success) toast.error(`캘린더 조회 실패: ${result.error}`);
    setIsLoading(false);
  }, []);

  useEffect(() => { load(calendarMonth); }, [calendarMonth, load]);

  const changeMonth = useCallback((offset: number) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }, []);

  const refresh = useCallback(() => load(calendarMonth), [load, calendarMonth]);

  return { calendarMonth, calendarSales, isLoading, changeMonth, refresh };
}
