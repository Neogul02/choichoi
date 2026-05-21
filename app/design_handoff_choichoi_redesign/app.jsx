// Real ChoiChoi POS — responsive Tailwind v4 app, container-query based.
// Mirrors the GitHub repo's brand: forest green primary, rose pending accent,
// Pretendard, #f5f6f7 canvas. All screens (POS / Display / Orders / Stats /
// Settings / Memo) live in this single tree and reflow per container width.

const MENU = [
  { id: 1, name: '딸기산도',  price: 8500, color: '#E53935' },
  { id: 2, name: '메론산도',  price: 8500, color: '#7CB342' },
  { id: 3, name: '후르츠산도', price: 9000, color: '#00ACC1' },
  { id: 4, name: '망고산도',  price: 9000, color: '#FB8C00' },
  { id: 5, name: '보냉백 추가', price: 1000, color: '#3949AB' },
];

const fmt = (n) => n.toLocaleString('ko-KR');

// Pre-seeded interaction state so the design reads as a real moment.
const SEEDED_CART = { 1: 2, 3: 1 };
const SEEDED_RECENT = [
  { id: 47, time: '14:21', items: '딸기산도 ×2, 후르츠산도 ×1', amount: 26000, by: '나경' },
  { id: 46, time: '14:18', items: '망고산도 ×1, 보냉백 ×1',     amount: 10000, by: '지민' },
  { id: 45, time: '14:11', items: '메론산도 ×3',                amount: 25500, by: '나경' },
  { id: 44, time: '13:58', items: '딸기산도 ×1, 메론산도 ×2',    amount: 25500, by: '나경' },
  { id: 43, time: '13:42', items: '후르츠산도 ×2',              amount: 18000, by: '지민' },
];

// ────────────────────────────────────────────────────────────
// Top app bar (matches NavBar.tsx structure, more polished)
// ────────────────────────────────────────────────────────────
const TopBar = ({ active = 'POS' }) => {
  const links = [
    { id: 'POS',  l: 'POS' },
    { id: 'ORD',  l: '주문' },
    { id: 'STA',  l: '통계' },
    { id: 'SCH',  l: '일정' },
    { id: 'MEM',  l: '메모' },
    { id: 'SET',  l: '설정' },
  ];
  return (
    <header className="bg-white border-b border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="px-3 @md:px-4 @2xl:px-5 py-2.5 flex flex-col @md:flex-row @md:items-center @md:justify-between gap-2 @md:gap-3">
        <div className="flex items-center justify-between @md:justify-start gap-3 min-w-0">
          <h1 className="m-0 text-xl @md:text-2xl font-extrabold text-[#161616] shrink-0">ChoiChoi</h1>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="hidden @md:inline text-[11px] text-[#bbb] shrink-0">접속</span>
            <div className="flex gap-1 flex-wrap">
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> 나경
              </span>
              <span className="hidden @lg:flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> 지민
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 @md:gap-2 min-w-0">
          <nav className="min-w-0">
            <ul className="flex gap-1 @md:gap-1.5 m-0 p-0 list-none flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {links.map(({ id, l }) => (
                <li key={id}>
                  <button
                    className={`block px-3 py-1.5 @md:px-4 @md:py-2 text-[13px] @md:text-sm rounded-lg no-underline font-semibold transition-all duration-200 whitespace-nowrap ${
                      id === active
                        ? 'bg-[#084431] text-white'
                        : 'bg-[#f5f6f7] text-[#161616] hover:bg-[#084431] hover:text-white'
                    }`}
                  >
                    {l}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="w-px h-5 bg-[#e5e5e5] shrink-0" />
          <button className="shrink-0 px-3 py-1.5 @md:px-4 @md:py-2 text-[13px] @md:text-sm rounded-lg font-semibold transition-all whitespace-nowrap bg-[#f5f6f7] text-[#666] hover:bg-[#084431] hover:text-white">
            관리자
          </button>
        </div>
      </div>
    </header>
  );
};

