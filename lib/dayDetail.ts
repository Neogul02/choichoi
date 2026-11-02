// 통계탭 "날짜별 상세" — 지난 하루의 시간대별 매출을 어느 출처로 보여줄지 정하는 규칙.
//
// 시간대 수기 입력(manual_daily_hourly_sales)이 있는 날은 그걸 쓴다 — 오늘 현황·팝업 통계와 같은 우선순위.
// 없으면 POS 주문을 시각별로 묶는다. 전산값으로 하루 합계를 정정한 날도 POS 시간대를 그대로 보여주되,
// 합계와 다를 수 있으니 화면이 출처(source)를 보고 안내한다 — 정정한 날이 대부분이라 비우면 볼 게 없다.

export interface DayHourRow {
  hour: number
  revenue: number
  /** 시간대 수기 입력엔 주문 수가 없는 경우가 많다 — null이면 모름 */
  orders: number | null
}

export type DayHourlySource = 'manual' | 'pos' | 'none'

export function pickDayHourly(
  manual: DayHourRow[],
  pos: DayHourRow[],
): { source: DayHourlySource; hourly: DayHourRow[] } {
  const byHour = (rows: DayHourRow[]) => [...rows].sort((a, b) => a.hour - b.hour)
  if (manual.length > 0) return { source: 'manual', hourly: byHour(manual) }
  if (pos.length > 0) return { source: 'pos', hourly: byHour(pos) }
  return { source: 'none', hourly: [] }
}

/** 시간대 합계가 하루 합계와 다른지 — 정정값과 POS가 갈리면 화면에 "시간대는 POS 기준" 안내를 띄운다 */
export function hourlyDiffersFromTotal(hourly: DayHourRow[], totalRevenue: number): boolean {
  return hourly.length > 0 && hourly.reduce((s, h) => s + h.revenue, 0) !== totalRevenue
}
