/**
 * PostgREST는 한 번에 최대 1000행만 돌려준다(`.limit(10000)`을 줘도 서버 상한이 이긴다).
 * 행이 빠지면 합계·목록이 조용히 틀리므로, 1000행씩 나눠 끝까지 읽는다.
 * 호출부는 `.order(...)`로 순서를 고정한 쿼리에 `.range(from, to)`만 붙여 넘긴다.
 */
export const PAGE_SIZE = 1000

export async function selectAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await page(offset, offset + pageSize - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < pageSize) return out
  }
}

/**
 * id 기준 중복 제거 — 최신순(id 내림차순)으로 나눠 읽는 도중 새 주문이 들어오면 페이지 경계가 밀려
 * 같은 행이 두 번 읽힐 수 있다.
 */
export function dedupeById<T extends { id: number }>(rows: T[]): T[] {
  const seen = new Set<number>()
  return rows.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)))
}
