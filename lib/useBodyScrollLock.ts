'use client'

import { useEffect } from 'react'

let lockCount = 0
let previousOverflow = ''

// 모달이 fixed inset-0로 화면을 덮어도 브라우저는 배경 스크롤을 자동으로 막아주지 않는다 —
// 모바일에서 모달이 열린 채로 뒤 콘텐츠가 스크롤되는 문제를 이 훅으로 막는다.
// 여러 모달이 동시에 마운트될 가능성을 대비해 카운터 기반으로 구현 — 마지막 모달이 닫힐 때만 원복한다.
//
// active 인자는 부모 컴포넌트가 `{show && <div className="fixed inset-0">...}` 형태로 모달을
// 인라인 JSX로 그리는 경우(조건부 블록 안에서는 훅을 호출할 수 없음)를 위한 것 — 그런 경우
// 부모 최상단에서 useBodyScrollLock(show)로 호출한다. 별도 모달 컴포넌트가 열려 있을 때만
// 마운트되는 일반적인 경우는 인자 없이(기본 true) 호출하면 된다.
export function useBodyScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return undefined
    if (lockCount === 0) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    lockCount += 1
    return () => {
      lockCount -= 1
      if (lockCount === 0) {
        document.body.style.overflow = previousOverflow
      }
    }
  }, [active])
}
