'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  fetchTodaysSales,
  fetchMenuSalesBreakdown,
  fetchTodaysOrders,
  resetTodaysSales,
  fetchMonthlySalesCalendar,
} from '../actions';

const KRW = new Intl.NumberFormat('ko-KR');

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getPeriodBounds(period) {
  const now = new Date();
  const todayStr = toLocalDateStr(now);

  if (period === 'today') {
    return {
      startISO: `${todayStr}T00:00:00.000Z`,
      endISO: `${todayStr}T23:59:59.999Z`,
      label: '오늘',
    };
  }

  if (period === 'week') {
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    const mondayStr = toLocalDateStr(monday);
    return {
      startISO: `${mondayStr}T00:00:00.000Z`,
      endISO: `${todayStr}T23:59:59.999Z`,
      label: '이번 주',
    };
  }

  // month
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return {
    startISO: `${monthStr}-01T00:00:00.000Z`,
    endISO: `${todayStr}T23:59:59.999Z`,
    label: '이번 달',
  };
}

export default function StatsPage() {
  const today = new Date();
  const [summary, setSummary] = useState({ totalOrders: 0, totalRevenue: 0 });
  const [breakdown, setBreakdown] = useState([]);
  const [breakdownPeriod, setBreakdownPeriod] = useState('today');
  const [todayOrders, setTodayOrders] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [calendarSales, setCalendarSales] = useState({
    byDate: {},
    monthTotal: 0,
    totalOrders: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isBreakdownLoading, setIsBreakdownLoading] = useState(false);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [isResettingSales, setIsResettingSales] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadTodayData();
  }, []);

  useEffect(() => {
    loadMonthlyCalendar(calendarMonth);
  }, [calendarMonth]);

  useEffect(() => {
    loadBreakdown(breakdownPeriod);
  }, [breakdownPeriod]);

  const loadTodayData = async () => {
    setIsLoading(true);

    const [summaryResult, ordersResult] = await Promise.all([
      fetchTodaysSales(),
      fetchTodaysOrders(),
    ]);

    if (summaryResult.success) setSummary(summaryResult.data);
    if (ordersResult.success) setTodayOrders(ordersResult.data);
    setIsLoading(false);
  };

  const loadBreakdown = async (period) => {
    setIsBreakdownLoading(true);
    const { startISO, endISO } = getPeriodBounds(period);
    const result = await fetchMenuSalesBreakdown(startISO, endISO);
    if (result.success) setBreakdown(result.data);
    else setBreakdown([]);
    setIsBreakdownLoading(false);
  };

  const loadMonthlyCalendar = async (dateCursor) => {
    setIsCalendarLoading(true);
    const result = await fetchMonthlySalesCalendar(
      dateCursor.getFullYear(),
      dateCursor.getMonth() + 1
    );
    if (result.success) setCalendarSales(result.data);
    setIsCalendarLoading(false);
  };

  const handleResetTodaysSales = async () => {
    if (todayOrders.length === 0) {
      setMessage('오늘 삭제할 매출이 없습니다');
      return;
    }

    const todayRevenue = todayOrders.reduce(
      (sum, order) => sum + Number(order.total_price || 0),
      0
    );

    const firstConfirm = window.confirm(
      `정말 오늘 매출(${todayOrders.length}건, ₩${todayRevenue.toLocaleString('ko-KR')})을 모두 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`
    );
    if (!firstConfirm) return;

    const confirmText = window.prompt(
      '안전 확인: "초기화"를 정확히 입력하면 오늘 매출이 전부 삭제됩니다.'
    );
    if (confirmText !== '초기화') {
      setMessage('초기화가 취소되었습니다. 확인 문구가 일치하지 않습니다.');
      return;
    }

    setIsResettingSales(true);
    const result = await resetTodaysSales();
    if (result.success) {
      setMessage(`오늘 매출 ${result.deletedCount}건이 초기화되었습니다.`);
      await loadTodayData();
    } else {
      setMessage(`오류: ${result.error}`);
    }
    setIsResettingSales(false);
  };

  const moveCalendarMonth = (offset) => {
    setCalendarMonth(
      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1)
    );
  };

  const monthYearLabel = `${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월`;
  const firstDay = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    1
  ).getDay();
  const daysInMonth = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() + 1,
    0
  ).getDate();
  const todayRevenue = todayOrders.reduce(
    (sum, order) => sum + Number(order.total_price || 0),
    0
  );
  const maxQuantity = breakdown.length > 0 ? breakdown[0].totalQuantity : 1;

  const buildDateKey = (year, monthIndex, day) =>
    `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const PERIODS = [
    { key: 'today', label: '오늘' },
    { key: 'week', label: '이번 주' },
    { key: 'month', label: '이번 달' },
  ];

  return (
    <>
      <header className="header-nav">
        <h1>ChoiChoi</h1>
        <nav>
          <ul className="nav-links">
            <li><Link href="/">POS</Link></li>
            <li><Link href="/stats" className="active">통계</Link></li>
            <li><Link href="/schedule">일정</Link></li>
            <li><Link href="/memo">메모장</Link></li>
            <li><Link href="/settings">설정</Link></li>
          </ul>
        </nav>
      </header>

      <main className="pos-wrap">
        <div className="stats-wrap">
          <h2>매출</h2>

          {message && (
            <div className={`message ${message.includes('오류') ? 'error' : 'success'}`}>
              {message}
            </div>
          )}

          {/* 오늘 요약 */}
          <div className="stats-section">
            <div className="stats-section-header">
              <h3>오늘 매출 요약</h3>
              <button className="refresh-btn" onClick={loadTodayData} disabled={isLoading}>
                {isLoading ? '불러오는 중...' : '새로고침'}
              </button>
            </div>
            <div className="stats-summary-row">
              <div className="stats-summary-card">
                <span className="stats-card-label">총 주문</span>
                <strong className="stats-card-value">{summary.totalOrders}건</strong>
              </div>
              <div className="stats-summary-card highlight">
                <span className="stats-card-label">총 매출</span>
                <strong className="stats-card-value">₩{KRW.format(summary.totalRevenue)}</strong>
              </div>
            </div>
          </div>

          {/* 메뉴별 판매 현황 — 기간 탭 */}
          <div className="stats-section">
            <div className="stats-section-header">
              <h3>메뉴별 판매 현황 ({getPeriodBounds(breakdownPeriod).label})</h3>
            </div>
            <div className="period-tabs">
              {PERIODS.map(({ key, label }) => (
                <button
                  key={key}
                  className={`period-tab ${breakdownPeriod === key ? 'active' : ''}`}
                  onClick={() => setBreakdownPeriod(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {isBreakdownLoading ? (
              <p>불러오는 중...</p>
            ) : breakdown.length === 0 ? (
              <p className="empty-order">해당 기간 판매 내역이 없습니다.</p>
            ) : (
              <ul className="breakdown-list">
                {breakdown.map((item) => (
                  <li key={item.id} className="breakdown-item">
                    <div className="breakdown-item-info">
                      <span
                        className="breakdown-color"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="breakdown-name">{item.name}</span>
                    </div>
                    <div className="breakdown-stats">
                      <div className="breakdown-bar-wrap">
                        <div
                          className="breakdown-bar"
                          style={{
                            width: `${(item.totalQuantity / maxQuantity) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="breakdown-qty">{item.totalQuantity}개</span>
                      <span className="breakdown-revenue">
                        ₩{KRW.format(item.totalRevenue)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 오늘 주문 내역 + 초기화 */}
          <div className="stats-section">
            <div className="sales-manager">
              <div className="sales-manager-header">
                <h3>오늘 주문 내역</h3>
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
                  disabled={isResettingSales || isLoading || todayOrders.length === 0}
                >
                  {isResettingSales ? '초기화 중...' : '오늘 매출 전체 초기화'}
                </button>
              </div>

              <div className="sales-order-list-wrap">
                <h4>주문 내역 (주문번호 / 가격)</h4>
                {isLoading ? (
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
          </div>

          {/* 월별 달력 */}
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
              <strong>
                월 매출 ₩{Number(calendarSales.monthTotal || 0).toLocaleString('ko-KR')}
              </strong>
            </div>

            {isCalendarLoading ? (
              <p>달력 매출을 불러오는 중입니다...</p>
            ) : (
              <div className="sales-calendar-grid">
                {['일', '월', '화', '수', '목', '금', '토'].map((dayName) => (
                  <div key={dayName} className="calendar-weekday">
                    {dayName}
                  </div>
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
