// 입력 중 실시간 하이픈 포맷 — 완성 전 자리수도 자연스럽게 표시되도록 지역번호(02)와 일반(010 등)을 분리 처리
export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)

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
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('02')) return digits.length === 9 || digits.length === 10
  return digits.length === 10 || digits.length === 11
}
