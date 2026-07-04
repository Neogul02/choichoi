'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { showMsg } from '@/lib/toast';
import { createRosterShift, updateRosterShift, deleteRosterShift, updateRosterShiftOrder } from '@/app/actions/roster';
import type { RosterUnit, RosterShiftInput } from '@/app/actions/roster';
import type { RosterShift } from '@/types/database';

interface Props {
  unit: RosterUnit;
  unitLabel: string;
  shifts: RosterShift[];
  onShiftsChange: (shifts: RosterShift[]) => void;
  onClose: () => void;
}

const EMPTY_FORM: RosterShiftInput = { name: '', start_time: '09:00', end_time: '18:00', weekday_required: 1, weekend_required: 1, active_from: null, active_to: null };

export default function ShiftManageModal({ unit, unitLabel, shifts, onShiftsChange, onClose }: Props) {
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<RosterShiftInput>(EMPTY_FORM);
  const [isBusy, setIsBusy] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const startEdit = (shift: RosterShift) => {
    setEditingId(shift.id);
    setForm({
      name: shift.name,
      start_time: shift.start_time,
      end_time: shift.end_time,
      weekday_required: shift.weekday_required,
      weekend_required: shift.weekend_required,
      active_from: shift.active_from ?? null,
      active_to: shift.active_to ?? null,
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showMsg('파트 이름을 입력하세요'); return; }
    setIsBusy(true);
    if (editingId === 'new') {
      const r = await createRosterShift(unit, form);
      if (r.success && r.data) { onShiftsChange([...shifts, r.data]); setEditingId(null); showMsg(`${r.data.name} 파트 추가됨`); }
      else showMsg(`오류: ${r.error}`);
    } else if (typeof editingId === 'number') {
      const r = await updateRosterShift(editingId, form);
      if (r.success && r.data) { onShiftsChange(shifts.map(s => s.id === editingId ? r.data! : s)); setEditingId(null); }
      else showMsg(`오류: ${r.error}`);
    }
    setIsBusy(false);
  };

  const handleDelete = async (shift: RosterShift) => {
    if (!confirm(`"${shift.name}" 파트를 삭제하시겠습니까?\n이 파트의 배정 내역도 함께 삭제됩니다.`)) return;
    setIsBusy(true);
    const r = await deleteRosterShift(shift.id);
    setIsBusy(false);
    if (r.success) { onShiftsChange(shifts.filter(s => s.id !== shift.id)); showMsg('삭제되었습니다'); }
    else showMsg(`오류: ${r.error}`);
  };

  const handleDrop = async (targetId: number) => {
    if (!draggingId || draggingId === targetId) { setDraggingId(null); setDragOverId(null); return; }
    const ids = shifts.map(s => s.id);
    const fromIdx = ids.indexOf(draggingId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) { setDraggingId(null); setDragOverId(null); return; }
    const newOrder = [...ids];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggingId);
    const currentOrders = ids.map(id => shifts.find(s => s.id === id)!.sort_order);
    const updates = newOrder.map((id, i) => ({ id, sort_order: currentOrders[i] }));
    const orderMap = new Map(updates.map(u => [u.id, u.sort_order]));
    const reordered = newOrder.map(id => ({ ...shifts.find(s => s.id === id)!, sort_order: orderMap.get(id)! }));
    onShiftsChange(reordered);
    setDraggingId(null);
    setDragOverId(null);
    await updateRosterShiftOrder(updates);
  };

  const inputCls = 'px-2 py-1.5 border border-hairline rounded-lg text-[13px] bg-canvas focus:outline-none focus:border-primary-700';
  const labelCls = 'text-[10px] font-semibold text-ink-muted';

  const editForm = (
    <div className="flex flex-col gap-2 bg-primary-50/40 border border-primary-200 rounded-lg p-3">
      <div className="flex flex-col gap-1">
        <label className={labelCls}>파트 이름</label>
        <input
          value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="예: 과일손질, 배송" autoFocus className={`${inputCls} w-full`}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className={`${labelCls} w-10 shrink-0`}>시간</label>
        <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className={`${inputCls} flex-1 min-w-0`} />
        <span className="text-ink-faint text-[12px]">~</span>
        <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className={`${inputCls} flex-1 min-w-0`} />
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <label className={labelCls}>평일 인원</label>
          <input
            type="number" min={0} value={form.weekday_required}
            onChange={e => setForm(f => ({ ...f, weekday_required: Math.max(0, Number(e.target.value)) }))}
            className={`${inputCls} w-14 text-center`}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className={labelCls}>주말 인원</label>
          <input
            type="number" min={0} value={form.weekend_required}
            onChange={e => setForm(f => ({ ...f, weekend_required: Math.max(0, Number(e.target.value)) }))}
            className={`${inputCls} w-14 text-center`}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>활성 기간 <span className="font-normal text-ink-faint">(비워두면 제한 없음)</span></label>
        <div className="flex items-center gap-1.5">
          <input
            type="date" value={form.active_from ?? ''}
            onChange={e => setForm(f => ({ ...f, active_from: e.target.value || null }))}
            className={`${inputCls} flex-1`}
          />
          <span className="text-ink-faint text-[12px] shrink-0">~</span>
          <input
            type="date" value={form.active_to ?? ''}
            onChange={e => setForm(f => ({ ...f, active_to: e.target.value || null }))}
            className={`${inputCls} flex-1`}
          />
        </div>
      </div>
      <div className="flex gap-1.5 mt-0.5">
        <button
          type="button" onClick={() => setEditingId(null)} disabled={isBusy}
          className="flex-1 py-1.5 rounded-lg border border-hairline bg-canvas text-ink-muted text-[12px] font-semibold cursor-pointer hover:bg-canvas-soft transition disabled:opacity-60"
        >
          취소
        </button>
        <button
          type="button" onClick={handleSave} disabled={isBusy || !form.name.trim()}
          className="flex-1 py-1.5 rounded-lg border-none bg-primary-700 text-white text-[12px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-60"
        >
          {isBusy ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-canvas w-full max-w-[420px] max-h-[85vh] overflow-y-auto rounded-xl shadow-level-2 border border-hairline p-5 [scrollbar-width:thin]">
        <div className="flex items-center justify-between mb-1">
          <h3 className="m-0 text-[16px] font-bold text-ink">파트 관리</h3>
          <button onClick={onClose} className="bg-transparent border-none text-ink-faint text-lg cursor-pointer leading-none hover:text-ink transition">×</button>
        </div>
        <p className="m-0 mb-4 text-[12px] text-ink-muted">{unitLabel} · ⋮⋮ 드래그로 순서 변경</p>

        <div className="flex flex-col gap-2">
          {shifts.map(shift => (
            editingId === shift.id ? (
              <div key={shift.id}>{editForm}</div>
            ) : (
              <div
                key={shift.id}
                draggable
                onDragStart={e => { e.stopPropagation(); setDraggingId(shift.id); }}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverId(shift.id); }}
                onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); handleDrop(shift.id); }}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 transition ${
                  dragOverId === shift.id
                    ? 'bg-primary-50 outline outline-2 outline-primary-400 outline-offset-[-1px]'
                    : 'bg-canvas-soft'
                } ${draggingId === shift.id ? 'opacity-40' : ''}`}
              >
                <span className="text-ink-faint text-[13px] select-none cursor-grab shrink-0">⋮⋮</span>
                <div className="flex-1 min-w-0">
                  <p className="m-0 text-[13px] font-bold text-ink truncate">{shift.name}</p>
                  <p className="m-0 text-[11px] text-ink-muted">
                    {shift.start_time}~{shift.end_time} · 평일 {shift.weekday_required}명 · 주말 {shift.weekend_required}명
                  </p>
                  {(shift.active_from || shift.active_to) && (
                    <p className="m-0 text-[10px] text-primary-600 mt-0.5">
                      {shift.active_from ? shift.active_from.slice(5).replace('-', '/') : '∞'} ~ {shift.active_to ? shift.active_to.slice(5).replace('-', '/') : '∞'}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => startEdit(shift)}
                  title="수정"
                  className="shrink-0 bg-transparent border-none text-ink-faint cursor-pointer p-0.5 hover:text-primary-700 transition"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(shift)}
                  title="삭제"
                  className="shrink-0 bg-transparent border-none text-ink-faint text-[15px] cursor-pointer leading-none hover:text-rose-500 transition"
                >
                  ×
                </button>
              </div>
            )
          ))}

          {editingId === 'new' ? editForm : (
            <button
              onClick={() => { setEditingId('new'); setForm(EMPTY_FORM); }}
              className="w-full py-2 rounded-lg border border-dashed border-hairline bg-transparent text-[12px] text-primary-600 font-bold cursor-pointer hover:border-primary-400 hover:bg-primary-50/40 transition"
            >
              + 파트 추가
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
