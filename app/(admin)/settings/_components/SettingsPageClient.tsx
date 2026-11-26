'use client';

import NavBar from '@/components/NavBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getAllMenu, createNewMenuItem, editMenuItem, removeMenuItem, reorderMenuItems, fetchPopupMenuHidden, setPopupMenuSelling } from '@/app/actions/menu';
import { fetchPopupEvents } from '@/app/actions/schedule';
import { kstToday } from '@/lib/date';
import type { PopupEvent } from '@/types/database';
import type { MenuItem } from '@/types/database';
import DevToolsSection from './DevToolsSection';
import UserManagementSection from './UserManagementSection';
import PopupManagementSection from './PopupManagementSection';

type ActiveTab = 'menu' | 'popups' | 'users' | 'devtools';

// 탭 순서 = 쓰는 빈도 순. 설명은 "무엇을 하는 곳인지"를 한 줄로만 말한다.
const TABS: { id: ActiveTab; label: string; desc: string }[] = [
  { id: 'menu', label: '메뉴 관리', desc: 'POS에 보이는 메뉴와 순서, 팝업별 판매 여부를 관리합니다 — 목록 위에서 팝업을 고르고 메뉴마다 판매 스위치로 켜고 끕니다' },
  { id: 'popups', label: '팝업 관리', desc: '행사 기간과 활성 상태를 관리합니다' },
  { id: 'users', label: '유저 관리', desc: '계정 권한·연락처를 관리합니다' },
  { id: 'devtools', label: '개발자 도구', desc: '배포 환경, 서버 액션, 데이터베이스 구조를 확인합니다' },
];
type ColorOption = { name: string; value: string };

const COLOR_PALETTE: ColorOption[] = [
  { name: '빨강', value: '#E53935' },
  { name: '다홍', value: '#F4511E' },
  { name: '주황', value: '#FB8C00' },
  { name: '노랑', value: '#FDD835' },
  { name: '연두', value: '#C0CA33' },
  { name: '초록', value: '#7CB342' },
  { name: '진초록', value: '#2E7D32' },
  { name: '민트', value: '#26A69A' },
  { name: '하늘', value: '#00ACC1' },
  { name: '파랑', value: '#1E88E5' },
  { name: '남색', value: '#3949AB' },
  { name: '보라', value: '#8E24AA' },
  { name: '분홍', value: '#EC407A' },
  { name: '갈색', value: '#8D6E63' },
  { name: '베이지', value: '#D7B98E' },
  { name: '회색', value: '#78909C' },
  { name: '검정', value: '#37474F' },
];

