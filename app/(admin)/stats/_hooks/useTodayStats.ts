'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { fetchTodaysSales, fetchTodaysOrdersWithItems, removeOrder as removeOrderAction } from '@/app/actions/orders';
import type { TodaysSales, OrderRecordWithItems } from '@/types/api';

export function useTodayStats() {
  const [summary, setSummary] = useState<TodaysSales>({ totalOrders: 0, totalRevenue: 0 });
  const [todayOrders, setTodayOrders] = useState<OrderRecordWithItems[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [summaryRes, ordersRes] = await Promise.all([
      fetchTodaysSales(),
      fetchTodaysOrdersWithItems(),
    ]);
    if (summaryRes.success && summaryRes.data) setSummary(summaryRes.data);
    else if (!summaryRes.success) toast.error(`매출 조회 실패: ${summaryRes.error}`);
    if (ordersRes.success && ordersRes.data) setTodayOrders(ordersRes.data);
    else if (!ordersRes.success) toast.error(`주문 조회 실패: ${ordersRes.error}`);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`stats-today-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const handleDeleteOrder = useCallback(async (id: number) => {
    const result = await removeOrderAction(id);
    if (result.success) {
      toast.success('주문이 삭제되었습니다.');
      load();
    } else {
      toast.error(`삭제 실패: ${result.error}`);
    }
  }, [load]);

  return { summary, todayOrders, isLoading, refresh: load, handleDeleteOrder };
}
