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
      // created_at은 timestamp without time zone(naive UTC) 컬럼 — +09:00 오프셋 문자열을 그대로 보내면
      // PostgREST가 오프셋을 버리고 캐스팅해 9시간이 어긋난다. UTC로 직접 환산해 보낸다.
      const startISO = new Date(`${popup.start_date}T00:00:00+09:00`).toISOString();
      const endISO = new Date(`${popup.end_date}T23:59:59.999+09:00`).toISOString();
      const [menuRes, dailyRes, rawRes] = await Promise.all([
        fetchMenuSalesBreakdown(startISO, endISO, String(selectedPopupId)),
        fetchDailySalesByPeriod(startISO, endISO, String(selectedPopupId)),
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
