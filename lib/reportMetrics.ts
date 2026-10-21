import { DAY_NAMES } from '@/lib/staffing'

// 팝업 매출 보고서(PDF) 전용 집계 — 화면(PopupStatsSection)이 이미 들고 있는 일별·시간대·메뉴 데이터에서만
// 파생한다. PDF 컴포넌트 안에서 숫자를 다시 계산하지 않도록 전부 여기 순수 함수로 둔다.

export interface ReportDailyInput {
  date: string
  revenue: number
  orderCount: number
}

export interface ReportHourlyInput {
  hour: number
  label: string
  revenue: number
  orderCount: number
}

export interface ReportMenuInput {
  id: number
  name: string
  color: string
  totalQuantity: number
  totalRevenue: number
}

type DayName = (typeof DAY_NAMES)[number]

function dayOf(date: string): DayName {
  const [y, m, d] = date.split('-').map(Number)
  return DAY_NAMES[new Date(y, m - 1, d).getDay()]
}

/** 'YYYY-MM-DD' 두 날짜 사이 일수 (b - a). 로컬 자정 기준이라 타임존과 무관하다 */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

function pctChange(value: number, base: number): number | null {
  return base > 0 ? Math.round(((value - base) / base) * 100) : null
}

// ── 주차별 요약 ─────────────────────────────────────────────────────────────

export interface WeeklySummaryRow {
  week: number
  startDate: string
  endDate: string
  revenue: number
  orderCount: number
  /** 해당 주에 판매가 있었던 날 수 */
  salesDays: number
  avgOrderValue: number
  /** 직전 주 대비 매출 증감률(%) — 첫 주이거나 직전 주 매출이 0이면 null */
  changePct: number | null
}

/**
 * 팝업 시작일부터 7일씩 끊어 주차를 만든다. 달력 주(월~일)가 아니라 운영 주차라서
 * 팝업이 수요일에 열려도 1주차가 온전히 7일이 된다. 마지막 주는 종료일에서 잘린다.
 */
export function buildWeeklySummary(daily: ReportDailyInput[], startDate: string, endDate: string): WeeklySummaryRow[] {
  const totalDays = daysBetween(startDate, endDate) + 1
  if (totalDays <= 0) return []
  const weekCount = Math.ceil(totalDays / 7)
  const rows: WeeklySummaryRow[] = Array.from({ length: weekCount }, (_, i) => ({
    week: i + 1,
    startDate: addDays(startDate, i * 7),
    endDate: i === weekCount - 1 ? endDate : addDays(startDate, i * 7 + 6),
    revenue: 0,
    orderCount: 0,
    salesDays: 0,
    avgOrderValue: 0,
    changePct: null,
  }))

  for (const d of daily) {
    const idx = Math.floor(daysBetween(startDate, d.date) / 7)
    if (idx < 0 || idx >= weekCount) continue
    rows[idx].revenue += d.revenue
    rows[idx].orderCount += d.orderCount
    if (d.revenue > 0) rows[idx].salesDays += 1
  }

  // 아직 오지 않은 주(매출·주문 모두 0이고 뒤에도 실적이 없음)는 표에서 뺀다
  let lastActive = -1
  rows.forEach((r, i) => { if (r.revenue > 0 || r.orderCount > 0) lastActive = i })
  const trimmed = rows.slice(0, lastActive + 1)

  return trimmed.map((r, i) => ({
    ...r,
    avgOrderValue: r.orderCount > 0 ? Math.round(r.revenue / r.orderCount) : 0,
    changePct: i === 0 ? null : pctChange(r.revenue, trimmed[i - 1].revenue),
  }))
}

// ── 주중 vs 주말 ────────────────────────────────────────────────────────────

export interface DayGroupStats {
  days: number
  avgRevenue: number
  avgOrders: number
  avgOrderValue: number
}

export interface WeekdayWeekendSplit {
  weekday: DayGroupStats
  weekend: DayGroupStats
  /** 주말 일평균 매출이 주중 대비 몇 % 높은지 — 한쪽이 비면 null */
  weekendLiftPct: number | null
}

