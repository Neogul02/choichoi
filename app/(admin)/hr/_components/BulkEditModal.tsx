'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { showMsg } from '@/lib/toast';
import { moveStaffAssignments, clearStaffAssignments, swapStaffAssignments } from '@/app/actions/roster';
import type { RosterUnit, RosterUndoPayload } from '@/app/actions/roster';
import type { RosterAssignment, RosterShift, StaffProfile } from '@/types/database';

interface Props {
  unit: RosterUnit;
  unitLabel: string;
  shifts: RosterShift[];
  staffList: StaffProfile[];
  /** 현재 로드된 월의 배정 전체 — 미리보기 건수 계산용 */
  assignments: RosterAssignment[];
  defaultFrom: string;
  defaultTo: string;
  monthStart: string;
  monthEnd: string;
  todayStr: string;
  /** 적용 후 캘린더 재로드 */
  onApplied: () => Promise<void>;
  /** 되돌리기 배너 표시 (부모가 10초간 제공) */
  onUndoable: (label: string, payload: RosterUndoPayload) => void;
  onClose: () => void;
}

export default function BulkEditModal({
  unit, unitLabel, shifts, staffList, assignments,
  defaultFrom, defaultTo, monthStart, monthEnd, todayStr, onApplied, onUndoable, onClose,
}: Props) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [mode, setMode] = useState<'move' | 'clear' | 'swap'>(shifts.length >= 2 ? 'move' : 'clear');
  const [fromShiftId, setFromShiftId] = useState<number | null>(null);
  const [toShiftId, setToShiftId] = useState<number | null>(null);
  const [clearShiftId, setClearShiftId] = useState<number | null>(null); // null = 전체 파트
  const [swapTargetId, setSwapTargetId] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // 기간 내 배정 (기간이 뒤집히면 빈 목록)
  const inRange = useMemo(
    () => (from && to && from <= to) ? assignments.filter(a => a.work_date >= from && a.work_date <= to) : [],
    [assignments, from, to],
  );

  // 기간 내 근무자별 배정 건수
  const countByStaff = useMemo(() => {
    const counts = new Map<number, number>();
    for (const a of inRange) counts.set(a.staff_id, (counts.get(a.staff_id) ?? 0) + 1);
    return counts;
  }, [inRange]);

  // 기간 내 배정이 있는 근무자만 선택지로 (건수 포함)
  const staffOptions = useMemo(() => {
    const nameOf = (id: number) =>
      staffList.find(s => s.id === id)?.name
      ?? inRange.find(a => a.staff_id === id)?.staff_profiles?.name
      ?? `#${id}`;
    return [...countByStaff.entries()]
      .map(([id, count]) => ({ id, count, name: nameOf(id) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [countByStaff, inRange, staffList]);

  const staffAssignments = useMemo(
    () => inRange.filter(a => a.staff_id === staffId),
    [inRange, staffId],
  );
  const shiftCount = (id: number) => staffAssignments.filter(a => a.shift_id === id).length;

  // 이동 미리보기 — 대상 파트에 이미 배정된 날은 원본만 제거됨(merge)
  const movePreview = useMemo(() => {
    if (fromShiftId === null || toShiftId === null || fromShiftId === toShiftId) return null;
    const source = staffAssignments.filter(a => a.shift_id === fromShiftId);
    const targetDates = new Set(staffAssignments.filter(a => a.shift_id === toShiftId).map(a => a.work_date));
    const merged = source.filter(a => targetDates.has(a.work_date)).length;
    return { total: source.length, moved: source.length - merged, merged };
  }, [staffAssignments, fromShiftId, toShiftId]);

  const clearCount = clearShiftId === null ? staffAssignments.length : shiftCount(clearShiftId);
  const staffName = staffOptions.find(o => o.id === staffId)?.name ?? '';

  // 교환 상대 후보: 단위 소속 재직자 전체 (배정 0건이어도 "넘겨주기"로 유효)
  const swapTargetOptions = useMemo(() => staffList
    .filter(s => s.id !== staffId && (s.status === 'confirmed' || s.status === 'candidate'))
    .map(s => ({ id: s.id, name: s.name, count: countByStaff.get(s.id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko')), [staffList, staffId, countByStaff]);
  const swapTargetName = swapTargetOptions.find(o => o.id === swapTargetId)?.name ?? '';

  // 교환 미리보기 — 같은 날 같은 파트에 둘 다 배정된 슬롯은 교환해도 동일하므로 제외
  const swapPreview = useMemo(() => {
    if (staffId === null || swapTargetId === null) return null;
    const slotKey = (a: RosterAssignment) => `${a.work_date}|${a.shift_id}`;
    const aList = inRange.filter(a => a.staff_id === staffId);
    const bList = inRange.filter(a => a.staff_id === swapTargetId);
    const aKeys = new Set(aList.map(slotKey));
    const bKeys = new Set(bList.map(slotKey));
    const aSwap = aList.filter(a => !bKeys.has(slotKey(a))).length;
    const bSwap = bList.filter(a => !aKeys.has(slotKey(a))).length;
    return { total: aSwap + bSwap, aSwap, bSwap };
  }, [inRange, staffId, swapTargetId]);
  const shiftName = (id: number | null) => shifts.find(s => s.id === id)?.name ?? '';
  const hasPastDates = from < todayStr;

  const handleStaffChange = (id: number | null) => {
    setStaffId(id);
    setFromShiftId(null);
    setToShiftId(null);
    setClearShiftId(null);
    setSwapTargetId(null);
  };

  const rangeLabel = `${from.slice(5).replace('-', '/')} ~ ${to.slice(5).replace('-', '/')}`;

  const handleApply = async () => {
    if (staffId === null) { showMsg('근무자를 선택하세요'); return; }
    if (mode === 'move') {
      if (fromShiftId === null || toShiftId === null) { showMsg('이동할 파트를 선택하세요'); return; }
      if (!movePreview || movePreview.total === 0) { showMsg('이동할 배정이 없습니다'); return; }
      const mergeNote = movePreview.merged > 0
        ? `\n(${movePreview.merged}건은 ${shiftName(toShiftId)} 파트에 이미 있어 ${shiftName(fromShiftId)}에서만 제거됩니다)`
        : '';
      if (!confirm(`${staffName} · ${rangeLabel}\n${shiftName(fromShiftId)} → ${shiftName(toShiftId)} 파트로 ${movePreview.total}건을 이동할까요?${mergeNote}`)) return;
      setIsBusy(true);
      const r = await moveStaffAssignments(unit, staffId, fromShiftId, toShiftId, from, to);
      if (r.success && r.data) {
        showMsg(`${r.data.moved}건 이동 완료${r.data.merged > 0 ? ` · ${r.data.merged}건은 중복이라 제거됨` : ''}`);
        onUndoable(`${staffName} ${r.data.moved + r.data.merged}건 이동됨`, r.data.undo);
        await onApplied();
        onClose();
      } else {
        showMsg(`오류: ${r.error}`);
      }
      setIsBusy(false);
    } else if (mode === 'swap') {
      if (swapTargetId === null || !swapPreview) { showMsg('교환할 근무자를 선택하세요'); return; }
      if (swapPreview.total === 0) { showMsg('교환할 배정이 없습니다'); return; }
      if (!confirm(`${staffName} ↔ ${swapTargetName} · ${rangeLabel}\n두 사람의 배정 ${swapPreview.total}건을 서로 맞바꿀까요?`)) return;
      setIsBusy(true);
      const r = await swapStaffAssignments(unit, staffId, swapTargetId, from, to);
      if (r.success && r.data) {
        showMsg(`${r.data.swapped}건 교환 완료`);
        onUndoable(`${staffName} ↔ ${swapTargetName} ${r.data.swapped}건 교환됨`, r.data.undo);
        await onApplied();
        onClose();
      } else {
        showMsg(`오류: ${r.error}`);
      }
      setIsBusy(false);
    } else {
      if (clearCount === 0) { showMsg('해제할 배정이 없습니다'); return; }
      const shiftLabel = clearShiftId === null ? '전체 파트' : `${shiftName(clearShiftId)} 파트`;
      if (!confirm(`${staffName} · ${rangeLabel}\n${shiftLabel} 배정 ${clearCount}건을 해제할까요?`)) return;
      setIsBusy(true);
      const r = await clearStaffAssignments(unit, staffId, from, to, clearShiftId);
      if (r.success && r.data) {
        showMsg(`${r.data.removed}건 해제 완료`);
        onUndoable(`${staffName} ${r.data.removed}건 해제됨`, r.data.undo);
        await onApplied();
        onClose();
      } else {
        showMsg(`오류: ${r.error}`);
      }
      setIsBusy(false);
    }
  };

  const canApply = staffId !== null && !isBusy && (
    mode === 'move' ? movePreview !== null && movePreview.total > 0
    : mode === 'swap' ? swapPreview !== null && swapPreview.total > 0
    : clearCount > 0
  );

  const inputCls = 'px-2 py-1.5 border border-hairline rounded-lg text-[13px] bg-canvas focus:outline-none focus:border-primary-700';
  const labelCls = 'text-[10px] font-semibold text-ink-muted';
  const tabCls = (active: boolean) =>
    `flex-1 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer transition border ${
      active ? 'bg-primary-700 text-white border-primary-700' : 'bg-canvas text-ink-muted border-hairline hover:border-primary-400'
    }`;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-canvas w-full max-w-[420px] max-h-[85vh] overflow-y-auto rounded-xl shadow-level-2 border border-hairline p-5 [scrollbar-width:thin]">
        <div className="flex items-center justify-between mb-1">
          <h3 className="m-0 text-[16px] font-bold text-ink">일괄 편집</h3>
          <button onClick={onClose} className="bg-transparent border-none text-ink-faint text-lg cursor-pointer leading-none hover:text-ink transition">×</button>
        </div>
        <p className="m-0 mb-4 text-[12px] text-ink-muted">{unitLabel} · 특정 근무자의 배정을 한 번에 옮기거나 해제합니다</p>

        <div className="flex flex-col gap-3">
          {/* 기간 */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>기간</label>
            <div className="flex items-center gap-1.5">
              <input
                type="date" value={from} min={monthStart} max={to || monthEnd}
                onChange={e => setFrom(e.target.value)}
                className={`${inputCls} flex-1 min-w-0`}
              />
              <span className="text-ink-faint text-[12px] shrink-0">~</span>
              <input
                type="date" value={to} min={from || monthStart} max={monthEnd}
                onChange={e => setTo(e.target.value)}
                className={`${inputCls} flex-1 min-w-0`}
              />
            </div>
            {hasPastDates && (
              <p className="m-0 text-[10px] text-amber-600">지난 날짜가 포함되어 있어요 — 급여 계산에 영향을 줄 수 있습니다</p>
            )}
          </div>

          {/* 근무자 */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>근무자 <span className="font-normal text-ink-faint">(기간 내 배정이 있는 사람만)</span></label>
            <select
              value={staffId ?? ''}
              onChange={e => handleStaffChange(e.target.value ? Number(e.target.value) : null)}
              className={`${inputCls} w-full cursor-pointer`}
            >
              <option value="">근무자 선택</option>
              {staffOptions.map(o => (
                <option key={o.id} value={o.id}>{o.name} ({o.count}건)</option>
              ))}
            </select>
            {staffOptions.length === 0 && (
              <p className="m-0 text-[10px] text-ink-faint">이 기간에 배정된 근무자가 없습니다</p>
            )}
          </div>

          {/* 동작 선택 */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setMode('move')}
              disabled={shifts.length < 2}
              className={`${tabCls(mode === 'move')} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              파트 이동
            </button>
            <button type="button" onClick={() => setMode('swap')} className={tabCls(mode === 'swap')}>
              맞바꾸기
            </button>
            <button type="button" onClick={() => setMode('clear')} className={tabCls(mode === 'clear')}>
              배정 해제
            </button>
          </div>

          {mode === 'move' ? (
            <div className="flex flex-col gap-2 bg-primary-50/40 border border-primary-200 rounded-lg p-3">
              <div className="flex items-center gap-1.5">
                <select
                  value={fromShiftId ?? ''}
                  onChange={e => setFromShiftId(e.target.value ? Number(e.target.value) : null)}
                  className={`${inputCls} flex-1 min-w-0 cursor-pointer`}
                >
                  <option value="">기존 파트</option>
                  {shifts.map(s => (
                    <option key={s.id} value={s.id} disabled={s.id === toShiftId}>
                      {s.name}{staffId !== null ? ` (${shiftCount(s.id)}건)` : ''}
                    </option>
                  ))}
                </select>
                <span className="text-ink-faint text-[12px] shrink-0">→</span>
                <select
                  value={toShiftId ?? ''}
                  onChange={e => setToShiftId(e.target.value ? Number(e.target.value) : null)}
                  className={`${inputCls} flex-1 min-w-0 cursor-pointer`}
                >
                  <option value="">이동할 파트</option>
                  {shifts.map(s => (
                    <option key={s.id} value={s.id} disabled={s.id === fromShiftId}>{s.name}</option>
                  ))}
                </select>
              </div>
              {movePreview && (
                <p className="m-0 text-[11px] text-ink-muted">
                  {movePreview.total === 0 ? (
                    '이 조건에 해당하는 배정이 없습니다'
                  ) : (
                    <>
                      <b className="text-primary-700">{movePreview.total}건</b>이 이동됩니다
                      {movePreview.merged > 0 && ` · 그중 ${movePreview.merged}건은 이미 대상 파트에 있어 기존 파트에서만 제거`}
                    </>
                  )}
                </p>
              )}
              <p className="m-0 text-[10px] text-ink-faint">개별 시간을 수정했던 배정은 이동 후 파트 기본 시간으로 돌아갑니다</p>
            </div>
          ) : mode === 'swap' ? (
            <div className="flex flex-col gap-2 bg-primary-50/40 border border-primary-200 rounded-lg p-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-ink truncate max-w-[110px]">{staffId !== null ? staffName : '근무자'}</span>
                <span className="text-ink-faint text-[12px] shrink-0">↔</span>
                <select
                  value={swapTargetId ?? ''}
                  onChange={e => setSwapTargetId(e.target.value ? Number(e.target.value) : null)}
                  className={`${inputCls} flex-1 min-w-0 cursor-pointer`}
                >
                  <option value="">교환할 근무자</option>
                  {swapTargetOptions.map(o => (
                    <option key={o.id} value={o.id}>{o.name} ({o.count}건)</option>
                  ))}
                </select>
              </div>
              {swapPreview && (
                <p className="m-0 text-[11px] text-ink-muted">
                  {swapPreview.total === 0 ? (
                    '교환할 배정이 없습니다'
                  ) : (
                    <>
                      <b className="text-primary-700">{swapPreview.total}건</b>이 서로 바뀝니다
                      {' '}({staffName} {swapPreview.aSwap}건 → {swapTargetName} · {swapTargetName} {swapPreview.bSwap}건 → {staffName})
                    </>
                  )}
                </p>
              )}
              <p className="m-0 text-[10px] text-ink-faint">같은 날 같은 파트에 둘 다 배정된 날은 그대로 유지됩니다</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 bg-rose-50/50 border border-rose-200 rounded-lg p-3">
              <select
                value={clearShiftId ?? ''}
                onChange={e => setClearShiftId(e.target.value ? Number(e.target.value) : null)}
                className={`${inputCls} w-full cursor-pointer`}
              >
                <option value="">전체 파트{staffId !== null ? ` (${staffAssignments.length}건)` : ''}</option>
                {shifts.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{staffId !== null ? ` (${shiftCount(s.id)}건)` : ''}
                  </option>
                ))}
              </select>
              {staffId !== null && (
                <p className="m-0 text-[11px] text-ink-muted">
                  {clearCount === 0
                    ? '이 조건에 해당하는 배정이 없습니다'
                    : <><b className="text-rose-600">{clearCount}건</b>이 해제됩니다</>}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-1.5 mt-0.5">
            <button
              type="button" onClick={onClose} disabled={isBusy}
              className="flex-1 py-1.5 rounded-lg border border-hairline bg-canvas text-ink-muted text-[12px] font-semibold cursor-pointer hover:bg-canvas-soft transition disabled:opacity-60"
            >
              취소
            </button>
            <button
              type="button" onClick={handleApply} disabled={!canApply}
              className={`flex-1 py-1.5 rounded-lg border-none text-white text-[12px] font-bold cursor-pointer transition disabled:opacity-60 disabled:cursor-not-allowed ${
                mode === 'clear' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-primary-700 hover:bg-primary-800'
              }`}
            >
              {isBusy ? '적용 중...' : mode === 'move' ? '이동' : mode === 'swap' ? '교환' : '해제'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
