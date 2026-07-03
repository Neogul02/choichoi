'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { StaffProfile, StaffShift, StaffStatus, StaffRole, Store, AvailabilityRange } from '@/types/database';
import type { StaffProfileInput } from '@/app/actions/staff';
import type { UserProfile } from '@/app/actions/workers';
import { STATUS_LABELS, SHIFT_LABELS, DAY_NAMES, ROLE_LABELS } from './constants';

interface Props {
  staff: StaffProfile | null; // null = 신규 등록
  userProfiles: UserProfile[];
  stores: Store[];
  defaultRole?: StaffRole;    // 신규 등록 시 현재 보고 있는 구분을 기본값으로
  defaultStoreId?: number | null;
  onClose: () => void;
  onSubmit: (input: StaffProfileInput) => Promise<void>;
}

export default function StaffFormModal({ staff, userProfiles, stores, defaultRole, defaultStoreId, onClose, onSubmit }: Props) {
  const [name, setName] = useState(staff?.name ?? '');
  const [phone, setPhone] = useState(staff?.phone ?? '');
  const [staffRole, setStaffRole] = useState<StaffRole>(staff?.staff_role ?? defaultRole ?? 'cashier');
  const [storeId, setStoreId] = useState<number | null>(staff?.store_id ?? defaultStoreId ?? null);
  const [shift, setShift] = useState<StaffShift>(staff?.preferred_shift ?? 'ANY');
  const [days, setDays] = useState<number[]>(staff?.preferred_days ?? []);
  const [ranges, setRanges] = useState<AvailabilityRange[]>(staff?.available_ranges ?? []);
  const [hasHealthCert, setHasHealthCert] = useState(staff?.has_health_cert ?? false);
  const [wantsInsurance, setWantsInsurance] = useState(staff?.wants_insurance ?? true);
  const [hourlyRate, setHourlyRate] = useState(staff?.hourly_rate?.toString() ?? '');
  const [maxDaysPerWeek, setMaxDaysPerWeek] = useState<number | null>(staff?.max_days_per_week ?? null);
  const [status, setStatus] = useState<StaffStatus>(staff?.status ?? 'candidate');
  const [notes, setNotes] = useState(staff?.notes ?? '');
  const [userProfileId, setUserProfileId] = useState(staff?.user_profile_id ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const toggleDay = (d: number) =>
    setDays(p => p.includes(d) ? p.filter(v => v !== d) : [...p, d].sort());

  // 계정 연결 시 비어 있는 이름/전화번호를 프로필에서 자동으로 채운다
  const handleProfileLink = (id: string) => {
    setUserProfileId(id);
    if (!id) return;
    const p = userProfiles.find(u => u.id === id);
    if (!p) return;
    if (!name.trim()) setName(p.name);
    if (!phone.trim() && p.phone) setPhone(p.phone);
  };

  const updateRange = (i: number, patch: Partial<AvailabilityRange>) =>
    setRanges(p => p.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const handleSubmit = async () => {
    if (!name.trim()) return;
    const validRanges = ranges.filter(r => r.from && r.to && r.from <= r.to);
    setIsSaving(true);
    await onSubmit({
      name,
      phone: phone || null,
      staff_role: staffRole,
      store_id: staffRole === 'cashier' ? storeId : null,
      preferred_shift: shift,
      preferred_days: days,
      available_ranges: validRanges,
      has_health_cert: hasHealthCert,
      wants_insurance: wantsInsurance,
      hourly_rate: hourlyRate ? Number(hourlyRate) : null,
      max_days_per_week: maxDaysPerWeek,
      status,
      notes: notes || null,
      user_profile_id: userProfileId || null,
    });
    setIsSaving(false);
  };

  const inputCls = 'w-full px-3 py-2 border border-hairline rounded-lg text-[13px] bg-canvas focus:outline-none focus:border-primary-700';
  const labelCls = 'text-[11px] font-semibold text-ink-muted';
  const chipCls = (active: boolean) =>
    `px-3 py-1.5 rounded-lg border text-[12px] font-bold cursor-pointer transition ${
      active ? 'bg-primary-700 text-white border-primary-700' : 'bg-canvas text-ink-muted border-hairline hover:border-primary-400'
    }`;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-canvas w-full max-w-[480px] max-h-[90vh] overflow-y-auto rounded-xl shadow-level-2 border border-hairline p-5 [scrollbar-width:thin]">
        <h3 className="m-0 mb-4 text-[16px] font-bold text-ink">
          {staff ? '직원 정보 수정' : '직원 등록'}
        </h3>

        <div className="flex flex-col gap-3.5">
          {/* 기본 정보 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>이름 *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="이름" className={inputCls} autoFocus />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>전화번호</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-0000-0000" className={inputCls} />
            </div>
          </div>

          {/* 구분 + 매장 */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>구분</label>
            <div className="flex gap-1.5">
              {(Object.keys(ROLE_LABELS) as StaffRole[]).map(r => (
                <button key={r} type="button" className={chipCls(staffRole === r)} onClick={() => setStaffRole(r)}>
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          {staffRole === 'cashier' && (
            <div className="flex flex-col gap-1">
              <label className={labelCls}>매장 <span className="text-ink-faint font-normal">(미배정이면 스케줄 달력에 안 나옴)</span></label>
              <select
                value={storeId ?? ''}
                onChange={e => setStoreId(e.target.value ? Number(e.target.value) : null)}
                className={inputCls}
              >
                <option value="">미배정</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* 상태 */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>상태</label>
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(STATUS_LABELS) as StaffStatus[]).map(s => (
                <button key={s} type="button" className={chipCls(status === s)} onClick={() => setStatus(s)}>
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* 선호 파트 */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>선호 파트</label>
            <div className="flex gap-1.5">
              {(Object.keys(SHIFT_LABELS) as StaffShift[]).map(s => (
                <button key={s} type="button" className={chipCls(shift === s)} onClick={() => setShift(s)}>
                  {SHIFT_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* 선호 요일 */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>선호 요일 <span className="text-ink-faint font-normal">(비워두면 요일 무관)</span></label>
            <div className="flex gap-1">
              {DAY_NAMES.map((d, i) => (
                <button
                  key={i} type="button" onClick={() => toggleDay(i)}
                  className={`w-9 h-9 rounded-lg border text-[12px] font-bold cursor-pointer transition ${
                    days.includes(i)
                      ? 'bg-primary-700 text-white border-primary-700'
                      : `bg-canvas border-hairline hover:border-primary-400 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-ink-muted'}`
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* 주 최대 근무일 */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>주 최대 근무일 <span className="text-ink-faint font-normal">(자동 배정 시 이 이상 배정하지 않음)</span></label>
            <div className="flex gap-1 flex-wrap">
              <button type="button" className={chipCls(maxDaysPerWeek === null)} onClick={() => setMaxDaysPerWeek(null)}>무제한</button>
              {[1, 2, 3, 4, 5, 6].map(n => (
                <button key={n} type="button" className={chipCls(maxDaysPerWeek === n)} onClick={() => setMaxDaysPerWeek(n)}>
                  {n}일
                </button>
              ))}
            </div>
          </div>

          {/* 가용 기간 */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className={labelCls}>가용 기간 <span className="text-ink-faint font-normal">(비워두면 기간 무관)</span></label>
              <button
                type="button"
                onClick={() => setRanges(p => [...p, { from: '', to: '' }])}
                className="text-[11px] text-primary-600 font-bold bg-transparent border-none cursor-pointer hover:text-primary-800 transition"
              >
                + 기간 추가
              </button>
            </div>
            {ranges.length === 0 ? (
              <p className="m-0 text-[12px] text-ink-faint">등록된 기간 없음 — 항상 가능</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {ranges.map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input type="date" value={r.from} onChange={e => updateRange(i, { from: e.target.value })} className={inputCls} />
                    <span className="text-ink-faint text-[12px] shrink-0">~</span>
                    <input type="date" value={r.to} onChange={e => updateRange(i, { to: e.target.value })} className={inputCls} />
                    <button
                      type="button"
                      onClick={() => setRanges(p => p.filter((_, idx) => idx !== i))}
                      className="shrink-0 w-7 h-7 rounded-lg bg-canvas-soft border-none text-ink-faint cursor-pointer hover:bg-rose-50 hover:text-rose-500 transition text-[14px]"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 보건증 / 4대보험 / 시급 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>보건증</label>
              <div className="flex gap-1.5">
                <button type="button" className={chipCls(hasHealthCert)} onClick={() => setHasHealthCert(true)}>보유</button>
                <button type="button" className={chipCls(!hasHealthCert)} onClick={() => setHasHealthCert(false)}>미보유</button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>4대보험</label>
              <div className="flex gap-1.5">
                <button type="button" className={chipCls(wantsInsurance)} onClick={() => setWantsInsurance(true)}>가입</button>
                <button type="button" className={chipCls(!wantsInsurance)} onClick={() => setWantsInsurance(false)}>미가입</button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>시급 (원)</label>
              <input type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="10,030" className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>계정 연결 <span className="text-ink-faint font-normal">(가입된 근무자)</span></label>
              <select value={userProfileId} onChange={e => handleProfileLink(e.target.value)} className={inputCls}>
                <option value="">연결 안 함</option>
                {userProfiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.phone ? ` (${p.phone})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 메모 */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>메모</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="면접 내용, 맛보기 일정, 특이사항 등"
              className={`${inputCls} resize-y`}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button" onClick={onClose} disabled={isSaving}
              className="flex-1 py-2.5 rounded-lg border border-hairline bg-canvas-soft text-ink-secondary text-[13px] font-semibold cursor-pointer hover:bg-[#ececec] transition disabled:opacity-60"
            >
              취소
            </button>
            <button
              type="button" onClick={handleSubmit} disabled={isSaving || !name.trim()}
              className="flex-1 py-2.5 rounded-lg border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? '저장 중...' : staff ? '저장' : '등록'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
