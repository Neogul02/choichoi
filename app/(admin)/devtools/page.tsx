'use client';

import NavBar from '@/components/NavBar';
import { useCallback, useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { fetchMenuItems, getAllMenu } from '@/app/actions/menu';
import { fetchTodaysSales, fetchTodaysOrders, fetchTodaysOrdersWithItems } from '@/app/actions/orders';
import { fetchMonthlySalesCalendar, fetchMenuSalesBreakdown, fetchDailySalesByPeriod } from '@/app/actions/stats';
import { fetchPopupEvents } from '@/app/actions/schedule';

interface ApiLog {
  id: number;
  label: string;
  status: 'pending' | 'ok' | 'err';
  ms?: number;
  data?: unknown;
  err?: string;
  ts: Date;
}

let _logId = 0;

const now = () => new Date();
const todayISO = () => {
  const d = now();
  const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: `${s}T00:00:00+09:00`, end: `${s}T23:59:59+09:00` };
};

const API_ACTIONS: { label: string; fn: () => Promise<unknown> }[] = [
  { label: 'fetchMenuItems', fn: fetchMenuItems },
  { label: 'getAllMenu', fn: getAllMenu },
  { label: 'fetchTodaysSales', fn: fetchTodaysSales },
  { label: 'fetchTodaysOrders', fn: fetchTodaysOrders },
  { label: 'fetchTodaysOrdersWithItems(5)', fn: () => fetchTodaysOrdersWithItems(5) },
  {
    label: 'fetchMonthlySalesCalendar (이번 달)',
    fn: () => fetchMonthlySalesCalendar(now().getFullYear(), now().getMonth() + 1),
  },
  {
    label: 'fetchMenuSalesBreakdown (오늘)',
    fn: () => { const { start, end } = todayISO(); return fetchMenuSalesBreakdown(start, end); },
  },
  {
    label: 'fetchDailySalesByPeriod (이번 달)',
    fn: () => {
      const d = now();
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const end = todayISO().end;
      return fetchDailySalesByPeriod(`${m}-01T00:00:00+09:00`, end);
    },
  },
  { label: 'fetchPopupEvents', fn: fetchPopupEvents },
];

type ColDef = {
  name: string;
  type: 'int' | 'float' | 'text' | 'bool' | 'timestamp' | 'date' | 'uuid' | 'enum';
  note?: string;
  pk?: boolean;
  fk?: string;
  nullable?: boolean;
};
type TableDef = { name: string; desc: string; columns: ColDef[] };
type GroupDef = { group: string; color: string; tables: TableDef[] };

