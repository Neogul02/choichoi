'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState } from 'react';
import NavBar from '@/components/NavBar';
import { showMsg } from '@/lib/toast';
import {
  createStaffProfile, updateStaffProfile,
  updateStaffStatus, deleteStaffProfile, updateStaffOrder,
} from '@/app/actions/staff';
import type { StaffProfileInput } from '@/app/actions/staff';
import type { UserProfile } from '@/app/actions/workers';
import type { RosterUnit, RosterMonthData } from '@/app/actions/roster';
import { fetchContractedStaffIds } from '@/app/actions/contracts';
import type { StaffProfile, StaffStatus, StaffRole, Store, RosterShift, PopupEvent } from '@/types/database';
import { filterVisibleStores } from '@/lib/staffing';
import StaffFormModal from './StaffFormModal';
import StoreManageModal from './StoreManageModal';
import RosterCalendar from './RosterCalendar';
import PayrollPanel from './PayrollPanel';
import ContractsPanel from './ContractsPanel';
import StaffAssignModal from './StaffAssignModal';
import { StaffRow, StaffCard } from './StaffList';
import RejectionNoticeBox from './RejectionNoticeBox';
import { useStaffFilters } from './useStaffFilters';
import type { RoleFilter, StatusFilter } from './useStaffFilters';
import { STATUS_LABELS, ROLE_LABELS } from './constants';
import { useModal } from '@/lib/useModal';

const HrContractModal = dynamic(() => import('./HrContractModal'), { ssr: false });
const StaffContractsListModal = dynamic(() => import('./StaffContractsListModal'), { ssr: false });
const StaffCalendarModal = dynamic(() => import('./StaffCalendarModal'), { ssr: false });
const WeeklyRosterPrintModal = dynamic(() => import('./WeeklyRosterPrintModal'), { ssr: false });

type RightTab = 'roster' | 'payroll' | 'contracts';

export interface InitialRoster {
  unit: RosterUnit;
  y: number;
  m: number;
  data: RosterMonthData;
}

interface Props {
  initialStaff: StaffProfile[];
  initialUserProfiles: UserProfile[];
  initialStores: Store[];
  initialPopups: PopupEvent[];
  initialShifts: RosterShift[];
  initialContractedIds: number[];
  initialRoster: InitialRoster | null;
}

