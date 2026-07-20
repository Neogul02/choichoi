'use client';

import type { StaffProfile, StaffStatus, Store } from '@/types/database';
import { STATUS_LABELS, STATUS_COLORS } from './constants';

interface RowProps {
  staff: StaffProfile;
  shiftNames: string;
  store: Store | null;
  contractDone: boolean;
  onRowClick: () => void;
  onStatusChange: (s: StaffStatus) => void;
  onContract: () => void;
  onContractsList: () => void;
  onAssign: () => void;
  onCalendar: () => void;
}

/** md 이상 테이블 행 — 드래그로 순서 변경 지원 */
export function StaffRow({ staff, shiftNames, store, isLast, contractDone, onRowClick, onStatusChange, onContract, onContractsList, onAssign, onCalendar,
  isDragging, isDragOver, onDragStart, onDragOver, onDragEnd, onDrop }: RowProps & {
  isLast: boolean;
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
        {staff.phone && <div className="text-[12px] text-ink-muted mt-0.5">{staff.phone}</div>}
        {staff.staff_role === 'cashier' ? (
          <div className={`text-[11px] font-semibold mt-0.5 ${store ? 'text-violet-600' : 'text-amber-600'}`}>
            {store ? store.name : '매장 미배정'}
          </div>
        ) : (
          <div className="text-[11px] font-semibold mt-0.5 text-ink-muted">주방</div>
        )}
      </td>
      <td className="px-2 py-2.5" onClick={e => e.stopPropagation()}>
        <select
          value={staff.status}
          onChange={e => onStatusChange(e.target.value as StaffStatus)}
          className={`text-[11px] font-bold px-1.5 py-1 rounded-md border cursor-pointer appearance-none text-center ${sc.bg} ${sc.text} ${sc.border}`}
        >
          {(Object.keys(STATUS_LABELS) as StaffStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2.5 font-semibold text-ink whitespace-nowrap">
        {staff.preferred_shift_ids.length === 0 ? <span className="text-ink-faint font-normal">무관</span> : shiftNames}
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
        <StaffActions
          staff={staff}
          contractDone={contractDone}
          onContract={onContract}
          onContractsList={onContractsList}
          onAssign={onAssign}
          onCalendar={onCalendar}
        />
      </td>
    </tr>
  );
}

// 테이블 행(md+)과 모바일 카드가 공유하는 액션 버튼 묶음 — fill이면 버튼이 행 폭을 균등 분할 (모바일 카드용)
function StaffActions({ staff, contractDone, fill, onContract, onContractsList, onAssign, onCalendar }: {
  staff: StaffProfile;
  contractDone: boolean;
  fill?: boolean;
  onContract: () => void;
  onContractsList: () => void;
  onAssign: () => void;
  onCalendar: () => void;
}) {
  const btnBase = `whitespace-nowrap text-[11px] font-semibold rounded-lg border transition cursor-pointer ${
    fill ? 'flex-1 px-2 py-1.5 text-center' : 'px-2 py-1'
  }`;
  return (
    <div className={`flex items-center ${fill ? 'gap-1.5' : 'gap-1 justify-end'}`}>
      <button
        onClick={onCalendar}
        title="근무 캘린더"
        className={`${btnBase} bg-canvas-soft text-ink-muted border-hairline hover:bg-[#ececeb]`}
      >
        달력
      </button>
      <button
        onClick={onAssign}
        title="일정 배정"
        className={`${btnBase} bg-primary-50 text-primary-700 border-primary-200 hover:bg-primary-100`}
      >
        배정
      </button>
      {staff.user_profile_id && (
        <button
          onClick={onContract}
          title="근로계약서 작성"
          className={`${btnBase} ${
            contractDone
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
          }`}
        >
          {contractDone ? '계약서 ✓' : '계약서'}
        </button>
      )}
      {contractDone && (
        <button
          onClick={onContractsList}
          title="근로계약서 목록"
          className={`${btnBase} bg-canvas-soft text-ink-muted border-hairline hover:bg-[#ececeb]`}
        >
          목록
        </button>
      )}
    </div>
  );
}

/** md 미만 전용 카드 — 테이블의 가로 스크롤 없이 한 화면(393px)에 담기는 레이아웃 */
export function StaffCard({ staff, shiftNames, store, contractDone, onRowClick, onStatusChange, onContract, onContractsList, onAssign, onCalendar }: RowProps) {
  const sc = STATUS_COLORS[staff.status];
  return (
    <div onClick={onRowClick} className="p-3 cursor-pointer active:bg-canvas-soft transition">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-ink text-[14px] leading-tight">{staff.name}</div>
          {staff.phone && <div className="text-[12px] text-ink-muted mt-0.5">{staff.phone}</div>}
          {staff.staff_role === 'cashier' ? (
            <div className={`text-[11px] font-semibold mt-0.5 ${store ? 'text-violet-600' : 'text-amber-600'}`}>
              {store ? store.name : '매장 미배정'}
            </div>
          ) : (
            <div className="text-[11px] font-semibold mt-0.5 text-ink-muted">주방</div>
          )}
        </div>
        <div onClick={e => e.stopPropagation()}>
          <select
            value={staff.status}
            onChange={e => onStatusChange(e.target.value as StaffStatus)}
            className={`text-[11px] font-bold px-1.5 py-1 rounded-md border cursor-pointer appearance-none text-center ${sc.bg} ${sc.text} ${sc.border}`}
          >
            {(Object.keys(STATUS_LABELS) as StaffStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="text-[11px] text-ink-muted mt-1.5 truncate">
        파트 <span className="font-semibold text-ink">{shiftNames || '무관'}</span>
      </div>
      <div className="mt-2" onClick={e => e.stopPropagation()}>
        <StaffActions
          staff={staff}
          fill
          contractDone={contractDone}
          onContract={onContract}
          onContractsList={onContractsList}
          onAssign={onAssign}
          onCalendar={onCalendar}
        />
      </div>
    </div>
  );
}
