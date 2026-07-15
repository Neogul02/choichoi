'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { fetchMenuSalesBreakdown } from '@/app/actions/stats';
import { getPeriodBounds } from '../_lib/period';
import type { Period } from '../_lib/period';
import type { MenuSalesItem } from '@/types/api';

// initialBreakdown: 서버 컴포넌트가 '오늘' 기간으로 프리페치한 데이터 — 있으면 마운트 직후 재조회를 건너뛴다
export function useBreakdown(initialBreakdown?: MenuSalesItem[] | null) {
  const [period, setPeriod] = useState<Period>('today');
  const [breakdown, setBreakdown] = useState<MenuSalesItem[]>(initialBreakdown ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const skipFirstLoad = useRef(initialBreakdown != null);

  const load = useCallback(async (p: Period) => {
    setIsLoading(true);
    const { startISO, endISO } = getPeriodBounds(p);
    const result = await fetchMenuSalesBreakdown(startISO, endISO);
    if (result.success && result.data) {
      setBreakdown(result.data);
    } else {
      setBreakdown([]);
      if (!result.success) toast.error(`메뉴 판매 조회 실패: ${result.error}`);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (skipFirstLoad.current) { skipFirstLoad.current = false; return; }
    load(period);
  }, [period, load]);

  const periodBounds = getPeriodBounds(period);

  return {
    breakdown,
    period,
    isLoading,
    periodLabel: periodBounds.label,
    setPeriod,
  };
}
