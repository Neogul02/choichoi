import { describe, it, expect } from 'vitest'
import { getWorkerTier, WORKER_TIER_HOUR_THRESHOLDS } from './tiers'

describe('getWorkerTier', () => {
  it('0시간이면 BRONZE', () => {
    const { current, next } = getWorkerTier(0)
    expect(current.name).toBe('BRONZE')
    expect(next?.name).toBe('SILVER')
  })

  it('경계값 40시간이면 SILVER(이상 포함)', () => {
    expect(getWorkerTier(39.9).current.name).toBe('BRONZE')
    expect(getWorkerTier(40).current.name).toBe('SILVER')
    expect(getWorkerTier(99.9).current.name).toBe('SILVER')
  })

  it('임계값 사이 구간은 해당 티어를 유지한다', () => {
    expect(getWorkerTier(100).current.name).toBe('GOLD')
    expect(getWorkerTier(249).current.name).toBe('GOLD')
    expect(getWorkerTier(250).current.name).toBe('PLATINUM')
  })

  it('최고 임계값(2000시간) 이상이면 CHALLENGER이고 next는 null', () => {
    const atThreshold = getWorkerTier(2000)
    expect(atThreshold.current.name).toBe('CHALLENGER')
    expect(atThreshold.next).toBeNull()

    const beyond = getWorkerTier(9999)
    expect(beyond.current.name).toBe('CHALLENGER')
    expect(beyond.next).toBeNull()
  })

  it('WORKER_TIER_HOUR_THRESHOLDS는 7단계 오름차순 배열이다', () => {
    expect(WORKER_TIER_HOUR_THRESHOLDS).toEqual([0, 40, 100, 250, 500, 1000, 2000])
  })
})
