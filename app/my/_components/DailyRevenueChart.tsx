'use client'

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

// recharts를 페이지 본 번들에서 분리하기 위한 차트 전용 컴포넌트 — my/page.tsx에서 next/dynamic으로 로드
export default function DailyRevenueChart({ daily, formatPrice }: {
  daily: { date: string; revenue: number }[]
  formatPrice: (v: number) => string
}) {
  return (
    <ResponsiveContainer width='100%' height={180}>
      <AreaChart data={daily} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id='myRevGrad' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor='var(--color-primary-700)' stopOpacity={0.25} />
            <stop offset='95%' stopColor='var(--color-primary-700)' stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray='3 3' stroke='var(--color-hairline)' vertical={false} />
        <XAxis
          dataKey='date'
          tick={{ fontSize: 10, fill: 'var(--color-ink-muted)' }}
          tickFormatter={(v) => v.slice(5)}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--color-ink-muted)' }}
          tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(v: number) => [formatPrice(v), '매출']}
          labelFormatter={(l) => l}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--color-hairline)' }}
        />
        <Area
          type='monotone'
          dataKey='revenue'
          stroke='var(--color-primary-700)'
          strokeWidth={2}
          fill='url(#myRevGrad)'
          dot={{ r: 3, fill: 'var(--color-primary-700)', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
