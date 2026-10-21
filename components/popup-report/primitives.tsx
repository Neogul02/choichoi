'use client'

import { Svg, Rect, Circle, Line, Polyline, Path, G, Text, View } from '@react-pdf/renderer'
import type React from 'react'
import { AMBER, BORDER, F, INK, INK_FAINT, INK_MUTED, mixHex, s } from './theme'

// @react-pdf/renderer의 SVG Text 타입 선언에는 fontSize/fontFamily/fontWeight가 빠져 있지만
// 레이아웃 엔진은 런타임에 해당 prop을 그대로 읽는다 — 라벨 전용으로 타입만 보강한 얇은 래퍼
export function ChartLabel(props: {
  x: number
  y: number
  fontSize: number
  textAnchor: 'start' | 'middle' | 'end'
  fill: string
  fontWeight?: number
  children: React.ReactNode
}) {
  const svgTextProps = { fontFamily: F, fontWeight: 500, ...props } as unknown as React.ComponentProps<typeof Text>
  return <Text {...svgTextProps} />
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/** 축 라벨 하나가 차지하는 대략적인 폭 — 라벨 간격을 데이터 개수가 아니라 실제 폭으로 정한다 */
function labelStrideFor(slotW: number, labelW: number) {
  return slotW >= labelW ? 1 : Math.ceil(labelW / Math.max(slotW, 0.1))
}

export interface BarDatum { label: string; value: number; color: string }

export function BarChart({
  data, width, height, formatValue, refValue, refLabel, showValues = true,
}: {
  data: BarDatum[]
  width: number
  height: number
  formatValue: (v: number) => string
  /** 가로 점선 기준선(평균 등) */
  refValue?: number
  refLabel?: string
  showValues?: boolean
}) {
  const padTop = 14
  const padBottom = 14
  const chartH = height - padTop - padBottom
  const max = Math.max(...data.map((d) => d.value), refValue ?? 0, 1)
  const gap = data.length > 20 ? 1.5 : data.length > 10 ? 3 : 5
  const barW = data.length > 0 ? (width - gap * (data.length - 1)) / data.length : 0
  const fontSize = width < 300 ? 7 : 7.5
  const stride = labelStrideFor(barW + gap, fontSize * 3.6)
  // 값 라벨은 막대 폭이 라벨보다 좁으면 서로 겹친다 — 그때는 생략하고 기준선·축으로만 읽게 한다
  const valuesFit = showValues && barW >= fontSize * 3.2
  const yOf = (v: number) => height - padBottom - (v / max) * chartH

  return (
    <Svg width={width} height={height}>
      <Line x1={0} y1={height - padBottom} x2={width} y2={height - padBottom} stroke={BORDER} strokeWidth={0.75} />
      {data.map((d, i) => {
        const h = max > 0 ? (d.value / max) * chartH : 0
        const x = i * (barW + gap)
        const y = height - padBottom - h
        return (
          <G key={i}>
            <Rect x={x} y={y} width={Math.max(barW, 0.5)} height={Math.max(h, 0.5)} fill={d.color} rx={Math.min(2, barW / 3)} />
            {d.value > 0 && valuesFit && (
              <ChartLabel x={x + barW / 2} y={y - 3} fontSize={fontSize - 0.5} fontWeight={700} textAnchor="middle" fill={INK}>
                {formatValue(d.value)}
              </ChartLabel>
            )}
            {i % stride === 0 && (
              <ChartLabel x={x + barW / 2} y={height - 3} fontSize={fontSize} fontWeight={500} textAnchor="middle" fill={INK_MUTED}>
                {d.label}
              </ChartLabel>
            )}
          </G>
        )
      })}
      {refValue !== undefined && refValue > 0 && (
        <G>
          <Line x1={0} y1={yOf(refValue)} x2={width} y2={yOf(refValue)} stroke={AMBER} strokeWidth={1} strokeDasharray="3 2" />
          {refLabel && (
            <ChartLabel x={width} y={yOf(refValue) - 3} fontSize={6.5} fontWeight={700} textAnchor="end" fill={AMBER}>
              {refLabel}
            </ChartLabel>
          )}
        </G>
      )}
    </Svg>
  )
}

export function LineChart({
  values, refValues, refValue, refLabel, labels, width, height, color, refColor, formatValue,
}: {
  values: number[]
  /** 점선 비교 계열(페이스 등) */
  refValues?: number[]
  /** 가로 점선 기준선(평균 등) */
  refValue?: number
  refLabel?: string
  labels: string[]
  width: number
  height: number
  color: string
  refColor?: string
  /** 마지막 점에 값 라벨을 붙일 때 */
  formatValue?: (v: number) => string
}) {
  const padTop = 14
  const padBottom = 14
  const padX = 4
  const chartH = height - padTop - padBottom
  const innerW = width - padX * 2
  const all = [...values, ...(refValues ?? []), refValue ?? 0]
  const max = Math.max(...all, 1)
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0
  const pt = (v: number, i: number): [number, number] => [padX + i * stepX, padTop + chartH - (v / max) * chartH]
  const toPoints = (arr: number[]) => arr.map((v, i) => pt(v, i).join(',')).join(' ')
  const fontSize = width < 300 ? 7 : 7.5
  const stride = labelStrideFor(stepX, fontSize * 3.6)
  const last = values.length - 1

  return (
    <Svg width={width} height={height}>
      <Line x1={0} y1={padTop + chartH} x2={width} y2={padTop + chartH} stroke={BORDER} strokeWidth={0.75} />
      {refValue !== undefined && refValue > 0 && (
        <G>
          <Line x1={0} y1={pt(refValue, 0)[1]} x2={width} y2={pt(refValue, 0)[1]} stroke={refColor ?? AMBER} strokeWidth={1} strokeDasharray="3 2" />
          {refLabel && (
            <ChartLabel x={width} y={pt(refValue, 0)[1] - 3} fontSize={6.5} fontWeight={700} textAnchor="end" fill={refColor ?? AMBER}>
              {refLabel}
            </ChartLabel>
          )}
        </G>
      )}
      {refValues && <Polyline points={toPoints(refValues)} stroke={refColor ?? AMBER} strokeWidth={1.2} strokeDasharray="4 3" fill="none" />}
      {values.length > 1 && <Polyline points={toPoints(values)} stroke={color} strokeWidth={2} fill="none" />}
      {values.map((v, i) => {
        const [x, y] = pt(v, i)
        return <Circle key={i} cx={x} cy={y} r={values.length > 30 ? 1.3 : 1.9} fill={color} />
      })}
      {formatValue && last >= 0 && (
        <ChartLabel x={Math.min(pt(values[last], last)[0], width - 2)} y={pt(values[last], last)[1] - 5} fontSize={fontSize - 0.5} fontWeight={700} textAnchor="end" fill={color}>
          {formatValue(values[last])}
        </ChartLabel>
      )}
      {labels.map((l, i) => {
        if (i % stride !== 0) return null
        return (
          <ChartLabel key={i} x={padX + i * stepX} y={height - 3} fontSize={fontSize} fontWeight={500} textAnchor="middle" fill={INK_MUTED}>
            {l}
          </ChartLabel>
        )
      })}
    </Svg>
  )
}

/** 표지용 미니 추이선 — 축 없이 최고·최저 점만 강조. 최저 점은 판매가 있던 날 중에서 고른다(KPI '최저 매출일'과 일치) */
export function Sparkline({ values, width, height, color }: { values: number[]; width: number; height: number; color: string }) {
  if (values.length === 0) return null
  const pad = 4
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const range = Math.max(max - min, 1)
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0
  const pt = (v: number, i: number): [number, number] => [pad + i * stepX, pad + (height - pad * 2) * (1 - (v - min) / range)]
  const maxIdx = values.indexOf(max)
  const positive = values.filter((v) => v > 0)
  const minSold = positive.length > 0 ? Math.min(...positive) : min
  const minIdx = values.indexOf(minSold)
  const area = `M ${pt(values[0], 0).join(' ')} ${values.map((v, i) => `L ${pt(v, i).join(' ')}`).join(' ')} L ${pt(values[values.length - 1], values.length - 1)[0]} ${height} L ${pad} ${height} Z`
  return (
    <Svg width={width} height={height}>
      {values.length > 1 && <Path d={area} fill="#eaf6f0" />}
      {values.length > 1 && <Polyline points={values.map((v, i) => pt(v, i).join(',')).join(' ')} stroke={color} strokeWidth={1.5} fill="none" />}
      <Circle cx={pt(max, maxIdx)[0]} cy={pt(max, maxIdx)[1]} r={2.6} fill={color} />
      {minIdx !== maxIdx && <Circle cx={pt(minSold, minIdx)[0]} cy={pt(minSold, minIdx)[1]} r={2.6} fill="#e34948" />}
    </Svg>
  )
}

// stroke-dasharray/dashoffset로 원호를 나누는 방식은 react-pdf의 SVG 백엔드에서 어긋나게 렌더되어
// (세그먼트가 다 한쪽에 뭉쳐 보임) 각도를 직접 계산한 Path 원호(A 명령)로 그린다 — 훨씬 안정적이다
export function DonutChart({ data, size, thickness }: { data: { value: number; color: string }[]; size: number; thickness: number }) {
  const total = data.reduce((s2, d) => s2 + d.value, 0) || 1
  const r = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const cumulative = data.reduce<number[]>((acc, d) => [...acc, (acc[acc.length - 1] ?? 0) + (d.value / total) * 360], [])

  // 항목이 하나뿐이면(100%) 원호의 시작점=끝점이 되어 사라지므로 원 전체를 그대로 채운다
  if (data.length === 1) {
    return (
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke={data[0].color} strokeWidth={thickness} fill="none" />
      </Svg>
    )
  }

  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={r} stroke="#f1f2f1" strokeWidth={thickness} fill="none" />
      {data.map((d, i) => {
        const startAngle = cumulative[i - 1] ?? 0
        const endAngle = cumulative[i]
        if (endAngle - startAngle <= 0.01) return null
        const start = polarPoint(cx, cy, r, startAngle)
        const end = polarPoint(cx, cy, r, endAngle)
        const largeArc = endAngle - startAngle > 180 ? 1 : 0
        return (
          <Path
            key={i}
            d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`}
            stroke={d.color}
            strokeWidth={thickness}
            fill="none"
          />
        )
      })}
    </Svg>
  )
}

/** 가로 막대 목록 — 라벨이 긴 메뉴명에 맞춰 View로 그린다 */
export function HBarList({
  rows, width, formatValue, labelWidth = 70,
}: {
  rows: { label: string; value: number; color: string; sub?: string }[]
  width: number
  formatValue: (v: number) => string
  labelWidth?: number
}) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  const valueW = 46
  const trackW = width - labelWidth - valueW - 8
  return (
    <View>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ width: labelWidth, fontSize: 8, fontWeight: 500, color: INK, paddingRight: 4 }}>{r.label}</Text>
          <View style={{ width: trackW, height: 9, backgroundColor: '#f1f3f2', borderRadius: 2 }}>
            <View style={{ width: Math.max((r.value / max) * trackW, 1), height: 9, backgroundColor: r.color, borderRadius: 2 }} />
          </View>
          <Text style={{ width: valueW + 8, fontSize: 8, fontWeight: 700, color: INK_MUTED, textAlign: 'right' }}>{formatValue(r.value)}</Text>
        </View>
      ))}
    </View>
  )
}

/** 요일 × 시간대 히트맵 — 셀 농도는 매출, 셀 안 숫자는 주문 건수 */
export function Heatmap({
  rows, hours, width, color, rowLabelColor,
}: {
  rows: { label: string; cells: { hour: number; revenue: number; orderCount: number }[] }[]
  hours: number[]
  width: number
  color: string
  rowLabelColor: (label: string) => string
}) {
  const labelW = 22
  const cellGap = 1.5
  const cellW = (width - labelW - cellGap * hours.length) / Math.max(hours.length, 1)
  const cellH = 17
  const max = Math.max(...rows.flatMap((r) => r.cells.map((c) => c.revenue)), 1)
  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: 2 }}>
        <View style={{ width: labelW }} />
        {hours.map((h) => (
          <Text key={h} style={{ width: cellW, marginLeft: cellGap, fontSize: 6.5, color: INK_MUTED, textAlign: 'center', fontWeight: 600 }}>
            {String(h).padStart(2, '0')}
          </Text>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.label} style={{ flexDirection: 'row', marginBottom: cellGap, alignItems: 'center' }}>
          <Text style={{ width: labelW, fontSize: 8, fontWeight: 700, color: rowLabelColor(r.label) }}>{r.label}</Text>
          {hours.map((h) => {
            const c = r.cells.find((x) => x.hour === h)
            const t = c && c.revenue > 0 ? 0.12 + 0.88 * (c.revenue / max) : 0
            const bg = t > 0 ? mixHex('#f3f7f5', color, t) : '#f7f8f7'
            return (
              <View key={h} style={{ width: cellW, height: cellH, marginLeft: cellGap, borderRadius: 2.5, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                {c && c.orderCount > 0 && (
                  <Text style={{ fontSize: 6.5, fontWeight: 700, color: t > 0.55 ? '#ffffff' : INK_MUTED, lineHeight: 1 }}>{c.orderCount}</Text>
                )}
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

export function ProgressBar({ pct, color, height = 8 }: { pct: number; color: string; height?: number }) {
  return (
    <View style={{ height, backgroundColor: '#eef2ef', borderRadius: height / 2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height, backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  )
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <Text style={[s.note, { color: INK_FAINT, marginTop: 0 }]}>{children}</Text>
}
