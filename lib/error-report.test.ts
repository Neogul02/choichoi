import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reportError } from './error-report'
import { notifyDiscord } from './discord'

vi.mock('./discord', () => ({ notifyDiscord: vi.fn().mockResolvedValue(undefined) }))

const mockNotify = vi.mocked(notifyDiscord)

describe('reportError', () => {
  beforeEach(() => { mockNotify.mockClear() })

  it('컨텍스트+메시지를 Discord error 타입으로 전달한다', async () => {
    await reportError('테스트 컨텍스트', '뭔가 실패', [{ name: 'digest', value: 'abc123' }])
    expect(mockNotify).toHaveBeenCalledWith(
      'error',
      '⚠️ 테스트 컨텍스트',
      '뭔가 실패',
      [{ name: 'digest', value: 'abc123' }],
    )
  })

  it('같은 (컨텍스트, 메시지)는 스로틀 시간 내 1건만 보낸다', async () => {
    await reportError('스로틀', '같은 오류')
    await reportError('스로틀', '같은 오류')
    await reportError('스로틀', '같은 오류')
    expect(mockNotify).toHaveBeenCalledTimes(1)
  })

  it('메시지가 다르면 각각 보낸다', async () => {
    await reportError('스로틀2', '오류 A')
    await reportError('스로틀2', '오류 B')
    expect(mockNotify).toHaveBeenCalledTimes(2)
  })

  it('긴 메시지·필드는 잘라서 보낸다', async () => {
    await reportError('클립', 'x'.repeat(3000), [{ name: 'n', value: 'v'.repeat(1000) }])
    const [, , message, fields] = mockNotify.mock.calls[0]
    expect((message as string).length).toBeLessThanOrEqual(1501)
    expect((fields as { value: string }[])[0].value.length).toBeLessThanOrEqual(501)
  })
})
