'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAllMenu, createNewMenuItem, editMenuItem, removeMenuItem, reorderMenuItems } from '../actions';

const COLOR_PALETTE = [
  { name: '빨강', value: '#E53935' },
  { name: '주황', value: '#FB8C00' },
  { name: '노랑', value: '#FDD835' },
  { name: '초록', value: '#7CB342' },
  { name: '하늘', value: '#00ACC1' },
  { name: '파랑', value: '#1E88E5' },
  { name: '남색', value: '#3949AB' },
  { name: '보라', value: '#8E24AA' },
];

export default function SettingsPage() {
  const [menuItems, setMenuItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    color: COLOR_PALETTE[0].value,
  });

  useEffect(() => {
    loadMenuItems();
  }, []);

  const loadMenuItems = async () => {
    setIsLoading(true);
    const result = await getAllMenu();
    if (result.success) {
      setMenuItems(result.data);
    }
    setIsLoading(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddMenuItem = async () => {
    if (!formData.name || !formData.price) {
      setMessage('모든 필드를 입력해주세요');
      return;
    }
    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
      setMessage('가격은 0보다 큰 숫자여야 합니다');
      return;
    }
    setMessage('');
    const result = await createNewMenuItem(formData.name, price, formData.color);
    if (result.success) {
      setMessage('메뉴가 추가되었습니다');
      setFormData({ name: '', price: '', color: COLOR_PALETTE[0].value });
      await loadMenuItems();
    } else {
      setMessage(`오류: ${result.error}`);
    }
  };

  const handleEditMenuItem = async () => {
    if (!formData.name || !formData.price) {
      setMessage('모든 필드를 입력해주세요');
      return;
    }
    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
      setMessage('가격은 0보다 큰 숫자여야 합니다');
      return;
    }
    setMessage('');
    const result = await editMenuItem(editingId, formData.name, price, formData.color);
    if (result.success) {
      setMessage('메뉴가 수정되었습니다');
      setFormData({ name: '', price: '', color: COLOR_PALETTE[0].value });
      setEditingId(null);
      await loadMenuItems();
    } else {
      setMessage(`오류: ${result.error}`);
    }
  };

  const handleDeleteMenuItem = async (id) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      const result = await removeMenuItem(id);
      if (result.success) {
        setMessage('메뉴가 삭제되었습니다');
        await loadMenuItems();
      } else {
        setMessage(`오류: ${result.error}`);
      }
    }
  };

  const handleEditStart = (item) => {
    const selectedColor = COLOR_PALETTE.some((c) => c.value === item.color)
      ? item.color
      : COLOR_PALETTE[0].value;
    setEditingId(item.id);
    setFormData({ name: item.name, price: item.price.toString(), color: selectedColor });
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({ name: '', price: '', color: COLOR_PALETTE[0].value });
  };

  const handleReorder = async (fromId, toId) => {
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

  const handleDragStart = (id) => setDraggedId(id);

  const handleDragOver = (e, id) => {
    e.preventDefault();
    if (draggedId !== id) setDragOverId(id);
  };

  const handleDrop = async (id) => {
    if (!draggedId || draggedId === id) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    await handleReorder(draggedId, id);
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleTouchDragStart = (e, id) => {
    e.preventDefault();
    setDraggedId(id);
  };

  const handleTouchDragMove = (e) => {
    if (!draggedId) return;
    const touch = e.touches?.[0];
    if (!touch) return;
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const dropItem = target?.closest?.('[data-menu-id]');
    const overId = Number(dropItem?.getAttribute('data-menu-id'));
    if (overId && overId !== draggedId) setDragOverId(overId);
  };

  const handleTouchDragEnd = async () => {
    if (draggedId && dragOverId && draggedId !== dragOverId) {
      await handleReorder(draggedId, dragOverId);
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  const activeMenuItems = menuItems.filter((item) => item.is_active);

  return (
    <>
      <header className="header-nav">
        <h1>ChoiChoi</h1>
        <nav>
          <ul className="nav-links">
            <li><Link href="/">POS</Link></li>
            <li><Link href="/stats">매출 통계</Link></li>
            <li><Link href="/schedule">일정</Link></li>
            <li><Link href="/memo">메모</Link></li>
            <li><Link href="/settings" className="active">설정</Link></li>
          </ul>
        </nav>
      </header>

      <main className="pos-wrap">
        <div className="settings-wrap">
          <h2>메뉴 관리</h2>

          {message && (
            <div className={`message ${message.includes('오류') ? 'error' : 'success'}`}>
              {message}
            </div>
          )}

          <div className="menu-editor">
            <h3 style={{ marginTop: 0 }}>
              {editingId ? '메뉴 수정' : '새 메뉴 추가'}
            </h3>

            <div className="form-group">
              <label>메뉴 이름</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="예: 고메버터 소금빵"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>가격 (원)</label>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleInputChange}
                  placeholder="4900"
                  min="0"
                  step="100"
                />
              </div>
              <div className="form-group">
                <label>색상</label>
                <div className="color-palette" role="radiogroup" aria-label="메뉴 색상 선택">
                  {COLOR_PALETTE.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      className={`palette-color ${formData.color === color.value ? 'selected' : ''}`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => setFormData((prev) => ({ ...prev, color: color.value }))}
                      aria-label={`${color.name} 선택`}
                      aria-pressed={formData.color === color.value}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="menu-editor-buttons">
              <button
                className="add-btn"
                onClick={editingId ? handleEditMenuItem : handleAddMenuItem}
              >
                {editingId ? '수정 완료' : '메뉴 추가'}
              </button>
              {editingId && (
                <button className="cancel-btn" onClick={handleCancel}>
                  취소
                </button>
              )}
            </div>
          </div>

          <h3>메뉴 목록</h3>

          {isLoading ? (
            <p>로딩 중...</p>
          ) : (
            <ul className="menu-list">
              {activeMenuItems.map((item) => (
                <li
                  key={item.id}
                  data-menu-id={item.id}
                  className={`menu-item draggable ${dragOverId === item.id ? 'drag-over' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(item.id)}
                  onDragOver={(e) => handleDragOver(e, item.id)}
                  onDrop={() => handleDrop(item.id)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="menu-item-info">
                    <div
                      className="drag-handle"
                      role="button"
                      aria-label="순서 이동 핸들"
                      onTouchStart={(e) => handleTouchDragStart(e, item.id)}
                      onTouchMove={handleTouchDragMove}
                      onTouchEnd={handleTouchDragEnd}
                      onTouchCancel={handleTouchDragEnd}
                    >
                      ⠿
                    </div>
                    <div className="menu-item-color" style={{ backgroundColor: item.color }} />
                    <div className="menu-item-details">
                      <h3>{item.name}</h3>
                      <p>₩{item.price.toLocaleString('ko-KR')}</p>
                      <p className="drag-hint">데스크톱: 드래그 / 모바일: 핸들 터치 이동</p>
                    </div>
                  </div>
                  <div className="menu-item-actions">
                    <button className="edit-btn" onClick={() => handleEditStart(item)}>
                      수정
                    </button>
                    <button className="delete-btn" onClick={() => handleDeleteMenuItem(item.id)}>
                      삭제
                    </button>
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
