import type { DayLabel } from '@/app/(admin)/stats/_lib/dayofweek'
import type { ReportLayout, SectionWidth } from '@/lib/reportLayout'

export type { ReportLayout, SectionWidth }

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
  hour: number
  label: string
  revenue: number
  orderCount: number
}

export interface PopupReportDayOfWeekRow {
  day: DayLabel
  avgRevenue: number
  dayCount: number
}

/** 요일 × 시간대 판매 현황 한 줄 — POS 주문 기준(수기 입력은 시간·요일 정보가 없어 빠진다) */
export interface PopupReportDayHourRow {
  day: DayLabel
  cells: { hour: number; revenue: number; orderCount: number }[]
}

/** 보고서에 넣을 수 있는 차트·정보 블록 종류 */
export type ReportChartType =
  | 'dailyBar'
  | 'cumulative'
  | 'aovTrend'
  | 'dailyOrders'
  | 'weeklySummary'
  | 'revenueDistribution'
  | 'paceForecast'
  | 'dayOfWeek'
  | 'weekdayWeekend'
  | 'hourly'
  | 'peakHours'
  | 'dayHourHeatmap'
  | 'menuDonut'
  | 'menuQuantity'
  | 'menuRanking'
  | 'menuPareto'
  | 'dailyTable'
  | 'calendar'

export const REPORT_CHART_LABELS: Record<ReportChartType, string> = {
  dailyBar: '일별 매출 추이',
  cumulative: '누적 매출 추이',
  aovTrend: '일별 객단가 추이',
  dailyOrders: '일별 주문 건수',
  weeklySummary: '주차별 요약',
  revenueDistribution: '일매출 분포·변동성',
  paceForecast: '진행 페이스·예상 매출',
  dayOfWeek: '요일별 평균 매출',
  weekdayWeekend: '주중 vs 주말',
  hourly: '시간대별 매출 분포',
  peakHours: '피크 시간대',
  dayHourHeatmap: '요일 × 시간대 히트맵',
  menuDonut: '메뉴별 매출 비중',
  menuQuantity: '메뉴별 판매 수량',
  menuRanking: '메뉴 판매 순위표',
  menuPareto: '메뉴 ABC 분석',
  dailyTable: '일별 매출 상세표',
  calendar: '날짜별 매출 프리뷰',
}

/** 컴팩트(2단) 레이아웃에서 섹션의 기본 폭 — 사용자가 섹션마다 바꿀 수 있다 */
export const REPORT_CHART_DEFAULT_WIDTH: Record<ReportChartType, SectionWidth> = {
  dailyBar: 'full',
  cumulative: 'half',
  aovTrend: 'half',
  dailyOrders: 'half',
  weeklySummary: 'full',
  revenueDistribution: 'half',
  paceForecast: 'half',
  dayOfWeek: 'half',
  weekdayWeekend: 'half',
  hourly: 'half',
  peakHours: 'half',
  dayHourHeatmap: 'full',
  menuDonut: 'half',
  menuQuantity: 'half',
  menuRanking: 'full',
  menuPareto: 'full',
  dailyTable: 'full',
  calendar: 'full',
}

/** 표처럼 반 폭에서는 읽을 수 없는 블록 — 폭 토글을 숨긴다 */
export const REPORT_CHART_FULL_ONLY: ReadonlySet<ReportChartType> = new Set(['dailyTable', 'menuRanking', 'weeklySummary', 'dayHourHeatmap', 'menuPareto'])

/** 모달 "차트 추가" 목록의 묶음 */
export const REPORT_CHART_GROUPS: { label: string; types: ReportChartType[] }[] = [
  { label: '매출 추이', types: ['dailyBar', 'cumulative', 'aovTrend', 'dailyOrders', 'paceForecast'] },
  { label: '요일·시간대', types: ['dayOfWeek', 'weekdayWeekend', 'hourly', 'peakHours', 'dayHourHeatmap'] },
  { label: '메뉴', types: ['menuDonut', 'menuQuantity', 'menuRanking', 'menuPareto'] },
  { label: '요약·표', types: ['weeklySummary', 'revenueDistribution', 'dailyTable', 'calendar'] },
]

/**
 * 보고서를 처음 열 때의 기본 구성(컴팩트 기준 추천 세트) — half 블록이 둘씩 짝지어지도록 순서를 맞췄다.
 * 표지 다음 약 3페이지: 매출 추이 → 요일·시간대 → 메뉴 → 표.
 */
export const DEFAULT_REPORT_CHARTS: ReportChartType[] = [
  'dailyBar',
  'cumulative', 'aovTrend',
  'dayOfWeek', 'hourly',
  'dayHourHeatmap',
  'menuDonut', 'menuQuantity',
  'weekdayWeekend', 'peakHours',
  'weeklySummary',
  'menuRanking',
  'dailyTable',
  'calendar',
]

export const REPORT_LAYOUT_LABELS: Record<ReportLayout, string> = {
  compact: '컴팩트(2단)',
  standard: '표준(1단)',
  onePerPage: '1차트 1페이지',
}

/** 사용자가 순서를 자유롭게 편집하는 보고서 본문 — 차트 섹션과 텍스트 블록을 섞어 배치할 수 있다 */
export type ReportSection =
  | { id: string; kind: 'chart'; chartType: ReportChartType; width?: SectionWidth }
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
  dayHour: PopupReportDayHourRow[]
  menuBreakdown: PopupReportMenuRow[]
  generatedAt: string
  /** 표지(핵심 지표 요약) 뒤에 이어지는 본문 — 차트 섹션 추가/삭제/순서 변경과 텍스트 블록 삽입을 그대로 반영한다 */
  sections: ReportSection[]
  /** 본문 배치 방식 — 기본 compact(2단 흐름) */
  layout?: ReportLayout
  /** 표지에 자동 생성 인사이트를 넣을지 — 기본 true */
  showInsights?: boolean
}

/** 데이터가 있어야 의미가 있는 블록만 true — 모달의 "추가" 목록과 PDF 렌더가 같은 기준을 쓴다 */
export function isReportChartAvailable(type: ReportChartType, d: PopupReportData): boolean {
  const hasDaily = d.dailySales.length > 0
  const hasOrders = d.dailySales.some((r) => r.orderCount > 0)
  const hasHourly = d.hourly.some((h) => h.orderCount > 0 || h.revenue > 0)
  const hasMenu = d.menuBreakdown.some((m) => m.totalRevenue > 0)
  switch (type) {
    case 'dailyBar':
    case 'cumulative':
    case 'calendar':
    case 'weeklySummary':
      return hasDaily
    case 'aovTrend':
    case 'dailyOrders':
      return hasOrders
    case 'revenueDistribution':
      return d.dailySales.filter((r) => r.revenue > 0).length >= 3
    case 'paceForecast':
      return d.status === '진행중' && d.projectedTotal !== null
    case 'dayOfWeek':
      return d.dayOfWeek.length > 0
    case 'weekdayWeekend':
      return hasDaily
    case 'hourly':
    case 'peakHours':
      return hasHourly
    case 'dayHourHeatmap':
      return d.dayHour.some((row) => row.cells.some((c) => c.orderCount > 0))
    case 'menuDonut':
    case 'menuQuantity':
    case 'menuRanking':
      return hasMenu
    case 'menuPareto':
      return d.menuBreakdown.filter((m) => m.totalRevenue > 0).length >= 3
    case 'dailyTable':
      return true
  }
}