const DB_SCHEMA: GroupDef[] = [
  {
    group: 'POS 핵심',
    color: 'blue',
    tables: [
      {
        name: 'menu_items',
        desc: '판매 메뉴',
        columns: [
          { name: 'id', type: 'int', pk: true },
          { name: 'name', type: 'text' },
          { name: 'price', type: 'int' },
          { name: 'color', type: 'text' },
          { name: 'stock', type: 'int' },
          { name: 'is_active', type: 'bool' },
          { name: 'display_order', type: 'int' },
          { name: 'created_at', type: 'timestamp' },
          { name: 'updated_at', type: 'timestamp' },
        ],
      },
      {
        name: 'orders',
        desc: '주문',
        columns: [
          { name: 'id', type: 'int', pk: true },
          { name: 'total_price', type: 'int' },
          { name: 'payment_method', type: 'text' },
          { name: 'payment_status', type: 'text' },
          { name: 'cashier_name', type: 'text', nullable: true },
          { name: 'is_prepared', type: 'bool' },
          { name: 'created_at', type: 'timestamp' },
        ],
      },
      {
        name: 'order_items',
        desc: '주문 항목',
        columns: [
          { name: 'id', type: 'int', pk: true },
          { name: 'order_id', type: 'int', fk: 'orders' },
          { name: 'menu_item_id', type: 'int', fk: 'menu_items' },
          { name: 'quantity', type: 'int' },
          { name: 'unit_price', type: 'int' },
          { name: 'subtotal', type: 'int' },
        ],
      },
      {
        name: 'manual_sales',
        desc: '수동 매출 입력',
        columns: [
          { name: 'id', type: 'int', pk: true },
          { name: 'sale_date', type: 'date' },
          { name: 'total_revenue', type: 'int' },
          { name: 'total_orders', type: 'int' },
          { name: 'note', type: 'text', nullable: true },
        ],
      },
    ],
  },
  {
    group: '스케줄',
    color: 'purple',
    tables: [
      {
        name: 'popup_events',
        desc: '팝업 행사',
        columns: [
          { name: 'id', type: 'int', pk: true },
          { name: 'name', type: 'text' },
          { name: 'start_date', type: 'date' },
          { name: 'end_date', type: 'date' },
          { name: 'is_active', type: 'bool' },
          { name: 'created_at', type: 'timestamp' },
        ],
      },
      {
        name: 'workers',
        desc: '직원',
        columns: [
          { name: 'id', type: 'int', pk: true },
          { name: 'event_id', type: 'int', fk: 'popup_events' },
          { name: 'name', type: 'text' },
          { name: 'color', type: 'text' },
          { name: 'phone', type: 'text', nullable: true },
          { name: 'bank_name', type: 'text', nullable: true },
          { name: 'bank_account', type: 'text', nullable: true },
          { name: 'hourly_rate', type: 'int' },
          { name: 'payment_done', type: 'bool' },
          { name: 'worker_role', type: 'text', nullable: true },
          { name: 'created_at', type: 'timestamp' },
          { name: 'updated_at', type: 'timestamp' },
        ],
      },
      {
        name: 'schedule_slots',
        desc: '근무 슬롯',
        columns: [
          { name: 'id', type: 'int', pk: true },
          { name: 'event_id', type: 'int', fk: 'popup_events' },
          { name: 'schedule_date', type: 'date' },
          { name: 'role', type: 'text' },
          { name: 'person_name', type: 'text' },
          { name: 'work_time', type: 'text', nullable: true },
          { name: 'break_time', type: 'bool' },
          { name: 'worker_id', type: 'int', fk: 'workers', nullable: true },
          { name: 'created_at', type: 'timestamp' },
          { name: 'updated_at', type: 'timestamp' },
        ],
      },
    ],
  },
  {
    group: '재고',
    color: 'green',
    tables: [
      {
        name: 'ingredients',
        desc: '재료',
        columns: [
          { name: 'id', type: 'uuid', pk: true },
          { name: 'name', type: 'text' },
          { name: 'category', type: 'enum', note: '빵|크림|과일|패키지' },
          { name: 'color', type: 'text' },
          { name: 'unit_type', type: 'enum', note: 'count|weight' },
          { name: 'base_unit', type: 'text' },
          { name: 'container_unit', type: 'text' },
          { name: 'container_size', type: 'int' },
          { name: 'sealed_count', type: 'int' },
          { name: 'opened_remaining', type: 'float' },
          { name: 'reorder_at_containers', type: 'int' },
          { name: 'vendor', type: 'text', nullable: true },
          { name: 'lead_days', type: 'int', nullable: true },
          { name: 'unit_price', type: 'int', nullable: true },
          { name: 'sort_order', type: 'int' },
          { name: 'created_at', type: 'timestamp' },
          { name: 'updated_at', type: 'timestamp' },
        ],
      },
      {
        name: 'recipes',
        desc: '레시피 (복합 PK)',
        columns: [
          { name: 'menu_id', type: 'int', pk: true, fk: 'menu_items' },
          { name: 'ingredient_id', type: 'uuid', pk: true, fk: 'ingredients' },
          { name: 'qty_per_unit', type: 'float' },
        ],
      },
      {
        name: 'restock_events',
        desc: '입고 이벤트',
        columns: [
          { name: 'id', type: 'int', pk: true },
          { name: 'ingredient_id', type: 'uuid', fk: 'ingredients' },
          { name: 'sealed_delta', type: 'int' },
          { name: 'opened_delta', type: 'float' },
          { name: 'note', type: 'text', nullable: true },
          { name: 'created_by', type: 'text', nullable: true },
          { name: 'created_at', type: 'timestamp' },
        ],
      },
      {
        name: 'deduction_events',
        desc: '재고 차감',
        columns: [
          { name: 'id', type: 'int', pk: true },
          { name: 'order_id', type: 'int', fk: 'orders', nullable: true },
          { name: 'ingredient_id', type: 'uuid', fk: 'ingredients' },
          { name: 'qty_deducted', type: 'float' },
          { name: 'created_at', type: 'timestamp' },
        ],
      },
    ],
  },
  {
    group: '기타',
    color: 'amber',
    tables: [
      {
        name: 'memos',
        desc: '메모',
        columns: [
          { name: 'id', type: 'int', pk: true },
          { name: 'title', type: 'text', nullable: true },
          { name: 'content', type: 'text' },
          { name: 'color', type: 'text' },
          { name: 'created_at', type: 'timestamp' },
          { name: 'updated_at', type: 'timestamp' },
        ],
      },
    ],
  },
];

