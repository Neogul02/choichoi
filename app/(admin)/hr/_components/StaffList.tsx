'use client';

import { useRef, useState } from 'react';
import type { StaffProfile, StaffStatus, PopupEvent } from '@/types/database';
import { formatPhoneNumber } from '@/lib/utils';
import CopyText from '@/components/CopyText';
import { STATUS_LABELS, STATUS_COLORS } from './constants';

interface RowProps {
  staff: StaffProfile;
  shiftNames: string;
  popup: PopupEvent | null;
  contractDone: boolean;
  onRowClick: () => void;
  onStatusChange: (s: StaffStatus) => void;
  onContract: () => void;
  onContractsList: () => void;
  onAssign: () => void;
  onCalendar: () => void;
}

/** 이름/전화 — 클릭하면 복사, 드래그하면 선택. 행 클릭(정보 수정)과는 stopPropagation으로 분리된다 */
function StaffIdentity({ staff, popup, nameClassName }: { staff: StaffProfile; popup: PopupEvent | null; nameClassName: string }) {
  return (
    <>
      <div className={nameClassName}>
        <CopyText value={staff.name} label="이름">{staff.name}</CopyText>
      </div>
      {staff.phone && (
        <div className="text-[12px] text-ink-muted mt-0.5">
          <CopyText value={formatPhoneNumber(staff.phone)} label="전화번호">{formatPhoneNumber(staff.phone)}</CopyText>
        </div>
      )}
      {staff.staff_role === 'cashier' ? (
        <div className={`text-[11px] font-semibold mt-0.5 select-text ${popup ? 'text-violet-600' : 'text-amber-600'}`}>
          {popup ? popup.name : '팝업 미배정'}
        </div>
      ) : (
        <div className="text-[11px] font-semibold mt-0.5 text-ink-muted select-text">주방</div>
      )}
    </>
  );
}

/** md 이상 테이블 행 — 좌측 손잡이(⋮⋮)를 잡았을 때만 드래그로 순서 변경 */
export function StaffRow({ staff, shiftNames, popup, isLast, contractDone, onRowClick, onStatusChange, onContract, onContractsList, onAssign, onCalendar,
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
  // 행 전체에 draggable을 걸어두면 HTML5 드래그가 마우스 드래그를 가로채 셀 텍스트를 선택할 수 없다.
  // 손잡이를 눌렀을 때만 draggable을 켜서, 나머지 영역에서는 드래그 선택/복사가 그대로 동작하게 한다.
  const [dragArmed, setDragArmed] = useState(false);
  const draggingRef = useRef(false);

  const armDrag = () => {
    setDragArmed(true);
    const disarm = () => {
      window.removeEventListener('pointerup', disarm);
      window.removeEventListener('pointercancel', disarm);
      // 드래그가 실제로 시작됐다면 dragend에서 해제한다 (드래그 시작 직후 pointercancel이 먼저 오는 브라우저 대응)
      if (!draggingRef.current) setDragArmed(false);
    };
    window.addEventListener('pointerup', disarm);
    window.addEventListener('pointercancel', disarm);
  };

  return (
    <tr
      draggable={dragArmed}
      onDragStart={e => { e.stopPropagation(); draggingRef.current = true; e.dataTransfer.setData('application/staff-id', String(staff.id)); e.dataTransfer.effectAllowed = 'copy'; onDragStart?.(); }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); onDragOver?.(); }}
      onDragEnd={() => { draggingRef.current = false; setDragArmed(false); onDragEnd?.(); }}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); draggingRef.current = false; setDragArmed(false); onDrop?.(); }}
      className={`transition cursor-pointer ${isDragOver ? 'bg-primary-50 outline outline-2 outline-primary-400 outline-offset-[-1px]' : 'hover:bg-canvas-soft'} ${isDragging ? 'opacity-40' : ''} ${!isLast ? 'border-b border-hairline' : ''}`}
      onClick={onRowClick}
    >
      <td
        className="px-1 py-2.5 w-5 cursor-grab active:cursor-grabbing"
        title="드래그해서 순서 변경"
        onPointerDown={armDrag}
        onClick={e => e.stopPropagation()}
      >
        <span className="text-ink-faint text-[13px] select-none">⋮⋮</span>
      </td>
      <td className="px-3 py-2.5">
        <StaffIdentity staff={staff} popup={popup} nameClassName="font-bold text-ink leading-tight" />
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
      <td className="px-2 py-2.5 font-semibold text-ink whitespace-nowrap select-text">
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
  const btnBase = `whitespace-nowrap text-[11px] font-semibold rounded-lg border transition cursor-pointer select-none ${
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
export function StaffCard({ staff, shiftNames, popup, contractDone, onRowClick, onStatusChange, onContract, onContractsList, onAssign, onCalendar,
  isDragging, isDragOver, onReorderStart, onReorderOver, onReorderEnd, onReorderDrop }: RowProps & {
  isDragging?: boolean;
  isDragOver?: boolean;
  onReorderStart?: () => void;
  onReorderOver?: (targetId: number) => void;
  onReorderEnd?: () => void;
  onReorderDrop?: (targetId: number) => void;
}) {
  const sc = STATUS_COLORS[staff.status];

  // HTML5 드래그는 터치에서 동작하지 않아 모바일에선 순서 변경이 아예 불가능했다.
  // 포인터 이벤트로 직접 구현 — 손잡이를 누른 채 움직이면 손가락 아래 카드가 놓을 자리가 된다.
  const startReorder = (e: React.PointerEvent) => {
    if (!onReorderDrop) return;
    e.preventDefault();
    e.stopPropagation();
    onReorderStart?.();
    let targetId: number | null = null;
    const move = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-staff-card-id]');
      const id = el ? Number((el as HTMLElement).dataset.staffCardId) : null;
      if (id !== targetId) {
        targetId = id;
        if (id != null) onReorderOver?.(id);
      }
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (targetId != null && targetId !== staff.id) onReorderDrop(targetId);
      else onReorderEnd?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  return (
    <div
      data-staff-card-id={staff.id}
      onClick={onRowClick}
      className={`p-3 cursor-pointer active:bg-canvas-soft transition ${
        isDragOver ? 'bg-primary-50 outline outline-2 outline-primary-400 outline-offset-[-1px]' : ''
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        {onReorderDrop && (
          <span
            onPointerDown={startReorder}
            onClick={e => e.stopPropagation()}
            title="꾹 누른 채 위아래로 옮기면 순서 변경"
            className="shrink-0 -m-1 p-1 text-ink-faint text-[15px] leading-none select-none cursor-grab active:cursor-grabbing touch-none"
          >⋮⋮</span>
        )}
        <div className="min-w-0 flex-1">
          <StaffIdentity staff={staff} popup={popup} nameClassName="font-bold text-ink text-[14px] leading-tight" />
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
      <div className="text-[11px] text-ink-muted mt-1.5 truncate select-text">
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
