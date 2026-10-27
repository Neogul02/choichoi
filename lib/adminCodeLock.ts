// 관리자 2차 코드 시도 제한 — 순수 규칙. 저장은 admin_code_attempts(서버 액션 checkAdminLoginCode).

export const ADMIN_CODE_MAX_FAILURES = 5
export const ADMIN_CODE_LOCK_MS = 15 * 60 * 1000

export interface AdminCodeAttempt {
  failedCount: number
  lockedUntilMs: number | null
}

/** 잠겨 있으면 남은 분(올림), 아니면 null */
export function lockedMinutesLeft(a: AdminCodeAttempt | null, nowMs: number): number | null {
  if (!a?.lockedUntilMs || a.lockedUntilMs <= nowMs) return null
  return Math.ceil((a.lockedUntilMs - nowMs) / 60000)
}

/** 실패 한 번 뒤의 상태 — 잠금이 풀린 뒤의 실패는 1회부터 다시 센다. 5회째 실패에서 잠근다. */
export function afterFailure(a: AdminCodeAttempt | null, nowMs: number): AdminCodeAttempt {
  const expired = a?.lockedUntilMs != null && a.lockedUntilMs <= nowMs
  const failedCount = (a && !expired ? a.failedCount : 0) + 1
  if (failedCount >= ADMIN_CODE_MAX_FAILURES) return { failedCount: 0, lockedUntilMs: nowMs + ADMIN_CODE_LOCK_MS }
  return { failedCount, lockedUntilMs: null }
}

/** 길이 차이 외에는 비교 시간이 값에 따라 달라지지 않게 — 한 글자씩 맞춰 보는 대입을 어렵게 한다 */
export function codeMatches(input: string, expected: string): boolean {
  if (input.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < input.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