// 초기 데이터는 서버 컴포넌트(page.tsx)가 렌더 시점에 병렬 조회해 props로 내려준다
// — 클라이언트 마운트 후 서버 액션 직렬 워터폴(6회 왕복)을 없애기 위함
export default function HrPageClient({ initialStaff, initialUserProfiles, initialStores, initialPopups, initialShifts, initialContractedIds, initialRoster }: Props) {
  // 달력·급여 패널과 등록 모달은 구체 역할만 받으므로, '전체' 뷰에서도 마지막 선택 역할을 유지
  const [concreteRole, setConcreteRole] = useState<StaffRole>('cashier');
  const [stores, setStores] = useState<Store[]>(initialStores);
  // 스케줄 달력·매장 필터에는 활성 팝업 매장만 노출 (이름 조회·매장 관리 모달은 전체 stores 유지)
  const visibleStores = useMemo(() => filterVisibleStores(stores, initialPopups), [stores, initialPopups]);
  const [allShifts] = useState<RosterShift[]>(initialShifts);
  const storeManage = useModal();
  const [staffList, setStaffList] = useState<StaffProfile[]>(initialStaff);
  const [userProfiles] = useState<UserProfile[]>(initialUserProfiles);
  // 역할·매장·상태·검색 필터 + 컬럼 정렬
  const {
    roleFilter, setRoleFilter, storeFilter, setStoreFilter, statusFilter, setStatusFilter,
    search, setSearch, sortKey, sortDir, handleSort, roleStaff, statusCounts, filtered,
  } = useStaffFilters(staffList, allShifts);
  const form = useModal();
  const [editingStaff, setEditingStaff] = useState<StaffProfile | null>(null);

  // 우측 패널 탭
  const [rightTab, setRightTab] = useState<RightTab>('roster');

  // 드래그 리사이저
  const [leftWidth, setLeftWidth] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  const contract = useModal<StaffProfile>();
  const contractsList = useModal<StaffProfile>();
  const assigning = useModal<StaffProfile>();
  const calendar = useModal<StaffProfile>();
  const rosterPrint = useModal();

  // 계약서 작성완료 — 실제 contracts 테이블 존재 여부 기준
  const [completedContracts, setCompletedContracts] = useState<Set<number>>(() => new Set(initialContractedIds));
  const refreshContractedStaffIds = () => {
    fetchContractedStaffIds().then(res => {
      if (res.success && res.data) setCompletedContracts(new Set(res.data));
    });
  };
  // 계약서 탭 재조회 트리거 — 작성·삭제 시 좌측 배지와 함께 갱신
  const [contractsRefreshKey, setContractsRefreshKey] = useState(0);
  const refreshContracts = () => {
    refreshContractedStaffIds();
    setContractsRefreshKey(k => k + 1);
  };

  // 배정 후 캘린더 리프레시 트리거
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  // 근무자 순서 드래그
  const [draggingStaffId, setDraggingStaffId] = useState<number | null>(null);
  const [dragOverStaffId, setDragOverStaffId] = useState<number | null>(null);

  // pointer 이벤트 사용 — 마우스뿐 아니라 터치/펜으로도 리사이즈 가능
  const handleDividerPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    let dragging = true;
    const onPointerMove = (ev: PointerEvent) => {
      if (!dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = ev.clientX - rect.left;
      setLeftWidth(Math.max(260, Math.min(next, rect.width - 300)));
    };
    const onPointerUp = () => {
      dragging = false;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  }, []);

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
      <main className="min-h-screen p-3 md:p-5">
        <h1 className="m-0 text-[19px] font-extrabold mb-4">인사관리</h1>

        <div ref={containerRef} className="flex flex-col lg:flex-row items-stretch lg:items-start select-none gap-4 lg:gap-0">
          {/* 좌측: 직원 목록 — lg 미만에서는 전체 폭 세로 스택 */}
          <div className="flex flex-col shrink-0 min-w-0 w-full lg:w-[var(--left-w)]" style={{ '--left-w': `${leftWidth}px` } as React.CSSProperties}>
            {/* 주방/캐셔 + 등록 버튼 */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex rounded-xl overflow-hidden border border-hairline bg-canvas shadow-level-1">
                {(['all', 'cashier', 'kitchen'] as RoleFilter[]).map(r => (
                  <button
                    key={r}
                    onClick={() => { setRoleFilter(r); if (r !== 'all') setConcreteRole(r); setStoreFilter('all'); }}
                    className={`px-3 md:px-4 py-2 text-[13px] font-bold border-none cursor-pointer transition ${
                      roleFilter === r ? 'bg-ink text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
                    }`}
                  >
                    {r === 'all' ? '전체' : ROLE_LABELS[r]}
                    <span className={`ml-1 text-[11px] ${roleFilter === r ? 'opacity-70' : 'text-ink-faint'}`}>
                      {r === 'all' ? staffList.length : staffList.filter(s => s.staff_role === r).length}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setEditingStaff(null); form.open(); }}
                className="ml-auto px-3.5 py-2 rounded-xl border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition"
              >
                + 등록
              </button>
            </div>

            {/* 매장 필터 (캐셔) */}
            {roleFilter === 'cashier' && (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="flex rounded-xl overflow-hidden border border-hairline bg-canvas shadow-level-1 flex-wrap">
                  <button onClick={() => setStoreFilter('all')} className={`px-3 py-1.5 text-[12px] font-bold border-none cursor-pointer transition ${storeFilter === 'all' ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'}`}>전체</button>
                  {visibleStores.map(store => (
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
              <div className="flex flex-wrap rounded-xl overflow-hidden border border-hairline bg-canvas shadow-level-1">
                {(['all', 'candidate', 'confirmed', 'rejected', 'inactive'] as StatusFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-2.5 py-1.5 text-[12px] font-bold border-none cursor-pointer transition whitespace-nowrap ${
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
                className="px-3 py-1.5 border border-hairline rounded-xl text-[13px] bg-canvas shadow-level-1 focus:outline-none focus:border-primary-700 flex-1 min-w-[130px] max-w-[220px]"
              />
            </div>

            {/* 불합격 통지 폼 */}
            {statusFilter === 'rejected' && <RejectionNoticeBox />}

            {/* 직원 테이블 */}
            <div className="bg-canvas rounded-2xl border border-hairline shadow-level-1 overflow-hidden">
              {filtered.length === 0 ? (
                <p className="text-ink-faint text-sm p-6 text-center m-0">
                  {staffList.length === 0 ? '등록된 직원이 없습니다. 면접자 정보를 등록해보세요.' : '조건에 맞는 직원이 없습니다.'}
                </p>
              ) : (
                <>
                {/* md 이상: 테이블 (드래그 순서변경 포함) */}
                <div className="hidden md:block max-h-[calc(100dvh-280px)] overflow-y-auto overflow-x-auto">
                  <table className="w-full min-w-[540px] border-collapse text-[13px]">
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
                          onContractsList={() => contractsList.open(staff)}
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
                </div>
                {/* md 미만: 카드 리스트 (드래그 순서변경은 데스크톱 전용) */}
                <div className="md:hidden divide-y divide-hairline max-h-[calc(100dvh-280px)] overflow-y-auto">
                  {filtered.map(staff => (
                    <StaffCard
                      key={staff.id}
                      staff={staff}
                      shiftNames={staff.preferred_shift_ids.map(id => allShifts.find(s => s.id === id)?.name).filter(Boolean).join(' · ')}
                      store={stores.find(st => st.id === staff.store_id) ?? null}
                      contractDone={completedContracts.has(staff.id)}
                      onRowClick={() => { setEditingStaff(staff); form.open(); }}
                      onStatusChange={s => handleStatusChange(staff, s)}
                      onContract={() => contract.open(staff)}
                      onContractsList={() => contractsList.open(staff)}
                      onAssign={() => assigning.open(staff)}
                      onCalendar={() => calendar.open(staff)}
                    />
                  ))}
                </div>
                </>
              )}
            </div>
          </div>

          {/* 드래그 바 */}
          <div
            onPointerDown={handleDividerPointerDown}
            className="hidden lg:flex w-3 shrink-0 self-stretch cursor-col-resize items-center justify-center group touch-none"
          >
            <div className="w-0.5 h-12 rounded-full bg-hairline group-hover:bg-primary-400 transition-colors" />
          </div>

          {/* 우측: 탭 + 패널 */}
          <div className="flex-1 min-w-0 w-full lg:min-w-[300px] flex flex-col gap-3">
            {/* 우측 탭 + 근무표 인쇄 */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap rounded-xl overflow-hidden border border-hairline bg-canvas shadow-level-1 w-fit">
                {([['roster', '스케줄 달력'], ['payroll', '급여 정산'], ['contracts', '계약서']] as [RightTab, string][]).map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setRightTab(tab)}
                    className={`px-4 py-2 text-[13px] font-bold border-none cursor-pointer transition ${
                      rightTab === tab ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => rosterPrint.open()}
                className="px-3 py-2 rounded-xl bg-canvas border border-hairline text-[13px] font-bold text-ink-muted cursor-pointer hover:bg-canvas-soft transition shadow-level-1"
              >
                근무표 인쇄
              </button>
            </div>

            {rightTab === 'roster'
              ? <RosterCalendar staffList={staffList} stores={visibleStores} roleFilter={concreteRole} refreshSignal={calendarRefreshKey} initialData={initialRoster ?? undefined} />
              : rightTab === 'payroll'
                ? <PayrollPanel defaultRole={concreteRole} />
                : <ContractsPanel
                    staffList={staffList}
                    stores={stores}
                    refreshSignal={contractsRefreshKey}
                    onWriteContract={s => contract.open(s)}
                    onChanged={refreshContractedStaffIds}
                  />
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
          defaultRole={roleFilter === 'all' ? undefined : roleFilter}
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
          onComplete={refreshContracts}
        />
      )}

      {contractsList.value && (
        <StaffContractsListModal
          staffId={contractsList.value.id}
          name={contractsList.value.name}
          onClose={contractsList.close}
          onChange={refreshContracts}
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
