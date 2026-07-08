'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { fetchPosNote, updatePosNote } from '@/app/actions/pos-note';

const POS_NOTE_POS_KEY = 'choichoi_pos_note_pos';
const DEFAULT_POS = { x: -16, y: -16 };
const DESKTOP_QUERY = '(min-width: 768px)';

function loadSavedPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(POS_NOTE_POS_KEY);
    if (!raw) return DEFAULT_POS;
    const parsed = JSON.parse(raw);
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed;
  } catch { /* ignore */ }
  return DEFAULT_POS;
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

function usePosNoteData(cashierName?: string | null) {
  const [content, setContent] = useState('');
  const [meta, setMeta] = useState<{ updated_by: string | null; updated_at: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const isEditingRef = useRef(false);

  const applyRemote = useCallback((data: { content: string; updated_by: string | null; updated_at: string }) => {
    setMeta({ updated_by: data.updated_by, updated_at: data.updated_at });
    if (!isEditingRef.current) {
      setContent(data.content);
      setDirty(false);
    }
  }, []);

  useEffect(() => {
    fetchPosNote().then((res) => {
      if (res.success && res.data) applyRemote(res.data);
    });

    const channel = supabase
      .channel(`pos-note-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pos_note' }, (payload) => {
        applyRemote(payload.new as { content: string; updated_by: string | null; updated_at: string });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [applyRemote]);

  async function handleSave() {
    setSaving(true);
    const res = await updatePosNote(content, cashierName ?? undefined);
    setSaving(false);
    if (res.success && res.data) {
      setMeta({ updated_by: res.data.updated_by, updated_at: res.data.updated_at });
      setDirty(false);
      toast.success('메모 저장됨 — 모든 POS 화면에 공유됩니다');
    } else {
      toast.error(`저장 실패: ${res.error}`);
    }
  }

  return {
    content,
    onChange: (v: string) => { setContent(v); setDirty(true); },
    onFocus: () => { isEditingRef.current = true; },
    onBlur: () => { isEditingRef.current = false; },
    meta, saving, dirty, handleSave,
  };
}

function useIsDesktop(): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    setIsDesktop(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

function MetaLine({ meta }: { meta: { updated_by: string | null; updated_at: string } | null }) {
  if (!meta?.updated_at) return null;
  return (
    <span className="text-[10px] text-ink-faint truncate">
      {meta.updated_by ? `${meta.updated_by} · ` : ''}{formatRelative(meta.updated_at)}
    </span>
  );
}

export default function PosNoteWidget({ cashierName }: { cashierName?: string | null }) {
  const isDesktop = useIsDesktop();
  const note = usePosNoteData(cashierName);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useEffect(() => {
    const saved = loadSavedPos();
    x.set(saved.x);
    y.set(saved.y);
  }, [x, y]);

  function persistPos() {
    try { localStorage.setItem(POS_NOTE_POS_KEY, JSON.stringify({ x: x.get(), y: y.get() })); } catch { /* ignore */ }
  }

  if (isDesktop === null) return null;

  if (isDesktop) {
    // 맥북: 항상 펼쳐진 채로 드래그해서 옮길 수 있는 플로팅 패널
    return (
      <motion.div
        drag
        dragMomentum={false}
        onDragEnd={persistPos}
        style={{ x, y, position: 'fixed', bottom: 16, right: 16, zIndex: 40 }}
        className="select-none w-72 bg-canvas rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.22)] border border-hairline overflow-hidden"
      >
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-canvas-soft cursor-grab active:cursor-grabbing">
          <span className="text-[12px] font-extrabold text-ink">공유 메모장</span>
          <MetaLine meta={note.meta} />
        </div>
        <div className="p-3 flex flex-col gap-2" onPointerDownCapture={(e) => e.stopPropagation()}>
          <textarea
            value={note.content}
            onFocus={note.onFocus}
            onBlur={note.onBlur}
            onChange={(e) => note.onChange(e.target.value)}
            placeholder="예약, 공지 등을 적어두면 모든 POS 화면에서 볼 수 있어요"
            rows={5}
            className="w-full resize-none border border-hairline rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-primary-700 transition"
            style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
          />
          <button
            onClick={note.handleSave}
            disabled={note.saving || !note.dirty}
            className="self-end text-[12px] font-bold px-3 py-1.5 rounded-lg bg-primary-700 hover:bg-primary-800 disabled:opacity-40 disabled:cursor-not-allowed text-white border-none cursor-pointer transition"
          >
            {note.saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </motion.div>
    );
  }

  // 모바일: 결제하기 버튼을 가리지 않도록 페이지 맨 아래 일반 섹션으로 표시
  return (
    <section className="bg-canvas rounded-2xl p-3.5 shadow-level-1 border border-hairline mb-4" aria-label="POS 공유 메모">
      <div className="flex items-center justify-between mb-2">
        <h2 className="m-0 text-[16px] font-bold text-ink">공유 메모장</h2>
        <MetaLine meta={note.meta} />
      </div>
      <textarea
        value={note.content}
        onFocus={note.onFocus}
        onBlur={note.onBlur}
        onChange={(e) => note.onChange(e.target.value)}
        placeholder="예약, 공지 등을 적어두면 모든 POS 화면에서 볼 수 있어요"
        rows={4}
        className="w-full resize-none border border-hairline rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-primary-700 transition mb-2"
        style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
      />
      <button
        onClick={note.handleSave}
        disabled={note.saving || !note.dirty}
        className="w-full text-[13px] font-bold py-2.5 rounded-xl bg-primary-700 hover:bg-primary-800 disabled:opacity-40 disabled:cursor-not-allowed text-white border-none cursor-pointer transition"
      >
        {note.saving ? '저장 중…' : '저장'}
      </button>
    </section>
  );
}
