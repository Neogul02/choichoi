'use client';

import NavBar from '@/components/NavBar';
import { useEffect, useState } from 'react';
import { getAllMenu, createNewMenuItem, editMenuItem, removeMenuItem, reorderMenuItems } from '@/app/actions';
import type { MenuItem } from '@/types/database';

type ColorOption = { name: string; value: string };
type MenuFormData = { name: string; price: string; color: string };

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

const INITIAL_FORM: MenuFormData = { name: '', price: '', color: COLOR_PALETTE[0].value };

export default function SettingsPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [formData, setFormData] = useState<MenuFormData>(INITIAL_FORM);

  const loadMenuItems = async () => {
    setIsLoading(true);
    const result = await getAllMenu();
    if (result.success && result.data) setMenuItems(result.data);
    setIsLoading(false);
  };

  useEffect(() => { loadMenuItems(); }, []);

  const validateForm = (): number | null => {
    if (!formData.name || !formData.price) { setMessage('모든 필드를 입력해주세요'); return null; }
    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) { setMessage('가격은 0보다 큰 숫자여야 합니다'); return null; }
    setMessage('');
    return price;
  };

  const handleAddMenuItem = async () => {
    const price = validateForm();
    if (price === null) return;
    const result = await createNewMenuItem(formData.name, price, formData.color);
    if (result.success) {
      setMessage('메뉴가 추가되었습니다');
      setFormData(INITIAL_FORM);
      await loadMenuItems();
    } else {
      setMessage(`오류: ${result.error}`);
    }
  };

  const handleEditMenuItem = async () => {
    const price = validateForm();
    if (price === null || editingId === null) return;
    const result = await editMenuItem(editingId, formData.name, price, formData.color);
    if (result.success) {
      setMessage('메뉴가 수정되었습니다');
      setFormData(INITIAL_FORM);
      setEditingId(null);
      await loadMenuItems();
    } else {
      setMessage(`오류: ${result.error}`);
    }
  };

  const handleDeleteMenuItem = async (id: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const result = await removeMenuItem(id);
    if (result.success) {
      setMessage('메뉴가 삭제되었습니다');
      await loadMenuItems();
    } else {
      setMessage(`오류: ${result.error}`);
    }
  };

  const handleEditStart = (item: MenuItem) => {
    const selectedColor = COLOR_PALETTE.some((c) => c.value === item.color) ? item.color : COLOR_PALETTE[0].value;
    setEditingId(item.id);
    setFormData({ name: item.name, price: item.price.toString(), color: selectedColor });
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM);
  };

  const handleReorder = async (fromId: number, toId: number) => {
    const activeItems = menuItems.filter((item) => item.is_active);
    const fromIndex = activeItems.findIndex((item) => item.id === fromId);
    const toIndex = activeItems.findIndex((item) => item.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    const orderedIds = activeItems.map((item) => item.id);
    const [movedId] = orderedIds.splice(fromIndex, 1);
    orderedIds.splice(toIndex, 0, movedId);

    const result = await reorderMenuItems(orderedIds);
    if (result.success) {
      setMessage('메뉴 순서가 변경되었습니다');
      await loadMenuItems();
    } else {
      setMessage(`오류: ${result.error}`);
    }
  };

  const handleDragStart = (id: number) => setDraggedId(id);

  const handleDragOver = (e: React.DragEvent<HTMLLIElement>, id: number) => {
    e.preventDefault();
    if (draggedId !== id) setDragOverId(id);
  };

  const handleDrop = async (id: number) => {
    if (!draggedId || draggedId === id) { setDraggedId(null); setDragOverId(null); return; }
    await handleReorder(draggedId, id);
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => { setDraggedId(null); setDragOverId(null); };

  const handleTouchDragStart = (e: React.TouchEvent<HTMLDivElement>, id: number) => {
    e.preventDefault();
    setDraggedId(id);
  };

  const handleTouchDragMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!draggedId) return;
    const touch = e.touches?.[0];
    if (!touch) return;
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const dropItem = target?.closest?.('[data-menu-id]');
    const overId = Number(dropItem?.getAttribute('data-menu-id'));
    if (overId && overId !== draggedId) setDragOverId(overId);
  };

  const handleTouchDragEnd = async () => {
    if (draggedId && dragOverId && draggedId !== dragOverId) await handleReorder(draggedId, dragOverId);
    setDraggedId(null);
    setDragOverId(null);
  };

  const activeMenuItems = menuItems.filter((item) => item.is_active);

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        <div className="bg-white rounded-2xl p-4 md:p-5 max-w-[800px] mx-auto">
          <h2 className="m-0 mb-5 text-2xl font-extrabold">메뉴 관리</h2>

          {message && (
            <div className={`p-3 mb-4 rounded-lg text-center font-semibold ${message.includes('오류') ? 'bg-[#f8d7da] text-[#721c24] border border-[#f5c6cb]' : 'bg-[#d4edda] text-[#155724] border border-[#c3e6cb]'}`}>
              {message}
            </div>
          )}

          <div className="bg-[#f9f9f9] rounded-xl p-4 mb-4">
            <h3 className="mt-0 mb-3 text-lg font-bold">{editingId ? '메뉴 수정' : '새 메뉴 추가'}</h3>
            <div className="mb-3">
              <label className="block mb-1.5 font-semibold text-sm text-[#333]">메뉴 이름</label>
              <input type="text" name="name" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} placeholder="예: 고메버터 소금빵" className="w-full px-3 py-2 border border-[#ddd] rounded-md text-sm focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div className="mb-3 md:mb-0">
                <label className="block mb-1.5 font-semibold text-sm text-[#333]">가격 (원)</label>
                <input type="number" name="price" value={formData.price} onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))} placeholder="4900" min="0" step="100" className="w-full px-3 py-2 border border-[#ddd] rounded-md text-sm focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10" />
              </div>
              <div>
                <label className="block mb-1.5 font-semibold text-sm text-[#333]">색상</label>
                <div className="grid grid-cols-8 gap-2" role="radiogroup" aria-label="메뉴 색상 선택">
                  {COLOR_PALETTE.map((color) => (
                    <button key={color.value} type="button" className={`w-full aspect-square border-2 border-[#ddd] rounded-full cursor-pointer transition-all duration-150 hover:-translate-y-px ${formData.color === color.value ? 'border-[#111] ring-2 ring-black/15' : ''}`} style={{ backgroundColor: color.value }} onClick={() => setFormData((p) => ({ ...p, color: color.value }))} aria-label={`${color.name} 선택`} aria-pressed={formData.color === color.value} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button className="flex-1 px-4 py-2 rounded-md border-none font-semibold cursor-pointer transition-all duration-200 text-sm bg-primary-700 text-white hover:bg-primary-800" onClick={editingId ? handleEditMenuItem : handleAddMenuItem}>
                {editingId ? '수정 완료' : '메뉴 추가'}
              </button>
              {editingId && (
                <button className="px-4 py-2 rounded-md border-none font-semibold cursor-pointer transition-all duration-200 text-sm bg-[#ddd] text-[#333] hover:bg-[#ccc]" onClick={handleCancel}>취소</button>
              )}
            </div>
          </div>

          <h3 className="mb-3 text-lg font-bold">메뉴 목록</h3>
          {isLoading ? (
            <p>로딩 중...</p>
          ) : (
            <ul className="m-0 p-0 list-none">
              {activeMenuItems.map((item) => (
                <li key={item.id} data-menu-id={item.id} className={`flex justify-between items-center p-3 bg-white rounded-lg mb-2 shadow-[0_2px_4px_rgba(0,0,0,0.04)] cursor-grab select-none active:cursor-grabbing ${dragOverId === item.id ? 'outline-2 outline-dashed outline-primary-700 bg-primary-50' : ''}`} draggable onDragStart={() => handleDragStart(item.id)} onDragOver={(e) => handleDragOver(e, item.id)} onDrop={() => handleDrop(item.id)} onDragEnd={handleDragEnd}>
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-7 h-7 rounded-md bg-[#f1f3f5] text-[#666] inline-flex items-center justify-center text-base leading-none cursor-grab select-none touch-none shrink-0 active:cursor-grabbing active:bg-[#e9ecef]" role="button" aria-label="순서 이동 핸들" onTouchStart={(e) => handleTouchDragStart(e, item.id)} onTouchMove={handleTouchDragMove} onTouchEnd={handleTouchDragEnd} onTouchCancel={handleTouchDragEnd}>⠿</div>
                    <div className="w-5 h-5 rounded-full shrink-0 border-2 border-black/10" style={{ backgroundColor: item.color }} />
                    <div>
                      <h3 className="m-0 text-sm font-semibold">{item.name}</h3>
                      <p className="m-0 mt-1 text-xs text-[#666]">₩{item.price.toLocaleString('ko-KR')}</p>
                      <p className="m-0 mt-1.5 text-[11px] text-[#999]">데스크톱: 드래그 / 모바일: 핸들 터치 이동</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 border-none rounded-md text-xs font-semibold cursor-pointer transition-all duration-200 bg-[#3498db] text-white hover:bg-[#2980b9]" onClick={() => handleEditStart(item)}>수정</button>
                    <button className="px-3 py-1.5 border-none rounded-md text-xs font-semibold cursor-pointer transition-all duration-200 bg-[#ff6b6b] text-white hover:bg-[#ff5252]" onClick={() => handleDeleteMenuItem(item.id)}>삭제</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
