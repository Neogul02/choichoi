// 계좌번호는 은행마다 자리수·구분자 규칙이 제각각이라, 저장은 숫자만으로 통일하고
// 표시할 때만 은행명과 함께 보여준다. 하이픈/공백이 섞여 있으면 송금할 때 붙여넣기가 깨지고
// 같은 계좌가 다른 값으로 중복 저장된다.

/** 국내 계좌번호 자리수 범위 — 씨티 11자리부터 국민·하나 14자리까지를 포함하는 실사용 범위 */
export const BANK_ACCOUNT_MIN_DIGITS = 10
export const BANK_ACCOUNT_MAX_DIGITS = 16

/** 저장용 표준형 — 숫자만 남긴다. "3333-19-7705887", "205502 04 512133", "3333352937805 카카오뱅크" 모두 처리 */
export function normalizeBankAccount(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

/** 정규화 후 자리수가 실제 계좌 범위 안인지 — 빈 값은 "미입력"이라 별도로 판단한다 */
export function isValidBankAccount(value: string | null | undefined): boolean {
  const digits = normalizeBankAccount(value)
  return digits.length >= BANK_ACCOUNT_MIN_DIGITS && digits.length <= BANK_ACCOUNT_MAX_DIGITS
}

/** 입력 중 마스킹 — 숫자만 통과시키고 최대 자리수에서 자른다 */
export function formatBankAccountInput(value: string): string {
  return normalizeBankAccount(value).slice(0, BANK_ACCOUNT_MAX_DIGITS)
}

/** 검색어가 계좌번호 일부인지 — 하이픈을 넣어 검색해도 걸리도록 양쪽 숫자만 비교 */
export function bankAccountMatches(account: string | null | undefined, query: string): boolean {
  const q = normalizeBankAccount(query)
  if (!q) return false
  return normalizeBankAccount(account).includes(q)
}

export const BANK_ACCOUNT_RULE_MESSAGE =
  `계좌번호는 '-' 없이 숫자만 ${BANK_ACCOUNT_MIN_DIGITS}~${BANK_ACCOUNT_MAX_DIGITS}자리로 입력해주세요.`
