'use client';

import NavBar from '@/components/NavBar';
import { useEffect, useRef, useState } from 'react';
import {
  fetchPopupEvents,
  createNewPopupEvent,
  removePopupEvent,
  fetchScheduleByEvent,
  addScheduleEntry,
  removeScheduleEntry,
  moveScheduleEntry,
} from '../actions';
import type { PopupEvent, ScheduleSlot } from '@/types/database';
import { toLocalDateStr } from '@/lib/utils';

const ROLES = ['프론트', '제조', '기타'] as const;
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

type DragCell = { date: string; role: string };
type NewEventForm = { name: string; startDate: string; endDate: string };

function getEventDates(startDate: string, endDate: string): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export default function SchedulePage() {
  const [events, setEvents] = useState<PopupEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<PopupEvent | null>(null);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [isEventsLoading, setIsEventsLoading] = useState(true);
  const [isSlotsLoading, setIsSlotsLoading] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState<NewEventForm>({ name: '', startDate: '', endDate: '' });
  const [message, setMessage] = useState('');
  const [addingTo, setAddingTo] = useState<DragCell | null>(null);
  const [newPersonName, setNewPersonName] = useState('');
  const [newWorkTime, setNewWorkTime] = useState('');
  const [draggedSlotId, setDraggedSlotId] = useState<number | null>(null);
  const [dragOverCell, setDragOverCell] = useState<DragCell | null>(null);
  const touchDragRef = useRef<number | null>(null);

  const loadEvents = async () => {
    setIsEventsLoading(true);
    const result = await fetchPopupEvents();
    if (result.success && result.data) setEvents(result.data);
    setIsEventsLoading(false);
  };

  useEffect(() => { loadEvents(); }, []);

  const loadSlots = async (eventId: number) => {
    setIsSlotsLoading(true);
    const result = await fetchScheduleByEvent(eventId);
    if (result.success && result.data) setSlots(result.data);
    setIsSlotsLoading(false);
  };

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2500);
  };

  const handleSelectEvent = (event: PopupEvent) => {
    setSelectedEvent(event);
    setAddingTo(null);
    loadSlots(event.id);
  };

  const handleCreateEvent = async () => {
    if (!newEvent.name.trim() || !newEvent.startDate || !newEvent.endDate) { showMsg('모든 항목을 입력하세요'); return; }
    if (newEvent.startDate > newEvent.endDate) { showMsg('종료일이 시작일보다 앞입니다'); return; }
    const result = await createNewPopupEvent(newEvent.name.trim(), newEvent.startDate, newEvent.endDate);
    if (result.success && result.data) {
      setEvents((prev) => [result.data!, ...prev]);
      setShowAddEvent(false);
      setNewEvent({ name: '', startDate: '', endDate: '' });
      handleSelectEvent(result.data);
      showMsg('일정이 생성되었습니다');
    } else {
      showMsg(`오류: ${result.error}`);
    }
  };

  const handleDeleteEvent = async (e: React.MouseEvent<HTMLButtonElement>, event: PopupEvent) => {
    e.stopPropagation();
    if (!confirm(`"${event.name}" 일정을 삭제하시겠습니까?\n배치된 인원 데이터도 모두 삭제됩니다.`)) return;
    const result = await removePopupEvent(event.id);
    if (result.success) {
      setEvents((prev) => prev.filter((ev) => ev.id !== event.id));
      if (selectedEvent?.id === event.id) { setSelectedEvent(null); setSlots([]); }
    } else {
      showMsg(`오류: ${result.error}`);
    }
  };

  const getSlotsForCell = (dateStr: string, role: string): ScheduleSlot[] =>
    slots.filter((s) => s.schedule_date === dateStr && s.role === role);

  const handleAddPerson = async (dateStr: string, role: string) => {
    if (!newPersonName.trim() || !selectedEvent) return;
    const result = await addScheduleEntry(selectedEvent.id, dateStr, role, newPersonName.trim(), newWorkTime.trim());
    if (result.success && result.data) {
      setSlots((prev) => [...prev, result.data!]);
      showMsg('인원이 추가되었습니다');
    } else {
      showMsg(`오류: ${result.error}`);
    }
    setAddingTo(null);
    setNewPersonName('');
    setNewWorkTime('');
  };

  const handleRemovePerson = async (id: number) => {
    if (!confirm('삭제하시겠습니까?')) return;
    const result = await removeScheduleEntry(id);
    if (result.success) setSlots((prev) => prev.filter((s) => s.id !== id));
    else showMsg(`오류: ${result.error}`);
  };

  // ── Desktop drag & drop ──────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, slotId: number) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedSlotId(slotId);
  };

  const handleDragEnd = () => { setDraggedSlotId(null); setDragOverCell(null); };

  const handleDragOver = (e: React.DragEvent<HTMLTableCellElement>, dateStr: string, role: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCell({ date: dateStr, role });
  };

  const handleDragLeave = () => setDragOverCell(null);

  const handleDrop = async (e: React.DragEvent<HTMLTableCellElement>, dateStr: string, role: string) => {
    e.preventDefault();
    if (!draggedSlotId) return;
    const slot = slots.find((s) => s.id === draggedSlotId);
    if (!slot || (slot.schedule_date === dateStr && slot.role === role)) {
      setDraggedSlotId(null); setDragOverCell(null); return;
    }
    const result = await moveScheduleEntry(draggedSlotId, dateStr, role);
    if (result.success && result.data) setSlots((prev) => prev.map((s) => (s.id === draggedSlotId ? result.data! : s)));
    else showMsg(`오류: ${result.error}`);
    setDraggedSlotId(null);
    setDragOverCell(null);
  };

  // ── Touch drag & drop ────────────────────────────────────────────────────

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>, slotId: number) => {
    e.preventDefault();
    touchDragRef.current = slotId;
    setDraggedSlotId(slotId);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchDragRef.current) return;
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = target?.closest('[data-cell]');
    if (cell) setDragOverCell({ date: cell.getAttribute('data-date')!, role: cell.getAttribute('data-role')! });
  };

  const handleTouchEnd = async () => {
    if (touchDragRef.current && dragOverCell) {
      const { date, role } = dragOverCell;
      const slot = slots.find((s) => s.id === touchDragRef.current);
      if (slot && (slot.schedule_date !== date || slot.role !== role)) {
        const result = await moveScheduleEntry(touchDragRef.current, date, role);
        if (result.success && result.data) setSlots((prev) => prev.map((s) => (s.id === touchDragRef.current ? result.data! : s)));
      }
    }
    touchDragRef.current = null;
    setDraggedSlotId(null);
    setDragOverCell(null);
  };

  const eventDates = selectedEvent ? getEventDates(selectedEvent.start_date, selectedEvent.end_date) : [];
  const startWeekday = newEvent.startDate ? DAY_NAMES[new Date(newEvent.startDate + 'T00:00:00').getDay()] : null;

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        <div className="max-w-[1100px] mx-auto">
          {message && (
            <div className={`p-3 mb-4 rounded-lg text-center font-semibold ${message.includes('오류') ? 'bg-[#f8d7da] text-[#721c24] border border-[#f5c6cb]' : 'bg-[#d4edda] text-[#155724] border border-[#c3e6cb]'}`}>
              {message}
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-4 items-start">
            {/* ── 왼쪽: 일정 목록 ── */}
            <div className="w-full md:w-[260px] shrink-0 bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              <div className="flex justify-between items-center mb-3">
                <h2 className="m-0 text-lg font-extrabold">일정 목록</h2>
                <button className={`px-3 py-1.5 border-none rounded-lg text-xs font-bold cursor-pointer transition-all duration-200 ${showAddEvent ? 'bg-[#eee] text-[#555] hover:bg-[#ddd]' : 'bg-primary-700 text-white hover:bg-primary-800'}`} onClick={() => setShowAddEvent((v) => !v)}>
                  {showAddEvent ? '취소' : '+ 추가'}
                </button>
              </div>

              {showAddEvent && (
                <div className="bg-[#f9f9f9] rounded-lg p-3 mb-3 flex flex-col gap-2">
                  <input type="text" placeholder="일정 이름 (예: 강남 팝업)" value={newEvent.name} onChange={(e) => setNewEvent((p) => ({ ...p, name: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && handleCreateEvent()} className="w-full px-2.5 py-2 border border-[#ddd] rounded-md text-[13px] focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10" />
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[11px] font-semibold text-[#666]">시작일</label>
                      <input type="date" value={newEvent.startDate} onChange={(e) => setNewEvent((p) => ({ ...p, startDate: e.target.value }))} className="w-full px-2 py-1.5 border border-[#ddd] rounded-md text-xs focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10" />
                      {startWeekday && <span className="text-[11px] font-bold text-primary-700 mt-0.5">{startWeekday}요일</span>}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[11px] font-semibold text-[#666]">종료일</label>
                      <input type="date" value={newEvent.endDate} onChange={(e) => setNewEvent((p) => ({ ...p, endDate: e.target.value }))} className="w-full px-2 py-1.5 border border-[#ddd] rounded-md text-xs focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10" />
                    </div>
                  </div>
                  <button className="w-full p-2 border-none rounded-lg bg-primary-700 text-white text-[13px] font-bold cursor-pointer transition hover:bg-primary-800" onClick={handleCreateEvent}>일정 생성</button>
                </div>
              )}

              {isEventsLoading ? (
                <p className="m-0 text-[#999] text-sm">불러오는 중...</p>
              ) : events.length === 0 ? (
                <p className="m-0 text-[#999] text-sm">일정이 없습니다.</p>
              ) : (
                <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
                  {events.map((event) => (
                    <li key={event.id} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-[1.5px] cursor-pointer transition duration-150 ${selectedEvent?.id === event.id ? 'border-primary-700 bg-primary-50' : 'border-[#eee] bg-white hover:border-primary-700 hover:bg-primary-50'}`} onClick={() => handleSelectEvent(event)}>
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <strong className="text-[13px] font-bold text-[#222] whitespace-nowrap overflow-hidden text-ellipsis">{event.name}</strong>
                        <span className="text-[11px] text-[#888]">{event.start_date} ~ {event.end_date}</span>
                        <span className="text-[10px] text-[#aaa]">{DAY_NAMES[new Date(event.start_date + 'T00:00:00').getDay()]}요일 시작</span>
                      </div>
                      <button className="bg-transparent border-none text-[#ccc] text-lg cursor-pointer px-0.5 leading-none shrink-0 transition duration-150 hover:text-red-500" onClick={(e) => handleDeleteEvent(e, event)} aria-label="일정 삭제">×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── 오른쪽: 인원 배치 그리드 ── */}
            <div className="flex-1 min-w-0 bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] w-full">
              {!selectedEvent ? (
                <div className="flex items-center justify-center min-h-[200px] text-[#aaa] text-sm">
                  <p>왼쪽에서 일정을 선택하세요.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-2.5 mb-3">
                    <h3 className="m-0 text-lg font-extrabold">{selectedEvent.name}</h3>
                    <span className="text-xs text-[#888]">{selectedEvent.start_date} ~ {selectedEvent.end_date}</span>
                  </div>
                  {isSlotsLoading ? (
                    <p>불러오는 중...</p>
                  ) : (
                    <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-[#eee] [scrollbar-width:thin] [scrollbar-color:#ccc_transparent]">
                      <table className="w-full border-collapse min-w-[400px]">
                        <thead>
                          <tr>
                            <th className="bg-[#f9f9f9] w-[60px] min-w-[60px] text-xs text-[#666] font-semibold text-center sticky left-0 z-[2] border border-[#eee] p-2">역할</th>
                            {eventDates.map((date, i) => (
                              <th key={i} className="bg-[#f9f9f9] text-center min-w-[100px] border border-[#eee] p-2">
                                <div className="font-bold text-[13px]">{DAY_NAMES[date.getDay()]}</div>
                                <div className="text-[11px] text-[#888] mt-0.5">{date.getMonth() + 1}/{date.getDate()}</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ROLES.map((role) => (
                            <tr key={role}>
                              <td className="text-xs font-bold text-[#555] text-center bg-[#fafafa] whitespace-nowrap sticky left-0 z-[1] border border-[#eee] p-2">{role}</td>
                              {eventDates.map((date, i) => {
                                const dateStr = toLocalDateStr(date);
                                const cellSlots = getSlotsForCell(dateStr, role);
                                const isOver = dragOverCell?.date === dateStr && dragOverCell?.role === role;
                                const isAdding = addingTo?.date === dateStr && addingTo?.role === role;
                                return (
                                  <td key={i} className={`min-h-[72px] p-1.5 align-top transition duration-150 border border-[#eee] ${isOver ? 'bg-primary-50 outline-2 outline-dashed outline-primary-700 outline-offset-[-2px]' : ''}`} data-cell data-date={dateStr} data-role={role} onDragOver={(e) => handleDragOver(e, dateStr, role)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, dateStr, role)}>
                                    <div className="flex flex-wrap gap-1 content-start">
                                      {cellSlots.map((slot) => (
                                        <div key={slot.id} className={`inline-flex items-center gap-1 bg-primary-700 text-white rounded-lg px-2 py-1.5 cursor-grab select-none touch-none transition duration-150 active:cursor-grabbing ${draggedSlotId === slot.id ? 'opacity-35' : ''}`} draggable onDragStart={(e) => handleDragStart(e, slot.id)} onDragEnd={handleDragEnd} onTouchStart={(e) => handleTouchStart(e, slot.id)} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}>
                                          <div className="flex flex-col gap-[1px] min-w-0">
                                            <span className="text-xs font-bold leading-[1.2] whitespace-nowrap">{slot.person_name}</span>
                                            {slot.work_time && <span className="text-[10px] opacity-75 leading-none whitespace-nowrap">{slot.work_time}</span>}
                                          </div>
                                          <button className="bg-white/15 border-none rounded shrink-0 w-[18px] h-[18px] inline-flex items-center justify-center cursor-pointer text-white text-sm leading-none p-0 transition hover:bg-white/35" onClick={(e) => { e.stopPropagation(); handleRemovePerson(slot.id); }} aria-label="삭제">×</button>
                                        </div>
                                      ))}
                                      {isAdding ? (
                                        <div className="flex flex-col gap-1 min-w-[110px] mt-1 w-full">
                                          <input type="text" placeholder="이름" value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddPerson(dateStr, role); if (e.key === 'Escape') setAddingTo(null); }} autoFocus className="w-full px-2 py-1 border border-[#ddd] rounded-md text-xs focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10" />
                                          <input type="text" placeholder="시간 (예: 09-18)" value={newWorkTime} onChange={(e) => setNewWorkTime(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddPerson(dateStr, role); if (e.key === 'Escape') setAddingTo(null); }} className="w-full px-2 py-1 border border-[#ddd] rounded-md text-xs focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10" />
                                          <div className="flex gap-1">
                                            <button className="flex-1 py-1 px-1.5 border-none rounded-md text-[11px] font-semibold cursor-pointer bg-primary-700 text-white hover:bg-primary-800 transition" onClick={() => handleAddPerson(dateStr, role)}>추가</button>
                                            <button className="flex-1 py-1 px-1.5 border-none rounded-md text-[11px] font-semibold cursor-pointer bg-[#eee] text-[#333] hover:bg-[#ddd] transition" onClick={() => setAddingTo(null)}>취소</button>
                                          </div>
                                        </div>
                                      ) : (
                                        <button className="inline-flex items-center justify-center w-6 h-6 rounded-md border-[1.5px] border-dashed border-[#ccc] bg-transparent text-[#bbb] text-base cursor-pointer m-0.5 transition duration-150 leading-none p-0 hover:border-primary-700 hover:text-primary-700 hover:bg-primary-50" onClick={() => { setAddingTo({ date: dateStr, role }); setNewPersonName(''); setNewWorkTime(''); }} aria-label="인원 추가">+</button>
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
        </div>
      </main>
    </>
  );
}
