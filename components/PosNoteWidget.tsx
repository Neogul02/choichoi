'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import * as Y from 'yjs';
import { motion, useMotionValue } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { fetchPosNote, updatePosNote } from '@/app/actions/pos-note';
import {
  POS_NOTE_TEXT_KEY, diffText, transformIndex, authorColor, assignAuthorColors, deltaToRuns, overlayRuns,
  bytesToBase64, base64ToBytes, rebaseOntoServer, type AuthorRun, type TextDelta,
} from '@/lib/posNoteSync';

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
const SAVE_RETRY_MS = 3000;
// 알바생들이 매장 간 채팅처럼 한 줄씩 이어 쓰면서 2000자가 이틀 만에 거의 찼다(2026-10-14 1,889자).
// 막히면 누군가 남의 글을 지워야 해서 넉넉히 둔다 — 서버 한도(update 256KB)와 겹쳐 그리기 비용 모두 여유가 있다.
const MAX_CHARS = 10000;
// 이 비율을 넘으면 남은 글자 수를 보여준다 — 한도에 닿아 갑자기 입력이 안 되는 것처럼 보이지 않게
const CHAR_WARN_RATIO = 0.9;
// 맨 아래에서 이만큼(px) 안쪽이면 "최신 글을 보고 있는 중"으로 본다
const STICK_THRESHOLD_PX = 24;
// 트랜잭션 origin — 내 입력(LOCAL)인지 네트워크·DB에서 온 것(REMOTE)인지로 방송·저장·화면 갱신을 가른다
const LOCAL = 'local';
const REMOTE = 'remote';

interface NoteMeta { updated_by: string | null; updated_at: string }

