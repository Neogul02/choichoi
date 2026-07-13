export const parseDate = (s: string): Date => new Date(s + 'T00:00:00')

export const toDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// (연, 0-기준 월, 일) → YYYY-MM-DD — Date 객체 없이 달력 그리드 셀을 만들 때 사용
export const ymdToDateStr = (y: number, m: number, d: number): string =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export const addDays = (s: string, n: number): string => {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

// KST 기준 오늘 날짜(YYYY-MM-DD) — 서버(UTC)/클라이언트 어디서든 동일
export const kstToday = (): string =>
  new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

export const prevDate = (s: string): string => addDays(s, -1)

export const dayOfWeek = (s: string): number => parseDate(s).getDay()

// 목금토(4,5,6)='A', 일월화수(0,1,2,3)='B'
export const dayGroup = (s: string): 'A' | 'B' => (dayOfWeek(s) >= 4 ? 'A' : 'B')

export const formatPhone = (p: string): string => {
  const d = p.replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return p
}