export function splitWeekdayWeekend(daily: ReportDailyInput[]): WeekdayWeekendSplit {
  const agg = { weekday: { days: 0, revenue: 0, orders: 0 }, weekend: { days: 0, revenue: 0, orders: 0 } }
  for (const d of daily) {
    const day = dayOf(d.date)
    const key = day === '토' || day === '일' ? 'weekend' : 'weekday'
    agg[key].days += 1
    agg[key].revenue += d.revenue
    agg[key].orders += d.orderCount
  }
  const toStats = (a: { days: number; revenue: number; orders: number }): DayGroupStats => ({
    days: a.days,
    avgRevenue: a.days > 0 ? Math.round(a.revenue / a.days) : 0,
    avgOrders: a.days > 0 ? Math.round((a.orders / a.days) * 10) / 10 : 0,
    avgOrderValue: a.orders > 0 ? Math.round(a.revenue / a.orders) : 0,
  })
  const weekday = toStats(agg.weekday)
  const weekend = toStats(agg.weekend)
  return {
    weekday,
    weekend,
    weekendLiftPct: weekday.days > 0 && weekend.days > 0 ? pctChange(weekend.avgRevenue, weekday.avgRevenue) : null,
  }
}

// ── 메뉴 파레토(ABC) ────────────────────────────────────────────────────────

export type MenuGrade = 'A' | 'B' | 'C'

export interface MenuParetoRow extends ReportMenuInput {
  rank: number
  /** 전체 메뉴 매출 대비 비중(%) */
  share: number
  /** 1위부터 이 메뉴까지 누적 비중(%) */
  cumulativeShare: number
  grade: MenuGrade
  /** 개당 평균 판매가 */
  avgPrice: number
}

/**
 * 매출 내림차순으로 누적 비중을 매겨 A(누적 80%까지)·B(95%까지)·C(나머지)로 나눈다.
 * 경계는 "이 메뉴를 더하기 전" 누적 비중으로 판정해 1위 메뉴는 늘 A가 된다.
 */
export function buildMenuPareto(menus: ReportMenuInput[]): MenuParetoRow[] {
  const sold = menus.filter((m) => m.totalRevenue > 0).sort((a, b) => b.totalRevenue - a.totalRevenue)
  const total = sold.reduce((s, m) => s + m.totalRevenue, 0)
  if (total === 0) return []
  let cumulative = 0
  return sold.map((m, i) => {
    const before = (cumulative / total) * 100
    cumulative += m.totalRevenue
    const grade: MenuGrade = before < 80 ? 'A' : before < 95 ? 'B' : 'C'
    return {
      ...m,
      rank: i + 1,
      share: Math.round((m.totalRevenue / total) * 1000) / 10,
      cumulativeShare: Math.round((cumulative / total) * 1000) / 10,
      grade,
      avgPrice: m.totalQuantity > 0 ? Math.round(m.totalRevenue / m.totalQuantity) : 0,
    }
  })
}

// ── 일매출 분포·변동성 ──────────────────────────────────────────────────────

export interface HistogramBin {
  from: number
  to: number
  count: number
}

export interface RevenueStats {
  /** 판매가 있었던 날만 대상으로 한 통계 */
  days: number
  mean: number
  median: number
  stdDev: number
  /** 변동계수(%) = 표준편차 / 평균 — 날마다 매출이 얼마나 출렁이는지 */
  cv: number
  min: number
  max: number
  bins: HistogramBin[]
}

export function computeRevenueStats(daily: ReportDailyInput[], binCount = 6): RevenueStats | null {
  const values = daily.map((d) => d.revenue).filter((v) => v > 0).sort((a, b) => a - b)
  if (values.length === 0) return null
  const n = values.length
  const mean = values.reduce((s, v) => s + v, 0) / n
  const median = n % 2 === 1 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2
  const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
  const min = values[0]
  const max = values[n - 1]

  const bucketCount = Math.max(1, Math.min(binCount, n))
  const span = max - min
  const step = span > 0 ? span / bucketCount : 1
  const bins: HistogramBin[] = Array.from({ length: bucketCount }, (_, i) => ({
    from: Math.round(min + step * i),
    to: Math.round(i === bucketCount - 1 ? max : min + step * (i + 1)),
    count: 0,
  }))
  for (const v of values) {
    const idx = span > 0 ? Math.min(bucketCount - 1, Math.floor((v - min) / step)) : 0
    bins[idx].count += 1
  }

  return {
    days: n,
    mean: Math.round(mean),
    median: Math.round(median),
    stdDev: Math.round(stdDev),
    cv: mean > 0 ? Math.round((stdDev / mean) * 100) : 0,
    min,
    max,
    bins,
  }
}