// 공유 메모장 동시편집: 본문은 Y.Text(CRDT) 하나이고, 변경분은 Supabase Realtime broadcast(웹소켓)로
// 즉시 주고받는다. DB(pos_note.ydoc)는 새로 들어온 기기의 출발점이자 백업일 뿐이라 저장 주기와 무관하게
// 화면은 실시간으로 맞춰진다. pos_note는 RLS 정책이 없어 anon 클라이언트에 postgres_changes가 오지 않으므로
// DB 변경 구독에 기대지 않는다.
function useCollabNote(author: string | null, textareaRef: React.RefObject<HTMLTextAreaElement | null>) {
  // 서버가 문서를 압축하면(세대 epoch가 바뀌면) 옛 문서와 이어지지 않으므로 문서 자체를 갈아끼운다
  const [doc, setDoc] = useState(() => new Y.Doc());
  const ytext = doc.getText(POS_NOTE_TEXT_KEY);
  const [clientId] = useState(() => Math.random().toString(36).slice(2, 10));
  const [value, setValue] = useState('');
  const [runs, setRuns] = useState<AuthorRun[]>([]);
  const [meta, setMeta] = useState<NoteMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // 최초 로딩 중엔 빈 값이 "메모 없음"과 구분되지 않아 캐셔가 빈 것으로 오해하고 타이핑을 시작할 수 있음
  const [loading, setLoading] = useState(true);

  const authorRef = useRef(author);
  // 마지막으로 Y.Text와 맞춰진 화면 값. 로컬 변경 diff의 기준이다.
  const shownRef = useRef('');
  // 한글 조합 중에 textarea 값을 바꾸면 IME가 끊겨 글자가 깨진다. 조합 중 들어온 원격 변경은
  // 문서에만 반영하고 화면 갱신은 조합이 끝날 때까지 미루며, 그 delta로 로컬 변경 위치를 옮긴다.
  const composingRef = useRef(false);
  const deferredRef = useRef<TextDelta[]>([]);
  // Safari는 compositionend 뒤에 같은 값의 input을 한 번 더 보낸다. 그 사이 원격 변경이 화면에 반영됐으면
  // 그 값으로 diff해 남의 글을 되돌리게 되므로, 이미 반영한 조합 결과는 한 번 무시한다.
  const lastComposedRef = useRef<string | null>(null);
  const pendingSelRef = useRef<[number, number] | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const subscribedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const failToastShownRef = useRef(false);
  // 내 문서의 세대. null = 아직 서버에서 받지 않음 — 그 전에 오는 방송은 어느 세대인지 몰라 받지 않는다
  const epochRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  // 세대가 바뀌며 저장 안 된 내 수정을 새 문서에 다시 얹었으면, 새 문서의 리스너가 붙은 뒤 저장한다
  const saveAfterSwapRef = useRef(false);

  useEffect(() => { authorRef.current = author; }, [author]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const broadcast = useCallback((event: string, payload: Record<string, unknown>) => {
    const channel = channelRef.current;
    if (!channel || !subscribedRef.current) return; // 끊긴 동안의 변경은 재접속 시 sync로 맞춘다
    channel.send({ type: 'broadcast', event, payload: { ...payload, e: epochRef.current } });
  }, []);

  const syncDisplay = useCallback((text: string) => {
    shownRef.current = text;
    setValue(text);
    setRuns(deltaToRuns(ytext.toDelta()));
  }, [ytext]);

  // 서버 문서를 받는다. 같은 세대면 합치고(멱등), 세대가 바뀌었으면 서버 문서로 갈아타며 저장 안 된 내 수정만 다시 얹는다.
  const adopt = useCallback((note: { ydoc: string; epoch: number }) => {
    if (epochRef.current === null || epochRef.current === note.epoch) {
      epochRef.current = note.epoch;
      Y.applyUpdate(doc, base64ToBytes(note.ydoc), REMOTE);
      return;
    }
    const next = new Y.Doc();
    Y.applyUpdate(next, base64ToBytes(note.ydoc));
    saveAfterSwapRef.current = dirtyRef.current && rebaseOntoServer(next, shownRef.current, authorRef.current || null);
    epochRef.current = note.epoch;
    deferredRef.current = [];
    const text = next.getText(POS_NOTE_TEXT_KEY);
    shownRef.current = text.toString();
    setValue(text.toString());
    setRuns(deltaToRuns(text.toDelta()));
    setDoc(next);
  }, [doc]);
  const adoptRef = useRef(adopt);
  useEffect(() => { adoptRef.current = adopt; }, [adopt]);

  const save = useCallback(async () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    setSaving(true);
    const res = await updatePosNote(bytesToBase64(Y.encodeStateAsUpdate(doc)), authorRef.current ?? undefined, epochRef.current ?? undefined);
    setSaving(false);
    if (res.success && res.data) {
      // 서버가 합친 결과에는 놓친 방송이나 구버전 화면의 수정이 들어 있을 수 있다 — 합치기는 멱등이라 그냥 적용.
      // 세대가 바뀌었으면(내 저장이 합쳐지지 않았거나 서버가 방금 압축했으면) 갈아타고, 다시 얹은 수정은 이어서 저장된다.
      const stale = res.data.stale === true;
      adoptRef.current(res.data);
      if (stale) { setDirty(saveAfterSwapRef.current); return; }
      const m = { updated_by: res.data.updated_by, updated_at: res.data.updated_at };
      setMeta(m);
      setDirty(false);
      failToastShownRef.current = false;
      broadcast('meta', m);
    } else {
      // 문서는 이미 다른 기기와 공유됐으므로 저장만 다시 시도하면 된다 — 토스트는 연속 실패 시 한 번만
      if (!failToastShownRef.current) toast.error(`메모 저장 실패: ${res.error}`);
      failToastShownRef.current = true;
      saveTimerRef.current = setTimeout(() => saveRef.current(), SAVE_RETRY_MS);
    }
  }, [doc, broadcast]);
  useEffect(() => { saveRef.current = save; }, [save]);

  useEffect(() => {
    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return; // 받은 변경은 보낸 쪽이 방송·저장한다
      broadcast('update', { u: bytesToBase64(update) });
      setDirty(true);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveRef.current(), AUTOSAVE_DELAY_MS);
    };
    const onTextChange = (event: Y.YTextEvent) => {
      if (event.transaction.origin === LOCAL) return; // commitLocal이 화면을 이미 맞췄다
      const delta = event.delta as TextDelta;
      if (composingRef.current) { deferredRef.current.push(delta); return; }
      const el = textareaRef.current;
      if (el && document.activeElement === el) {
        pendingSelRef.current = [transformIndex(el.selectionStart, delta), transformIndex(el.selectionEnd, delta)];
      }
      syncDisplay(ytext.toString());
    };
    doc.on('update', onDocUpdate);
    ytext.observe(onTextChange);
    if (saveAfterSwapRef.current) {
      saveAfterSwapRef.current = false;
      setDirty(true);
      saveTimerRef.current = setTimeout(() => saveRef.current(), AUTOSAVE_DELAY_MS);
    }
    return () => { doc.off('update', onDocUpdate); ytext.unobserve(onTextChange); };
  }, [doc, ytext, broadcast, syncDisplay, textareaRef]);

  useEffect(() => {
    let cancelled = false;
    const loadFromDb = () => fetchPosNote().then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        adoptRef.current(res.data);
        setMeta({ updated_by: res.data.updated_by, updated_at: res.data.updated_at });
      }
      setLoading(false); // 조회 실패해도 입력은 계속 쓸 수 있어야 하므로 로딩 상태만 푼다
    });
    loadFromDb();

    // 처음 접속·재접속 때 서로 모르는 변경을 교환한다: 내가 state vector를 보내면 상대는
    // 내게 없는 부분과 자기 state vector를 답하고, 나는 상대에게 없는 부분을 다시 보낸다.
    const requestSync = () => broadcast('sync-req', { from: clientId, sv: bytesToBase64(Y.encodeStateVector(doc)) });
    // 다른 세대 문서의 변경은 합치지 않는다(압축 전 이력이 되살아난다). 상대가 더 새 세대면 서버 문서를 받아 따라간다.
    // e가 없는 방송은 세대 도입 전 화면(새로고침 안 한 탭)이 보낸 것이다.
    const sameEpoch = (payload: { e?: unknown }) => {
      const mine = epochRef.current;
      if (mine === null || payload.e === mine) return mine !== null;
      if (typeof payload.e === 'number' && payload.e > mine) loadFromDb();
      return false;
    };
    const channel = supabase.channel('pos-note-collab', { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'update' }, ({ payload }) => {
        if (!sameEpoch(payload)) return;
        Y.applyUpdate(doc, base64ToBytes(payload.u), REMOTE);
      })
      .on('broadcast', { event: 'sync-req' }, ({ payload }) => {
        if (!sameEpoch(payload)) return;
        broadcast('sync-res', {
          to: payload.from,
          u: bytesToBase64(Y.encodeStateAsUpdate(doc, base64ToBytes(payload.sv))),
          sv: bytesToBase64(Y.encodeStateVector(doc)),
        });
      })
      .on('broadcast', { event: 'sync-res' }, ({ payload }) => {
        if (!sameEpoch(payload)) return;
        Y.applyUpdate(doc, base64ToBytes(payload.u), REMOTE);
        if (payload.to !== clientId) return;
        const missing = Y.encodeStateAsUpdate(doc, base64ToBytes(payload.sv));
        // 빈 update는 2바이트([0,0]) — 상대가 이미 다 가진 경우 보낼 필요 없다
        if (missing.length > 2) broadcast('update', { u: bytesToBase64(missing) });
      })
      .on('broadcast', { event: 'meta' }, ({ payload }) => setMeta(payload as NoteMeta))
      .subscribe((status) => {
        subscribedRef.current = status === 'SUBSCRIBED';
        if (status === 'SUBSCRIBED') requestSync();
      });
    channelRef.current = channel;

    // 태블릿이 잠들었다 깨면 웹소켓이 끊겨 있던 사이 변경을 놓친다 — DB 상태를 합쳐 따라잡는다
    const onVisible = () => { if (document.visibilityState === 'visible') loadFromDb(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      subscribedRef.current = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [doc, clientId, broadcast]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  // 원격 변경으로 값이 바뀐 직후 커서를 옮겨 둔 위치로 복원한다
  useLayoutEffect(() => {
    const sel = pendingSelRef.current;
    const el = textareaRef.current;
    if (!sel || !el) return;
    pendingSelRef.current = null;
    el.setSelectionRange(sel[0], sel[1]);
  }, [value, textareaRef]);

  const commitLocal = useCallback((next: string) => {
    const deferred = deferredRef.current;
    deferredRef.current = [];
    const d = diffText(shownRef.current, next);
    let start = d.index;
    let end = d.index + d.remove;
    for (const delta of deferred) {
      start = transformIndex(start, delta);
      end = transformIndex(end, delta);
    }
    const len = ytext.length;
    start = Math.min(start, len);
    end = Math.min(Math.max(end, start), len);
    if (end > start || d.insert) {
      doc.transact(() => {
        if (end > start) ytext.delete(start, end - start);
        // author를 명시하지 않으면 Y.Text는 앞 글자의 속성을 이어받아 남의 색으로 칠해진다
        if (d.insert) ytext.insert(start, d.insert, { author: authorRef.current || null });
      }, LOCAL);
    }
    const merged = ytext.toString();
    if (merged !== next) {
      const el = textareaRef.current;
      if (el && document.activeElement === el) {
        const caret = start + d.insert.length;
        pendingSelRef.current = [caret, caret];
      }
    }
    syncDisplay(merged);
  }, [doc, ytext, syncDisplay, textareaRef]);

  const undoManager = useMemo(() => new Y.UndoManager(ytext, { trackedOrigins: new Set([LOCAL]) }), [ytext]);
  useEffect(() => () => undoManager.destroy(), [undoManager]);

  return {
    value,
    runs,
    meta, saving, dirty, loading,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      const composed = lastComposedRef.current;
      lastComposedRef.current = null;
      if (next === composed) return;
      if (composingRef.current || (e.nativeEvent as InputEvent).isComposing) {
        setValue(next); // 조합 중엔 화면만 따라가고 문서 반영은 compositionend에서
        return;
      }
      commitLocal(next);
    },
    onCompositionStart: () => { composingRef.current = true; },
    onCompositionEnd: (e: React.CompositionEvent<HTMLTextAreaElement>) => {
      composingRef.current = false;
      lastComposedRef.current = e.currentTarget.value;
      commitLocal(e.currentTarget.value);
    },
    // textarea 기본 실행취소는 원격 변경으로 값이 바뀌면 남의 글까지 되돌리므로 내 입력만 되돌린다
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!(e.metaKey || e.ctrlKey) || composingRef.current) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undoManager.undo(); }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); undoManager.redo(); }
    },
    onBlur: () => {
      if (saveTimerRef.current) save();
    },
  };
}

