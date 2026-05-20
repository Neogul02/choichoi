'use client';

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
}

export default function ScheduleSidebar({
  events, selectedEvent, isEventsLoading,
  showAddEvent, newEvent, startWeekday,
  onToggleAddEvent, onUpdateNewEvent, onCreateEvent,
  onSelectEvent, onDeleteEvent,
}: Props) {
  return (
    <div className="w-full md:w-[210px] shrink-0">
      <div className="bg-white rounded-2xl p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <div className="flex justify-between items-center mb-2.5">
          <h2 className="m-0 text-sm font-extrabold">일정 목록</h2>
          <button className={`px-2.5 py-1 border-none rounded-lg text-[11px] font-bold cursor-pointer transition ${showAddEvent ? 'bg-[#eee] text-[#555]' : 'bg-primary-700 text-white hover:bg-primary-800'}`} onClick={onToggleAddEvent}>
            {showAddEvent ? '취소' : '+ 추가'}
          </button>
        </div>
        {showAddEvent && (
          <div className="bg-[#f9f9f9] rounded-lg p-2.5 mb-2.5 flex flex-col gap-1.5">
            <input type="text" placeholder="일정 이름" value={newEvent.name} onChange={e => onUpdateNewEvent({ name: e.target.value })} onKeyDown={e => e.key === 'Enter' && onCreateEvent()} className="w-full px-2 py-1.5 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-semibold text-[#666]">시작일 {startWeekday && <span className="text-primary-700">{startWeekday}요일</span>}</label>
              <input type="date" value={newEvent.startDate} onChange={e => onUpdateNewEvent({ startDate: e.target.value })} className="w-full px-2 py-1 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-semibold text-[#666]">종료일</label>
              <input type="date" value={newEvent.endDate} onChange={e => onUpdateNewEvent({ endDate: e.target.value })} className="w-full px-2 py-1 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
            </div>
            <button className="w-full p-1.5 border-none rounded bg-primary-700 text-white text-xs font-bold cursor-pointer hover:bg-primary-800 transition" onClick={onCreateEvent}>일정 생성</button>
          </div>
        )}
        {isEventsLoading ? (
          <p className="text-[#999] text-xs m-0">불러오는 중...</p>
        ) : events.length === 0 ? (
          <p className="text-[#999] text-xs m-0">일정이 없습니다.</p>
        ) : (
          <ul className="list-none m-0 p-0 flex flex-col gap-1">
            {events.map(event => (
              <li key={event.id} className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border-[1.5px] cursor-pointer transition ${selectedEvent?.id === event.id ? 'border-primary-700 bg-primary-50' : 'border-[#eee] hover:border-primary-700 hover:bg-primary-50'}`} onClick={() => onSelectEvent(event)}>
                <div className="flex-1 min-w-0">
                  <strong className="block text-[12px] font-bold text-[#222] truncate">{event.name}</strong>
                  <span className="text-[10px] text-[#888]">{event.start_date} ~ {event.end_date}</span>
                </div>
                <button className="bg-transparent border-none text-[#ccc] text-base cursor-pointer leading-none hover:text-red-500 transition" onClick={e => onDeleteEvent(e, event)}>×</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
