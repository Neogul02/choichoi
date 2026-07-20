'use client';

import NavBar from '@/components/NavBar';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchAllMemos, createNewMemo, editMemo, removeMemo, toggleMemoPinned } from '@/app/actions/memos';
import MemoDetailModal from './MemoDetailModal';
import type { Memo } from '@/types/database';

const MEMO_COLORS: Array<{ name: string; value: string }> = [
  { name: '흰색', value: '#ffffff' },
  { name: '노랑', value: '#fff9c4' },
  { name: '초록', value: '#e8f5e9' },
  { name: '파랑', value: '#e3f2fd' },
  { name: '분홍', value: '#fce4ec' },
  { name: '보라', value: '#f3e5f5' },
];

const DEFAULT_MEMO_COLOR = '#fff9c4';

export function parseChecklist(content: string) {
  return content.split('\n').filter(Boolean).map((line) => ({
    done: line.startsWith('[x]'),
    text: line.replace(/^\[.\] ?/, ''),
  }));
}

export function serializeChecklist(items: { done: boolean; text: string }[]) {
  return items.map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`).join('\n');
}

function ChecklistPreview({ content }: { content: string }) {
  const items = parseChecklist(content);
  const doneCount = items.filter((i) => i.done).length;
  return (
    <div className="grow overflow-hidden min-h-0">
      <ul className="m-0 p-0 list-none space-y-1 mb-2">
        {items.slice(0, 4).map((item, idx) => (
          <li key={idx} className="flex items-center gap-1.5 text-sm leading-snug">
            <span className={`shrink-0 text-base ${item.done ? 'text-primary-700' : 'text-ink-faint'}`}>
              {item.done ? '☑' : '☐'}
            </span>
            <span className={`truncate ${item.done ? 'line-through text-ink-faint' : 'text-ink-secondary'}`}>
              {item.text}
            </span>
          </li>
        ))}
        {items.length > 4 && (
          <li className="text-xs text-ink-faint">+{items.length - 4}개 더</li>
        )}
      </ul>
      <span className="text-xs font-semibold text-primary-700 bg-primary-700/10 px-1.5 py-0.5 rounded-full">
        {doneCount}/{items.length} 완료
      </span>
    </div>
  );
}

// 초기 메모 목록은 서버 컴포넌트(page.tsx)가 조회해 initialData로 주입 — 마운트 후 왕복 제거
export default function MemoPageClient({ initialMemos }: { initialMemos: Memo[] | null }) {
  const queryClient = useQueryClient();
  const [createMode, setCreateMode] = useState(false);
  const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);

  const { data: memos = [], isLoading } = useQuery<Memo[]>({
    queryKey: ['memos'],
    queryFn: async () => {
      const r = await fetchAllMemos();
      if (!r.success) throw new Error(r.error);
      return r.data ?? [];
    },
    // 서버 프리페치 성공 시 초기 로딩·재조회 생략 (staleTime 5분은 전역 기본값)
    ...(initialMemos ? { initialData: initialMemos } : {}),
  });

  const pinMutation = useMutation({
    mutationFn: async ({ id, isPinned }: { id: number; isPinned: boolean }) => {
      const r = await toggleMemoPinned(id, isPinned);
      if (!r.success) throw new Error(r.error);
      return r.data!;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Memo[]>(['memos'], (prev = []) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setSelectedMemo((prev) => (prev?.id === updated.id ? updated : prev));
    },
    onError: (e) => toast.error(`오류: ${e.message}`),
  });

  const handleCreate = async (title: string, content: string, color: string, type: 'note' | 'checklist') => {
    const r = await createNewMemo(title, content, color, type);
    if (r.success && r.data) {
      queryClient.setQueryData<Memo[]>(['memos'], (prev = []) => [r.data!, ...prev]);
    }
    return r;
  };

  const handleEdit = async (title: string, content: string, color: string, type: 'note' | 'checklist') => {
    if (!selectedMemo) return { success: false, error: '선택된 메모가 없습니다' };
    const r = await editMemo(selectedMemo.id, title, content, color, type);
    if (r.success && r.data) {
      queryClient.setQueryData<Memo[]>(['memos'], (prev = []) => prev.map((m) => (m.id === r.data!.id ? r.data! : m)));
    }
    return r;
  };

  const handleRemove = async () => {
    if (!selectedMemo) return { success: false, error: '선택된 메모가 없습니다' };
    const r = await removeMemo(selectedMemo.id);
    if (r.success) {
      queryClient.setQueryData<Memo[]>(['memos'], (prev = []) => prev.filter((m) => m.id !== selectedMemo.id));
      setSelectedMemo(null);
    }
    return r;
  };

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        <div className="max-w-[1100px] mx-auto">
          <div className="flex justify-between items-center mb-5">
            <h2 className="m-0 text-heading-1 text-ink">메모</h2>
            <button
              className="px-4 py-2 rounded-lg border-none bg-primary-700 text-white font-bold cursor-pointer transition-all duration-200 hover:bg-primary-800"
              onClick={() => setCreateMode(true)}
            >
              + 새 메모
            </button>
          </div>

          {isLoading ? (
            <div className="animate-pulse grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-lg p-4 bg-gray-100 h-40" />
              ))}
            </div>
          ) : memos.length === 0 ? (
            <p className="m-0 text-ink-faint text-sm">메모가 없습니다. 새 메모를 추가하세요.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
              {memos.map((memo) => (
                <div
                  key={memo.id}
                  onClick={() => setSelectedMemo(memo)}
                  className="min-w-0 overflow-hidden rounded-lg p-4 shadow-level-1 flex flex-col h-[200px] transition-all duration-200 border border-hairline hover:-translate-y-0.5 hover:shadow-level-2 cursor-pointer relative"
                  style={{ backgroundColor: memo.color || DEFAULT_MEMO_COLOR }}
                >
                  {memo.is_pinned && (
                    <div className="absolute top-2 right-2 text-lg">📌</div>
                  )}
                  {memo.title && (
                    <h3 className="m-0 mb-2 text-base font-bold text-[#111] truncate shrink-0 pr-6">
                      {memo.title}
                    </h3>
                  )}
                  {memo.type === 'checklist' ? (
                    <ChecklistPreview content={memo.content} />
                  ) : (
                    <p className="m-0 mb-1.5 text-sm leading-relaxed text-ink-secondary whitespace-pre-wrap break-words [overflow-wrap:anywhere] line-clamp-4 grow">
                      {memo.content}
                    </p>
                  )}
                  <div className="flex justify-between items-center mt-auto pt-3 border-t border-black/5 shrink-0">
                    <span className="text-xs text-ink-muted">
                      {new Date(memo.updated_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {createMode && (
        <MemoDetailModal
          onClose={() => setCreateMode(false)}
          onSaved={() => setCreateMode(false)}
          onSubmit={handleCreate}
          MEMO_COLORS={MEMO_COLORS}
        />
      )}

      {selectedMemo && (
        <MemoDetailModal
          memo={selectedMemo}
          onClose={() => setSelectedMemo(null)}
          onSaved={(updated) => setSelectedMemo(updated)}
          onRemove={handleRemove}
          onPin={(isPinned) => pinMutation.mutate({ id: selectedMemo.id, isPinned })}
          onSubmit={handleEdit}
          MEMO_COLORS={MEMO_COLORS}
        />
      )}
    </>
  );
}
