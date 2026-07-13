'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  fetchPopupEvents, createNewPopupEvent, removePopupEvent, editPopupEvent, togglePopupEventActive,
} from '@/app/actions/schedule';
import { fetchStores } from '@/app/actions/stores';
import type { PopupEvent, Store } from '@/types/database';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

type EventForm = { name: string; startDate: string; endDate: string; storeId: number | null };

const INITIAL_FORM: EventForm = { name: '', startDate: '', endDate: '', storeId: null };

function weekdayOf(date: string): string | null {
  return date ? DAY_NAMES[new Date(date + 'T00:00:00').getDay()] : null;
}

function validateForm(form: EventForm): string | null {
  if (!form.name.trim() || !form.startDate || !form.endDate) return '모든 항목을 입력하세요';
  if (form.startDate > form.endDate) return '종료일이 시작일보다 앞입니다';
  return null;
}

export default function PopupManagementSection() {
  const [events, setEvents] = useState<PopupEvent[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState<EventForm>(INITIAL_FORM);

  // 인라인 편집: id → 편집 중인 값
  const [inlineEdits, setInlineEdits] = useState<Record<number, EventForm>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([fetchPopupEvents(), fetchStores()]).then(([evRes, stRes]) => {
      if (evRes.success && evRes.data) setEvents(evRes.data);
      if (stRes.success && stRes.data) setStores(stRes.data);
      setIsLoading(false);
    });
  }, []);

  const storeName = (id: number | null) => (id == null ? null : stores.find(s => s.id === id)?.name ?? '알 수 없는 매장');

  // ── 추가 ──────────────────────────────────────────────
  const handleAdd = async () => {
    const invalid = validateForm(addForm);
    if (invalid) { toast.error(invalid); return; }
    setIsAdding(true);
    const res = await createNewPopupEvent(addForm.name.trim(), addForm.startDate, addForm.endDate, addForm.storeId);
    setIsAdding(false);
    if (res.success && res.data) {
      setEvents(p => [res.data!, ...p]);
      setAddForm(INITIAL_FORM);
      toast.success('팝업이 추가됐습니다');
    } else {
      toast.error(`오류: ${res.error}`);
    }
  };

  // ── 인라인 수정 ────────────────────────────────────────
  const startEdit = (ev: PopupEvent) => {
    setInlineEdits(p => ({ ...p, [ev.id]: { name: ev.name, startDate: ev.start_date, endDate: ev.end_date, storeId: ev.store_id } }));
  };

  const cancelEdit = (id: number) => {
    setInlineEdits(p => { const n = { ...p }; delete n[id]; return n; });
  };

  const saveEdit = async (id: number) => {
    const draft = inlineEdits[id];
    if (!draft) return;
    const invalid = validateForm(draft);
    if (invalid) { toast.error(invalid); return; }
    setSavingId(id);
    const res = await editPopupEvent(id, draft.name.trim(), draft.startDate, draft.endDate, draft.storeId);
    setSavingId(null);
    if (res.success && res.data) {
      setEvents(p => p.map(ev => ev.id === id ? res.data! : ev));
      cancelEdit(id);
      toast.success('수정됐습니다');
    } else {
      toast.error(`오류: ${res.error}`);
    }
  };

  // ── 삭제 ──────────────────────────────────────────────
  const handleDelete = async (ev: PopupEvent) => {
    if (!confirm(`"${ev.name}" 팝업을 삭제하시겠습니까?`)) return;
    const res = await removePopupEvent(ev.id);
    if (res.success) {
      setEvents(p => p.filter(e => e.id !== ev.id));
      cancelEdit(ev.id);
      toast.success('삭제됐습니다');
    } else {
      toast.error(`오류: ${res.error}`);
    }
  };

  // ── 활성 토글 (낙관적 업데이트 + 실패 시 롤백) ─────────────
  const handleToggle = async (ev: PopupEvent) => {
    const next = !(ev.is_active !== false);
    setTogglingId(ev.id);
    setEvents(p => p.map(e => e.id === ev.id ? { ...e, is_active: next } : e));
    const res = await togglePopupEventActive(ev.id, next);
    setTogglingId(null);
    if (res.success && res.data) {
      setEvents(p => p.map(e => e.id === ev.id ? res.data! : e));
      toast.success(next ? '팝업이 활성화됐습니다' : '팝업이 비활성화됐습니다');
    } else {
      setEvents(p => p.map(e => e.id === ev.id ? { ...e, is_active: !next } : e));
      toast.error(`오류: ${res.error}`);
    }
  };

  const inputCls = 'px-3 py-2 border border-hairline rounded-lg text-sm focus:outline-none focus:border-primary-700 bg-canvas';
  const labelCls = 'text-[11px] font-semibold text-ink-muted';

  const renderFormFields = (form: EventForm, onChange: (updates: Partial<EventForm>) => void) => {
    const startWeekday = weekdayOf(form.startDate);
    return (
      <>
        <div className="flex gap-2 mb-2.5">
          <input
            type="text" value={form.name} placeholder="팝업 이름"
            onChange={e => onChange({ name: e.target.value })}
            className={`flex-1 ${inputCls}`}
          />
          <select
            value={form.storeId ?? ''}
            onChange={e => onChange({ storeId: e.target.value ? Number(e.target.value) : null })}
            className={`w-40 ${inputCls}`}
          >
            <option value="">매장 선택 안 함</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 flex flex-col gap-0.5">
            <label className={labelCls}>
              시작일 {startWeekday && <span className="text-primary-700">({startWeekday}요일)</span>}
            </label>
            <input type="date" value={form.startDate} onChange={e => onChange({ startDate: e.target.value })} className={inputCls} />
          </div>
          <div className="flex-1 flex flex-col gap-0.5">
            <label className={labelCls}>종료일</label>
            <input type="date" value={form.endDate} onChange={e => onChange({ endDate: e.target.value })} className={inputCls} />
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      {/* 새 팝업 추가 폼 */}
      <div className="bg-canvas-soft rounded-xl p-4 mb-5">
        <h3 className="mt-0 mb-3 text-base font-bold">새 팝업 추가</h3>
        {renderFormFields(addForm, updates => setAddForm(p => ({ ...p, ...updates })))}
        <div className="flex justify-end mt-3">
          <button onClick={handleAdd} disabled={isAdding}
            className="px-4 py-2 rounded-lg border-none font-semibold text-sm bg-primary-700 text-white cursor-pointer disabled:opacity-60 hover:bg-primary-800 transition-colors">
            {isAdding ? '추가 중...' : '추가'}
          </button>
        </div>
      </div>

      {/* 팝업 목록 */}
      <h3 className="mb-1.5 text-base font-bold">팝업 목록</h3>
      <p className="mt-0 mb-3 text-xs text-ink-muted">
        비활성 팝업은 로그인·디스플레이의 팝업 선택과 인사 스케줄의 매장 목록에서 숨겨집니다.
      </p>
      {isLoading ? <p className="text-ink-muted text-sm">로딩 중...</p> : events.length === 0 ? (
        <p className="text-ink-faint text-sm">등록된 팝업이 없습니다.</p>
      ) : (
        <ul className="m-0 p-0 list-none space-y-1.5">
          {events.map(ev => {
            const draft = inlineEdits[ev.id];
            const isEditing = !!draft;
            const isSaving = savingId === ev.id;
            const isActive = ev.is_active !== false;

            return (
              <li key={ev.id} className={`rounded-xl border border-hairline bg-canvas transition-all ${isEditing ? 'shadow-level-1' : ''}`}>
                {isEditing ? (
                  /* ── 인라인 편집 모드 ── */
                  <div className="p-3">
                    {renderFormFields(draft, updates => setInlineEdits(p => ({ ...p, [ev.id]: { ...p[ev.id], ...updates } })))}
                    <div className="flex justify-end gap-1.5 mt-3">
                      <button onClick={() => cancelEdit(ev.id)} disabled={isSaving}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-hairline bg-canvas text-ink-muted hover:bg-canvas-soft cursor-pointer disabled:opacity-50 transition-colors">
                        취소
                      </button>
                      <button onClick={() => saveEdit(ev.id)} disabled={isSaving}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none bg-primary-700 text-white hover:bg-primary-800 cursor-pointer disabled:opacity-50 transition-colors">
                        {isSaving ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── 일반 표시 모드 ── */
                  <div className={`flex items-center gap-3 px-3 py-2.5 ${isActive ? '' : 'opacity-55'}`}>
                    {/* 활성 토글 스위치 */}
                    <button
                      role="switch" aria-checked={isActive} aria-label={`${ev.name} 활성화`}
                      onClick={() => handleToggle(ev)} disabled={togglingId === ev.id}
                      className={`relative w-9 h-5 rounded-full border-none shrink-0 cursor-pointer transition-colors disabled:opacity-50 ${isActive ? 'bg-primary-700' : 'bg-[#cfd4d9]'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${isActive ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-ink">{ev.name}</span>
                      {!isActive && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-canvas-soft text-ink-muted">비활성</span>
                      )}
                      <span className="block text-xs text-ink-muted">
                        {ev.start_date} ~ {ev.end_date}
                        {storeName(ev.store_id) && <span className="ml-2 text-primary-700 font-semibold">{storeName(ev.store_id)}</span>}
                      </span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => startEdit(ev)}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold border-none bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer transition-colors">
                        수정
                      </button>
                      <button onClick={() => handleDelete(ev)}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold border-none bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer transition-colors">
                        삭제
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