// Brand sales banner — 전체 영역 탭하면 겸림(블라인드) · 다시 탭하면 보임
const SalesBanner = ({ revenue = 398500, orders = 47, hidden = false, onToggleHidden }) => (
  <button
    type="button"
    onClick={onToggleHidden}
    aria-label={hidden ? '매출 보기' : '매출 숨기기'}
    aria-pressed={hidden}
    className="group relative w-full text-left text-white rounded-2xl p-4 @md:p-5 overflow-hidden cursor-pointer border-none active:scale-[0.997] transition"
    style={{
      background: hidden
        ? 'linear-gradient(135deg, #1f2a26 0%, #2f3d36 55%, #3d4a43 100%)'
        : 'linear-gradient(135deg, #084431 0%, #0d6b4e 55%, #3d9966 100%)',
      boxShadow: hidden
        ? '0 6px 28px rgba(30,40,35,0.35)'
        : '0 6px 28px rgba(8,68,49,0.45)',
    }}
  >
    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
    <div className="absolute -bottom-6 -right-6 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
    <div className="absolute -bottom-2 -right-2 w-16 h-16 rounded-full bg-white/5 pointer-events-none" />

    <div className="relative flex items-center justify-between">
      <div>
        <p className={`m-0 text-[11px] font-bold tracking-[0.12em] uppercase mb-1.5 ${hidden ? 'text-white/40' : 'text-emerald-200'}`}>
          오늘 매출
        </p>
        <div className="text-[clamp(28px,7cqw,46px)] font-black leading-none tabular-nums">
          {hidden ? <span className="tracking-[0.18em] text-white/35 select-none">₩••••••</span> : <>₩{fmt(revenue)}</>}
        </div>
      </div>
      <div className={`self-stretch w-px mx-4 @md:mx-6 ${hidden ? 'bg-white/10' : 'bg-white/20'}`} />
      <div className="text-right">
        <p className={`m-0 text-[11px] font-bold tracking-[0.12em] uppercase mb-1.5 ${hidden ? 'text-white/40' : 'text-emerald-200'}`}>
          주문 수
        </p>
        <div className="text-[clamp(28px,7cqw,46px)] font-black leading-none tabular-nums">
          {hidden ? <span className="tracking-[0.18em] text-white/35 select-none">•••</span> : <>{orders}건</>}
        </div>
      </div>
    </div>

    {/* hint */}
    <div className={`relative mt-3 flex items-center gap-1.5 text-[11px] font-semibold ${hidden ? 'text-white/55' : 'text-emerald-200/70 group-hover:text-emerald-200'}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {hidden
          ? <><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></>
          : <><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></>}
      </svg>
      {hidden ? '탭해서 매출 보기' : '탭해서 가리기'}
    </div>
  </button>
);

// Pending payment hero — the rose card from page.tsx
const PendingHero = ({ total, count }) => (
  <div className="bg-white rounded-2xl p-3 @md:p-4 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
    <div className="rounded-xl p-3 @md:p-4 bg-[#fff5f5] border-2 border-rose-500">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold tracking-[0.04em] px-2 py-0.5 rounded-full bg-rose-500 text-white">결제 대기</span>
          <span className="text-[11px] font-semibold text-[#aaa]">{count}개</span>
        </div>
        <button className="text-[11px] font-bold text-rose-400 border border-rose-200 rounded-lg px-2 py-0.5 bg-white cursor-pointer hover:bg-rose-50">
          초기화
        </button>
      </div>
      <div className="text-[clamp(28px,9cqw,52px)] font-black text-rose-500 leading-[1.05] tabular-nums">
        {fmt(total)}원
      </div>
      <p className="m-0 mt-1 text-[11px] @md:text-xs text-rose-400/70 font-semibold">
        1~9 추가 · Enter 결제 · Esc 초기화
      </p>
    </div>
  </div>
);

// Menu card — bigger and bolder at larger sizes; uses cqw for hero price
const MenuCard = ({ item, index, count, onInc, onDec }) => {
  const active = count > 0;
  return (
    <article
      className={`relative rounded-2xl p-3 @md:p-4 cursor-pointer transition-shadow ${
        active ? '' : 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.12)]'
      }`}
      style={active ? {
        backgroundColor: hexA(item.color, 0.18),
        boxShadow: `0 0 0 3px ${hexA(item.color, 0.65)}`,
      } : {}}
      onClick={onInc}
    >
      {index < 9 && (
        <strong
          className="absolute top-2 right-2 @md:right-2.5 min-w-[28px] h-7 px-2 rounded-full border border-black/15 text-base font-black leading-7 text-center z-10 shadow-[0_1px_4px_rgba(0,0,0,0.16)]"
          style={{ backgroundColor: '#fff', color: item.color }}
        >
          {index + 1}
        </strong>
      )}
      <div className="mb-3 @md:mb-4">
        <div className="flex items-center gap-2 @md:gap-2.5 mb-1.5 @md:mb-2">
          <span className="w-3 h-3 @md:w-3.5 @md:h-3.5 rounded-full shrink-0 border-2 border-black/10" style={{ backgroundColor: item.color }} />
          <h2 className="m-0 text-sm @md:text-base @4xl:text-lg font-bold leading-snug text-[#161616]">
            {item.name}
          </h2>
        </div>
        <p className="m-0 text-xl @md:text-2xl @4xl:text-3xl font-extrabold text-[#1a1a1a] tabular-nums">
          {fmt(item.price)}원
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onDec(); }}
          className="flex items-center justify-center w-9 h-9 @md:w-10 @md:h-10 rounded-lg border border-[#ddd] text-xl @md:text-2xl font-semibold cursor-pointer bg-[#fafafa] hover:bg-[#f0f0f0] hover:border-[#999] active:scale-95 leading-none"
        >−</button>
        <strong className={`flex-1 text-base @md:text-lg font-bold text-center tabular-nums whitespace-nowrap ${active ? 'text-[#084431]' : 'text-[#333]'}`}>
          {count}개
        </strong>
        <button
          onClick={(e) => { e.stopPropagation(); onInc(); }}
          className="flex items-center justify-center w-9 h-9 @md:w-10 @md:h-10 rounded-lg border border-[#ddd] text-xl @md:text-2xl font-semibold cursor-pointer bg-[#fafafa] hover:bg-[#f0f0f0] hover:border-[#999] active:scale-95 leading-none"
        >+</button>
      </div>
    </article>
  );
};

// helper: hex + alpha
function hexA(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Order details list. showCheckout=false일 때는 결제 버튼 숨김 (모바일은 sticky 버튼 사용)
const OrderDetails = ({ counts, onCheckout, showCheckout = true }) => {
  const lines = MENU.filter((m) => (counts[m.id] ?? 0) > 0);
  const total = lines.reduce((s, m) => s + m.price * counts[m.id], 0);
  return (
    <section className="bg-white rounded-2xl p-3 @md:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <h2 className="m-0 mb-2 @md:mb-3 text-sm @md:text-base font-bold">주문 상세</h2>
      {lines.length === 0 ? (
        <p className="m-0 text-[#999] text-sm">선택한 메뉴가 없습니다.</p>
      ) : (
        <ul className="m-0 p-0 list-none">
          {lines.map((m, i) => (
            <li key={m.id} className={`flex justify-between items-center py-2.5 text-sm ${i !== lines.length - 1 ? 'border-b border-[#f0f0f0]' : ''}`}>
              <span>{m.name} × {counts[m.id]}</span>
              <strong className="font-bold text-[#084431] tabular-nums">{fmt(m.price * counts[m.id])}원</strong>
            </li>
          ))}
          <li className="flex justify-between items-center pt-3 mt-2 border-t-2 border-dashed border-[#f0f0f0]">
            <span className="text-sm font-bold text-[#888]">합계</span>
            <strong className="text-lg font-black text-[#084431] tabular-nums">{fmt(total)}원</strong>
          </li>
        </ul>
      )}
      {showCheckout && (
        <button
          onClick={onCheckout}
          className="w-full p-3 @md:p-4 mt-3 text-base @md:text-lg font-bold bg-[#084431] text-white border-none rounded-xl cursor-pointer hover:bg-[#063424] hover:-translate-y-0.5 active:scale-[0.98] disabled:bg-[#ccc] disabled:cursor-not-allowed transition-all"
          disabled={lines.length === 0}
        >
          결제하기
        </button>
      )}
    </section>
  );
};

// Recent orders strip
const RecentOrders = () => (
  <section className="bg-white rounded-2xl p-3.5 @md:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="m-0 text-base @md:text-lg font-bold text-[#333]">최근 주문</h2>
      <span className="text-[11px] @md:text-xs text-[#999] font-medium">실시간 · 5초 전</span>
    </div>
    <ul className="m-0 p-0 list-none">
      {SEEDED_RECENT.map((o, i, arr) => (
        <li key={o.id} className={`py-2.5 ${i !== arr.length - 1 ? 'border-b border-[#f0f0f0]' : ''}`}>
          <div className="flex justify-between items-center mb-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[#888] text-xs font-medium">{o.time}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#f0f0f0] text-[#666]">#{o.id}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{o.by}</span>
            </div>
            <strong className="text-sm font-bold text-[#084431] tabular-nums">{fmt(o.amount)}원</strong>
          </div>
          <p className="m-0 text-[#555] text-xs truncate">{o.items}</p>
        </li>
      ))}
    </ul>
  </section>
);

// ────────────────────────────────────────────────────────────
// SCREEN · POS  (the /pos route)
// ────────────────────────────────────────────────────────────
const ScreenPOS = () => {
  const [salesHidden, setSalesHidden] = React.useState(false);
  const counts = SEEDED_CART;
  const total = MENU.reduce((s, m) => s + m.price * (counts[m.id] ?? 0), 0);
  const totalCount = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <div className="@container min-h-full bg-[#f5f6f7] text-[#161616] relative">
      <TopBar active="POS" />

      {/* MAIN — adaptive layout */}
      <main className="p-3 @md:p-5 mx-auto max-w-[1400px] pb-24 @2xl:pb-5">
        {/* Date strip */}
        <div className="flex items-center justify-between mb-3 @md:mb-4 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs @md:text-sm font-semibold text-[#666]">2026년 5월 18일 (월)</span>
            <span className="text-[10px] @md:text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#084431]/10 text-[#084431]">팝업 D+4</span>
          </div>
          <span className="text-[11px] @md:text-xs text-[#888] font-medium">14:22 · 단말 #2</span>
        </div>

        {/* RESPONSIVE GRID
            iPhone (≤ ~600): 1 col, stacked
            iPad  (>= @2xl ≈ 672px): 1.6fr / 1fr — menu left, cart right
            MacBook (>= @5xl ≈ 1024px): 1fr / 380px — menu wide, cart sticky */}
        <div className="grid gap-3 @md:gap-4 @2xl:grid-cols-[1.5fr_1fr] @5xl:grid-cols-[1fr_380px]">
          {/* LEFT column */}
          <div className="flex flex-col gap-3 @md:gap-4 min-w-0">
            {/* Pending hero — shows only on small screens where cart is below */}
            <div className="@2xl:hidden">
              <PendingHero total={total} count={totalCount} />
            </div>

            {/* Menu grid: 2 col phone, 3 col tablet, 4 col laptop */}
            <section className="grid grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-4 gap-2 @md:gap-3">
              {MENU.map((m, i) => (
                <MenuCard
                  key={m.id} item={m} index={i}
                  count={counts[m.id] ?? 0}
                  onInc={() => {}} onDec={() => {}}
                />
              ))}
              {/* Empty add-tile to keep the grid balanced when 5 items shown in 3/4 col */}
              <article className="rounded-2xl border-2 border-dashed border-[#ddd] bg-transparent flex flex-col items-center justify-center gap-1.5 p-4 text-[#999] hover:border-[#084431] hover:text-[#084431] cursor-pointer transition-colors min-h-[140px]">
                <div className="w-10 h-10 rounded-full bg-[#f5f6f7] flex items-center justify-center text-xl font-bold">+</div>
                <span className="text-xs font-semibold">임시 메뉴</span>
              </article>
            </section>

            {/* Order details — 폰에는 결제 버튼 없이(sticky 버튼 사용), 태블릿+에서는 사이드바의 OrderDetails가 처리 */}
            <div className="@2xl:hidden">
              <OrderDetails counts={counts} onCheckout={() => {}} showCheckout={false} />
            </div>

            {/* Recent orders + sales banner */}
            <RecentOrders />
            <SalesBanner revenue={398500} orders={47} hidden={salesHidden} onToggleHidden={() => setSalesHidden((v) => !v)} />
          </div>

          {/* RIGHT column (sticky sidebar on tablet/laptop) */}
          <aside className="hidden @2xl:flex flex-col gap-3 @md:gap-4 min-w-0 @2xl:sticky @2xl:top-3 @2xl:self-start">
            <PendingHero total={total} count={totalCount} />
            <OrderDetails counts={counts} onCheckout={() => {}} />
          </aside>
        </div>
      </main>

      {/* 스티키 결제하기 — 폰(종소) 전용. 태블릿/델을는 사이드바에 결제 버튼이 이미 있으므로 숨김 */}
      <div className="@2xl:hidden sticky bottom-0 left-0 right-0 z-20 px-3 pb-3 pt-3 bg-gradient-to-t from-[#f5f6f7] via-[#f5f6f7]/95 to-transparent pointer-events-none">
        <button
          className="pointer-events-auto w-full px-5 py-4 rounded-2xl bg-[#084431] hover:bg-[#063424] text-white font-bold flex items-center justify-between gap-3 shadow-[0_10px_30px_rgba(8,68,49,0.4)] transition active:scale-[0.99] disabled:bg-[#ccc] disabled:cursor-not-allowed"
          disabled={totalCount === 0}
        >
          <span className="flex items-center gap-2.5">
            <span className="min-w-7 h-7 px-2 rounded-full bg-white/20 text-xs font-black flex items-center justify-center tabular-nums">
              {totalCount}개
            </span>
            <span className="text-base">결제하기</span>
          </span>
          <span className="text-lg font-black tabular-nums">{fmt(total)}원</span>
        </button>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// SCREEN · DISPLAY (customer-facing — /display)
// ────────────────────────────────────────────────────────────
const ScreenDisplay = () => {
  const cart = MENU.filter((m) => SEEDED_CART[m.id]).map((m) => ({ ...m, count: SEEDED_CART[m.id] }));
  const total = cart.reduce((s, l) => s + l.price * l.count, 0);

  return (
    <div className="@container min-h-full bg-[#f5f6f7] text-[#161616] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-[#eee] px-4 @md:px-6 py-3 @md:py-4 flex items-center justify-between shadow-sm">
        <div className="w-8 h-8 rounded-lg bg-[#f5f6f7] text-[#999] flex items-center justify-center text-base">←</div>
        <div className="flex items-center gap-1 bg-[#f0f0f0] rounded-xl p-1">
          <button className="px-3 @md:px-4 py-1.5 rounded-lg text-xs @md:text-sm font-bold bg-white text-[#1a1a1a] shadow-sm">프론트</button>
          <button className="px-3 @md:px-4 py-1.5 rounded-lg text-xs @md:text-sm font-bold bg-transparent text-[#999]">주문하기</button>
        </div>
      </header>
      {/* Flip banner */}
      <div className="bg-[#0a5239] px-4 @md:px-6 py-2.5 @md:py-3 flex items-center justify-center">
        <p className="m-0 text-white text-xs @md:text-sm font-semibold tracking-wide text-center">
          오늘의 인기 메뉴 · 딸기산도가 가장 많이 팔리고 있어요
        </p>
      </div>

      {/* Main centered cart view */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 @md:p-8">
        <div className="w-full max-w-[640px]">
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.07)] overflow-hidden mb-3 @md:mb-4">
            <div className="px-5 @md:px-6 py-3 @md:py-4 border-b border-[#f0f0f0]">
              <h3 className="text-xs @md:text-sm font-bold text-[#888] tracking-wider uppercase m-0">주문 내역</h3>
            </div>
            <ul className="m-0 p-0 list-none divide-y divide-[#f5f5f5]">
              {cart.map((l) => (
                <li key={l.id} className="flex items-center justify-between px-5 @md:px-6 py-3 @md:py-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                    <span className="text-base @md:text-lg @4xl:text-xl font-semibold text-[#1a1a1a]">{l.name}</span>
                    <span className="text-sm font-bold text-[#bbb]">× {l.count}</span>
                  </div>
                  <span className="text-base @md:text-lg @4xl:text-xl font-bold text-[#333] tabular-nums">
                    {fmt(l.price * l.count)}원
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-[#084431] rounded-2xl px-5 @md:px-6 py-4 @md:py-5 flex items-center justify-between shadow-[0_4px_20px_rgba(8,68,49,0.25)]">
            <span className="text-white text-base @md:text-lg font-bold opacity-80">합계</span>
            <span className="text-white text-[clamp(28px,8cqw,56px)] font-black leading-none tabular-nums">
              {fmt(total)}원
            </span>
          </div>
        </div>
      </main>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// SCREEN · ORDERS (pending order cards)
// ────────────────────────────────────────────────────────────
const PENDING = [
  { id: 49, time: '14:22', cashier: '나경', items: [['딸기산도', 1], ['후르츠산도', 1]], total: 17500 },
  { id: 48, time: '14:20', cashier: '지민', items: [['망고산도', 2]], total: 18000 },
  { id: 47, time: '14:21', cashier: '나경', items: [['딸기산도', 2], ['후르츠산도', 1]], total: 26000 },
];

const ScreenOrders = () => (
  <div className="@container min-h-full bg-[#f5f6f7] text-[#161616]">
    <TopBar active="ORD" />
    <main className="p-3 @md:p-5 mx-auto max-w-[1200px]">
      <div className="flex items-center justify-between bg-white rounded-2xl px-4 @md:px-5 py-3 @md:py-3.5 mb-3 @md:mb-4 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
        <h1 className="m-0 text-lg @md:text-xl font-black text-[#161616]">주문 현황</h1>
        <span className="px-2.5 py-1 rounded-full bg-rose-500 text-white text-xs font-black">{PENDING.length}건 대기</span>
      </div>

      {/* 1 col phone, 2 col tablet, 3 col laptop */}
      <ul className="m-0 p-0 list-none grid grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-3 gap-3">
        {PENDING.map((o) => (
          <li key={o.id} className="bg-white rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex flex-col">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[#888] text-xs font-medium">{o.time}</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#f0f0f0] text-[#666]">#{o.id}</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{o.cashier}</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">대기 중</span>
              </div>
              <strong className="text-sm font-bold text-[#084431] tabular-nums">{fmt(o.total)}원</strong>
            </div>
            <ul className="m-0 p-0 list-none mb-3 flex-1">
              {o.items.map(([n, q], i, arr) => (
                <li key={i} className={`flex justify-between items-center py-1.5 ${i !== arr.length - 1 ? 'border-b border-[#f5f5f5]' : ''}`}>
                  <span className="text-sm font-semibold text-[#333]">{n}</span>
                  <span className="text-sm text-[#888] tabular-nums">× {q}</span>
                </li>
              ))}
            </ul>
            <button className="w-full py-2.5 rounded-lg border-none bg-emerald-500 text-white text-[13px] font-bold cursor-pointer hover:bg-emerald-600 active:scale-[0.98] transition">
              확인
            </button>
          </li>
        ))}
      </ul>
    </main>
  </div>
);

// ────────────────────────────────────────────────────────────
// SCREEN · STATS (bento grid)
// ────────────────────────────────────────────────────────────

// 7단계 메출 랭크. 브론즈 → 챌린저. 카드 자체 그라데이션만 변경, 레이아웃은 일정.
const SALES_TIERS = [
  { v:  50_000, lv: 1, name: 'BRONZE',     ko: '브론즈',   vsYesterday: -5,
    bg: 'linear-gradient(135deg,#5c2d10 0%,#a0531f 45%,#cd7f32 80%,#e0a36b 100%)',
    accent: '#f4d4b0', shadow: '0 8px 32px rgba(160,83,31,0.40)',
    labelText: '#f4d4b0', mute: 'rgba(255,255,255,0.7)' },
  { v: 100_000, lv: 2, name: 'SILVER',     ko: '실버',    vsYesterday:  3,
    bg: 'linear-gradient(135deg,#3f4b5b 0%,#6b7785 45%,#a8b1bd 80%,#cfd5dd 100%)',
    accent: '#f3f4f6', shadow: '0 8px 32px rgba(75,85,99,0.40)',
    labelText: '#e5e7eb', mute: 'rgba(255,255,255,0.75)' },
  { v: 200_000, lv: 3, name: 'GOLD',       ko: '골드',    vsYesterday:  8,
    bg: 'linear-gradient(135deg,#7c2d12 0%,#c2410c 25%,#f59e0b 60%,#fcd34d 90%,#fef3c7 100%)',
    accent: '#fef3c7', shadow: '0 10px 36px rgba(217,119,6,0.45)',
    labelText: '#fef3c7', mute: 'rgba(255,255,255,0.80)' },
  { v: 300_000, lv: 4, name: 'PLATINUM',   ko: '플래티녃', vsYesterday: 14,
    bg: 'linear-gradient(135deg,#064e3b 0%,#0d9488 40%,#2dd4bf 70%,#99f6e4 100%)',
    accent: '#ccfbf1', shadow: '0 10px 36px rgba(15,118,110,0.45)',
    labelText: '#ccfbf1', mute: 'rgba(255,255,255,0.85)' },
  { v: 400_000, lv: 5, name: 'DIAMOND',    ko: '다이아', vsYesterday: 21,
    bg: 'linear-gradient(135deg,#1e3a8a 0%,#2563eb 35%,#60a5fa 70%,#bfdbfe 100%)',
    accent: '#dbeafe', shadow: '0 12px 40px rgba(59,130,246,0.50)',
    labelText: '#dbeafe', mute: 'rgba(255,255,255,0.85)' },
  { v: 500_000, lv: 6, name: 'MASTER',     ko: '마스터',  vsYesterday: 32,
    bg: 'linear-gradient(135deg,#3b0764 0%,#7c3aed 35%,#a78bfa 70%,#ede9fe 100%)',
    accent: '#ede9fe', shadow: '0 12px 40px rgba(124,58,237,0.50)',
    labelText: '#ede9fe', mute: 'rgba(255,255,255,0.88)' },
  { v: 600_000, lv: 7, name: 'CHALLENGER', ko: '챌린저',   vsYesterday: 48,
    bg: 'linear-gradient(135deg,#0f172a 0%,#475569 18%,#fbbf24 45%,#fde68a 60%,#f59e0b 78%,#dc2626 100%)',
    accent: '#fde68a', shadow: '0 14px 48px rgba(220,38,38,0.45), 0 0 60px rgba(251,191,36,0.30)',
    labelText: '#fde68a', mute: 'rgba(255,255,255,0.92)' },
];

// 랭크 엠블눜 — 각 티어마다 고유한 기하 도형 (SVG inline)
const TierEmblem = ({ lv, size = 22 }) => {
  const c = 'currentColor';
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: c, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' };
  if (lv === 1) return <svg {...common}><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z"/></svg>;
  if (lv === 2) return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="2" transform="rotate(45 12 12)"/></svg>;
  if (lv === 3) return <svg {...common}><polygon points="12,3 21,9 17.5,20 6.5,20 3,9"/></svg>;
  if (lv === 4) return <svg {...common}><polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5"/></svg>;
  if (lv === 5) return <svg {...common}><polygon points="12,2 22,12 12,22 2,12"/><path d="M7 12l5-5 5 5-5 5z" fill={c} opacity="0.5"/></svg>;
  if (lv === 6) return <svg {...common}><path d="M12 2l2.5 7.5H22l-6.2 4.5 2.4 7.5L12 17l-6.2 4.5 2.4-7.5L2 9.5h7.5z"/></svg>;
  return <svg {...common}><path d="M3 18l2-10 5 5 2-9 2 9 5-5 2 10z" fill={c} fillOpacity="0.25"/><path d="M3 18l2-10 5 5 2-9 2 9 5-5 2 10z"/></svg>;
};

const TodaySalesHero = ({ tierIndex, onTierChange }) => {
  const tier = SALES_TIERS[tierIndex];
  const orderCount = 12 + tier.lv * 8;
  const next = SALES_TIERS[tierIndex + 1];
  const prev = SALES_TIERS[tierIndex - 1];
  const trackPct = next
    ? ((tier.v - (prev?.v ?? 0)) / (next.v - (prev?.v ?? 0))) * 100
    : 100;

  return (
    <div className="flex flex-col gap-3">
      {/* 티어 세그먼트 (컴트롤) */}
      <div className="bg-white rounded-xl border border-[#eee] p-1 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SALES_TIERS.map((s, i) => {
          const on = i === tierIndex;
          return (
            <button
              key={s.v}
              onClick={() => onTierChange(i)}
              className={`shrink-0 px-2 @md:px-2.5 py-1.5 rounded-lg text-[10px] @md:text-[11px] font-black tracking-wider transition whitespace-nowrap flex items-center gap-1.5 ${
                on ? 'text-white' : 'text-[#666] hover:bg-[#f5f6f7]'
              }`}
              style={on ? { background: s.bg, boxShadow: '0 2px 6px rgba(0,0,0,0.18)' } : undefined}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: on ? '#fff' : s.bg, opacity: on ? 1 : 0.85 }}
              />
              {s.name}
            </button>
          );
        })}
      </div>

      {/* Hero card */}
      <div
        className="relative rounded-2xl p-5 @md:p-6 overflow-hidden text-white transition-all duration-500"
        style={{ background: tier.bg, boxShadow: tier.shadow }}
      >
        {/* subtle gloss */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/12 to-transparent pointer-events-none" />
        <div className="absolute -bottom-8 -right-8 w-40 h-40 rounded-full bg-white/8 pointer-events-none" />

        <div className="relative">
          <div className="flex items-center justify-between mb-3 @md:mb-4">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/18 backdrop-blur-sm border border-white/25">
              <span style={{ color: tier.accent }}><TierEmblem lv={tier.lv} size={14} /></span>
              <span className="text-[11px] font-black tracking-[0.12em]" style={{ color: tier.accent }}>
                {tier.name} · LV {tier.lv}
              </span>
            </div>
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{
                background: tier.vsYesterday >= 0 ? 'rgba(255,255,255,0.22)' : 'rgba(244,63,94,0.30)',
                color: tier.vsYesterday >= 0 ? '#fff' : '#fff',
              }}
            >
              {tier.vsYesterday >= 0 ? '↑' : '↓'} {Math.abs(tier.vsYesterday)}% vs 어제
            </span>
          </div>

          <p className="m-0 text-[11px] font-bold tracking-[0.12em] uppercase mb-1.5" style={{ color: tier.labelText }}>
            오늘 매출
          </p>
          <div className="text-[clamp(36px,9.5cqw,68px)] font-black leading-none tabular-nums">
            ₩{fmt(tier.v)}
          </div>

          <div className="mt-4 @md:mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 items-center">
            <div>
              <div className="text-[10px] @md:text-[11px] font-bold tracking-wider uppercase mb-0.5" style={{ color: tier.labelText }}>주문 수</div>
              <div className="text-base @md:text-lg @4xl:text-xl font-black tabular-nums">{orderCount}건</div>
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[10px] @md:text-[11px] font-bold tracking-wider uppercase" style={{ color: tier.labelText }}>
                  {next ? `${next.name}까지` : '최고 랭크'}
                </span>
                <span className="text-[11px] @md:text-xs font-bold tabular-nums" style={{ color: tier.mute }}>
                  {next ? `₩${fmt(next.v - tier.v)} 남음` : '도달✨'}
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-white/18">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, trackPct)}%`,
                    background: tier.lv === 7 ? 'linear-gradient(90deg,#fde68a,#f59e0b)' : '#fff',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ScreenStats = () => {
  const [tierIndex, setTierIndex] = React.useState(4); // 초기: lv5 (₩400K)
  const breakdown = [
    { ...MENU[0], sold: 28, rev: 238000, share: 96 },
    { ...MENU[2], sold: 22, rev: 198000, share: 78 },
    { ...MENU[3], sold: 14, rev: 126000, share: 48 },
    { ...MENU[1], sold: 12, rev: 102000, share: 41 },
    { ...MENU[4], sold:  8, rev:   8000, share: 28 },
  ];
  const hours = [3, 6, 9, 12, 18, 24, 33, 30, 26, 22, 18, 12, 8, 4];
  const peak = Math.max(...hours);
  const week = [62, 48, 75, 53, 81, 96, 68];

  return (
    <div className="@container min-h-full bg-[#f5f6f7] text-[#161616]">
      <TopBar active="STA" />
      <main className="p-3 @md:p-5 mx-auto max-w-[1400px]">
        <div className="bg-white rounded-2xl p-4 @md:p-5">
          <div className="flex items-center justify-between mb-4 @md:mb-5">
            <h2 className="m-0 text-xl @md:text-2xl font-extrabold">매출</h2>
            <div className="flex gap-1 bg-[#f5f6f7] p-1 rounded-xl">
              {['오늘', '이번 주', '이번 달'].map((t, i) => (
                <button key={t} className={`px-3 py-1.5 text-xs @md:text-sm font-semibold rounded-lg ${
                  i === 0 ? 'bg-[#084431] text-white' : 'text-[#888] hover:text-[#333]'
                }`}>{t}</button>
              ))}
            </div>
          </div>

          {/* Today summary — 티어 히어로 × 메뉴메달/목표 */}
          <div className="grid grid-cols-1 @2xl:grid-cols-[1.4fr_1fr] gap-3 mb-3 @md:mb-4">
            <TodaySalesHero tierIndex={tierIndex} onTierChange={setTierIndex} />

            <div className="bg-[#f9f9f9] rounded-2xl p-4 @md:p-5 flex flex-col justify-between">
              <div>
                <p className="m-0 text-[11px] font-bold tracking-wider uppercase text-[#888] mb-1">오늘 목표</p>
                <div className="text-2xl @md:text-3xl font-black text-[#084431] tabular-nums">
                  {Math.round((SALES_TIERS[tierIndex].v / 500_000) * 100)}% <span className="text-sm font-bold text-[#888]">{SALES_TIERS[tierIndex].v >= 500_000 ? '초과 달성' : '진행중'}</span>
                </div>
                <p className="m-0 text-xs text-[#888] mt-1">₩500,000</p>
              </div>
              <div className="mt-3 @md:mt-4">
                <div className="h-2.5 bg-[#e5e5e5] rounded-full relative overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                       style={{ width: `${Math.min(100, (SALES_TIERS[tierIndex].v / 500_000) * 100)}%` }} />
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] text-[#999] font-bold">
                  <span>0</span><span>목표</span><span>+₩100K</span>
                </div>
              </div>
            </div>
          </div>

          {/* Menu breakdown */}
          <div className="bg-[#f9f9f9] rounded-2xl p-4 @md:p-5 mb-3 @md:mb-4">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="m-0 text-base @md:text-lg font-bold">메뉴별 판매</h3>
              <span className="text-xs text-[#888]">5종 · 84개</span>
            </div>
            {breakdown.map((m, i) => (
              <div key={m.id} className={`grid grid-cols-[20px_1fr_60px_80px] items-center gap-3 py-2.5 ${i !== breakdown.length - 1 ? 'border-b border-[#eee]' : ''}`}>
                <span className="text-xs font-black text-[#888] tabular-nums">{i + 1}</span>
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                    <span className="text-sm @md:text-base font-bold">{m.name}</span>
                  </div>
                  <div className="h-1.5 bg-[#e5e5e5] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${m.share}%`, backgroundColor: m.color }} />
                  </div>
                </div>
                <span className="text-sm font-black tabular-nums text-right">{m.sold}개</span>
                <span className="text-xs text-[#666] tabular-nums text-right font-medium">{fmt(m.rev)}원</span>
              </div>
            ))}
          </div>

          {/* Week + Hour, side by side on tablet+ */}
          <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-3 @md:gap-4">
            <div className="bg-[#f9f9f9] rounded-2xl p-4 @md:p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="m-0 text-base @md:text-lg font-bold">주간 매출</h3>
                <span className="text-xs font-bold text-[#084431] tabular-nums">₩2,847,000</span>
              </div>
              <div className="flex items-end gap-1.5 @md:gap-2 h-32 @md:h-40">
                {week.map((v, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                    <div className={`w-full rounded-t-md ${i === 5 ? 'bg-rose-500' : 'bg-[#084431]'}`} style={{ height: `${(v / 100) * 100}%` }} />
                    <span className={`text-[10px] font-bold ${i === 5 ? 'text-rose-500' : 'text-[#888]'}`}>
                      {['월','화','수','목','금','토','일'][i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#f9f9f9] rounded-2xl p-4 @md:p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="m-0 text-base @md:text-lg font-bold">시간대별</h3>
                <span className="text-xs font-bold text-rose-500">피크 14시</span>
              </div>
              <div className="flex items-end gap-1 h-32 @md:h-40">
                {hours.map((v, i) => (
                  <div key={i}
                       className={`flex-1 rounded-sm ${i === 6 ? 'bg-rose-500' : v > 20 ? 'bg-[#084431]' : v > 10 ? 'bg-[#0a5239]' : 'bg-[#b8deca]'}`}
                       style={{ height: `${(v / peak) * 100}%` }} />
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-[#999] font-bold">
                <span>10</span><span>13</span><span>16</span><span>19</span><span>22</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// SCREEN · SETTINGS
// ────────────────────────────────────────────────────────────
const PALETTE = [
  { name: '빨강', value: '#E53935' },
  { name: '주황', value: '#FB8C00' },
  { name: '노랑', value: '#FDD835' },
  { name: '초록', value: '#7CB342' },
  { name: '하늘', value: '#00ACC1' },
  { name: '파랑', value: '#1E88E5' },
  { name: '남색', value: '#3949AB' },
  { name: '보라', value: '#8E24AA' },
];

const ScreenSettings = () => (
  <div className="@container min-h-full bg-[#f5f6f7] text-[#161616]">
    <TopBar active="SET" />
    <main className="p-3 @md:p-5 mx-auto max-w-[1100px]">
      <div className="bg-white rounded-2xl p-4 @md:p-5">
        <div className="flex items-center justify-between mb-4 @md:mb-5">
          <h2 className="m-0 text-xl @md:text-2xl font-extrabold">설정</h2>
          <div className="flex gap-1.5 bg-[#f5f6f7] p-1 rounded-xl">
            <button className="px-3 py-1.5 text-xs @md:text-sm font-semibold rounded-lg bg-white text-[#161616] shadow-sm">메뉴 관리</button>
            <button className="px-3 py-1.5 text-xs @md:text-sm font-semibold rounded-lg bg-transparent text-[#888]">개발자 도구</button>
          </div>
        </div>

        {/* Stack on phone, side-by-side on tablet+ */}
        <div className="grid gap-4 @md:gap-5 @2xl:grid-cols-[360px_1fr]">
          {/* Form */}
          <div className="bg-[#f9f9f9] rounded-xl p-4">
            <h3 className="mt-0 mb-3 text-base @md:text-lg font-bold">새 메뉴 추가</h3>
            <div className="mb-3">
              <label className="block mb-1.5 font-semibold text-sm text-[#333]">메뉴 이름</label>
              <input
                defaultValue="레몬크림산도"
                className="w-full px-3 py-2 border border-[#ddd] rounded-md text-sm focus:outline-none focus:border-[#084431] focus:ring-2 focus:ring-[#084431]/10"
              />
            </div>
            <div className="grid grid-cols-1 @md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block mb-1.5 font-semibold text-sm text-[#333]">가격 (원)</label>
                <input
                  type="number" defaultValue="8900"
                  className="w-full px-3 py-2 border border-[#ddd] rounded-md text-sm focus:outline-none focus:border-[#084431] focus:ring-2 focus:ring-[#084431]/10 tabular-nums"
                />
              </div>
              <div>
                <label className="block mb-1.5 font-semibold text-sm text-[#333]">색상</label>
                <div className="grid grid-cols-8 gap-1.5">
                  {PALETTE.map((c, i) => (
                    <button key={c.value}
                      className={`w-full aspect-square rounded-full cursor-pointer transition-transform hover:-translate-y-0.5 ${i === 4 ? 'border-[3px] border-[#111] ring-2 ring-black/15' : 'border-2 border-[#ddd]'}`}
                      style={{ backgroundColor: c.value }}
                      aria-label={c.name}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button className="flex-1 px-4 py-2.5 rounded-md border-none font-bold cursor-pointer text-sm bg-[#084431] text-white hover:bg-[#063424] transition">
                메뉴 추가
              </button>
            </div>
          </div>

          {/* List */}
          <div>
            <h3 className="mb-3 text-base @md:text-lg font-bold">메뉴 목록 <span className="text-sm font-normal text-[#999]">· {MENU.length}종</span></h3>
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {MENU.map((m, i) => (
                <li key={m.id} className="flex justify-between items-center p-3 bg-white rounded-lg shadow-[0_2px_4px_rgba(0,0,0,0.04)] border border-[#f0f0f0]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-[#f1f3f5] text-[#666] inline-flex items-center justify-center text-base leading-none shrink-0 cursor-grab select-none">⠿</div>
                    <div className="w-5 h-5 rounded-full shrink-0 border-2 border-black/10" style={{ backgroundColor: m.color }} />
                    <div className="min-w-0">
                      <h3 className="m-0 text-sm font-semibold truncate">{m.name}</h3>
                      <p className="m-0 mt-0.5 text-xs text-[#666] tabular-nums">₩{fmt(m.price)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button className="px-3 py-1.5 border-none rounded-md text-xs font-semibold cursor-pointer bg-[#3498db] text-white hover:bg-[#2980b9]">수정</button>
                    <button className="px-3 py-1.5 border-none rounded-md text-xs font-semibold cursor-pointer bg-[#ff6b6b] text-white hover:bg-[#ff5252]">삭제</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  </div>
);

// ────────────────────────────────────────────────────────────
// SCREEN · MEMO (sticky-note grid)
// ────────────────────────────────────────────────────────────
const MEMOS = [
  { id: 1, title: '오픈 체크리스트', content: '1. 냉장고 온도 확인\n2. 카드 단말기 전원\n3. POS 로그인\n4. 시그니처 음료 준비', color: '#fff9c4', date: '2026.05.18' },
  { id: 2, title: '딸기산도 레시피', content: '식빵 2장 · 휘핑크림 80g · 딸기 4쪽\n크림 짤주머니 #6 / 12mm 두께', color: '#fce4ec', date: '2026.05.17' },
  { id: 3, title: null, content: '내일 우유 5L 추가 발주 잊지 말기. 보냉백 재고 30개 남음.', color: '#e3f2fd', date: '2026.05.18' },
  { id: 4, title: '근무자 안내', content: '나경 — 10:00~16:00\n지민 — 14:00~22:00\n오프닝 청소는 나경, 마감은 지민', color: '#e8f5e9', date: '2026.05.18' },
  { id: 5, title: '단골 손님 메모', content: '키 큰 안경 손님 — 메론산도, 보냉백 없이\n부녀 손님 — 매주 토요일 후르츠산도 3개', color: '#f3e5f5', date: '2026.05.15' },
  { id: 6, title: '이벤트 일정', content: '5/20 (수) 인스타 라이브 16:00\n5/24 (일) 팝업 마지막날 — 한정판 메론산도 50개', color: '#fff9c4', date: '2026.05.18' },
];

const ScreenMemo = () => (
  <div className="@container min-h-full bg-[#f5f6f7] text-[#161616]">
    <TopBar active="MEM" />
    <main className="p-3 @md:p-5 mx-auto max-w-[1200px]">
      <div className="flex justify-between items-center mb-4 @md:mb-5">
        <h2 className="m-0 text-xl @md:text-2xl font-extrabold">메모</h2>
        <button className="px-3 @md:px-4 py-2 rounded-lg border-none bg-[#084431] text-white text-sm font-bold cursor-pointer hover:bg-[#063424] transition">
          + 새 메모
        </button>
      </div>

      {/* 1 col phone, 2 col small tablet, 3 col tablet, 4 col laptop */}
      <div className="grid grid-cols-1 @sm:grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-4 gap-3 @md:gap-4">
        {MEMOS.map((m) => (
          <div key={m.id} className="rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)] flex flex-col border border-black/5 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.1)] transition-all"
               style={{ backgroundColor: m.color, minHeight: 160 }}>
            {m.title && <h3 className="m-0 mb-2 text-base font-bold text-[#111]">{m.title}</h3>}
            <p className="m-0 mb-4 text-sm leading-[1.5] text-[#333] whitespace-pre-wrap grow">{m.content}</p>
            <div className="flex justify-between items-end mt-auto pt-3 border-t border-black/5">
              <span className="text-xs text-[#666] tabular-nums">{m.date}</span>
              <div className="flex gap-1.5">
                <button className="px-3 py-1.5 border-none rounded-md text-xs font-semibold cursor-pointer bg-[#3498db] text-white hover:bg-[#2980b9]">수정</button>
                <button className="px-3 py-1.5 border-none rounded-md text-xs font-semibold cursor-pointer bg-[#ff6b6b] text-white hover:bg-[#ff5252]">삭제</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  </div>
);

Object.assign(window, {
  ScreenPOS, ScreenDisplay, ScreenOrders, ScreenStats, ScreenSettings, ScreenMemo,
  MENU, fmt, hexA,
});
