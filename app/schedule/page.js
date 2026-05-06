'use client';

import Link from 'next/link';
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

const ROLES = ['프론트', '제조', '기타'];
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getEventDates(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export default function SchedulePage() {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [slots, setSlots] = useState([]);
  const [isEventsLoading, setIsEventsLoading] = useState(true);
  const [isSlotsLoading, setIsSlotsLoading] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ name: '', startDate: '', endDate: '' });
  const [message, setMessage] = useState('');
  const [addingTo, setAddingTo] = useState(null); // { date, role }
  const [newPersonName, setNewPersonName] = useState('');
  const [newWorkTime, setNewWorkTime] = useState('');
  const [draggedSlotId, setDraggedSlotId] = useState(null);
  const [dragOverCell, setDragOverCell] = useState(null);
  const touchDragRef = useRef(null);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setIsEventsLoading(true);
    const result = await fetchPopupEvents();
    if (result.success) setEvents(result.data);
    setIsEventsLoading(false);
  };

  const loadSlots = async (eventId) => {
    setIsSlotsLoading(true);
    const result = await fetchScheduleByEvent(eventId);
    if (result.success) setSlots(result.data);
    setIsSlotsLoading(false);
  };

  const showMsg = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2500);
  };

  const handleSelectEvent = (event) => {
    setSelectedEvent(event);
    setAddingTo(null);
    loadSlots(event.id);
  };

  const handleCreateEvent = async () => {
    if (!newEvent.name.trim() || !newEvent.startDate || !newEvent.endDate) {
      showMsg('모든 항목을 입력하세요');
      return;
    }
    if (newEvent.startDate > newEvent.endDate) {
      showMsg('종료일이 시작일보다 앞입니다');
      return;
    }
    const result = await createNewPopupEvent(newEvent.name.trim(), newEvent.startDate, newEvent.endDate);
    if (result.success) {
      const created = result.data;
      setEvents((prev) => [created, ...prev]);
      setShowAddEvent(false);
      setNewEvent({ name: '', startDate: '', endDate: '' });
      handleSelectEvent(created);
      showMsg('일정이 생성되었습니다');
    } else {
      showMsg(`오류: ${result.error}`);
    }
  };

  const handleDeleteEvent = async (e, event) => {
    e.stopPropagation();
    if (!confirm(`"${event.name}" 일정을 삭제하시겠습니까?\n배치된 인원 데이터도 모두 삭제됩니다.`)) return;
    const result = await removePopupEvent(event.id);
    if (result.success) {
      setEvents((prev) => prev.filter((ev) => ev.id !== event.id));
      if (selectedEvent?.id === event.id) {
        setSelectedEvent(null);
        setSlots([]);
      }
    } else {
      showMsg(`오류: ${result.error}`);
    }
  };

  const getSlotsForCell = (dateStr, role) =>
    slots.filter((s) => s.schedule_date === dateStr && s.role === role);

  const handleAddPerson = async (dateStr, role) => {
    if (!newPersonName.trim()) return;
    const result = await addScheduleEntry(
      selectedEvent.id, dateStr, role, newPersonName.trim(), newWorkTime.trim()
    );
    if (result.success) {
      setSlots((prev) => [...prev, result.data]);
      showMsg('인원이 추가되었습니다');
    } else {
      showMsg(`오류: ${result.error}`);
    }
    setAddingTo(null);
    setNewPersonName('');
    setNewWorkTime('');
  };

  const handleRemovePerson = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return;
    const result = await removeScheduleEntry(id);
    if (result.success) {
      setSlots((prev) => prev.filter((s) => s.id !== id));
    } else {
      showMsg(`오류: ${result.error}`);
    }
  };

  // ── Desktop drag & drop ──────────────────────────────────────────────────

  const handleDragStart = (e, slotId) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedSlotId(slotId);
  };

  const handleDragEnd = () => {
    setDraggedSlotId(null);
    setDragOverCell(null);
  };

  const handleDragOver = (e, dateStr, role) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCell({ date: dateStr, role });
  };

  const handleDragLeave = () => setDragOverCell(null);

  const handleDrop = async (e, dateStr, role) => {
    e.preventDefault();
    if (!draggedSlotId) return;
    const slot = slots.find((s) => s.id === draggedSlotId);
    if (!slot || (slot.schedule_date === dateStr && slot.role === role)) {
      setDraggedSlotId(null);
      setDragOverCell(null);
      return;
    }
    const result = await moveScheduleEntry(draggedSlotId, dateStr, role);
    if (result.success) {
      setSlots((prev) => prev.map((s) => (s.id === draggedSlotId ? result.data : s)));
    } else {
      showMsg(`오류: ${result.error}`);
    }
    setDraggedSlotId(null);
    setDragOverCell(null);
  };

  // ── Touch drag & drop ────────────────────────────────────────────────────

  const handleTouchStart = (e, slotId) => {
    e.preventDefault();
    touchDragRef.current = slotId;
    setDraggedSlotId(slotId);
  };

  const handleTouchMove = (e) => {
    if (!touchDragRef.current) return;
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = target?.closest('[data-cell]');
    if (cell) {
      setDragOverCell({
        date: cell.getAttribute('data-date'),
        role: cell.getAttribute('data-role'),
      });
    }
  };

  const handleTouchEnd = async () => {
    if (touchDragRef.current && dragOverCell) {
      const { date, role } = dragOverCell;
      const slot = slots.find((s) => s.id === touchDragRef.current);
      if (slot && (slot.schedule_date !== date || slot.role !== role)) {
        const result = await moveScheduleEntry(touchDragRef.current, date, role);
        if (result.success) {
          setSlots((prev) =>
            prev.map((s) => (s.id === touchDragRef.current ? result.data : s))
          );
        }
      }
    }
    touchDragRef.current = null;
    setDraggedSlotId(null);
    setDragOverCell(null);
  };

  const eventDates = selectedEvent
    ? getEventDates(selectedEvent.start_date, selectedEvent.end_date)
    : [];

  const startWeekday = newEvent.startDate
    ? DAY_NAMES[new Date(newEvent.startDate + 'T00:00:00').getDay()]
    : null;

  return (
    <>
      <header className="header-nav">
        <h1>ChoiChoi</h1>
        <nav>
          <ul className="nav-links">
            <li><Link href="/">POS</Link></li>
            <li><Link href="/stats">통계</Link></li>
            <li><Link href="/schedule" className="active">일정</Link></li>
            <li><Link href="/memo">메모</Link></li>
            <li><Link href="/settings">설정</Link></li>
          </ul>
        </nav>
      </header>

      <main className="pos-wrap">
        <div className="schedule-wrap">
          {message && (
            <div className={`message ${message.includes('오류') ? 'error' : 'success'}`}>
              {message}
            </div>
          )}

          <div className="schedule-page-layout">
            {/* ── 왼쪽: 일정 목록 ── */}
            <div className="event-list-panel">
              <div className="event-list-header">
                <h2>일정 목록</h2>
                <button
                  className={`event-toggle-btn${showAddEvent ? ' cancel' : ''}`}
                  onClick={() => setShowAddEvent((v) => !v)}
                >
                  {showAddEvent ? '취소' : '+ 추가'}
                </button>
              </div>

              {showAddEvent && (
                <div className="event-add-form">
                  <input
                    type="text"
                    placeholder="일정 이름 (예: 강남 팝업)"
                    value={newEvent.name}
                    onChange={(e) => setNewEvent((p) => ({ ...p, name: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateEvent()}
                  />
                  <div className="event-date-row">
                    <div className="event-date-field">
                      <label>시작일</label>
                      <input
                        type="date"
                        value={newEvent.startDate}
                        onChange={(e) => setNewEvent((p) => ({ ...p, startDate: e.target.value }))}
                      />
                      {startWeekday && (
                        <span className="event-weekday-badge">{startWeekday}요일</span>
                      )}
                    </div>
                    <div className="event-date-field">
                      <label>종료일</label>
                      <input
                        type="date"
                        value={newEvent.endDate}
                        onChange={(e) => setNewEvent((p) => ({ ...p, endDate: e.target.value }))}
                      />
                    </div>
                  </div>
                  <button className="event-create-btn" onClick={handleCreateEvent}>
                    일정 생성
                  </button>
                </div>
              )}

              {isEventsLoading ? (
                <p className="empty-order">불러오는 중...</p>
              ) : events.length === 0 ? (
                <p className="empty-order">일정이 없습니다.</p>
              ) : (
                <ul className="event-list">
                  {events.map((event) => (
                    <li
                      key={event.id}
                      className={`event-list-item${selectedEvent?.id === event.id ? ' selected' : ''}`}
                      onClick={() => handleSelectEvent(event)}
                    >
                      <div className="event-item-info">
                        <strong className="event-item-name">{event.name}</strong>
                        <span className="event-item-dates">
                          {event.start_date} ~ {event.end_date}
                        </span>
                        <span className="event-item-weekday">
                          {DAY_NAMES[new Date(event.start_date + 'T00:00:00').getDay()]}요일 시작
                        </span>
                      </div>
                      <button
                        className="event-delete-btn"
                        onClick={(e) => handleDeleteEvent(e, event)}
                        aria-label="일정 삭제"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── 오른쪽: 인원 배치 그리드 ── */}
            <div className="schedule-grid-panel">
              {!selectedEvent ? (
                <div className="schedule-empty-state">
                  <p>왼쪽에서 일정을 선택하세요.</p>
                </div>
              ) : (
                <>
                  <div className="schedule-grid-title">
                    <h3>{selectedEvent.name}</h3>
                    <span>{selectedEvent.start_date} ~ {selectedEvent.end_date}</span>
                  </div>

                  {isSlotsLoading ? (
                    <p>불러오는 중...</p>
                  ) : (
                    <div className="schedule-table-wrap">
                      <table className="schedule-table">
                        <thead>
                          <tr>
                            <th className="role-header">역할</th>
                            {eventDates.map((date, i) => (
                              <th key={i} className="day-header">
                                <div className="day-name">{DAY_NAMES[date.getDay()]}</div>
                                <div className="day-date">
                                  {date.getMonth() + 1}/{date.getDate()}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ROLES.map((role) => (
                            <tr key={role}>
                              <td className="role-label">{role}</td>
                              {eventDates.map((date, i) => {
                                const dateStr = toLocalDateStr(date);
                                const cellSlots = getSlotsForCell(dateStr, role);
                                const isOver =
                                  dragOverCell?.date === dateStr && dragOverCell?.role === role;
                                const isAdding =
                                  addingTo?.date === dateStr && addingTo?.role === role;

                                return (
                                  <td
                                    key={i}
                                    className={`schedule-cell${isOver ? ' drag-over' : ''}`}
                                    data-cell
                                    data-date={dateStr}
                                    data-role={role}
                                    onDragOver={(e) => handleDragOver(e, dateStr, role)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, dateStr, role)}
                                  >
                                    {cellSlots.map((slot) => (
                                      <div
                                        key={slot.id}
                                        className={`person-chip${draggedSlotId === slot.id ? ' dragging' : ''}`}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, slot.id)}
                                        onDragEnd={handleDragEnd}
                                        onTouchStart={(e) => handleTouchStart(e, slot.id)}
                                        onTouchMove={handleTouchMove}
                                        onTouchEnd={handleTouchEnd}
                                        onTouchCancel={handleTouchEnd}
                                      >
                                        <div className="chip-content">
                                          <span className="chip-name">{slot.person_name}</span>
                                          {slot.work_time && (
                                            <span className="chip-time">{slot.work_time}</span>
                                          )}
                                        </div>
                                        <button
                                          className="chip-delete-btn"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemovePerson(slot.id);
                                          }}
                                          aria-label="삭제"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))}

                                    {isAdding ? (
                                      <div className="add-person-form">
                                        <input
                                          type="text"
                                          placeholder="이름"
                                          value={newPersonName}
                                          onChange={(e) => setNewPersonName(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleAddPerson(dateStr, role);
                                            if (e.key === 'Escape') setAddingTo(null);
                                          }}
                                          autoFocus
                                        />
                                        <input
                                          type="text"
                                          placeholder="시간 (예: 09-18)"
                                          value={newWorkTime}
                                          onChange={(e) => setNewWorkTime(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleAddPerson(dateStr, role);
                                            if (e.key === 'Escape') setAddingTo(null);
                                          }}
                                        />
                                        <div className="add-person-buttons">
                                          <button onClick={() => handleAddPerson(dateStr, role)}>
                                            추가
                                          </button>
                                          <button onClick={() => setAddingTo(null)}>취소</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        className="add-person-btn"
                                        onClick={() => {
                                          setAddingTo({ date: dateStr, role });
                                          setNewPersonName('');
                                          setNewWorkTime('');
                                        }}
                                        aria-label="인원 추가"
                                      >
                                        +
                                      </button>
                                    )}
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
