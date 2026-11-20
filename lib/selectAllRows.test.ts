import { describe, it, expect } from 'vitest'
import { selectAllRows, dedupeById } from './selectAllRows'

const pager = (total: number) => {
  const calls: Array<[number, number]> = []
  const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1 }))
  const fn = async (from: number, to: number) => {
    calls.push([from, to])
    return { data: rows.slice(from, to + 1), error: null }
  }
  return { fn, calls }
}

describe('selectAllRows', () => {
  it('1000행을 넘으면 끝까지 나눠 읽는다', async () => {
    const { fn, calls } = pager(2350)
    const rows = await selectAllRows(fn)
    expect(rows).toHaveLength(2350)
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })
  it('딱 1000행이면 빈 페이지를 한 번 더 확인하고 멈춘다', async () => {
    const { fn, calls } = pager(1000)
    expect(await selectAllRows(fn)).toHaveLength(1000)
    expect(calls).toHaveLength(2)
  })
  it('오류는 그대로 던진다', async () => {
    await expect(selectAllRows(async () => ({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom')
  })
})

describe('dedupeById', () => {
  it('페이지 경계가 밀려 두 번 읽힌 행을 한 번만 남긴다', () => {
    expect(dedupeById([{ id: 3 }, { id: 2 }, { id: 2 }, { id: 1 }]).map(r => r.id)).toEqual([3, 2, 1])
  })
})
