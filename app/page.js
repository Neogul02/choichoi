'use client';

import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMenuItems, saveOrder, fetchTodaysSales } from './actions';

const KRW = new Intl.NumberFormat('ko-KR');

export default function Home() {
  const [counts, setCounts] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const queryClient = useQueryClient();

  const menuQuery = useQuery({
    queryKey: ['menu-items'],
    queryFn: async () => {
      const result = await fetchMenuItems();
      if (!result.success) throw new Error(result.error || '메뉴 로딩 실패');
      return result.data;
    },
    placeholderData: (previousData) => previousData,
  });

  const salesQuery = useQuery({
    queryKey: ['today-sales'],
    queryFn: async () => {
      const result = await fetchTodaysSales();
      if (!result.success) throw new Error(result.error || '매출 로딩 실패');
      return result.data;
    },
    refetchInterval: 5000,
    placeholderData: (previousData) => previousData,
  });

  const menuItems = menuQuery.data || [];
  const sales = salesQuery.data || { totalOrders: 0, totalRevenue: 0 };
  const isSalesLoading = salesQuery.isLoading;

  useEffect(() => {
    if (!menuItems.length) return;

    setCounts((prev) => {
      const next = { ...prev };
      for (const item of menuItems) {
        if (typeof next[item.id] !== 'number') {
          next[item.id] = 0;
        }
      }
      return next;
    });
  }, [menuItems]);

  const totalCount = useMemo(
    () => Object.values(counts).reduce((sum, count) => sum + count, 0),
    [counts]
  );

  const totalPrice = useMemo(() => {
    return menuItems.reduce(
      (sum, item) => sum + item.price * (counts[item.id] ?? 0),
      0
    );
  }, [counts, menuItems]);

  const orderedItems = useMemo(
    () => menuItems.filter((item) => (counts[item.id] ?? 0) > 0),
    [counts, menuItems]
  );

  const increase = (id) =>
    setCounts((prev) => ({ ...prev, [id]: prev[id] + 1 }));

  const decrease = (id) =>
    setCounts((prev) => ({ ...prev, [id]: Math.max(0, prev[id] - 1) }));

  const resetOrder = () => {
    const newCounts = {};
    menuItems.forEach(item => {
      newCounts[item.id] = 0;
    });
    setCounts(newCounts);
  };

  const checkoutMutation = useMutation({
    mutationFn: async ({ items, totalPrice }) => saveOrder(items, totalPrice),
    onSuccess: async (result) => {
      if (result.success) {
        setMessage(`주문 완료! 주문번호: ${result.orderId}`);
        resetOrder();
        setTimeout(() => setMessage(''), 3000);
        await queryClient.invalidateQueries({ queryKey: ['today-sales'] });
      } else {
        setMessage(`오류 발생: ${result.error}`);
      }
    },
    onError: (error) => {
      setMessage(`오류 발생: ${error.message}`);
    },
  });

  const handleCheckout = async () => {
    if (totalPrice === 0) {
      setMessage('주문하신 항목이 없습니다');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      const orderedItemsData = menuItems
        .filter((item) => counts[item.id] > 0)
        .map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          count: counts[item.id],
        }));

      await checkoutMutation.mutateAsync({
        items: orderedItemsData,
        totalPrice,
      });
    } catch (error) {
      setMessage(`오류 발생: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <header className="header-nav">
        <h1>ChoiChoi</h1>
        <nav>
          <ul className="nav-links">
            <li>
              <Link href="/" className="active">
                POS
              </Link>
            </li>
            <li>
              <Link href="/settings">설정</Link>
            </li>
          </ul>
        </nav>
      </header>

      <main className="pos-wrap">
        <header className="summary">
          <h1>ChoiChoi</h1>
          <div className="summary-count">총 주문 빵 개수: {totalCount}개</div>
          <div className="summary-total">{KRW.format(totalPrice)}원</div>
          <p className="summary-help">
            메뉴 카드를 누르면 해당 빵이 1개씩 추가됩니다.
          </p>
          <button className="reset-btn" onClick={resetOrder}>
            주문 초기화
          </button>
        </header>

        {message && (
          <div className={`message ${message.includes('오류') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}

        <section className="menu-grid" aria-label="메뉴 목록">
          {menuQuery.isLoading && menuItems.length === 0 ? (
            <p className="empty-order">메뉴를 불러오는 중입니다...</p>
          ) : null}
          {menuItems.map((item) => {
            const count = counts[item.id];
            return (
              <article
                key={item.id}
                className={`menu-card ${count > 0 ? 'active' : ''}`}
              >
                <button className="card-add-btn" onClick={() => increase(item.id)}>
                  <div className="menu-header">
                    <span
                      className="color-indicator"
                      style={{ backgroundColor: item.color }}
                    ></span>
                    <h2>{item.name}</h2>
                  </div>
                  <p className="price">{KRW.format(item.price)}원</p>
                </button>

                <div className="counter-row">
                  <button
                    onClick={() => decrease(item.id)}
                    aria-label={`${item.name} 수량 감소`}
                  >
                    −
                  </button>
                  <strong>{count}개</strong>
                  <button
                    onClick={() => increase(item.id)}
                    aria-label={`${item.name} 수량 증가`}
                  >
                    +
                  </button>
                </div>
              </article>
            );
          })}
        </section>

        <section className="order-summary" aria-label="주문 상세">
          <h2>주문 상세</h2>
          {orderedItems.length === 0 ? (
            <p className="empty-order">선택한 메뉴가 없습니다.</p>
          ) : (
            <ul className="order-list">
              {orderedItems.map((item) => {
                const count = counts[item.id];
                const subtotal = item.price * count;
                return (
                  <li key={item.id}>
                    <span>
                      {item.name} × {count}
                    </span>
                    <strong>{KRW.format(subtotal)}원</strong>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            className="checkout-btn"
            onClick={handleCheckout}
            disabled={orderedItems.length === 0 || isLoading}
          >
            {isLoading ? '처리 중...' : '결제완료'}
          </button>
        </section>
      </main>
    </>
  );
}