type CollabNote = ReturnType<typeof useCollabNote>;
type AuthorColors = Map<string, string>;

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

function EditingBadge({ names, colors }: { names: string[]; colors: AuthorColors }) {
  if (names.length === 0) return null;
  return (
    <div className="flex items-center gap-1 text-[10px] font-semibold text-primary-700 mb-1.5 min-w-0">
      <span className="w-1.5 h-1.5 rounded-full bg-primary-700 animate-pulse shrink-0" />
      <span className="truncate">
        {names.map((n, i) => (
          <span key={n} style={{ color: authorColor(n, colors) ?? undefined }}>{i > 0 ? ', ' : ''}{n}</span>
        ))}
        님 입력 중
      </span>
    </div>
  );
}

// 글자색만으로는 누가 누군지 알 수 없으므로 메모에 글이 남아 있는 사람을 색과 함께 나열한다.
// 최근에 쓴 사람이 앞에 온다(runs를 뒤에서부터 훑는다). 작성자 없는 글(동시편집 이전 글)은 빼고,
// 한도에 가까워지면 남은 글자 수를 같은 줄 오른쪽에 보여준다.
function NoteFooter({ runs, length, colors }: { runs: AuthorRun[]; length: number; colors: AuthorColors }) {
  const authors: string[] = [];
  for (let i = runs.length - 1; i >= 0; i--) {
    const a = runs[i].author;
    if (a && !authors.includes(a)) authors.push(a);
  }
  const remaining = MAX_CHARS - length;
  const warn = length >= MAX_CHARS * CHAR_WARN_RATIO;
  if (authors.length === 0 && !warn) return null;
  return (
    <div className="flex items-start justify-between gap-2 text-[10px] font-semibold min-w-0">
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 min-w-0">
        {authors.map((a) => (
          <span key={a} className="flex items-center gap-1" style={{ color: authorColor(a, colors) ?? undefined }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: authorColor(a, colors) ?? undefined }} />
            {a}
          </span>
        ))}
      </div>
      {warn && (
        <span className={`shrink-0 ${remaining <= 0 ? 'text-red-600' : 'text-ink-faint'}`}>
          {remaining <= 0 ? '가득 참 — 지난 글을 지워주세요' : `${remaining.toLocaleString()}자 남음`}
        </span>
      )}
    </div>
  );
}

