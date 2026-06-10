'use client';

import { useState } from 'react';
import type { PopupEvent } from '@/types/database';

interface Props {
  events: PopupEvent[];
  selectedEvent: PopupEvent | null;
  isEventsLoading: boolean;
  showAddEvent: boolean;
  newEvent: { name: string; startDate: string; endDate: string };
  startWeekday: string | null;
  onToggleAddEvent: () => void;
  onUpdateNewEvent: (updates: Partial<{ name: string; startDate: string; endDate: string }>) => void;
  onCreateEvent: () => void;
  onSelectEvent: (event: PopupEvent) => void;
  onDeleteEvent: (e: React.MouseEvent, event: PopupEvent) => void;
  onEditEvent: (event: PopupEvent, name: string, startDate: string, endDate: string) => Promise<void>;
}

export default function ScheduleSidebar({
  events, selectedEvent, isEventsLoading,
  showAddEvent, newEvent, startWeekday,
  onToggleAddEvent, onUpdateNewEvent, onCreateEvent,
  onSelectEvent, onDeleteEvent, onEditEvent,
}: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', startDate: '', endDate: '' });
  const [isSaving, setIsSaving] = useState(false);

  const openEdit = (e: React.MouseEvent, event: PopupEvent) => {
    e.stopPropagation();
    setEditingId(event.id);
    setEditForm({ name: event.name, startDate: event.start_date, endDate: event.end_date });
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const saveEdit = async (e: React.MouseEvent, event: PopupEvent) => {
    e.stopPropagation();
    setIsSaving(true);
    await onEditEvent(event, editForm.name, editForm.startDate, editForm.endDate);
    setIsSaving(false);
    setEditingId(null);
  };

  const handleSelect = (event: PopupEvent) => {
    setEditingId(null);
    onSelectEvent(event);
  };

  const inputCls = 'w-full px-2 py-1 border border-hairline rounded text-xs focus:outline-none focus:border-primary-700';

  return (
    <div className="w-full md:w-[230px] shrink-0">
      <div className="bg-canvas rounded-xl p-3.5 shadow-level-1 border border-hairline">
        <div className="flex justify-between items-center mb-2.5">
          <h2 className="m-0 text-sm font-extrabold">일정 목록</h2>
          <button
            className={`px-2.5 py-1 border-none rounded-lg text-[11px] font-bold cursor-pointer transition ${showAddEvent ? 'bg-canvas-soft text-ink-muted' : 'bg-primary-700 text-white hover:bg-primary-800'}`}
            onClick={onToggleAddEvent}
          >
            {showAddEvent ? '취소' : '+ 추가'}
          </button>
        </div>

        {showAddEvent && (
          <div className="bg-canvas-soft rounded-lg p-2.5 mb-2.5 flex flex-col gap-1.5">
            <input
              type="text" placeholder="일정 이름" value={newEvent.name}
              onChange={e => onUpdateNewEvent({ name: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && onCreateEvent()}
              className={inputCls}
            />
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-semibold text-ink-muted">
                시작일 {startWeekday && <span className="text-primary-700">{startWeekday}요일</span>}
              </label>
              <input type="date" value={newEvent.startDate} onChange={e => onUpdateNewEvent({ startDate: e.target.value })} className={inputCls} />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-semibold text-ink-muted">종료일</label>
              <input type="date" value={newEvent.endDate} onChange={e => onUpdateNewEvent({ endDate: e.target.value })} className={inputCls} />
            </div>
            <button className="w-full p-1.5 border-none rounded bg-primary-700 text-white text-xs font-bold cursor-pointer hover:bg-primary-800 transition" onClick={onCreateEvent}>
              일정 생성
            </button>
          </div>
        )}

        {isEventsLoading ? (
          <p className="text-ink-faint text-xs m-0">불러오는 중...</p>
        ) : events.length === 0 ? (
          <p className="text-ink-faint text-xs m-0">일정이 없습니다.</p>
        ) : (
          <ul className="list-none m-0 p-0 flex flex-col gap-1">
            {events.map(event => (
              <li
                key={event.id}
                className={`px-2.5 py-2 rounded-lg border-[1.5px] transition ${
                  selectedEvent?.id === event.id ? 'border-primary-700 bg-primary-50' : 'border-hairline hover:border-primary-700 hover:bg-primary-50'
                } ${editingId === event.id ? 'cursor-default' : 'cursor-pointer'}`}
                onClick={() => editingId !== event.id && handleSelect(event)}
              >
                {editingId === event.id ? (
                  /* 편집 폼 */
                  <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="text" value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="일정 이름"
                      className={inputCls}
                      autoFocus
                    />
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] font-semibold text-ink-muted">시작일</label>
                      <input type="date" value={editForm.startDate} onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))} className={inputCls} />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] font-semibold text-ink-muted">종료일</label>
                      <input type="date" value={editForm.endDate} onChange={e => setEditForm(f => ({ ...f, endDate: e.target.value }))} className={inputCls} />
                    </div>
                    <div className="flex gap-1 mt-0.5">
                      <button
                        onClick={e => cancelEdit(e)}
                        className="flex-1 py-1 rounded border border-hairline bg-canvas text-[11px] font-semibold text-ink-muted cursor-pointer hover:bg-canvas-soft transition"
                      >
                        취소
                      </button>
                      <button
                        onClick={e => saveEdit(e, event)}
                        disabled={isSaving}
                        className="flex-1 py-1 rounded border-none bg-primary-700 text-white text-[11px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isSaving ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 기본 뷰 */
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 min-w-0">
                      <strong className="block text-[12px] font-bold text-ink truncate">{event.name}</strong>
                      <span className="text-[10px] text-ink-muted">{event.start_date} ~ {event.end_date}</span>
                    </div>
                    <button
                      onClick={e => openEdit(e, event)}
                      title="수정"
                      className="bg-transparent border-none text-ink-faint cursor-pointer leading-none hover:text-primary-700 transition p-0.5"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button
                      onClick={e => onDeleteEvent(e, event)}
                      title="삭제"
                      className="bg-transparent border-none text-ink-faint text-base cursor-pointer leading-none hover:text-red-500 transition"
                    >
                      ×
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
