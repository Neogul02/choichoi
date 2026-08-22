'use client';

import { useCallback, useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import EmojiPhysics from '@/components/display/EmojiPhysics';
import { EMOJI_MAP } from '@/lib/emoji-map';
import type { CartItem } from '@/types/display';
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
      { name: 'name', type: 'varchar', note: '메뉴 이름' },
      { name: 'price', type: 'numeric', note: '가격 (원)' },
      { name: 'color', type: 'varchar', nullable: true, note: 'HEX 색상' },
      { name: 'stock', type: 'int4', nullable: true, note: '재고 (기본 999)' },
      { name: 'is_active', type: 'bool', nullable: true, note: 'false = 소프트 삭제' },
      { name: 'display_order', type: 'int4', nullable: true, note: 'POS 그리드 순서' },
      { name: 'created_at', type: 'timestamp', nullable: true },
      { name: 'updated_at', type: 'timestamp', nullable: true },
    ],
  },
  {
    name: 'orders',
    color: '#00897B',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto' },
      { name: 'total_price', type: 'numeric', note: '총 결제금액' },
      { name: 'payment_method', type: 'varchar', nullable: true },
      { name: 'payment_status', type: 'varchar', nullable: true, note: '기본값 pending' },
      { name: 'cashier_name', type: 'text', nullable: true },
      { name: 'is_prepared', type: 'bool', note: '준비 완료 여부' },
      { name: 'popup_id', type: 'int8', nullable: true, note: 'FK → popup_events.id' },
      { name: 'created_at', type: 'timestamp', nullable: true, note: '주문 시각 (KST 필터링 기준)' },
      { name: 'updated_at', type: 'timestamp', nullable: true },
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
      { name: 'unit_price', type: 'numeric', note: '단가 (주문 시점 스냅샷)' },
      { name: 'subtotal', type: 'numeric', note: 'quantity × unit_price' },
      { name: 'created_at', type: 'timestamp', nullable: true },
    ],
  },
  {
    name: 'popup_events',
    color: '#8E24AA',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto' },
      { name: 'name', type: 'varchar', note: '행사명 (2026-07-24 stores 흡수 이후 매장명 겸용)' },
      { name: 'start_date', type: 'date', note: '시작일' },
      { name: 'end_date', type: 'date', note: '종료일' },
      { name: 'is_active', type: 'bool', note: '활성 여부 (기본 true)' },
      { name: 'created_at', type: 'timestamptz', nullable: true },
    ],
  },
  {
    name: 'user_profiles',
    color: '#1E88E5',
    columns: [
      { name: 'id', type: 'uuid', note: 'PK, FK → auth.users.id' },
      { name: 'name', type: 'text' },
      { name: 'phone', type: 'text', nullable: true },
      { name: 'bank_name', type: 'text', nullable: true },
      { name: 'bank_account', type: 'text', nullable: true },
      { name: 'health_cert_url', type: 'text', nullable: true },
      { name: 'worker_role', type: 'text', note: "'admin' | 'manager' | 'user'" },
      { name: 'total_revenue', type: 'int4', note: '누적 매출 (기본 0)' },
      { name: 'resident_reg_no_enc', type: 'text', nullable: true, note: '주민등록번호 암호화 저장' },
      { name: 'resident_reg_no_masked', type: 'text', nullable: true, note: '화면 표시용 마스킹 값' },
      { name: 'created_at', type: 'timestamptz', nullable: true },
    ],
  },
  {
    name: 'staff_profiles',
    color: '#00ACC1',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto' },
      { name: 'name', type: 'text' },
      { name: 'phone', type: 'text', nullable: true },
      { name: 'staff_role', type: 'text', note: "'kitchen' | 'cashier'" },
      { name: 'popup_id', type: 'int8', nullable: true, note: 'FK → popup_events.id (캐셔만 단일값)' },
      { name: 'status', type: 'text', note: "'candidate' | 'confirmed' | 'inactive'" },
      { name: 'user_profile_id', type: 'uuid', nullable: true, note: 'FK → user_profiles.id' },
      { name: 'hourly_rate', type: 'int4', nullable: true, note: '시급 (원)' },
      { name: 'bank_name', type: 'text', nullable: true },
      { name: 'bank_account', type: 'text', nullable: true },
      { name: 'has_health_cert', type: 'bool', note: '기본 false' },
      { name: 'health_cert_url', type: 'text', nullable: true },
      { name: 'wants_insurance', type: 'bool', note: '기본 true' },
      { name: 'preferred_days', type: 'int4[]', note: '선호 요일' },
      { name: 'preferred_shift_ids', type: 'int8[]', note: '선호 파트 FK 목록' },
      { name: 'available_ranges', type: 'jsonb', note: '가능 기간 목록' },
      { name: 'max_days_per_week', type: 'int4', nullable: true, note: '1~7' },
      { name: 'notes', type: 'text', nullable: true },
      { name: 'sort_order', type: 'int4', nullable: true },
      { name: 'created_at', type: 'timestamptz' },
      { name: 'updated_at', type: 'timestamptz' },
    ],
  },
  {
    name: 'staff_popup_assignments',
    color: '#5C6BC0',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto' },
      { name: 'staff_id', type: 'int8', note: 'FK → staff_profiles.id' },
      { name: 'popup_id', type: 'int8', note: 'FK → popup_events.id' },
      { name: 'created_at', type: 'timestamptz' },
    ],
  },
  {
    name: 'roster_shifts',
    color: '#7CB342',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto — 파트 정의' },
      { name: 'staff_role', type: 'text', note: "'kitchen' | 'cashier'" },
      { name: 'popup_id', type: 'int8', nullable: true, note: 'FK → popup_events.id' },
      { name: 'name', type: 'text', note: '파트 이름' },
      { name: 'start_time', type: 'text', note: '기본 09:00' },
      { name: 'end_time', type: 'text', note: '기본 18:00' },
      { name: 'break_minutes', type: 'int4', note: '기본 0' },
      { name: 'weekday_required', type: 'int4', note: '평일 필요 인원' },
      { name: 'weekend_required', type: 'int4', note: '주말 필요 인원' },
      { name: 'active_from', type: 'date', nullable: true },
      { name: 'active_to', type: 'date', nullable: true },
      { name: 'sort_order', type: 'int4' },
      { name: 'created_at', type: 'timestamptz' },
    ],
  },
  {
    name: 'roster_shift_requirements',
    color: '#C0CA33',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto' },
      { name: 'work_date', type: 'date' },
      { name: 'shift_id', type: 'int8', note: 'FK → roster_shifts.id' },
      { name: 'required', type: 'int4', note: '해당 날짜 필요 인원' },
    ],
  },
  {
    name: 'roster_assignments',
    color: '#D81B60',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto — 날짜별 실배정' },
      { name: 'work_date', type: 'date' },
      { name: 'shift_id', type: 'int8', note: 'FK → roster_shifts.id' },
      { name: 'staff_id', type: 'int8', note: 'FK → staff_profiles.id' },
      { name: 'staff_role', type: 'text', note: "'kitchen' | 'cashier'" },
      { name: 'popup_id', type: 'int8', nullable: true, note: 'FK → popup_events.id' },
      { name: 'start_time', type: 'text', nullable: true, note: '파트 기본값 오버라이드' },
      { name: 'end_time', type: 'text', nullable: true },
      { name: 'break_minutes', type: 'int4', nullable: true },
      { name: 'created_at', type: 'timestamptz' },
    ],
  },
  {
    name: 'contracts',
    color: '#5E35B1',
    columns: [
      { name: 'id', type: 'uuid', note: 'PK, auto' },
      { name: 'worker_id', type: 'int4', note: 'FK → staff_profiles.id' },
      { name: 'popup_id', type: 'int4', nullable: true, note: 'FK → popup_events.id' },
      { name: 'start_date', type: 'date' },
      { name: 'end_date', type: 'date', nullable: true },
      { name: 'hourly_rate', type: 'int4' },
      { name: 'work_schedule', type: 'text', nullable: true },
      { name: 'workplace', type: 'text', nullable: true },
      { name: 'pdf_url', type: 'text', nullable: true, note: '비공개 storage signed URL 대상' },
      { name: 'pdf_hash', type: 'text', nullable: true },
      { name: 'contract_data', type: 'jsonb', nullable: true, note: '작성 시점 전체 계약 데이터' },
      { name: 'worker_address', type: 'text', nullable: true },
      { name: 'worker_signed_at', type: 'timestamptz', nullable: true },
      { name: 'issued_at', type: 'timestamptz' },
      { name: 'created_by', type: 'uuid', nullable: true, note: 'FK → auth.users.id' },
      { name: 'created_at', type: 'timestamptz', nullable: true },
    ],
  },
  {
    name: 'ingredients',
    color: '#43A047',
    columns: [
      { name: 'id', type: 'text', note: 'PK' },
      { name: 'name', type: 'text' },
      { name: 'category', type: 'text' },
      { name: 'color', type: 'text' },
      { name: 'unit_type', type: 'text', note: "'count' | 'weight'" },
      { name: 'base_unit', type: 'text' },
      { name: 'container_unit', type: 'text' },
      { name: 'container_size', type: 'numeric' },
      { name: 'sealed_count', type: 'int4', note: '미개봉 수량 (기본 0)' },
      { name: 'opened_remaining', type: 'numeric', note: '개봉분 잔량 (기본 0)' },
      { name: 'reorder_at_containers', type: 'int4', note: '재주문 기준 (기본 1)' },
      { name: 'vendor', type: 'text', nullable: true },
      { name: 'lead_days', type: 'int4', nullable: true },
      { name: 'unit_price', type: 'int4', nullable: true },
      { name: 'sort_order', type: 'int4', nullable: true },
      { name: 'created_at', type: 'timestamptz', nullable: true },
      { name: 'updated_at', type: 'timestamptz', nullable: true },
    ],
  },
  {
    name: 'restock_events',
    color: '#558B2F',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto — 재고 입고 이력' },
      { name: 'ingredient_id', type: 'text', note: 'FK → ingredients.id' },
      { name: 'sealed_delta', type: 'int4', note: '미개봉 증감 (기본 0)' },
      { name: 'opened_delta', type: 'numeric', note: '개봉분 증감 (기본 0)' },
      { name: 'note', type: 'text', nullable: true },
      { name: 'created_by', type: 'text', nullable: true },
      { name: 'created_at', type: 'timestamptz', nullable: true },
    ],
  },
  {
    name: 'memos',
    color: '#6D4C41',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto' },
      { name: 'title', type: 'varchar', nullable: true },
      { name: 'content', type: 'text' },
      { name: 'color', type: 'varchar', nullable: true, note: 'HEX, 기본 #fff9c4' },
      { name: 'type', type: 'text', note: "'note' | 'checklist' (기본 note)" },
      { name: 'is_pinned', type: 'bool', note: '기본 false' },
      { name: 'created_at', type: 'timestamptz', nullable: true },
      { name: 'updated_at', type: 'timestamptz', nullable: true },
    ],
  },
  {
    name: 'pos_note',
    color: '#FFB300',
    columns: [
      { name: 'id', type: 'int2', note: 'PK, 항상 1 (싱글턴 row)' },
      { name: 'content', type: 'text', note: 'POS 공지 내용' },
      { name: 'updated_by', type: 'text', nullable: true },
      { name: 'updated_at', type: 'timestamptz' },
    ],
  },
  {
    name: 'roster_memos',
    color: '#8D6E63',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto — 일정표 날짜별 메모' },
      { name: 'memo_date', type: 'date' },
      { name: 'content', type: 'text' },
      { name: 'author_name', type: 'text', nullable: true },
      { name: 'created_at', type: 'timestamptz' },
    ],
  },
  {
    name: 'daily_sales',
    color: '#00BFA5',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto' },
      { name: 'sale_date', type: 'date', note: 'unique — 수동 입력용' },
      { name: 'total_orders', type: 'int4', nullable: true, note: '기본 0' },
      { name: 'total_revenue', type: 'numeric', nullable: true, note: '기본 0' },
      { name: 'note', type: 'text', nullable: true },
      { name: 'created_at', type: 'timestamp', nullable: true },
      { name: 'updated_at', type: 'timestamp', nullable: true },
    ],
  },
  {
    name: 'manual_menu_sales',
    color: '#EF6C00',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto — 팝업별 수기 메뉴 판매량(POS 보정용)' },
      { name: 'popup_id', type: 'int8', note: 'FK → popup_events.id' },
      { name: 'menu_item_id', type: 'int8', note: 'FK → menu_items.id' },
      { name: 'quantity', type: 'int4', note: '기본 0, ≥0' },
      { name: 'created_at', type: 'timestamptz' },
      { name: 'updated_at', type: 'timestamptz' },
    ],
  },
  {
    name: 'manual_daily_menu_sales',
    color: '#F4511E',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto — 날짜별 수기 메뉴 판매량' },
      { name: 'popup_id', type: 'int8', note: 'FK → popup_events.id' },
      { name: 'sale_date', type: 'date' },
      { name: 'menu_item_id', type: 'int8', note: 'FK → menu_items.id' },
      { name: 'quantity', type: 'int4', note: '기본 0, ≥0' },
      { name: 'created_at', type: 'timestamptz' },
      { name: 'updated_at', type: 'timestamptz' },
    ],
  },
  {
    name: 'manual_hourly_sales',
    color: '#D84315',
    columns: [
      { name: 'id', type: 'int8', note: 'PK, auto — 시간대별 수기 매출' },
      { name: 'popup_id', type: 'int8', note: 'FK → popup_events.id' },
      { name: 'hour', type: 'int2', note: '0~23' },
      { name: 'total_revenue', type: 'int8', note: '기본 0, ≥0' },
      { name: 'total_orders', type: 'int4', note: '기본 0, ≥0' },
      { name: 'created_at', type: 'timestamptz' },
      { name: 'updated_at', type: 'timestamptz' },
    ],
  },
];

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function DevToolsSection() {
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [physicsItems, setPhysicsItems] = useState<CartItem[]>([]);
  const [physicsActive, setPhysicsActive] = useState(false);

  const firePhysics = (items: CartItem[]) => {
    setPhysicsActive(false);
    requestAnimationFrame(() => {
      setPhysicsItems(items);
      setPhysicsActive(true);
    });
  };
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
      <EmojiPhysics items={physicsItems} active={physicsActive} />

      {/* DB 상태 */}
      <div className="bg-canvas-soft rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="m-0 text-base font-bold">DB 상태</h3>
          <button
            className="px-3 py-1 text-xs font-semibold bg-canvas border border-hairline text-ink-muted rounded-lg cursor-pointer hover:bg-canvas-soft disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
          <div className="py-6 text-center text-sm text-ink-faint">데이터를 불러오는 중...</div>
        )}
      </div>

      {/* DB 스키마 */}
      <div className="bg-canvas-soft rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="m-0 text-base font-bold">DB 스키마</h3>
          <div className="flex gap-1.5">
            <button
              className="px-2.5 py-1 text-[11px] font-semibold bg-canvas border border-hairline text-ink-muted rounded-lg cursor-pointer hover:bg-canvas-soft transition-colors"
              onClick={() => setSchemaOpen(new Set(DB_SCHEMA.map((t) => t.name)))}
            >
              전체 펼치기
            </button>
            <button
              className="px-2.5 py-1 text-[11px] font-semibold bg-canvas border border-hairline text-ink-muted rounded-lg cursor-pointer hover:bg-canvas-soft transition-colors"
              onClick={() => setSchemaOpen(new Set())}
            >
              전체 접기
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {DB_SCHEMA.map((table) => (
            <div key={table.name} className="bg-canvas border border-[#eeeeee] rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2.5 border-none bg-transparent cursor-pointer text-left hover:bg-canvas-soft transition-colors"
                onClick={() => toggleSchema(table.name)}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: table.color }} />
                <span className="font-mono text-sm font-bold text-ink flex-1">{table.name}</span>
                <span className="text-[11px] text-ink-faint">{table.columns.length}개 컬럼</span>
                <span className="text-[10px] text-ink-faint ml-1">{schemaOpen.has(table.name) ? '▲' : '▼'}</span>
              </button>
              {schemaOpen.has(table.name) && (
                <div className="overflow-x-auto border-t border-hairline">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-canvas-soft">
                        <th className="px-3 py-2 text-left font-semibold text-ink-muted border-b border-[#eeeeee] w-[30%]">컬럼</th>
                        <th className="px-3 py-2 text-left font-semibold text-ink-muted border-b border-[#eeeeee] w-[20%]">타입</th>
                        <th className="px-3 py-2 text-left font-semibold text-ink-muted border-b border-[#eeeeee] w-[10%]">Null</th>
                        <th className="px-3 py-2 text-left font-semibold text-ink-muted border-b border-[#eeeeee]">설명</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.columns.map((col, i) => (
                        <tr key={col.name} className={i % 2 === 0 ? 'bg-canvas' : 'bg-canvas-soft'}>
                          <td className="px-3 py-2 font-mono font-semibold text-ink-secondary">{col.name}</td>
                          <td className="px-3 py-2">
                            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#f0f4ff] text-[#3949AB]">
                              {col.type}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-ink-faint">{col.nullable ? 'YES' : ''}</td>
                          <td className="px-3 py-2 text-ink-muted">
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
        <div className="mt-3 px-3 py-2.5 bg-canvas border border-[#eeeeee] rounded-xl">
          <p className="m-0 mb-2 text-[11px] font-bold text-ink-faint uppercase tracking-widest">테이블 관계</p>
          <div className="flex flex-wrap gap-2 text-[11px] font-mono">
            {[
              { from: 'orders', to: 'order_items', label: '1:N' },
              { from: 'menu_items', to: 'order_items', label: '1:N' },
              { from: 'popup_events', to: 'orders', label: '1:N' },
              { from: 'user_profiles', to: 'staff_profiles', label: '1:N' },
              { from: 'popup_events', to: 'staff_profiles', label: '1:N (캐셔만)' },
              { from: 'popup_events', to: 'staff_popup_assignments', label: 'N:M (staff_profiles)' },
              { from: 'popup_events', to: 'roster_shifts', label: '1:N' },
              { from: 'roster_shifts', to: 'roster_assignments', label: '1:N' },
              { from: 'roster_shifts', to: 'roster_shift_requirements', label: '1:N' },
              { from: 'staff_profiles', to: 'roster_assignments', label: '1:N' },
              { from: 'staff_profiles', to: 'contracts', label: '1:N' },
              { from: 'ingredients', to: 'restock_events', label: '1:N' },
              { from: 'popup_events', to: 'manual_menu_sales', label: '1:N' },
            ].map(({ from, to, label }) => (
              <span key={`${from}-${to}`} className="flex items-center gap-1 bg-[#f5f6f7] px-2 py-1 rounded-md">
                <span className="text-[#3949AB] font-semibold">{from}</span>
                <span className="text-ink-faint">→</span>
                <span className="text-[#F57C00] font-semibold">{to}</span>
                <span className="text-ink-faint ml-0.5">({label})</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 폭죽 테스트 */}
      <div className="bg-canvas-soft rounded-xl p-4">
        <h3 className="m-0 mb-3 text-base font-bold">폭죽 테스트</h3>
        <div className="flex flex-wrap gap-2">
          {CONFETTI_EFFECTS.map((e) => (
            <button
              key={e.label}
              className="px-4 py-2 text-sm font-semibold bg-canvas border border-hairline text-ink-secondary rounded-lg cursor-pointer hover:bg-primary-700 hover:text-white hover:border-primary-700 transition-all duration-200 active:scale-95"
              onClick={e.fn}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {/* 과일 이모지 테스트 */}
      <div className="bg-canvas-soft rounded-xl p-4">
        <h3 className="m-0 mb-3 text-base font-bold">과일 이모지 테스트</h3>
        <div className="flex flex-wrap gap-2">
          {EMOJI_MAP.map(({ keyword, emoji }) => (
            <button
              key={keyword}
              className="px-4 py-2 text-sm font-semibold bg-canvas border border-hairline text-ink-secondary rounded-lg cursor-pointer hover:bg-primary-700 hover:text-white hover:border-primary-700 transition-all duration-200 active:scale-95"
              onClick={() => firePhysics([{ id: 0, name: keyword, price: 0, count: 2 }])}
            >
              {emoji} {keyword}
            </button>
          ))}
          <button
            className="px-4 py-2 text-sm font-semibold bg-canvas border border-hairline text-ink-secondary rounded-lg cursor-pointer hover:bg-primary-700 hover:text-white hover:border-primary-700 transition-all duration-200 active:scale-95"
            onClick={() => firePhysics(EMOJI_MAP.map(({ keyword }, i) => ({ id: i, name: keyword, price: 0, count: 1 })))}
          >
            🎉 전체
          </button>
          <button
            className="px-4 py-2 text-sm font-semibold bg-canvas border border-hairline text-red-400 rounded-lg cursor-pointer hover:bg-red-50 hover:border-red-300 transition-all duration-200 active:scale-95"
            onClick={() => setPhysicsActive(false)}
          >
            초기화
          </button>
        </div>
      </div>

      {/* API 요청 테스트 */}
      <div className="bg-canvas-soft rounded-xl p-4">
        <h3 className="m-0 mb-3 text-base font-bold">API 요청 테스트</h3>
        <div className="space-y-1.5 mb-4">
          {API_ACTIONS.map((action) => (
            <button
              key={action.label}
              className="w-full flex items-start gap-3 px-3 py-2.5 bg-canvas border border-[#eeeeee] rounded-xl cursor-pointer text-left hover:border-[#3949AB] hover:bg-[#f0f4ff] transition-all duration-150 group"
              onClick={() => runApi(action)}
            >
              <span className="font-mono text-[12px] font-bold text-[#3949AB] shrink-0 pt-px group-hover:text-[#3949AB]">
                {action.label}
              </span>
              <span className="text-[11px] text-ink-muted leading-relaxed pt-px">{action.desc}</span>
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
          <div className="py-8 text-center text-sm text-ink-faint border border-dashed border-hairline rounded-xl bg-canvas">
            위 버튼을 클릭하면 요청 결과가 여기에 표시됩니다
          </div>
        ) : (
          <ul className="m-0 p-0 list-none space-y-1.5">
            {logs.map((log) => (
              <li key={log.id} className="border border-[#eeeeee] rounded-xl overflow-hidden bg-canvas">
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 border-none bg-transparent cursor-pointer text-left hover:bg-canvas-soft transition-colors"
                  onClick={() => toggleLog(log.id)}
                >
                  <StatusDot status={log.status} />
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs font-semibold text-ink-secondary block truncate">{log.label}</span>
                    <span className="text-[10px] text-ink-faint truncate block">{log.desc}</span>
                  </div>
                  {log.ms !== undefined && (
                    <span className={`text-[11px] shrink-0 font-bold tabular-nums ${log.ms < 300 ? 'text-green-600' : log.ms < 1000 ? 'text-amber-500' : 'text-red-500'}`}>
                      {log.ms}ms
                    </span>
                  )}
                  <span className="text-[11px] text-ink-faint shrink-0 tabular-nums">
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
      <div className="bg-canvas-soft rounded-xl p-4">
        <h3 className="m-0 mb-3 text-base font-bold">환경 정보</h3>
        <div className="mb-3 px-3 py-2.5 bg-canvas border border-[#eeeeee] rounded-xl flex items-center justify-between gap-3">
          <div>
            <p className="m-0 text-[11px] font-bold text-ink-faint uppercase tracking-widest mb-1">최신 배포 시각</p>
            <p className="m-0 font-mono text-sm font-bold text-ink">{formatBuildTime(process.env.NEXT_PUBLIC_BUILD_TIME)}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {process.env.NEXT_PUBLIC_APP_VERSION && (
              <span className="font-mono text-[11px] px-2 py-1 rounded-md bg-green-50 text-green-700">
                v{process.env.NEXT_PUBLIC_APP_VERSION}
              </span>
            )}
            {process.env.NEXT_PUBLIC_GIT_SHA && (
              <span className="font-mono text-[11px] px-2 py-1 rounded-md bg-[#f0f4ff] text-[#3949AB]">
                {process.env.NEXT_PUBLIC_GIT_SHA.slice(0, 7)}
              </span>
            )}
          </div>
        </div>
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
  const styles = { blue: 'bg-blue-50 text-blue-700', gray: 'bg-canvas text-ink-muted border border-hairline', green: 'bg-green-50 text-green-700', rose: 'bg-rose-50 text-rose-700' };
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

const BUILD_TIME_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  dateStyle: 'medium',
  timeStyle: 'medium',
});

function formatBuildTime(value: string | undefined): string {
  if (!value) return '(미설정)';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '(미설정)';
  return `${BUILD_TIME_FORMATTER.format(d)} (KST)`;
}

function EnvRow({ label, value }: { label: string; value: string | undefined }) {
  const ok = !!value;
  const display = value ? (value.length > 45 ? value.slice(0, 22) + '…' + value.slice(-10) : value) : '(미설정)';
  return (
    <li className="flex items-center gap-3 text-xs bg-canvas border border-[#eeeeee] rounded-lg px-3 py-2">
      <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-green-500' : 'bg-red-400'}`} />
      <span className="font-mono text-ink-muted shrink-0">{label}</span>
      <span className={`font-mono truncate ${ok ? 'text-ink-faint' : 'text-red-500 font-semibold'}`}>{display}</span>
    </li>
  );
}
