'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NavBar from '@/components/NavBar';
import { showMsg } from '@/lib/toast';
import {
  fetchStaffProfiles, createStaffProfile, updateStaffProfile,
  updateStaffStatus, deleteStaffProfile, updateStaffOrder,
} from '@/app/actions/staff';
import type { StaffProfileInput } from '@/app/actions/staff';
import { fetchAllUserProfiles } from '@/app/actions/workers';
import type { UserProfile } from '@/app/actions/workers';
import { fetchStores } from '@/app/actions/stores';
import { fetchAllRosterShifts } from '@/app/actions/roster';
import type { StaffProfile, StaffStatus, StaffRole, Store, RosterShift } from '@/types/database';
import StaffFormModal from './_components/StaffFormModal';
import StoreManageModal from './_components/StoreManageModal';
import RosterCalendar from './_components/RosterCalendar';
import PayrollPanel from './_components/PayrollPanel';
import StaffAssignModal from './_components/StaffAssignModal';
import { STATUS_LABELS, STATUS_COLORS, DAY_NAMES, ROLE_LABELS, formatRanges } from './_components/constants';
import { useModal } from '@/lib/useModal';

const HrContractModal = dynamic(() => import('./_components/HrContractModal'), { ssr: false });
const StaffCalendarModal = dynamic(() => import('./_components/StaffCalendarModal'), { ssr: false });
const WeeklyRosterPrintModal = dynamic(() => import('./_components/WeeklyRosterPrintModal'), { ssr: false });

type StatusFilter = StaffStatus | 'all';
type StoreFilter = number | 'all' | 'none';
type RightTab = 'roster' | 'payroll';

