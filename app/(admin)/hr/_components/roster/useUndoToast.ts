'use client';

import { useEffect, useRef, useState } from 'react';
import { showMsg } from '@/lib/toast';
import { undoRosterChange } from '@/app/actions/roster';
import type { RosterUndoPayload } from '@/app/actions/roster';

/** 파괴적 작업(초기화·일괄 편집 등) 직후 10초간 되돌리기 토스트를 제공하는 상태 훅 */
export function useUndoToast(onRestored: () => Promise<void> | void) {
  const [undoState, setUndoState] = useState<{ label: string; payload: RosterUndoPayload } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const offerUndo = (label: string, payload: RosterUndoPayload) => {
    if (payload.deleted.length === 0 && payload.updated.length === 0) return;
    if (timer.current) clearTimeout(timer.current);
    setUndoState({ label, payload });
    timer.current = setTimeout(() => setUndoState(null), 10000);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const handleUndo = async () => {
    if (!undoState) return;
    const { payload } = undoState;
    setUndoState(null);
    if (timer.current) clearTimeout(timer.current);
    const r = await undoRosterChange(payload);
    if (r.success && r.data) {
      showMsg(`${r.data.restored}건 되돌렸습니다`);
      await onRestored();
    } else {
      showMsg(`오류: ${r.error}`);
    }
  };

  return { undoState, offerUndo, handleUndo, dismissUndo: () => setUndoState(null) };
}
