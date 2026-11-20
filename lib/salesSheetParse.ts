/**
 * 엑셀 매출 정산표 붙여넣기 파서 — 통계 > 팝업의 '정산표 붙여넣기'가 쓴다.
 *
 * 정산표 한 줄은 대략 `2026-11-05 ⇥ 목 ⇥ ₩ 2,791,000 ⇥ 182건` 모양이다. 브랜드명·요일·휴무·합계 줄이
 * 섞여 와도 되도록 "날짜가 있고 매출 숫자가 있는 줄"만 집는다.
 */
export interface ParsedSalesRow {
  date: string
  revenue: number
  orders: number
}

export interface ParsedSalesSheet {
  rows: ParsedSalesRow[]
  /** 날짜는 있는데 숫자를 못 읽은 줄 — 휴무 표시가 아닌 경우만 */
  skipped: string[]
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 줄에서 날짜를 찾아 YYYY-MM-DD와, 날짜를 지운 나머지를 돌려준다 */
function takeDate(line: string, fallbackYear: number): { date: string; rest: string } | null {
  const full = line.match(/(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/)
  if (full) {
    const [, y, m, d] = full
    return { date: `${y}-${pad(Number(m))}-${pad(Number(d))}`, rest: line.replace(full[0], ' ') }
  }
  const short = line.match(/(?:^|[^\d,])(\d{1,2})\s*[/월]\s*(\d{1,2})\s*일?(?![\d,])/)
  if (short) {
    const [, m, d] = short
    return { date: `${fallbackYear}-${pad(Number(m))}-${pad(Number(d))}`, rest: line.replace(short[0], ' ') }
  }
  return null
}

function isValidDate(ds: string): boolean {
  const [y, m, d] = ds.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

export function parseSalesSheet(text: string, fallbackYear: number): ParsedSalesSheet {
  const byDate = new Map<string, ParsedSalesRow>()
  const skipped: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /합계|평균/.test(line)) continue
    const found = takeDate(line, fallbackYear)
    if (!found || !isValidDate(found.date)) continue

    // 건수: 숫자 바로 뒤에 '건'이 붙은 값. 매출: 나머지 숫자 중 가장 큰 값(₩·원·쉼표·소수점 허용)
    let orders: number | null = null
    const rest = found.rest.replace(/(\d[\d,]*)\s*건/, (_, n: string) => { orders = Number(n.replace(/,/g, '')); return ' ' })
    const nums = [...rest.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => Number(m[0].replace(/,/g, ''))).filter(n => Number.isFinite(n))
    const revenue = nums.length > 0 ? Math.round(Math.max(...nums)) : 0
    if (orders == null && nums.length >= 2) {
      // '건' 표시가 없으면 매출 다음으로 큰 정수를 건수로 본다
      const others = nums.filter(n => n !== Math.max(...nums) && Number.isInteger(n))
      orders = others.length > 0 ? Math.max(...others) : null
    }
    if (revenue <= 0) {
      if (!/휴무|휴점|휴일/.test(line)) skipped.push(line)
      continue
    }
    byDate.set(found.date, { date: found.date, revenue, orders: orders ?? 0 })
  }
  return { rows: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), skipped }
}
