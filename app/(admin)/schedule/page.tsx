'use client';

import NavBar from '@/components/NavBar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchPopupEvents, createNewPopupEvent, removePopupEvent, editPopupEvent,
  fetchScheduleByEvent, addScheduleEntry, removeScheduleEntry,
  moveScheduleEntry, editScheduleEntry, copyScheduleEntry,
  fetchWorkers, createNewWorker, editWorker, removeWorker, markWorkerPayment,
} from '@/app/actions/schedule';
import type { PopupEvent, ScheduleSlot, Worker } from '@/types/database';
import { toLocalDateStr, parseWorkHours, formatHours } from '@/lib/utils';
import { showMsg } from '@/lib/toast';
import ScheduleSidebar from './_components/ScheduleSidebar';
import SalaryTable, { type SalaryGroup } from './_components/SalaryTable';

const ROLES = ['프론트', '주방', '매니저'] as const;
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;
const LOCAL_RATES_KEY = 'choichoi_local_rates';
const WORKER_COLORS = ['#22c55e', '#6366f1', '#ef4444', '#f97316', '#64748b'];
const WORKER_ROLE_LIST = ['프론트', '주방', '매니저'] as const;
type WorkerRoleType = typeof WORKER_ROLE_LIST[number];

type DragCell = { date: string; role: string };
type DragMode = 'move' | 'copy';
type BottomTab = 'workers' | 'salary';
type WorkerForm = { name: string; color: string; phone: string; bank_name: string; bank_account: string; hourly_rate: string; worker_role: WorkerRoleType };