const PLACEHOLDER ='예약, 공지 등을 적어두면 모든 POS 화면에서 볼 수 있어요 (자동 저장·동시 편집)';
// textarea와 색칠 레이어가 글자 단위로 겹쳐야 하므로 줄바꿈에 영향을 주는 속성은 둘이 반드시 같아야 한다.
// scrollbar-gutter: 스크롤바가 생길 때 textarea만 폭이 줄어 줄바꿈 위치가 어긋나는 것을 막는다.
const EDITOR_TEXT = 'px-3 py-2 text-[13px] leading-[1.5] whitespace-pre-wrap break-words border';
const EDITOR_GUTTER = { scrollbarGutter: 'stable' } as const;

// 작성자별 글자색: textarea 글자는 투명하게 두고(커서·선택·IME는 textarea가 그대로 담당),
// 같은 위치에 겹친 레이어가 Y.Text의 작성자 속성대로 색칠한 글자를 보여준다.
function NoteEditor({ note, colors, textareaRef, author, rows, className, onFocusChange }: {
  note: CollabNote;
  colors: AuthorColors;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  author: string | null;
  rows: number;
  className?: string;
  onFocusChange: (focused: boolean) => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  // 채팅처럼 아래로 이어 쓰는 메모라 최신 글은 맨 아래에 있다. 맨 아래를 보고 있었다면(처음 열 때 포함)
  // 새 글이 붙어도 계속 맨 아래를 보여준다 — 위로 올려 지난 글을 읽는 중이면 건드리지 않는다.
  const stickRef = useRef(true);
  const shown = overlayRuns(note.runs, note.value, author || null);

  const syncScroll = () => {
    const el = textareaRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX;
    if (backdropRef.current) backdropRef.current.scrollTop = el.scrollTop;
  };
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
    syncScroll();
  });

  return (
    <div className={`relative ${className ?? ''}`}>
      <div
        ref={backdropRef}
        aria-hidden="true"
        className={`absolute inset-0 overflow-hidden rounded-xl border-transparent text-ink pointer-events-none ${EDITOR_TEXT}`}
        style={EDITOR_GUTTER}
      >
        {shown.map((run, i) => (
          <span key={i} style={{ color: authorColor(run.author, colors) ?? undefined }}>{run.text}</span>
        ))}
        {/* 끝 줄바꿈은 빈 줄로 그려지지 않으므로 textarea와 높이를 맞추려 한 글자 덧붙인다 */}
        {'\u200b'}
      </div>
      <textarea
        ref={textareaRef}
        value={note.value}
        onChange={note.onChange}
        onCompositionStart={note.onCompositionStart}
        onCompositionEnd={note.onCompositionEnd}
        onKeyDown={note.onKeyDown}
        onScroll={syncScroll}
        onFocus={() => onFocusChange(true)}
        onBlur={() => { note.onBlur(); onFocusChange(false); }}
        placeholder={note.loading ? '불러오는 중...' : PLACEHOLDER}
        disabled={note.loading}
        maxLength={MAX_CHARS}
        rows={rows}
        spellCheck={false}
        className={`relative block w-full h-full resize-none rounded-xl border-hairline bg-transparent text-transparent caret-ink placeholder:text-ink-faint selection:bg-primary-700/20 focus:outline-none focus:border-primary-700 transition-colors ${EDITOR_TEXT}`}
        style={{ ...EDITOR_GUTTER, userSelect: 'text', WebkitUserSelect: 'text' }}
      />
    </div>
  );
}

