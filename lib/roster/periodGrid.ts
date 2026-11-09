import { addDays } from '@/lib/date'
import { getWeekStart } from '@/lib/staffing'

/**
 * 근무표 '팝업 기간' 보기의 달력 칸 — 기간이 걸친 주(일~토)를 이어 붙이고 기간 밖 날짜는 null(빈 칸).
 * 달이 바뀌어도 끊지 않아 11/13~12/3 같은 팝업을 한 화면에 배치할 수 있다.
 */
export function buildPeriodGrid(from: string, to: string): (string | null)[] {
  if (!from || !to || from > to) return []
  const cells: (string | null)[] = []
  for (let d = getWeekStart(from); d <= to || cells.length % 7 !== 0; d = addDays(d, 1)) {
    cells.push(d >= from && d <= to ? d : null)
  }
  return cells
}