export default function HrPage() {
  const [roleFilter, setRoleFilter] = useState<StaffRole>('cashier');
  const [storeFilter, setStoreFilter] = useState<StoreFilter>('all');
  const [stores, setStores] = useState<Store[]>([]);
  const [allShifts, setAllShifts] = useState<RosterShift[]>([]);
  const storeManage = useModal();
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const form = useModal();
  const [editingStaff, setEditingStaff] = useState<StaffProfile | null>(null);

  // 우측 패널 탭
  const [rightTab, setRightTab] = useState<RightTab>('roster');

  // 드래그 리사이저
  const [leftWidth, setLeftWidth] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  const contract = useModal<StaffProfile>();
  const assigning = useModal<StaffProfile>();
  const calendar = useModal<StaffProfile>();
  const rosterPrint = useModal();

  // 계약서 작성완료 (localStorage 유지)
  const [completedContracts, setCompletedContracts] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('hr_completed_contracts') ?? '[]');
      if (Array.isArray(saved)) setCompletedContracts(new Set(saved));
    } catch { /* ignore */ }
  }, []);
  const markContractComplete = (staffId: number) => {
    setCompletedContracts(prev => {
      const next = new Set(prev);
      next.add(staffId);
      localStorage.setItem('hr_completed_contracts', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  // 불합격 통지 템플릿
  const DEFAULT_REJECTION_MSG = `안녕하세요, [이름]님.

히요리산도 아르바이트에 관심 가져주셔서 감사합니다.

신중한 검토 끝에, 아쉽게도 이번에는 함께하기 어렵게 되었습니다.

소중한 시간 내어 면접에 참여해 주신 점 진심으로 감사드리며, 앞으로의 활동에 좋은 결과가 있으시길 바랍니다.

감사합니다.
초이초이 드림`;
  const [rejectionMsg, setRejectionMsg] = useState(DEFAULT_REJECTION_MSG);

  // 배정 후 캘린더 리프레시 트리거
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  // 컬럼 정렬
  type SortKey = 'name' | 'status' | 'shifts' | 'available';
  type SortDir = 'asc' | 'desc';
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  // 근무자 순서 드래그
  const [draggingStaffId, setDraggingStaffId] = useState<number | null>(null);
  const [dragOverStaffId, setDragOverStaffId] = useState<number | null>(null);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    let dragging = true;
    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = ev.clientX - rect.left;
      setLeftWidth(Math.max(260, Math.min(next, rect.width - 300)));
    };
    const onMouseUp = () => {
      dragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  useEffect(() => {
    Promise.all([fetchStaffProfiles(), fetchAllUserProfiles(), fetchStores(), fetchAllRosterShifts()]).then(([staffRes, profileRes, storesRes, shiftsRes]) => {
      if (staffRes.success && staffRes.data) setStaffList(staffRes.data);
      if (profileRes.success && profileRes.data) setUserProfiles(profileRes.data);
      if (storesRes.success && storesRes.data) setStores(storesRes.data);
      if (shiftsRes.success && shiftsRes.data) setAllShifts(shiftsRes.data);
      setIsLoading(false);
    });
  }, []);

  const roleStaff = useMemo(() => staffList.filter(s => s.staff_role === roleFilter), [staffList, roleFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: roleStaff.length, candidate: 0, confirmed: 0, rejected: 0, inactive: 0 };
    for (const s of roleStaff) counts[s.status]++;
    return counts;
  }, [roleStaff]);

  const STATUS_SORT_ORDER: Record<string, number> = { candidate: 0, confirmed: 1, rejected: 2, inactive: 3 };
  const filtered = useMemo(() => {
    let list = roleStaff.filter(s => {
      if (roleFilter === 'cashier' && storeFilter !== 'all') {
        if (storeFilter === 'none' ? s.store_id !== null : s.store_id !== storeFilter) return false;
      }
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (search.trim() && !s.name.includes(search.trim()) && !(s.phone ?? '').includes(search.trim())) return false;
      return true;
    });
    if (sortKey) {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'name') {
          cmp = a.name.localeCompare(b.name, 'ko');
        } else if (sortKey === 'status') {
          cmp = (STATUS_SORT_ORDER[a.status] ?? 9) - (STATUS_SORT_ORDER[b.status] ?? 9);
        } else if (sortKey === 'shifts') {
          const aS = a.preferred_shift_ids.map(id => allShifts.find(s => s.id === id)?.name ?? '').join(',');
          const bS = b.preferred_shift_ids.map(id => allShifts.find(s => s.id === id)?.name ?? '').join(',');
          cmp = aS.localeCompare(bS, 'ko');
        } else if (sortKey === 'available') {
          const aD = a.available_ranges[0]?.from ?? '9999';
          const bD = b.available_ranges[0]?.from ?? '9999';
          cmp = aD.localeCompare(bD);
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleStaff, roleFilter, storeFilter, statusFilter, search, sortKey, sortDir, allShifts]);

  const handleStaffDrop = async (targetId: number) => {
    if (!draggingStaffId || draggingStaffId === targetId) { setDraggingStaffId(null); setDragOverStaffId(null); return; }
    const filteredIds = filtered.map(s => s.id);
    const fromIdx = filteredIds.indexOf(draggingStaffId);
    const toIdx = filteredIds.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) { setDraggingStaffId(null); setDragOverStaffId(null); return; }
    const newOrder = [...filteredIds];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggingStaffId);
    const currentOrders = filteredIds.map(id => staffList.find(s => s.id === id)!.sort_order);
    const updates = newOrder.map((id, i) => ({ id, sort_order: currentOrders[i] }));
    setStaffList(prev => {
      const orderMap = new Map(updates.map(u => [u.id, u.sort_order]));
      return [...prev].map(s => orderMap.has(s.id) ? { ...s, sort_order: orderMap.get(s.id)! } : s)
        .sort((a, b) => a.sort_order - b.sort_order);
    });
    setDraggingStaffId(null);
    setDragOverStaffId(null);
    await updateStaffOrder(updates);
  };

  const handleSubmit = async (input: StaffProfileInput) => {
    if (editingStaff) {
      const r = await updateStaffProfile(editingStaff.id, input);
      if (r.success && r.data) {
        setStaffList(p => p.map(s => s.id === editingStaff.id ? r.data! : s));
        showMsg('수정되었습니다');
        form.close(); setEditingStaff(null);
      } else showMsg(`오류: ${r.error}`);
    } else {
      const r = await createStaffProfile(input);
      if (r.success && r.data) {
        setStaffList(p => [r.data!, ...p]);
        showMsg(`${input.name} 등록됨`);
        form.close();
      } else showMsg(`오류: ${r.error}`);
    }
  };

  const handleStatusChange = async (staff: StaffProfile, status: StaffStatus) => {
    const r = await updateStaffStatus(staff.id, status);
    if (r.success && r.data) setStaffList(p => p.map(s => s.id === staff.id ? r.data! : s));
    else showMsg(`오류: ${r.error}`);
  };

  const handleDelete = async (staff: StaffProfile) => {
    const r = await deleteStaffProfile(staff.id);
    if (r.success) {
      setStaffList(p => p.filter(s => s.id !== staff.id));
      form.close(); setEditingStaff(null);
      showMsg('삭제되었습니다');
    } else showMsg(`오류: ${r.error}`);
  };

  const handleHealthCertUploaded = (staffId: number, path: string) => {
    setStaffList(p => p.map(s => s.id === staffId ? { ...s, health_cert_url: path, has_health_cert: true } : s));
    showMsg('보건증 업로드 완료');
  };


  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-4">
        <h1 className="m-0 text-lg font-extrabold mb-4">인사관리</h1>

        <div ref={containerRef} className="flex flex-row items-start select-none">
          {/* 좌측: 직원 목록 */}
          <div className="flex flex-col shrink-0 min-w-0" style={{ width: leftWidth }}>
            {/* 주방/캐셔 + 등록 버튼 */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex rounded-xl overflow-hidden border border-hairline bg-canvas shadow-level-1">
                {(['cashier', 'kitchen'] as StaffRole[]).map(r => (
                  <button
                    key={r}
                    onClick={() => { setRoleFilter(r); setStoreFilter('all'); }}
                    className={`px-4 py-2 text-[13px] font-bold border-none cursor-pointer transition ${
                      roleFilter === r ? 'bg-ink text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
                    }`}
                  >
                    {ROLE_LABELS[r]}
                    <span className={`ml-1 text-[11px] ${roleFilter === r ? 'opacity-70' : 'text-ink-faint'}`}>
                      {staffList.filter(s => s.staff_role === r).length}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setEditingStaff(null); form.open(); }}
                className="ml-auto px-3 py-2 rounded-lg border-none bg-primary-700 text-white text-[12px] font-bold cursor-pointer hover:bg-primary-800 transition"
              >
                + 등록
              </button>
            </div>

            {/* 매장 필터 (캐셔) */}
            {roleFilter === 'cashier' && (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="flex rounded-xl overflow-hidden border border-hairline bg-canvas shadow-level-1 flex-wrap">
                  <button onClick={() => setStoreFilter('all')} className={`px-3 py-1.5 text-[12px] font-bold border-none cursor-pointer transition ${storeFilter === 'all' ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'}`}>전체</button>
                  {stores.map(store => (
                    <button key={store.id} onClick={() => setStoreFilter(store.id)} className={`px-3 py-1.5 text-[12px] font-bold border-none cursor-pointer transition whitespace-nowrap ${storeFilter === store.id ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'}`}>{store.name}</button>
                  ))}
                  {roleStaff.some(s => s.store_id === null) && (
                    <button onClick={() => setStoreFilter('none')} className={`px-3 py-1.5 text-[12px] font-bold border-none cursor-pointer transition ${storeFilter === 'none' ? 'bg-amber-500 text-white' : 'bg-canvas text-amber-600 hover:bg-amber-50'}`}>미배정 {roleStaff.filter(s => s.store_id === null).length}</button>
                  )}
                </div>
                <button onClick={() => storeManage.open()} className="px-2.5 py-1.5 rounded-xl bg-canvas-soft border border-hairline text-[12px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition">⚙</button>
              </div>
            )}

            {/* 상태 필터 + 검색 */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex rounded-xl overflow-hidden border border-hairline bg-canvas shadow-level-1">
                {(['all', 'candidate', 'confirmed', 'rejected', 'inactive'] as StatusFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-2.5 py-1.5 text-[11px] font-bold border-none cursor-pointer transition whitespace-nowrap ${
                      statusFilter === f ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
                    }`}
                  >
                    {f === 'all' ? '전체' : STATUS_LABELS[f]}
                    <span className={`ml-0.5 ${statusFilter === f ? 'opacity-70' : 'text-ink-faint'}`}>{statusCounts[f]}</span>
                  </button>
                ))}
              </div>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="이름/전화 검색"
                className="px-3 py-1.5 border border-hairline rounded-xl text-[12px] bg-canvas shadow-level-1 focus:outline-none focus:border-primary-700 w-[120px]"
              />
            </div>

            {/* 불합격 통지 폼 */}
            {statusFilter === 'rejected' && (
              <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="m-0 text-[11px] font-bold text-rose-700">불합격 통지 메시지</p>
                  <button
                    onClick={async () => { await navigator.clipboard.writeText(rejectionMsg); showMsg('클립보드에 복사됐습니다!'); }}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold border-none cursor-pointer hover:bg-rose-700 transition"
                  >
                    복사
                  </button>
                </div>
                <textarea
                  value={rejectionMsg}
                  onChange={e => setRejectionMsg(e.target.value)}
                  rows={8}
                  className="w-full px-2.5 py-2 border border-rose-200 rounded-lg text-[11px] bg-white focus:outline-none focus:border-rose-400 resize-y leading-relaxed"
                />
                <button
                  onClick={() => setRejectionMsg(DEFAULT_REJECTION_MSG)}
                  className="mt-1 text-[10px] text-rose-500 bg-transparent border-none cursor-pointer hover:text-rose-700 transition"
                >
                  기본 양식으로 초기화
                </button>
              </div>
            )}

            {/* 직원 테이블 */}
            <div className="bg-canvas rounded-xl border border-hairline shadow-level-1 overflow-hidden">
              <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
                {isLoading ? (
                  <p className="text-ink-faint text-sm p-4 m-0">불러오는 중...</p>
                ) : filtered.length === 0 ? (
                  <p className="text-ink-faint text-sm p-6 text-center m-0">
                    {staffList.length === 0 ? '등록된 직원이 없습니다. 면접자 정보를 등록해보세요.' : '조건에 맞는 직원이 없습니다.'}
                  </p>
                ) : (
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr className="border-b border-hairline bg-canvas-soft sticky top-0">
                        <th className="w-5 px-1 py-2"></th>
                        {([['name','이름'],['status','상태'],['shifts','파트'],['available','가용기간']] as ['name'|'status'|'shifts'|'available', string][]).map(([key, label]) => (
                          <th
                            key={key}
                            onClick={() => handleSort(key)}
                            className="text-left px-2 py-2 font-semibold text-ink-muted cursor-pointer select-none hover:text-ink transition whitespace-nowrap"
                          >
                            {label}
                            <span className={`ml-1 text-[10px] ${sortKey === key ? 'text-primary-700' : 'text-ink-faint'}`}>
                              {sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
                            </span>
                          </th>
                        ))}
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((staff, i) => (
                        <StaffRow
                          key={staff.id}
                          staff={staff}
                          isLast={i === filtered.length - 1}
                          shiftNames={staff.preferred_shift_ids.map(id => allShifts.find(s => s.id === id)?.name).filter(Boolean).join(' · ')}
                          store={stores.find(st => st.id === staff.store_id) ?? null}
                          onRowClick={() => { setEditingStaff(staff); form.open(); }}
                          onStatusChange={s => handleStatusChange(staff, s)}
                          contractDone={completedContracts.has(staff.id)}
                          onContract={() => contract.open(staff)}
                          onAssign={() => assigning.open(staff)}
                          onCalendar={() => calendar.open(staff)}
                          isDragging={draggingStaffId === staff.id}
                          isDragOver={dragOverStaffId === staff.id}
                          onDragStart={() => setDraggingStaffId(staff.id)}
                          onDragOver={() => setDragOverStaffId(staff.id)}
                          onDragEnd={() => { setDraggingStaffId(null); setDragOverStaffId(null); }}
                          onDrop={() => handleStaffDrop(staff.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* 드래그 바 */}
          <div
            onMouseDown={handleDividerMouseDown}
            className="w-3 shrink-0 self-stretch cursor-col-resize flex items-center justify-center group"
          >
            <div className="w-0.5 h-12 rounded-full bg-hairline group-hover:bg-primary-400 transition-colors" />
          </div>

          {/* 우측: 탭 + 패널 */}
          <div className="flex-1 min-w-[300px] flex flex-col gap-3">
            {/* 우측 탭 + 근무표 인쇄 */}
            <div className="flex items-center gap-2">
              <div className="flex rounded-xl overflow-hidden border border-hairline bg-canvas shadow-level-1 w-fit">
                {([['roster', '스케줄 달력'], ['payroll', '급여 정산']] as [RightTab, string][]).map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setRightTab(tab)}
                    className={`px-4 py-2 text-[12px] font-bold border-none cursor-pointer transition ${
                      rightTab === tab ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => rosterPrint.open()}
                className="px-3 py-2 rounded-xl bg-canvas border border-hairline text-[12px] font-bold text-ink-muted cursor-pointer hover:bg-canvas-soft transition shadow-level-1"
              >
                근무표 인쇄
              </button>
            </div>

            {rightTab === 'roster'
              ? <RosterCalendar staffList={staffList} stores={stores} roleFilter={roleFilter} refreshSignal={calendarRefreshKey} />
              : <PayrollPanel defaultRole={roleFilter} />
            }
          </div>
        </div>
      </main>

      {storeManage.isOpen && (
        <StoreManageModal stores={stores} onStoresChange={setStores} onClose={storeManage.close} />
      )}

      {form.isOpen && (
        <StaffFormModal
          staff={editingStaff}
          userProfiles={userProfiles}
          stores={stores}
          defaultRole={roleFilter}
          defaultStoreId={typeof storeFilter === 'number' ? storeFilter : null}
          onClose={() => { form.close(); setEditingStaff(null); }}
          onSubmit={handleSubmit}
          onDelete={editingStaff ? () => handleDelete(editingStaff) : undefined}
          onHealthCertUploaded={handleHealthCertUploaded}
        />
      )}

      {contract.value && (
        <HrContractModal
          staff={contract.value}
          onClose={contract.close}
          onComplete={() => markContractComplete(contract.value!.id)}
        />
      )}

      {assigning.value && (
        <StaffAssignModal
          staff={assigning.value}
          stores={stores}
          onClose={assigning.close}
          onAssigned={(count) => {
            showMsg(count > 0 ? `${count}일 배정 완료` : '새로 배정된 날짜가 없습니다 (이미 배정됨)');
            assigning.close();
            if (count > 0) setCalendarRefreshKey(k => k + 1);
          }}
        />
      )}

      {calendar.value && (
        <StaffCalendarModal
          staffId={calendar.value.id}
          name={calendar.value.name}
          onClose={calendar.close}
        />
      )}

      {rosterPrint.isOpen && (
        <WeeklyRosterPrintModal onClose={rosterPrint.close} />
      )}
    </>
  );
}

function StaffRow({ staff, shiftNames, store, isLast, contractDone, onRowClick, onStatusChange, onContract, onAssign, onCalendar,
  isDragging, isDragOver, onDragStart, onDragOver, onDragEnd, onDrop }: {
  staff: StaffProfile;
  shiftNames: string;
  store: Store | null;
  isLast: boolean;
  contractDone: boolean;
  onRowClick: () => void;
  onStatusChange: (s: StaffStatus) => void;
  onContract: () => void;
  onAssign: () => void;
  onCalendar: () => void;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDragEnd?: () => void;
  onDrop?: () => void;
}) {
  const sc = STATUS_COLORS[staff.status];

  return (
    <tr
      draggable
      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('application/staff-id', String(staff.id)); e.dataTransfer.effectAllowed = 'copy'; onDragStart?.(); }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); onDragOver?.(); }}
      onDragEnd={onDragEnd}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop?.(); }}
      className={`transition cursor-pointer ${isDragOver ? 'bg-primary-50 outline outline-2 outline-primary-400 outline-offset-[-1px]' : 'hover:bg-canvas-soft'} ${isDragging ? 'opacity-40' : ''} ${!isLast ? 'border-b border-hairline' : ''}`}
      onClick={onRowClick}
    >
      <td className="px-1 py-2.5 w-5 cursor-grab" onClick={e => e.stopPropagation()}>
        <span className="text-ink-faint text-[13px] select-none">⋮⋮</span>
      </td>
      <td className="px-3 py-2.5">
        <div className="font-bold text-ink leading-tight">{staff.name}</div>
        {staff.phone && <div className="text-[11px] text-ink-muted mt-0.5">{staff.phone}</div>}
        {staff.staff_role === 'cashier' && (
          <div className={`text-[10px] font-semibold mt-0.5 ${store ? 'text-violet-600' : 'text-amber-600'}`}>
            {store ? store.name : '매장 미배정'}
          </div>
        )}
      </td>
      <td className="px-2 py-2.5" onClick={e => e.stopPropagation()}>
        <select
          value={staff.status}
          onChange={e => onStatusChange(e.target.value as StaffStatus)}
          className={`text-[10px] font-bold px-1 py-0.5 rounded border cursor-pointer appearance-none text-center ${sc.bg} ${sc.text} ${sc.border}`}
        >
          {(Object.keys(STATUS_LABELS) as StaffStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2.5 font-semibold text-ink whitespace-nowrap">
        {staff.preferred_shift_ids.length === 0 ? <span className="text-ink-faint font-normal">무관</span> : shiftNames}
      </td>
      <td className="px-2 py-2.5 text-ink-muted whitespace-nowrap">
        {staff.available_ranges.length === 0 ? '무관' : formatRanges(staff.available_ranges)}
      </td>
      <td className="px-2 py-2.5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <button
            onClick={onCalendar}
            title="근무 캘린더"
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-canvas-soft text-ink-muted border border-hairline hover:bg-[#ececeb] transition cursor-pointer"
          >
            달력
          </button>
          <button
            onClick={onAssign}
            title="일정 배정"
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100 transition cursor-pointer"
          >
            배정
          </button>
          {staff.user_profile_id && (
            <button
              onClick={onContract}
              title="근로계약서 작성"
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border transition cursor-pointer ${
                contractDone
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
            >
              {contractDone ? '계약서 ✓' : '계약서'}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
