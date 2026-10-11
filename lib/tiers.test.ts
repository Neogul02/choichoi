import { describe, it, expect } from 'vitest'
import { getWorkerTier, getTier, TIERS, WORKER_TIERS, WORKER_TIER_HOUR_THRESHOLDS } from './tiers'

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
    expect(getWorkerTier(199).current.name).toBe('GOLD')
    expect(getWorkerTier(200).current.name).toBe('PLATINUM')
  })

  it('최고 임계값(1500시간) 이상이면 CHALLENGER이고 next는 null', () => {
    const atThreshold = getWorkerTier(1500)
    expect(atThreshold.current.name).toBe('CHALLENGER')
    expect(atThreshold.next).toBeNull()

    const beyond = getWorkerTier(9999)
    expect(beyond.current.name).toBe('CHALLENGER')
    expect(beyond.next).toBeNull()
  })

  it('WORKER_TIER_HOUR_THRESHOLDS는 7단계 오름차순 배열이다', () => {
    expect(WORKER_TIER_HOUR_THRESHOLDS).toEqual([0, 40, 100, 200, 400, 800, 1500])
  })
})

describe('getTier (매출 등급)', () => {
  it('챌린저 위에 LEGEND가 있다 — 1000만 기준', () => {
    expect(getTier(9_999_999).tier!.name).toBe('CHALLENGER')
    expect(getTier(10_000_000).tier!.name).toBe('LEGEND')
    expect(getTier(10_000_000).next).toBeNull()
  })

  // 등급을 늘릴 때 가장 쉽게 깨지는 지점 — 근무자 등급은 시간 기준 배열 길이를 따라야 한다.
  // TIERS를 map하던 시절에는 매출 등급을 하나 늘리면 threshold: undefined인 근무자 등급이 딸려 생겼다.
  it('매출 등급이 늘어도 근무자 등급은 시간 기준 배열 길이를 따른다', () => {
    expect(WORKER_TIERS.length).toBe(WORKER_TIER_HOUR_THRESHOLDS.length)
    expect(WORKER_TIERS.every(t => typeof t.threshold === 'number')).toBe(true)
    expect(TIERS.length).toBeGreaterThan(WORKER_TIERS.length)
  })
})
