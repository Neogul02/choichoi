'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import ConfirmDialog from '@/components/ConfirmDialog';
import type { StaffProfile, StaffStatus, StaffRole, Store, RosterShift, AvailabilityRange } from '@/types/database';
import type { StaffProfileInput } from '@/app/actions/staff';
import { uploadHealthCert, getHealthCertUrl } from '@/app/actions/staff';
import type { UserProfile } from '@/app/actions/workers';
import { fetchRosterShifts } from '@/app/actions/roster';
import { STATUS_LABELS, DAY_NAMES, ROLE_LABELS } from './constants';

interface Props {
  staff: StaffProfile | null;
  userProfiles: UserProfile[];
  stores: Store[];
  defaultRole?: StaffRole;
  defaultStoreId?: number | null;
  onClose: () => void;
  onSubmit: (input: StaffProfileInput) => Promise<void>;
  onDelete?: () => void;
  onHealthCertUploaded?: (staffId: number, path: string) => void;
}

export default function StaffFormModal({
  staff, userProfiles, stores, defaultRole, defaultStoreId,
  onClose, onSubmit, onDelete, onHealthCertUploaded,
}: Props) {
  useBodyScrollLock();
  const [name, setName] = useState(staff?.name ?? '');
  const [phone, setPhone] = useState(staff?.phone ?? '');
  const [bankName, setBankName] = useState(staff?.bank_name ?? '');
  const [bankAccount, setBankAccount] = useState(staff?.bank_account ?? '');
  const [staffRole, setStaffRole] = useState<StaffRole>(staff?.staff_role ?? defaultRole ?? 'cashier');
  const [storeId, setStoreId] = useState<number | null>(staff?.store_id ?? defaultStoreId ?? null);
  const [shiftIds, setShiftIds] = useState<number[]>(staff?.preferred_shift_ids ?? []);
  const [unitShifts, setUnitShifts] = useState<RosterShift[] | null>(null);
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

  // 보건증 파일
  const [certPath, setCertPath] = useState<string | null>(staff?.health_cert_url ?? null);
  const [isUploadingCert, setIsUploadingCert] = useState(false);
  const [isViewingCert, setIsViewingCert] = useState(false);
  const certInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && !showDeleteConfirm) onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, showDeleteConfirm]);

  useEffect(() => {
    if (staffRole === 'cashier' && storeId === null) { setUnitShifts([]); return; }
    setUnitShifts(null);
    fetchRosterShifts({ staffRole, storeId: staffRole === 'kitchen' ? null : storeId })
      .then(r => setUnitShifts(r.success && r.data ? r.data : []));
  }, [staffRole, storeId]);

  const toggleDay = (d: number) =>
    setDays(p => p.includes(d) ? p.filter(v => v !== d) : [...p, d].sort());

  const toggleShift = (id: number) =>
    setShiftIds(p => p.includes(id) ? p.filter(v => v !== id) : [...p, id]);

  const handleProfileLink = (id: string) => {
    setUserProfileId(id);
    if (!id) return;
    const p = userProfiles.find(u => u.id === id);
    if (!p) return;
    setName(p.name);
    if (p.phone) setPhone(p.phone);
    if (p.bank_name) setBankName(p.bank_name);
    if (p.bank_account) setBankAccount(p.bank_account);
  };

  const updateRange = (i: number, patch: Partial<AvailabilityRange>) =>
    setRanges(p => p.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const handleSubmit = async () => {
    if (!name.trim()) return;
    const validRanges = ranges.filter(r => r.from && r.to && r.from <= r.to);
    setIsSaving(true);
    await onSubmit({
      name, phone: phone || null,
      bank_name: bankName || null, bank_account: bankAccount || null,
      staff_role: staffRole,
      store_id: staffRole === 'cashier' ? storeId : null,
      preferred_shift_ids: shiftIds.filter(id => (unitShifts ?? []).some(s => s.id === id)),
      preferred_days: days, available_ranges: validRanges,
      has_health_cert: hasHealthCert, health_cert_url: certPath,
      wants_insurance: wantsInsurance,
      hourly_rate: hourlyRate ? Number(hourlyRate) : null,
      max_days_per_week: maxDaysPerWeek, status,
      notes: notes || null, user_profile_id: userProfileId || null,
    });
    setIsSaving(false);
  };

  const handleCertUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !staff) return;
    const fd = new FormData();
    fd.append('file', file);
    setIsUploadingCert(true);
    const res = await uploadHealthCert(staff.id, fd);
    setIsUploadingCert(false);
    if (res.success && res.data) {
      const path = `staff/${staff.id}/health_cert.${file.name.split('.').pop() ?? 'jpg'}`;
      setCertPath(path);
      setHasHealthCert(true);
      onHealthCertUploaded?.(staff.id, path);
    }
    if (certInputRef.current) certInputRef.current.value = '';
  };

  const handleViewCert = async () => {
    if (!certPath) return;
    setIsViewingCert(true);
    const res = await getHealthCertUrl(certPath);
    setIsViewingCert(false);
    if (res.success && res.data) window.open(res.data.url, '_blank');
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    setShowDeleteConfirm(false);
    onDelete?.();
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
      <div
        role="dialog"
        aria-modal="true"
        className="bg-canvas w-full max-w-[480px] max-h-[90vh] overflow-y-auto rounded-xl shadow-level-2 border border-hairline p-5 [scrollbar-width:thin]"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="m-0 text-[16px] font-bold text-ink">
            {staff ? '직원 정보 수정' : '직원 등록'}
          </h3>
          <button onClick={onClose} aria-label="닫기" className="bg-transparent border-none text-ink-faint text-lg cursor-pointer leading-none hover:text-ink transition">×</button>
        </div>

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
            <div className="flex flex-col gap-1">
              <label className={labelCls}>은행명</label>
              <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="국민은행" className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>계좌번호</label>
              <input type="text" value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="000-0000-0000-00" className={inputCls} />
            </div>
          </div>

          {/* 구분 */}
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
              <select value={storeId ?? ''} onChange={e => setStoreId(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
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
            <label className={labelCls}>선호 파트 <span className="text-ink-faint font-normal">(선택 안 하면 모든 파트 가능)</span></label>
            {staffRole === 'cashier' && storeId === null ? (
              <p className="m-0 text-[12px] text-ink-faint">매장을 먼저 선택하면 파트를 고를 수 있습니다.</p>
            ) : unitShifts === null ? (
              <p className="m-0 text-[12px] text-ink-faint">파트 불러오는 중...</p>
            ) : (
              <div className="flex gap-1.5 flex-wrap">
                {unitShifts.map(s => (
                  <button key={s.id} type="button" className={chipCls(shiftIds.includes(s.id))} onClick={() => toggleShift(s.id)}>
                    {s.name} <span className="font-normal opacity-70">{s.start_time}~{s.end_time}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 선호 요일 */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>선호 요일 <span className="text-ink-faint font-normal">(비워두면 요일 무관)</span></label>
            {/* 빠른 선택 프리셋 */}
            <div className="flex gap-1 mb-1">
              {([['일월화수', [0,1,2,3]], ['목금토', [4,5,6]]] as [string, number[]][]).map(([label, preset]) => {
                const active = preset.length === days.length && preset.every(d => days.includes(d));
                return (
                  <button key={label} type="button" onClick={() => setDays(active ? [] : preset)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition ${
                      active ? 'bg-primary-700 text-white border-primary-700' : 'bg-canvas border-hairline text-ink-muted hover:border-primary-400'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
              {days.length > 0 && (
                <button type="button" onClick={() => setDays([])}
                  className="px-2.5 py-1 rounded-lg border border-hairline bg-canvas text-[11px] text-ink-faint cursor-pointer hover:text-ink transition"
                >
                  초기화
                </button>
              )}
            </div>
            <div className="flex gap-1">
              {DAY_NAMES.map((d, i) => (
                <button key={i} type="button" onClick={() => toggleDay(i)}
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
                <button key={n} type="button" className={chipCls(maxDaysPerWeek === n)} onClick={() => setMaxDaysPerWeek(n)}>{n}일</button>
              ))}
            </div>
          </div>

          {/* 가용 기간 */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className={labelCls}>가용 기간 <span className="text-ink-faint font-normal">(비워두면 기간 무관)</span></label>
              <button type="button" onClick={() => setRanges(p => [...p, { from: '', to: '' }])}
                className="text-[11px] text-primary-600 font-bold bg-transparent border-none cursor-pointer hover:text-primary-800 transition">
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
                    <button type="button" onClick={() => setRanges(p => p.filter((_, idx) => idx !== i))}
                      className="shrink-0 w-7 h-7 rounded-lg bg-canvas-soft border-none text-ink-faint cursor-pointer hover:bg-rose-50 hover:text-rose-500 transition text-[14px]">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 보건증 / 4대보험 */}
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

          {/* 보건증 파일 — 기존 직원만 */}
          {staff && (
            <div className="flex flex-col gap-1">
              <label className={labelCls}>보건증 파일</label>
              <div className="flex items-center gap-2 flex-wrap">
                {certPath ? (
                  <button type="button" onClick={handleViewCert} disabled={isViewingCert}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer transition disabled:opacity-50">
                    {isViewingCert ? '로딩...' : '보건증 보기 ↗'}
                  </button>
                ) : (
                  <span className="text-[12px] text-ink-faint">파일 없음</span>
                )}
                <label className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border cursor-pointer transition ${
                  isUploadingCert ? 'opacity-50 cursor-not-allowed bg-canvas-soft border-hairline text-ink-muted' : 'bg-canvas border-hairline text-ink-muted hover:bg-canvas-soft'
                }`}>
                  {isUploadingCert ? '업로드 중...' : certPath ? '재업로드' : '파일 업로드'}
                  <input ref={certInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleCertUpload} disabled={isUploadingCert} />
                </label>
              </div>
            </div>
          )}

          {/* 시급 / 계정 연결 */}
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
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="면접 내용, 맛보기 일정, 특이사항 등"
              className={`${inputCls} resize-y`}
            />
          </div>

          {/* 액션 버튼 */}
          <div className="flex gap-2 pt-1">
            {onDelete && (
              <button type="button" onClick={handleDelete} disabled={isSaving}
                className="px-4 py-2.5 rounded-lg border-none bg-rose-500 text-white text-[13px] font-bold cursor-pointer hover:bg-rose-600 transition disabled:opacity-60">
                삭제
              </button>
            )}
            <button type="button" onClick={onClose} disabled={isSaving}
              className="flex-1 py-2.5 rounded-lg border border-hairline bg-canvas-soft text-ink-secondary text-[13px] font-semibold cursor-pointer hover:bg-[#ececec] transition disabled:opacity-60">
              취소
            </button>
            <button type="button" onClick={handleSubmit} disabled={isSaving || !name.trim()}
              className="flex-1 py-2.5 rounded-lg border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-60 disabled:cursor-not-allowed">
              {isSaving ? '저장 중...' : staff ? '저장' : '등록'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title={`"${staff?.name}" 정보를 삭제하시겠습니까?`}
        confirmLabel="삭제"
        danger
        onConfirm={confirmDelete}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </div>,
    document.body,
  );
}
