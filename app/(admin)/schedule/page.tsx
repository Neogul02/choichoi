'use client';

import NavBar from '@/components/NavBar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchPopupEvents, createNewPopupEvent, removePopupEvent, editPopupEvent,
  fetchScheduleByEvent, addScheduleEntry, removeScheduleEntry,
  moveScheduleEntry, editScheduleEntry, copyScheduleEntry,
  fetchWorkers, editWorker, createNewWorker,
} from '@/app/actions/schedule';
import { fetchAllUserProfiles, findOrCreateWorkerFromProfile } from '@/app/actions/workers';
import type { UserProfile } from '@/app/actions/workers';
import type { PopupEvent, ScheduleSlot, Worker } from '@/types/database';
import { toLocalDateStr } from '@/lib/utils';
import { showMsg } from '@/lib/toast';
import ScheduleSidebar from './_components/ScheduleSidebar';
const ROLES = ['프론트', '주방', '매니저'] as const;
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;
const WORKER_COLORS = ['#22c55e', '#6366f1', '#ef4444', '#f97316', '#64748b'] as const;

type DragCell = { date: string; role: string };
type DragMode = 'move' | 'copy';

function getEventDates(startDate: string, endDate: string): Date[] {
  const dates: Date[] = [];
  const cur = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (cur <= end) { dates.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  return dates;
}

export default function SchedulePage() {
  // Events
  const [events, setEvents] = useState<PopupEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<PopupEvent | null>(null);
  const [isEventsLoading, setIsEventsLoading] = useState(true);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ name: '', startDate: '', endDate: '' });

  // Workers (이벤트별, 드래그 시 자동 생성)
  const [workers, setWorkers] = useState<Worker[]>([]);

  // 전체 직원 풀 (user_profiles)
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);

  // Slots
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [isSlotsLoading, setIsSlotsLoading] = useState(false);

  // UI
  const [weekOffset, setWeekOffset] = useState(0);
  const [dragMode, setDragMode] = useState<DragMode>('move');

  // Edit slot
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null);
  const [editWorkerId, setEditWorkerId] = useState<number | ''>('');
  const [editWorkTime, setEditWorkTime] = useState('');
  const [editBreak, setEditBreak] = useState<0 | 30 | 60>(0);

  // Drag
  const [draggedSlotId, setDraggedSlotId] = useState<number | null>(null);
  const [draggingProfileId, setDraggingProfileId] = useState<string | null>(null);
  const [dragOverCell, setDragOverCell] = useState<DragCell | null>(null);
  const touchDragRef = useRef<number | null>(null);
  const touchProfileRef = useRef<string | null>(null);
  const touchWorkerRef = useRef<number | null>(null);

  // 임시 근무자 추가 폼
  const [showTempWorkerForm, setShowTempWorkerForm] = useState(false);
  const [tempWorkerName, setTempWorkerName] = useState('');
  const [draggingWorkerId, setDraggingWorkerId] = useState<number | null>(null);

  // Color picker
  const [colorPickerWorkerId, setColorPickerWorkerId] = useState<number | null>(null);

  const loadEvents = async () => {
    setIsEventsLoading(true);
    const r = await fetchPopupEvents();
    if (r.success && r.data) setEvents(r.data);
    setIsEventsLoading(false);
  };

  useEffect(() => {
    loadEvents();
    fetchAllUserProfiles().then(r => { if (r.success && r.data) setUserProfiles(r.data); });
  }, []);

  const loadWorkers = async (eventId: number) => {
    const r = await fetchWorkers(eventId);
    if (r.success && r.data) setWorkers(r.data);
  };

  const loadSlots = async (eventId: number) => {
    setIsSlotsLoading(true);
    const r = await fetchScheduleByEvent(eventId);
    if (r.success && r.data) setSlots(r.data);
    setIsSlotsLoading(false);
  };

  // ── Events ────────────────────────────────────────────────────────────────
  const handleSelectEvent = (event: PopupEvent) => {
    setSelectedEvent(event); setEditingSlotId(null); setWeekOffset(0); setWorkers([]);
    Promise.all([loadSlots(event.id), loadWorkers(event.id)]);
  };

  const handleCreateEvent = async () => {
    if (!newEvent.name.trim() || !newEvent.startDate || !newEvent.endDate) { showMsg('모든 항목을 입력하세요'); return; }
    if (newEvent.startDate > newEvent.endDate) { showMsg('종료일이 시작일보다 앞입니다'); return; }
    const r = await createNewPopupEvent(newEvent.name.trim(), newEvent.startDate, newEvent.endDate);
    if (r.success && r.data) { setEvents(p => [r.data!, ...p]); setShowAddEvent(false); setNewEvent({ name: '', startDate: '', endDate: '' }); handleSelectEvent(r.data); showMsg('일정이 생성되었습니다'); }
    else showMsg(`오류: ${r.error}`);
  };

  const handleEditEvent = async (event: PopupEvent, name: string, startDate: string, endDate: string) => {
    const r = await editPopupEvent(event.id, name, startDate, endDate);
    if (r.success && r.data) {
      setEvents(p => p.map(ev => ev.id === event.id ? r.data! : ev));
      if (selectedEvent?.id === event.id) setSelectedEvent(r.data);
      showMsg('일정이 수정되었습니다');
    } else {
      showMsg(`오류: ${r.error}`);
    }
  };

  const handleDeleteEvent = async (e: React.MouseEvent, event: PopupEvent) => {
    e.stopPropagation();
    if (!confirm(`"${event.name}" 일정을 삭제하시겠습니까?\n인원 데이터도 삭제됩니다.`)) return;
    const r = await removePopupEvent(event.id);
    if (r.success) { setEvents(p => p.filter(ev => ev.id !== event.id)); if (selectedEvent?.id === event.id) { setSelectedEvent(null); setSlots([]); setWorkers([]); } }
    else showMsg(`오류: ${r.error}`);
  };

  // ── Slots ─────────────────────────────────────────────────────────────────
  const slotsByCell = useMemo(() => {
    const map = new Map<string, ScheduleSlot[]>();
    for (const s of slots) {
      const key = `${s.schedule_date}|${s.role}`;
      const bucket = map.get(key);
      if (bucket) bucket.push(s); else map.set(key, [s]);
    }
    return map;
  }, [slots]);
  const getSlotsForCell = (dateStr: string, role: string) =>
    slotsByCell.get(`${dateStr}|${role}`) ?? [];

  const handleRemovePerson = async (id: number) => {
    if (!confirm('삭제하시겠습니까?')) return;
    const r = await removeScheduleEntry(id);
    if (r.success) setSlots(p => p.filter(s => s.id !== id));
    else showMsg(`오류: ${r.error}`);
  };

  const handleEditStart = (e: React.MouseEvent, slot: ScheduleSlot) => {
    e.stopPropagation();
    setEditingSlotId(slot.id); setEditWorkerId(slot.worker_id ?? ''); setEditWorkTime(slot.work_time ?? ''); setEditBreak((slot.break_time ?? 0) as 0 | 30 | 60);
  };

  const handleEditSave = async (id: number) => {
    if (editWorkerId === '') { showMsg('근무자를 선택하세요'); return; }
    const wid = editWorkerId as number;
    const name = workers.find(w => w.id === wid)?.name ?? '';
    if (!name) { showMsg('근무자 정보를 찾을 수 없습니다'); return; }
    const r = await editScheduleEntry(id, name, editWorkTime.trim(), wid, editBreak);
    if (r.success && r.data) { setSlots(p => p.map(s => s.id === id ? r.data! : s)); showMsg('수정되었습니다'); setEditingSlotId(null); }
    else showMsg(`오류: ${r.error}`);
  };

  const handleWorkerColorChange = async (worker: Worker, color: string) => {
    const r = await editWorker(worker.id, { event_id: worker.event_id, name: worker.name, color, phone: worker.phone ?? '', bank_name: worker.bank_name ?? '', bank_account: worker.bank_account ?? '', hourly_rate: worker.hourly_rate, worker_role: worker.worker_role ?? '프론트' });
    if (r.success && r.data) { setWorkers(p => p.map(w => w.id === worker.id ? r.data! : w)); setColorPickerWorkerId(null); }
    else showMsg(`오류: ${r.error}`);
  };

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: number) => {
    if (editingSlotId === id) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = dragMode === 'copy' ? 'copy' : 'move'; setDraggedSlotId(id);
  };
  const handleDragEnd = () => { setDraggedSlotId(null); setDraggingProfileId(null); setDraggingWorkerId(null); setDragOverCell(null); };
  const handleDragOver = (e: React.DragEvent<HTMLTableCellElement>, dateStr: string, role: string) => { e.preventDefault(); setDragOverCell({ date: dateStr, role }); };
  const handleDragLeave = () => setDragOverCell(null);

  const handleDrop = async (e: React.DragEvent<HTMLTableCellElement>, dateStr: string, role: string) => {
    e.preventDefault();
    if (draggingWorkerId !== null) {
      const worker = workers.find(w => w.id === draggingWorkerId);
      if (worker && selectedEvent) {
        const sr = await addScheduleEntry(selectedEvent.id, dateStr, role, worker.name, '', worker.id, 0);
        if (sr.success && sr.data) { setSlots(p => [...p, sr.data!]); showMsg('인원이 추가되었습니다'); }
        else showMsg(`오류: ${sr.error}`);
      }
      setDraggingWorkerId(null); setDragOverCell(null); return;
    }
    if (draggingProfileId !== null) {
      if (!selectedEvent) { setDraggingProfileId(null); setDragOverCell(null); return; }
      const r = await findOrCreateWorkerFromProfile(selectedEvent.id, draggingProfileId);
      if (r.success && r.data) {
        const worker = r.data;
        setWorkers(p => p.find(w => w.id === worker.id) ? p : [...p, worker]);
        const sr = await addScheduleEntry(selectedEvent.id, dateStr, role, worker.name, '', worker.id, 0);
        if (sr.success && sr.data) { setSlots(p => [...p, sr.data!]); showMsg('인원이 추가되었습니다'); }
        else showMsg(`오류: ${sr.error}`);
      } else {
        showMsg(`오류: ${r.error}`);
      }
      setDraggingProfileId(null); setDragOverCell(null);
      return;
    }
    if (!draggedSlotId) return;
    if (dragMode === 'copy') {
      const r = await copyScheduleEntry(draggedSlotId, dateStr, role);
      if (r.success && r.data) setSlots(p => [...p, r.data!]); else showMsg(`오류: ${r.error}`);
    } else {
      const slot = slots.find(s => s.id === draggedSlotId);
      if (!slot || (slot.schedule_date === dateStr && slot.role === role)) { setDraggedSlotId(null); setDragOverCell(null); return; }
      const r = await moveScheduleEntry(draggedSlotId, dateStr, role);
      if (r.success && r.data) setSlots(p => p.map(s => s.id === draggedSlotId ? r.data! : s)); else showMsg(`오류: ${r.error}`);
    }
    setDraggedSlotId(null); setDragOverCell(null);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>, id: number) => {
    if (editingSlotId === id) return; e.preventDefault(); touchDragRef.current = id; setDraggedSlotId(id);
  };
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchDragRef.current && !touchProfileRef.current) return;
    e.preventDefault();
    const t = e.touches[0]; const el = document.elementFromPoint(t.clientX, t.clientY)?.closest('[data-cell]');
    if (el) setDragOverCell({ date: el.getAttribute('data-date')!, role: el.getAttribute('data-role')! });
    else setDragOverCell(null);
  };
  const handleTouchEnd = async () => {
    if (touchWorkerRef.current && dragOverCell) {
      const worker = workers.find(w => w.id === touchWorkerRef.current);
      if (worker && selectedEvent) {
        const sr = await addScheduleEntry(selectedEvent.id, dragOverCell.date, dragOverCell.role, worker.name, '', worker.id, 0);
        if (sr.success && sr.data) { setSlots(p => [...p, sr.data!]); showMsg('인원이 추가되었습니다'); }
        else showMsg(`오류: ${sr.error}`);
      }
      touchWorkerRef.current = null; setDraggingWorkerId(null); setDragOverCell(null); return;
    }
    if (touchProfileRef.current && dragOverCell) {
      const profileId = touchProfileRef.current;
      if (selectedEvent) {
        const r = await findOrCreateWorkerFromProfile(selectedEvent.id, profileId);
        if (r.success && r.data) {
          const worker = r.data;
          setWorkers(p => p.find(w => w.id === worker.id) ? p : [...p, worker]);
          const sr = await addScheduleEntry(selectedEvent.id, dragOverCell.date, dragOverCell.role, worker.name, '', worker.id, 0);
          if (sr.success && sr.data) { setSlots(p => [...p, sr.data!]); showMsg('인원이 추가되었습니다'); }
          else showMsg(`오류: ${sr.error}`);
        } else showMsg(`오류: ${r.error}`);
      }
      touchProfileRef.current = null; setDraggingProfileId(null); setDragOverCell(null);
      return;
    }
    if (touchDragRef.current && dragOverCell) {
      const { date, role } = dragOverCell;
      const slot = slots.find(s => s.id === touchDragRef.current);
      if (slot && (slot.schedule_date !== date || slot.role !== role)) {
        const r = dragMode === 'copy' ? await copyScheduleEntry(touchDragRef.current, date, role) : await moveScheduleEntry(touchDragRef.current, date, role);
        if (r.success && r.data) { if (dragMode === 'copy') setSlots(p => [...p, r.data!]); else setSlots(p => p.map(s => s.id === touchDragRef.current ? r.data! : s)); }
      }
    }
    touchDragRef.current = null; setDraggedSlotId(null); setDragOverCell(null);
  };

  // ── Computed ──────────────────────────────────────────────────────────────
  const eventDates = useMemo(() => selectedEvent ? getEventDates(selectedEvent.start_date, selectedEvent.end_date) : [], [selectedEvent]);
  const totalWeeks = Math.ceil(eventDates.length / 7);
  const visibleDates = useMemo(() => eventDates.slice(weekOffset * 7, weekOffset * 7 + 7), [eventDates, weekOffset]);

  const startWeekday = newEvent.startDate ? DAY_NAMES[new Date(newEvent.startDate + 'T00:00:00').getDay()] : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1400px] mx-auto">
        <div className="flex flex-col md:flex-row gap-4 items-stretch">
          <ScheduleSidebar
            events={events} selectedEvent={selectedEvent} isEventsLoading={isEventsLoading}
            showAddEvent={showAddEvent} newEvent={newEvent} startWeekday={startWeekday}
            onToggleAddEvent={() => setShowAddEvent(v => !v)}
            onUpdateNewEvent={(updates) => setNewEvent(p => ({ ...p, ...updates }))}
            onCreateEvent={handleCreateEvent}
            onSelectEvent={handleSelectEvent}
            onDeleteEvent={handleDeleteEvent}
            onEditEvent={handleEditEvent}
          />

          {/* ── 스케줄 그리드 ── */}
          <div className="flex-1 min-w-0 bg-canvas rounded-xl p-4 shadow-level-1 border border-hairline">
            {selectedEvent && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="m-0 text-base font-extrabold">{selectedEvent.name}</h3>
                    {totalWeeks > 1 && (
                      <div className="flex items-center gap-1">
                        <button className="w-6 h-6 rounded bg-canvas-soft border-none cursor-pointer font-bold text-ink-muted hover:bg-[#ececeb] transition text-xs disabled:opacity-30" onClick={() => setWeekOffset(w => w - 1)} disabled={weekOffset === 0}>&lt;</button>
                        <span className="text-[11px] font-semibold text-ink-muted whitespace-nowrap">
                          {visibleDates[0] && `${visibleDates[0].getMonth() + 1}/${visibleDates[0].getDate()}`}~{visibleDates[visibleDates.length - 1] && `${visibleDates[visibleDates.length - 1].getMonth() + 1}/${visibleDates[visibleDates.length - 1].getDate()}`}
                          <span className="text-ink-faint ml-1">({weekOffset + 1}/{totalWeeks})</span>
                        </span>
                        <button className="w-6 h-6 rounded bg-canvas-soft border-none cursor-pointer font-bold text-ink-muted hover:bg-[#ececeb] transition text-xs disabled:opacity-30" onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= totalWeeks - 1}>&gt;</button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-ink-faint font-semibold">드래그</span>
                    {(['move', 'copy'] as const).map(mode => (
                      <button key={mode} className={`px-2.5 py-1 rounded-lg border-none text-[11px] font-bold cursor-pointer transition ${dragMode === mode ? 'bg-primary-700 text-white' : 'bg-canvas-soft text-ink-muted hover:bg-[#ececeb]'}`} onClick={() => setDragMode(mode)}>
                        {mode === 'move' ? '이동' : '복사'}
                      </button>
                    ))}
                  </div>
                </div>

                {isSlotsLoading ? <p className="text-ink-faint text-sm">불러오는 중...</p> : (
                  <div className="overflow-x-auto rounded-lg border border-hairline [scrollbar-width:thin] [scrollbar-color:#ccc_transparent]">
                    <table className="w-full border-collapse" style={{ minWidth: `${56 + visibleDates.length * 88}px` }}>
                      <thead>
                        <tr>
                          <th className="bg-canvas-soft w-[56px] min-w-[56px] text-[11px] text-ink-muted font-semibold text-center sticky left-0 z-[2] border border-hairline px-1 py-2">역할</th>
                          {visibleDates.map((date, i) => {
                            const day = date.getDay();
                            const isSat = day === 6, isSun = day === 0;
                            return (
                              <th key={i} className={`text-center border border-hairline px-1 py-1.5 ${isSun ? 'bg-red-50' : isSat ? 'bg-blue-50' : 'bg-canvas-soft'}`} style={{ minWidth: '88px' }}>
                                <div className={`font-bold text-[12px] leading-tight ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : ''}`}>{DAY_NAMES[day]}</div>
                                <div className={`text-[10px] ${isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-ink-muted'}`}>{date.getMonth() + 1}/{date.getDate()}</div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {ROLES.map(role => (
                          <tr key={role}>
                            <td className="text-[11px] font-bold text-ink-muted text-center bg-canvas-soft whitespace-nowrap sticky left-0 z-[1] border border-hairline px-1 py-1.5">{role}</td>
                            {visibleDates.map((date, i) => {
                              const dateStr = toLocalDateStr(date);
                              const cellSlots = getSlotsForCell(dateStr, role);
                              const isOver = dragOverCell?.date === dateStr && dragOverCell?.role === role;
                              const day = date.getDay();
                              const dayCellBg = isOver ? '' : day === 0 ? 'bg-red-50/60' : day === 6 ? 'bg-blue-50/60' : '';
                              return (
                                <td key={i} className={`p-1 align-top border border-hairline transition duration-150 ${dayCellBg} ${isOver ? 'bg-primary-50 outline-2 outline-dashed outline-primary-700 outline-offset-[-2px]' : ''}`} style={{ minHeight: '60px' }} data-cell data-date={dateStr} data-role={role} onDragOver={e => handleDragOver(e, dateStr, role)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, dateStr, role)}>
                                  <div className="flex flex-col gap-1" style={{ minHeight: '52px' }}>
                                    {cellSlots.map(slot =>
                                      editingSlotId === slot.id ? (
                                        <div key={slot.id} className="flex flex-col gap-1 w-full bg-[#f0f4ff] border border-primary-700 rounded-lg p-1.5">
                                          <select value={editWorkerId} onChange={e => setEditWorkerId(e.target.value ? Number(e.target.value) : '')} autoFocus className="w-full px-1 py-1 border border-hairline rounded text-[10px] focus:outline-none focus:border-primary-700">
                                            <option value="">근무자 선택</option>
                                            {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                          </select>
                                          <input type="text" value={editWorkTime} onChange={e => setEditWorkTime(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleEditSave(slot.id); if (e.key === 'Escape') setEditingSlotId(null); }} placeholder="09-18" className="w-full px-1 py-1 border border-hairline rounded text-[10px] focus:outline-none focus:border-primary-700" />
                                          <div className="flex gap-1 items-center text-[10px]">
                                            <span className="text-ink-muted shrink-0">휴게:</span>
                                            {([0, 30, 60] as const).map(v => (
                                              <button key={v} type="button" onClick={() => setEditBreak(v)}
                                                className={`px-1.5 py-0.5 rounded border text-[9px] font-bold cursor-pointer transition ${editBreak === v ? 'bg-primary-700 text-white border-primary-700' : 'bg-canvas text-ink-muted border-hairline hover:border-primary-400'}`}>
                                                {v === 0 ? '없음' : v === 30 ? '30분' : '1시간'}
                                              </button>
                                            ))}
                                          </div>
                                          <div className="flex gap-1">
                                            <button className="flex-1 py-0.5 border-none rounded text-[10px] font-bold cursor-pointer bg-primary-700 text-white hover:bg-primary-800 transition" onClick={() => handleEditSave(slot.id)}>저장</button>
                                            <button className="flex-1 py-0.5 border-none rounded text-[10px] font-bold cursor-pointer bg-canvas-soft text-ink-secondary hover:bg-[#ececeb] transition" onClick={() => setEditingSlotId(null)}>취소</button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div key={slot.id} className={`flex items-center gap-0.5 w-full text-white rounded-lg px-1.5 py-1 cursor-grab select-none touch-none transition ${draggedSlotId === slot.id ? 'opacity-30' : ''}`} style={{ backgroundColor: workers.find(w => w.id === slot.worker_id)?.color ?? '#6366f1' }} draggable onDragStart={e => handleDragStart(e, slot.id)} onDragEnd={handleDragEnd} onTouchStart={e => handleTouchStart(e, slot.id)} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}>
                                          <div className="flex flex-col min-w-0 flex-1">
                                            <span className="text-[11px] font-bold leading-tight whitespace-nowrap">{slot.person_name}</span>
                                            {slot.work_time && <span className="text-[9px] opacity-75 leading-none whitespace-nowrap">{slot.work_time}{slot.break_time > 0 && ` -${slot.break_time}m`}</span>}
                                          </div>
                                          <button className="bg-canvas/15 border-none rounded w-[15px] h-[15px] flex items-center justify-center cursor-pointer text-[10px] p-0 hover:bg-canvas/35 transition shrink-0" onClick={e => handleEditStart(e, slot)}>✎</button>
                                          <button className="bg-canvas/15 border-none rounded w-[15px] h-[15px] flex items-center justify-center cursor-pointer text-xs p-0 hover:bg-canvas/35 transition shrink-0" onClick={e => { e.stopPropagation(); handleRemovePerson(slot.id); }}>×</button>
                                        </div>
                                      )
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {selectedEvent && (
          <div className="mt-4">
            <div className="bg-canvas rounded-xl p-4 shadow-level-1 border border-hairline" onClick={() => setColorPickerWorkerId(null)}>
                {/* 이번 이벤트 근무자 — 실제 슬롯이 있는 worker만 표시 */}
                {workers.filter(w => slots.some(s => s.worker_id === w.id)).length > 0 && (
                  <div className="mb-5">
                    <h3 className="m-0 mb-2 text-sm font-extrabold">이번 이벤트 근무자</h3>
                    <div className="flex flex-wrap gap-2">
                      {workers.filter(w => slots.some(s => s.worker_id === w.id)).map(worker => (
                        <div key={worker.id} className="flex items-center gap-2 bg-canvas-soft rounded-lg px-3 py-2 border border-hairline">
                          <div className="relative" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              title="색상 변경"
                              className="w-4 h-4 rounded-full border-2 border-black/15 cursor-pointer hover:scale-110 transition-transform"
                              style={{ backgroundColor: worker.color }}
                              onClick={() => setColorPickerWorkerId(colorPickerWorkerId === worker.id ? null : worker.id)}
                            />
                            {colorPickerWorkerId === worker.id && (
                              <div className="absolute left-0 top-6 z-20 flex gap-1.5 bg-canvas rounded-lg p-2 shadow-level-2 border border-hairline">
                                {WORKER_COLORS.map(c => (
                                  <button
                                    key={c}
                                    type="button"
                                    className="w-5 h-5 rounded-full border-2 cursor-pointer hover:scale-110 transition-transform"
                                    style={{ backgroundColor: c, borderColor: worker.color === c ? '#222' : 'transparent' }}
                                    onClick={() => handleWorkerColorChange(worker, c)}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="text-[13px] font-semibold">{worker.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 직원 풀 */}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <h3 className="m-0 text-sm font-extrabold">직원 풀</h3>
                    <button
                      onClick={() => { setShowTempWorkerForm(p => !p); setTempWorkerName(''); }}
                      className="text-[11px] text-primary-600 font-bold hover:text-primary-800 transition"
                    >
                      {showTempWorkerForm ? '취소' : '+ 임시 근무자'}
                    </button>
                  </div>
                  {showTempWorkerForm && (
                    <form
                      className="flex gap-1.5 mb-3"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const name = tempWorkerName.trim();
                        if (!name || !selectedEvent) return;
                        const COLORS = ['#22c55e', '#6366f1', '#ef4444', '#f97316', '#64748b'];
                        const color = COLORS[workers.length % COLORS.length];
                        const r = await createNewWorker({ event_id: selectedEvent.id, name, color, hourly_rate: 0, user_profile_id: null });
                        if (r.success && r.data) {
                          setWorkers(p => [...p, r.data!]);
                          showMsg(`${name} 추가됨`);
                          setShowTempWorkerForm(false);
                          setTempWorkerName('');
                        } else showMsg(`오류: ${r.error}`);
                      }}
                    >
                      <input
                        autoFocus
                        value={tempWorkerName}
                        onChange={e => setTempWorkerName(e.target.value)}
                        placeholder="이름 입력"
                        className="flex-1 text-sm border border-hairline rounded-lg px-2.5 py-1.5 bg-canvas focus:outline-none focus:border-primary-400"
                      />
                      <button type="submit" className="text-sm bg-primary-600 text-white rounded-lg px-3 py-1.5 font-bold hover:bg-primary-700 transition">추가</button>
                    </form>
                  )}
                  {/* 임시 근무자 (user_profile 없는 workers) */}
                  {workers.filter(w => !w.user_profile_id).length > 0 && (
                    <div className="mb-3">
                      <p className="m-0 text-[10px] text-ink-faint mb-1.5 font-semibold uppercase tracking-wide">임시 근무자</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {workers.filter(w => !w.user_profile_id).map(worker => (
                          <div
                            key={worker.id}
                            className="rounded-lg p-2.5 border border-hairline bg-canvas-soft hover:border-primary-300 hover:shadow-sm transition cursor-grab active:cursor-grabbing select-none"
                            draggable
                            onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; setDraggingWorkerId(worker.id); }}
                            onDragEnd={handleDragEnd}
                            onTouchStart={e => { e.preventDefault(); touchWorkerRef.current = worker.id; setDraggingWorkerId(worker.id); }}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: worker.color }} />
                              <strong className="text-[13px] font-bold truncate flex-1">{worker.name}</strong>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="m-0 text-[11px] text-ink-muted mb-3">카드를 스케줄로 드래그해서 배치하세요</p>
                  {userProfiles.length === 0 ? (
                    <p className="text-ink-faint text-sm m-0">등록된 직원이 없습니다.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {userProfiles.map(profile => {
                        const placed = workers.find(w => w.user_profile_id === profile.id);
                        return (
                          <div
                            key={profile.id}
                            className={`rounded-lg p-2.5 border transition cursor-grab active:cursor-grabbing select-none ${placed ? 'opacity-60 border-hairline bg-canvas-soft' : 'bg-canvas-soft border-hairline hover:border-primary-300 hover:shadow-sm'}`}
                            draggable
                            onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; setDraggingProfileId(profile.id); }}
                            onDragEnd={handleDragEnd}
                            onTouchStart={e => { e.preventDefault(); touchProfileRef.current = profile.id; setDraggingProfileId(profile.id); }}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
                                style={{ backgroundColor: placed?.color ?? '#d1d5db' }}
                              />
                              <strong className="text-[13px] font-bold truncate flex-1">{profile.name}</strong>
                              {placed && <span className="text-[9px] text-primary-700 font-bold shrink-0">배치됨</span>}
                            </div>
                            {profile.phone && <p className="m-0 text-[10px] text-ink-muted">{profile.phone}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
        )}
      </main>
    </>
  );
}
