'use client';

import { useRef, useState } from 'react';
import type { StaffProfile, StaffStatus, PopupEvent } from '@/types/database';
import { formatPhoneNumber } from '@/lib/utils';
import CopyText from '@/components/CopyText';
import { STATUS_LABELS, STATUS_COLORS, MANAGED_STATUSES, normalizeStatus } from './constants';

/**
 * 인사탭에 곧바로 띄우는 신상. 이 값 자체가 없으면 '계정 미연결'.
 * 생년월일은 주민번호 앞 6자리와 같은 정보라 따로 들지 않고 번호 한 줄로만 보여준다.
 */
export interface StaffPersonal {
  /** `990101-1234567` — 복호화 실패 시 마스킹값, 아예 미등록이면 null */
  residentId: string | null;
  /** 주민번호에서 계산한 만 나이 — 미등록이면 null */
  age: number | null;
}

interface RowProps {
  staff: StaffProfile;
  personal: StaffPersonal | null;
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

/**
 * 주민번호 한 줄 — 앞 6자리가 곧 생년월일이라 날짜를 따로 적지 않는다(같은 값을 두 번 쓰게 된다).
 * 실무에서 번호에서 바로 안 읽히는 건 나이뿐이라 그것만 뒤에 붙인다.
 */
function PersonalLine({ personal, className = '' }: { personal: StaffPersonal | null; className?: string }) {
  return (
    <div className={`text-[11px] font-mono select-text leading-tight ${className}`}>
      {!personal ? (
        <span className="font-sans text-ink-faint">계정 미연결</span>
      ) : personal.residentId ? (
        <>
          <span className="text-ink-muted">
            <CopyText value={personal.residentId} label="주민등록번호">{personal.residentId}</CopyText>
          </span>
          {personal.age !== null && <span className="text-ink-faint"> · {personal.age}세</span>}
        </>
      ) : (
        <span className="font-sans text-amber-600">주민번호 미등록</span>
      )}
    </div>
  );
}

/** 이름/전화 — 클릭하면 복사, 드래그하면 선택. 행 클릭(정보 수정)과는 stopPropagation으로 분리된다 */
function StaffIdentity({ staff, personal, popup, nameClassName }: { staff: StaffProfile; personal: StaffPersonal | null; popup: PopupEvent | null; nameClassName: string }) {
  // 소속(주방 / 팝업명)은 이름 바로 옆 — 누가 어디 사람인지가 목록에서 제일 먼저 필요하다
  const unitLabel = staff.staff_role === 'cashier' ? (popup?.name ?? '팝업 미배정') : '주방';
  const unitTone = staff.staff_role !== 'cashier' ? 'text-ink-muted' : popup ? 'text-violet-600' : 'text-amber-600';

  return (
    <>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className={`${nameClassName} shrink-0`}>
          <CopyText value={staff.name} label="이름">{staff.name}</CopyText>
        </span>
        <span className={`text-[11px] font-semibold truncate select-text ${unitTone}`}>{unitLabel}</span>
      </div>
      {staff.phone && (
        <div className="text-[12px] text-ink-muted mt-0.5">
          <CopyText value={formatPhoneNumber(staff.phone)} label="전화번호">{formatPhoneNumber(staff.phone)}</CopyText>
        </div>
      )}
      {/* 주민번호 — 4대보험 신고와 연령 확인에 매번 쓰는 값이라 클릭 없이 바로 보여준다 */}
      <PersonalLine personal={personal} className="mt-0.5" />
    </>
  );
}

/** 상태 드롭다운 — 확정/퇴사 두 가지만 관리한다 (레거시 '후보'는 확정으로 표시) */
function StatusSelect({ status, onStatusChange }: { status: StaffStatus; onStatusChange: (s: StaffStatus) => void }) {
  const sc = STATUS_COLORS[status];
  return (
    <select
      value={normalizeStatus(status)}
      onChange={e => onStatusChange(e.target.value as StaffStatus)}
      className={`text-[11px] font-bold px-1.5 py-1 rounded-md border cursor-pointer appearance-none text-center whitespace-nowrap ${sc.bg} ${sc.text} ${sc.border}`}
    >
      {MANAGED_STATUSES.map(s => (
        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
      ))}
    </select>
  );
}

/** md 이상 테이블 행 — 좌측 손잡이(⋮⋮)를 잡았을 때만 드래그로 순서 변경 */
export function StaffRow({ staff, personal, shiftNames, popup, isLast, contractDone, onRowClick, onStatusChange, onContract, onContractsList, onAssign, onCalendar,
  isDragging, isDragOver, onDragStart, onDragOver, onDragEnd, onDrop }: RowProps & {
  isLast: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDragEnd?: () => void;
  onDrop?: () => void;
}) {
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
        <StaffIdentity staff={staff} personal={personal} popup={popup} nameClassName="font-bold text-ink leading-tight" />
      </td>
      <td className="px-2 py-2.5" onClick={e => e.stopPropagation()}>
        <StatusSelect status={staff.status} onStatusChange={onStatusChange} />
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

// 테이블 행(md+)과 모바일 카드가 공유하는 액션 버튼 묶음 — touch면 탭 영역을 조금 키운다 (모바일 카드용)
function StaffActions({ staff, contractDone, touch, onContract, onContractsList, onAssign, onCalendar }: {
  staff: StaffProfile;
  contractDone: boolean;
  touch?: boolean;
  onContract: () => void;
  onContractsList: () => void;
  onAssign: () => void;
  onCalendar: () => void;
}) {
  const btnBase = `whitespace-nowrap text-[11px] font-semibold rounded-lg border transition cursor-pointer select-none ${
    touch ? 'px-2 py-1.5' : 'px-2 py-1'
  }`;
  return (
    <div className="flex items-center gap-1 justify-end">
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

/** md 미만 전용 카드 — 한 사람당 2줄로 압축해 한 화면(393px)에 더 많이 담는다 */
export function StaffCard({ staff, personal, shiftNames, popup, contractDone, onRowClick, onStatusChange, onContract, onContractsList, onAssign, onCalendar,
  isDragging, isDragOver, onReorderStart, onReorderOver, onReorderEnd, onReorderDrop }: RowProps & {
  isDragging?: boolean;
  isDragOver?: boolean;
  onReorderStart?: () => void;
  onReorderOver?: (targetId: number) => void;
  onReorderEnd?: () => void;
  onReorderDrop?: (targetId: number) => void;
}) {
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

  const unitLabel = staff.staff_role === 'cashier' ? (popup?.name ?? '팝업 미배정') : '주방';
  const unitTone = staff.staff_role !== 'cashier' ? 'text-ink-muted' : popup ? 'text-violet-600' : 'text-amber-600';

  return (
    <div
      data-staff-card-id={staff.id}
      onClick={onRowClick}
      className={`px-3 py-2 cursor-pointer active:bg-canvas-soft transition ${
        isDragOver ? 'bg-primary-50 outline outline-2 outline-primary-400 outline-offset-[-1px]' : ''
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      {/* 1줄: 손잡이 + 이름 + 소속 + 상태 */}
      <div className="flex items-center gap-2">
        {onReorderDrop && (
          <span
            onPointerDown={startReorder}
            onClick={e => e.stopPropagation()}
            title="꾹 누른 채 위아래로 옮기면 순서 변경"
            className="shrink-0 -m-1 p-1 text-ink-faint text-[15px] leading-none select-none cursor-grab active:cursor-grabbing touch-none"
          >⋮⋮</span>
        )}
        <span className="font-bold text-ink text-[14px] leading-tight shrink-0">
          <CopyText value={staff.name} label="이름">{staff.name}</CopyText>
        </span>
        <span className={`text-[11px] font-semibold truncate select-text ${unitTone}`}>{unitLabel}</span>
        <div className="ml-auto shrink-0" onClick={e => e.stopPropagation()}>
          <StatusSelect status={staff.status} onStatusChange={onStatusChange} />
        </div>
      </div>

      {/* 2줄: 주민번호 — 데스크톱 행과 같은 한 줄 */}
      <div onClick={e => e.stopPropagation()}>
        <PersonalLine personal={personal} className="mt-0.5" />
      </div>

      {/* 3줄: 전화·파트 + 액션 */}
      <div className="flex items-center gap-2 mt-1">
        <div className="min-w-0 flex items-center gap-1.5 text-[11px] text-ink-muted">
          {staff.phone && (
            <span className="shrink-0 tabular-nums">
              <CopyText value={formatPhoneNumber(staff.phone)} label="전화번호">{formatPhoneNumber(staff.phone)}</CopyText>
            </span>
          )}
          <span className="truncate select-text">
            {staff.phone && <span className="text-ink-faint">· </span>}
            <span className="font-semibold text-ink-secondary">{shiftNames || '파트 무관'}</span>
          </span>
        </div>
        <div className="ml-auto shrink-0" onClick={e => e.stopPropagation()}>
          <StaffActions
            staff={staff}
            touch
            contractDone={contractDone}
            onContract={onContract}
            onContractsList={onContractsList}
            onAssign={onAssign}
            onCalendar={onCalendar}
          />
        </div>
      </div>
    </div>
  );
}
