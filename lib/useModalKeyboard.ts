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
  /**
   * Enter → 호출 (버튼/링크에 포커스가 있을 때는 브라우저 기본 활성화에 맡기고 건드리지 않음 —
   * danger 다이얼로그가 취소 버튼에 포커스를 둬 실수 확인을 막는 설계를 그대로 존중하기 위함).
   * 포커스가 컨테이너 안의 텍스트필드 등 아무 곳에나 있을 때만 이 콜백으로 직접 확인 처리한다.
   * 포커스가 컨테이너 밖(예: body — 제목/설명처럼 포커스 불가능한 요소를 클릭하면 여기로 빠진다)이면
   * 아무 동작도 하지 않는다 — 그렇지 않으면 danger 다이얼로그의 취소 포커스 안전장치가 무력화된다.
   */
  onConfirm?: () => void
}

/**
 * 모달 공용 키보드 동작 — Esc로 닫기, Tab을 컨테이너 안에서만 순환, 열릴 때 초기 포커스,
 * 닫힐 때 이전 포커스 복원, (선택) Enter로 확인. 모달마다 손으로 짜던 Esc keydown useEffect를 대체한다.
 */
export function useModalKeyboard({ active, onClose, containerRef, initialFocusRef, onConfirm }: Options) {
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
      if (e.key === 'Enter' && onConfirm && !e.isComposing) {
        const target = e.target as HTMLElement | null
        const tag = target?.tagName
        // textarea는 줄바꿈 입력이 우선, button/a는 이미 포커스된 요소의 기본 활성화(클릭)에 맡긴다.
        // 포커스가 컨테이너 밖으로 빠진 경우(제목·설명 클릭 등으로 body에 포커스)는 제외 —
        // danger 다이얼로그가 취소 버튼에 걸어둔 포커스 안전장치를 우회하게 된다.
        if (tag !== 'TEXTAREA' && tag !== 'BUTTON' && tag !== 'A' && target && containerRef.current?.contains(target)) {
          e.preventDefault()
          onConfirm()
          return
        }
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
  }, [active, onClose, containerRef, onConfirm])
}
