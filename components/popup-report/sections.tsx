'use client'

import { Svg, Rect, Line, Polyline, Circle, G, Text, View } from '@react-pdf/renderer'
import type React from 'react'
import { formatPrice, formatRevenueTick } from '@/lib/utils'
import { DAY_COLORS, DAYS, weekendAccentColor } from '@/app/(admin)/stats/_lib/dayofweek'
import type { DayLabel } from '@/app/(admin)/stats/_lib/dayofweek'
import {
  buildMenuPareto, buildWeeklySummary, computeRevenueStats, findPeakHours, splitWeekdayWeekend, trimHourlyRange,
} from '@/lib/reportMetrics'
import type { MenuGrade } from '@/lib/reportMetrics'
import {
  ACCENT, ACCENT_BORDER, ACCENT_TINT, AMBER, BORDER, BRAND, DOWN, INK, INK_FAINT, INK_MUTED, ROW_ZEBRA, SKY, UP, s,
  type PdfStyle,
} from './theme'
import { BarChart, ChartLabel, DonutChart, Heatmap, HBarList, LineChart, ProgressBar } from './primitives'
import type { BarDatum } from './primitives'
import type { PopupReportData, ReportChartType } from './types'

export interface SectionSize {
  /** 카드 안쪽 차트 폭 */
  w: number
  /** 차트 높이 */
  h: number
  half: boolean
}

export interface SectionContent {
  title: string
  right?: string
  body: React.ReactNode
  /** 표처럼 길어질 수 있는 블록 — 카드를 페이지 경계에서 나눠도 된다 */
  breakable?: boolean
}

export function Won({ value }: { value: number }) {
  return <Text>₩{formatPrice(value)}</Text>
}

