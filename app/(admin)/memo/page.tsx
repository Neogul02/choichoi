'use client';

import NavBar from '@/components/NavBar';
import { useEffect, useState } from 'react';
import { fetchAllMemos, createNewMemo, editMemo, removeMemo } from '../actions';
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
  const [memos, setMemos] = useState<Memo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<MemoFormData>(INITIAL_FORM);
  const [message, setMessage] = useState('');

  const loadMemos = async () => {
    setIsLoading(true);
    const result = await fetchAllMemos();
    if (result.success && result.data) setMemos(result.data);
    setIsLoading(false);
  };

  useEffect(() => { loadMemos(); }, []);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2500);
  };

  const handleSave = async () => {
    if (!formData.content.trim()) { showMessage('내용을 입력해주세요'); return; }

    if (editingId !== null) {
      const result = await editMemo(editingId, formData.title, formData.content, formData.color);
      if (result.success && result.data) {
        setMemos((prev) => prev.map((m) => (m.id === editingId ? result.data! : m)));
        showMessage('메모가 수정되었습니다');
      } else {
        showMessage(`오류: ${result.error}`);
        return;
      }
    } else {
      const result = await createNewMemo(formData.title, formData.content, formData.color);
      if (result.success && result.data) {
        setMemos((prev) => [result.data!, ...prev]);
        showMessage('메모가 추가되었습니다');
      } else {
        showMessage(`오류: ${result.error}`);
        return;
      }
    }

    resetForm();
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setShowForm(false);
  };

  const handleEditStart = (memo: Memo) => {
    setEditingId(memo.id);
    setFormData({ title: memo.title || '', content: memo.content, color: memo.color || DEFAULT_MEMO_COLOR });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('이 메모를 삭제하시겠습니까?')) return;
    const result = await removeMemo(id);
    if (result.success) {
      setMemos((prev) => prev.filter((m) => m.id !== id));
      showMessage('메모가 삭제되었습니다');
    } else {
      showMessage(`오류: ${result.error}`);
    }
  };

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        <div className="max-w-[1100px] mx-auto">
          <div className="flex justify-between items-center mb-5">
            <h2 className="m-0 text-2xl font-extrabold">메모</h2>
            {!showForm && (
              <button className="px-4 py-2 rounded-lg border-none bg-primary-700 text-white font-bold cursor-pointer transition-all duration-200 hover:bg-primary-800" onClick={() => { resetForm(); setShowForm(true); }}>
                + 새 메모
              </button>
            )}
          </div>

          {message && (
            <div className={`p-3 mb-4 rounded-lg text-center font-semibold ${message.includes('오류') ? 'bg-[#f8d7da] text-[#721c24] border border-[#f5c6cb]' : 'bg-[#d4edda] text-[#155724] border border-[#c3e6cb]'}`}>
              {message}
            </div>
          )}

          {showForm && (
            <div className="bg-white rounded-xl p-5 mb-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
              <h3 className="m-0 mb-3 text-lg font-bold text-[#111]">{editingId ? '메모 수정' : '새 메모 작성'}</h3>
              <input type="text" placeholder="제목 (선택)" value={formData.title} onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))} className="w-full border border-[#ddd] rounded-lg p-3 text-sm font-[inherit] mb-3 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10" />
              <textarea placeholder="내용을 입력하세요..." value={formData.content} onChange={(e) => setFormData((p) => ({ ...p, content: e.target.value }))} rows={5} className="w-full border border-[#ddd] rounded-lg p-3 text-sm font-[inherit] mb-3 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10" />
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[13px] font-semibold text-[#555] mr-2">배경색</span>
                {MEMO_COLORS.map((c) => (
                  <button key={c.value} className={`w-6 h-6 rounded-full border-2 border-[#ddd] cursor-pointer transition-transform duration-200 p-0 ${formData.color === c.value ? 'border-[#111] scale-110 shadow-[0_0_0_2px_rgba(0,0,0,0.1)]' : ''}`} style={{ backgroundColor: c.value }} onClick={() => setFormData((p) => ({ ...p, color: c.value }))} aria-label={c.name} type="button" />
                ))}
              </div>
              <div className="p-4 rounded-lg mb-4 min-h-[80px] border border-black/5" style={{ backgroundColor: formData.color }}>
                {formData.title && <strong className="block mb-2 text-base">{formData.title}</strong>}
                <p className="m-0 whitespace-pre-wrap text-sm leading-[1.5] text-[#333]">{formData.content || '미리보기...'}</p>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 p-2.5 rounded-lg border-none font-bold cursor-pointer text-sm bg-primary-700 text-white transition hover:bg-primary-800" onClick={handleSave}>{editingId ? '수정 완료' : '메모 추가'}</button>
                <button className="flex-1 p-2.5 rounded-lg border-none font-bold cursor-pointer text-sm bg-[#ddd] text-[#333] transition hover:bg-[#ccc]" onClick={resetForm}>취소</button>
              </div>
            </div>
          )}

          {isLoading ? (
            <p>불러오는 중...</p>
          ) : memos.length === 0 ? (
            <p className="m-0 text-[#999] text-sm">메모가 없습니다. 새 메모를 추가하세요.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
              {memos.map((memo) => (
                <div key={memo.id} className="rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)] flex flex-col transition-all duration-200 border border-black/5 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.1)]" style={{ backgroundColor: memo.color || DEFAULT_MEMO_COLOR }}>
                  {memo.title && <h3 className="m-0 mb-2 text-base font-bold text-[#111]">{memo.title}</h3>}
                  <p className="m-0 mb-4 text-sm leading-[1.5] text-[#333] whitespace-pre-wrap grow">{memo.content}</p>
                  <div className="flex justify-between items-end mt-auto pt-3 border-t border-black/5">
                    <span className="text-xs text-[#666]">{new Date(memo.updated_at).toLocaleDateString('ko-KR')}</span>
                    <div className="flex gap-1.5">
                      <button className="px-3 py-1.5 border-none rounded-md text-xs font-semibold cursor-pointer transition bg-[#3498db] text-white hover:bg-[#2980b9]" onClick={() => handleEditStart(memo)}>수정</button>
                      <button className="px-3 py-1.5 border-none rounded-md text-xs font-semibold cursor-pointer transition bg-[#ff6b6b] text-white hover:bg-[#ff5252]" onClick={() => handleDelete(memo.id)}>삭제</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
