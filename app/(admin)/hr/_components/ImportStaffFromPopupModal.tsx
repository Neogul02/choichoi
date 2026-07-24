'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { fetchImportCandidates, bulkAssignStaffToPopup } from '@/app/actions/staffPopups'
import type { StaffProfile, PopupEvent } from '@/types/database'
import { ROLE_LABELS } from './constants'

interface Props {
  popupId: number
  popupName: string
  staffPopupMap: Map<number, Set<number>>
  popups: PopupEvent[]
  onClose: () => void
  onImported: (staffIds: number[], added: number, skipped: number) => void
}

/** 전체 직원 목록에서 현재 팝업에 배정할 사람을 고르는 모달 — 프로필은 그대로, 배정만 추가된다 */
export default function ImportStaffFromPopupModal({ popupId, popupName, staffPopupMap, popups, onClose, onImported }: Props) {
  useBodyScrollLock()
  const [candidates, setCandidates] = useState<StaffProfile[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    fetchImportCandidates(popupId).then(res => {
      if (res.success && res.data) setCandidates(res.data)
    })
  }, [popupId])

  const popupNameById = useMemo(() => new Map(popups.map(p => [p.id, p.name])), [popups])

  const filtered = useMemo(() => {
    const list = candidates ?? []
    const q = search.trim()
    if (!q) return list
    return list.filter(s => s.name.includes(q) || (s.phone ?? '').includes(q))
  }, [candidates, search])

  const toggle = (staffId: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(staffId)) next.delete(staffId)
      else next.add(staffId)
      return next
    })
  }

  const handleSubmit = async () => {
    if (selected.size === 0) return
    setIsSubmitting(true)
    const staffIds = [...selected]
    const res = await bulkAssignStaffToPopup(staffIds, popupId)
    setIsSubmitting(false)
    if (res.success && res.data) {
      onImported(staffIds, res.data.added, res.data.skipped)
      onClose()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-canvas w-full max-w-[420px] max-h-[85vh] rounded-xl shadow-level-2 border border-hairline overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline bg-canvas-soft shrink-0">
          <div>
            <h3 className="m-0 text-[15px] font-bold text-ink">기존 근무자 추가</h3>
            <p className="m-0 text-[12px] text-ink-muted">{popupName}에 배정 · 프로필 재입력 없이 배정만 추가됩니다</p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="bg-transparent border-none text-ink-faint text-[22px] cursor-pointer hover:text-ink transition w-8 h-8 flex items-center justify-center shrink-0">×</button>
        </div>

        <div className="px-5 pt-3 shrink-0">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="이름/전화 검색"
            className="w-full px-3 py-2 border border-hairline rounded-lg text-[13px] bg-canvas focus:outline-none focus:border-primary-700"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {candidates === null ? (
            <p className="text-[12px] text-ink-faint text-center py-6 m-0">불러오는 중...</p>
          ) : filtered.length === 0 ? (
            <p className="text-[12px] text-ink-faint text-center py-6 m-0">
              {candidates.length === 0 ? '추가할 수 있는 근무자가 없습니다.' : '검색 결과가 없습니다.'}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filtered.map(staff => {
                const otherPopupNames = [...(staffPopupMap.get(staff.id) ?? [])]
                  .map(id => popupNameById.get(id))
                  .filter((n): n is string => Boolean(n))
                return (
                  <label
                    key={staff.id}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg border border-hairline hover:bg-canvas-soft transition cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(staff.id)}
                      onChange={() => toggle(staff.id)}
                      className="w-4 h-4 accent-primary-700 cursor-pointer shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-[13px] font-semibold text-ink truncate">{staff.name}</p>
                      <p className="m-0 text-[11px] text-ink-faint truncate">
                        {ROLE_LABELS[staff.staff_role]}
                        {otherPopupNames.length > 0 && ` · 이전 근무: ${otherPopupNames.join(', ')}`}
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-hairline shrink-0">
          <button
            onClick={handleSubmit}
            disabled={selected.size === 0 || isSubmitting}
            className="flex-1 py-2.5 rounded-xl border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '불러오는 중...' : selected.size > 0 ? `${selected.size}명 불러오기` : '불러올 인원 선택'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-hairline bg-transparent text-[13px] text-ink-muted cursor-pointer hover:bg-canvas-soft transition"
          >
            취소
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
