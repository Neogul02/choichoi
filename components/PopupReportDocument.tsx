'use client'

import {
  Document, Page, Text, View, StyleSheet, Font,
  Svg, Rect, Circle, Line, Polyline, G,
} from '@react-pdf/renderer'
import path from 'path'
import type React from 'react'
import { formatPrice, formatRevenueTick } from '@/lib/utils'
import { DAY_COLORS, weekendAccentColor } from '@/app/(admin)/stats/_lib/dayofweek'
import type { DayLabel } from '@/app/(admin)/stats/_lib/dayofweek'

function fontPath(file: string) {
  return typeof window === 'undefined'
    ? path.join(process.cwd(), 'public', 'fonts', file)
    : `/fonts/${file}`
}

Font.register({
  family: 'Pretendard',
  fonts: [
    { src: fontPath('Pretendard-Regular.ttf'), fontWeight: 400 },
    { src: fontPath('Pretendard-Medium.ttf'), fontWeight: 500 },
    { src: fontPath('Pretendard-SemiBold.ttf'), fontWeight: 600 },
    { src: fontPath('Pretendard-Bold.ttf'), fontWeight: 700 },
    { src: fontPath('Pretendard-ExtraBold.ttf'), fontWeight: 800 },
  ],
})

const F = 'Pretendard'

// ── 브랜드 팔레트 — choichoi 초록(primary-700) 기반, 차트는 가독성 위해 조금 더 밝은 톤 사용 ──
const BRAND = '#084431'
const ACCENT = '#1f9d63'
const ACCENT_TINT = '#eaf6f0'
const AMBER = '#f59e0b'
const INK = '#161a18'
const INK_MUTED = '#6b7570'
const INK_FAINT = '#9aa39d'
const BORDER = '#e6e9e6'
const ROW_ZEBRA = '#f8faf9'

