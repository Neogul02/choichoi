'use client';

import type { Tier } from '@/lib/tiers';
import { getTier } from '@/lib/tiers';
import type { TodaysSales } from '@/types/api';

interface Props {
  summary: TodaysSales;
  isLoading: boolean;
  onRefresh: () => void;
}

function TierEmblem({ lv, size = 14 }: { lv: number; size?: number }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: 2,
    strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const,
  };
  if (lv === 1) return <svg {...common}><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z"/></svg>;
  if (lv === 2) return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="2" transform="rotate(45 12 12)"/></svg>;
  if (lv === 3) return <svg {...common}><polygon points="12,3 21,9 17.5,20 6.5,20 3,9"/></svg>;
  if (lv === 4) return <svg {...common}><polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5"/></svg>;
  if (lv === 5) return <svg {...common}><polygon points="12,2 22,12 12,22 2,12"/></svg>;
  if (lv === 6) return <svg {...common}><path d="M12 2l2.5 7.5H22l-6.2 4.5 2.4 7.5L12 17l-6.2 4.5 2.4-7.5L2 9.5h7.5z"/></svg>;
  return <svg {...common}><path d="M3 18l2-10 5 5 2-9 2 9 5-5 2 10z"/></svg>;
}

export default function TodaySummary({ summary, isLoading, onRefresh }: Props) {
  const { tier, next } = getTier(summary.totalRevenue);
  const prevThreshold = tier ? tier.threshold : 0;
  const nextThreshold = next ? next.threshold : prevThreshold;
  const progressPct = next
    ? Math.min(100, ((summary.totalRevenue - prevThreshold) / (nextThreshold - prevThreshold)) * 100)
    : 100;

  if (!tier) {
    return (
      <div className="rounded-2xl p-5 md:p-6 bg-white border border-[#e5e5e5] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="m-0 text-[11px] font-bold tracking-[0.12em] uppercase text-primary-600">오늘 매출</p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="text-[11px] text-[#888] hover:text-primary-700 font-semibold disabled:opacity-50"
          >
            {isLoading ? '...' : '새로고침'}
          </button>
        </div>
        <div className="text-[clamp(34px,9vw,64px)] font-black leading-none text-primary-700 tabular-nums">
          ₩{summary.totalRevenue.toLocaleString('ko-KR')}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-[#666] font-semibold">{summary.totalOrders}건</span>
          <span className="text-xs text-[#999]">₩50,000 달성 시 BRONZE 랭크</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-2xl p-5 md:p-6 overflow-hidden text-white transition-all duration-500"
      style={{ background: tier.bg, boxShadow: tier.shadow }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
      <div className="absolute -bottom-8 -right-8 w-40 h-40 rounded-full bg-white/5 pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <div
            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/25"
            style={{ color: tier.accent }}
          >
            <TierEmblem lv={tier.lv} size={14} />
            <span className="text-[11px] font-black tracking-[0.12em]">
              {tier.name} · LV {tier.lv}
            </span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/20 disabled:opacity-50 transition"
            style={{ color: tier.accent }}
          >
            {isLoading ? '...' : '새로고침'}
          </button>
        </div>

        <p className="m-0 text-[11px] font-bold tracking-[0.12em] uppercase mb-1.5" style={{ color: tier.labelText }}>
          오늘 매출
        </p>
        <div className="text-[clamp(36px,9.5vw,68px)] font-black leading-none tabular-nums">
          ₩{summary.totalRevenue.toLocaleString('ko-KR')}
        </div>

        <div className="mt-4 md:mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 items-center">
          <div>
            <div className="text-[10px] md:text-[11px] font-bold tracking-wider uppercase mb-0.5" style={{ color: tier.labelText }}>주문 수</div>
            <div className="text-base md:text-lg font-black tabular-nums">{summary.totalOrders}건</div>
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[10px] md:text-[11px] font-bold tracking-wider uppercase" style={{ color: tier.labelText }}>
                {next ? `${next.name}까지` : '최고 랭크'}
              </span>
              <span className="text-[11px] md:text-xs font-bold tabular-nums" style={{ color: tier.mute }}>
                {next
                  ? `₩${(next.threshold - summary.totalRevenue).toLocaleString('ko-KR')} 남음`
                  : '도달 ✨'}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-white/20">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  background: tier.lv === 7
                    ? 'linear-gradient(90deg,#fde68a,#f59e0b)'
                    : '#fff',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
