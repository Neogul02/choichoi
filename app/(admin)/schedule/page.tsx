'use client';

import NavBar from '@/components/NavBar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchPopupEvents, createNewPopupEvent, removePopupEvent,
  fetchScheduleByEvent, addScheduleEntry, removeScheduleEntry,
  moveScheduleEntry, editScheduleEntry, copyScheduleEntry,
  fetchWorkers, createNewWorker, editWorker, removeWorker,
} from '@/app/actions';
import type { PopupEvent, ScheduleSlot, Worker } from '@/types/database';
import { toLocalDateStr } from '@/lib/utils';

const ROLES = ['프론트', '제조', '기타'] as const;
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;
const LOCAL_RATES_KEY = 'choichoi_local_rates';

type DragCell = { date: string; role: string };
type DragMode = 'move' | 'copy';
type LeftTab = 'events' | 'workers';
type WorkerForm = { name: string; phone: string; bank_name: string; bank_account: string; hourly_rate: string };

const EMPTY_WORKER_FORM: WorkerForm = { name: '', phone: '', bank_name: '', bank_account: '', hourly_rate: '' };

function getEventDates(startDate: string, endDate: string): Date[] {
  const dates: Date[] = [];
  const cur = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (cur <= end) { dates.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  return dates;
}

function parseWorkHours(workTime: string | null, breakTime = false): number {
  if (!workTime) return 0;
  const m = workTime.match(/(\d{1,2})(?::(\d{2}))?[-~](\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const raw = Math.max(0, (parseInt(m[3]) * 60 + parseInt(m[4] ?? '0') - parseInt(m[1]) * 60 - parseInt(m[2] ?? '0')) / 60);
  return breakTime ? Math.max(0, raw - 1) : raw;
}

function formatHours(h: number) { return h === 0 ? '-' : Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`; }

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

  // Slots
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [isSlotsLoading, setIsSlotsLoading] = useState(false);

  // UI
  const [leftTab, setLeftTab] = useState<LeftTab>('events');
  const [weekOffset, setWeekOffset] = useState(0);
  const [dragMode, setDragMode] = useState<DragMode>('move');
  const [message, setMessage] = useState('');

  // Add slot
  const [addingTo, setAddingTo] = useState<DragCell | null>(null);
  const [addWorkerId, setAddWorkerId] = useState<number | ''>('');
  const [addManualName, setAddManualName] = useState('');
  const [addWorkTime, setAddWorkTime] = useState('');
  const [addBreak, setAddBreak] = useState(false);

  // Edit slot
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null);
  const [editWorkerId, setEditWorkerId] = useState<number | ''>('');
  const [editManualName, setEditManualName] = useState('');
  const [editWorkTime, setEditWorkTime] = useState('');
  const [editBreak, setEditBreak] = useState(false);

  // Drag
  const [draggedSlotId, setDraggedSlotId] = useState<number | null>(null);
  const [dragOverCell, setDragOverCell] = useState<DragCell | null>(null);
  const touchDragRef = useRef<number | null>(null);

  useEffect(() => {
    loadEvents();
    try { const s = localStorage.getItem(LOCAL_RATES_KEY); if (s) setLocalRates(JSON.parse(s)); } catch { /* ignore */ }
  }, []);

  const showMsg = (msg: string) => { setMessage(msg); setTimeout(() => setMessage(''), 2500); };

  const loadEvents = async () => {
    setIsEventsLoading(true);
    const r = await fetchPopupEvents();
    if (r.success && r.data) setEvents(r.data);
    setIsEventsLoading(false);
  };

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
    loadSlots(event.id); loadWorkers(event.id);
  };

  const handleCreateEvent = async () => {
    if (!newEvent.name.trim() || !newEvent.startDate || !newEvent.endDate) { showMsg('모든 항목을 입력하세요'); return; }
    if (newEvent.startDate > newEvent.endDate) { showMsg('종료일이 시작일보다 앞입니다'); return; }
    const r = await createNewPopupEvent(newEvent.name.trim(), newEvent.startDate, newEvent.endDate);
    if (r.success && r.data) { setEvents(p => [r.data!, ...p]); setShowAddEvent(false); setNewEvent({ name: '', startDate: '', endDate: '' }); handleSelectEvent(r.data); showMsg('일정이 생성되었습니다'); }
    else showMsg(`오류: ${r.error}`);
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
    setWorkerForm(worker ? { name: worker.name, phone: worker.phone ?? '', bank_name: worker.bank_name ?? '', bank_account: worker.bank_account ?? '', hourly_rate: String(worker.hourly_rate || '') } : EMPTY_WORKER_FORM);
    setShowWorkerForm(true);
  };

  const handleSaveWorker = async () => {
    if (!workerForm.name.trim()) { showMsg('이름을 입력하세요'); return; }
    if (!selectedEvent) { showMsg('일정을 먼저 선택하세요'); return; }
    const input = { event_id: selectedEvent.id, name: workerForm.name.trim(), phone: workerForm.phone.trim(), bank_name: workerForm.bank_name.trim(), bank_account: workerForm.bank_account.trim(), hourly_rate: parseInt(workerForm.hourly_rate) || 0 };
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

  // ── Slots ─────────────────────────────────────────────────────────────────
  const getSlotsForCell = (dateStr: string, role: string) =>
    slots.filter(s => s.schedule_date === dateStr && s.role === role);

  const handleAddPerson = async (dateStr: string, role: string) => {
    if (!selectedEvent) return;
    if (addWorkerId === '') { showMsg('근무자를 선택하세요'); return; }
    const wid = addWorkerId as number;
    const name = workers.find(w => w.id === wid)?.name ?? '';
    if (!name) return;
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
    setEditingSlotId(slot.id); setEditWorkerId(slot.worker_id ?? ''); setEditManualName(slot.person_name); setEditWorkTime(slot.work_time ?? ''); setEditBreak(slot.break_time ?? false); setAddingTo(null);
  };

  const handleEditSave = async (id: number) => {
    if (editWorkerId === '') { showMsg('근무자를 선택하세요'); return; }
    const wid = editWorkerId as number;
    const name = workers.find(w => w.id === wid)?.name ?? '';
    if (!name) return;
    const r = await editScheduleEntry(id, name, editWorkTime.trim(), wid, editBreak);
    if (r.success && r.data) { setSlots(p => p.map(s => s.id === id ? r.data! : s)); showMsg('수정되었습니다'); }
    else showMsg(`오류: ${r.error}`);
    setEditingSlotId(null);
  };

  const handleRateChange = async (worker: Worker | null, name: string, rate: number) => {
    if (worker) {
      const r = await editWorker(worker.id, { event_id: worker.event_id, name: worker.name, phone: worker.phone ?? '', bank_name: worker.bank_name ?? '', bank_account: worker.bank_account ?? '', hourly_rate: rate });
      if (r.success && r.data) setWorkers(p => p.map(w => w.id === worker.id ? r.data! : w));
    } else {
      setLocalRates(p => { const n = { ...p, [name]: rate }; localStorage.setItem(LOCAL_RATES_KEY, JSON.stringify(n)); return n; });
    }
  };

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: number) => {
    if (editingSlotId === id) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = dragMode === 'copy' ? 'copy' : 'move'; setDraggedSlotId(id);
  };
  const handleDragEnd = () => { setDraggedSlotId(null); setDragOverCell(null); };
  const handleDragOver = (e: React.DragEvent<HTMLTableCellElement>, dateStr: string, role: string) => { e.preventDefault(); setDragOverCell({ date: dateStr, role }); };
  const handleDragLeave = () => setDragOverCell(null);
  const handleDrop = async (e: React.DragEvent<HTMLTableCellElement>, dateStr: string, role: string) => {
    e.preventDefault();
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

  type SalaryGroup = { key: string; worker: Worker | null; name: string; entries: { date: string; role: string; workTime: string | null; breakTime: boolean; hours: number }[] };
  const salaryGroups = useMemo((): SalaryGroup[] => {
    if (!slots.length) return [];
    const map = new Map<string, SalaryGroup>();
    for (const slot of [...slots].sort((a, b) => a.schedule_date.localeCompare(b.schedule_date))) {
      const worker = slot.worker_id ? (workers.find(w => w.id === slot.worker_id) ?? null) : null;
      const key = slot.worker_id ? `w:${slot.worker_id}` : `n:${slot.person_name}`;
      if (!map.has(key)) map.set(key, { key, worker, name: worker?.name ?? slot.person_name, entries: [] });
      map.get(key)!.entries.push({ date: slot.schedule_date, role: slot.role, workTime: slot.work_time, breakTime: slot.break_time, hours: parseWorkHours(slot.work_time, slot.break_time) });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [slots, workers]);

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
        {message && (
          <div className={`p-3 mb-4 rounded-lg text-center font-semibold text-sm ${message.includes('오류') ? 'bg-[#f8d7da] text-[#721c24] border border-[#f5c6cb]' : 'bg-[#d4edda] text-[#155724] border border-[#c3e6cb]'}`}>
            {message}
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-4 items-start">
          {/* ── 왼쪽 패널 ── */}
          <div className="w-full md:w-[210px] shrink-0">
            <div className="flex rounded-xl overflow-hidden border border-[#eee] mb-2 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              {(['events', 'workers'] as const).map(tab => (
                <button key={tab} className={`flex-1 py-2 text-[11px] font-bold border-none cursor-pointer transition ${leftTab === tab ? 'bg-primary-700 text-white' : 'bg-white text-[#555] hover:bg-[#f5f5f5]'}`} onClick={() => setLeftTab(tab)}>
                  {tab === 'events' ? '일정 목록' : '근무자 관리'}
                </button>
              ))}
            </div>

            {/* 일정 목록 */}
            {leftTab === 'events' && (
              <div className="bg-white rounded-2xl p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                <div className="flex justify-between items-center mb-2.5">
                  <h2 className="m-0 text-sm font-extrabold">일정 목록</h2>
                  <button className={`px-2.5 py-1 border-none rounded-lg text-[11px] font-bold cursor-pointer transition ${showAddEvent ? 'bg-[#eee] text-[#555]' : 'bg-primary-700 text-white hover:bg-primary-800'}`} onClick={() => setShowAddEvent(v => !v)}>
                    {showAddEvent ? '취소' : '+ 추가'}
                  </button>
                </div>
                {showAddEvent && (
                  <div className="bg-[#f9f9f9] rounded-lg p-2.5 mb-2.5 flex flex-col gap-1.5">
                    <input type="text" placeholder="일정 이름" value={newEvent.name} onChange={e => setNewEvent(p => ({ ...p, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleCreateEvent()} className="w-full px-2 py-1.5 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] font-semibold text-[#666]">시작일 {startWeekday && <span className="text-primary-700">{startWeekday}요일</span>}</label>
                      <input type="date" value={newEvent.startDate} onChange={e => setNewEvent(p => ({ ...p, startDate: e.target.value }))} className="w-full px-2 py-1 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] font-semibold text-[#666]">종료일</label>
                      <input type="date" value={newEvent.endDate} onChange={e => setNewEvent(p => ({ ...p, endDate: e.target.value }))} className="w-full px-2 py-1 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
                    </div>
                    <button className="w-full p-1.5 border-none rounded bg-primary-700 text-white text-xs font-bold cursor-pointer hover:bg-primary-800 transition" onClick={handleCreateEvent}>일정 생성</button>
                  </div>
                )}
                {isEventsLoading ? <p className="text-[#999] text-xs m-0">불러오는 중...</p> : events.length === 0 ? <p className="text-[#999] text-xs m-0">일정이 없습니다.</p> : (
                  <ul className="list-none m-0 p-0 flex flex-col gap-1">
                    {events.map(event => (
                      <li key={event.id} className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border-[1.5px] cursor-pointer transition ${selectedEvent?.id === event.id ? 'border-primary-700 bg-primary-50' : 'border-[#eee] hover:border-primary-700 hover:bg-primary-50'}`} onClick={() => handleSelectEvent(event)}>
                        <div className="flex-1 min-w-0">
                          <strong className="block text-[12px] font-bold text-[#222] truncate">{event.name}</strong>
                          <span className="text-[10px] text-[#888]">{event.start_date} ~ {event.end_date}</span>
                        </div>
                        <button className="bg-transparent border-none text-[#ccc] text-base cursor-pointer leading-none hover:text-red-500 transition" onClick={e => handleDeleteEvent(e, event)}>×</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* 근무자 관리 */}
            {leftTab === 'workers' && (
              <div className="bg-white rounded-2xl p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                {!selectedEvent ? (
                  <p className="text-[#999] text-xs m-0 text-center py-2">일정을 먼저 선택하세요</p>
                ) : (<>
                <div className="flex justify-between items-center mb-2.5">
                  <h2 className="m-0 text-sm font-extrabold">{selectedEvent.name} 근무자</h2>
                  <button className={`px-2.5 py-1 border-none rounded-lg text-[11px] font-bold cursor-pointer transition ${showWorkerForm ? 'bg-[#eee] text-[#555]' : 'bg-primary-700 text-white hover:bg-primary-800'}`} onClick={() => showWorkerForm ? setShowWorkerForm(false) : openWorkerForm()}>
                    {showWorkerForm ? '취소' : '+ 추가'}
                  </button>
                </div>
                {showWorkerForm && (
                  <div className="bg-[#f9f9f9] rounded-lg p-2.5 mb-2.5 flex flex-col gap-1.5">
                    <input type="text" placeholder="이름 *" value={workerForm.name} onChange={e => setWorkerForm(p => ({ ...p, name: e.target.value }))} className="w-full px-2 py-1.5 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
                    <input type="tel" placeholder="전화번호" value={workerForm.phone} onChange={e => setWorkerForm(p => ({ ...p, phone: e.target.value }))} className="w-full px-2 py-1.5 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
                    <input type="text" placeholder="은행 종류 (예: 카카오뱅크)" value={workerForm.bank_name} onChange={e => setWorkerForm(p => ({ ...p, bank_name: e.target.value }))} className="w-full px-2 py-1.5 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
                    <input type="text" placeholder="계좌번호" value={workerForm.bank_account} onChange={e => setWorkerForm(p => ({ ...p, bank_account: e.target.value }))} className="w-full px-2 py-1.5 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
                    <input type="number" placeholder="시급 (원)" value={workerForm.hourly_rate} onChange={e => setWorkerForm(p => ({ ...p, hourly_rate: e.target.value }))} className="w-full px-2 py-1.5 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
                    <button className="w-full p-1.5 border-none rounded bg-primary-700 text-white text-xs font-bold cursor-pointer hover:bg-primary-800 transition" onClick={handleSaveWorker}>{editingWorkerId ? '수정 완료' : '등록'}</button>
                  </div>
                )}
                {workers.length === 0 ? <p className="text-[#999] text-xs m-0">등록된 근무자가 없습니다.</p> : (
                  <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
                    {workers.map(w => (
                      <li key={w.id} className="bg-[#f9f9f9] rounded-lg p-2 border border-[#eee]">
                        <div className="flex items-center justify-between mb-0.5">
                          <strong className="text-[12px] font-bold">{w.name}</strong>
                          <div className="flex gap-1">
                            <button className="bg-white border border-[#ddd] rounded px-1.5 py-0.5 text-[10px] cursor-pointer hover:bg-[#eee] transition" onClick={() => openWorkerForm(w)}>✎</button>
                            <button className="bg-white border border-[#ddd] rounded px-1.5 py-0.5 text-[10px] cursor-pointer hover:text-red-500 hover:border-red-300 transition" onClick={() => handleDeleteWorker(w.id, w.name)}>×</button>
                          </div>
                        </div>
                        {w.phone && <p className="m-0 text-[10px] text-[#777]">{w.phone}</p>}
                        {(w.bank_name || w.bank_account) && <p className="m-0 text-[10px] text-[#777] truncate">{[w.bank_name, w.bank_account].filter(Boolean).join(' ')}</p>}
                        {w.hourly_rate > 0 && <p className="m-0 text-[10px] font-semibold text-primary-700">{w.hourly_rate.toLocaleString('ko-KR')}원/h</p>}
                      </li>
                    ))}
                  </ul>
                )}
                </>)}
              </div>
            )}
          </div>

          {/* ── 스케줄 그리드 ── */}
          <div className="flex-1 min-w-0 bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            {!selectedEvent ? (
              <div className="flex items-center justify-center min-h-[200px] text-[#aaa] text-sm">
                <p>왼쪽에서 일정을 선택하세요.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="m-0 text-base font-extrabold">{selectedEvent.name}</h3>
                    {totalWeeks > 1 && (
                      <div className="flex items-center gap-1">
                        <button className="w-6 h-6 rounded bg-[#f0f0f0] border-none cursor-pointer font-bold text-[#555] hover:bg-[#e0e0e0] transition text-xs disabled:opacity-30" onClick={() => setWeekOffset(w => w - 1)} disabled={weekOffset === 0}>&lt;</button>
                        <span className="text-[11px] font-semibold text-[#555] whitespace-nowrap">
                          {visibleDates[0] && `${visibleDates[0].getMonth() + 1}/${visibleDates[0].getDate()}`}~{visibleDates[visibleDates.length - 1] && `${visibleDates[visibleDates.length - 1].getMonth() + 1}/${visibleDates[visibleDates.length - 1].getDate()}`}
                          <span className="text-[#bbb] ml-1">({weekOffset + 1}/{totalWeeks})</span>
                        </span>
                        <button className="w-6 h-6 rounded bg-[#f0f0f0] border-none cursor-pointer font-bold text-[#555] hover:bg-[#e0e0e0] transition text-xs disabled:opacity-30" onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= totalWeeks - 1}>&gt;</button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[#bbb] font-semibold">드래그</span>
                    {(['move', 'copy'] as const).map(mode => (
                      <button key={mode} className={`px-2.5 py-1 rounded-lg border-none text-[11px] font-bold cursor-pointer transition ${dragMode === mode ? 'bg-primary-700 text-white' : 'bg-[#f0f0f0] text-[#555] hover:bg-[#e0e0e0]'}`} onClick={() => setDragMode(mode)}>
                        {mode === 'move' ? '이동' : '복사'}
                      </button>
                    ))}
                  </div>
                </div>

                {isSlotsLoading ? <p className="text-[#999] text-sm">불러오는 중...</p> : (
                  <div className="overflow-x-auto rounded-lg border border-[#eee] [scrollbar-width:thin] [scrollbar-color:#ccc_transparent]">
                    <table className="w-full border-collapse" style={{ minWidth: `${56 + visibleDates.length * 88}px` }}>
                      <thead>
                        <tr>
                          <th className="bg-[#f9f9f9] w-[56px] min-w-[56px] text-[11px] text-[#666] font-semibold text-center sticky left-0 z-[2] border border-[#eee] px-1 py-2">역할</th>
                          {visibleDates.map((date, i) => (
                            <th key={i} className="bg-[#f9f9f9] text-center border border-[#eee] px-1 py-1.5" style={{ minWidth: '88px' }}>
                              <div className="font-bold text-[12px] leading-tight">{DAY_NAMES[date.getDay()]}</div>
                              <div className="text-[10px] text-[#888]">{date.getMonth() + 1}/{date.getDate()}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ROLES.map(role => (
                          <tr key={role}>
                            <td className="text-[11px] font-bold text-[#555] text-center bg-[#fafafa] whitespace-nowrap sticky left-0 z-[1] border border-[#eee] px-1 py-1.5">{role}</td>
                            {visibleDates.map((date, i) => {
                              const dateStr = toLocalDateStr(date);
                              const cellSlots = getSlotsForCell(dateStr, role);
                              const isOver = dragOverCell?.date === dateStr && dragOverCell?.role === role;
                              const isAdding = addingTo?.date === dateStr && addingTo?.role === role;
                              return (
                                <td key={i} className={`p-1 align-top border border-[#eee] transition duration-150 ${isOver ? 'bg-primary-50 outline-2 outline-dashed outline-primary-700 outline-offset-[-2px]' : ''}`} style={{ minHeight: '60px' }} data-cell data-date={dateStr} data-role={role} onDragOver={e => handleDragOver(e, dateStr, role)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, dateStr, role)}>
                                  <div className="flex flex-col gap-1" style={{ minHeight: '52px' }}>
                                    {cellSlots.map(slot =>
                                      editingSlotId === slot.id ? (
                                        <div key={slot.id} className="flex flex-col gap-1 w-full bg-[#f0f4ff] border border-primary-700 rounded-lg p-1.5">
                                          <select value={editWorkerId} onChange={e => setEditWorkerId(e.target.value ? Number(e.target.value) : '')} autoFocus className="w-full px-1 py-1 border border-[#ddd] rounded text-[10px] focus:outline-none focus:border-primary-700">
                                            <option value="">근무자 선택</option>
                                            {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                          </select>
                                          <input type="text" value={editWorkTime} onChange={e => setEditWorkTime(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleEditSave(slot.id); if (e.key === 'Escape') setEditingSlotId(null); }} placeholder="09-18" className="w-full px-1 py-1 border border-[#ddd] rounded text-[10px] focus:outline-none focus:border-primary-700" />
                                          <label className="flex items-center gap-1 text-[10px] cursor-pointer select-none">
                                            <input type="checkbox" checked={editBreak} onChange={e => setEditBreak(e.target.checked)} className="w-3 h-3 cursor-pointer" />
                                            쉬는시간 1시간 차감
                                          </label>
                                          <div className="flex gap-1">
                                            <button className="flex-1 py-0.5 border-none rounded text-[10px] font-bold cursor-pointer bg-primary-700 text-white hover:bg-primary-800 transition" onClick={() => handleEditSave(slot.id)}>저장</button>
                                            <button className="flex-1 py-0.5 border-none rounded text-[10px] font-bold cursor-pointer bg-[#eee] text-[#333] hover:bg-[#ddd] transition" onClick={() => setEditingSlotId(null)}>취소</button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div key={slot.id} className={`flex items-center gap-0.5 w-full bg-primary-700 text-white rounded-lg px-1.5 py-1 cursor-grab select-none touch-none transition ${draggedSlotId === slot.id ? 'opacity-30' : ''}`} draggable onDragStart={e => handleDragStart(e, slot.id)} onDragEnd={handleDragEnd} onTouchStart={e => handleTouchStart(e, slot.id)} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}>
                                          <div className="flex flex-col min-w-0 flex-1">
                                            <span className="text-[11px] font-bold leading-tight whitespace-nowrap">{slot.person_name}</span>
                                            {slot.work_time && <span className="text-[9px] opacity-75 leading-none whitespace-nowrap">{slot.work_time}{slot.break_time && ' -1h'}</span>}
                                          </div>
                                          <button className="bg-white/15 border-none rounded w-[15px] h-[15px] flex items-center justify-center cursor-pointer text-[10px] p-0 hover:bg-white/35 transition shrink-0" onClick={e => handleEditStart(e, slot)}>✎</button>
                                          <button className="bg-white/15 border-none rounded w-[15px] h-[15px] flex items-center justify-center cursor-pointer text-xs p-0 hover:bg-white/35 transition shrink-0" onClick={e => { e.stopPropagation(); handleRemovePerson(slot.id); }}>×</button>
                                        </div>
                                      )
                                    )}
                                    {isAdding ? (
                                      <div className="flex flex-col gap-1 w-full">
                                        {workers.length === 0 ? (
                                          <p className="text-[10px] text-[#999] m-0 text-center py-1">근무자를 먼저 등록하세요</p>
                                        ) : (
                                          <select value={addWorkerId} onChange={e => setAddWorkerId(e.target.value ? Number(e.target.value) : '')} autoFocus className="w-full px-1 py-1 border border-[#ddd] rounded text-[10px] focus:outline-none focus:border-primary-700">
                                            <option value="">근무자 선택</option>
                                            {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                          </select>
                                        )}
                                        {workers.length > 0 && (
                                          <>
                                            <input type="text" placeholder="09-18" value={addWorkTime} onChange={e => setAddWorkTime(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddPerson(dateStr, role); if (e.key === 'Escape') setAddingTo(null); }} className="w-full px-1 py-1 border border-[#ddd] rounded text-[10px] focus:outline-none focus:border-primary-700" />
                                            <label className="flex items-center gap-1 text-[10px] cursor-pointer select-none">
                                              <input type="checkbox" checked={addBreak} onChange={e => setAddBreak(e.target.checked)} className="w-3 h-3 cursor-pointer" />
                                              쉬는시간 1시간 차감
                                            </label>
                                          </>
                                        )}
                                        <div className="flex gap-1">
                                          {workers.length > 0 && <button className="flex-1 py-0.5 border-none rounded text-[10px] font-semibold cursor-pointer bg-primary-700 text-white hover:bg-primary-800 transition" onClick={() => handleAddPerson(dateStr, role)}>추가</button>}
                                          <button className="flex-1 py-0.5 border-none rounded text-[10px] font-semibold cursor-pointer bg-[#eee] text-[#333] hover:bg-[#ddd] transition" onClick={() => setAddingTo(null)}>취소</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button className="flex items-center justify-center w-5 h-5 rounded border-[1.5px] border-dashed border-[#ccc] bg-transparent text-[#bbb] text-sm cursor-pointer hover:border-primary-700 hover:text-primary-700 hover:bg-primary-50 transition leading-none p-0" onClick={() => { setAddingTo({ date: dateStr, role }); setAddWorkerId(''); setAddWorkTime(''); }}>+</button>
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

        {/* ── 급여 계산서 ── */}
        {selectedEvent && salaryGroups.length > 0 && (
          <div className="mt-5 bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <h3 className="m-0 mb-4 text-lg font-extrabold">급여 계산서 — {selectedEvent.name}</h3>
            <div className="overflow-x-auto [scrollbar-width:thin]">
              <table className="w-full border-collapse text-sm min-w-[600px]">
                <thead>
                  <tr className="bg-[#f9f9f9]">
                    {['이름', '근무날짜', '근무시간', '총 근무시간', '시급 (원)', '최종 급여'].map(h => (
                      <th key={h} className="border border-[#eee] px-3 py-2 text-xs font-semibold text-[#555] text-left whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {salaryGroups.flatMap(group => {
                    const totalHours = group.entries.reduce((s, e) => s + e.hours, 0);
                    const rate = group.worker ? group.worker.hourly_rate : (localRates[group.name] ?? 0);
                    const finalPay = totalHours * rate;
                    return group.entries.map((entry, idx) => {
                      const d = new Date(entry.date + 'T00:00:00');
                      const dateLabel = `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})`;
                      return (
                        <tr key={`${group.key}-${idx}`} className="hover:bg-[#fafafa]">
                          {idx === 0 && (
                            <td className="border border-[#eee] px-3 py-2 align-top font-bold text-[#222]" rowSpan={group.entries.length}>
                              <div className="text-sm">{group.name}</div>
                              {group.worker?.phone && <div className="text-[10px] text-[#888] font-normal mt-0.5">{group.worker.phone}</div>}
                            </td>
                          )}
                          <td className="border border-[#eee] px-3 py-2 text-xs text-[#555] whitespace-nowrap">{dateLabel}</td>
                          <td className="border border-[#eee] px-3 py-2 text-xs text-[#555]">
                            {entry.workTime ?? '-'}
                            {entry.breakTime && <span className="ml-1 text-[10px] text-orange-500">(-1h)</span>}
                          </td>
                          {idx === 0 && (
                            <td className="border border-[#eee] px-3 py-2 text-center font-bold align-top" rowSpan={group.entries.length}>
                              {formatHours(totalHours)}
                            </td>
                          )}
                          {idx === 0 && (
                            <td className="border border-[#eee] px-2 py-2 text-center align-top" rowSpan={group.entries.length}>
                              <input
                                type="number" min={0} step={100}
                                value={rate || ''}
                                onChange={e => handleRateChange(group.worker, group.name, parseInt(e.target.value) || 0)}
                                placeholder="시급"
                                className="w-[88px] px-2 py-1 border border-[#ddd] rounded text-xs text-right focus:outline-none focus:border-primary-700"
                              />
                            </td>
                          )}
                          {idx === 0 && (
                            <td className="border border-[#eee] px-3 py-2 text-right font-bold text-primary-700 align-top" rowSpan={group.entries.length}>
                              <div>{rate > 0 ? `${finalPay.toLocaleString('ko-KR')}원` : '-'}</div>
                              {group.worker && (group.worker.bank_name || group.worker.bank_account) && (
                                <div className="mt-1 text-[10px] font-normal text-[#888] whitespace-nowrap">
                                  {[group.worker.bank_name, group.worker.bank_account].filter(Boolean).join(' ')}
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    });
                  })}
                  <tr className="bg-primary-50">
                    <td colSpan={2} className="border border-[#eee] px-3 py-2.5 text-right font-extrabold text-[#222] text-sm">전체 합계</td>
                    <td className="border border-[#eee] px-3 py-2.5"></td>
                    <td className="border border-[#eee] px-3 py-2.5 text-center font-extrabold">{formatHours(grandTotal.hours)}</td>
                    <td className="border border-[#eee] px-3 py-2.5"></td>
                    <td className="border border-[#eee] px-3 py-2.5 text-right font-extrabold text-primary-700">{grandTotal.pay > 0 ? `${grandTotal.pay.toLocaleString('ko-KR')}원` : '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-[#bbb] m-0">* 등록된 근무자의 시급 변경은 DB에 자동 저장됩니다. 근무시간 형식: 09-18, 10:00-19:00</p>
          </div>
        )}
      </main>
    </>
  );
}
