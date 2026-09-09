'use client';

import { useMemo } from 'react';
import { hhmmToMinutes, MINUTES_IN_DAY } from '@/lib/workhours';

const MINUTE_STEP = 5;

/**
 * 00:00 ~ 24:00 한 축 위에서 시각을 고르는 입력.
 * `<input type="time">`은 23:59가 최대라 "하루의 끝(24:00)"을 표현할 수 없어,
 * 오전/오후 구분 없이 0~24시를 그대로 고르는 select 두 개로 대체한다.
 */
export default function TimeOfDayField({ value, onChange, ariaLabel, className = '' }: {
  /** "HH:MM" 또는 "HH:MM:SS" — "24:00" 허용 */
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const total = Math.min(Math.max(hhmmToMinutes(value || '00:00'), 0), MINUTES_IN_DAY);
  const hour = Math.floor(total / 60);
  const minute = total % 60;

  // 기존 데이터가 5분 단위가 아니면(예: 10:33) 그 값을 목록에 끼워 넣어 선택이 유지되게 한다
  const minuteOptions = useMemo(() => {
    const base = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);
    return base.includes(minute) ? base : [...base, minute].sort((a, b) => a - b);
  }, [minute]);

  const emit = (h: number, m: number) => {
    // 24시는 하루의 끝이므로 분은 항상 00
    const nh = Math.min(h, 24);
    const nm = nh === 24 ? 0 : m;
    onChange(`${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`);
  };

  const selectCls = 'px-1.5 py-1.5 border border-hairline rounded-lg text-[13px] bg-canvas cursor-pointer focus:outline-none focus:border-primary-700 tabular-nums';

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      <select
        aria-label={ariaLabel ? `${ariaLabel} 시` : '시'}
        value={hour}
        onChange={e => emit(Number(e.target.value), minute)}
        className={selectCls}
      >
        {Array.from({ length: 25 }, (_, h) => (
          <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
        ))}
      </select>
      <span className="text-ink-faint text-[12px]">:</span>
      <select
        aria-label={ariaLabel ? `${ariaLabel} 분` : '분'}
        value={minute}
        onChange={e => emit(hour, Number(e.target.value))}
        disabled={hour === 24}
        className={`${selectCls} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {minuteOptions.map(m => (
          <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
        ))}
      </select>
    </span>
  );
}