// @react-pdf/renderer의 SVG Text 타입 선언에는 fontSize/fontFamily/fontWeight가 빠져 있지만
// 레이아웃 엔진은 런타임에 해당 prop을 그대로 읽는다 — 라벨 전용으로 타입만 보강한 얇은 래퍼
function ChartLabel(props: {
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

// strokeDashoffset도 SVGPresentationAttributes 타입 선언에 빠져 있지만 런타임은 지원한다 (donut 세그먼트 회전용)
function DonutSegment(props: { cx: number; cy: number; r: number; stroke: string; strokeWidth: number; strokeDasharray: string; strokeDashoffset: number }) {
  const circleProps = { ...props, fill: 'none' } as unknown as React.ComponentProps<typeof Circle>
  return <Circle {...circleProps} />
}

export interface PopupReportDailyRow {
  date: string
  dateLabel: string
  day: DayLabel
  revenue: number
  orderCount: number
}

export interface PopupReportMenuRow {
  id: number
  name: string
  color: string
  totalQuantity: number
  totalRevenue: number
}

export interface PopupReportHourlyRow {
  label: string
  revenue: number
  orderCount: number
}

export interface PopupReportDayOfWeekRow {
  day: DayLabel
  avgRevenue: number
  dayCount: number
}

/** 보고서에 넣을 수 있는 차트 종류 — 각각 한 페이지를 채우는 독립 섹션이다 */
export type ReportChartType = 'dailyBar' | 'cumulative' | 'dayOfWeek' | 'hourly' | 'menuDonut' | 'dailyTable'

export const REPORT_CHART_LABELS: Record<ReportChartType, string> = {
  dailyBar: '일별 매출 추이',
  cumulative: '누적 매출 추이',
  dayOfWeek: '요일별 평균 매출',
  hourly: '시간대별 매출 분포',
  menuDonut: '메뉴별 매출 비중',
  dailyTable: '일별 매출 상세표',
}

/** 사용자가 순서를 자유롭게 편집하는 보고서 본문 — 차트 섹션과 텍스트 블록을 섞어 배치할 수 있다 */
export type ReportSection =
  | { id: string; kind: 'chart'; chartType: ReportChartType }
  | { id: string; kind: 'text'; content: string }

export interface PopupReportData {
  popupName: string
  startDate: string
  endDate: string
  status: '예정' | '진행중' | '종료'
  totalDays: number
  elapsedDays: number
  remainingDays: number
  totalRevenue: number
  totalOrders: number
  avgOrderValue: number
  avgDailyRevenue: number
  avgDailyOrders: number
  salesDays: number
  bestDay: PopupReportDailyRow | null
  worstDay: PopupReportDailyRow | null
  projectedTotal: number | null
  dailySales: PopupReportDailyRow[]
  dayOfWeek: PopupReportDayOfWeekRow[]
  hourly: PopupReportHourlyRow[]
  menuBreakdown: PopupReportMenuRow[]
  generatedAt: string
  /** 표지(핵심 지표 요약) 뒤에 이어지는 본문 — 차트 섹션 추가/삭제/순서 변경과 텍스트 블록 삽입을 그대로 반영한다 */
  sections: ReportSection[]
}

const s = StyleSheet.create({
  page: { fontFamily: F, fontWeight: 400, fontSize: 10, padding: 40, color: INK, lineHeight: 1.55 },

  // 페이지 1 대표 헤더 — 프레젠테이션 표지 느낌
  eyebrow: { fontSize: 9, fontFamily: F, fontWeight: 700, color: ACCENT, letterSpacing: 1.2, marginBottom: 6 },
  h1: { fontSize: 27, fontFamily: F, fontWeight: 800, color: INK, marginBottom: 8, lineHeight: 1.25 },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerMeta: { fontSize: 10.5, color: INK_MUTED, fontWeight: 500 },
  headerRow: { marginBottom: 20, paddingBottom: 18, borderBottom: `2.5px solid ${BRAND}` },

  // 후속 페이지용 축약 헤더
  pageEyebrow: { fontSize: 8.5, fontFamily: F, fontWeight: 700, color: ACCENT, letterSpacing: 1, marginBottom: 4 },
  pageH1: { fontSize: 19, fontFamily: F, fontWeight: 800, color: INK, marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${BORDER}` },

  // 카드 — 제목이 카드 안에 포함된 블록형
  card: { backgroundColor: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 16 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardAccentBar: { width: 4, height: 14, borderRadius: 2, backgroundColor: ACCENT, marginRight: 8 },
  cardTitle: { fontSize: 13, fontFamily: F, fontWeight: 700, color: INK },
  cardTitleRight: { fontSize: 8.5, color: INK_FAINT, fontWeight: 500 },

  // 운영 진행률
  progressPctText: { fontSize: 20, fontFamily: F, fontWeight: 800, color: ACCENT },
  progressTrack: { height: 10, backgroundColor: '#eef2ef', borderRadius: 5, marginTop: 10, marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: 10, backgroundColor: ACCENT, borderRadius: 5 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressFootRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressFootText: { fontSize: 9.5, color: INK_MUTED, fontWeight: 500 },

  // KPI 타일 — 큼직한 프레젠테이션용 숫자
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiTile: { width: '31.2%', height: 78, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12 },
  kpiTileAccent: { width: '31.2%', height: 78, borderRadius: 10, padding: 12, backgroundColor: ACCENT_TINT, border: '1px solid #c9ecdb' },
  kpiLabel: { fontSize: 8.5, color: INK_MUTED, fontWeight: 600, marginBottom: 6 },
  kpiValue: { fontSize: 17, fontFamily: F, fontWeight: 800, color: INK },
  kpiValueAccent: { fontSize: 18, fontFamily: F, fontWeight: 800, color: ACCENT },
  kpiSub: { fontSize: 8, color: INK_FAINT, marginTop: 4, fontWeight: 500 },

  note: { fontSize: 8.5, color: INK_FAINT, marginTop: 10, fontWeight: 500 },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  legendName: { fontSize: 10.5, flex: 1, fontWeight: 500, color: INK },
  legendValue: { fontSize: 10.5, color: INK_MUTED, fontWeight: 600 },

  table: { border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' },
  thead: { flexDirection: 'row', backgroundColor: ACCENT_TINT },
  trow: { flexDirection: 'row', borderTop: `0.5px solid ${BORDER}` },
  th: { padding: '9 6', fontSize: 9.5, fontFamily: F, fontWeight: 700, color: BRAND, textAlign: 'center' },
  td: { padding: '8 6', fontSize: 10.5, textAlign: 'center', fontWeight: 400 },

  noteParagraph: { fontSize: 10.5, color: INK, lineHeight: 1.8, marginBottom: 12 },

  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `0.5px solid ${BORDER}` },
  footerBrand: { fontSize: 8.5, fontFamily: F, fontWeight: 700, color: BRAND },
  footerText: { fontSize: 8, color: INK_FAINT, fontWeight: 500 },
})

function Won({ value }: { value: number }) {
  return <Text>₩{formatPrice(value)}</Text>
}

function CardHeader({ title, right }: { title: string; right?: string }) {
  return (
    <View style={s.cardHeaderRow}>
      <View style={s.cardAccentBar} />
      <Text style={[s.cardTitle, { flex: 1 }]}>{title}</Text>
      {right && <Text style={s.cardTitleRight}>{right}</Text>}
    </View>
  )
}

function PageFooter() {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerBrand}>ChoiChoi POS</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages} 페이지`} />
    </View>
  )
}

// ── 차트 프리미티브 ──────────────────────────────────────────────────────────

interface BarDatum { label: string; value: number; color: string }

function BarChart({ data, width, height, formatValue }: { data: BarDatum[]; width: number; height: number; formatValue: (v: number) => string }) {
  const padTop = 18
  const padBottom = 16
  const chartH = height - padTop - padBottom
  const max = Math.max(...data.map((d) => d.value), 1)
  const gap = data.length > 20 ? 1.5 : 4
  const barW = data.length > 0 ? (width - gap * (data.length - 1)) / data.length : 0
  const labelStride = data.length > 16 ? Math.ceil(data.length / 12) : 1

  return (
    <Svg width={width} height={height}>
      <Line x1={0} y1={height - padBottom} x2={width} y2={height - padBottom} stroke={BORDER} strokeWidth={0.75} />
      {data.map((d, i) => {
        const h = max > 0 ? (d.value / max) * chartH : 0
        const x = i * (barW + gap)
        const y = height - padBottom - h
        return (
          <G key={i}>
            <Rect x={x} y={y} width={Math.max(barW, 0.5)} height={Math.max(h, 0.5)} fill={d.color} rx={2} />
            {d.value > 0 && barW > 10 && (
              <ChartLabel x={x + barW / 2} y={y - 4} fontSize={7.5} fontWeight={700} textAnchor="middle" fill={INK}>
                {formatValue(d.value)}
              </ChartLabel>
            )}
            {i % labelStride === 0 && (
              <ChartLabel x={x + barW / 2} y={height - 3} fontSize={8} fontWeight={500} textAnchor="middle" fill={INK_MUTED}>
                {d.label}
              </ChartLabel>
            )}
          </G>
        )
      })}
    </Svg>
  )
}

function LineChart({
  values, refValues, labels, width, height, color, refColor,
}: {
  values: number[]
  refValues?: number[]
  labels: string[]
  width: number
  height: number
  color: string
  refColor?: string
}) {
  const padTop = 14
  const padBottom = 16
  const chartH = height - padTop - padBottom
  const all = refValues ? [...values, ...refValues] : values
  const max = Math.max(...all, 1)
  const stepX = values.length > 1 ? width / (values.length - 1) : 0
  const pt = (v: number, i: number): [number, number] => [i * stepX, padTop + chartH - (v / max) * chartH]
  const toPoints = (arr: number[]) => arr.map((v, i) => pt(v, i).join(',')).join(' ')
  const labelStride = labels.length > 14 ? Math.ceil(labels.length / 10) : 1

  return (
    <Svg width={width} height={height}>
      <Line x1={0} y1={padTop + chartH} x2={width} y2={padTop + chartH} stroke={BORDER} strokeWidth={0.75} />
      {refValues && <Polyline points={toPoints(refValues)} stroke={refColor ?? AMBER} strokeWidth={1.25} strokeDasharray="4 3" fill="none" />}
      <Polyline points={toPoints(values)} stroke={color} strokeWidth={2.25} fill="none" />
      {values.map((v, i) => {
        const [x, y] = pt(v, i)
        return <Circle key={i} cx={x} cy={y} r={2.1} fill={color} />
      })}
      {labels.map((l, i) => {
        if (i % labelStride !== 0) return null
        return (
          <ChartLabel key={i} x={i * stepX} y={height - 3} fontSize={8} fontWeight={500} textAnchor="middle" fill={INK_MUTED}>
            {l}
          </ChartLabel>
        )
      })}
    </Svg>
  )
}

function DonutChart({ data, size, thickness }: { data: { value: number; color: string }[]; size: number; thickness: number }) {
  const total = data.reduce((s2, d) => s2 + d.value, 0) || 1
  const r = (size - thickness) / 2
  const circumference = 2 * Math.PI * r
  const cx = size / 2
  const cy = size / 2
  // 이전 세그먼트까지의 누적 길이(prefix sum) — 각 세그먼트의 회전 시작점으로 쓰인다
  const prefixLengths = data.reduce<number[]>((acc, d) => [...acc, (acc[acc.length - 1] ?? 0) + (d.value / total) * circumference], [])

  return (
    <Svg width={size} height={size}>
      <G transform={`rotate(-90, ${cx}, ${cy})`}>
        <Circle cx={cx} cy={cy} r={r} stroke="#f1f2f1" strokeWidth={thickness} fill="none" />
        {data.map((d, i) => {
          const frac = d.value / total
          const dash = frac * circumference
          const strokeDashoffset = -(prefixLengths[i - 1] ?? 0)
          return (
            <DonutSegment
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(dash, 0.01)} ${Math.max(circumference - dash, 0.01)}`}
              strokeDashoffset={strokeDashoffset}
            />
          )
        })}
      </G>
    </Svg>
  )
}

// ── 문서 ────────────────────────────────────────────────────────────────────

const CHART_W = 483

export function PopupReportDocument(p: PopupReportData) {
  const progressPct = p.totalDays > 0 ? Math.min(100, Math.round((p.elapsedDays / p.totalDays) * 100)) : 0

  const dailyBarData: BarDatum[] = p.dailySales.map((d) => ({
    label: d.dateLabel,
    value: d.revenue,
    color: weekendAccentColor(d.day, ACCENT),
  }))

  const cumulativeValues = p.dailySales.reduce<number[]>((acc, d) => [...acc, (acc[acc.length - 1] ?? 0) + d.revenue], [])
  const paceValues = p.dailySales.length > 0
    ? p.dailySales.map((_, i) => Math.round((p.totalRevenue / p.dailySales.length) * (i + 1)))
    : []

  const dayOfWeekBarData: BarDatum[] = p.dayOfWeek.map((d) => ({
    label: `${d.day}(${d.dayCount})`,
    value: d.avgRevenue,
    color: DAY_COLORS[d.day],
  }))

  const hourlyBarData: BarDatum[] = p.hourly.map((h) => ({ label: h.label, value: h.revenue, color: '#0ea5e9' }))
  const hasHourly = p.hourly.some((h) => h.orderCount > 0 || h.revenue > 0)

  const menuTotal = p.menuBreakdown.reduce((s2, m) => s2 + m.totalRevenue, 0)
  const donutData = p.menuBreakdown.filter((m) => m.totalRevenue > 0).map((m) => ({ value: m.totalRevenue, color: m.color }))

  return (
    <Document title={`${p.popupName} 매출 분석 보고서`}>
      {/* ── 페이지 1: 표지 + 핵심 지표 요약 ── */}
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.eyebrow}>POPUP SALES REPORT</Text>
            <Text style={s.h1}>{p.popupName}</Text>
            <View style={s.headerMetaRow}>
              <Text style={s.headerMeta}>{p.startDate} ~ {p.endDate}</Text>
            </View>
          </View>
        </View>

        <View style={s.card}>
          <View style={s.progressLabelRow}>
            <Text style={s.cardTitle}>운영 진행률</Text>
            <Text style={s.progressPctText}>{progressPct}%</Text>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <View style={s.progressFootRow}>
            <Text style={s.progressFootText}>현재 운영 {p.elapsedDays}일 / 총 {p.totalDays}일</Text>
            <Text style={s.progressFootText}>{p.status === '종료' ? '운영 종료' : `잔여 ${p.remainingDays}일`}</Text>
          </View>
        </View>

        <View style={s.kpiGrid}>
          <View style={s.kpiTileAccent}>
            <Text style={s.kpiLabel}>총 매출</Text>
            <Text style={s.kpiValueAccent}><Won value={p.totalRevenue} /></Text>
          </View>
          <View style={s.kpiTile}>
            <Text style={s.kpiLabel}>총 주문</Text>
            <Text style={s.kpiValue}>{p.totalOrders}건</Text>
          </View>
          <View style={s.kpiTile}>
            <Text style={s.kpiLabel}>평균 객단가</Text>
            <Text style={s.kpiValue}>{p.avgOrderValue > 0 ? <Won value={p.avgOrderValue} /> : '-'}</Text>
          </View>
          <View style={s.kpiTileAccent}>
            <Text style={s.kpiLabel}>운영일수 평균 매출</Text>
            <Text style={s.kpiValueAccent}>{p.avgDailyRevenue > 0 ? <Won value={p.avgDailyRevenue} /> : '-'}</Text>
            {p.elapsedDays > 0 && <Text style={s.kpiSub}>운영 {p.elapsedDays}일 기준</Text>}
          </View>
          <View style={s.kpiTile}>
            <Text style={s.kpiLabel}>일평균 주문</Text>
            <Text style={s.kpiValue}>{p.avgDailyOrders > 0 ? `${p.avgDailyOrders.toFixed(1)}건` : '-'}</Text>
          </View>
          <View style={s.kpiTile}>
            <Text style={s.kpiLabel}>판매 발생일</Text>
            <Text style={s.kpiValue}>{p.salesDays}일</Text>
            {p.elapsedDays > 0 && <Text style={s.kpiSub}>운영 {p.elapsedDays}일 중</Text>}
          </View>
          <View style={s.kpiTile}>
            <Text style={s.kpiLabel}>최고 매출일</Text>
            <Text style={s.kpiValue}>{p.bestDay ? <Won value={p.bestDay.revenue} /> : '-'}</Text>
            {p.bestDay && <Text style={s.kpiSub}>{p.bestDay.dateLabel}</Text>}
          </View>
          <View style={s.kpiTile}>
            <Text style={s.kpiLabel}>최저 매출일</Text>
            <Text style={s.kpiValue}>{p.worstDay ? <Won value={p.worstDay.revenue} /> : '-'}</Text>
            {p.worstDay && <Text style={s.kpiSub}>{p.worstDay.dateLabel}</Text>}
          </View>
        </View>

        <PageFooter />
      </Page>

      {/* ── 이후 페이지: 차트 섹션마다 한 페이지, 바로 뒤에 붙은 텍스트 블록은 그 차트 아래에 이어서 표시 ── */}
      {(() => {
        type ChartSection = Extract<ReportSection, { kind: 'chart' }>
        type TextSection = Extract<ReportSection, { kind: 'text' }>
        interface PageGroup { key: string; chart: ChartSection | null; texts: TextSection[] }

        // 텍스트 블록은 바로 앞 차트 섹션에 붙는다 — 첫 섹션이 텍스트면 차트 없는 메모 전용 그룹이 된다
        const groups: PageGroup[] = []
        for (const section of p.sections) {
          if (section.kind === 'chart') {
            groups.push({ key: section.id, chart: section, texts: [] })
          } else {
            if (groups.length === 0) groups.push({ key: section.id, chart: null, texts: [] })
            groups[groups.length - 1].texts.push(section)
          }
        }

        // compact: 뒤에 텍스트 블록이 붙는 차트는 노트가 들어갈 여백을 남기도록 조금 작게 그린다
        function renderChartCard(section: ChartSection, compact: boolean): React.ReactNode {
          switch (section.chartType) {
            case 'dailyBar':
              if (p.dailySales.length === 0) return null
              return (
                <View style={s.card} wrap={false}>
                  <CardHeader title="일자별 매출" right="파란 막대 = 토요일, 빨간 막대 = 일요일" />
                  <BarChart data={dailyBarData} width={CHART_W} height={compact ? 200 : 250} formatValue={formatRevenueTick} />
                </View>
              )
            case 'cumulative':
              if (p.dailySales.length === 0) return null
              return (
                <View style={s.card} wrap={false}>
                  <CardHeader title="운영 기간 누적 매출" right="점선 = 일평균 기준 페이스" />
                  <LineChart
                    values={cumulativeValues}
                    refValues={paceValues}
                    labels={p.dailySales.map((d) => d.dateLabel)}
                    width={CHART_W}
                    height={compact ? 200 : 250}
                    color={ACCENT}
                    refColor={AMBER}
                  />
                  <Text style={s.note}>실선이 점선보다 위에 있으면 평균보다 앞선 페이스입니다.</Text>
                </View>
              )
            case 'dayOfWeek':
              if (dayOfWeekBarData.length === 0) return null
              return (
                <View style={s.card} wrap={false}>
                  <CardHeader title="요일별 평균 매출" />
                  <BarChart data={dayOfWeekBarData} width={CHART_W} height={compact ? 180 : 220} formatValue={formatRevenueTick} />
                  <Text style={s.note}>괄호 안 숫자는 해당 요일이 운영 기간에 포함된 횟수입니다.</Text>
                </View>
              )
            case 'hourly':
              if (!hasHourly) return null
              return (
                <View style={s.card} wrap={false}>
                  <CardHeader title="시간대별 매출 분포" right="POS 주문 기준" />
                  <BarChart data={hourlyBarData} width={CHART_W} height={compact ? 180 : 220} formatValue={formatRevenueTick} />
                  <Text style={s.note}>POS 주문과 시간대별 수기 입력을 합산한 수치입니다.</Text>
                </View>
              )
            case 'menuDonut':
              if (donutData.length === 0) return null
              return (
                <View style={s.card}>
                  <CardHeader title="메뉴별 매출 비중" />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
                    <DonutChart data={donutData} size={compact ? 100 : 130} thickness={compact ? 16 : 20} />
                    <View style={{ flex: 1 }}>
                      {p.menuBreakdown.filter((m) => m.totalRevenue > 0).map((m) => {
                        const pct = menuTotal > 0 ? Math.round((m.totalRevenue / menuTotal) * 100) : 0
                        return (
                          <View key={m.id} style={s.legendRow}>
                            <View style={[s.legendDot, { backgroundColor: m.color }]} />
                            <Text style={s.legendName}>{m.name}</Text>
                            <Text style={s.legendValue}><Won value={m.totalRevenue} /> ({pct}%)</Text>
                          </View>
                        )
                      })}
                    </View>
                  </View>
                </View>
              )
            case 'dailyTable':
              return (
                <View style={s.card}>
                  <CardHeader title="일자별 매출·주문 내역" right={`총 ${p.dailySales.length}일`} />
                  {p.dailySales.length > 0 ? (
                    <View style={s.table}>
                      <View style={s.thead}>
                        <Text style={[s.th, { width: '22%' }]}>날짜</Text>
                        <Text style={[s.th, { width: '14%' }]}>요일</Text>
                        <Text style={[s.th, { width: '28%' }]}>매출</Text>
                        <Text style={[s.th, { width: '18%' }]}>주문 건수</Text>
                        <Text style={[s.th, { width: '18%' }]}>객단가</Text>
                      </View>
                      {p.dailySales.map((d, i) => {
                        const aov = d.orderCount > 0 ? Math.round(d.revenue / d.orderCount) : 0
                        return (
                          <View key={d.date} style={[s.trow, { backgroundColor: i % 2 === 1 ? ROW_ZEBRA : '#ffffff' }]}>
                            <Text style={[s.td, { width: '22%', fontWeight: 500 }]}>{d.date}</Text>
                            <Text style={[s.td, { width: '14%', color: weekendAccentColor(d.day, INK), fontWeight: 700 }]}>{d.day}요일</Text>
                            <Text style={[s.td, { width: '28%', fontWeight: 600 }]}>{d.revenue > 0 ? <Won value={d.revenue} /> : '-'}</Text>
                            <Text style={[s.td, { width: '18%' }]}>{d.orderCount}건</Text>
                            <Text style={[s.td, { width: '18%' }]}>{aov > 0 ? <Won value={aov} /> : '-'}</Text>
                          </View>
                        )
                      })}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 9.5, color: INK_FAINT }}>해당 팝업 기간에 매출 데이터가 없습니다.</Text>
                  )}
                </View>
              )
            default:
              return null
          }
        }

        return groups.map((group) => {
          const nonEmptyTexts = group.texts.filter((t) => t.content.trim())
          const chartCard = group.chart ? renderChartCard(group.chart, nonEmptyTexts.length > 0) : null
          if (!chartCard && nonEmptyTexts.length === 0) return null

          const title = group.chart ? REPORT_CHART_LABELS[group.chart.chartType] : '메모'

          return (
            <Page key={group.key} size="A4" style={s.page}>
              <Text style={s.pageEyebrow}>{p.popupName}</Text>
              <Text style={s.pageH1}>{title}</Text>
              {chartCard}
              {nonEmptyTexts.map((t) => (
                <View key={t.id} style={s.card}>
                  {t.content.trim().split(/\n{2,}/).map((paragraph, i) => (
                    <Text key={i} style={s.noteParagraph}>{paragraph.trim()}</Text>
                  ))}
                </View>
              ))}
              <PageFooter />
            </Page>
          )
        })
      })()}
    </Document>
  )
}
