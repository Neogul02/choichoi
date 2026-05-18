'use client';

import NavBar from '@/components/NavBar';
import { useCallback, useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  fetchMenuItems,
  getAllMenu,
  fetchTodaysSales,
  fetchTodaysOrders,
  fetchTodaysOrdersWithItems,
  fetchMonthlySalesCalendar,
  fetchMenuSalesBreakdown,
  fetchDailySalesByPeriod,
  fetchPopupEvents,
} from '@/app/actions';

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
          <section className="bg-white rounded-2xl p-4 md:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="m-0 text-lg font-bold">DB 상태</h3>
              <button
                className="px-3 py-1.5 text-xs font-semibold bg-[#f5f6f7] text-[#555] rounded-lg border-none cursor-pointer hover:bg-[#eee] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              <div className="py-8 text-center text-sm text-[#bbb]">DB 데이터를 불러오는 중...</div>
            )}
          </section>

          {/* 폭죽 테스트 */}
          <section className="bg-white rounded-2xl p-4 md:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <h3 className="m-0 mb-4 text-lg font-bold">폭죽 테스트</h3>
            <div className="flex flex-wrap gap-2">
              {CONFETTI_EFFECTS.map((effect) => (
                <button
                  key={effect.label}
                  className="px-4 py-2 text-sm font-semibold bg-[#f5f6f7] text-[#333] rounded-lg border-none cursor-pointer hover:bg-primary-700 hover:text-white transition-all duration-200 active:scale-95"
                  onClick={effect.fn}
                >
                  {effect.label}
                </button>
              ))}
            </div>
          </section>

          {/* API 테스트 */}
          <section className="bg-white rounded-2xl p-4 md:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <h3 className="m-0 mb-4 text-lg font-bold">API 요청 테스트</h3>

            <div className="flex flex-wrap gap-2 mb-5 pb-4 border-b border-[#f0f0f0]">
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
              <span className="text-[11px] font-bold text-[#999] uppercase tracking-widest">요청 로그</span>
              {logs.length > 0 && (
                <button
                  className="text-xs text-[#bbb] hover:text-[#666] border-none bg-transparent cursor-pointer transition-colors"
                  onClick={() => { setLogs([]); setExpanded(new Set()); }}
                >
                  전체 삭제
                </button>
              )}
            </div>

            {logs.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#ccc] border border-dashed border-[#eee] rounded-xl">
                위 버튼을 클릭하면 요청 결과가 여기에 표시됩니다
              </div>
            ) : (
              <ul className="m-0 p-0 list-none space-y-1.5">
                {logs.map((log) => (
                  <li key={log.id} className="border border-[#eeeeee] rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-[#fafafa] border-none cursor-pointer text-left hover:bg-[#f3f4f6] transition-colors"
                      onClick={() => toggleExpand(log.id)}
                    >
                      <StatusDot status={log.status} />
                      <span className="font-mono text-xs flex-1 text-[#333] truncate">{log.label}</span>
                      {log.ms !== undefined && (
                        <span
                          className={`text-[11px] shrink-0 font-semibold ${
                            log.ms < 200 ? 'text-green-600' : log.ms < 800 ? 'text-yellow-600' : 'text-red-600'
                          }`}
                        >
                          {log.ms}ms
                        </span>
                      )}
                      <span className="text-[11px] text-[#bbb] shrink-0 tabular-nums">
                        {log.ts.toLocaleTimeString('ko-KR')}
                      </span>
                      <span className="text-[10px] text-[#ccc]">{expanded.has(log.id) ? '▲' : '▼'}</span>
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
          <section className="bg-white rounded-2xl p-4 md:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
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
    gray: 'bg-[#f5f6f7] text-[#555]',
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
      <span className="font-mono text-[#555] shrink-0">{label}</span>
      <span className={`font-mono truncate ${ok ? 'text-[#888]' : 'text-red-500 font-semibold'}`}>{display}</span>
    </li>
  );
}
