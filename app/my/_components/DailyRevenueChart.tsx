'use client'

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

type DailyPoint = { date: string; revenue: number; orders: number }

// recharts를 페이지 본 번들에서 분리하기 위한 차트 전용 컴포넌트 — my/page.tsx에서 next/dynamic으로 로드
export default function DailyRevenueChart({ daily, formatPrice, metric, height = 200 }: {
  daily: DailyPoint[]
  formatPrice: (v: number) => string
  metric: 'revenue' | 'orders'
  height?: number
}) {
  const dataKey = metric
  const color = metric === 'revenue' ? 'var(--color-primary-700)' : 'var(--color-gold)'
  const gradId = metric === 'revenue' ? 'myRevGrad' : 'myOrdersGrad'

  return (
    <ResponsiveContainer width='100%' height={height}>
      <AreaChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor={color} stopOpacity={0.25} />
            <stop offset='95%' stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray='3 3' stroke='var(--color-hairline)' vertical={false} />
        <XAxis
          dataKey='date'
          tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }}
          tickFormatter={(v) => v.slice(5)}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }}
          tickFormatter={(v) => (metric === 'revenue' ? `${(v / 10000).toFixed(0)}만` : `${v}`)}
          axisLine={false}
          tickLine={false}
          width={46}
        />
        <Tooltip
          cursor={{ stroke: 'var(--color-ink-faint)', strokeDasharray: '3 3' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const v = payload[0].value as number
            return (
              <div className='rounded-xl border border-hairline bg-canvas px-3 py-2 shadow-level-2'>
                <p className='m-0 text-[11px] text-ink-faint'>{label}</p>
                <p className='m-0 text-caption font-bold text-ink'>
                  {metric === 'revenue' ? formatPrice(v) : `${v}건`}
                </p>
              </div>
            )
          }}
        />
        <Area
          type='monotone'
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradId})`}
          dot={false}
          activeDot={{ r: 5, fill: color, strokeWidth: 2, stroke: 'var(--color-canvas)' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
