'use client';

import { formatPrice } from '@/lib/utils';
import type { TodaysSales } from '@/types/api';

interface Props {
  summary: TodaysSales;
  isLoading: boolean;
  onRefresh: () => void;
}

export default function TodaySummary({ summary, isLoading, onRefresh }: Props) {
  return (
    <div className="mb-4 md:mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="m-0 text-lg font-bold">오늘 매출 요약</h3>
        <button
          className="border-none bg-primary-700 text-white rounded-lg px-3 py-2 text-[13px] font-semibold cursor-pointer transition hover:bg-primary-800 disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={onRefresh}
          disabled={isLoading}
        >
          {isLoading ? '불러오는 중...' : '새로고침'}
        </button>
      </div>
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 bg-[#f9f9f9] rounded-xl p-3.5 md:p-4 border border-[#eee] flex flex-col gap-1">
          <span className="text-[13px] text-[#666] font-semibold">총 주문</span>
          <strong className="text-2xl font-extrabold text-[#161616]">{summary.totalOrders}건</strong>
        </div>
        <div className="flex-1 bg-primary-50 rounded-xl p-3.5 md:p-4 border border-primary-700 flex flex-col gap-1">
          <span className="text-[13px] text-[#666] font-semibold">총 매출</span>
          <strong className="text-2xl font-extrabold text-primary-700">₩{formatPrice(summary.totalRevenue)}</strong>
        </div>
      </div>
    </div>
  );
}
