'use client';

import { useEffect, useMemo, useState } from 'react';
import NavBar from '@/components/NavBar';
import { showMsg } from '@/lib/toast';
import {
  fetchStaffProfiles, createStaffProfile, updateStaffProfile,
  updateStaffStatus, deleteStaffProfile,
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
import { STATUS_LABELS, STATUS_COLORS, DAY_NAMES, ROLE_LABELS, formatRanges } from './_components/constants';

type StatusFilter = StaffStatus | 'all';
type StoreFilter = number | 'all' | 'none'; // none = 매장 미배정
type MainTab = 'staff' | 'roster';

export default function HrPage() {
  const [mainTab, setMainTab] = useState<MainTab>('staff');
  const [roleFilter, setRoleFilter] = useState<StaffRole>('cashier');
  const [storeFilter, setStoreFilter] = useState<StoreFilter>('all');
  const [stores, setStores] = useState<Store[]>([]);
  const [allShifts, setAllShifts] = useState<RosterShift[]>([]);
  const [showStoreManage, setShowStoreManage] = useState(false);
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffProfile | null>(null);

  useEffect(() => {
    Promise.all([fetchStaffProfiles(), fetchAllUserProfiles(), fetchStores(), fetchAllRosterShifts()]).then(([staffRes, profileRes, storesRes, shiftsRes]) => {
      if (staffRes.success && staffRes.data) setStaffList(staffRes.data);
      if (profileRes.success && profileRes.data) setUserProfiles(profileRes.data);
      if (storesRes.success && storesRes.data) setStores(storesRes.data);
      if (shiftsRes.success && shiftsRes.data) setAllShifts(shiftsRes.data);
      setIsLoading(false);
    });
  }, []);

  // 현재 구분(주방/캐셔)의 직원만
  const roleStaff = useMemo(() => staffList.filter(s => s.staff_role === roleFilter), [staffList, roleFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: roleStaff.length, candidate: 0, confirmed: 0, rejected: 0, inactive: 0 };
    for (const s of roleStaff) counts[s.status]++;
    return counts;
  }, [roleStaff]);

  const filtered = useMemo(() => roleStaff.filter(s => {
    if (roleFilter === 'cashier' && storeFilter !== 'all') {
      if (storeFilter === 'none' ? s.store_id !== null : s.store_id !== storeFilter) return false;
    }
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (search.trim() && !s.name.includes(search.trim()) && !(s.phone ?? '').includes(search.trim())) return false;
    return true;
  }), [roleStaff, roleFilter, storeFilter, statusFilter, search]);

  const handleSubmit = async (input: StaffProfileInput) => {
    if (editingStaff) {
      const r = await updateStaffProfile(editingStaff.id, input);
      if (r.success && r.data) {
        setStaffList(p => p.map(s => s.id === editingStaff.id ? r.data! : s));
        showMsg('수정되었습니다');
        setShowForm(false); setEditingStaff(null);
      } else showMsg(`오류: ${r.error}`);
    } else {
      const r = await createStaffProfile(input);
      if (r.success && r.data) {
        setStaffList(p => [r.data!, ...p]);
        showMsg(`${input.name} 등록됨`);
        setShowForm(false);
      } else showMsg(`오류: ${r.error}`);
    }
  };

  const handleStatusChange = async (staff: StaffProfile, status: StaffStatus) => {
    const r = await updateStaffStatus(staff.id, status);
    if (r.success && r.data) setStaffList(p => p.map(s => s.id === staff.id ? r.data! : s));
    else showMsg(`오류: ${r.error}`);
  };

  const handleDelete = async (staff: StaffProfile) => {
    if (!confirm(`"${staff.name}" 정보를 삭제하시겠습니까?`)) return;
    const r = await deleteStaffProfile(staff.id);
    if (r.success) { setStaffList(p => p.filter(s => s.id !== staff.id)); showMsg('삭제되었습니다'); }
    else showMsg(`오류: ${r.error}`);
  };

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1400px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="m-0 text-lg font-extrabold">인사관리</h1>
            <div className="flex rounded-xl overflow-hidden border border-hairline bg-canvas shadow-level-1">
              {(['staff', 'roster'] as MainTab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setMainTab(t)}
                  className={`px-4 py-2 text-[12px] font-bold border-none cursor-pointer transition ${
                    mainTab === t ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
                  }`}
                >
                  {t === 'staff' ? '직원 관리' : '스케줄 달력'}
                </button>
              ))}
            </div>
          </div>
          {mainTab === 'staff' && (
            <button
              onClick={() => { setEditingStaff(null); setShowForm(true); }}
              className="px-4 py-2 rounded-lg border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition"
            >
              + 직원 등록
            </button>
          )}
        </div>

        {mainTab === 'roster' ? (
          <RosterCalendar staffList={staffList} stores={stores} />
        ) : (
          <>
        {/* 구분 (주방/캐셔) + 매장 */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
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

          {roleFilter === 'cashier' && (
            <>
              <div className="flex rounded-xl overflow-hidden border border-hairline bg-canvas shadow-level-1 flex-wrap">
                <button
                  onClick={() => setStoreFilter('all')}
                  className={`px-3 py-2 text-[12px] font-bold border-none cursor-pointer transition ${
                    storeFilter === 'all' ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
                  }`}
                >
                  전체 매장
                </button>
                {stores.map(store => (
                  <button
                    key={store.id}
                    onClick={() => setStoreFilter(store.id)}
                    className={`px-3 py-2 text-[12px] font-bold border-none cursor-pointer transition whitespace-nowrap ${
                      storeFilter === store.id ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
                    }`}
                  >
                    {store.name}
                  </button>
                ))}
                {roleStaff.some(s => s.store_id === null) && (
                  <button
                    onClick={() => setStoreFilter('none')}
                    className={`px-3 py-2 text-[12px] font-bold border-none cursor-pointer transition ${
                      storeFilter === 'none' ? 'bg-amber-500 text-white' : 'bg-canvas text-amber-600 hover:bg-amber-50'
                    }`}
                  >
                    미배정 {roleStaff.filter(s => s.store_id === null).length}
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowStoreManage(true)}
                className="px-3 py-2 rounded-xl bg-canvas-soft border border-hairline text-[12px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition"
              >
                ⚙ 매장 관리
              </button>
            </>
          )}
        </div>

        {/* 필터 */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex rounded-xl overflow-hidden border border-hairline bg-canvas shadow-level-1">
            {(['all', 'candidate', 'confirmed', 'rejected', 'inactive'] as StatusFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-2 text-[12px] font-bold border-none cursor-pointer transition whitespace-nowrap ${
                  statusFilter === f ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
                }`}
              >
                {f === 'all' ? '전체' : STATUS_LABELS[f]}
                <span className={`ml-1 ${statusFilter === f ? 'opacity-70' : 'text-ink-faint'}`}>{statusCounts[f]}</span>
              </button>
            ))}
          </div>

          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="이름/전화번호 검색"
            className="px-3 py-2 border border-hairline rounded-xl text-[12px] bg-canvas shadow-level-1 focus:outline-none focus:border-primary-700 w-[160px]"
          />
        </div>

        {/* 카드 그리드 */}
        {isLoading ? (
          <p className="text-ink-faint text-sm">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-canvas rounded-xl p-8 text-center border border-hairline shadow-level-1">
            <p className="m-0 text-ink-faint text-sm">
              {staffList.length === 0 ? '등록된 직원이 없습니다. 면접자 정보를 등록해보세요.' : '조건에 맞는 직원이 없습니다.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(staff => (
              <StaffCard
                key={staff.id}
                staff={staff}
                shiftNames={staff.preferred_shift_ids.map(id => allShifts.find(s => s.id === id)?.name).filter(Boolean).join(', ')}
                store={stores.find(st => st.id === staff.store_id) ?? null}
                linkedProfile={userProfiles.find(p => p.id === staff.user_profile_id) ?? null}
                onEdit={() => { setEditingStaff(staff); setShowForm(true); }}
                onDelete={() => handleDelete(staff)}
                onStatusChange={s => handleStatusChange(staff, s)}
              />
            ))}
          </div>
        )}
          </>
        )}
      </main>

      {showStoreManage && (
        <StoreManageModal
          stores={stores}
          onStoresChange={setStores}
          onClose={() => setShowStoreManage(false)}
        />
      )}

      {showForm && (
        <StaffFormModal
          staff={editingStaff}
          userProfiles={userProfiles}
          stores={stores}
          defaultRole={roleFilter}
          defaultStoreId={typeof storeFilter === 'number' ? storeFilter : null}
          onClose={() => { setShowForm(false); setEditingStaff(null); }}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}

function StaffCard({ staff, shiftNames, store, linkedProfile, onEdit, onDelete, onStatusChange }: {
  staff: StaffProfile;
  shiftNames: string;
  store: Store | null;
  linkedProfile: UserProfile | null;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: StaffStatus) => void;
}) {
  const sc = STATUS_COLORS[staff.status];

  return (
    <div className="bg-canvas rounded-xl p-4 border border-hairline shadow-level-1 flex flex-col gap-2.5">
      {/* 헤더: 이름 + 상태 + 액션 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <strong className="text-[15px] font-extrabold text-ink">{staff.name}</strong>
            <select
              value={staff.status}
              onChange={e => onStatusChange(e.target.value as StaffStatus)}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border cursor-pointer appearance-none ${sc.bg} ${sc.text} ${sc.border}`}
            >
              {(Object.keys(STATUS_LABELS) as StaffStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            {staff.staff_role === 'cashier' && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                store ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-amber-50 text-amber-600 border-amber-200'
              }`}>
                {store ? store.name : '매장 미배정'}
              </span>
            )}
            {linkedProfile && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-200">
                계정 연결
              </span>
            )}
          </div>
          {staff.phone && (
            <a href={`tel:${staff.phone}`} className="text-[12px] text-ink-muted no-underline hover:text-primary-700 transition">
              {staff.phone}
            </a>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onEdit} title="수정"
            className="bg-transparent border-none text-ink-faint cursor-pointer p-1 hover:text-primary-700 transition"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button
            onClick={onDelete} title="삭제"
            className="bg-transparent border-none text-ink-faint text-[16px] cursor-pointer leading-none p-1 hover:text-rose-500 transition"
          >
            ×
          </button>
        </div>
      </div>

      {/* 근무 조건 */}
      <div className="flex flex-col gap-1.5 text-[12px]">
        <div className="flex items-center gap-2">
          <span className="text-ink-faint w-[52px] shrink-0">파트</span>
          <span className="text-ink font-bold">
            {staff.preferred_shift_ids.length === 0 ? '무관' : shiftNames || '무관'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-ink-faint w-[52px] shrink-0">요일</span>
          <span className="text-ink">
            {staff.preferred_days.length === 0
              ? '무관'
              : staff.preferred_days.map(d => DAY_NAMES[d]).join(' ')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-ink-faint w-[52px] shrink-0">가용 기간</span>
          <span className="text-ink">
            {staff.available_ranges.length === 0 ? '무관' : formatRanges(staff.available_ranges)}
          </span>
        </div>
        {staff.max_days_per_week != null && (
          <div className="flex items-center gap-2">
            <span className="text-ink-faint w-[52px] shrink-0">주 최대</span>
            <span className="text-ink font-semibold">{staff.max_days_per_week}일</span>
          </div>
        )}
        {staff.hourly_rate != null && staff.hourly_rate > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-ink-faint w-[52px] shrink-0">시급</span>
            <span className="text-ink font-semibold">{staff.hourly_rate.toLocaleString('ko-KR')}원</span>
          </div>
        )}
      </div>

      {/* 배지 */}
      <div className="flex gap-1.5 flex-wrap">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
          staff.has_health_cert ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          보건증 {staff.has_health_cert ? '보유' : '미보유'}
        </span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
          staff.wants_insurance ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-gray-100 text-gray-500 border-gray-200'
        }`}>
          4대보험 {staff.wants_insurance ? '가입' : '미가입'}
        </span>
      </div>

      {/* 메모 */}
      {staff.notes && (
        <p className="m-0 text-[11px] text-ink-muted bg-canvas-soft rounded-lg px-2.5 py-2 whitespace-pre-wrap break-words">
          {staff.notes}
        </p>
      )}
    </div>
  );
}
