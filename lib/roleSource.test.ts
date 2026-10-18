import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

// 권한 역할은 app_metadata.role에서만 읽는다. user_metadata는 로그인한 본인이 브라우저에서
// supabase.auth.updateUser({ data: { role: 'admin' } })로 바꿀 수 있어, 예전에 proxy.ts·_base.ts가
// 거기서 역할을 읽던 탓에 직원 계정 누구나 관리자·급여 화면에 들어갈 수 있었다.
// 이 테스트는 user_metadata에서 role을 읽거나 쓰는 코드가 다시 들어오면 실패한다.

const ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['app', 'components', 'lib', 'hooks', 'types']
const ROOT_FILES = ['proxy.ts', 'middleware.ts']

function sourceFiles(dir: string): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return [] }
  return entries.flatMap(name => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [full] : []
  })
}

// user_metadata.role / user_metadata?.role / user_metadata['role'] / (… user_metadata as …)?.role,
// 그리고 user_metadata 객체 리터럴 안의 role 키(쓰기)
const FORBIDDEN = [
  /user_metadata\s*\??\.\s*role\b/,
  /user_metadata\s*\??\.?\s*\[\s*['"]role['"]\s*\]/,
  /user_metadata\s+as\s+[^)]*\)\s*\??\.\s*role\b/,
  /user_metadata\s*:\s*\{[^}]*\brole\s*:/,
  /\bdata\s*:\s*\{[^}]*\brole\s*:/, // auth.updateUser({ data: { role } }) — 본인 쓰기
]

describe('권한 역할 출처', () => {
  const files = [
    ...SCAN_DIRS.flatMap(d => sourceFiles(path.join(ROOT, d))),
    ...ROOT_FILES.map(f => path.join(ROOT, f)).filter(f => { try { return statSync(f).isFile() } catch { return false } }),
  ]

  it('소스 파일을 실제로 읽었다', () => {
    expect(files.some(f => f.endsWith('proxy.ts'))).toBe(true)
    expect(files.length).toBeGreaterThan(50)
  })

  it('user_metadata에서 role을 읽거나 쓰지 않는다', () => {
    const hits = files.flatMap(f => {
      const src = readFileSync(f, 'utf8')
      return FORBIDDEN.filter(re => re.test(src)).map(re => `${path.relative(ROOT, f)} ${re}`)
    })
    expect(hits).toEqual([])
  })

  it('proxy.ts와 getAuthUser는 app_metadata에서 역할을 읽는다', () => {
    expect(readFileSync(path.join(ROOT, 'proxy.ts'), 'utf8')).toMatch(/app_metadata[^\n]*\)\s*\??\.\s*role/)
    expect(readFileSync(path.join(ROOT, 'app/actions/_base.ts'), 'utf8')).toMatch(/appMeta\.role/)
  })
})
