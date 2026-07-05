'use client';

import NavBar from '@/components/NavBar';
import { useEffect, useState } from 'react';
import {
  fetchPopupEvents, createNewPopupEvent, removePopupEvent, editPopupEvent,
} from '@/app/actions/schedule';
import { fetchStores } from '@/app/actions/stores';
import type { PopupEvent, Store } from '@/types/database';
import { showMsg } from '@/lib/toast';
import ScheduleSidebar from './_components/ScheduleSidebar';
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

export default function SchedulePage() {
  // Events
  const [events, setEvents] = useState<PopupEvent[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<PopupEvent | null>(null);
  const [isEventsLoading, setIsEventsLoading] = useState(true);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState<{ name: string; startDate: string; endDate: string; storeId: number | null }>({ name: '', startDate: '', endDate: '', storeId: null });

  const loadEvents = async () => {
    setIsEventsLoading(true);
    const r = await fetchPopupEvents();
    if (r.success && r.data) setEvents(r.data);
    setIsEventsLoading(false);
  };

  useEffect(() => {
    loadEvents();
    fetchStores().then(r => { if (r.success && r.data) setStores(r.data); });
  }, []);

  const handleSelectEvent = (event: PopupEvent) => {
    setSelectedEvent(event);
  };

  const handleCreateEvent = async () => {
    if (!newEvent.name.trim() || !newEvent.startDate || !newEvent.endDate) { showMsg('모든 항목을 입력하세요'); return; }
    if (newEvent.startDate > newEvent.endDate) { showMsg('종료일이 시작일보다 앞입니다'); return; }
    const r = await createNewPopupEvent(newEvent.name.trim(), newEvent.startDate, newEvent.endDate, newEvent.storeId);
    if (r.success && r.data) { setEvents(p => [r.data!, ...p]); setShowAddEvent(false); setNewEvent({ name: '', startDate: '', endDate: '', storeId: null }); handleSelectEvent(r.data); showMsg('일정이 생성되었습니다'); }
    else showMsg(`오류: ${r.error}`);
  };

  const handleEditEvent = async (event: PopupEvent, name: string, startDate: string, endDate: string, storeId: number | null) => {
    const r = await editPopupEvent(event.id, name, startDate, endDate, storeId);
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
    if (!confirm(`"${event.name}" 일정을 삭제하시겠습니까?`)) return;
    const r = await removePopupEvent(event.id);
    if (r.success) { setEvents(p => p.filter(ev => ev.id !== event.id)); if (selectedEvent?.id === event.id) setSelectedEvent(null); }
    else showMsg(`오류: ${r.error}`);
  };

  const startWeekday = newEvent.startDate ? DAY_NAMES[new Date(newEvent.startDate + 'T00:00:00').getDay()] : null;
  const selectedStore = selectedEvent ? stores.find(s => s.id === selectedEvent.store_id) ?? null : null;

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1400px] mx-auto">
        <div className="flex flex-col md:flex-row gap-4 items-stretch">
          <ScheduleSidebar
            events={events} stores={stores} selectedEvent={selectedEvent} isEventsLoading={isEventsLoading}
            showAddEvent={showAddEvent} newEvent={newEvent} startWeekday={startWeekday}
            onToggleAddEvent={() => setShowAddEvent(v => !v)}
            onUpdateNewEvent={(updates) => setNewEvent(p => ({ ...p, ...updates }))}
            onCreateEvent={handleCreateEvent}
            onSelectEvent={handleSelectEvent}
            onDeleteEvent={handleDeleteEvent}
            onEditEvent={handleEditEvent}
          />

          {/* ── 팝업 상세 ── */}
          <div className="flex-1 min-w-0 bg-canvas rounded-xl p-4 shadow-level-1 border border-hairline">
            {selectedEvent ? (
              <div>
                <h3 className="m-0 mb-3 text-base font-extrabold">{selectedEvent.name}</h3>
                <div className="flex flex-col gap-2 text-[13px]">
                  <div className="flex items-center gap-2">
                    <span className="text-ink-muted w-16 shrink-0">매장</span>
                    <span className="font-semibold text-ink">{selectedStore?.name ?? '선택 안 함'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-ink-muted w-16 shrink-0">기간</span>
                    <span className="font-semibold text-ink">{selectedEvent.start_date} ~ {selectedEvent.end_date}</span>
                  </div>
                </div>
                <p className="mt-4 text-[11px] text-ink-faint">
                  근무 배정·급여·근로계약서는 인사 탭에서 매장/기간 기준으로 관리합니다.
                </p>
              </div>
            ) : (
              <p className="text-ink-faint text-sm m-0">좌측에서 일정을 선택하세요.</p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