const won = (v: number) => `₩${formatPrice(v)}`
const signedPct = (v: number | null) => (v === null ? '-' : `${v > 0 ? '▲' : v < 0 ? '▼' : ''}${Math.abs(v)}%`)
const pctColor = (v: number | null) => (v === null || v === 0 ? INK_MUTED : v > 0 ? UP : DOWN)
const mdOf = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`

const GRADE_COLOR: Record<MenuGrade, string> = { A: ACCENT, B: SKY, C: '#b8c0bb' }

function StatCell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, color ? { color } : {}]}>{value}</Text>
      {sub && <Text style={s.statSub}>{sub}</Text>}
    </View>
  )
}

/** 표 한 줄 — cols는 [폭(%), 내용, 추가 스타일] */
function TableRow({ cols, zebra, header }: { cols: [string, React.ReactNode, PdfStyle?][]; zebra?: boolean; header?: boolean }) {
  return (
    <View style={header ? s.thead : [s.trow, { backgroundColor: zebra ? ROW_ZEBRA : '#ffffff' }]} wrap={false}>
      {cols.map(([w, content, extra], i) => (
        <Text key={i} style={[header ? s.th : s.td, { width: w }, extra ?? {}]}>{content}</Text>
      ))}
    </View>
  )
}

/** 매출 막대(등급 색) + 누적 비중 꺾은선 */
function ParetoChart({ rows, width, height }: { rows: ReturnType<typeof buildMenuPareto>; width: number; height: number }) {
  const padTop = 12
  const padBottom = 30
  const padRight = 22
  const chartW = width - padRight
  const chartH = height - padTop - padBottom
  const max = Math.max(...rows.map((r) => r.totalRevenue), 1)
  const gap = rows.length > 15 ? 2 : 4
  const barW = (chartW - gap * (rows.length - 1)) / Math.max(rows.length, 1)
  const cx = (i: number) => i * (barW + gap) + barW / 2
  const yPct = (p: number) => padTop + chartH * (1 - p / 100)
  const showNames = barW >= 14
  return (
    <Svg width={width} height={height}>
      <Line x1={0} y1={padTop + chartH} x2={chartW} y2={padTop + chartH} stroke={BORDER} strokeWidth={0.75} />
      {[80, 95].map((p) => (
        <G key={p}>
          <Line x1={0} y1={yPct(p)} x2={chartW} y2={yPct(p)} stroke={p === 80 ? AMBER : INK_FAINT} strokeWidth={0.75} strokeDasharray="3 2" />
          <ChartLabel x={width} y={yPct(p) + 2.5} fontSize={6.5} fontWeight={700} textAnchor="end" fill={p === 80 ? AMBER : INK_FAINT}>{`${p}%`}</ChartLabel>
        </G>
      ))}
      {rows.map((r, i) => {
        const h = (r.totalRevenue / max) * chartH
        return (
          <G key={r.id}>
            <Rect x={i * (barW + gap)} y={padTop + chartH - h} width={barW} height={Math.max(h, 0.5)} fill={GRADE_COLOR[r.grade]} rx={1.5} />
            {showNames && (
              <ChartLabel x={cx(i)} y={padTop + chartH + 10} fontSize={6.5} textAnchor="middle" fill={INK_MUTED}>
                {r.name.length > 5 ? `${r.name.slice(0, 5)}…` : r.name}
              </ChartLabel>
            )}
            {showNames && (
              <ChartLabel x={cx(i)} y={padTop + chartH + 20} fontSize={6.5} fontWeight={700} textAnchor="middle" fill={GRADE_COLOR[r.grade]}>{r.grade}</ChartLabel>
            )}
          </G>
        )
      })}
      <Polyline points={rows.map((r, i) => `${cx(i)},${yPct(r.cumulativeShare)}`).join(' ')} stroke={BRAND} strokeWidth={1.4} fill="none" />
      {rows.map((r, i) => <Circle key={r.id} cx={cx(i)} cy={yPct(r.cumulativeShare)} r={1.7} fill={BRAND} />)}
    </Svg>
  )
}

/** 일별 상세표 — 행이 많으면 2단으로 접고, 한 블록(최대 2×ROWS_PER_COL일)마다 헤더를 다시 그린다 */
const ROWS_PER_COL = 25

type DailyRow = PopupReportData['dailySales'][number]

function dailyHeader(wide: boolean): [string, React.ReactNode, PdfStyle?][] {
  return wide
    ? [['22%', '날짜'], ['14%', '요일'], ['26%', '매출'], ['18%', '주문'], ['20%', '객단가']]
    : [['28%', '날짜'], ['30%', '매출'], ['16%', '주문'], ['26%', '객단가']]
}

function dailyLine(r: DailyRow, wide: boolean): [string, React.ReactNode, PdfStyle?][] {
  const aov = r.orderCount > 0 ? Math.round(r.revenue / r.orderCount) : 0
  const cells: [string, React.ReactNode, PdfStyle?][] = [
    [wide ? '22%' : '28%', wide ? r.date : `${r.dateLabel} (${r.day})`, { fontWeight: 500, color: wide ? INK : weekendAccentColor(r.day, INK) }],
  ]
  if (wide) cells.push(['14%', `${r.day}요일`, { color: weekendAccentColor(r.day, INK), fontWeight: 700 }])
  cells.push(
    [wide ? '26%' : '30%', r.revenue > 0 ? won(r.revenue) : '-', { fontWeight: 600 }],
    [wide ? '18%' : '16%', `${r.orderCount}건`],
    [wide ? '20%' : '26%', aov > 0 ? won(aov) : '-'],
  )
  return cells
}

// inRow: 2단 접기에서만 가로로 반씩 나눠 갖는다 — 세로 방향 카드에서 flex:1을 주면 높이가 0으로 접혀 표가 사라진다
function DailyTable({ items, wide, inRow = false }: { items: DailyRow[]; wide: boolean; inRow?: boolean }) {
  return (
    <View style={inRow ? [s.table, { flex: 1 }] : s.table}>
      <TableRow header cols={dailyHeader(wide)} />
      {items.map((r, i) => <TableRow key={r.date} zebra={i % 2 === 1} cols={dailyLine(r, wide)} />)}
    </View>
  )
}

function DailyTableBody({ d, half }: { d: PopupReportData; half: boolean }) {
  const rows = d.dailySales
  if (rows.length === 0) return <Text style={{ fontSize: 9, color: INK_FAINT }}>해당 팝업 기간에 매출 데이터가 없습니다.</Text>

  if (half || rows.length <= 12) return <DailyTable items={rows} wide={!half} />

  const blockSize = ROWS_PER_COL * 2
  const blocks: DailyRow[][] = []
  for (let i = 0; i < rows.length; i += blockSize) blocks.push(rows.slice(i, i + blockSize))
  return (
    <View>
      {blocks.map((block, bi) => {
        const perCol = Math.ceil(block.length / 2)
        return (
          <View key={bi} style={{ flexDirection: 'row', gap: 8, marginTop: bi > 0 ? 8 : 0 }} wrap={false}>
            <DailyTable items={block.slice(0, perCol)} wide={false} inRow />
            <DailyTable items={block.slice(perCol)} wide={false} inRow />
          </View>
        )
      })}
    </View>
  )
}

export function renderSection(type: ReportChartType, d: PopupReportData, size: SectionSize): SectionContent | null {
  const { w, h, half } = size

  switch (type) {
    case 'dailyBar': {
      if (d.dailySales.length === 0) return null
      const data: BarDatum[] = d.dailySales.map((r) => ({ label: r.dateLabel, value: r.revenue, color: weekendAccentColor(r.day, ACCENT) }))
      return {
        title: '일별 매출',
        right: half ? '파랑=토 · 빨강=일' : '파란 막대 = 토요일 · 빨간 막대 = 일요일 · 점선 = 운영일 평균',
        body: <BarChart data={data} width={w} height={h} formatValue={formatRevenueTick} refValue={d.avgDailyRevenue} refLabel={`평균 ${formatRevenueTick(d.avgDailyRevenue)}`} />,
      }
    }

    case 'cumulative': {
      if (d.dailySales.length === 0) return null
      const cumulative = d.dailySales.reduce<number[]>((acc, r) => [...acc, (acc[acc.length - 1] ?? 0) + r.revenue], [])
      const pace = d.dailySales.map((_, i) => Math.round((d.totalRevenue / d.dailySales.length) * (i + 1)))
      return {
        title: '누적 매출',
        right: '점선 = 일평균 페이스',
        body: (
          <View>
            <LineChart values={cumulative} refValues={pace} labels={d.dailySales.map((r) => r.dateLabel)} width={w} height={h} color={ACCENT} refColor={AMBER} formatValue={formatRevenueTick} />
            <Text style={s.note}>실선이 점선보다 위에 있으면 평균보다 앞선 페이스입니다.</Text>
          </View>
        ),
      }
    }

    case 'aovTrend': {
      const rows = d.dailySales.filter((r) => r.orderCount > 0)
      if (rows.length === 0) return null
      const values = rows.map((r) => Math.round(r.revenue / r.orderCount))
      const max = Math.max(...values)
      const min = Math.min(...values)
      return {
        title: '일별 객단가',
        right: `평균 ${won(d.avgOrderValue)}`,
        body: (
          <View>
            <LineChart values={values} refValue={d.avgOrderValue} refLabel="평균" labels={rows.map((r) => r.dateLabel)} width={w} height={h} color={SKY} />
            <Text style={s.note}>최고 {won(max)} · 최저 {won(min)} — 객단가 = 매출 ÷ 주문 건수</Text>
          </View>
        ),
      }
    }

    case 'dailyOrders': {
      if (!d.dailySales.some((r) => r.orderCount > 0)) return null
      const data: BarDatum[] = d.dailySales.map((r) => ({ label: r.dateLabel, value: r.orderCount, color: weekendAccentColor(r.day, '#64748b') }))
      return {
        title: '일별 주문 건수',
        right: `일평균 ${d.avgDailyOrders.toFixed(1)}건`,
        body: <BarChart data={data} width={w} height={h} formatValue={(v) => `${v}`} refValue={d.avgDailyOrders} refLabel="평균" />,
      }
    }

    case 'weeklySummary': {
      const rows = buildWeeklySummary(d.dailySales, d.startDate, d.endDate)
      if (rows.length === 0) return null
      const best = rows.reduce((b, r) => (r.revenue > b.revenue ? r : b), rows[0])
      return {
        title: '주차별 요약',
        right: '운영 시작일부터 7일 단위',
        breakable: rows.length > 12,
        body: (
          <View style={s.table}>
            <TableRow header cols={[['10%', '주차'], ['22%', '기간'], ['20%', '매출'], ['12%', '주문'], ['10%', '판매일'], ['14%', '객단가'], ['12%', '전주 대비']]} />
            {rows.map((r, i) => (
              <TableRow
                key={r.week}
                zebra={i % 2 === 1}
                cols={[
                  ['10%', `${r.week}주차`, { fontWeight: 700, color: r.week === best.week ? ACCENT : INK }],
                  ['22%', `${mdOf(r.startDate)} ~ ${mdOf(r.endDate)}`],
                  ['20%', won(r.revenue), { fontWeight: 600 }],
                  ['12%', `${r.orderCount}건`],
                  ['10%', `${r.salesDays}일`],
                  ['14%', r.avgOrderValue > 0 ? won(r.avgOrderValue) : '-'],
                  ['12%', signedPct(r.changePct), { color: pctColor(r.changePct), fontWeight: 700 }],
                ]}
              />
            ))}
          </View>
        ),
      }
    }

    case 'revenueDistribution': {
      const stats = computeRevenueStats(d.dailySales)
      if (!stats || stats.days < 3) return null
      const data: BarDatum[] = stats.bins.map((b) => ({ label: formatRevenueTick(b.from), value: b.count, color: '#8fd0b0' }))
      const stability = stats.cv < 25 ? '안정적' : stats.cv < 50 ? '보통' : '변동 큼'
      return {
        title: '일매출 분포',
        right: `판매일 ${stats.days}일 기준`,
        body: (
          <View>
            <BarChart data={data} width={w} height={h - 30} formatValue={(v) => `${v}일`} />
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              <StatCell label="중앙값" value={formatRevenueTick(stats.median)} />
              <StatCell label="표준편차" value={formatRevenueTick(stats.stdDev)} />
              <StatCell label="변동계수" value={`${stats.cv}%`} sub={stability} />
            </View>
          </View>
        ),
      }
    }

    case 'paceForecast': {
      if (d.status !== '진행중' || d.projectedTotal === null) return null
      const progressPct = d.totalDays > 0 ? Math.round((d.elapsedDays / d.totalDays) * 100) : 0
      const achievedPct = d.projectedTotal > 0 ? Math.round((d.totalRevenue / d.projectedTotal) * 100) : 0
      const remaining = Math.max(d.projectedTotal - d.totalRevenue, 0)
      return {
        title: '진행 페이스·예상 매출',
        right: '현재 일평균 유지 가정',
        body: (
          <View>
            <Text style={s.statLabel}>예상 총매출</Text>
            <Text style={{ fontSize: 17, fontWeight: 800, color: ACCENT, marginBottom: 8 }}>{won(d.projectedTotal)}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={s.statLabel}>누적 매출 {won(d.totalRevenue)}</Text>
              <Text style={[s.statLabel, { color: ACCENT }]}>{achievedPct}%</Text>
            </View>
            <ProgressBar pct={achievedPct} color={ACCENT} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, marginBottom: 3 }}>
              <Text style={s.statLabel}>운영 기간 {d.elapsedDays}/{d.totalDays}일</Text>
              <Text style={s.statLabel}>{progressPct}%</Text>
            </View>
            <ProgressBar pct={progressPct} color="#b8c0bb" />
            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <StatCell label="남은 기간 예상 매출" value={formatRevenueTick(remaining)} />
              <StatCell label="잔여 운영일" value={`${d.remainingDays}일`} />
            </View>
          </View>
        ),
      }
    }

    case 'dayOfWeek': {
      if (d.dayOfWeek.length === 0) return null
      const data: BarDatum[] = d.dayOfWeek.map((r) => ({ label: `${r.day}(${r.dayCount})`, value: r.avgRevenue, color: DAY_COLORS[r.day] }))
      return {
        title: '요일별 평균 매출',
        body: (
          <View>
            <BarChart data={data} width={w} height={h} formatValue={formatRevenueTick} />
            <Text style={s.note}>괄호 안 숫자는 해당 요일이 운영 기간에 포함된 횟수입니다.</Text>
          </View>
        ),
      }
    }

    case 'weekdayWeekend': {
      const split = splitWeekdayWeekend(d.dailySales)
      if (split.weekday.days + split.weekend.days === 0) return null
      const { weekday, weekend } = split
      const metrics: { label: string; a: number; b: number; fmt: (v: number) => string }[] = [
        { label: '일평균 매출', a: weekday.avgRevenue, b: weekend.avgRevenue, fmt: formatRevenueTick },
        { label: '일평균 주문', a: weekday.avgOrders, b: weekend.avgOrders, fmt: (v) => `${v}건` },
        { label: '객단가', a: weekday.avgOrderValue, b: weekend.avgOrderValue, fmt: won },
      ]
      const diff = (a: number, b: number) => (a > 0 && b > 0 ? Math.round(((b - a) / a) * 100) : null)
      const maxRev = Math.max(weekday.avgRevenue, weekend.avgRevenue, 1)
      return {
        title: '주중 vs 주말',
        right: `주중 ${weekday.days}일 · 주말 ${weekend.days}일`,
        body: (
          <View>
            {([['주중', weekday.avgRevenue, '#94a3b8'], ['주말', weekend.avgRevenue, DAY_COLORS['토']]] as const).map(([label, v, color]) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ width: 24, fontSize: 8, fontWeight: 700, color }}>{label}</Text>
                <View style={{ flex: 1 }}><ProgressBar pct={(v / maxRev) * 100} color={color} height={10} /></View>
                <Text style={{ width: 44, fontSize: 8, fontWeight: 700, textAlign: 'right' }}>{v > 0 ? formatRevenueTick(v) : '-'}</Text>
              </View>
            ))}
            <View style={[s.table, { marginTop: 6 }]}>
              <TableRow header cols={[['34%', '지표'], ['22%', '주중'], ['22%', '주말'], ['22%', '주말 차이']]} />
              {metrics.map((m, i) => {
                const pct = diff(m.a, m.b)
                return (
                  <TableRow
                    key={m.label}
                    zebra={i % 2 === 1}
                    cols={[
                      ['34%', m.label, { fontWeight: 600 }],
                      ['22%', m.a > 0 ? m.fmt(m.a) : '-'],
                      ['22%', m.b > 0 ? m.fmt(m.b) : '-'],
                      ['22%', signedPct(pct), { color: pctColor(pct), fontWeight: 700 }],
                    ]}
                  />
                )
              })}
            </View>
          </View>
        ),
      }
    }

    case 'hourly': {
      const rows = trimHourlyRange(d.hourly)
      if (rows.length === 0) return null
      const data: BarDatum[] = rows.map((r) => ({ label: r.label, value: r.revenue, color: SKY }))
      return {
        title: '시간대별 매출',
        right: '판매가 있는 시간만',
        body: (
          <View>
            <BarChart data={data} width={w} height={h} formatValue={formatRevenueTick} />
            <Text style={s.note}>POS 주문과 시간대별 수기 입력을 합산한 수치입니다.</Text>
          </View>
        ),
      }
    }

    case 'peakHours': {
      const peak = findPeakHours(d.hourly)
      if (peak.top.length === 0) return null
      const medal = [ACCENT, '#5cb98f', '#9fd6bb']
      return {
        title: '피크 시간대',
        right: `시간대 매출 합계 ${formatRevenueTick(peak.totalRevenue)}`,
        body: (
          <View>
            {peak.window && (
              <View style={{ backgroundColor: ACCENT_TINT, borderRadius: 8, padding: 9, marginBottom: 8, border: `1px solid ${ACCENT_BORDER}` }}>
                <Text style={s.statLabel}>가장 붐빈 2시간</Text>
                <Text style={{ fontSize: 15, fontWeight: 800, color: ACCENT }}>
                  {String(peak.window.fromHour).padStart(2, '0')}~{String(peak.window.toHour).padStart(2, '0')}시
                  <Text style={{ fontSize: 9, color: INK_MUTED, fontWeight: 600 }}>  매출의 {peak.window.share}%</Text>
                </Text>
              </View>
            )}
            {peak.top.map((p, i) => (
              <View key={p.hour} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                <Text style={{ width: 16, fontSize: 9, fontWeight: 800, color: medal[i] }}>{i + 1}</Text>
                <Text style={{ width: 30, fontSize: 9, fontWeight: 700 }}>{p.label}</Text>
                <View style={{ flex: 1, marginRight: 6 }}><ProgressBar pct={(p.share / peak.top[0].share) * 100} color={medal[i]} height={7} /></View>
                <Text style={{ width: 74, fontSize: 8, color: INK_MUTED, textAlign: 'right', fontWeight: 600 }}>{formatRevenueTick(p.revenue)} · {p.share}%</Text>
              </View>
            ))}
          </View>
        ),
      }
    }

    case 'dayHourHeatmap': {
      const active = d.dayHour.filter((r) => r.cells.some((c) => c.orderCount > 0))
      if (active.length === 0) return null
      const hourTotals = active[0].cells.map((c, i) => ({ hour: c.hour, revenue: active.reduce((sum, r) => sum + r.cells[i].revenue, 0), orderCount: active.reduce((sum, r) => sum + r.cells[i].orderCount, 0) }))
      const hours = trimHourlyRange(hourTotals).map((c) => c.hour)
      return {
        title: '요일 × 시간대 판매 현황',
        right: '색 농도 = 매출 · 숫자 = 주문 건수 (POS 주문 기준)',
        body: (
          <Heatmap
            rows={active.map((r) => ({ label: r.day, cells: r.cells }))}
            hours={hours}
            width={w}
            color={ACCENT}
            rowLabelColor={(label) => weekendAccentColor(label as DayLabel, INK)}
          />
        ),
      }
    }

    case 'menuDonut': {
      const sold = d.menuBreakdown.filter((m) => m.totalRevenue > 0)
      if (sold.length === 0) return null
      const total = sold.reduce((sum, m) => sum + m.totalRevenue, 0)
      const maxLegend = half ? 7 : 10
      const shown = sold.slice(0, maxLegend)
      const rest = sold.slice(maxLegend)
      const restRevenue = rest.reduce((sum, m) => sum + m.totalRevenue, 0)
      const donutSize = half ? 92 : 130
      return {
        title: '메뉴별 매출 비중',
        right: `총 ${formatPrice(total)}원`,
        body: (
          <View style={{ flexDirection: half ? 'column' : 'row', alignItems: 'center', gap: half ? 8 : 20 }}>
            <DonutChart data={sold.map((m) => ({ value: m.totalRevenue, color: m.color }))} size={donutSize} thickness={half ? 15 : 20} />
            <View style={{ flex: half ? undefined : 1, width: half ? w : undefined }}>
              {shown.map((m) => (
                <View key={m.id} style={s.legendRow}>
                  <View style={[s.legendDot, { backgroundColor: m.color }]} />
                  <Text style={s.legendName}>{m.name}</Text>
                  <Text style={s.legendValue}>{half ? '' : `${m.totalQuantity}개 · `}{formatRevenueTick(m.totalRevenue)} ({Math.round((m.totalRevenue / total) * 100)}%)</Text>
                </View>
              ))}
              {rest.length > 0 && (
                <View style={s.legendRow}>
                  <View style={[s.legendDot, { backgroundColor: '#d4d9d6' }]} />
                  <Text style={s.legendName}>기타 {rest.length}개</Text>
                  <Text style={s.legendValue}>{formatRevenueTick(restRevenue)} ({Math.round((restRevenue / total) * 100)}%)</Text>
                </View>
              )}
            </View>
          </View>
        ),
      }
    }

    case 'menuQuantity': {
      const rows = d.menuBreakdown.filter((m) => m.totalQuantity > 0).sort((a, b) => b.totalQuantity - a.totalQuantity)
      if (rows.length === 0) return null
      const limit = half ? 10 : 15
      return {
        title: '메뉴별 판매 수량',
        right: rows.length > limit ? `상위 ${limit}개` : `${rows.length}개 메뉴`,
        body: (
          <HBarList
            rows={rows.slice(0, limit).map((m) => ({ label: m.name, value: m.totalQuantity, color: m.color }))}
            width={w}
            labelWidth={half ? 64 : 110}
            formatValue={(v) => `${formatPrice(v)}개`}
          />
        ),
      }
    }

    case 'menuRanking': {
      const rows = buildMenuPareto(d.menuBreakdown)
      if (rows.length === 0) return null
      return {
        title: '메뉴 판매 순위',
        right: `${rows.length}개 메뉴 · 매출순`,
        breakable: rows.length > 12,
        body: (
          <View style={s.table}>
            <TableRow header cols={[['8%', '순위'], ['26%', '메뉴'], ['11%', '수량'], ['17%', '매출'], ['10%', '비중'], ['10%', '누적'], ['12%', '평균단가'], ['6%', '등급']]} />
            {rows.map((m, i) => (
              <TableRow
                key={m.id}
                zebra={i % 2 === 1}
                cols={[
                  ['8%', `${m.rank}`, { fontWeight: 700 }],
                  ['26%', m.name, { textAlign: 'left', fontWeight: 500 }],
                  ['11%', `${formatPrice(m.totalQuantity)}개`],
                  ['17%', won(m.totalRevenue), { fontWeight: 600 }],
                  ['10%', `${m.share}%`],
                  ['10%', `${m.cumulativeShare}%`, { color: INK_MUTED }],
                  ['12%', m.avgPrice > 0 ? won(m.avgPrice) : '-'],
                  ['6%', m.grade, { fontWeight: 800, color: GRADE_COLOR[m.grade] }],
                ]}
              />
            ))}
          </View>
        ),
      }
    }

    case 'menuPareto': {
      const rows = buildMenuPareto(d.menuBreakdown)
      if (rows.length < 3) return null
      const shown = rows.slice(0, 20)
      const count = (g: MenuGrade) => rows.filter((r) => r.grade === g).length
      const share = (g: MenuGrade) => Math.round(rows.filter((r) => r.grade === g).reduce((sum, r) => sum + r.share, 0))
      return {
        title: '메뉴 ABC 분석',
        right: rows.length > shown.length ? `상위 ${shown.length}개 표시` : '막대 = 매출 · 선 = 누적 비중',
        body: (
          <View>
            <ParetoChart rows={shown} width={w} height={h} />
            <View style={{ flexDirection: 'row', marginTop: 6, gap: 8 }}>
              {(['A', 'B', 'C'] as MenuGrade[]).map((g) => (
                <View key={g} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[s.legendDot, { backgroundColor: GRADE_COLOR[g] }]} />
                  <Text style={{ fontSize: 8, color: INK_MUTED }}>
                    <Text style={{ fontWeight: 800, color: INK }}>{g}등급 {count(g)}개</Text> · 매출 {share(g)}%
                  </Text>
                </View>
              ))}
            </View>
            <Text style={s.note}>A = 누적 매출 80%까지 · B = 95%까지 · C = 나머지. A등급은 재고·진열 우선, C등급은 메뉴 정리 후보입니다.</Text>
          </View>
        ),
      }
    }

    case 'dailyTable':
      return {
        title: '일자별 매출·주문 내역',
        right: `총 ${d.dailySales.length}일`,
        breakable: half && d.dailySales.length > 28,
        body: <DailyTableBody d={d} half={half} />,
      }

    case 'calendar': {
      if (d.dailySales.length === 0) return null
      const firstWeekday = new Date(`${d.dailySales[0].date}T00:00:00`).getDay()
      type CalCell = { date: string; day: DayLabel; revenue: number } | null
      const cells: CalCell[] = [
        ...Array.from({ length: firstWeekday }, (): CalCell => null),
        ...d.dailySales.map((r): CalCell => ({ date: r.date, day: r.day, revenue: r.revenue })),
      ]
      while (cells.length % 7 !== 0) cells.push(null)
      const weeks: CalCell[][] = []
      for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
      const max = Math.max(...d.dailySales.map((r) => r.revenue), 1)

      return {
        title: '날짜별 매출 프리뷰',
        right: `${d.startDate} ~ ${d.endDate}`,
        body: (
          <View>
            <View style={s.calWeekHeader}>
              {DAYS.map((label, i) => (
                <Text key={label} style={[s.calWeekHeaderCell, { color: i === 0 ? '#f43f5e' : i === 6 ? SKY : INK_MUTED }]}>{label}</Text>
              ))}
            </View>
            {weeks.map((week, wi) => (
              <View key={wi} style={s.calWeekRow}>
                {week.map((cell, ci) => {
                  const best = cell && cell.revenue === max && cell.revenue > 0
                  return (
                    <View key={ci} style={[s.calCell, cell && cell.revenue > 0 ? { backgroundColor: ACCENT_TINT, border: `1px solid ${best ? ACCENT : ACCENT_BORDER}` } : {}]}>
                      {cell && (
                        <>
                          <Text style={[s.calDayNum, { color: weekendAccentColor(cell.day, INK) }]}>{Number(cell.date.slice(-2))}</Text>
                          <Text style={s.calDayRevenue}>{cell.revenue > 0 ? formatRevenueTick(cell.revenue) : '-'}</Text>
                        </>
                      )}
                    </View>
                  )
                })}
              </View>
            ))}
          </View>
        ),
      }
    }
  }
}
