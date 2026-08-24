'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { fetchDailySalesByPeriod, fetchManualSalesForRange } from '@/app/actions/stats';
import { getPopupPeriod } from '@/lib/popupPeriod';
import type { DailySalesItem, ManualSalesEntry } from '@/types/api';
import type { PopupEvent } from '@/types/database';

export interface PopupComparisonRow {
  popup: PopupEvent;
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  avgDailyRevenue: number;
  totalDays: number;
  elapsedDays: number;
  status: '예정' | '진행중' | '종료';
}

function applyManualOverrides(daily: DailySalesItem[], manualEntries: ManualSalesEntry[]): DailySalesItem[] {
  if (manualEntries.length === 0) return daily;
  const manualByDate: Record<string, ManualSalesEntry> = {};
  for (const entry of manualEntries) manualByDate[entry.sale_date] = entry;
  const merged = daily.map((d) =>
    manualByDate[d.date]
      ? { date: d.date, revenue: manualByDate[d.date].total_revenue, orderCount: manualByDate[d.date].total_orders }
      : d
  );
  const existingDates = new Set(daily.map((d) => d.date));
  for (const entry of manualEntries) {
    if (!existingDates.has(entry.sale_date)) merged.push({ date: entry.sale_date, revenue: entry.total_revenue, orderCount: entry.total_orders });
  }
  return merged;
}

// 선택된 팝업들의 일별 매출을 각각 조회해 요약 지표로 집계 — PopupStatsSection의 단일 팝업 조회 파이프라인과
// 동일한 수기 입력 병합 로직을 재사용해 상세 화면과 숫자가 어긋나지 않게 한다.
export function usePopupComparison(popups: PopupEvent[]) {
  const [rows, setRows] = useState<PopupComparisonRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (popups.length === 0) { setRows([]); return; }
    setIsLoading(true);
    const results = await Promise.all(
      popups.map(async (popup) => {
        const [dailyRes, manualRes] = await Promise.all([
          fetchDailySalesByPeriod(
            new Date(`${popup.start_date}T00:00:00+09:00`).toISOString(),
            new Date(`${popup.end_date}T23:59:59.999+09:00`).toISOString(),
            String(popup.id)
          ),
          fetchManualSalesForRange(popup.start_date, popup.end_date),
        ]);
        if (!dailyRes.success) { toast.error(`${popup.name} 매출 조회 실패: ${dailyRes.error}`); return null; }
        const daily = applyManualOverrides(dailyRes.data ?? [], manualRes.success && manualRes.data ? manualRes.data : []);
        const totalRevenue = daily.reduce((s, d) => s + d.revenue, 0);
        const totalOrders = daily.reduce((s, d) => s + d.orderCount, 0);
        const period = getPopupPeriod(popup);
        const avgDailyRevenue = period.elapsedDays > 0 ? Math.round(totalRevenue / period.elapsedDays) : 0;
        const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
        return {
          popup, totalRevenue, totalOrders, avgOrderValue, avgDailyRevenue,
          totalDays: period.totalDays, elapsedDays: period.elapsedDays, status: period.status,
        } satisfies PopupComparisonRow;
      })
    );
    setRows(results.filter((r): r is PopupComparisonRow => r !== null));
    setIsLoading(false);
  }, [popups]);

  useEffect(() => { load(); }, [load]);

  return { rows, isLoading };
}
