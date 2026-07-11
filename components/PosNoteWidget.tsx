'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { fetchPosNote, updatePosNote } from '@/app/actions/pos-note';

const POS_NOTE_POS_KEY = 'choichoi_pos_note_pos';
const POS_NOTE_SIZE_KEY = 'choichoi_pos_note_size';
const DEFAULT_POS = { x: -16, y: -16 };
const WIDTH_DEFAULT = 288; // 기존 w-72(18rem)와 동일한 기본 폭
const MAX_SIZE = { width: 480, height: 640 };
const DESKTOP_QUERY = '(min-width: 768px)';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function loadSavedPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(POS_NOTE_POS_KEY);
    if (!raw) return DEFAULT_POS;
    const parsed = JSON.parse(raw);
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed;
  } catch { /* ignore */ }
  return DEFAULT_POS;
}

function loadSavedSize(): { width: number; height: number } | null {
  try {
    const raw = localStorage.getItem(POS_NOTE_SIZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.width === 'number' && typeof parsed.height === 'number') return parsed;
  } catch { /* ignore */ }
  return null;
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

const AUTOSAVE_DELAY_MS = 800;

function usePosNoteData(cashierName?: string | null) {
  const [content, setContent] = useState('');
  const [meta, setMeta] = useState<{ updated_by: string | null; updated_at: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const isEditingRef = useRef(false);
  const contentRef = useRef('');
  const cashierNameRef = useRef(cashierName);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { cashierNameRef.current = cashierName; }, [cashierName]);

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

  const save = useCallback(async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setSaving(true);
    const res = await updatePosNote(contentRef.current, cashierNameRef.current ?? undefined);
    setSaving(false);
    if (res.success && res.data) {
      setMeta({ updated_by: res.data.updated_by, updated_at: res.data.updated_at });
      setDirty(false);
    } else {
      toast.error(`저장 실패: ${res.error}`);
    }
  }, []);

  useEffect(() => () => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
  }, []);

  return {
    content,
    onChange: (v: string) => {
      // 커밋 타이밍과 무관하게 save가 항상 최신 값을 읽도록 ref를 즉시 동기화
      contentRef.current = v;
      setContent(v);
      setDirty(true);
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(save, AUTOSAVE_DELAY_MS);
    },
    onFocus: () => { isEditingRef.current = true; },
    onBlur: () => {
      isEditingRef.current = false;
      if (autosaveTimerRef.current) save();
    },
    meta, saving, dirty,
  };
}

