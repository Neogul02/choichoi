'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { RosterSettings } from '@/types/database';
import type { RosterSettingsInput } from '@/app/actions/roster';

interface Props {
  settings: RosterSettings;
  onClose: () => void;
  onSave: (input: RosterSettingsInput) => Promise<void>;
}

function NumberStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button" onClick={() => onChange(Math.max(0, value - 1))}
        className="w-7 h-7 rounded-lg bg-canvas border border-hairline cursor-pointer text-[13px] font-bold text-ink-muted hover:border-primary-400 transition leading-none"
      >
        −
      </button>
      <span className="text-[14px] font-bold w-6 text-center">{value}</span>
      <button
        type="button" onClick={() => onChange(value + 1)}
        className="w-7 h-7 rounded-lg bg-canvas border border-hairline cursor-pointer text-[13px] font-bold text-ink-muted hover:border-primary-400 transition leading-none"
      >
        +
      </button>
    </div>
  );
}

export default function RosterSettingsModal({ settings, onClose, onSave }: Props) {
  const [amStart, setAmStart] = useState(settings.am_start);
  const [amEnd, setAmEnd] = useState(settings.am_end);
  const [pmStart, setPmStart] = useState(settings.pm_start);
  const [pmEnd, setPmEnd] = useState(settings.pm_end);
  const [weekdayAm, setWeekdayAm] = useState(settings.weekday_am_required);
  const [weekdayPm, setWeekdayPm] = useState(settings.weekday_pm_required);
  const [weekendAm, setWeekendAm] = useState(settings.weekend_am_required);
  const [weekendPm, setWeekendPm] = useState(settings.weekend_pm_required);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave({
      am_start: amStart, am_end: amEnd, pm_start: pmStart, pm_end: pmEnd,
      weekday_am_required: weekdayAm, weekday_pm_required: weekdayPm,
      weekend_am_required: weekendAm, weekend_pm_required: weekendPm,
    });
    setIsSaving(false);
  };

  const inputCls = 'w-full px-2 py-1.5 border border-hairline rounded-lg text-[13px] bg-canvas focus:outline-none focus:border-primary-700';
  const labelCls = 'text-[11px] font-semibold text-ink-muted';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-canvas w-full max-w-[400px] max-h-[90vh] overflow-y-auto rounded-xl shadow-level-2 border border-hairline p-5 [scrollbar-width:thin]">
        <h3 className="m-0 mb-4 text-[16px] font-bold text-ink">스케줄 설정</h3>

        <div className="flex flex-col gap-4">
          {/* 파트 시간대 */}
          <div>
            <p className="m-0 mb-2 text-[12px] font-extrabold text-ink">파트 시간대</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className={`${labelCls} w-8 shrink-0 text-orange-600`}>오전</span>
                <input type="time" value={amStart} onChange={e => setAmStart(e.target.value)} className={inputCls} />
                <span className="text-ink-faint text-[12px]">~</span>
                <input type="time" value={amEnd} onChange={e => setAmEnd(e.target.value)} className={inputCls} />
              </div>
              <div className="flex items-center gap-2">
                <span className={`${labelCls} w-8 shrink-0 text-indigo-600`}>오후</span>
                <input type="time" value={pmStart} onChange={e => setPmStart(e.target.value)} className={inputCls} />
                <span className="text-ink-faint text-[12px]">~</span>
                <input type="time" value={pmEnd} onChange={e => setPmEnd(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* 기본 필요 인원 */}
          <div>
            <p className="m-0 mb-2 text-[12px] font-extrabold text-ink">
              기본 필요 인원 <span className="text-ink-faint font-normal">(날짜별 예외는 달력에서 조정)</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-canvas-soft rounded-lg p-3">
                <p className="m-0 mb-2 text-[11px] font-bold text-ink-muted">평일</p>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-orange-600 font-semibold">오전</span>
                    <NumberStepper value={weekdayAm} onChange={setWeekdayAm} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-indigo-600 font-semibold">오후</span>
                    <NumberStepper value={weekdayPm} onChange={setWeekdayPm} />
                  </div>
                </div>
              </div>
              <div className="bg-canvas-soft rounded-lg p-3">
                <p className="m-0 mb-2 text-[11px] font-bold text-ink-muted">주말</p>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-orange-600 font-semibold">오전</span>
                    <NumberStepper value={weekendAm} onChange={setWeekendAm} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-indigo-600 font-semibold">오후</span>
                    <NumberStepper value={weekendPm} onChange={setWeekendPm} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button" onClick={onClose} disabled={isSaving}
              className="flex-1 py-2.5 rounded-lg border border-hairline bg-canvas-soft text-ink-secondary text-[13px] font-semibold cursor-pointer hover:bg-[#ececec] transition disabled:opacity-60"
            >
              취소
            </button>
            <button
              type="button" onClick={handleSave} disabled={isSaving}
              className="flex-1 py-2.5 rounded-lg border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-60"
            >
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
