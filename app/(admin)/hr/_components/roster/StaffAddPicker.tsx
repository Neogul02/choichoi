'use client';

import { useState } from 'react';
import type { StaffProfile } from '@/types/database';
import { STATUS_LABELS } from '../constants';

interface Candidate {
  staff: StaffProfile;
  avail: { ok: boolean; reasons: string[] };
}

interface Props {
  candidates: Candidate[];
  onPick: (staffId: number) => void;
}

/**
 * 파트별 '인원 추가' — 이름 검색 가능한 클릭형 후보 목록.
 * 네이티브 select는 후보가 많아지면(가용 여부·사유 텍스트까지 붙어) 스크롤로 찾기 어렵고
 * 한글 IME 입력 중 브라우저의 문자키 점프도 기대대로 동작하지 않아, 텍스트 필터 + 목록으로 대체.
 */
export default function StaffAddPicker({ candidates, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = query.trim()
    ? candidates.filter(c => c.staff.name.includes(query.trim()))
    : candidates;

  const handlePick = (staffId: number) => {
    onPick(staffId);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="+ 인원 추가 (이름 검색)"
        className="w-full px-2 py-1.5 border border-dashed border-hairline rounded-lg text-[11px] text-ink bg-canvas focus:outline-none focus:border-primary-700 focus:border-solid"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-hairline bg-canvas shadow-level-2">
          {filtered.length === 0 ? (
            <p className="m-0 px-2.5 py-2 text-[11px] text-ink-faint">검색 결과가 없습니다</p>
          ) : (
            filtered.map(({ staff, avail }) => (
              <button
                key={staff.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handlePick(staff.id)}
                className="w-full text-left px-2.5 py-1.5 text-[11px] bg-transparent border-none border-b border-hairline last:border-b-0 cursor-pointer hover:bg-canvas-soft transition"
              >
                <span className={avail.ok ? 'text-emerald-600' : 'text-rose-500'}>{avail.ok ? '✓' : '✗'}</span>{' '}
                <span className="font-semibold text-ink">{staff.name}</span>
                {staff.status === 'candidate' && <span className="text-ink-faint"> ({STATUS_LABELS.candidate})</span>}
                {!avail.ok && <span className="block text-[10px] text-ink-faint mt-0.5">{avail.reasons.join(', ')}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
