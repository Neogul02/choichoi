'use client';

import { useCallback, useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { fetchMenuItems, getAllMenu } from '@/app/actions/menu';
import { fetchTodaysSales, fetchTodaysOrders, fetchTodaysOrdersWithItems } from '@/app/actions/orders';
import { fetchMonthlySalesCalendar, fetchMenuSalesBreakdown, fetchDailySalesByPeriod } from '@/app/actions/stats';
import { fetchPopupEvents } from '@/app/actions/schedule';

// ── 타입 ─────────────────────────────────────────────────────────────────────

interface ApiLog {
  id: number;
  label: string;
  desc: string;
  status: 'pending' | 'ok' | 'err';
  ms?: number;
  data?: unknown;
  err?: string;
  ts: Date;
}

// ── 상수 ─────────────────────────────────────────────────────────────────────

let _logId = 0;

function todayISO() {
  const d = new Date();
  const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: `${s}T00:00:00+09:00`, end: `${s}T23:59:59+09:00` };
}

const API_ACTIONS: { label: string; desc: string; fn: () => Promise<unknown> }[] = [
  {
    label: 'fetchMenuItems',
    desc: '활성 메뉴만 조회 — is_active=true 필터, display_order 오름차순',
    fn: fetchMenuItems,
  },
  {
    label: 'getAllMenu',
    desc: '전체 메뉴 조회 — 비활성(삭제) 항목 포함',
    fn: getAllMenu,
  },
  {
    label: 'fetchTodaysSales',
    desc: '오늘 총 주문 건수 & 매출 합계 — KST 기준 00:00~23:59',
    fn: fetchTodaysSales,
  },
  {
    label: 'fetchTodaysOrders',
    desc: '오늘 주문 목록 — order_items 미포함 경량 조회, id 내림차순',
    fn: fetchTodaysOrders,
  },
  {
    label: 'fetchTodaysOrdersWithItems(5)',
    desc: '오늘 최근 5건 주문 + order_items + menu_items(name) 중첩 포함',
    fn: () => fetchTodaysOrdersWithItems(5),
  },
  {
    label: 'fetchMonthlySalesCalendar',
    desc: '이번 달 날짜별 매출 집계 — Supabase RPC get_monthly_sales_by_date 호출',
    fn: () => {
      const n = new Date();
      return fetchMonthlySalesCalendar(n.getFullYear(), n.getMonth() + 1);
    },
  },
  {
    label: 'fetchMenuSalesBreakdown (오늘)',
    desc: '오늘 메뉴별 판매 수량 & 매출 — orders → order_items → menu_items 배치 조인',
    fn: () => {
      const { start, end } = todayISO();
      return fetchMenuSalesBreakdown(start, end);
    },
  },
  {
    label: 'fetchDailySalesByPeriod (이번 달)',
    desc: '이번 달 일별 매출 — 1000건 페이지네이션, KST 날짜 변환 적용',
    fn: () => {
      const d = new Date();
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return fetchDailySalesByPeriod(`${m}-01T00:00:00+09:00`, todayISO().end);
    },
  },
  {
    label: 'fetchPopupEvents',
    desc: '팝업 행사 목록 — start_date 내림차순, 전체 조회',
    fn: fetchPopupEvents,
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
      setTimeout(
        () => confetti({ angle: 120, spread: 60, particleCount: 120, origin: { x: 1, y: 0.6 } }),
        150,
      );
    },
  },
  {
    label: '연속 폭발',
    fn: () => {
      let n = 0;
      const fire = () => {
        confetti({ particleCount: 60, spread: 80, origin: { x: Math.random(), y: 0.3 + Math.random() * 0.4 } });
        if (++n < 6) setTimeout(fire, 280);
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

// ── DB 스키마 정의 ────────────────────────────────────────────────────────────

interface SchemaColumn {
  name: string;
  type: string;
  nullable?: boolean;
  note?: string;
}

interface SchemaTable {
  name: string;
  color: string;
  columns: SchemaColumn[];
}

const DB_SCHEMA: SchemaTable[] = [
  {
    name: 'menu_items',
    color: '#3949AB',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto' },
      { name: 'name', type: 'text', note: '메뉴 이름' },
      { name: 'price', type: 'int4', note: '가격 (원)' },
      { name: 'color', type: 'text', note: 'HEX 색상' },
      { name: 'stock', type: 'int4', note: '재고 (기본 999)' },
      { name: 'is_active', type: 'bool', note: 'false = 소프트 삭제' },
      { name: 'display_order', type: 'int4', note: 'POS 그리드 순서' },
      { name: 'updated_at', type: 'timestamptz', nullable: true },
    ],
  },
  {
    name: 'orders',
    color: '#00897B',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto' },
      { name: 'total_price', type: 'numeric', note: '총 결제금액' },
      { name: 'payment_method', type: 'text', note: '"cash" 고정' },
      { name: 'payment_status', type: 'text', note: '"completed" 고정' },
      { name: 'created_at', type: 'timestamptz', note: '주문 시각 (KST 필터링 기준)' },
    ],
  },
  {
    name: 'order_items',
    color: '#F57C00',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto' },
      { name: 'order_id', type: 'int8', note: 'FK → orders.id' },
      { name: 'menu_item_id', type: 'int8', note: 'FK → menu_items.id' },
      { name: 'quantity', type: 'int4', note: '수량' },
      { name: 'unit_price', type: 'int4', note: '단가 (주문 시점 스냅샷)' },
      { name: 'subtotal', type: 'int4', note: 'quantity × unit_price' },
    ],
  },
  {
    name: 'popup_events',
    color: '#8E24AA',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto' },
      { name: 'name', type: 'text', note: '행사명' },
      { name: 'start_date', type: 'date', note: '시작일' },
      { name: 'end_date', type: 'date', note: '종료일' },
      { name: 'created_at', type: 'timestamptz' },
    ],
  },
  {
    name: 'schedule_slots',
    color: '#D81B60',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto' },
      { name: 'event_id', type: 'int8', note: 'FK → popup_events.id' },
      { name: 'worker_id', type: 'int8', nullable: true, note: 'FK → workers.id' },
      { name: 'schedule_date', type: 'date' },
      { name: 'role', type: 'text', note: '역할 (예: 홀, 주방)' },
      { name: 'person_name', type: 'text' },
      { name: 'work_time', type: 'text', nullable: true },
      { name: 'break_time', type: 'bool', note: '휴식 슬롯 여부' },
      { name: 'updated_at', type: 'timestamptz', nullable: true },
    ],
  },
  {
    name: 'workers',
    color: '#00838F',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto' },
      { name: 'event_id', type: 'int8', note: 'FK → popup_events.id' },
      { name: 'name', type: 'text' },
      { name: 'color', type: 'text', note: '태그 색상' },
      { name: 'phone', type: 'text', nullable: true },
      { name: 'bank_name', type: 'text', nullable: true },
      { name: 'bank_account', type: 'text', nullable: true },
      { name: 'hourly_rate', type: 'int4', note: '시급 (원)' },
      { name: 'payment_done', type: 'bool' },
      { name: 'updated_at', type: 'timestamptz', nullable: true },
    ],
  },
  {
    name: 'memos',
    color: '#6D4C41',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto' },
      { name: 'title', type: 'text', nullable: true },
      { name: 'content', type: 'text' },
      { name: 'color', type: 'text', note: 'HEX, 기본 #fff9c4' },
      { name: 'updated_at', type: 'timestamptz', nullable: true },
    ],
  },
];

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function DevToolsSection() {
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dbStats, setDbStats] = useState<{
    menuActive: number;
    menuTotal: number;
    todayOrders: number;
    todayRevenue: number;
    dupCheck: string;
    dupOk: boolean;
  } | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState<Set<string>>(new Set(['menu_items', 'orders', 'order_items']));

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
    const dupOk = ids.length === uniqueIds.size;
    setDbStats({
      menuActive: menuRes.success && menuRes.data ? menuRes.data.length : 0,
      menuTotal: allMenuRes.success && allMenuRes.data ? allMenuRes.data.length : 0,
      todayOrders: salesRes.success && salesRes.data ? salesRes.data.totalOrders : 0,
      todayRevenue: salesRes.success && salesRes.data ? salesRes.data.totalRevenue : 0,
      dupCheck: dupOk ? `중복 없음 (${ids.length}건 확인)` : `중복 감지! ${ids.length}건 중 고유 ID ${uniqueIds.size}개`,
      dupOk,
    });
    setDbLoading(false);
  }, []);

  useEffect(() => {
    loadDbStats();
  }, [loadDbStats]);

  const runApi = async (action: (typeof API_ACTIONS)[number]) => {
    const id = ++_logId;
    setLogs((p) => [{ id, label: action.label, desc: action.desc, status: 'pending', ts: new Date() }, ...p]);
    const t0 = performance.now();
    try {
      const data = await action.fn();
      const ms = Math.round(performance.now() - t0);
      setLogs((p) => p.map((l) => (l.id === id ? { ...l, status: 'ok', ms, data } : l)));
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      setLogs((p) => p.map((l) => (l.id === id ? { ...l, status: 'err', ms, err: String(e) } : l)));
    }
  };

  const toggleLog = (id: number) =>
    setExpanded((p) => {
      const next = new Set(p);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSchema = (name: string) =>
    setSchemaOpen((p) => {
      const next = new Set(p);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  return (
    <div className="space-y-5">

      {/* DB 상태 */}
      <div className="bg-[#f9f9f9] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="m-0 text-base font-bold">DB 상태</h3>
          <button
            className="px-3 py-1 text-xs font-semibold bg-white border border-[#e0e0e0] text-[#555] rounded-lg cursor-pointer hover:bg-[#f0f0f0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={loadDbStats}
            disabled={dbLoading}
          >
            {dbLoading ? '로딩 중...' : '새로고침'}
          </button>
        </div>

        {dbStats ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <StatCard label="활성 메뉴" value={`${dbStats.menuActive}개`} sub={`전체 ${dbStats.menuTotal}개`} color="blue" />
              <StatCard label="비활성 메뉴" value={`${dbStats.menuTotal - dbStats.menuActive}개`} sub="소프트 삭제" color="gray" />
              <StatCard label="오늘 주문" value={`${dbStats.todayOrders}건`} color="green" />
              <StatCard label="오늘 매출" value={`₩${dbStats.todayRevenue.toLocaleString('ko-KR')}`} color="rose" />
            </div>
            <div className={`rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2 ${dbStats.dupOk ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              <span className="text-base">{dbStats.dupOk ? '✓' : '!'}</span>
              <span>주문 ID 중복 검사: {dbStats.dupCheck}</span>
            </div>
          </>
        ) : (
          <div className="py-6 text-center text-sm text-[#bbb]">데이터를 불러오는 중...</div>
        )}
      </div>

      {/* DB 스키마 */}
      <div className="bg-[#f9f9f9] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="m-0 text-base font-bold">DB 스키마</h3>
          <div className="flex gap-1.5">
            <button
              className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-[#e0e0e0] text-[#555] rounded-lg cursor-pointer hover:bg-[#f0f0f0] transition-colors"
              onClick={() => setSchemaOpen(new Set(DB_SCHEMA.map((t) => t.name)))}
            >
              전체 펼치기
            </button>
            <button
              className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-[#e0e0e0] text-[#555] rounded-lg cursor-pointer hover:bg-[#f0f0f0] transition-colors"
              onClick={() => setSchemaOpen(new Set())}
            >
              전체 접기
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {DB_SCHEMA.map((table) => (
            <div key={table.name} className="bg-white border border-[#eeeeee] rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2.5 border-none bg-transparent cursor-pointer text-left hover:bg-[#fafafa] transition-colors"
                onClick={() => toggleSchema(table.name)}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: table.color }} />
                <span className="font-mono text-sm font-bold text-[#222] flex-1">{table.name}</span>
                <span className="text-[11px] text-[#bbb]">{table.columns.length}개 컬럼</span>
                <span className="text-[10px] text-[#ccc] ml-1">{schemaOpen.has(table.name) ? '▲' : '▼'}</span>
              </button>
              {schemaOpen.has(table.name) && (
                <div className="overflow-x-auto border-t border-[#f0f0f0]">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#fafafa]">
                        <th className="px-3 py-2 text-left font-semibold text-[#888] border-b border-[#eeeeee] w-[30%]">컬럼</th>
                        <th className="px-3 py-2 text-left font-semibold text-[#888] border-b border-[#eeeeee] w-[20%]">타입</th>
                        <th className="px-3 py-2 text-left font-semibold text-[#888] border-b border-[#eeeeee] w-[10%]">Null</th>
                        <th className="px-3 py-2 text-left font-semibold text-[#888] border-b border-[#eeeeee]">설명</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.columns.map((col, i) => (
                        <tr key={col.name} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}>
                          <td className="px-3 py-2 font-mono font-semibold text-[#333]">{col.name}</td>
                          <td className="px-3 py-2">
                            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#f0f4ff] text-[#3949AB]">
                              {col.type}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[#aaa]">{col.nullable ? 'YES' : ''}</td>
                          <td className="px-3 py-2 text-[#666]">
                            {col.note?.includes('FK') ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200">FK</span>
                                <span>{col.note.replace('FK → ', '')}</span>
                              </span>
                            ) : col.note?.includes('PK') ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">PK</span>
                                <span>{col.note.replace('PK, ', '')}</span>
                              </span>
                            ) : (
                              col.note ?? ''
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
        {/* 관계 요약 */}
        <div className="mt-3 px-3 py-2.5 bg-white border border-[#eeeeee] rounded-xl">
          <p className="m-0 mb-2 text-[11px] font-bold text-[#999] uppercase tracking-widest">테이블 관계</p>
          <div className="flex flex-wrap gap-2 text-[11px] font-mono">
            {[
              { from: 'orders', to: 'order_items', label: '1:N' },
              { from: 'menu_items', to: 'order_items', label: '1:N' },
              { from: 'popup_events', to: 'schedule_slots', label: '1:N' },
              { from: 'popup_events', to: 'workers', label: '1:N' },
              { from: 'workers', to: 'schedule_slots', label: '1:N (optional)' },
            ].map(({ from, to, label }) => (
              <span key={`${from}-${to}`} className="flex items-center gap-1 bg-[#f5f6f7] px-2 py-1 rounded-md">
                <span className="text-[#3949AB] font-semibold">{from}</span>
                <span className="text-[#999]">→</span>
                <span className="text-[#F57C00] font-semibold">{to}</span>
                <span className="text-[#bbb] ml-0.5">({label})</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 폭죽 테스트 */}
      <div className="bg-[#f9f9f9] rounded-xl p-4">
        <h3 className="m-0 mb-3 text-base font-bold">폭죽 테스트</h3>
        <div className="flex flex-wrap gap-2">
          {CONFETTI_EFFECTS.map((e) => (
            <button
              key={e.label}
              className="px-4 py-2 text-sm font-semibold bg-white border border-[#e0e0e0] text-[#333] rounded-lg cursor-pointer hover:bg-primary-700 hover:text-white hover:border-primary-700 transition-all duration-200 active:scale-95"
              onClick={e.fn}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {/* API 요청 테스트 */}
      <div className="bg-[#f9f9f9] rounded-xl p-4">
        <h3 className="m-0 mb-3 text-base font-bold">API 요청 테스트</h3>
        <div className="space-y-1.5 mb-4">
          {API_ACTIONS.map((action) => (
            <button
              key={action.label}
              className="w-full flex items-start gap-3 px-3 py-2.5 bg-white border border-[#eeeeee] rounded-xl cursor-pointer text-left hover:border-[#3949AB] hover:bg-[#f0f4ff] transition-all duration-150 group"
              onClick={() => runApi(action)}
            >
              <span className="font-mono text-[12px] font-bold text-[#3949AB] shrink-0 pt-px group-hover:text-[#3949AB]">
                {action.label}
              </span>
              <span className="text-[11px] text-[#888] leading-relaxed pt-px">{action.desc}</span>
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
          <div className="py-8 text-center text-sm text-[#ccc] border border-dashed border-[#e0e0e0] rounded-xl bg-white">
            위 버튼을 클릭하면 요청 결과가 여기에 표시됩니다
          </div>
        ) : (
          <ul className="m-0 p-0 list-none space-y-1.5">
            {logs.map((log) => (
              <li key={log.id} className="border border-[#eeeeee] rounded-xl overflow-hidden bg-white">
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 border-none bg-transparent cursor-pointer text-left hover:bg-[#fafafa] transition-colors"
                  onClick={() => toggleLog(log.id)}
                >
                  <StatusDot status={log.status} />
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs font-semibold text-[#333] block truncate">{log.label}</span>
                    <span className="text-[10px] text-[#bbb] truncate block">{log.desc}</span>
                  </div>
                  {log.ms !== undefined && (
                    <span className={`text-[11px] shrink-0 font-bold tabular-nums ${log.ms < 300 ? 'text-green-600' : log.ms < 1000 ? 'text-amber-500' : 'text-red-500'}`}>
                      {log.ms}ms
                    </span>
                  )}
                  <span className="text-[11px] text-[#ccc] shrink-0 tabular-nums">
                    {log.ts.toLocaleTimeString('ko-KR')}
                  </span>
                  <span className="text-[10px] text-[#ddd]">{expanded.has(log.id) ? '▲' : '▼'}</span>
                </button>
                {expanded.has(log.id) && (
                  <pre className="m-0 p-3 text-[11px] leading-relaxed bg-[#1e1e2e] text-[#cdd6f4] overflow-x-auto max-h-[320px] overflow-y-auto">
                    {log.status === 'err' ? log.err : JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 환경 정보 */}
      <div className="bg-[#f9f9f9] rounded-xl p-4">
        <h3 className="m-0 mb-3 text-base font-bold">환경 정보</h3>
        <ul className="m-0 p-0 list-none space-y-2">
          <EnvRow label="NEXT_PUBLIC_SUPABASE_URL" value={process.env.NEXT_PUBLIC_SUPABASE_URL} />
          <EnvRow label="NODE_ENV" value={process.env.NODE_ENV} />
        </ul>
      </div>
    </div>
  );
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: 'blue' | 'gray' | 'green' | 'rose' }) {
  const styles = { blue: 'bg-blue-50 text-blue-700', gray: 'bg-white text-[#555] border border-[#eee]', green: 'bg-green-50 text-green-700', rose: 'bg-rose-50 text-rose-700' };
  return (
    <div className={`rounded-xl p-3 ${styles[color]}`}>
      <p className="m-0 text-[11px] opacity-60 mb-1 font-semibold">{label}</p>
      <p className="m-0 text-lg font-bold leading-tight">{value}</p>
      {sub && <p className="m-0 mt-0.5 text-[10px] opacity-50">{sub}</p>}
    </div>
  );
}

function StatusDot({ status }: { status: 'pending' | 'ok' | 'err' }) {
  if (status === 'pending') return <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />;
  if (status === 'ok') return <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />;
}

function EnvRow({ label, value }: { label: string; value: string | undefined }) {
  const ok = !!value;
  const display = value ? (value.length > 45 ? value.slice(0, 22) + '…' + value.slice(-10) : value) : '(미설정)';
  return (
    <li className="flex items-center gap-3 text-xs bg-white border border-[#eeeeee] rounded-lg px-3 py-2">
      <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-green-500' : 'bg-red-400'}`} />
      <span className="font-mono text-[#555] shrink-0">{label}</span>
      <span className={`font-mono truncate ${ok ? 'text-[#999]' : 'text-red-500 font-semibold'}`}>{display}</span>
    </li>
  );
}
