'use client'

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE_SELECTOR = 'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])'

interface Options {
  /** 모달이 열려 있는 동안만 true — 리스너 등록/해제와 초기 포커스·포커스 복원 타이밍을 제어 */
  active: boolean
  /** Esc 키 → 호출 */
  onClose: () => void
  /** Tab 트랩 대상 패널 */
  containerRef: RefObject<HTMLElement | null>
  /** 지정 시 열릴 때 이 요소에 포커스, 없으면 컨테이너 내 첫 포커스 가능 요소 */
  initialFocusRef?: RefObject<HTMLElement | null>
}

/**
 * 모달 공용 키보드 동작 — Esc로 닫기, Tab을 컨테이너 안에서만 순환, 열릴 때 초기 포커스,
 * 닫힐 때 이전 포커스 복원. 모달마다 손으로 짜던 Esc keydown useEffect를 대체한다.
 */
export function useModalKeyboard({ active, onClose, containerRef, initialFocusRef }: Options) {
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return undefined

    previousFocusRef.current = document.activeElement as HTMLElement | null
    const target = initialFocusRef?.current ?? containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    target?.focus()

    return () => {
      previousFocusRef.current?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  useEffect(() => {
    if (!active) return undefined

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !containerRef.current) return
      const focusable = Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => !el.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [active, onClose, containerRef])
}
