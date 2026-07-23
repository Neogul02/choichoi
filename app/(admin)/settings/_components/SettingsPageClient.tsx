'use client';

import NavBar from '@/components/NavBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getAllMenu, createNewMenuItem, editMenuItem, removeMenuItem, reorderMenuItems } from '@/app/actions/menu';
import type { MenuItem } from '@/types/database';
import DevToolsSection from './DevToolsSection';
import UserManagementSection from './UserManagementSection';
import PopupManagementSection from './PopupManagementSection';

type ActiveTab = 'menu' | 'popups' | 'devtools' | 'users';
type ColorOption = { name: string; value: string };

const COLOR_PALETTE: ColorOption[] = [
  { name: '빨강', value: '#E53935' },
  { name: '주황', value: '#FB8C00' },
  { name: '노랑', value: '#FDD835' },
  { name: '초록', value: '#7CB342' },
  { name: '하늘', value: '#00ACC1' },
  { name: '파랑', value: '#1E88E5' },
  { name: '남색', value: '#3949AB' },
  { name: '보라', value: '#8E24AA' },
];

const INITIAL_ADD = { name: '', price: '', color: COLOR_PALETTE[0].value, isDiscount: false };

type InlineEdit = { name: string; price: string; color: string; isDiscount: boolean };

// 초기 메뉴 목록은 서버 컴포넌트(page.tsx)가 조회해 내려준다 — 마운트 후 왕복 제거
export default function SettingsPageClient({ initialMenuItems }: { initialMenuItems: MenuItem[] | null }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('menu');
  const [menuItems, setMenuItems] = useState<MenuItem[]>(initialMenuItems ?? []);
  const [isLoading, setIsLoading] = useState(initialMenuItems == null);
  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState(INITIAL_ADD);

  // 인라인 편집: id → 편집 중인 값
  const [inlineEdits, setInlineEdits] = useState<Record<number, InlineEdit>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  // 드래그
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  // 삭제 확인
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  useEffect(() => {
    if (initialMenuItems != null) return; // 서버 프리페치 성공 시 재조회 생략
    getAllMenu().then(r => {
      if (r.success && r.data) setMenuItems(r.data);
      setIsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeMenuItems = useMemo(() => menuItems.filter(m => m.is_active), [menuItems]);

  // ── 추가 ──────────────────────────────────────────────
  const handleAdd = async () => {
    if (!addForm.name || !addForm.price) { toast.error('이름과 가격을 입력하세요'); return; }
    const magnitude = parseFloat(addForm.price);
    if (isNaN(magnitude) || magnitude <= 0) { toast.error('가격은 0보다 큰 숫자여야 합니다'); return; }
    const price = addForm.isDiscount ? -magnitude : magnitude;
    setIsAdding(true);
    const res = await createNewMenuItem(addForm.name, price, addForm.color);
    setIsAdding(false);
    if (res.success && res.data) {
      setMenuItems(p => [...p, res.data!]);
      setAddForm(INITIAL_ADD);
      toast.success('메뉴가 추가됐습니다');
    } else {
      toast.error(`오류: ${res.error}`);
    }
  };

  // ── 인라인 수정 시작 ───────────────────────────────────
  const startEdit = (item: MenuItem) => {
    setInlineEdits(p => ({
      ...p,
      [item.id]: {
        name: item.name,
        price: String(Math.abs(item.price)),
        color: COLOR_PALETTE.some(c => c.value === item.color) ? item.color : COLOR_PALETTE[0].value,
        isDiscount: item.price < 0,
      },
    }));
  };

  const cancelEdit = (id: number) => {
    setInlineEdits(p => { const n = { ...p }; delete n[id]; return n; });
  };

  const saveEdit = async (id: number) => {
    const draft = inlineEdits[id];
    if (!draft) return;
    if (!draft.name || !draft.price) { toast.error('이름과 가격을 입력하세요'); return; }
    const magnitude = parseFloat(draft.price);
    if (isNaN(magnitude) || magnitude <= 0) { toast.error('가격은 0보다 큰 숫자여야 합니다'); return; }
    const price = draft.isDiscount ? -magnitude : magnitude;
    setSavingId(id);
    const res = await editMenuItem(id, draft.name, price, draft.color);
    setSavingId(null);
    if (res.success && res.data) {
      setMenuItems(p => p.map(m => m.id === id ? res.data! : m));
      cancelEdit(id);
      toast.success('수정됐습니다');
    } else {
      toast.error(`오류: ${res.error}`);
    }
  };

  // ── 삭제 ──────────────────────────────────────────────
  const handleDelete = (id: number) => setDeleteTargetId(id);

  const confirmDelete = async () => {
    const id = deleteTargetId;
    if (id == null) return;
    setDeleteTargetId(null);
    const res = await removeMenuItem(id);
    if (res.success) {
      setMenuItems(p => p.filter(m => m.id !== id));
      cancelEdit(id);
      toast.success('삭제됐습니다');
    } else {
      toast.error(`오류: ${res.error}`);
    }
  };

  // ── 드래그 순서 변경 ───────────────────────────────────
  const handleReorder = async (fromId: number, toId: number) => {
    const active = menuItems.filter(m => m.is_active);
    const fi = active.findIndex(m => m.id === fromId);
    const ti = active.findIndex(m => m.id === toId);
    if (fi < 0 || ti < 0 || fi === ti) return;
    const ids = active.map(m => m.id);
    const [moved] = ids.splice(fi, 1);
    ids.splice(ti, 0, moved);
    const prev = [...menuItems];
    setMenuItems([...ids.map(id => menuItems.find(m => m.id === id)!), ...menuItems.filter(m => !m.is_active)]);
    const res = await reorderMenuItems(ids);
    if (res.success) toast.success('순서 변경됐습니다');
    else { setMenuItems(prev); toast.error(`오류: ${res.error}`); }
  };

  const handleTouchDragMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!draggedId) return;
    const touch = e.touches?.[0];
    if (!touch) return;
    const el = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('[data-menu-id]');
    const id = Number(el?.getAttribute('data-menu-id'));
    if (id && id !== draggedId) setDragOverId(id);
  };

  const handleTouchDragEnd = async () => {
    if (draggedId && dragOverId && draggedId !== dragOverId) await handleReorder(draggedId, dragOverId);
    setDraggedId(null); setDragOverId(null);
  };

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        <div className="bg-canvas rounded-xl p-4 md:p-5 max-w-[800px] mx-auto">

          {/* 헤더 */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="m-0 text-2xl font-extrabold">설정</h2>
            <div className="flex gap-1.5 bg-[#f5f6f7] p-1 rounded-xl">
              {([['menu', '메뉴 관리'], ['popups', '팝업 관리'], ['users', '유저 관리'], ['devtools', '개발자 도구']] as [ActiveTab, string][]).map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-sm font-semibold rounded-lg border-none cursor-pointer transition-all ${
                    activeTab === tab ? 'bg-canvas text-ink shadow-sm' : 'bg-transparent text-ink-muted hover:text-ink-secondary'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {activeTab === 'devtools' ? <DevToolsSection />
           : activeTab === 'users' ? <UserManagementSection />
           : activeTab === 'popups' ? <PopupManagementSection />
           : (
            <>
              {/* 새 메뉴 추가 폼 */}
              <div className="bg-canvas-soft rounded-xl p-4 mb-5">
                <h3 className="mt-0 mb-3 text-base font-bold">새 메뉴 추가</h3>
                <div className="flex gap-2 mb-2.5">
                  <input
                    type="text" value={addForm.name} placeholder="메뉴 이름"
                    onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-hairline rounded-lg text-sm focus:outline-none focus:border-primary-700 bg-canvas"
                  />
                  <input
                    type="number" value={addForm.price} placeholder={addForm.isDiscount ? '할인 금액' : '가격'} min="0" step="100"
                    onChange={e => setAddForm(p => ({ ...p, price: e.target.value }))}
                    className="w-28 px-3 py-2 border border-hairline rounded-lg text-sm focus:outline-none focus:border-primary-700 bg-canvas"
                  />
                </div>
                <label className="flex items-center gap-1.5 mb-3 text-xs font-semibold text-ink-muted cursor-pointer select-none">
                  <input
                    type="checkbox" checked={addForm.isDiscount}
                    onChange={e => setAddForm(p => ({ ...p, isDiscount: e.target.checked }))}
                    className="w-3.5 h-3.5 cursor-pointer"
                  />
                  할인 메뉴로 등록
                </label>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-1.5">
                    {COLOR_PALETTE.map(c => (
                      <button key={c.value} type="button"
                        onClick={() => setAddForm(p => ({ ...p, color: c.value }))}
                        className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-all ${addForm.color === c.value ? 'border-ink scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c.value }} aria-label={c.name} />
                    ))}
                  </div>
                  <button onClick={handleAdd} disabled={isAdding}
                    className="px-4 py-2 rounded-lg border-none font-semibold text-sm bg-primary-700 text-white cursor-pointer disabled:opacity-60 hover:bg-primary-800 transition-colors">
                    {isAdding ? '추가 중...' : '추가'}
                  </button>
                </div>
              </div>

              {/* 메뉴 목록 */}
              <h3 className="mb-3 text-base font-bold">메뉴 목록</h3>
              {isLoading ? <p className="text-ink-muted text-sm">로딩 중...</p> : (
                <ul className="m-0 p-0 list-none space-y-1.5">
                  {activeMenuItems.map(item => {
                    const draft = inlineEdits[item.id];
                    const isEditing = !!draft;
                    const isSaving = savingId === item.id;

                    return (
                      <li
                        key={item.id}
                        data-menu-id={item.id}
                        draggable={!isEditing}
                        onDragStart={() => !isEditing && setDraggedId(item.id)}
                        onDragOver={e => { e.preventDefault(); if (draggedId !== item.id) setDragOverId(item.id); }}
                        onDrop={() => { if (draggedId && draggedId !== item.id) handleReorder(draggedId, item.id); setDraggedId(null); setDragOverId(null); }}
                        onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                        className={`rounded-xl border transition-all ${
                          dragOverId === item.id ? 'border-primary-700 bg-primary-50' : 'border-hairline bg-canvas'
                        } ${isEditing ? 'shadow-level-1' : ''}`}
                      >
                        {isEditing ? (
                          /* ── 인라인 편집 모드 ── */
                          <div className="p-3">
                            <div className="flex gap-2 mb-2.5">
                              <input
                                type="text" value={draft.name} autoFocus
                                onChange={e => setInlineEdits(p => ({ ...p, [item.id]: { ...p[item.id], name: e.target.value } }))}
                                className="flex-1 px-2.5 py-1.5 border border-hairline rounded-lg text-sm focus:outline-none focus:border-primary-700 bg-canvas"
                                placeholder="메뉴 이름"
                              />
                              <input
                                type="number" value={draft.price} min="0" step="100"
                                onChange={e => setInlineEdits(p => ({ ...p, [item.id]: { ...p[item.id], price: e.target.value } }))}
                                className="w-28 px-2.5 py-1.5 border border-hairline rounded-lg text-sm focus:outline-none focus:border-primary-700 bg-canvas"
                                placeholder={draft.isDiscount ? '할인 금액' : '가격'}
                              />
                            </div>
                            <label className="flex items-center gap-1.5 mb-2.5 text-xs font-semibold text-ink-muted cursor-pointer select-none">
                              <input
                                type="checkbox" checked={draft.isDiscount}
                                onChange={e => setInlineEdits(p => ({ ...p, [item.id]: { ...p[item.id], isDiscount: e.target.checked } }))}
                                className="w-3.5 h-3.5 cursor-pointer"
                              />
                              할인 메뉴로 등록
                            </label>
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex gap-1.5">
                                {COLOR_PALETTE.map(c => (
                                  <button key={c.value} type="button"
                                    onClick={() => setInlineEdits(p => ({ ...p, [item.id]: { ...p[item.id], color: c.value } }))}
                                    className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-all ${draft.color === c.value ? 'border-ink scale-110' : 'border-transparent'}`}
                                    style={{ backgroundColor: c.value }} aria-label={c.name} />
                                ))}
                              </div>
                              <div className="flex gap-1.5">
                                <button onClick={() => cancelEdit(item.id)} disabled={isSaving}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-hairline bg-canvas text-ink-muted hover:bg-canvas-soft cursor-pointer disabled:opacity-50 transition-colors">
                                  취소
                                </button>
                                <button onClick={() => saveEdit(item.id)} disabled={isSaving}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none bg-primary-700 text-white hover:bg-primary-800 cursor-pointer disabled:opacity-50 transition-colors">
                                  {isSaving ? '저장 중...' : '저장'}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* ── 일반 표시 모드 ── */
                          <div className="flex items-center gap-3 px-3 py-2.5 cursor-grab active:cursor-grabbing select-none">
                            <div
                              className="w-6 h-6 rounded-md bg-canvas-soft text-ink-faint inline-flex items-center justify-center text-sm shrink-0 touch-none"
                              onTouchStart={e => { e.preventDefault(); setDraggedId(item.id); }}
                              onTouchMove={handleTouchDragMove}
                              onTouchEnd={handleTouchDragEnd}
                              onTouchCancel={handleTouchDragEnd}
                            >⠿</div>
                            <div className="w-4 h-4 rounded-full shrink-0 border-2 border-black/10" style={{ backgroundColor: item.color }} />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-semibold text-ink">{item.name}</span>
                              {item.price < 0 && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600">할인</span>
                              )}
                              <span className="ml-2 text-xs text-ink-muted">₩{item.price.toLocaleString('ko-KR')}</span>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <button onClick={() => startEdit(item)}
                                className="px-2.5 py-1 rounded-md text-xs font-semibold border-none bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer transition-colors">
                                수정
                              </button>
                              <button onClick={() => handleDelete(item.id)}
                                className="px-2.5 py-1 rounded-md text-xs font-semibold border-none bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer transition-colors">
                                삭제
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

        </div>
      </main>
      <ConfirmDialog
        open={deleteTargetId != null}
        title="정말 삭제하시겠습니까?"
        confirmLabel="삭제"
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleteTargetId(null)}
      />
    </>
  );
}