const CONFETTI_EFFECTS = [
  {
    label: '기본',
    fn: () => confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } }),
  },
  {
    label: '무지개',
    fn: () =>
      confetti({
        particleCount: 180,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#ff0000', '#ff7700', '#ffff00', '#00cc44', '#0066ff', '#8800cc'],
      }),
  },
  {
    label: '눈',
    fn: () =>
      confetti({
        particleCount: 250,
        spread: 360,
        startVelocity: 12,
        gravity: 0.25,
        ticks: 500,
        origin: { y: 0.1 },
        shapes: ['circle'],
        colors: ['#ffffff', '#ddeeff', '#aaccff'],
        scalar: 1.3,
      }),
  },
  {
    label: '좌우 대포',
    fn: () => {
      confetti({ angle: 60, spread: 60, particleCount: 120, origin: { x: 0, y: 0.6 } });
      setTimeout(() => confetti({ angle: 120, spread: 60, particleCount: 120, origin: { x: 1, y: 0.6 } }), 150);
    },
  },
  {
    label: '연속 폭발',
    fn: () => {
      let count = 0;
      const fire = () => {
        confetti({ particleCount: 60, spread: 80, origin: { x: Math.random(), y: 0.3 + Math.random() * 0.4 } });
        if (++count < 6) setTimeout(fire, 280);
      };
      fire();
    },
  },
  {
    label: '황금 비',
    fn: () =>
      confetti({
        particleCount: 200,
        spread: 60,
        startVelocity: 30,
        origin: { y: 0 },
        colors: ['#FFD700', '#FFA500', '#FFE066', '#FFFACD'],
        shapes: ['star'],
        scalar: 1.5,
      }),
  },
];

