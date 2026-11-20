import { addDays, parseDate } from './date'

/**
 * 지난 팝업의 "같은 운영 N일차" 고르기 — POS 오늘 현황의 '지난 팝업 비교'가 쓴다.
 * 날짜가 아니라 운영 시작일로부터 며칠째인지로 맞춘다(오늘이 청량리 8일차면 대구 #2 8일차와 비교).
 */
export interface PopupPeriod { id: number; name: string; start_date: string; end_date: string }

const DAY_MS = 86_400_000

/** 0부터 세는 운영 일차 — 시작 전이면 null */
export function popupDayIndex(popup: Pick<PopupPeriod, 'start_date' | 'end_date'>, date: string): number | null {
  if (date < popup.start_date) return null
  return Math.round((parseDate(date).getTime() - parseDate(popup.start_date).getTime()) / DAY_MS)
}

/** 비교 팝업의 같은 일차 날짜 — 그 팝업이 그만큼 길지 않았으면 null */
export function sameDayOfRun(current: PopupPeriod, compare: PopupPeriod, today: string): { date: string; dayNo: number } | null {
  const idx = popupDayIndex(current, today)
  if (idx == null) return null
  const date = addDays(compare.start_date, idx)
  if (date > compare.end_date) return null
  return { date, dayNo: idx + 1 }
}

/** '대구 신세계 #3' → '대구 신세계' — 같은 매장의 지난 회차를 찾는 기준 */
export const popupBaseName = (name: string) => name.replace(/\s*#\s*\d+\s*$/, '').trim()

/**
 * 비교할 수 있는 지난 팝업 — 지금 팝업보다 먼저 시작해 이미 끝난 것.
 * 같은 매장의 지난 회차(대구 신세계 #3 → #2)를 맨 앞에, 나머지는 최근 끝난 순. 맨 앞이 기본 비교 대상이다.
 */
export function pastPopupsFor(current: PopupPeriod, all: PopupPeriod[], today: string): PopupPeriod[] {
  const base = popupBaseName(current.name)
  const sameStore = (p: PopupPeriod) => (popupBaseName(p.name) === base ? 0 : 1)
  return all
    .filter(p => p.id !== current.id && p.start_date < current.start_date && p.end_date < today)
    .sort((a, b) => sameStore(a) - sameStore(b) || b.end_date.localeCompare(a.end_date) || b.id - a.id)
}
