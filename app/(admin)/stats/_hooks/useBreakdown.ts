'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { fetchMenuSalesBreakdown } from '@/app/actions/stats';
import { getPeriodBounds } from '../_lib/period';
import type { Period } from '../_lib/period';
import type { MenuSalesItem } from '@/types/api';

export function useBreakdown() {
  const [period, setPeriod] = useState<Period>('today');
  const [breakdown, setBreakdown] = useState<MenuSalesItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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

  useEffect(() => { load(period); }, [period, load]);

  const periodBounds = getPeriodBounds(period);

  return {
    breakdown,
    period,
    isLoading,
    periodLabel: periodBounds.label,
    setPeriod,
  };
}
