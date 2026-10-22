import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

// 권한 역할은 app_metadata.role에서만 읽는다. user_metadata는 로그인한 본인이 브라우저에서
// supabase.auth.updateUser({ data: { role: 'admin' } })로 바꿀 수 있어, 예전에 proxy.ts·_base.ts가
// 거기서 역할을 읽던 탓에 직원 계정 누구나 관리자·급여 화면에 들어갈 수 있었다.
// 이 테스트는 user_metadata에서 role을 읽거나 쓰는 코드가 다시 들어오면 실패한다.

const ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['app', 'components', 'lib', 'hooks', 'types', 'supabase/migrations', 'supabase/pending', 'scripts']
const ROOT_FILES = ['proxy.ts', 'middleware.ts']

function sourceFiles(dir: string): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return [] }
  return entries.flatMap(name => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx|mjs|js|sql)$/.test(name) && !name.endsWith('.test.ts') ? [full] : []
  })
}

// user_metadata.role / user_metadata?.role / user_metadata['role'] / (… user_metadata as …)?.role,
// 그리고 user_metadata 객체 리터럴 안의 role 키(쓰기)
const FORBIDDEN = [
  /user_metadata\s*\??\.\s*role\b/,
  /user_metadata\s*\??\.?\s*\[\s*['"]role['"]\s*\]/,
  /user_metadata\s+as\s+[^)]*\)\s*\??\.\s*role\b/,
  /user_metadata\s*:\s*\{[^}]*\brole\b/, // { ...meta, role } 같은 축약·spread 쓰기 포함
  /\bdata\s*:\s*\{[^}]*\brole\b/, // auth.updateUser({ data: { role } }) — 본인 쓰기
  /user_metadata'?\s*->>?\s*'role'/, // SQL·RLS: auth.jwt()->'user_metadata'->>'role'
]
// 변수를 거친 읽기(const meta = claims.user_metadata; meta.role)는 정규식으로 못 잡는다 —
// 그 경로는 lib/auth-role.test.ts가 getAuthUser에 위조 클레임을 넣어 동작으로 검사한다.

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

  it('proxy.ts와 getAuthUser는 lib/auth-role.ts로 역할을 판정한다', () => {
    // 판정 규칙은 lib/auth-role.ts 한 곳 — 화면(proxy)과 액션(getAuthUser)이 각자 판정하면 서로 어긋난다
    expect(readFileSync(path.join(ROOT, 'proxy.ts'), 'utf8')).toMatch(/effectiveRole\(/)
    expect(readFileSync(path.join(ROOT, 'app/actions/_base.ts'), 'utf8')).toMatch(/isAdminCodePending\(/)
  })
})
