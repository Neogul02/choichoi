// 입력 중 실시간 하이픈 포맷 — 완성 전 자리수도 자연스럽게 표시되도록 지역번호(02)와 일반(010 등)을 분리 처리
export function formatPhoneInput(value: string): string {
  // 자동완성·붙여넣기로 "+82 10-1234-5678" 처럼 국가번호가 붙어 들어오면 국내표기로 바꿔서 이어받는다
  const raw = value.trimStart().startsWith('+') ? normalizePhone(value) : value.replace(/\D/g, '')
  const digits = raw.slice(0, 11)

  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`
  }

  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`
}

// 완성된 전화번호 자리수 검증 — 02는 9~10자리(지역번호 2 + 로컬 7~8), 그 외는 10~11자리
export function isValidKoreanPhone(value: string): boolean {
  const digits = normalizePhone(value)
  if (!digits.startsWith('0')) return false
  if (digits.startsWith('02')) return digits.length === 9 || digits.length === 10
  return digits.length === 10 || digits.length === 11
}

/**
 * 저장·인증용 표준형 — 숫자만 남긴다.
 * DB에는 항상 이 형태로만 들어가야 한다 (표시할 때만 formatPhoneNumber로 하이픈을 붙인다).
 * 가입 초기 비밀번호가 전화번호이므로, 하이픈 유무가 섞이면 로그인이 안 되는 사고로 이어진다.
 * "+82 10-1234-5678" 같은 국제표기는 0으로 시작하는 국내표기로 바꾼다.
 */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  // 국내 번호는 항상 0으로 시작하므로 82로 시작하면 국가번호로 간주해도 안전하다
  if (digits.startsWith('82') && (digits.length === 11 || digits.length === 12)) return `0${digits.slice(2)}`
  return digits
}

/**
 * 검색어가 전화번호 일부인지 판정 — DB에는 숫자만 저장되므로 "010-1234"처럼
 * 하이픈을 넣어 검색해도 걸리도록 양쪽 모두 숫자만 남겨 비교한다.
 */
export function phoneMatches(phone: string | null | undefined, query: string): boolean {
  const q = query.replace(/\D/g, '')
  if (!q) return false
  return (phone ?? '').replace(/\D/g, '').includes(q)
}
