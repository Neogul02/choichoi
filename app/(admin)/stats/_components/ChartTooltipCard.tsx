'use client';

/** 통계탭 모든 차트 커스텀 툴팁이 공유하는 카드 껍데기 — 내용만 children으로 채운다 */
export default function ChartTooltipCard({ children, minWidth }: { children: React.ReactNode; minWidth?: number }) {
  return (
    <div
      className="rounded-xl border border-hairline bg-canvas px-3 py-2 shadow-level-2 text-xs"
      style={minWidth ? { minWidth } : undefined}
    >
      {children}
    </div>
  );
}
