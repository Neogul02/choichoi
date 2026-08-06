// 주민등록번호 형식·체크섬 검증 및 마스킹. 원문을 저장/로그에 남기지 않는 순수 함수만 포함.
const CHECKSUM_WEIGHTS = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5]

export function isValidResidentRegistrationNumber(front: string, back: string): boolean {
  if (!/^\d{6}$/.test(front) || !/^\d{7}$/.test(back)) return false

  const month = Number(front.slice(2, 4))
  const day = Number(front.slice(4, 6))
  if (month < 1 || month > 12 || day < 1 || day > 31) return false

  const genderDigit = Number(back[0])
  if (genderDigit < 1 || genderDigit > 8) return false

  const digits = `${front}${back}`.split('').map(Number)
  const sum = CHECKSUM_WEIGHTS.reduce((acc, w, i) => acc + w * digits[i], 0)
  const checkDigit = (11 - (sum % 11)) % 10
  return checkDigit === digits[12]
}

export function maskResidentId(front: string, back: string): string {
  return `${front}-${back[0]}******`
}