// ── 시간대 ──────────────────────────────────────────────────────────────────

/** 시간대 축에서 판매가 처음·마지막으로 있었던 구간만 남긴다 (09~21시 고정 축의 빈 막대 제거) */
export function trimHourlyRange<T extends { revenue: number; orderCount: number }>(hourly: T[]): T[] {
  const active = (h: T) => h.revenue > 0 || h.orderCount > 0
  const first = hourly.findIndex(active)
  if (first === -1) return []
  let last = first
  hourly.forEach((h, i) => { if (active(h)) last = i })
  return hourly.slice(first, last + 1)
}

export interface PeakHour {
  hour: number
  label: string
  revenue: number
  orderCount: number
  /** 전체 시간대 매출 대비 비중(%) */
  share: number
}

export interface PeakHoursResult {
  top: PeakHour[]
  /** 매출이 가장 많이 몰린 연속 구간(windowSize시간) */
  window: { fromHour: number; toHour: number; revenue: number; share: number } | null
  totalRevenue: number
}

export function findPeakHours(hourly: ReportHourlyInput[], topN = 3, windowSize = 2): PeakHoursResult {
  const total = hourly.reduce((s, h) => s + h.revenue, 0)
  if (total === 0) return { top: [], window: null, totalRevenue: 0 }
  const share = (v: number) => Math.round((v / total) * 1000) / 10
  const top = [...hourly]
    .filter((h) => h.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, topN)
    .map((h) => ({ hour: h.hour, label: h.label, revenue: h.revenue, orderCount: h.orderCount, share: share(h.revenue) }))

  // 시간 순으로 정렬된 축에서 연속 windowSize칸 합이 최대인 구간
  const sorted = [...hourly].sort((a, b) => a.hour - b.hour)
  let window: PeakHoursResult['window'] = null
  if (sorted.length >= windowSize) {
    for (let i = 0; i + windowSize <= sorted.length; i++) {
      const slice = sorted.slice(i, i + windowSize)
      if (slice[slice.length - 1].hour - slice[0].hour !== windowSize - 1) continue
      const revenue = slice.reduce((s, h) => s + h.revenue, 0)
      if (!window || revenue > window.revenue) {
        window = { fromHour: slice[0].hour, toHour: slice[slice.length - 1].hour + 1, revenue, share: share(revenue) }
      }
    }
  }
  return { top, window, totalRevenue: total }
}

// ── 판매 없는 날 ────────────────────────────────────────────────────────────

/** 운영 시작일부터 경과일 동안 매출이 0이었던(또는 기록이 없는) 날짜 */
export function findNoSalesDates(daily: ReportDailyInput[], startDate: string, elapsedDays: number): string[] {
  const sold = new Set(daily.filter((d) => d.revenue > 0).map((d) => d.date))
  const result: string[] = []
  for (let i = 0; i < elapsedDays; i++) {
    const date = addDays(startDate, i)
    if (!sold.has(date)) result.push(date)
  }
  return result
}

// ── 핵심 인사이트 ───────────────────────────────────────────────────────────

export interface ReportInsightInput {
  daily: ReportDailyInput[]
  hourly: ReportHourlyInput[]
  menus: ReportMenuInput[]
  startDate: string
  elapsedDays: number
  status: '예정' | '진행중' | '종료'
  projectedTotal: number | null
  totalRevenue: number
}

/** 강조할 부분을 분리해 둔 인사이트 문장 — PDF에서 emphasis만 굵게 칠한다 */
export interface ReportInsight {
  before: string
  emphasis: string
  after: string
}

