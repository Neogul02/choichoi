const { useMemo, useState } = React;

const MENU_ITEMS = [
  { id: 1, name: '우유크림 소금빵', price: 4600, emoji: '🥛' },
  { id: 2, name: '명란마요 소금빵', price: 4900, emoji: '🧈' },
  { id: 3, name: '고메버터 소금빵', price: 3300, emoji: '🧀' },
  { id: 4, name: '잠봉뵈르 소금빵', price: 6900, emoji: '🥓' },
  { id: 5, name: '쪽파크림치즈 소금빵', price: 4900, emoji: '🧅' },
  { id: 6, name: '생딸기 우유모찌 소금빵', price: 5900, emoji: '🍓' },
  { id: 7, name: '초코 소금빵', price: 4600, emoji: '🍫' },
  { id: 8, name: '모찌 소금빵', price: 4900, emoji: '🍞' }
];

const KRW = new Intl.NumberFormat('ko-KR');

function App() {
  const [counts, setCounts] = useState(() =>
    MENU_ITEMS.reduce((acc, item) => {
      acc[item.id] = 0;
      return acc;
    }, {})
  );

  const totalCount = useMemo(
    () => Object.values(counts).reduce((sum, count) => sum + count, 0),
    [counts]
  );

  const totalPrice = useMemo(
    () => MENU_ITEMS.reduce((sum, item) => sum + item.price * (counts[item.id] ?? 0), 0),
    [counts]
  );

  const increase = (id) => setCounts((prev) => ({ ...prev, [id]: prev[id] + 1 }));
  const decrease = (id) => setCounts((prev) => ({ ...prev, [id]: Math.max(0, prev[id] - 1) }));

  const resetOrder = () => {
    setCounts(
      MENU_ITEMS.reduce((acc, item) => {
        acc[item.id] = 0;
        return acc;
      }, {})
    );
  };

  return (
    <main className="pos-wrap">
      <header className="summary">
        <h1>🧂 소금빵</h1>
        <div className="summary-info">
          <div className="summary-count">총 {totalCount}개</div>
          <div className="summary-total">{KRW.format(totalPrice)}원</div>
        </div>
        <button className="reset-btn" onClick={resetOrder}>
          초기화
        </button>
      </header>

      <section className="menu-grid" aria-label="메뉴 목록">
        {MENU_ITEMS.map((item) => (
          <article key={item.id} className="menu-card">
            <h2>
              <span>{item.emoji}</span> {item.name}
            </h2>
            <p className="price">{KRW.format(item.price)}원</p>
            <div className="counter-row">
              <button onClick={() => decrease(item.id)}>-</button>
              <strong>{counts[item.id]}개</strong>
              <button onClick={() => increase(item.id)}>+</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