/** 팔레트 + 직접 고르기(커스텀 색) */
function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const isCustom = !COLOR_PALETTE.some(c => c.value.toLowerCase() === value.toLowerCase());
  return (
    <div className="flex flex-1 min-w-0 flex-wrap items-center gap-1.5">
      {COLOR_PALETTE.map(c => (
        <button key={c.value} type="button" title={c.name}
          onClick={() => onChange(c.value)}
          className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-all ${value.toLowerCase() === c.value.toLowerCase() ? 'border-ink scale-110' : 'border-transparent'}`}
          style={{ backgroundColor: c.value }} aria-label={c.name} />
      ))}
      <label title="직접 고르기"
        className={`relative w-6 h-6 rounded-full border-2 cursor-pointer overflow-hidden transition-all ${isCustom ? 'border-ink scale-110' : 'border-hairline'}`}
        style={isCustom ? { backgroundColor: value } : { background: 'conic-gradient(#E53935, #FDD835, #7CB342, #00ACC1, #3949AB, #8E24AA, #E53935)' }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value.toUpperCase())}
          className="absolute inset-0 opacity-0 cursor-pointer" aria-label="직접 색 고르기" />
      </label>
    </div>
  )
}

const INITIAL_ADD = { name: '', price: '', color: COLOR_PALETTE[0].value, emoji: '', isDiscount: false };

type InlineEdit = { name: string; price: string; color: string; emoji: string; isDiscount: boolean };

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

  // 팝업별 판매 — 진행 중·예정 팝업마다 이 메뉴를 팔지 켜고 끈다(끈 것만 popup_menu_hidden에 기록)
  const [sellPopups, setSellPopups] = useState<PopupEvent[]>([]);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  // 팝업 하나를 골라 그 팝업 기준으로 판매 스위치 한 열만 보여준다(메뉴마다 팝업 칩 여러 개를 붙이던 방식 대체)
  const [sellPopupId, setSellPopupId] = useState<number | null>(null);
  const sellPopup = sellPopups.find(p => p.id === sellPopupId) ?? sellPopups[0] ?? null;
  useEffect(() => {
    const today = kstToday();
    Promise.all([fetchPopupEvents(), fetchPopupMenuHidden()]).then(([pRes, hRes]) => {
      if (pRes.success && pRes.data) {
        setSellPopups(pRes.data.filter(p => p.is_active && p.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date)));
      }
      if (hRes.success && hRes.data) setHiddenKeys(new Set(hRes.data.map(h => `${h.popupId}|${h.menuItemId}`)));
    });
  }, []);
  const togglePopupSelling = async (popupId: number, menuItemId: number) => {
    const key = `${popupId}|${menuItemId}`;
    const selling = hiddenKeys.has(key); // 지금 꺼져 있으면 켠다
    setTogglingKey(key);
    const res = await setPopupMenuSelling(popupId, menuItemId, selling);
    setTogglingKey(null);
    if (!res.success) { toast.error(`오류: ${res.error}`); return; }
    setHiddenKeys(prev => {
      const next = new Set(prev);
      if (selling) next.delete(key); else next.add(key);
      return next;
    });
  };

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
    const res = await createNewMenuItem(addForm.name, price, addForm.color, addForm.emoji || null);
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
        color: /^#[0-9A-Fa-f]{6}$/.test(item.color) ? item.color : COLOR_PALETTE[0].value,
        emoji: item.emoji ?? '',
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
    const res = await editMenuItem(id, draft.name, price, draft.color, draft.emoji || null);
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
        <div className="pt-1 md:pt-2">

          {/* 헤더 — 탭이 아래 내용에 붙도록 밑줄형으로 두고, 선택한 탭의 설명을 바로 아래 둔다 */}
          <header className="mb-4">
            <h1 className="m-0 mb-3 text-heading-2 text-ink">설정</h1>
            <div className="flex gap-1 overflow-x-auto border-b border-hairline [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {TABS.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative shrink-0 px-3 py-2 text-[13px] font-bold bg-transparent border-none cursor-pointer transition-colors whitespace-nowrap after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors ${
                      isActive ? 'text-ink after:bg-primary-700' : 'text-ink-muted hover:text-ink after:bg-transparent'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <p className="m-0 mt-2 text-[12px] text-ink-muted">
              {TABS.find(t => t.id === activeTab)?.desc}
            </p>
          </header>

          {activeTab === 'devtools' ? <DevToolsSection />
           : activeTab === 'users' ? <UserManagementSection />
           : activeTab === 'popups' ? <PopupManagementSection />
           : (
            <>
              {/* 새 메뉴 추가 폼 */}
              <div className="bg-canvas rounded-2xl border border-hairline shadow-level-1 p-4 mb-4">
                <h3 className="mt-0 mb-3 text-[15px] font-bold text-ink">새 메뉴 추가</h3>
                <form onSubmit={e => { e.preventDefault(); handleAdd(); }}>
                  <div className="flex gap-2 mb-2.5">
                    <input
                      type="text" value={addForm.emoji} placeholder="🍑" maxLength={8}
                      onChange={e => setAddForm(p => ({ ...p, emoji: e.target.value }))}
                      title="이모지 (선택) — 키보드의 이모지 버튼으로 입력하세요"
                      className="w-14 px-2 py-2 border border-hairline rounded-lg text-sm text-center focus:outline-none focus:border-primary-700 bg-canvas"
                    />
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
                    <ColorPicker value={addForm.color} onChange={color => setAddForm(p => ({ ...p, color }))} />
                    <button type="submit" disabled={isAdding}
                      className="px-4 py-2 rounded-lg border-none font-semibold text-sm bg-primary-700 text-white cursor-pointer disabled:opacity-60 hover:bg-primary-800 transition-colors">
                      {isAdding ? '추가 중…' : '추가'}
                    </button>
                  </div>
                </form>
              </div>

              {/* 메뉴 목록 */}
              <h3 className="mb-2 text-[15px] font-bold text-ink">
                메뉴 목록
                <span className="ml-1.5 text-[12px] font-semibold text-ink-faint tabular-nums">{activeMenuItems.length}</span>
              </h3>
              {sellPopups.length > 0 && (
                <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-canvas-soft px-3 py-2">
                  <label htmlFor="sell-popup" className="text-[12px] font-semibold text-ink-muted">팝업별 판매</label>
                  <select
                    id="sell-popup"
                    value={sellPopup?.id ?? ''}
                    onChange={e => setSellPopupId(Number(e.target.value))}
                    className="px-2.5 py-1.5 rounded-lg border border-hairline bg-canvas text-[13px] font-semibold text-ink cursor-pointer focus-visible:outline-2 focus-visible:outline-primary-700"
                  >
                    {sellPopups.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {sellPopup && (
                    <span className="text-[12px] text-ink-faint tabular-nums">
                      {activeMenuItems.filter(m => !hiddenKeys.has(`${sellPopup.id}|${m.id}`)).length}개 판매 · 끈 메뉴는 이 팝업 POS에 안 보여요
                    </span>
                  )}
                </div>
              )}
              {isLoading ? <p className="text-ink-muted text-sm">불러오는 중…</p> : (
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
                          <form
                            className="p-3"
                            onSubmit={e => { e.preventDefault(); saveEdit(item.id); }}
                            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); cancelEdit(item.id); } }}
                          >
                            <div className="flex gap-2 mb-2.5">
                              <input
                                type="text" value={draft.emoji} maxLength={8}
                                onChange={e => setInlineEdits(p => ({ ...p, [item.id]: { ...p[item.id], emoji: e.target.value } }))}
                                className="w-14 px-2 py-1.5 border border-hairline rounded-lg text-sm text-center focus:outline-none focus:border-primary-700 bg-canvas"
                                placeholder="🍑"
                              />
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
                              <ColorPicker value={draft.color} onChange={color => setInlineEdits(p => ({ ...p, [item.id]: { ...p[item.id], color } }))} />
                              <div className="flex gap-1.5">
                                <button type="button" onClick={() => cancelEdit(item.id)} disabled={isSaving}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-hairline bg-canvas text-ink-muted hover:bg-canvas-soft cursor-pointer disabled:opacity-50 transition-colors">
                                  취소
                                </button>
                                <button type="submit" disabled={isSaving}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none bg-primary-700 text-white hover:bg-primary-800 cursor-pointer disabled:opacity-50 transition-colors">
                                  {isSaving ? '저장 중…' : '저장'}
                                </button>
                              </div>
                            </div>
                          </form>
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
                            {item.emoji && <span className="text-base shrink-0">{item.emoji}</span>}
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-semibold text-ink">{item.name}</span>
                              {item.price < 0 && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600">할인</span>
                              )}
                              <span className="ml-2 text-xs text-ink-muted">₩{item.price.toLocaleString('ko-KR')}</span>
                            </div>
                            {sellPopup && (() => {
                              const key = `${sellPopup.id}|${item.id}`;
                              const selling = !hiddenKeys.has(key);
                              return (
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={selling}
                                  aria-label={`${sellPopup.name}에서 ${item.name} 판매`}
                                  onClick={() => togglePopupSelling(sellPopup.id, item.id)}
                                  disabled={togglingKey === key}
                                  className="shrink-0 flex items-center gap-1.5 bg-transparent border-none cursor-pointer disabled:opacity-50 p-1"
                                >
                                  <span className={`text-[12px] font-semibold ${selling ? 'text-primary-700' : 'text-ink-faint'}`}>{selling ? '판매' : '안 팖'}</span>
                                  <span className={`relative w-9 h-5 rounded-full transition-colors ${selling ? 'bg-primary-700' : 'bg-hairline-strong'}`}>
                                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-canvas shadow transition-all ${selling ? 'left-[18px]' : 'left-0.5'}`} />
                                  </span>
                                </button>
                              );
                            })()}
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