const fmtKrw = (v: number) => `₩${new Intl.NumberFormat('ko-KR').format(v)}`
const fmtMd = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`

/**
 * 규칙 기반으로 표지에 넣을 결론 문장을 최대 maxCount개 만든다. 데이터가 부족한 규칙은
 * 건너뛰므로 문장 수는 가변이다. 우선순위: 요일 → 시간대 → 메뉴 집중도 → 최근 추세 → 판매 없는 날 → 예상 매출.
 */
export function buildReportInsights(input: ReportInsightInput, maxCount = 5): ReportInsight[] {
  const out: ReportInsight[] = []
  const { daily } = input

  // 1) 주말 효과 — 주중·주말이 모두 2일 이상일 때만 (하루짜리 비교는 우연에 가깝다)
  const split = splitWeekdayWeekend(daily)
  if (split.weekday.days >= 2 && split.weekend.days >= 2 && split.weekendLiftPct !== null && Math.abs(split.weekendLiftPct) >= 5) {
    const higher = split.weekendLiftPct > 0
    out.push({
      before: `주말 일평균 매출이 주중보다 `,
      emphasis: `${Math.abs(split.weekendLiftPct)}% ${higher ? '높습니다' : '낮습니다'}`,
      after: ` (주말 ${fmtKrw(split.weekend.avgRevenue)} · 주중 ${fmtKrw(split.weekday.avgRevenue)}).`,
    })
  }

  // 2) 피크 시간대
  const peak = findPeakHours(input.hourly)
  if (peak.window && peak.window.share >= 15) {
    out.push({
      before: '매출 피크는 ',
      emphasis: `${String(peak.window.fromHour).padStart(2, '0')}~${String(peak.window.toHour).padStart(2, '0')}시`,
      after: `로, 전체 시간대 매출의 ${peak.window.share}%가 이 구간에 몰렸습니다.`,
    })
  }

  // 3) 메뉴 집중도 — 메뉴가 4개 이상일 때 상위 3개 비중
  const pareto = buildMenuPareto(input.menus)
  if (pareto.length >= 4) {
    const top3 = pareto.slice(0, 3)
    out.push({
      before: '상위 3개 메뉴가 매출의 ',
      emphasis: `${top3[2].cumulativeShare}%`,
      after: `를 차지합니다 (${top3.map((m) => m.name).join(' · ')}).`,
    })
  } else if (pareto.length > 0) {
    out.push({ before: '가장 많이 팔린 메뉴는 ', emphasis: pareto[0].name, after: `로 매출의 ${pareto[0].share}%입니다.` })
  }

  // 4) 최근 7일 추세 — 판매일 14일 이상일 때만
  const soldDays = [...daily].filter((d) => d.revenue > 0).sort((a, b) => a.date.localeCompare(b.date))
  if (soldDays.length >= 14) {
    const recent = soldDays.slice(-7)
    const recentAvg = recent.reduce((s, d) => s + d.revenue, 0) / recent.length
    const allAvg = soldDays.reduce((s, d) => s + d.revenue, 0) / soldDays.length
    const change = pctChange(recentAvg, allAvg)
    if (change !== null && Math.abs(change) >= 5) {
      out.push({
        before: '최근 7일 일평균이 전체 판매일 평균 대비 ',
        emphasis: `${change > 0 ? '+' : ''}${change}%`,
        after: change > 0 ? '로 상승 추세입니다.' : '로 하락 추세입니다.',
      })
    }
  }

  // 5) 판매가 없던 날
  const noSales = findNoSalesDates(daily, input.startDate, input.elapsedDays)
  if (noSales.length > 0 && noSales.length < input.elapsedDays) {
    const shown = noSales.slice(0, 4).map(fmtMd).join(', ')
    out.push({
      before: '운영 기간 중 판매가 없던 날이 ',
      emphasis: `${noSales.length}일`,
      after: ` 있습니다 (${shown}${noSales.length > 4 ? ' 외' : ''}).`,
    })
  }

  // 6) 진행중이면 예상 총매출
  if (input.status === '진행중' && input.projectedTotal && input.projectedTotal > input.totalRevenue) {
    out.push({
      before: '현재 페이스가 이어지면 종료 시 총매출은 약 ',
      emphasis: fmtKrw(input.projectedTotal),
      after: '으로 예상됩니다.',
    })
  }

  return out.slice(0, maxCount)
}
