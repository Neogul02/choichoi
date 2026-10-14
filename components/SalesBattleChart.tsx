'use client';

import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART_GRID_STROKE } from '@/app/(admin)/stats/_lib/chartTheme';
import { buildSalesCurve, curveKeyOf, REFERENCE_KEY } from '@/lib/salesCurve';
import type { TodayPopupSales } from '@/types/api';

interface Props {
  rows: TodayPopupSales[];
  currentPopupId: number | null;
  colorOf: (row: TodayPopupSales, index: number) => string;
  /**
   * 뒤에 겹쳐 그릴 기준 곡선(통계탭의 "어제"). 시간대별 매출을 주면 누적은 여기서 만든다 —
   * 오늘 곡선과 같은 누적 규칙을 써야 두 선을 같은 눈으로 비교할 수 있다.
   */
  reference?: { label: string; hourly: { hour: number; revenue: number }[] } | null;
}

const REFERENCE_COLOR = '#b4b0aa';

interface BattleTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ dataKey?: string | number; value?: number | null; color?: string }>;
  nameByKey?: Map<string, string>;
}

/** 1,234,500 → 123만 */
function shortWon(n: number): string {
  if (n < 10000) return `₩${n.toLocaleString('ko-KR')}`;
  return `${Math.round(n / 10000).toLocaleString('ko-KR')}만`;
}

// recharts v3의 TooltipContentProps는 모든 필드를 필수로 요구해 <Tooltip content={<X/>}/>에
// 그대로 못 쓴다. 통계탭(HourlySalesSection)과 같이 필요한 필드만 옵셔널로 정의해 쓴다.
// 컴포넌트 밖에 두는 이유는 렌더마다 새 컴포넌트 정체성이 생기는 걸 막기 위함(react-hooks/static-components).
function BattleTooltip({ active, payload, label, nameByKey }: BattleTooltipProps) {
  if (!active || !payload?.length || !nameByKey) return null;
  const sorted = [...payload].sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0));
  return (
    <div className="rounded-lg border border-hairline bg-canvas px-2.5 py-1.5 shadow-level-2">
      <p className="m-0 mb-1 text-[10px] font-bold text-ink-faint">{label}시 누적</p>
      {sorted.map(p => (
        <p key={String(p.dataKey)} className="m-0 flex items-center gap-1.5 text-[11px] leading-snug">
          <span className="h-[3px] w-[10px] rounded-full" style={{ backgroundColor: p.color }} />
          <span className="font-semibold text-ink-secondary">{nameByKey.get(String(p.dataKey))}</span>
          <span className="ml-auto pl-2 font-bold tabular-nums text-ink">{shortWon(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

interface LeadDotProps {
  cx?: number;
  cy?: number;
  index?: number;
  /** 이 선의 마지막 값이 찍힌 지점 — 여기서만 빛이 켜진다 */
  leadIndex: number;
  color: string;
  emphasis: boolean;
}

/**
 * 곡선 선두에서 숨쉬는 빛. 주식 호가창의 "지금 값" 표시처럼, 선이 어디까지 그려졌는지를
 * 가만히 보고 있어도 알게 하는 장치다.
 *
 * recharts의 dot 렌더러는 모든 지점에 대해 호출되므로 선두가 아니면 null을 돌려준다.
 * (null이 아니라 빈 <g/>를 돌려주면 지점마다 빈 노드가 쌓인다.)
 */
function LeadDot({ cx, cy, index, leadIndex, color, emphasis }: LeadDotProps) {
  if (cx == null || cy == null || index !== leadIndex) return null;
  return (
    <g>
      {/* 퍼져나가는 테두리 — 커지며 사라진다.
          non-scaling-stroke가 없으면 scale에 선 굵기까지 딸려 커져서 번지는 대신 두꺼워진다 */}
      <circle
        className="sales-pulse-halo"
        cx={cx} cy={cy} r={3}
        fill="none" stroke={color} strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      {/* 번져 보이게 하는 고정 후광 */}
      <circle cx={cx} cy={cy} r={emphasis ? 6 : 5} fill={color} opacity={0.18} />
      {/* 심지 */}
      <circle className="sales-pulse-core" cx={cx} cy={cy} r={emphasis ? 3.2 : 2.6} fill={color} />
      <circle cx={cx} cy={cy} r={emphasis ? 1.3 : 1} fill="#fff" opacity={0.9} />
    </g>
  );
}

export default function SalesBattleChart({ rows, currentPopupId, colorOf, reference }: Props) {
  const { data, from, to, leadIndexByKey } = useMemo(
    () => buildSalesCurve(rows, reference),
    [rows, reference],
  );

  const nameByKey = useMemo(() => {
    const m = new Map(rows.map(r => [curveKeyOf(r.popupId), r.popupName]));
    if (reference) m.set(REFERENCE_KEY, reference.label);
    return m;
  }, [rows, reference]);

  return (
    <ResponsiveContainer width="100%" height={128}>
      {/* 위·오른쪽 여백은 선두 글로우(최대 반지름 11px)가 잘리지 않을 만큼 둔다 —
          1등 선의 선두 점은 항상 Y축 최댓값, 즉 그래프 천장에 붙는다 */}
      <LineChart data={data} margin={{ top: 13, right: 12, bottom: 0, left: 6 }}>
        <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="hour"
          type="number"
          domain={[from, to]}
          ticks={Array.from({ length: to - from + 1 }, (_, i) => from + i)}
          interval={0}
          tick={{ fontSize: 9, fill: 'var(--color-ink-faint)' }}
          tickFormatter={(h: number) => String(h)}
          axisLine={false}
          tickLine={false}
          padding={{ left: 2, right: 2 }}
        />
        {/* 금액 축은 숨긴다 — 칸이 작고, 정확한 값은 툴팁과 아래 범례가 책임진다 */}
        <YAxis hide domain={[0, 'dataMax']} />
        <Tooltip
          content={<BattleTooltip nameByKey={nameByKey} />}
          cursor={{ stroke: 'var(--color-ink-faint)', strokeWidth: 1, strokeDasharray: '4 2' }}
        />
        {/* 기준 곡선을 먼저 그려 오늘 곡선 뒤에 깔린다 */}
        {reference && reference.hourly.length > 0 && (
          <Line
            key={REFERENCE_KEY}
            type="monotone"
            dataKey={REFERENCE_KEY}
            stroke={REFERENCE_COLOR}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={
              leadIndexByKey[REFERENCE_KEY] != null
                ? <LeadDot leadIndex={leadIndexByKey[REFERENCE_KEY]} color={REFERENCE_COLOR} emphasis={false} />
                : false
            }
            activeDot={{ r: 3 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        )}
        {rows.map((row, i) => {
          const key = curveKeyOf(row.popupId);
          const lead = leadIndexByKey[key];
          const color = colorOf(row, i);
          return (
            <Line
              key={row.popupId}
              type="monotone"
              dataKey={key}
              stroke={color}
              strokeWidth={row.popupId === currentPopupId ? 3 : 2}
              // 선두에서만 빛나는 점 — 나머지 지점은 그리지 않는다
              dot={
                lead != null
                  ? <LeadDot leadIndex={lead} color={color} emphasis={row.popupId === currentPopupId} />
                  : false
              }
              activeDot={{ r: 3.5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}
