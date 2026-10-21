'use client'

import { Document, Page, Text, View } from '@react-pdf/renderer'
import type React from 'react'
import { formatPrice, formatRevenueTick } from '@/lib/utils'
import { buildMenuPareto, buildReportInsights, findPeakHours } from '@/lib/reportMetrics'
import { packReportSections } from '@/lib/reportLayout'
import type { SectionBlock } from '@/lib/reportLayout'
import {
  ACCENT, DOWN, CHART_H_FULL, CHART_H_HALF, CHART_H_LARGE, CHART_W_FULL, CHART_W_HALF, HALF_W, INK_FAINT, INK_MUTED, s,
  type PdfStyle,
} from './theme'
import { Sparkline } from './primitives'
import { renderSection, Won } from './sections'
import type { SectionSize } from './sections'
import { REPORT_CHART_DEFAULT_WIDTH, REPORT_CHART_LABELS, isReportChartAvailable } from './types'
import type { PopupReportData, ReportChartType } from './types'

const STATUS_BADGE: Record<PopupReportData['status'], { bg: string; fg: string }> = {
  진행중: { bg: '#eaf6f0', fg: ACCENT },
  예정: { bg: '#fef3c7', fg: '#b45309' },
  종료: { bg: '#eef0ef', fg: INK_MUTED },
}

/** 텍스트가 이 길이를 넘으면 카드를 한 페이지에 묶지 않는다 — 한 페이지보다 큰 wrap=false 카드는 레이아웃이 깨진다 */
const UNBREAKABLE_TEXT_LIMIT = 700

