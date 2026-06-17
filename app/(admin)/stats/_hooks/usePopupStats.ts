'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { fetchPopupEvents } from '@/app/actions/schedule';
import { fetchMenuSalesBreakdown, fetchDailySalesByPeriod } from '@/app/actions/stats';
import { fetchOrdersByPeriod } from '@/app/actions/orders';
import type { MenuSalesItem, DailySalesItem } from '@/types/api';
import type { PopupEvent } from '@/types/database';

export function usePopupStats() {
  const [popupEvents, setPopupEvents] = useState<PopupEvent[]>([]);
  const [selectedPopupId, setSelectedPopupId] = useState<number | null>(null);
  const [popupMenuBreakdown, setPopupMenuBreakdown] = useState<MenuSalesItem[]>([]);
  const [popupDailySales, setPopupDailySales] = useState<DailySalesItem[]>([]);
  const [popupRawOrders, setPopupRawOrders] = useState<Array<{ created_at: string; total_price: number }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchPopupEvents().then((res) => {
      if (res.success && res.data) setPopupEvents(res.data);
      else if (!res.success) toast.error(`팝업 이벤트 조회 실패: ${res.error}`);
    });
  }, []);

  useEffect(() => {
    let isCurrent = true;

    const doFetch = async () => {
      if (!selectedPopupId) return;
      const popup = popupEvents.find((p) => p.id === selectedPopupId);
      if (!popup) return;
      setIsLoading(true);
      const startISO = `${popup.start_date}T00:00:00+09:00`;
      const endISO = `${popup.end_date}T23:59:59+09:00`;
      const [menuRes, dailyRes, rawRes] = await Promise.all([
        fetchMenuSalesBreakdown(startISO, endISO),
        fetchDailySalesByPeriod(startISO, endISO),
        fetchOrdersByPeriod(startISO, endISO, String(selectedPopupId)),
      ]);
      if (!isCurrent) return;
      if (menuRes.success && menuRes.data) setPopupMenuBreakdown(menuRes.data);
      else { setPopupMenuBreakdown([]); if (!menuRes.success) toast.error(`팝업 메뉴 조회 실패: ${menuRes.error}`); }
      if (dailyRes.success && dailyRes.data) setPopupDailySales(dailyRes.data);
      else { setPopupDailySales([]); if (!dailyRes.success) toast.error(`팝업 일별 조회 실패: ${dailyRes.error}`); }
      setPopupRawOrders(rawRes.success && rawRes.data ? rawRes.data : []);
      setIsLoading(false);
    };

    doFetch();
    return () => { isCurrent = false; };
  }, [selectedPopupId, popupEvents]);

  return {
    popupEvents,
    selectedPopupId,
    setSelectedPopupId,
    popupMenuBreakdown,
    popupDailySales,
    popupRawOrders,
    isLoading,
  };
}