export default function PosNoteWidget({ cashierName }: { cashierName?: string | null }) {
  const isDesktop = useIsDesktop();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const note = useCollabNote(cashierName ?? null, textareaRef);
  // 색 배정은 메모에 글이 있는 사람 전체를 보고 정해야 겹치지 않는다 — 본문·범례·입력 중 표시가 같은 표를 쓴다
  const colors = useMemo(
    () => assignAuthorColors(note.runs.flatMap((r) => (r.author ? [r.author] : []))),
    [note.runs],
  );
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
          <EditingBadge names={editors} colors={colors} />
        </div>
        <div className="p-3 flex flex-col gap-2 flex-1 min-h-0" onPointerDownCapture={(e) => e.stopPropagation()}>
          <NoteEditor
            note={note}
            colors={colors}
            textareaRef={textareaRef}
            author={cashierName ?? null}
            rows={5}
            className="flex-1 min-h-0"
            onFocusChange={notifyEditing}
          />
          <NoteFooter runs={note.runs} length={note.value.length} colors={colors} />
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
      <EditingBadge names={editors} colors={colors} />
      <NoteEditor note={note} colors={colors} textareaRef={textareaRef} author={cashierName ?? null} rows={4} onFocusChange={notifyEditing} />
      <div className="mt-2">
        <NoteFooter runs={note.runs} length={note.value.length} colors={colors} />
      </div>
    </section>
  );
}
