'use client';

import NavBar from '@/components/NavBar';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchAllMemos, createNewMemo, editMemo, removeMemo, toggleMemoPinned } from '@/app/actions/memos';
import MemoDetailModal from './MemoDetailModal';
import type { Memo } from '@/types/database';

type MemoFormData = { title: string; content: string; color: string };

const MEMO_COLORS: Array<{ name: string; value: string }> = [
  { name: '흰색', value: '#ffffff' },
  { name: '노랑', value: '#fff9c4' },
  { name: '초록', value: '#e8f5e9' },
  { name: '파랑', value: '#e3f2fd' },
  { name: '분홍', value: '#fce4ec' },
  { name: '보라', value: '#f3e5f5' },
];

const DEFAULT_MEMO_COLOR = '#fff9c4';
const INITIAL_FORM: MemoFormData = { title: '', content: '', color: DEFAULT_MEMO_COLOR };

export default function MemoPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<MemoFormData>(INITIAL_FORM);
  const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);

  const { data: memos = [], isLoading } = useQuery<Memo[]>({
    queryKey: ['memos'],
    queryFn: async () => {
      const r = await fetchAllMemos();
      if (!r.success) throw new Error(r.error);
      return r.data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await createNewMemo(formData.title, formData.content, formData.color);
      if (!r.success) throw new Error(r.error);
      return r.data!;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<Memo[]>(['memos'], (prev = []) => [saved, ...prev]);
      toast.success('메모가 추가되었습니다');
      resetForm();
    },
    onError: (e) => toast.error(`오류: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await removeMemo(id);
      if (!r.success) throw new Error(r.error);
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<Memo[]>(['memos'], (prev = []) => prev.filter((m) => m.id !== id));
      toast.success('메모가 삭제되었습니다');
    },
    onError: (e) => toast.error(`오류: ${e.message}`),
  });

  const pinMutation = useMutation({
    mutationFn: async ({ id, isPinned }: { id: number; isPinned: boolean }) => {
      const r = await toggleMemoPinned(id, isPinned);
      if (!r.success) throw new Error(r.error);
      return r.data!;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Memo[]>(['memos'], (prev = []) => prev.map((m) => (m.id === updated.id ? updated : m)));
    },
    onError: (e) => toast.error(`오류: ${e.message}`),
  });

  const resetForm = () => { setFormData(INITIAL_FORM); setShowForm(false); };

  const handleSave = () => {
    if (!formData.content.trim()) { toast.error('내용을 입력해주세요'); return; }
    saveMutation.mutate();
  };

  const handleEditMemo = async (id: number, title: string, content: string, color: string) => {
    const r = await editMemo(id, title, content, color);
    if (r.success && r.data) {
      queryClient.setQueryData<Memo[]>(['memos'], (prev = []) => prev.map((m) => (m.id === id ? r.data! : m)));
    }
    return r;
  };

  const handleRemoveMemo = async (id: number) => {
    const r = await removeMemo(id);
    if (r.success) {
      queryClient.setQueryData<Memo[]>(['memos'], (prev = []) => prev.filter((m) => m.id !== id));
    }
    return r;
  };

  const handlePin = async (isPinned: boolean) => {
    if (!selectedMemo) return;
    const updated = await pinMutation.mutateAsync({ id: selectedMemo.id, isPinned });
    setSelectedMemo(updated);
  };

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        <div className="max-w-[1100px] mx-auto">
          <div className="flex justify-between items-center mb-5">
            <h2 className="m-0 text-heading-1 text-ink">메모</h2>
            {!showForm && (
              <button
                className="px-4 py-2 rounded-lg border-none bg-primary-700 text-white font-bold cursor-pointer transition-all duration-200 hover:bg-primary-800"
                onClick={() => { resetForm(); setShowForm(true); }}
              >
                + 새 메모
              </button>
            )}
          </div>

          {showForm && (
            <div className="bg-canvas rounded-xl p-5 md:p-7 mb-6 shadow-level-1 border border-hairline">
              <h3 className="m-0 mb-4 text-xl font-bold text-ink">새 메모 작성</h3>

              <input
                type="text"
                placeholder="제목 (선택)"
                value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                className="w-full border border-hairline rounded-lg px-4 py-3 text-base font-[inherit] mb-3 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10"
              />

              <textarea
                placeholder="내용을 입력하세요..."
                value={formData.content}
                onChange={(e) => setFormData((p) => ({ ...p, content: e.target.value }))}
                rows={10}
                className="w-full border border-hairline rounded-lg px-4 py-3 text-base font-[inherit] mb-3 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10 resize-y min-h-[200px]"
              />

              <div className="flex items-center gap-2.5 mb-5">
                <span className="text-[13px] font-semibold text-ink-muted">배경색</span>
                {MEMO_COLORS.map((c) => (
                  <button
                    key={c.value}
                    className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-transform duration-200 p-0 ${formData.color === c.value ? 'border-[#111] scale-110 shadow-[0_0_0_2px_rgba(0,0,0,0.12)]' : 'border-hairline hover:scale-105'}`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setFormData((p) => ({ ...p, color: c.value }))}
                    aria-label={c.name}
                    type="button"
                  />
                ))}
              </div>

              <div
                className="rounded-lg px-5 py-4 mb-5 min-h-[100px] border border-black/5 overflow-hidden"
                style={{ backgroundColor: formData.color }}
              >
                <p className="m-0 mb-0.5 text-[11px] font-semibold text-ink-faint uppercase tracking-wide">미리보기</p>
                {formData.title && (
                  <strong className="block mt-1.5 mb-2 text-base font-bold text-[#111] break-words [overflow-wrap:anywhere]">
                    {formData.title}
                  </strong>
                )}
                <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary break-words [overflow-wrap:anywhere]">
                  {formData.content || '내용이 여기에 표시됩니다...'}
                </p>
              </div>

              <div className="flex gap-2.5">
                <button
                  className="flex-1 py-3 rounded-lg border-none font-bold cursor-pointer text-sm bg-primary-700 text-white transition hover:bg-primary-800 disabled:opacity-60"
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                >
                  메모 추가
                </button>
                <button
                  className="flex-1 py-3 rounded-lg border-none font-bold cursor-pointer text-sm bg-canvas-soft text-ink-muted transition hover:bg-[#ececeb]"
                  onClick={resetForm}
                >
                  취소
                </button>
              </div>
            </div>
          )}

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
                  className="min-w-0 overflow-hidden rounded-lg p-4 shadow-level-1 flex flex-col h-[188px] transition-all duration-200 border border-hairline hover:-translate-y-0.5 hover:shadow-level-2 cursor-pointer relative"
                  style={{ backgroundColor: memo.color || DEFAULT_MEMO_COLOR }}
                >
                  {memo.is_pinned && (
                    <div className="absolute top-2 right-2 text-lg">📌</div>
                  )}
                  {memo.title && (
                    <h3 className="m-0 mb-1.5 text-base font-bold text-[#111] line-clamp-1 pr-6">
                      {memo.title}
                    </h3>
                  )}
                  <p className="m-0 mb-3 text-sm leading-relaxed text-ink-secondary whitespace-pre-wrap break-words [overflow-wrap:anywhere] line-clamp-4 grow">
                    {memo.content}
                  </p>
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

      {selectedMemo && (
        <MemoDetailModal
          memo={selectedMemo}
          onClose={() => setSelectedMemo(null)}
          onSaved={(updated) => setSelectedMemo(updated)}
          onDeleted={() => setSelectedMemo(null)}
          onPin={(isPinned) => handlePin(isPinned)}
          editMemo={handleEditMemo}
          removeMemo={handleRemoveMemo}
          MEMO_COLORS={MEMO_COLORS}
        />
      )}
    </>
  );
}
