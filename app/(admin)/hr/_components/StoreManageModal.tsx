'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { showMsg } from '@/lib/toast';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import ConfirmDialog from '@/components/ConfirmDialog';
import { createStore, renameStore, deleteStore } from '@/app/actions/stores';
import type { Store } from '@/types/database';

interface Props {
  stores: Store[];
  onStoresChange: (stores: Store[]) => void;
  onClose: () => void;
}

export default function StoreManageModal({ stores, onStoresChange, onClose }: Props) {
  useBodyScrollLock();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Store | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && !deleteTarget) onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, deleteTarget]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsBusy(true);
    const r = await createStore(newName);
    setIsBusy(false);
    if (r.success && r.data) {
      onStoresChange([...stores, r.data]);
      setNewName('');
      showMsg(`${r.data.name} 추가됨`);
    } else showMsg(`오류: ${r.error}`);
  };

  const handleRename = async (id: number) => {
    if (!editName.trim()) return;
    setIsBusy(true);
    const r = await renameStore(id, editName);
    setIsBusy(false);
    if (r.success && r.data) {
      onStoresChange(stores.map(s => s.id === id ? r.data! : s));
      setEditingId(null);
    } else showMsg(`오류: ${r.error}`);
  };

  const handleDelete = (store: Store) => {
    setDeleteTarget(store);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const store = deleteTarget;
    setDeleteTarget(null);
    setIsBusy(true);
    const r = await deleteStore(store.id);
    setIsBusy(false);
    if (r.success) {
      onStoresChange(stores.filter(s => s.id !== store.id));
      showMsg('삭제되었습니다');
    } else showMsg(`오류: ${r.error}`);
  };

  const inputCls = 'flex-1 px-3 py-2 border border-hairline rounded-lg text-[13px] bg-canvas focus:outline-none focus:border-primary-700';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-canvas w-full max-w-[400px] max-h-[85vh] overflow-y-auto rounded-xl shadow-level-2 border border-hairline p-5 [scrollbar-width:thin]"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="m-0 text-[16px] font-bold text-ink">매장 관리</h3>
          <button onClick={onClose} aria-label="닫기" className="bg-transparent border-none text-ink-faint text-lg cursor-pointer leading-none hover:text-ink transition">×</button>
        </div>

        {/* 추가 */}
        <form
          className="flex gap-1.5 mb-3"
          onSubmit={e => { e.preventDefault(); handleCreate(); }}
        >
          <input
            autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="매장 이름 (예: 한화 서울역)" className={inputCls}
          />
          <button
            type="submit" disabled={isBusy || !newName.trim()}
            className="px-3 py-2 rounded-lg border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-60"
          >
            추가
          </button>
        </form>

        {/* 목록 */}
        {stores.length === 0 ? (
          <p className="m-0 text-[12px] text-ink-faint">등록된 매장이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {stores.map(store => (
              <div key={store.id} className="flex items-center gap-1.5 bg-canvas-soft rounded-lg px-3 py-2">
                {editingId === store.id ? (
                  <>
                    <input
                      value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(store.id); if (e.key === 'Escape') setEditingId(null); }}
                      autoFocus className={inputCls}
                    />
                    <button
                      onClick={() => handleRename(store.id)} disabled={isBusy}
                      className="shrink-0 text-[11px] font-bold text-white bg-primary-700 border-none rounded px-2 py-1.5 cursor-pointer hover:bg-primary-800 transition disabled:opacity-60"
                    >
                      저장
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-[13px] font-semibold text-ink flex-1 min-w-0 truncate">{store.name}</span>
                    <button
                      onClick={() => { setEditingId(store.id); setEditName(store.name); }}
                      title="이름 변경"
                      className="shrink-0 bg-transparent border-none text-ink-faint cursor-pointer p-0.5 hover:text-primary-700 transition"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(store)}
                      title="삭제"
                      className="shrink-0 bg-transparent border-none text-ink-faint text-[15px] cursor-pointer leading-none hover:text-rose-500 transition"
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget != null}
        title={`"${deleteTarget?.name}" 매장을 삭제하시겠습니까?`}
        description="이 매장의 스케줄 데이터도 함께 삭제되고, 배속된 캐셔는 미배정이 됩니다."
        confirmLabel="삭제"
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>,
    document.body,
  );
}
