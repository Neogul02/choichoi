import { describe, it, expect } from 'vitest'
import { afterFailure, lockedMinutesLeft, codeMatches, ADMIN_CODE_LOCK_MS } from './adminCodeLock'

describe('adminCodeLock', () => {
  const now = 1_000_000

  it('5회 연속 실패하면 15분 잠근다', () => {
    let a = null as ReturnType<typeof afterFailure> | null
    for (let i = 0; i < 4; i++) { a = afterFailure(a, now); expect(lockedMinutesLeft(a, now)).toBeNull() }
    a = afterFailure(a, now)
    expect(lockedMinutesLeft(a, now)).toBe(15)
    expect(lockedMinutesLeft(a, now + ADMIN_CODE_LOCK_MS)).toBeNull()
  })

  it('잠금이 풀린 뒤 실패는 1회부터 다시 센다', () => {
    const locked = { failedCount: 0, lockedUntilMs: now }
    expect(afterFailure(locked, now + 1)).toEqual({ failedCount: 1, lockedUntilMs: null })
  })

  it('codeMatches', () => {
    expect(codeMatches('1234', '1234')).toBe(true)
    expect(codeMatches('1235', '1234')).toBe(false)
    expect(codeMatches('123', '1234')).toBe(false)
  })
})
