// 계정 목록 정렬 — 설정 › 유저관리와 MY › 직원 선택(관리자 전용)이 같은 규칙을 쓴다

export type UserSortKey = 'name' | 'newest' | 'oldest'

export const USER_SORT_OPTIONS: { value: UserSortKey; label: string }[] = [
  { value: 'name', label: '이름순' },
  { value: 'newest', label: '최근 가입' },
  { value: 'oldest', label: '오래된 가입' },
]

export function isUserSortKey(value: unknown): value is UserSortKey {
  return value === 'name' || value === 'newest' || value === 'oldest'
}

/**
 * 이름순은 ko 로케일 비교라 ㄱㄴㄷ 순으로 정렬된다.
 * 가입 시각이 없는 옛 계정은 뒤로 보내고, 같은 시각이면 이름으로 안정 정렬한다.
 */
export function sortUsers<T extends { name: string; created_at: string | null }>(users: T[], key: UserSortKey): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'ko')
  return [...users].sort((a, b) => {
    if (key === 'name') return byName(a, b)
    if (!a.created_at || !b.created_at) return a.created_at ? -1 : b.created_at ? 1 : byName(a, b)
    const cmp = a.created_at.localeCompare(b.created_at)
    if (cmp === 0) return byName(a, b)
    return key === 'newest' ? -cmp : cmp
  })
}
