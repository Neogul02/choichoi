import { describe, it, expect } from 'vitest'
import { parseSalesSheet } from './salesSheetParse'

describe('parseSalesSheet', () => {
  it('엑셀 정산표를 그대로 붙여넣은 경우 — 브랜드명·휴무·빈 줄·합계는 건너뛴다', () => {
    const text = [
      '브랜드명\t일자\t요일\t매출\t건수',
      '히요리산도\t2026-11-05\t목\t₩ 2,791,000\t182건',
      '\t2026-11-06\t금\t₩ 2,834,000\t184건',
      '\t2026-11-07\t토\t₩ 6,362,500\t378건',
      '\t2026-11-08\t일\t₩ 5,727,550\t411건',
      '\t2026-11-09\t휴무\t\t',
      '\t2026-11-10\t화\t\t',
      '\t합계\t\t₩ 17,715,050\t1,155건',
    ].join('\n')
    const { rows, skipped } = parseSalesSheet(text, 2026)
    expect(rows).toEqual([
      { date: '2026-11-05', revenue: 2791000, orders: 182 },
      { date: '2026-11-06', revenue: 2834000, orders: 184 },
      { date: '2026-11-07', revenue: 6362500, orders: 378 },
      { date: '2026-11-08', revenue: 5727550, orders: 411 },
    ])
    // 11/10은 아직 입력 전인 빈 줄 — 휴무 표시가 없어 '못 읽은 줄'로 알린다
    expect(skipped).toHaveLength(1)
  })

  it('짧은 날짜(11/5, 11월 5일)와 원·건 없는 숫자도 읽는다', () => {
    const { rows } = parseSalesSheet('11/5 2791000 182\n11월 6일 2,834,000원 184건', 2026)
    expect(rows).toEqual([
      { date: '2026-11-05', revenue: 2791000, orders: 182 },
      { date: '2026-11-06', revenue: 2834000, orders: 184 },
    ])
  })

  it('점·슬래시 구분 날짜와 천 단위 건수', () => {
    const { rows } = parseSalesSheet('2026.10.24 (토) ₩8,834,500 1,048건', 2026)
    expect(rows).toEqual([{ date: '2026-10-24', revenue: 8834500, orders: 1048 }])
  })

  it('없는 날짜는 버리고, 같은 날짜가 두 번이면 뒤의 값', () => {
    const { rows } = parseSalesSheet('2026-02-30 1000 1건\n2026-11-05 100 1건\n2026-11-05 200 2건', 2026)
    expect(rows).toEqual([{ date: '2026-11-05', revenue: 200, orders: 2 }])
  })
})
