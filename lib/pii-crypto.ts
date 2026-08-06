import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// 주민등록번호 등 고민감 개인정보 전용 대칭키 암호화. 서버 전용 — 클라이언트 번들에 포함되면 안 됨.
// 저장 포맷: `${ivBase64}:${authTagBase64}:${cipherBase64}`
const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('PII_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.')
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY는 base64로 인코딩된 32바이트 키여야 합니다. (openssl rand -base64 32)')
  }
  return key
}

export function encryptResidentId(plain: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptResidentId(enc: string): string {
  const key = getKey()
  const [ivB64, tagB64, cipherB64] = enc.split(':')
  if (!ivB64 || !tagB64 || !cipherB64) {
    throw new Error('암호문 형식이 올바르지 않습니다.')
  }
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(tagB64, 'base64')
  const cipherText = Buffer.from(cipherB64, 'base64')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()])
  return decrypted.toString('utf8')
}
