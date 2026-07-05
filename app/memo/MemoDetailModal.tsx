'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import type { Memo } from '@/types/database'
import { parseChecklist, serializeChecklist } from './page'

type ChecklistItem = { done: boolean; text: string }

interface Props {
  memo?: Memo  // undefined = 생성 모드
  onClose: () => void
  onSaved: (saved: Memo) => void
  onRemove?: () => Promise<{ success: boolean; error?: string }>
  onPin?: (isPinned: boolean) => void
  onSubmit: (title: string, content: string, color: string, type: 'note' | 'checklist') => Promise<{ success: boolean; error?: string; data?: Memo }>
  MEMO_COLORS: Array<{ name: string; value: string }>
}

const DEFAULT_COLOR = '#fff9c4'

export default function MemoDetailModal({ memo, onClose, onSaved, onRemove, onPin, onSubmit, MEMO_COLORS }: Props) {
  const isCreate = !memo
  const [formData, setFormData] = useState({
    title: memo?.title ?? '',
    content: memo?.content ?? '',
    color: memo?.color ?? DEFAULT_COLOR,
    type: memo?.type ?? 'note' as 'note' | 'checklist',
  })
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(
    memo?.type === 'checklist' ? parseChecklist(memo.content) : [{ done: false, text: '' }],
  )
  const checklistRefs = useRef<(HTMLInputElement | null)[]>([])
  const [editingIdx, setEditingIdx] = useState<number | null>(isCreate ? 0 : null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const getContent = () =>
    formData.type === 'checklist'
      ? serializeChecklist(checklistItems.filter((i) => i.text.trim()))
      : formData.content

  const handleSave = async () => {
    const content = getContent()
    if (!content.trim()) {
      toast.error(formData.type === 'checklist' ? '항목을 하나 이상 입력해주세요' : '내용을 입력해주세요')
      return
    }
    setSaving(true)
    const res = await onSubmit(formData.title, content, formData.color, formData.type)
    setSaving(false)
    if (res.success && res.data) {
      toast.success(isCreate ? '메모가 추가되었습니다' : '저장됐습니다')
      onSaved(res.data)
      if (isCreate) onClose()
    } else {
      toast.error(`${isCreate ? '추가' : '저장'} 실패: ${res.error}`)
    }
  }

  const handleCheckToggle = async (idx: number, done: boolean) => {
    if (isCreate) { setChecklistItems((prev) => prev.map((item, i) => i === idx ? { ...item, done } : item)); return }
    const updated = checklistItems.map((item, i) => i === idx ? { ...item, done } : item)
    setChecklistItems(updated)
    const content = serializeChecklist(updated.filter((i) => i.text.trim()))
    const res = await onSubmit(formData.title, content, formData.color, formData.type)
    if (res.success && res.data) onSaved(res.data)
  }

  const handleDelete = async () => {
    if (!onRemove || !confirm('이 메모를 삭제하시겠습니까?')) return
    setDeleting(true)
    const res = await onRemove()
    setDeleting(false)
    if (res.success) { toast.success('삭제됐습니다'); onClose() }
    else toast.error(`삭제 실패: ${res.error}`)
  }

  const updateItem = (idx: number, text: string) =>
    setChecklistItems((prev) => prev.map((item, i) => i === idx ? { ...item, text } : item))

  const addItem = (afterIdx?: number) => {
    const insertAt = afterIdx === undefined ? checklistItems.length : afterIdx + 1
    setChecklistItems((prev) => [...prev.slice(0, insertAt), { done: false, text: '' }, ...prev.slice(insertAt)])
    setEditingIdx(insertAt)
    setTimeout(() => checklistRefs.current[insertAt]?.focus(), 0)
  }

  const removeItem = (idx: number) => {
    if (checklistItems.length === 1) { setChecklistItems([{ done: false, text: '' }]); setEditingIdx(0); return }
    setChecklistItems((prev) => prev.filter((_, i) => i !== idx))
    const prevIdx = Math.max(0, idx - 1)
    setEditingIdx(prevIdx)
    setTimeout(() => checklistRefs.current[prevIdx]?.focus(), 0)
  }

  const handleTypeToggle = (t: 'note' | 'checklist') => {
    setFormData((p) => ({ ...p, type: t }))
    if (t === 'checklist' && checklistItems.length === 0) {
      setChecklistItems([{ done: false, text: '' }])
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="memo-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <motion.div
          key="memo-modal-panel"
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="bg-canvas w-full sm:max-w-[600px] rounded-xl shadow-level-2 border border-hairline overflow-hidden max-h-[90dvh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-hairline shrink-0">
            {isCreate ? (
              <div className="flex gap-2">
                {(['note', 'checklist'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeToggle(t)}
                    className={`px-3 py-1 rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${
                      formData.type === t
                        ? 'bg-primary-700 text-white border-primary-700'
                        : 'bg-canvas text-ink-muted border-hairline hover:border-primary-700/40'
                    }`}
                  >
                    {t === 'note' ? '📝 메모' : '☑ 체크리스트'}
                  </button>
                ))}
              </div>
            ) : (
              <h3 className="m-0 text-[15px] font-bold text-ink">
                {formData.type === 'checklist' ? '☑ 체크리스트' : '📝 메모'}
              </h3>
            )}
            <div className="flex items-center gap-1">
              {!isCreate && onPin && (
                <button
                  onClick={() => onPin(!memo!.is_pinned)}
                  title={memo!.is_pinned ? '고정 해제' : '고정'}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-base cursor-pointer ${memo!.is_pinned ? 'bg-amber-50 text-amber-500' : 'hover:bg-canvas-soft text-ink-faint'}`}
                >
                  📌
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-canvas-soft text-ink-faint transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-3">
            <input
              type="text"
              placeholder="제목 (선택)"
              value={formData.title}
              onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm font-[inherit] focus:outline-none focus:border-primary-700 focus:ring-1 focus:ring-primary-700/20"
            />

            {formData.type === 'checklist' ? (
              <div className="border border-hairline rounded-lg px-4 py-3 flex flex-col gap-2" style={{ backgroundColor: formData.color }}>
                {checklistItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={(e) => handleCheckToggle(idx, e.target.checked)}
                      className="w-4 h-4 accent-primary-700 shrink-0 cursor-pointer"
                    />
                    {editingIdx === idx ? (
                      <input
                        ref={(el) => { checklistRefs.current[idx] = el }}
                        type="text"
                        value={item.text}
                        onChange={(e) => updateItem(idx, e.target.value)}
                        onBlur={() => setEditingIdx(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); addItem(idx) }
                          if (e.key === 'Backspace' && !item.text) { e.preventDefault(); removeItem(idx) }
                          if (e.key === 'Escape') { e.preventDefault(); setEditingIdx(null) }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setEditingIdx(idx - 1); setTimeout(() => checklistRefs.current[idx - 1]?.focus(), 0) }
                          if (e.key === 'ArrowDown') { e.preventDefault(); setEditingIdx(idx + 1); setTimeout(() => checklistRefs.current[idx + 1]?.focus(), 0) }
                        }}
                        autoFocus
                        placeholder="할 일 항목..."
                        className={`flex-1 border-none outline-none text-sm font-[inherit] bg-transparent ${item.done ? 'line-through text-ink-faint' : ''}`}
                      />
                    ) : (
                      <span
                        onClick={() => handleCheckToggle(idx, !item.done)}
                        onDoubleClick={() => { setEditingIdx(idx); setTimeout(() => checklistRefs.current[idx]?.focus(), 0) }}
                        className={`flex-1 text-sm select-none cursor-pointer ${item.done ? 'line-through text-ink-faint' : 'text-ink-secondary'} ${!item.text ? 'text-ink-faint italic' : ''}`}
                      >
                        {item.text || '할 일 항목...'}
                      </span>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addItem()}
                  className="text-sm text-primary-700 hover:text-primary-800 text-left mt-1 font-medium cursor-pointer"
                >
                  + 항목 추가
                </button>
              </div>
            ) : (
              <textarea
                placeholder="내용을 입력하세요..."
                value={formData.content}
                onChange={(e) => setFormData((p) => ({ ...p, content: e.target.value }))}
                rows={12}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm font-[inherit] focus:outline-none focus:border-primary-700 focus:ring-1 focus:ring-primary-700/20 resize-none transition-colors"
                style={{ backgroundColor: formData.color }}
              />
            )}

            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-ink-muted">배경색</span>
              <div className="flex gap-2">
                {MEMO_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-label={c.name}
                    onClick={() => setFormData((p) => ({ ...p, color: c.value }))}
                    className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-transform p-0 ${formData.color === c.value ? 'border-[#111] scale-110' : 'border-hairline hover:scale-105'}`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>
            {!isCreate && (
              <p className="m-0 text-[11px] text-ink-faint">
                {new Date(memo!.updated_at).toLocaleDateString('ko-KR')} 수정
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-hairline flex items-center justify-between shrink-0">
            {!isCreate && onRemove ? (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-rose-500 text-white text-[12px] font-semibold hover:bg-rose-600 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {deleting ? '삭제 중...' : '삭제'}
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-primary-700 text-white text-[12px] font-bold hover:bg-primary-800 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {saving ? (isCreate ? '추가 중...' : '저장 중...') : (isCreate ? '추가' : '저장')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
