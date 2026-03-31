'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAllMenu, createNewMenuItem, editMenuItem, removeMenuItem, reorderMenuItems, fetchTodaysOrders, resetTodaysSales, fetchMonthlySalesCalendar } from '../actions';

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
  const today = new Date();
  const [menuItems, setMenuItems] = useState([]);
  const [todayOrders, setTodayOrders] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [calendarSales, setCalendarSales] = useState({ byDate: {}, monthTotal: 0, totalOrders: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSalesLoading, setIsSalesLoading] = useState(true);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [isResettingSales, setIsResettingSales] = useState(false);
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
    loadTodaySales();
  }, []);

  useEffect(() => {
    loadMonthlyCalendar(calendarMonth);
  }, [calendarMonth]);

  const loadMenuItems = async () => {
    setIsLoading(true);
    const result = await getAllMenu();
    if (result.success) {
      setMenuItems(result.data);
    }
    setIsLoading(false);
  };

  const loadTodaySales = async () => {
    setIsSalesLoading(true);
    const result = await fetchTodaysOrders();
    if (result.success) {
      setTodayOrders(result.data);
    } else {
      setMessage(`오류: ${result.error}`);
    }
    setIsSalesLoading(false);
  };

  const loadMonthlyCalendar = async (dateCursor) => {
    setIsCalendarLoading(true);
    const result = await fetchMonthlySalesCalendar(
      dateCursor.getFullYear(),
      dateCursor.getMonth() + 1
    );

    if (result.success) {
      setCalendarSales(result.data);
    } else {
      setMessage(`오류: ${result.error}`);
    }
    setIsCalendarLoading(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddMenuItem = async () => {
    if (!formData.name || !formData.price) {
      setMessage('모든 필드를 입력해주세요');
      return;
    }

    setMessage('');
    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
      setMessage('가격은 0보다 큰 숫자여야 합니다');
      return;
    }

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

    setMessage('');
    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
      setMessage('가격은 0보다 큰 숫자여야 합니다');
      return;
    }

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
    const selectedColor = COLOR_PALETTE.some((color) => color.value === item.color)
      ? item.color
      : COLOR_PALETTE[0].value;

    setEditingId(item.id);
    setFormData({
      name: item.name,
      price: item.price.toString(),
      color: selectedColor,
    });
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

  const handleDragStart = (id) => {
    setDraggedId(id);
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    if (draggedId !== id) {
      setDragOverId(id);
    }
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

    if (overId && overId !== draggedId) {
      setDragOverId(overId);
    }
  };

  const handleTouchDragEnd = async () => {
    if (draggedId && dragOverId && draggedId !== dragOverId) {
      await handleReorder(draggedId, dragOverId);
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  const activeMenuItems = menuItems.filter((item) => item.is_active);
  const todayRevenue = todayOrders.reduce((sum, order) => sum + Number(order.total_price || 0), 0);

  const monthYearLabel = `${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월`;
  const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();

  const buildDateKey = (year, monthIndex, day) => {
    const y = String(year);
    const m = String(monthIndex + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const moveCalendarMonth = (offset) => {
    setCalendarMonth(
      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1)
    );
  };

  const handleResetTodaysSales = async () => {
    if (todayOrders.length === 0) {
      setMessage('오늘 삭제할 매출이 없습니다');
      return;
    }

    const firstConfirm = window.confirm(
      `정말 오늘 매출(${todayOrders.length}건, ₩${todayRevenue.toLocaleString('ko-KR')})을 모두 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`
    );

    if (!firstConfirm) return;

    const confirmationText = window.prompt(
      '안전 확인: "초기화"를 정확히 입력하면 오늘 매출이 전부 삭제됩니다.'
    );

    if (confirmationText !== '초기화') {
      setMessage('초기화가 취소되었습니다. 확인 문구가 일치하지 않습니다.');
      return;
    }

    setIsResettingSales(true);
    const result = await resetTodaysSales();

    if (result.success) {
      setMessage(`오늘 매출 ${result.deletedCount}건이 초기화되었습니다.`);
      await loadTodaySales();
    } else {
      setMessage(`오류: ${result.error}`);
    }

    setIsResettingSales(false);
  };

  return (
    <>
      <header className="header-nav">
        <h1>ChoiChoi</h1>
        <nav>
          <ul className="nav-links">
            <li>
              <Link href="/">POS</Link>
            </li>
            <li>
              <Link href="/settings" className="active">
                설정
              </Link>
            </li>
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
                      <div
                        className="menu-item-color"
                        style={{ backgroundColor: item.color }}
                      ></div>
                      <div className="menu-item-details">
                        <h3>{item.name}</h3>
                        <p>₩{item.price.toLocaleString('ko-KR')}</p>
                        <p className="drag-hint">데스크톱: 드래그 / 모바일: 핸들 터치 이동</p>
                      </div>
                    </div>
                    <div className="menu-item-actions">
                      <button
                        className="edit-btn"
                        onClick={() => handleEditStart(item)}
                      >
                        수정
                      </button>
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteMenuItem(item.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          )}

          <div className="sales-manager">
            <div className="sales-manager-header">
              <h3>오늘 매출 관리</h3>
              <button className="refresh-btn" onClick={loadTodaySales} disabled={isSalesLoading}>
                {isSalesLoading ? '불러오는 중...' : '새로고침'}
              </button>
            </div>

            <div className="sales-summary-card">
              <p>오늘 총 주문: {todayOrders.length}건</p>
              <strong>오늘 총매출: ₩{todayRevenue.toLocaleString('ko-KR')}</strong>
            </div>

            <div className="danger-zone">
              <p>
                주의: 아래 버튼은 오늘 주문/매출 데이터를 전부 삭제합니다. 되돌릴 수 없습니다.
              </p>
              <button
                className="danger-btn"
                onClick={handleResetTodaysSales}
                disabled={isResettingSales || isSalesLoading || todayOrders.length === 0}
              >
                {isResettingSales ? '초기화 중...' : '오늘 매출 전체 초기화'}
              </button>
            </div>

            <div className="sales-order-list-wrap">
              <h4>주문 내역 (주문번호 / 가격)</h4>
              {isSalesLoading ? (
                <p>주문 내역을 불러오는 중입니다...</p>
              ) : todayOrders.length === 0 ? (
                <p className="empty-order">오늘 주문 내역이 없습니다.</p>
              ) : (
                <ul className="sales-order-list">
                  {todayOrders.map((order) => (
                    <li key={order.id}>
                      <span>주문번호 #{order.id}</span>
                      <strong>₩{Number(order.total_price).toLocaleString('ko-KR')}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="calendar-sales-section">
            <div className="calendar-header">
              <h3>날짜별 매출 프리뷰</h3>
              <div className="calendar-controls">
                <button onClick={() => moveCalendarMonth(-1)}>&lt;</button>
                <strong>{monthYearLabel}</strong>
                <button onClick={() => moveCalendarMonth(1)}>&gt;</button>
              </div>
            </div>

            <div className="calendar-month-summary">
              <span>월 주문 {calendarSales.totalOrders}건</span>
              <strong>월 매출 ₩{Number(calendarSales.monthTotal || 0).toLocaleString('ko-KR')}</strong>
            </div>

            {isCalendarLoading ? (
              <p>달력 매출을 불러오는 중입니다...</p>
            ) : (
              <div className="sales-calendar-grid">
                {['일', '월', '화', '수', '목', '금', '토'].map((dayName) => (
                  <div key={dayName} className="calendar-weekday">{dayName}</div>
                ))}

                {Array.from({ length: firstDay }).map((_, idx) => (
                  <div key={`blank-${idx}`} className="calendar-cell blank" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, idx) => {
                  const day = idx + 1;
                  const dateKey = buildDateKey(
                    calendarMonth.getFullYear(),
                    calendarMonth.getMonth(),
                    day
                  );
                  const dayRevenue = Number(calendarSales.byDate?.[dateKey] || 0);

                  return (
                    <div key={dateKey} className="calendar-cell">
                      <div className="calendar-day">{day}</div>
                      <div className="calendar-amount">
                        {dayRevenue > 0 ? `₩${dayRevenue.toLocaleString('ko-KR')}` : '-'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
