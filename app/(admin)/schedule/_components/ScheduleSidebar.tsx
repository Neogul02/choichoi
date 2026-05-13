'use client';

import type { PopupEvent, Worker } from '@/types/database';

type LeftTab = 'events' | 'workers';
type WorkerForm = { name: string; color: string; phone: string; bank_name: string; bank_account: string; hourly_rate: string };

const WORKER_COLORS = ['#22c55e', '#6366f1', '#ef4444', '#f97316', '#64748b'];

interface Props {
  events: PopupEvent[];
  selectedEvent: PopupEvent | null;
  isEventsLoading: boolean;
  workers: Worker[];
  leftTab: LeftTab;
  showAddEvent: boolean;
  newEvent: { name: string; startDate: string; endDate: string };
  showWorkerForm: boolean;
  workerForm: WorkerForm;
  editingWorkerId: number | null;
  startWeekday: string | null;
  onTabChange: (tab: LeftTab) => void;
  onToggleAddEvent: () => void;
  onUpdateNewEvent: (updates: Partial<{ name: string; startDate: string; endDate: string }>) => void;
  onCreateEvent: () => void;
  onSelectEvent: (event: PopupEvent) => void;
  onDeleteEvent: (e: React.MouseEvent, event: PopupEvent) => void;
  onOpenWorkerForm: (worker?: Worker) => void;
  onSetShowWorkerForm: (show: boolean) => void;
  onUpdateWorkerForm: (updates: Partial<WorkerForm>) => void;
  onSaveWorker: () => void;
  onDeleteWorker: (id: number, name: string) => void;
}

export default function ScheduleSidebar({
  events, selectedEvent, isEventsLoading, workers,
  leftTab, showAddEvent, newEvent, showWorkerForm, workerForm, editingWorkerId, startWeekday,
  onTabChange, onToggleAddEvent, onUpdateNewEvent, onCreateEvent,
  onSelectEvent, onDeleteEvent,
  onOpenWorkerForm, onSetShowWorkerForm, onUpdateWorkerForm, onSaveWorker, onDeleteWorker,
}: Props) {
  return (
    <div className="w-full md:w-[210px] shrink-0">
      <div className="flex rounded-xl overflow-hidden border border-[#eee] mb-2 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        {(['events', 'workers'] as const).map(tab => (
          <button key={tab} className={`flex-1 py-2 text-[11px] font-bold border-none cursor-pointer transition ${leftTab === tab ? 'bg-primary-700 text-white' : 'bg-white text-[#555] hover:bg-[#f5f5f5]'}`} onClick={() => onTabChange(tab)}>
            {tab === 'events' ? '일정 목록' : '근무자 관리'}
          </button>
        ))}
      </div>

      {leftTab === 'events' && (
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
          {isEventsLoading ? <p className="text-[#999] text-xs m-0">불러오는 중...</p> : events.length === 0 ? <p className="text-[#999] text-xs m-0">일정이 없습니다.</p> : (
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
      )}

      {leftTab === 'workers' && (
        <div className="bg-white rounded-2xl p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          {!selectedEvent ? (
            <p className="text-[#999] text-xs m-0 text-center py-2">일정을 먼저 선택하세요</p>
          ) : (<>
            <div className="flex justify-between items-center mb-2.5">
              <h2 className="m-0 text-sm font-extrabold">{selectedEvent.name} 근무자</h2>
              <button className={`px-2.5 py-1 border-none rounded-lg text-[11px] font-bold cursor-pointer transition ${showWorkerForm ? 'bg-[#eee] text-[#555]' : 'bg-primary-700 text-white hover:bg-primary-800'}`} onClick={() => showWorkerForm ? onSetShowWorkerForm(false) : onOpenWorkerForm()}>
                {showWorkerForm ? '취소' : '+ 추가'}
              </button>
            </div>
            {showWorkerForm && (
              <div className="bg-[#f9f9f9] rounded-lg p-2.5 mb-2.5 flex flex-col gap-1.5">
                <input type="text" placeholder="이름 *" value={workerForm.name} onChange={e => onUpdateWorkerForm({ name: e.target.value })} className="w-full px-2 py-1.5 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
                <div>
                  <p className="text-[10px] font-semibold text-[#666] mb-1">색상</p>
                  <div className="flex flex-wrap gap-1.5">
                    {WORKER_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => onUpdateWorkerForm({ color: c })} className="w-5 h-5 rounded-full border-2 transition" style={{ backgroundColor: c, borderColor: workerForm.color === c ? '#222' : 'transparent' }} />
                    ))}
                  </div>
                </div>
                <input type="tel" placeholder="전화번호" value={workerForm.phone} onChange={e => onUpdateWorkerForm({ phone: e.target.value })} className="w-full px-2 py-1.5 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
                <input type="text" placeholder="은행 종류 (예: 카카오뱅크)" value={workerForm.bank_name} onChange={e => onUpdateWorkerForm({ bank_name: e.target.value })} className="w-full px-2 py-1.5 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
                <input type="text" placeholder="계좌번호" value={workerForm.bank_account} onChange={e => onUpdateWorkerForm({ bank_account: e.target.value })} className="w-full px-2 py-1.5 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
                <input type="number" placeholder="시급 (원)" value={workerForm.hourly_rate} onChange={e => onUpdateWorkerForm({ hourly_rate: e.target.value })} className="w-full px-2 py-1.5 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700" />
                <button className="w-full p-1.5 border-none rounded bg-primary-700 text-white text-xs font-bold cursor-pointer hover:bg-primary-800 transition" onClick={onSaveWorker}>{editingWorkerId ? '수정 완료' : '등록'}</button>
              </div>
            )}
            {workers.length === 0 ? <p className="text-[#999] text-xs m-0">등록된 근무자가 없습니다.</p> : (
              <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
                {workers.map(w => (
                  <li key={w.id} className="bg-[#f9f9f9] rounded-lg p-2 border border-[#eee]">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: w.color || '#6366f1' }} />
                        <strong className="text-[12px] font-bold">{w.name}</strong>
                      </div>
                      <div className="flex gap-1">
                        <button className="bg-white border border-[#ddd] rounded px-1.5 py-0.5 text-[10px] cursor-pointer hover:bg-[#eee] transition" onClick={() => onOpenWorkerForm(w)}>✎</button>
                        <button className="bg-white border border-[#ddd] rounded px-1.5 py-0.5 text-[10px] cursor-pointer hover:text-red-500 hover:border-red-300 transition" onClick={() => onDeleteWorker(w.id, w.name)}>×</button>
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
  );
}
