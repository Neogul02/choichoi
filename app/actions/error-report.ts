'use server'

import { reportError } from '@/lib/error-report'

/** 클라이언트 에러 바운더리가 잡은 오류를 서버 경유로 수집한다 (웹훅 URL 비노출) */
export async function reportClientError(input: {
  message: string
  digest?: string
  url?: string
  userAgent?: string
}): Promise<void> {
  if (typeof input?.message !== 'string' || !input.message.trim()) return
  const fields: { name: string; value: string }[] = []
  if (typeof input.digest === 'string' && input.digest) fields.push({ name: 'digest', value: input.digest })
  if (typeof input.url === 'string' && input.url) fields.push({ name: 'URL', value: input.url })
  if (typeof input.userAgent === 'string' && input.userAgent) fields.push({ name: 'UA', value: input.userAgent })
  await reportError('클라이언트 오류', input.message, fields).catch(() => {})
}