const EMPTY_WORKER_FORM: WorkerForm = { name: '', color: '#22c55e', phone: '', bank_name: '', bank_account: '', hourly_rate: '', worker_role: '프론트' };

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

  // Workers
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [showWorkerForm, setShowWorkerForm] = useState(false);
  const [editingWorkerId, setEditingWorkerId] = useState<number | null>(null);
  const [workerForm, setWorkerForm] = useState<WorkerForm>(EMPTY_WORKER_FORM);
  const [localRates, setLocalRates] = useState<Record<string, number>>({});

  // Import workers
  const [showImportModal, setShowImportModal] = useState(false);
  const [importEventId, setImportEventId] = useState<number | ''>('');
  const [importCandidates, setImportCandidates] = useState<Worker[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importSelectedIds, setImportSelectedIds] = useState<Set<number>>(new Set());

  // Slots
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [isSlotsLoading, setIsSlotsLoading] = useState(false);

  // UI
  const [bottomTab, setBottomTab] = useState<BottomTab>('workers');
  const [weekOffset, setWeekOffset] = useState(0);
  const [dragMode, setDragMode] = useState<DragMode>('move');

  // Add slot
  const [addingTo, setAddingTo] = useState<DragCell | null>(null);
  const [addWorkerId, setAddWorkerId] = useState<number | ''>('');
  const [addWorkTime, setAddWorkTime] = useState('');
  const [addBreak, setAddBreak] = useState(false);

  // Edit slot
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null);
  const [editWorkerId, setEditWorkerId] = useState<number | ''>('');
  const [editWorkTime, setEditWorkTime] = useState('');
  const [editBreak, setEditBreak] = useState(false);

  // Drag
  const [draggedSlotId, setDraggedSlotId] = useState<number | null>(null);
  const [draggingWorkerId, setDraggingWorkerId] = useState<number | null>(null);
  const [dragOverCell, setDragOverCell] = useState<DragCell | null>(null);
  const touchDragRef = useRef<number | null>(null);

  const loadEvents = async () => {
    setIsEventsLoading(true);
    const r = await fetchPopupEvents();
    if (r.success && r.data) setEvents(r.data);
    setIsEventsLoading(false);
  };

  useEffect(() => {
    loadEvents();
    try { const s = localStorage.getItem(LOCAL_RATES_KEY); if (s) setLocalRates(JSON.parse(s)); } catch { /* ignore */ }
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
    setSelectedEvent(event); setAddingTo(null); setEditingSlotId(null); setWeekOffset(0); setWorkers([]);
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

  // ── Workers ───────────────────────────────────────────────────────────────
  const openWorkerForm = (worker?: Worker) => {
    setEditingWorkerId(worker?.id ?? null);
    setWorkerForm(worker ? { name: worker.name, color: worker.color || '#6366f1', phone: worker.phone ?? '', bank_name: worker.bank_name ?? '', bank_account: worker.bank_account ?? '', hourly_rate: String(worker.hourly_rate || ''), worker_role: (worker.worker_role as WorkerRoleType) ?? '프론트' } : EMPTY_WORKER_FORM);
    setShowWorkerForm(true);
  };

  const handleSaveWorker = async () => {
    if (!workerForm.name.trim()) { showMsg('이름을 입력하세요'); return; }
    if (!selectedEvent) { showMsg('일정을 먼저 선택하세요'); return; }
    const input = { event_id: selectedEvent.id, name: workerForm.name.trim(), color: workerForm.color, phone: workerForm.phone.trim(), bank_name: workerForm.bank_name.trim(), bank_account: workerForm.bank_account.trim(), hourly_rate: parseInt(workerForm.hourly_rate) || 0, worker_role: workerForm.worker_role };
    if (editingWorkerId) {
      const r = await editWorker(editingWorkerId, input);
      if (r.success && r.data) { setWorkers(p => p.map(w => w.id === editingWorkerId ? r.data! : w)); showMsg('수정되었습니다'); }
      else showMsg(`오류: ${r.error}`);
    } else {
      const r = await createNewWorker(input);
      if (r.success && r.data) { setWorkers(p => [...p, r.data!].sort((a, b) => a.name.localeCompare(b.name))); showMsg('근무자가 등록되었습니다'); }
      else showMsg(`오류: ${r.error}`);
    }
    setShowWorkerForm(false); setWorkerForm(EMPTY_WORKER_FORM);
  };

  const handleDeleteWorker = async (id: number, name: string) => {
    if (!confirm(`"${name}" 근무자를 삭제하시겠습니까?`)) return;
    const r = await removeWorker(id);
    if (r.success) setWorkers(p => p.filter(w => w.id !== id));
    else showMsg(`오류: ${r.error}`);
  };

  const handleImportSource = async (eventId: number) => {
    setImportEventId(eventId);
    setImportLoading(true);
    setImportSelectedIds(new Set());
    const r = await fetchWorkers(eventId);
    if (r.success && r.data) setImportCandidates(r.data);
    setImportLoading(false);
  };

  const handleImportWorkers = async () => {
    if (!selectedEvent) return;
    const toImport = importCandidates.filter(w => importSelectedIds.has(w.id));
    if (toImport.length === 0) { showMsg('불러올 근무자를 선택하세요'); return; }
    let count = 0;
    for (const w of toImport) {
      const r = await createNewWorker({ event_id: selectedEvent.id, name: w.name, color: w.color, phone: w.phone ?? '', bank_name: w.bank_name ?? '', bank_account: w.bank_account ?? '', hourly_rate: w.hourly_rate, worker_role: w.worker_role ?? '프론트' });
      if (r.success && r.data) { setWorkers(p => [...p, r.data!].sort((a, b) => a.name.localeCompare(b.name))); count++; }
    }
    showMsg(`${count}명의 근무자를 불러왔습니다`);
    setShowImportModal(false); setImportEventId(''); setImportCandidates([]); setImportSelectedIds(new Set());
  };

  // ── Slots ─────────────────────────────────────────────────────────────────
  const getSlotsForCell = (dateStr: string, role: string) =>
    slots.filter(s => s.schedule_date === dateStr && s.role === role);

  const handleAddPerson = async (dateStr: string, role: string) => {
    if (!selectedEvent) return;
    if (addWorkerId === '') { showMsg('근무자를 선택하세요'); return; }
    const wid = addWorkerId as number;
    const name = workers.find(w => w.id === wid)?.name ?? '';
    if (!name) { showMsg('근무자 정보를 찾을 수 없습니다'); return; }
    const r = await addScheduleEntry(selectedEvent.id, dateStr, role, name, addWorkTime.trim(), wid, addBreak);
    if (r.success && r.data) { setSlots(p => [...p, r.data!]); showMsg('인원이 추가되었습니다'); }
    else showMsg(`오류: ${r.error}`);
    setAddingTo(null); setAddWorkerId(''); setAddWorkTime(''); setAddBreak(false);
  };

  const handleRemovePerson = async (id: number) => {
    if (!confirm('삭제하시겠습니까?')) return;
    const r = await removeScheduleEntry(id);
    if (r.success) setSlots(p => p.filter(s => s.id !== id));
    else showMsg(`오류: ${r.error}`);
  };

  const handleEditStart = (e: React.MouseEvent, slot: ScheduleSlot) => {
    e.stopPropagation();
    setEditingSlotId(slot.id); setEditWorkerId(slot.worker_id ?? ''); setEditWorkTime(slot.work_time ?? ''); setEditBreak(slot.break_time ?? false); setAddingTo(null);
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

  const handleRateChange = async (worker: Worker | null, name: string, rate: number) => {
    if (worker) {
      const r = await editWorker(worker.id, { event_id: worker.event_id, name: worker.name, color: worker.color, phone: worker.phone ?? '', bank_name: worker.bank_name ?? '', bank_account: worker.bank_account ?? '', hourly_rate: rate, worker_role: worker.worker_role ?? '프론트' });
      if (r.success && r.data) setWorkers(p => p.map(w => w.id === worker.id ? r.data! : w));
    } else {
      setLocalRates(p => { const n = { ...p, [name]: rate }; localStorage.setItem(LOCAL_RATES_KEY, JSON.stringify(n)); return n; });
    }
  };

  const handlePaymentToggle = async (worker: Worker) => {
    const r = await markWorkerPayment(worker.id, !worker.payment_done);
    if (r.success && r.data) setWorkers(p => p.map(w => w.id === worker.id ? r.data! : w));
    else showMsg(`오류: ${r.error}`);
  };

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: number) => {
    if (editingSlotId === id) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = dragMode === 'copy' ? 'copy' : 'move'; setDraggedSlotId(id);
  };
  const handleDragEnd = () => { setDraggedSlotId(null); setDraggingWorkerId(null); setDragOverCell(null); };
  const handleDragOver = (e: React.DragEvent<HTMLTableCellElement>, dateStr: string, role: string) => { e.preventDefault(); setDragOverCell({ date: dateStr, role }); };
  const handleDragLeave = () => setDragOverCell(null);
  const handleDrop = async (e: React.DragEvent<HTMLTableCellElement>, dateStr: string, role: string) => {
    e.preventDefault();
    if (draggingWorkerId !== null) {
      const worker = workers.find(w => w.id === draggingWorkerId);
      if (worker && selectedEvent) {
        const r = await addScheduleEntry(selectedEvent.id, dateStr, role, worker.name, '', worker.id, false);
        if (r.success && r.data) { setSlots(p => [...p, r.data!]); showMsg('인원이 추가되었습니다'); }
        else showMsg(`오류: ${r.error}`);
      }
      setDraggingWorkerId(null); setDragOverCell(null);
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
    if (!touchDragRef.current) return;
    const t = e.touches[0]; const el = document.elementFromPoint(t.clientX, t.clientY)?.closest('[data-cell]');
    if (el) setDragOverCell({ date: el.getAttribute('data-date')!, role: el.getAttribute('data-role')! });
  };
  const handleTouchEnd = async () => {
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

  const salaryGroups = useMemo((): SalaryGroup[] => {
    if (!slots.length) return [];
    const map = new Map<string, SalaryGroup>();
    for (const slot of [...slots].sort((a, b) => a.schedule_date.localeCompare(b.schedule_date))) {
      const worker = slot.worker_id ? (workers.find(w => w.id === slot.worker_id) ?? null) : null;
      const key = slot.worker_id ? `w:${slot.worker_id}` : `n:${slot.person_name}`;
      if (!map.has(key)) map.set(key, { key, worker, name: worker?.name ?? slot.person_name, entries: [] });
      map.get(key)!.entries.push({ date: slot.schedule_date, role: slot.role, workTime: slot.work_time, breakTime: slot.break_time, hours: parseWorkHours(slot.work_time, slot.break_time) });
    }
    return Array.from(map.values()).sort((a, b) => {
      const calcPay = (g: SalaryGroup) => {
        const h = g.entries.reduce((s, e) => s + e.hours, 0);
        const rate = g.worker ? g.worker.hourly_rate : (localRates[g.name] ?? 0);
        return h * rate;
      };
      return calcPay(b) - calcPay(a);
    });
  }, [slots, workers, localRates]);

  const grandTotal = useMemo(() => salaryGroups.reduce((acc, g) => {
    const h = g.entries.reduce((s, e) => s + e.hours, 0);
    const rate = g.worker ? g.worker.hourly_rate : (localRates[g.name] ?? 0);
    return { hours: acc.hours + h, pay: acc.pay + h * rate };
  }, { hours: 0, pay: 0 }), [salaryGroups, localRates]);

  const startWeekday = newEvent.startDate ? DAY_NAMES[new Date(newEvent.startDate + 'T00:00:00').getDay()] : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1400px] mx-auto">
        <div className="flex flex-col md:flex-row gap-4 items-start">
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
                              const isAdding = addingTo?.date === dateStr && addingTo?.role === role;
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
                                          <label className="flex items-center gap-1 text-[10px] cursor-pointer select-none">
                                            <input type="checkbox" checked={editBreak} onChange={e => setEditBreak(e.target.checked)} className="w-3 h-3 cursor-pointer" />
                                            쉬는시간 1시간 차감
                                          </label>
                                          <div className="flex gap-1">
                                            <button className="flex-1 py-0.5 border-none rounded text-[10px] font-bold cursor-pointer bg-primary-700 text-white hover:bg-primary-800 transition" onClick={() => handleEditSave(slot.id)}>저장</button>
                                            <button className="flex-1 py-0.5 border-none rounded text-[10px] font-bold cursor-pointer bg-canvas-soft text-ink-secondary hover:bg-[#ececeb] transition" onClick={() => setEditingSlotId(null)}>취소</button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div key={slot.id} className={`flex items-center gap-0.5 w-full text-white rounded-lg px-1.5 py-1 cursor-grab select-none touch-none transition ${draggedSlotId === slot.id ? 'opacity-30' : ''}`} style={{ backgroundColor: workers.find(w => w.id === slot.worker_id)?.color ?? '#6366f1' }} draggable onDragStart={e => handleDragStart(e, slot.id)} onDragEnd={handleDragEnd} onTouchStart={e => handleTouchStart(e, slot.id)} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}>
                                          <div className="flex flex-col min-w-0 flex-1">
                                            <span className="text-[11px] font-bold leading-tight whitespace-nowrap">{slot.person_name}</span>
                                            {slot.work_time && <span className="text-[9px] opacity-75 leading-none whitespace-nowrap">{slot.work_time}{slot.break_time && ' -1h'}</span>}
                                          </div>
                                          <button className="bg-canvas/15 border-none rounded w-[15px] h-[15px] flex items-center justify-center cursor-pointer text-[10px] p-0 hover:bg-canvas/35 transition shrink-0" onClick={e => handleEditStart(e, slot)}>✎</button>
                                          <button className="bg-canvas/15 border-none rounded w-[15px] h-[15px] flex items-center justify-center cursor-pointer text-xs p-0 hover:bg-canvas/35 transition shrink-0" onClick={e => { e.stopPropagation(); handleRemovePerson(slot.id); }}>×</button>
                                        </div>
                                      )
                                    )}
                                    {isAdding ? (
                                      <div className="flex flex-col gap-1 w-full">
                                        {workers.length === 0 ? (
                                          <p className="text-[10px] text-ink-faint m-0 text-center py-1">근무자를 먼저 등록하세요</p>
                                        ) : (
                                          <select value={addWorkerId} onChange={e => setAddWorkerId(e.target.value ? Number(e.target.value) : '')} autoFocus className="w-full px-1 py-1 border border-hairline rounded text-[10px] focus:outline-none focus:border-primary-700">
                                            <option value="">근무자 선택</option>
                                            {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                          </select>
                                        )}
                                        {workers.length > 0 && (
                                          <>
                                            <input type="text" placeholder="09-18" value={addWorkTime} onChange={e => setAddWorkTime(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddPerson(dateStr, role); if (e.key === 'Escape') setAddingTo(null); }} className="w-full px-1 py-1 border border-hairline rounded text-[10px] focus:outline-none focus:border-primary-700" />
                                            <label className="flex items-center gap-1 text-[10px] cursor-pointer select-none">
                                              <input type="checkbox" checked={addBreak} onChange={e => setAddBreak(e.target.checked)} className="w-3 h-3 cursor-pointer" />
                                              쉬는시간 1시간 차감
                                            </label>
                                          </>
                                        )}
                                        <div className="flex gap-1">
                                          {workers.length > 0 && <button className="flex-1 py-0.5 border-none rounded text-[10px] font-semibold cursor-pointer bg-primary-700 text-white hover:bg-primary-800 transition" onClick={() => handleAddPerson(dateStr, role)}>추가</button>}
                                          <button className="flex-1 py-0.5 border-none rounded text-[10px] font-semibold cursor-pointer bg-canvas-soft text-ink-secondary hover:bg-[#ececeb] transition" onClick={() => setAddingTo(null)}>취소</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button className="flex items-center justify-center w-5 h-5 rounded border-[1.5px] border-dashed border-[#ccc] bg-transparent text-ink-faint text-sm cursor-pointer hover:border-primary-700 hover:text-primary-700 hover:bg-primary-50 transition leading-none p-0" onClick={() => { setAddingTo({ date: dateStr, role }); setAddWorkerId(''); setAddWorkTime(''); }}>+</button>
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
            <div className="flex rounded-xl overflow-hidden border border-hairline mb-2 w-fit bg-canvas shadow-level-1 border border-hairline">
              {(['workers', 'salary'] as const).map(tab => (
                <button key={tab} className={`px-4 py-2 text-[11px] font-bold border-none cursor-pointer transition ${bottomTab === tab ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'}`} onClick={() => setBottomTab(tab)}>
                  {tab === 'workers' ? '근무자 관리' : '급여 계산'}
                </button>
              ))}
            </div>

            {bottomTab === 'workers' && (
              <div className="bg-canvas rounded-xl p-4 shadow-level-1 border border-hairline">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="m-0 text-base font-extrabold">{selectedEvent.name} 근무자</h3>
                  <div className="flex gap-1.5">
                    <button className="px-2.5 py-1 border border-hairline rounded-lg text-[11px] font-bold cursor-pointer transition bg-canvas text-ink-secondary hover:bg-canvas-soft" onClick={() => { setShowImportModal(true); setImportEventId(''); setImportCandidates([]); setImportSelectedIds(new Set()); }}>
                      ↓ 불러오기
                    </button>
                    <button className={`px-2.5 py-1 border-none rounded-lg text-[11px] font-bold cursor-pointer transition ${showWorkerForm ? 'bg-canvas-soft text-ink-muted' : 'bg-primary-700 text-white hover:bg-primary-800'}`} onClick={() => showWorkerForm ? setShowWorkerForm(false) : openWorkerForm()}>
                      {showWorkerForm ? '취소' : '+ 추가'}
                    </button>
                  </div>
                </div>
                {showWorkerForm && (
                  <div className="bg-canvas-soft rounded-lg p-3 mb-3 flex flex-wrap gap-2 items-end">
                    <div className="flex rounded-lg overflow-hidden border border-hairline shrink-0">
                      {WORKER_ROLE_LIST.map(r => (
                        <button key={r} type="button" onClick={() => setWorkerForm(p => ({ ...p, worker_role: r }))} className={`px-3 py-1.5 text-xs font-bold border-none cursor-pointer transition ${workerForm.worker_role === r ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'}`}>{r}</button>
                      ))}
                    </div>
                    <input type="text" placeholder="이름 *" value={workerForm.name} onChange={e => setWorkerForm(p => ({ ...p, name: e.target.value }))} className="px-2 py-1.5 border border-hairline rounded text-xs focus:outline-none focus:border-primary-700 min-w-[120px]" />
                    <div className="flex items-center gap-1.5 py-1">
                      {WORKER_COLORS.map(c => (
                        <button key={c} type="button" onClick={() => setWorkerForm(p => ({ ...p, color: c }))} className="w-5 h-5 rounded-full border-2 transition" style={{ backgroundColor: c, borderColor: workerForm.color === c ? '#222' : 'transparent' }} />
                      ))}
                    </div>
                    <input type="tel" placeholder="전화번호" value={workerForm.phone} onChange={e => setWorkerForm(p => ({ ...p, phone: e.target.value }))} className="px-2 py-1.5 border border-hairline rounded text-xs focus:outline-none focus:border-primary-700 min-w-[130px]" />
                    <input type="text" placeholder="은행 종류 (예: 카카오뱅크)" value={workerForm.bank_name} onChange={e => setWorkerForm(p => ({ ...p, bank_name: e.target.value }))} className="px-2 py-1.5 border border-hairline rounded text-xs focus:outline-none focus:border-primary-700 min-w-[150px]" />
                    <input type="text" placeholder="계좌번호" value={workerForm.bank_account} onChange={e => setWorkerForm(p => ({ ...p, bank_account: e.target.value }))} className="px-2 py-1.5 border border-hairline rounded text-xs focus:outline-none focus:border-primary-700 min-w-[150px]" />
                    <input type="number" placeholder="시급 (원)" value={workerForm.hourly_rate} onChange={e => setWorkerForm(p => ({ ...p, hourly_rate: e.target.value }))} className="px-2 py-1.5 border border-hairline rounded text-xs focus:outline-none focus:border-primary-700 min-w-[100px]" />
                    <button className="px-3 py-1.5 border-none rounded bg-primary-700 text-white text-xs font-bold cursor-pointer hover:bg-primary-800 transition" onClick={handleSaveWorker}>{editingWorkerId ? '수정 완료' : '등록'}</button>
                  </div>
                )}
                {workers.length === 0 ? (
                  <p className="text-ink-faint text-sm m-0">등록된 근무자가 없습니다.</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {WORKER_ROLE_LIST.map(roleGroup => {
                      const grouped = workers.filter(w => (w.worker_role ?? '프론트') === roleGroup);
                      if (grouped.length === 0) return null;
                      return (
                        <div key={roleGroup}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-extrabold text-ink-secondary">{roleGroup}</span>
                            <span className="text-[10px] text-ink-faint">{grouped.length}명</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {grouped.map(w => (
                              <div key={w.id} className={`bg-canvas-soft rounded-lg p-2.5 border transition cursor-grab active:cursor-grabbing select-none ${draggingWorkerId === w.id ? 'opacity-40 border-primary-400' : 'border-hairline hover:border-primary-300 hover:shadow-sm'}`} draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; setDraggingWorkerId(w.id); }} onDragEnd={handleDragEnd}>
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: w.color || '#6366f1' }} />
                                    <strong className="text-[13px] font-bold">{w.name}</strong>
                                  </div>
                                  <div className="flex gap-1">
                                    <button className="bg-canvas border border-hairline rounded px-1.5 py-0.5 text-[10px] cursor-pointer hover:bg-canvas-soft transition" onClick={() => openWorkerForm(w)}>✎</button>
                                    <button className="bg-canvas border border-hairline rounded px-1.5 py-0.5 text-[10px] cursor-pointer hover:text-red-500 hover:border-red-300 transition" onClick={() => handleDeleteWorker(w.id, w.name)}>×</button>
                                  </div>
                                </div>
                                {w.phone && <p className="m-0 text-[10px] text-ink-muted">{w.phone}</p>}
                                {w.hourly_rate > 0 && <p className="m-0 text-[10px] font-semibold text-primary-700">{w.hourly_rate.toLocaleString('ko-KR')}원/h</p>}
                                {(w.bank_name || w.bank_account) && <p className="m-0 text-[10px] text-ink-muted truncate">{[w.bank_name, w.bank_account].filter(Boolean).join(' ')}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {bottomTab === 'salary' && salaryGroups.length > 0 && (
              <SalaryTable
                eventName={selectedEvent.name}
                salaryGroups={salaryGroups}
                grandTotal={grandTotal}
                localRates={localRates}
                onRateChange={handleRateChange}
                onPaymentToggle={handlePaymentToggle}
              />
            )}
            {bottomTab === 'salary' && salaryGroups.length === 0 && (
              <div className="bg-canvas rounded-xl p-4 shadow-level-1 border border-hairline">
                <p className="text-ink-faint text-sm m-0">근무 데이터가 없습니다.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowImportModal(false)}>
          <div className="bg-canvas rounded-xl shadow-xl border border-hairline w-[360px] max-w-[92vw] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
              <h3 className="m-0 text-sm font-extrabold">과거 근무자 불러오기</h3>
              <button className="bg-transparent border-none text-ink-faint text-lg cursor-pointer leading-none hover:text-ink transition" onClick={() => setShowImportModal(false)}>×</button>
            </div>
            <div className="p-4 flex flex-col gap-3 overflow-y-auto">
              <div>
                <label className="text-[11px] font-semibold text-ink-muted block mb-1">일정 선택</label>
                <select
                  value={importEventId}
                  onChange={e => e.target.value ? handleImportSource(Number(e.target.value)) : (setImportEventId(''), setImportCandidates([]))}
                  className="w-full px-2 py-1.5 border border-hairline rounded text-xs focus:outline-none focus:border-primary-700"
                >
                  <option value="">일정을 선택하세요</option>
                  {events.filter(ev => ev.id !== selectedEvent?.id).map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.name} ({ev.start_date})</option>
                  ))}
                </select>
              </div>

              {importLoading && <p className="text-xs text-ink-faint text-center py-2">불러오는 중...</p>}

              {!importLoading && importEventId !== '' && importCandidates.length === 0 && (
                <p className="text-xs text-ink-faint text-center py-2">해당 일정에 근무자가 없습니다.</p>
              )}

              {!importLoading && importCandidates.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-ink-muted">근무자 선택</label>
                    <button
                      className="text-[10px] text-primary-700 font-semibold cursor-pointer bg-transparent border-none hover:underline"
                      onClick={() => setImportSelectedIds(importSelectedIds.size === importCandidates.length ? new Set() : new Set(importCandidates.map(w => w.id)))}
                    >
                      {importSelectedIds.size === importCandidates.length ? '전체 해제' : '전체 선택'}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {importCandidates.map(w => (
                      <label key={w.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-hairline cursor-pointer hover:bg-canvas-soft transition select-none">
                        <input
                          type="checkbox"
                          checked={importSelectedIds.has(w.id)}
                          onChange={() => setImportSelectedIds(prev => { const s = new Set(prev); s.has(w.id) ? s.delete(w.id) : s.add(w.id); return s; })}
                          className="w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: w.color || '#6366f1' }} />
                        <span className="text-xs font-semibold flex-1">{w.name}</span>
                        <span className="text-[10px] text-ink-faint">{w.worker_role ?? '프론트'}</span>
                        {w.hourly_rate > 0 && <span className="text-[10px] text-primary-700 font-semibold">{w.hourly_rate.toLocaleString('ko-KR')}원/h</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-hairline">
              <button className="flex-1 py-1.5 rounded-lg border border-hairline bg-canvas text-xs font-bold cursor-pointer hover:bg-canvas-soft transition" onClick={() => setShowImportModal(false)}>취소</button>
              <button
                className="flex-1 py-1.5 rounded-lg border-none bg-primary-700 text-white text-xs font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleImportWorkers}
                disabled={importSelectedIds.size === 0}
              >
                {importSelectedIds.size > 0 ? `${importSelectedIds.size}명 불러오기` : '불러오기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
