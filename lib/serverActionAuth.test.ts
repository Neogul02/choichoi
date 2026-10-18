import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

// 'use server' 파일의 export는 브라우저 JS에 id가 실려 누구나 POST할 수 있는 공개 엔드포인트다.
// 예전에 saveOrder·updateMenuStock 등이 권한 검사 없이 export돼 있어 로그인 없이 가짜 주문을 넣을 수 있었다.
// 이 테스트는 그 상태로 돌아가지 않게, 권한 검사 없는 export를 아래 공개 목록에 있는 것만 허용한다.

const ACTIONS_DIR = path.resolve(__dirname, '../app/actions')

/** 로그인 전에 불려야 해서 의도적으로 공개한 액션 — 추가할 때는 이유를 같이 적는다 */
const PUBLIC_ACTIONS: Record<string, string> = {
  'discord.ts:notifyLoginEvent': '로그인 시도 알림 — 로그인 화면에서 호출',
  'error-report.ts:reportClientError': '클라이언트 오류 보고 — 로그인 전 화면에서도 난다',
  'menu.ts:fetchMenuItems': '메뉴·가격 — 고객 화면(/display)이 로그인 없이 쓴다',
  'schedule.ts:fetchActivePopupEvents': '진행 중 팝업 이름 — 로그인 화면의 근무지 선택',
  'workers.ts:resolveLoginEmail': '이름으로 로그인 — 로그인 전 이메일 확인',
  'workers.ts:createWorkerAccount': '회원가입 — 초대 코드로 내부에서 검사',
}

// 함수 본문 맨 앞쪽에서 세션을 확인하는 호출. 본문이 다른 액션에 위임만 하는 경우는 여기 걸리지 않으니 목록에 올린다.
const GUARD = /\b(requireAuth|requireAdmin|requireManagerOrAdmin|requireKioskOrAdmin|getAuthUser|getManagerSession)\s*\(/

function exportedActions(): Array<{ key: string; body: string }> {
  const out: Array<{ key: string; body: string }> = []
  for (const file of readdirSync(ACTIONS_DIR)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue
    const src = readFileSync(path.join(ACTIONS_DIR, file), 'utf8')
    if (!/^\s*['"]use server['"]/.test(src)) continue
    const re = /export async function (\w+)\s*\(/g
    const starts = [...src.matchAll(re)]
    starts.forEach((m, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].index : src.length
      out.push({ key: `${file}:${m[1]}`, body: src.slice(m.index, end) })
    })
  }
  return out
}

describe('서버 액션 권한', () => {
  const actions = exportedActions()

  it('액션 파일을 실제로 읽었다', () => {
    expect(actions.length).toBeGreaterThan(50)
  })

  it('공개 목록 밖의 모든 export는 세션을 확인한다', () => {
    const unguarded = actions
      .filter(a => !(a.key in PUBLIC_ACTIONS))
      .filter(a => !GUARD.test(a.body))
      .map(a => a.key)
    expect(unguarded).toEqual([])
  })

  it('공개 목록에 없어진 액션이 남아 있지 않다', () => {
    const keys = new Set(actions.map(a => a.key))
    expect(Object.keys(PUBLIC_ACTIONS).filter(k => !keys.has(k))).toEqual([])
  })
})
