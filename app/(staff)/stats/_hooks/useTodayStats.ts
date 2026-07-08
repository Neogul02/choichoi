'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { fetchTodaysSales, fetchTodaysOrdersWithItems, removeOrder as removeOrderAction } from '@/app/actions/orders';
import type { TodaysSales, OrderRecordWithItems } from '@/types/api';

const SUMMARY_KEY = ['today-stats-summary'];
const ORDERS_KEY = ['today-stats-orders'];

export function useTodayStats() {
  const queryClient = useQueryClient();

  const summaryQuery = useQuery<TodaysSales>({
    queryKey: SUMMARY_KEY,
    queryFn: async () => {
      const res = await fetchTodaysSales();
      if (!res.success || !res.data) throw new Error(res.error || '매출 조회 실패');
      return res.data;
    },
  });

  const ordersQuery = useQuery<OrderRecordWithItems[]>({
    queryKey: ORDERS_KEY,
    queryFn: async () => {
      const res = await fetchTodaysOrdersWithItems();
      if (!res.success || !res.data) throw new Error(res.error || '주문 조회 실패');
      return res.data;
    },
  });

  useEffect(() => {
    if (summaryQuery.error) toast.error(`매출 조회 실패: ${(summaryQuery.error as Error).message}`);
  }, [summaryQuery.error]);

  useEffect(() => {
    if (ordersQuery.error) toast.error(`주문 조회 실패: ${(ordersQuery.error as Error).message}`);
  }, [ordersQuery.error]);

  useEffect(() => {
    const channel = supabase
      .channel(`stats-today-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
        queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
    queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
  };

  const handleDeleteOrder = async (id: number) => {
    const result = await removeOrderAction(id);
    if (result.success) {
      toast.success('주문이 삭제되었습니다.');
      refresh();
    } else {
      toast.error(`삭제 실패: ${result.error}`);
    }
  };

  return {
    summary: summaryQuery.data ?? { totalOrders: 0, totalRevenue: 0 },
    todayOrders: ordersQuery.data ?? [],
    isLoading: summaryQuery.isFetching || ordersQuery.isFetching,
    refresh,
    handleDeleteOrder,
  };
}