export default function DevToolsPage() {
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dbStats, setDbStats] = useState<{
    menuActive: number;
    menuTotal: number;
    todayOrders: number;
    todayRevenue: number;
    orderDuplicateCheck: string;
  } | null>(null);
  const [dbLoading, setDbLoading] = useState(false);

  const loadDbStats = useCallback(async () => {
    setDbLoading(true);
    const [menuRes, allMenuRes, salesRes, ordersRes] = await Promise.all([
      fetchMenuItems(),
      getAllMenu(),
      fetchTodaysSales(),
      fetchTodaysOrdersWithItems(),
    ]);

    const orders = ordersRes.success && ordersRes.data ? ordersRes.data : [];
    const ids = orders.map((o) => o.id);
    const uniqueIds = new Set(ids);
    const dupCheck =
      ids.length === uniqueIds.size
        ? `중복 없음 (${ids.length}건)`
        : `중복 감지! ${ids.length}건 중 고유 ID ${uniqueIds.size}개`;

    setDbStats({
      menuActive: menuRes.success && menuRes.data ? menuRes.data.length : 0,
      menuTotal: allMenuRes.success && allMenuRes.data ? allMenuRes.data.length : 0,
      todayOrders: salesRes.success && salesRes.data ? salesRes.data.totalOrders : 0,
      todayRevenue: salesRes.success && salesRes.data ? salesRes.data.totalRevenue : 0,
      orderDuplicateCheck: dupCheck,
    });
    setDbLoading(false);
  }, []);

  useEffect(() => {
    loadDbStats();
  }, [loadDbStats]);

  const runApi = async (label: string, fn: () => Promise<unknown>) => {
    const id = ++_logId;
    setLogs((p) => [{ id, label, status: 'pending', ts: new Date() }, ...p]);
    const t0 = performance.now();
    try {
      const data = await fn();
      const ms = Math.round(performance.now() - t0);
      setLogs((p) => p.map((l) => (l.id === id ? { ...l, status: 'ok', ms, data } : l)));
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      setLogs((p) => p.map((l) => (l.id === id ? { ...l, status: 'err', ms, err: String(e) } : l)));
    }
  };

  const toggleExpand = (id: number) =>
    setExpanded((p) => {
      const next = new Set(p);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        <div className="max-w-[800px] mx-auto space-y-4">
          <h2 className="m-0 text-2xl font-extrabold">개발자 도구</h2>

          {/* DB 상태 */}
          <section className="bg-canvas rounded-xl p-4 md:p-5 shadow-level-1 border border-hairline">
            <div className="flex items-center justify-between mb-4">
              <h3 className="m-0 text-lg font-bold">DB 상태</h3>
              <button
                className="px-3 py-1.5 text-xs font-semibold bg-[#f5f6f7] text-ink-muted rounded-lg border-none cursor-pointer hover:bg-canvas-soft disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                onClick={loadDbStats}
                disabled={dbLoading}
              >
                {dbLoading ? '로딩 중...' : '새로고침'}
              </button>
            </div>

            {dbStats ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <StatCard label="활성 메뉴" value={`${dbStats.menuActive}개`} sub={`전체 ${dbStats.menuTotal}개`} color="blue" />
                  <StatCard label="비활성 메뉴" value={`${dbStats.menuTotal - dbStats.menuActive}개`} color="gray" />
                  <StatCard label="오늘 주문" value={`${dbStats.todayOrders}건`} color="green" />
                  <StatCard label="오늘 매출" value={`₩${dbStats.todayRevenue.toLocaleString('ko-KR')}`} color="rose" />
                </div>
                <div
                  className={`rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2 ${
                    dbStats.orderDuplicateCheck.startsWith('중복 없음')
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  <span>{dbStats.orderDuplicateCheck.startsWith('중복 없음') ? '✓' : '!'}</span>
                  <span>오늘 주문 ID 중복 검사: {dbStats.orderDuplicateCheck}</span>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-sm text-ink-faint">DB 데이터를 불러오는 중...</div>
            )}
          </section>

          {/* DB 스키마 */}
          <section className="bg-canvas rounded-xl p-4 md:p-5 shadow-level-1 border border-hairline">
            <h3 className="m-0 mb-4 text-lg font-bold">DB 스키마</h3>
            <div className="space-y-5">
              {DB_SCHEMA.map((group) => (
                <div key={group.group}>
                  <GroupBadge label={group.group} color={group.color} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    {group.tables.map((table) => (
                      <SchemaTable key={table.name} table={table} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 폭죽 테스트 */}
          <section className="bg-canvas rounded-xl p-4 md:p-5 shadow-level-1 border border-hairline">
            <h3 className="m-0 mb-4 text-lg font-bold">폭죽 테스트</h3>
            <div className="flex flex-wrap gap-2">
              {CONFETTI_EFFECTS.map((effect) => (
                <button
                  key={effect.label}
                  className="px-4 py-2 text-sm font-semibold bg-[#f5f6f7] text-ink-secondary rounded-lg border-none cursor-pointer hover:bg-primary-700 hover:text-white transition-all duration-200 active:scale-95"
                  onClick={effect.fn}
                >
                  {effect.label}
                </button>
              ))}
            </div>
          </section>

          {/* API 테스트 */}
          <section className="bg-canvas rounded-xl p-4 md:p-5 shadow-level-1 border border-hairline">
            <h3 className="m-0 mb-4 text-lg font-bold">API 요청 테스트</h3>

            <div className="flex flex-wrap gap-2 mb-5 pb-4 border-b border-hairline">
              {API_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  className="px-3 py-1.5 text-[11px] font-semibold font-mono bg-[#f0f4ff] text-[#3949AB] rounded-lg border border-[#c5cae9] cursor-pointer hover:bg-[#3949AB] hover:text-white hover:border-[#3949AB] transition-all duration-150"
                  onClick={() => runApi(action.label, action.fn)}
                >
                  {action.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-ink-faint uppercase tracking-widest">요청 로그</span>
              {logs.length > 0 && (
                <button
                  className="text-xs text-ink-faint hover:text-ink-muted border-none bg-transparent cursor-pointer transition-colors"
                  onClick={() => { setLogs([]); setExpanded(new Set()); }}
                >
                  전체 삭제
                </button>
              )}
            </div>

            {logs.length === 0 ? (
              <div className="py-10 text-center text-sm text-ink-faint border border-dashed border-hairline rounded-xl">
                위 버튼을 클릭하면 요청 결과가 여기에 표시됩니다
              </div>
            ) : (
              <ul className="m-0 p-0 list-none space-y-1.5">
                {logs.map((log) => (
                  <li key={log.id} className="border border-[#eeeeee] rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-canvas-soft border-none cursor-pointer text-left hover:bg-[#f3f4f6] transition-colors"
                      onClick={() => toggleExpand(log.id)}
                    >
                      <StatusDot status={log.status} />
                      <span className="font-mono text-xs flex-1 text-ink-secondary truncate">{log.label}</span>
                      {log.ms !== undefined && (
                        <span
                          className={`text-[11px] shrink-0 font-semibold ${
                            log.ms < 200 ? 'text-green-600' : log.ms < 800 ? 'text-yellow-600' : 'text-red-600'
                          }`}
                        >
                          {log.ms}ms
                        </span>
                      )}
                      <span className="text-[11px] text-ink-faint shrink-0 tabular-nums">
                        {log.ts.toLocaleTimeString('ko-KR')}
                      </span>
                      <span className="text-[10px] text-ink-faint">{expanded.has(log.id) ? '▲' : '▼'}</span>
                    </button>
                    {expanded.has(log.id) && (
                      <pre className="m-0 p-3 text-[11px] leading-relaxed bg-[#1e1e2e] text-[#cdd6f4] overflow-x-auto max-h-[360px] overflow-y-auto">
                        {log.status === 'err' ? log.err : JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 환경 정보 */}
          <section className="bg-canvas rounded-xl p-4 md:p-5 shadow-level-1 border border-hairline">
            <h3 className="m-0 mb-3 text-lg font-bold">환경 정보</h3>
            <ul className="m-0 p-0 list-none space-y-2">
              <EnvRow label="NEXT_PUBLIC_SUPABASE_URL" value={process.env.NEXT_PUBLIC_SUPABASE_URL} />
              <EnvRow label="NODE_ENV" value={process.env.NODE_ENV} />
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: 'blue' | 'gray' | 'green' | 'rose';
}) {
  const styles = {
    blue: 'bg-blue-50 text-blue-700',
    gray: 'bg-[#f5f6f7] text-ink-muted',
    green: 'bg-green-50 text-green-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <div className={`rounded-xl p-3 ${styles[color]}`}>
      <p className="m-0 text-[11px] opacity-60 mb-1 font-semibold">{label}</p>
      <p className="m-0 text-lg font-bold leading-tight">{value}</p>
      {sub && <p className="m-0 mt-0.5 text-[11px] opacity-50">{sub}</p>}
    </div>
  );
}

function StatusDot({ status }: { status: 'pending' | 'ok' | 'err' }) {
  if (status === 'pending')
    return <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />;
  if (status === 'ok')
    return <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />;
}

const GROUP_COLORS: Record<string, { badge: string; dot: string }> = {
  blue:   { badge: 'bg-blue-50 text-blue-700 border border-blue-200',     dot: 'bg-blue-400' },
  purple: { badge: 'bg-purple-50 text-purple-700 border border-purple-200', dot: 'bg-purple-400' },
  green:  { badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-400' },
  amber:  { badge: 'bg-amber-50 text-amber-700 border border-amber-200',   dot: 'bg-amber-400' },
};

const TYPE_STYLES: Record<ColDef['type'], string> = {
  int:       'bg-blue-100 text-blue-700',
  float:     'bg-cyan-100 text-cyan-700',
  text:      'bg-canvas-soft text-ink-muted',
  bool:      'bg-purple-100 text-purple-700',
  timestamp: 'bg-amber-100 text-amber-700',
  date:      'bg-teal-100 text-teal-700',
  uuid:      'bg-rose-100 text-rose-700',
  enum:      'bg-orange-100 text-orange-700',
};

function GroupBadge({ label, color }: { label: string; color: string }) {
  const s = GROUP_COLORS[color] ?? GROUP_COLORS.blue;
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${s.badge}`}>{label}</span>
    </div>
  );
}

function SchemaTable({ table }: { table: TableDef }) {
  return (
    <div className="border border-[#ececec] rounded-xl overflow-hidden">
      <div className="flex items-baseline gap-2 px-3 py-2 bg-canvas-soft border-b border-[#ececec]">
        <span className="font-mono text-[13px] font-bold text-ink">{table.name}</span>
        <span className="text-[11px] text-ink-faint">{table.desc}</span>
      </div>
      <div className="divide-y divide-[#f3f3f3]">
        {table.columns.map((col) => (
          <div key={col.name} className="flex items-center gap-2 px-3 py-1.5">
            <div className="flex items-center gap-1 shrink-0">
              {col.pk && (
                <span className="text-[10px] font-black text-amber-500" title="Primary Key">PK</span>
              )}
              {col.fk && (
                <span className="text-[10px] font-black text-indigo-400" title={`→ ${col.fk}`}>FK</span>
              )}
              {!col.pk && !col.fk && <span className="w-5" />}
            </div>
            <span className={`font-mono text-[12px] flex-1 ${col.nullable ? 'text-ink-muted' : 'text-ink font-medium'}`}>
              {col.name}{col.nullable && <span className="text-[10px] text-ink-faint ml-0.5">?</span>}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {col.fk && (
                <span className="text-[10px] text-indigo-400 font-mono hidden md:inline">→ {col.fk}</span>
              )}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${TYPE_STYLES[col.type]}`}>
                {col.note ? `enum` : col.type}
              </span>
              {col.note && (
                <span className="text-[10px] text-ink-faint hidden md:inline">({col.note})</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EnvRow({ label, value }: { label: string; value: string | undefined }) {
  const display = value
    ? value.length > 40
      ? value.slice(0, 20) + '...' + value.slice(-10)
      : value
    : '(미설정)';
  const ok = !!value;
  return (
    <li className="flex items-center gap-3 text-xs">
      <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-green-500' : 'bg-red-400'}`} />
      <span className="font-mono text-ink-muted shrink-0">{label}</span>
      <span className={`font-mono truncate ${ok ? 'text-ink-muted' : 'text-red-500 font-semibold'}`}>{display}</span>
    </li>
  );
}