function CardHeader({ title, right }: { title: string; right?: string }) {
  return (
    <View style={s.cardHeaderRow}>
      <View style={s.cardAccentBar} />
      <Text style={[s.cardTitle, { flex: 1 }]}>{title}</Text>
      {right && <Text style={[s.cardTitleRight, { maxWidth: '62%' }]}>{right}</Text>}
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

function RunningHeader({ p }: { p: PopupReportData }) {
  return (
    <View style={s.runningHeader} fixed>
      <Text style={s.runningTitle}>{p.popupName} · 매출 분석 보고서</Text>
      <Text style={s.runningMeta}>{p.startDate} ~ {p.endDate}</Text>
    </View>
  )
}

function Paragraphs({ texts }: { texts: string[] }) {
  return (
    <>
      {texts.flatMap((t, ti) =>
        t.split(/\n{2,}/).map((paragraph, i) => (
          <Text key={`${ti}-${i}`} style={s.noteParagraph}>{paragraph.trim()}</Text>
        )),
      )}
    </>
  )
}

/** 차트(또는 메모) 블록 하나 = 카드 하나. 뒤에 붙은 텍스트는 같은 카드 하단에 들어가 함께 움직인다 */
function SectionCard({ block, p, size, style }: { block: SectionBlock<ReportChartType>; p: PopupReportData; size: SectionSize; style: PdfStyle }) {
  const content = block.chartType ? renderSection(block.chartType, p, size) : null
  if (!content && block.texts.length === 0) return null
  const textLength = block.texts.reduce((n, t) => n + t.length, 0)
  const breakable = (content?.breakable ?? false) || textLength > UNBREAKABLE_TEXT_LIMIT || !content

  return (
    <View style={style} wrap={breakable} minPresenceAhead={breakable ? 60 : undefined}>
      <CardHeader title={content?.title ?? '메모'} right={content?.right} />
      {content?.body}
      {block.texts.length > 0 && (
        <View style={content ? s.textAttach : undefined}>
          <Paragraphs texts={block.texts} />
        </View>
      )}
    </View>
  )
}

const SIZE_FULL: SectionSize = { w: CHART_W_FULL, h: CHART_H_FULL, half: false }
const SIZE_HALF: SectionSize = { w: CHART_W_HALF, h: CHART_H_HALF, half: true }
const SIZE_LARGE: SectionSize = { w: CHART_W_FULL, h: CHART_H_LARGE, half: false }

// ── 표지: 핵심 지표 + 한 장 요약 ─────────────────────────────────────────────

function CoverPage({ p }: { p: PopupReportData }) {
  const progressPct = p.totalDays > 0 ? Math.min(100, Math.round((p.elapsedDays / p.totalDays) * 100)) : 0
  const badge = STATUS_BADGE[p.status]
  const insights = p.showInsights === false
    ? []
    : buildReportInsights({
      daily: p.dailySales,
      hourly: p.hourly,
      menus: p.menuBreakdown,
      startDate: p.startDate,
      elapsedDays: p.elapsedDays,
      status: p.status,
      projectedTotal: p.projectedTotal,
      totalRevenue: p.totalRevenue,
    })

  const topMenu = buildMenuPareto(p.menuBreakdown)[0] ?? null
  const bestWeekday = p.dayOfWeek.reduce<PopupReportData['dayOfWeek'][number] | null>((b, r) => (!b || r.avgRevenue > b.avgRevenue ? r : b), null)
  const peak = findPeakHours(p.hourly).window
  const sparkValues = p.dailySales.map((d) => d.revenue)

  const kpis: { label: string; value: React.ReactNode; sub?: string; accent?: boolean }[] = [
    { label: '총 매출', value: <Won value={p.totalRevenue} />, accent: true },
    { label: '총 주문', value: `${formatPrice(p.totalOrders)}건` },
    { label: '평균 객단가', value: p.avgOrderValue > 0 ? <Won value={p.avgOrderValue} /> : '-' },
    { label: '운영일 평균 매출', value: p.avgDailyRevenue > 0 ? <Won value={p.avgDailyRevenue} /> : '-', sub: p.elapsedDays > 0 ? `운영 ${p.elapsedDays}일 기준` : undefined, accent: true },
    { label: '일평균 주문', value: p.avgDailyOrders > 0 ? `${p.avgDailyOrders.toFixed(1)}건` : '-' },
    { label: '판매 발생일', value: `${p.salesDays}일`, sub: p.elapsedDays > 0 ? `운영 ${p.elapsedDays}일 중` : undefined },
    { label: '최고 매출일', value: p.bestDay ? <Won value={p.bestDay.revenue} /> : '-', sub: p.bestDay ? `${p.bestDay.dateLabel} (${p.bestDay.day})` : undefined },
    { label: '최저 매출일', value: p.worstDay ? <Won value={p.worstDay.revenue} /> : '-', sub: p.worstDay ? `${p.worstDay.dateLabel} (${p.worstDay.day})` : undefined },
  ]

  const highlights = [
    topMenu && { label: '매출 1위 메뉴', value: topMenu.name, sub: `매출의 ${topMenu.share}% · ${formatPrice(topMenu.totalQuantity)}개` },
    bestWeekday && { label: '가장 강한 요일', value: `${bestWeekday.day}요일`, sub: `평균 ${formatRevenueTick(bestWeekday.avgRevenue)}` },
    peak && { label: '피크 시간대', value: `${String(peak.fromHour).padStart(2, '0')}~${String(peak.toHour).padStart(2, '0')}시`, sub: `시간대 매출의 ${peak.share}%` },
  ].filter(Boolean) as { label: string; value: string; sub: string }[]

  return (
    <Page size="A4" style={s.page}>
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>POPUP SALES REPORT</Text>
          <Text style={s.h1}>{p.popupName}</Text>
          <View style={s.headerMetaRow}>
            <Text style={s.headerMeta}>{p.startDate} ~ {p.endDate} · 총 {p.totalDays}일</Text>
            <Text style={[s.statusBadge, { backgroundColor: badge.bg, color: badge.fg }]}>{p.status}</Text>
          </View>
        </View>
        <Text style={s.generatedAt}>{p.generatedAt}{'\n'}생성</Text>
      </View>

      <View style={s.cardFlow}>
        <View style={s.progressLabelRow}>
          <Text style={s.cardTitle}>운영 진행률</Text>
          <Text style={s.progressPctText}>{progressPct}%</Text>
        </View>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <View style={s.progressFootRow}>
          <Text style={s.progressFootText}>현재 운영 {p.elapsedDays}일 / 총 {p.totalDays}일</Text>
          <Text style={s.progressFootText}>
            {p.status === '종료' ? '운영 종료' : `잔여 ${p.remainingDays}일`}
            {p.projectedTotal !== null && p.status === '진행중' ? `  ·  예상 총매출 ₩${formatPrice(p.projectedTotal)}` : ''}
          </Text>
        </View>
      </View>

      <View style={[s.kpiGrid, { marginBottom: 12 }]}>
        {kpis.map((k) => (
          <View key={k.label} style={k.accent ? s.kpiTileAccent : s.kpiTile}>
            <Text style={s.kpiLabel}>{k.label}</Text>
            <Text style={k.accent ? s.kpiValueAccent : s.kpiValue}>{k.value}</Text>
            {k.sub && <Text style={s.kpiSub}>{k.sub}</Text>}
          </View>
        ))}
      </View>

      {sparkValues.length > 1 && (
        <View style={s.cardFlow}>
          <View style={s.cardHeaderRow}>
            <View style={s.cardAccentBar} />
            <Text style={[s.cardTitle, { flex: 1 }]}>일별 매출 흐름</Text>
            {p.bestDay && p.worstDay && (
              <Text style={s.cardTitleRight}>
                <Text style={{ color: ACCENT }}>●</Text> 최고 {p.bestDay.dateLabel}   <Text style={{ color: DOWN }}>●</Text> 최저 {p.worstDay.dateLabel}
              </Text>
            )}
          </View>
          <Sparkline values={sparkValues} width={CHART_W_FULL} height={64} color={ACCENT} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
            <Text style={{ fontSize: 7, color: INK_FAINT }}>{p.dailySales[0].dateLabel}</Text>
            <Text style={{ fontSize: 7, color: INK_FAINT }}>{p.dailySales[p.dailySales.length - 1].dateLabel}</Text>
          </View>
        </View>
      )}

      {insights.length > 0 && (
        <View style={s.cardFlow}>
          <CardHeader title="핵심 인사이트" right="매출 데이터 기반 자동 요약" />
          {insights.map((ins, i) => (
            <View key={i} style={s.insightRow}>
              <View style={s.insightBullet}><Text style={s.insightBulletText}>{i + 1}</Text></View>
              <Text style={s.insightText}>
                {ins.before}<Text style={{ fontWeight: 800, color: ACCENT }}>{ins.emphasis}</Text>{ins.after}
              </Text>
            </View>
          ))}
        </View>
      )}

      {highlights.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {highlights.map((h) => (
            <View key={h.label} style={{ flex: 1, borderRadius: 8, padding: 10, backgroundColor: '#f6f8f7', border: '1px solid #e6e9e6' }}>
              <Text style={s.kpiLabel}>{h.label}</Text>
              <Text style={[s.kpiValue, { fontSize: 12.5 }]}>{h.value}</Text>
              <Text style={s.kpiSub}>{h.sub}</Text>
            </View>
          ))}
        </View>
      )}

      <PageFooter />
    </Page>
  )
}

// ── 문서 ────────────────────────────────────────────────────────────────────

export function PopupReportDocument(p: PopupReportData) {
  const layout = p.layout ?? 'compact'
  // 데이터가 없는 차트는 미리 걸러야 2단 짝짓기에서 빈 칸이 생기지 않는다
  const sections = p.sections.filter((sec) => sec.kind === 'text' || isReportChartAvailable(sec.chartType, p))
  const rows = packReportSections(sections, layout, (type) => REPORT_CHART_DEFAULT_WIDTH[type])

  return (
    <Document title={`${p.popupName} 매출 분석 보고서`} subject="팝업 매출 분석" creator="ChoiChoi POS" producer="ChoiChoi POS">
      <CoverPage p={p} />

      {layout === 'onePerPage'
        ? rows.map((row) => {
          if (row.kind !== 'full') return null
          const { block } = row
          return (
            <Page key={row.key} size="A4" style={s.bodyPage}>
              <RunningHeader p={p} />
              <Text style={s.pageH1}>{block.chartType ? REPORT_CHART_LABELS[block.chartType] : '메모'}</Text>
              <SectionCard block={block} p={p} size={SIZE_LARGE} style={s.cardFlow} />
              <PageFooter />
            </Page>
          )
        })
        : rows.length > 0 && (
          <Page size="A4" style={s.bodyPage}>
            <RunningHeader p={p} />
            {rows.map((row) =>
              row.kind === 'full' ? (
                <SectionCard key={row.key} block={row.block} p={p} size={SIZE_FULL} style={s.cardFlow} />
              ) : (
                <View key={row.key} style={s.row} wrap={false}>
                  <SectionCard block={row.left} p={p} size={SIZE_HALF} style={[s.card, { width: HALF_W }]} />
                  {row.right
                    ? <SectionCard block={row.right} p={p} size={SIZE_HALF} style={[s.card, { width: HALF_W }]} />
                    : <View style={{ width: HALF_W }} />}
                </View>
              ),
            )}
            <PageFooter />
          </Page>
        )}
    </Document>
  )
}
