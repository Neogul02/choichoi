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

/**
 * 주민번호 앞 6자리 + 뒷자리 첫 숫자로 생년월일을 복원한다.
 * 성별 숫자가 세기를 결정한다 — 1·2·5·6=1900년대, 3·4·7·8=2000년대, 9·0=1800년대.
 * 마스킹값(`990101-1******`)만으로도 계산되므로 복호화가 필요 없다.
 */
export function birthFromResidentId(front: string, genderDigit: string): { date: string; age: number } | null {
  if (!/^\d{6}$/.test(front) || !/^\d$/.test(genderDigit)) return null

  const g = Number(genderDigit)
  const century = g === 9 || g === 0 ? 1800 : g === 3 || g === 4 || g === 7 || g === 8 ? 2000 : 1900
  const year = century + Number(front.slice(0, 2))
  const month = Number(front.slice(2, 4))
  const day = Number(front.slice(4, 6))
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${year}-${pad(month)}-${pad(day)}`

  // 만 나이 — 올해 생일이 아직 안 지났으면 한 살 빼는 일반적인 계산
  const now = new Date()
  let age = now.getFullYear() - year
  const passed = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day)
  if (!passed) age -= 1

  return { date, age }
}

/** 마스킹 문자열(`990101-1******`)에서 바로 생년월일 — 앞 6자리와 성별 숫자만 쓰므로 원문이 필요 없다 */
export function birthFromMasked(masked: string | null | undefined): { date: string; age: number } | null {
  if (!masked) return null
  const m = /^(\d{6})-(\d)/.exec(masked)
  return m ? birthFromResidentId(m[1], m[2]) : null
}

/** 13자리 원문 → `990101-1234567` 표기 */
export function formatResidentId(raw: string): string {
  return /^\d{13}$/.test(raw) ? `${raw.slice(0, 6)}-${raw.slice(6)}` : raw
}
