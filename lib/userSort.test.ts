import { describe, it, expect } from 'vitest'
import { sortUsers, isUserSortKey } from './userSort'

const u = (name: string, created_at: string | null) => ({ name, created_at })
const users = [u('다현', '2026-03-01T00:00:00Z'), u('가영', '2026-05-01T00:00:00Z'), u('나리', null), u('라온', '2026-05-01T00:00:00Z')]

describe('sortUsers', () => {
  it('이름순은 가나다 순', () => {
    expect(sortUsers(users, 'name').map((x) => x.name)).toEqual(['가영', '나리', '다현', '라온'])
  })

  it('최근 가입순 — 가입 시각 없는 계정은 맨 뒤, 같은 시각은 이름순', () => {
    expect(sortUsers(users, 'newest').map((x) => x.name)).toEqual(['가영', '라온', '다현', '나리'])
  })

  it('오래된 가입순 — 가입 시각 없는 계정은 역시 맨 뒤', () => {
    expect(sortUsers(users, 'oldest').map((x) => x.name)).toEqual(['다현', '가영', '라온', '나리'])
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const copy = [...users]
    sortUsers(users, 'newest')
    expect(users).toEqual(copy)
  })
})

describe('isUserSortKey', () => {
  it('저장된 값 검증', () => {
    expect(isUserSortKey('newest')).toBe(true)
    expect(isUserSortKey('bogus')).toBe(false)
    expect(isUserSortKey(null)).toBe(false)
  })
})