function useEditorPresence(name?: string | null) {
  const [editors, setEditors] = useState<string[]>([]);
  const [clientId] = useState(() => Math.random().toString(36).slice(2, 10));
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const subscribedRef = useRef(false);

  useEffect(() => {
    const channel = supabase.channel('pos-note-editors', {
      config: { presence: { key: clientId } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ name: string }>();
        const names = new Set<string>();
        for (const entries of Object.values(state)) {
          for (const p of entries) if (p.name) names.add(p.name);
        }
        setEditors([...names]);
      })
      .subscribe((status) => {
        subscribedRef.current = status === 'SUBSCRIBED';
      });
    channelRef.current = channel;
    return () => {
      subscribedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  const notifyEditing = useCallback((active: boolean) => {
    const channel = channelRef.current;
    if (!channel || !subscribedRef.current) return;
    if (active && name) channel.track({ name });
    else channel.untrack();
  }, [name]);

  return { editors: editors.filter((n) => n !== name), notifyEditing };
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

function MetaLine({ meta, saving, dirty }: { meta: { updated_by: string | null; updated_at: string } | null; saving: boolean; dirty: boolean }) {
  if (saving) return <span className="text-[10px] text-primary-700 font-semibold shrink-0">저장 중…</span>;
  if (dirty) return <span className="text-[10px] text-ink-faint shrink-0">자동 저장 대기…</span>;
  if (!meta?.updated_at) return null;
  return (
    <span className="text-[10px] text-ink-faint truncate">
      {meta.updated_by ? `${meta.updated_by} · ` : ''}{formatRelative(meta.updated_at)}
    </span>
  );
}

function EditingBadge({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="flex items-center gap-1 text-[10px] font-semibold text-primary-700 mb-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-primary-700 animate-pulse shrink-0" />
      <span className="truncate">{names.join(', ')}님 입력 중</span>
    </div>
  );
}

export default function PosNoteWidget({ cashierName }: { cashierName?: string | null }) {
  const isDesktop = useIsDesktop();
  const note = usePosNoteData(cashierName);
  const { editors, notifyEditing } = useEditorPresence(cashierName);
  const panelRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const width = useMotionValue<number | string>(WIDTH_DEFAULT);
  const height = useMotionValue<number | string>('auto');
  const minSizeRef = useRef<{ width: number; height: number }>({ width: WIDTH_DEFAULT, height: 0 });
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const savedPos = loadSavedPos();
    x.set(savedPos.x);
    y.set(savedPos.y);
  }, [x, y]);

  useLayoutEffect(() => {
    if (!isDesktop || !panelRef.current) return;
    // rows=5 텍스트영역 기준 자연 높이를 최초 1회 측정해 예전과 동일한 기본/최소 크기로 고정
    const naturalHeight = panelRef.current.getBoundingClientRect().height;
    const savedSize = loadSavedSize();
    minSizeRef.current = { width: WIDTH_DEFAULT, height: naturalHeight };
    width.set(clamp(savedSize?.width ?? WIDTH_DEFAULT, WIDTH_DEFAULT, MAX_SIZE.width));
    height.set(clamp(savedSize?.height ?? naturalHeight, naturalHeight, MAX_SIZE.height));
  }, [isDesktop, width, height]);

  function persistPos() {
    try { localStorage.setItem(POS_NOTE_POS_KEY, JSON.stringify({ x: x.get(), y: y.get() })); } catch { /* ignore */ }
  }

  function persistSize() {
    try { localStorage.setItem(POS_NOTE_SIZE_KEY, JSON.stringify({ width: width.get(), height: height.get() })); } catch { /* ignore */ }
  }

  function handleResizeStart(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    // height가 아직 'auto'(숫자 아님)인 순간에 잡으면 NaN이 되므로 실측값으로 대체
    const rect = panelRef.current?.getBoundingClientRect();
    const startWidth = Number(width.get());
    const startHeight = Number(height.get());
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: Number.isFinite(startWidth) ? startWidth : rect?.width ?? WIDTH_DEFAULT,
      height: Number.isFinite(startHeight) ? startHeight : rect?.height ?? minSizeRef.current.height,
    };
  }

  function handleResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = resizeStartRef.current;
    if (!start) return;
    const min = minSizeRef.current;
    width.set(clamp(start.width + (e.clientX - start.x), min.width, MAX_SIZE.width));
    height.set(clamp(start.height + (e.clientY - start.y), min.height, MAX_SIZE.height));
  }

  function handleResizeEnd() {
    if (!resizeStartRef.current) return;
    resizeStartRef.current = null;
    persistSize();
  }

  if (isDesktop === null) return null;

  if (isDesktop) {
    // 맥북: 항상 펼쳐진 채로 드래그해서 옮기거나 모서리를 드래그해 크기를 조절할 수 있는 플로팅 패널
    return (
      <motion.div
        ref={panelRef}
        drag
        dragMomentum={false}
        onDragEnd={persistPos}
        style={{ x, y, width, height, position: 'fixed', bottom: 16, right: 16, zIndex: 40 }}
        className="select-none flex flex-col bg-canvas rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.22)] border border-hairline overflow-hidden"
      >
        <div className="flex flex-col gap-0.5 px-3.5 py-2.5 bg-canvas-soft cursor-grab active:cursor-grabbing shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-extrabold text-ink shrink-0">공유 메모장</span>
            <MetaLine meta={note.meta} saving={note.saving} dirty={note.dirty} />
          </div>
          <EditingBadge names={editors} />
        </div>
        <div className="p-3 flex flex-col gap-2 flex-1 min-h-0" onPointerDownCapture={(e) => e.stopPropagation()}>
          <textarea
            value={note.content}
            onFocus={() => { note.onFocus(); notifyEditing(true); }}
            onBlur={() => { note.onBlur(); notifyEditing(false); }}
            onChange={(e) => note.onChange(e.target.value)}
            placeholder="예약, 공지 등을 적어두면 모든 POS 화면에서 볼 수 있어요 (자동 저장됩니다)"
            rows={5}
            className="w-full flex-1 min-h-0 resize-none border border-hairline rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-primary-700 transition"
            style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
          />
        </div>
        <div
          onPointerDownCapture={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize touch-none flex items-end justify-end p-0.5 text-ink-faint/60 hover:text-ink-faint transition-colors"
          aria-hidden="true"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <line x1="7" y1="1" x2="1" y2="7" />
            <line x1="7" y1="4.5" x2="4.5" y2="7" />
          </svg>
        </div>
      </motion.div>
    );
  }

  // 모바일: 결제하기 버튼을 가리지 않도록 페이지 맨 아래 일반 섹션으로 표시
  return (
    <section className="bg-canvas rounded-2xl p-3.5 shadow-level-1 border border-hairline mb-4" aria-label="POS 공유 메모">
      <div className="flex items-center justify-between mb-1">
        <h2 className="m-0 text-[16px] font-bold text-ink">공유 메모장</h2>
        <MetaLine meta={note.meta} saving={note.saving} dirty={note.dirty} />
      </div>
      <EditingBadge names={editors} />
      <textarea
        value={note.content}
        onFocus={() => { note.onFocus(); notifyEditing(true); }}
        onBlur={() => { note.onBlur(); notifyEditing(false); }}
        onChange={(e) => note.onChange(e.target.value)}
        placeholder="예약, 공지 등을 적어두면 모든 POS 화면에서 볼 수 있어요 (자동 저장됩니다)"
        rows={4}
        className="w-full resize-none border border-hairline rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-primary-700 transition"
        style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
      />
    </section>
  );
}
