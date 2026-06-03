'use client';

import { useState } from 'react';
import { fetchAISalesAnalysis } from '@/app/actions/ai';
import { fetchMenuSalesBreakdown } from '@/app/actions/stats';
import { formatPrice } from '@/lib/utils';
import { buildHourlyData } from '../_lib/hourly';
import { getPeriodBounds } from '../_lib/period';
import type { TodaysSales, OrderRecordWithItems } from '@/types/api';

interface Props {
  summary: TodaysSales;
  todayOrders: OrderRecordWithItems[];
}

export default function AIAnalysisSection({ summary, todayOrders }: Props) {
  const [analysis, setAnalysis] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    setIsLoading(true);
    setError('');
    setAnalysis('');

    const hourlyData = buildHourlyData(todayOrders);

    const { startISO, endISO } = getPeriodBounds('today');
    const menuRes = await fetchMenuSalesBreakdown(startISO, endISO);
    const menuBreakdown = menuRes.success && menuRes.data ? menuRes.data : [];

    const result = await fetchAISalesAnalysis({
      totalRevenue: summary.totalRevenue,
      totalOrders: summary.totalOrders,
      hourlyData,
      menuBreakdown: menuBreakdown.map((m) => ({
        name: m.name,
        totalQuantity: m.totalQuantity,
        totalRevenue: m.totalRevenue,
      })),
    });

    if (result.success && result.data) {
      setAnalysis(result.data);
    } else {
      setError(result.error ?? '분석 중 오류가 발생했습니다.');
    }
    setIsLoading(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="m-0 text-lg font-bold">AI 매출 분석</h3>
          <p className="m-0 text-xs text-[#aaa] mt-0.5">Gemini · 오늘 데이터 기반</p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="cursor-pointer flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-semibold shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              분석 중...
            </>
          ) : (
            <>✨ 분석하기</>
          )}
        </button>
      </div>

      {summary.totalOrders === 0 && !analysis && (
        <p className="text-sm text-[#aaa]">오늘 판매 데이터가 없습니다.</p>
      )}

      {!analysis && !isLoading && summary.totalOrders > 0 && (
        <div className="rounded-xl border border-dashed border-[#ddd] p-4 text-center text-sm text-[#bbb]">
          버튼을 눌러 오늘 매출을 AI가 분석해드립니다
        </div>
      )}

      {isLoading && (
        <div className="rounded-xl bg-[#f8f7ff] border border-[#e8e5ff] p-4 text-sm text-[#888] animate-pulse">
          AI가 오늘의 매출 데이터를 분석하고 있습니다...
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {analysis && (
        <div className="rounded-xl bg-gradient-to-br from-[#f8f7ff] to-[#f0f4ff] border border-[#e2dcff] p-4">
          <p className="text-sm leading-relaxed text-[#333] whitespace-pre-wrap">{analysis}</p>
          <p className="mt-3 text-[11px] text-[#bbb] text-right">
            총 매출 ₩{formatPrice(summary.totalRevenue)} · {summary.totalOrders}건
          </p>
        </div>
      )}
    </div>
  );
}
