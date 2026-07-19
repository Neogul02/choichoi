'use client';

import { useEffect, useRef, useState } from 'react';
import { showMsg } from '@/lib/toast';
import type { StaffProfile, RosterShift, RosterAssignment } from '@/types/database';
import { DAY_NAMES, STATUS_LABELS, checkStaffAvailability, shiftTextColor } from '../constants';
import { toMinutes, MIN_REST_MINUTES } from '@/lib/staffing';
import { prevDate, dayOfWeek } from '@/lib/date';

interface Props {
  dateStr: string;
  shifts: RosterShift[];
  staffList: StaffProfile[];
  overrides: Record<string, number>;
  violations: Map<number, string[]>;
  getAssigned: (d: string, shiftId: number) => RosterAssignment[];
  getRequired: (d: string, s: RosterShift) => number;
  getWeeklyDayCount: (staffId: number, d: string) => number;
  onAdd: (d: string, shiftId: number, staffId: number) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
  onTimeChange: (id: number, start: string | null, end: string | null) => Promise<void>;
  onRequirementChange: (d: string, shiftId: number, required: number) => Promise<void>;
  onRequirementReset: (d: string, shiftId: number) => Promise<void>;
  onClose: () => void;
}

/** 날짜 상세 패널 — 파트별 배정 조회/추가/삭제, 개별 시간 수정, 요구 인원 조정, 근무 안내 복사 */
export default function DayPanel({
  dateStr, shifts, staffList, overrides, violations,
  getAssigned, getRequired, getWeeklyDayCount, onAdd, onRemove, onTimeChange,
  onRequirementChange, onRequirementReset, onClose,
}: Props) {
  const day = dayOfWeek(dateStr);
  const [editingTimeId, setEditingTimeId] = useState<number | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [copying, setCopying] = useState(false);
  // 날짜 선택/변경 시 패널로 포커스 이동 — 키보드·스크린리더 사용자에게 열림을 알림
  // lg 미만에서는 패널이 달력 아래에 렌더되어 열린 걸 모를 수 있으므로 화면 안으로 스크롤
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    if (!window.matchMedia('(min-width: 1024px)').matches) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [dateStr]);

  // Escape — 시간 편집 중이면 편집 취소, 아니면 패널 닫기
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (editingTimeId !== null) setEditingTimeId(null);
      else onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, editingTimeId]);

  // 배정 후보: 불합격/퇴사 제외
  const selectableStaff = staffList.filter(s => s.status === 'confirmed' || s.status === 'candidate');

  const handleCopy = async () => {
    setCopying(true);
    try {
      const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
      const m = Number(dateStr.slice(5, 7));
      const dd = Number(dateStr.slice(8));
      const dateLabel = `${m}월 ${dd}일(${DAYS[day]})`;

      const lines: string[] = [`📋 ${dateLabel} 근무 안내`, ''];
      let hasAny = false;

      for (const shift of shifts) {
        const assigned = getAssigned(dateStr, shift.id);
        if (assigned.length === 0) continue;
        hasAny = true;
        lines.push(`[${shift.name}] ${shift.start_time}~${shift.end_time}`);
        for (const a of assigned) {
          // 개별 수정 시간이 있으면 이름 옆에 표기 — 파트 기본 시간과 다르게 일하는 사람이 헷갈리지 않도록
          const custom = a.start_time || a.end_time
            ? ` (${(a.start_time ?? shift.start_time).slice(0, 5)}~${(a.end_time ?? shift.end_time).slice(0, 5)})`
            : '';
          lines.push(`· ${a.staff_profiles?.name ?? ''}${custom}`);
        }
        lines.push('');
      }

      if (!hasAny) {
        await navigator.clipboard.writeText(`📋 ${dateLabel} 근무 안내\n\n배정된 근무자가 없습니다.`);
      } else {
        await navigator.clipboard.writeText(lines.join('\n').trimEnd());
      }
      showMsg('클립보드에 복사됐습니다!');
    } catch {
      showMsg('복사 실패 — 브라우저 권한을 확인해주세요.');
    } finally {
      setCopying(false);
    }
  };

  const prevDay = prevDate(dateStr);
  const prevDayEnds = new Map<number, string>(); // staff_id → 전날 퇴근 시간
  for (const sh of shifts) {
    for (const a of getAssigned(prevDay, sh.id)) {
      prevDayEnds.set(a.staff_id, a.end_time ?? sh.end_time);
    }
  }

  return (
    <div ref={panelRef} tabIndex={-1} className="w-full lg:w-[340px] shrink-0 bg-canvas rounded-2xl p-4 shadow-level-1 border border-hairline focus:outline-none">
      <div className="flex items-center justify-between mb-3">
        <h3 className="m-0 text-[15px] font-extrabold">
          {Number(dateStr.slice(5, 7))}월 {Number(dateStr.slice(8))}일
          <span className={`ml-1 ${day === 0 ? 'text-red-400' : day === 6 ? 'text-blue-400' : 'text-ink-muted'}`}>({DAY_NAMES[day]})</span>
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={copying}
            className="px-2.5 py-1 rounded-lg bg-canvas-soft border border-hairline text-[11px] font-semibold text-ink-muted cursor-pointer hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 transition disabled:opacity-50"
          >
            {copying ? '복사 중...' : '복사'}
          </button>
          <button onClick={onClose} aria-label="날짜 상세 닫기" className="bg-transparent border-none text-ink-faint text-lg cursor-pointer leading-none hover:text-ink transition">×</button>
        </div>
      </div>

      {shifts.map((shift, shiftIdx) => {
        const assigned = getAssigned(dateStr, shift.id);
        const required = getRequired(dateStr, shift);
        const hasOverride = overrides[`${dateStr}|${shift.id}`] !== undefined;
        const candidates = selectableStaff
          .map(s => {
            const { reasons } = checkStaffAvailability(s, dateStr, shift);
            if (s.max_days_per_week != null && getWeeklyDayCount(s.id, dateStr) >= s.max_days_per_week) {
              reasons.push(`주 ${s.max_days_per_week}일 도달`);
            }
            const prevEnd = prevDayEnds.get(s.id);
            if (prevEnd && toMinutes(shift.start_time) + 24 * 60 - toMinutes(prevEnd) < MIN_REST_MINUTES) {
              reasons.push('전날 야간 근무 (9h 미만 휴식)');
            }
            return { staff: s, avail: { ok: reasons.length === 0, reasons } };
          })
          .sort((a, b) => Number(b.avail.ok) - Number(a.avail.ok));

        return (
          <div key={shift.id} className="mb-3 last:mb-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-[12px] font-extrabold ${shiftTextColor(shiftIdx)}`}>
                {shift.name} <span className="text-ink-faint font-semibold">{shift.start_time}~{shift.end_time}</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onRequirementChange(dateStr, shift.id, Math.max(0, required - 1))}
                  aria-label={`${shift.name} 필요 인원 줄이기`}
                  className="w-5 h-5 rounded bg-canvas-soft border border-hairline cursor-pointer text-[11px] font-bold text-ink-muted hover:border-primary-400 transition leading-none"
                >
                  −
                </button>
                <span className={`text-[11px] font-bold ${assigned.length >= required ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {assigned.length}/{required}
                </span>
                <button
                  onClick={() => onRequirementChange(dateStr, shift.id, required + 1)}
                  aria-label={`${shift.name} 필요 인원 늘리기`}
                  className="w-5 h-5 rounded bg-canvas-soft border border-hairline cursor-pointer text-[11px] font-bold text-ink-muted hover:border-primary-400 transition leading-none"
                >
                  +
                </button>
                {hasOverride && (
                  <button
                    onClick={() => onRequirementReset(dateStr, shift.id)}
                    title="기본 인원으로 되돌리기"
                    className="text-[10px] text-primary-600 font-bold bg-transparent border-none cursor-pointer hover:text-primary-800 transition"
                  >
                    기본값
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              {assigned.map(a => (
                <div key={a.id} className="flex items-center gap-1.5 bg-canvas-soft rounded-lg px-2.5 py-1.5">
                  {editingTimeId === a.id ? (
                    <>
                      <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)} className="flex-1 min-w-0 px-1 py-0.5 border border-hairline rounded text-[11px] bg-canvas focus:outline-none focus:border-primary-700" />
                      <span className="text-ink-faint text-[10px]">~</span>
                      <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} className="flex-1 min-w-0 px-1 py-0.5 border border-hairline rounded text-[11px] bg-canvas focus:outline-none focus:border-primary-700" />
                      <button
                        onClick={async () => { await onTimeChange(a.id, editStart || null, editEnd || null); setEditingTimeId(null); }}
                        className="shrink-0 text-[10px] font-bold text-white bg-primary-700 border-none rounded px-1.5 py-1 cursor-pointer hover:bg-primary-800 transition"
                      >
                        저장
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-[12px] font-bold text-ink flex-1 min-w-0 truncate">
                        {a.staff_profiles?.name ?? `#${a.staff_id}`}
                        {violations.get(a.id) && (
                          <span className="ml-1 text-[10px]" title={violations.get(a.id)!.join(', ')}>⚠️</span>
                        )}
                      </span>
                      <button
                        onClick={() => {
                          setEditingTimeId(a.id);
                          setEditStart(a.start_time ?? shift.start_time);
                          setEditEnd(a.end_time ?? shift.end_time);
                        }}
                        title="시간 수정"
                        className={`text-[10px] bg-transparent border-none cursor-pointer transition ${a.start_time ? 'text-primary-700 font-bold' : 'text-ink-faint hover:text-primary-700'}`}
                      >
                        {a.start_time ? `${a.start_time}~${a.end_time}` : '기본시간'}
                      </button>
                      <button
                        onClick={() => onRemove(a.id)}
                        aria-label={`${a.staff_profiles?.name ?? `#${a.staff_id}`} 배정 삭제`}
                        className="shrink-0 bg-transparent border-none text-ink-faint cursor-pointer text-[13px] leading-none hover:text-rose-500 transition"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              ))}

              {/* 인원 추가 */}
              <select
                value=""
                onChange={e => { if (e.target.value) onAdd(dateStr, shift.id, Number(e.target.value)); }}
                className="w-full px-2 py-1.5 border border-dashed border-hairline rounded-lg text-[11px] text-ink-muted bg-canvas cursor-pointer focus:outline-none focus:border-primary-700"
              >
                <option value="">+ 인원 추가</option>
                {candidates.map(({ staff, avail }) => (
                  <option key={staff.id} value={staff.id}>
                    {avail.ok ? '✓' : '✗'} {staff.name}
                    {staff.status === 'candidate' ? ` (${STATUS_LABELS.candidate})` : ''}
                    {!avail.ok ? ` — ${avail.reasons.join(', ')}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}
