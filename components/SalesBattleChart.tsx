'use client';

import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART_GRID_STROKE } from '@/app/(admin)/stats/_lib/chartTheme';
import type { TodayPopupSales } from '@/types/api';

/** 영업 시간대 기본 축 — 매출이 없는 시간도 축에 남겨야 "하루 중 어디쯤인지"가 읽힌다 */
export const AXIS_FROM = 7;
export const AXIS_TO = 22;

interface Props {
  rows: TodayPopupSales[];
  currentPopupId: number | null;
  colorOf: (row: TodayPopupSales, index: number) => string;
}

const keyOf = (popupId: number) => `p${popupId}`;

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

export default function SalesBattleChart({ rows, currentPopupId, colorOf }: Props) {
  const { data, from, to } = useMemo(() => {
    const hours = rows.flatMap(r => r.hourly.map(h => h.hour));
    // 07~22를 기본 틀로 쓰되, 그 밖 시간대에 매출이 있으면 축을 넓힌다 — 데이터가 조용히 잘리면 안 된다
    const f = Math.min(AXIS_FROM, ...(hours.length ? hours : [AXIS_FROM]));
    const t = Math.max(AXIS_TO, ...(hours.length ? hours : [AXIS_TO]));
    // 마지막으로 매출이 있던 시각 이후는 선을 끊는다. 끝까지 수평으로 이으면
    // 아직 남은 영업시간이 이미 끝난 것처럼 보인다.
    const lastActive = hours.length ? Math.max(...hours) : f;

    const acc = new Map<number, number>(rows.map(r => [r.popupId, 0]));
    const byPopupHour = new Map<string, number>();
    for (const r of rows) for (const h of r.hourly) byPopupHour.set(`${r.popupId}|${h.hour}`, h.revenue);

    const out: Array<Record<string, number | null>> = [];
    for (let h = f; h <= t; h++) {
      const point: Record<string, number | null> = { hour: h };
      for (const r of rows) {
        const next = (acc.get(r.popupId) ?? 0) + (byPopupHour.get(`${r.popupId}|${h}`) ?? 0);
        acc.set(r.popupId, next);
        point[keyOf(r.popupId)] = h <= lastActive ? next : null;
      }
      out.push(point);
    }
    return { data: out, from: f, to: t };
  }, [rows]);

  const nameByKey = useMemo(
    () => new Map(rows.map(r => [keyOf(r.popupId), r.popupName])),
    [rows],
  );

  return (
    <ResponsiveContainer width="100%" height={128}>
      <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
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
        {rows.map((row, i) => (
          <Line
            key={row.popupId}
            type="monotone"
            dataKey={keyOf(row.popupId)}
            stroke={colorOf(row, i)}
            strokeWidth={row.popupId === currentPopupId ? 3 : 2}
            dot={false}
            activeDot={{ r: 3.5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
