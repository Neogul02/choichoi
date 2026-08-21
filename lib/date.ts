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

// 현재 시각을 KST로 이동한 Date — getUTC*() 메서드로 KST 벽시계 값을 읽는다
export const kstNow = (): Date => new Date(Date.now() + 9 * 3600 * 1000)

// KST 기준 오늘 날짜(YYYY-MM-DD) — 서버(UTC)/클라이언트 어디서든 동일
export const kstToday = (): string => kstNow().toISOString().slice(0, 10)

// Supabase timestamp 컬럼(created_at 등)은 공백 구분자·오프셋 없는 naive UTC로 올 때가 있어
// Date 생성자가 로컬 타임존으로 잘못 해석하지 않도록 UTC임을 명시한 뒤 파싱한다.
function parseTimestampAsUTC(timestamp: string): number {
  const s = timestamp.replace(' ', 'T')
  const hasOffset = s.endsWith('Z') || /[+-]\d{2}(?::\d{2})?$/.test(s)
  return new Date(hasOffset ? s : s + 'Z').getTime()
}

// UTC 타임스탬프를 KST로 이동한 Date — getUTC*() 메서드로 KST 벽시계 값을 읽는다
export const utcToKst = (timestamp: string): Date =>
  new Date(parseTimestampAsUTC(timestamp) + 9 * 3600 * 1000)

// UTC 타임스탬프 → KST 기준 YYYY-MM-DD
export const utcToKstDateStr = (timestamp: string): string =>
  utcToKst(timestamp).toISOString().slice(0, 10)

// KST 기준 하루의 UTC ISO 경계 — created_at은 timestamp without time zone(naive UTC) 컬럼이라
// +09:00 오프셋 문자열을 그대로 보내면 PostgREST가 오프셋을 버리고 캐스팅해 9시간이 어긋난다.
// UTC로 직접 환산해 보낸다. orders·stats의 "당일" 범위 조회 전역 기준.
export function getKSTDateBounds(kstDateStr?: string): { start: string; end: string } {
  const d = kstDateStr ?? kstToday()
  return {
    start: new Date(`${d}T00:00:00+09:00`).toISOString(),
    end: new Date(`${d}T23:59:59.999+09:00`).toISOString(),
  }
}

// KST 기준 현재 (연, 0-기준 월) — "이번 달" 범위 계산의 공통 시작점
export const kstYearMonth = (): { y: number; m: number } => {
  const [y, mo] = kstToday().split('-').map(Number)
  return { y, m: mo - 1 }
}

// (연, 0-기준 월)이 속한 달의 말일 → YYYY-MM-DD
export const monthEndDateStr = (y: number, m: number): string => {
  const end = new Date(Date.UTC(y, m + 1, 0))
  return ymdToDateStr(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
}

export const prevDate = (s: string): string => addDays(s, -1)

export const dayOfWeek = (s: string): number => parseDate(s).getDay()

// 목금토(4,5,6)='A', 일월화수(0,1,2,3)='B'
export const dayGroup = (s: string): 'A' | 'B' => (dayOfWeek(s) >= 4 ? 'A' : 'B')
