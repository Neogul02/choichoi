'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMenuItems, getAllMenu, fetchPopupMenuHidden } from '@/app/actions/menu';
import { fetchTodaysSales, fetchTodaysOrdersWithItems, fetchHourlySalesByPopup } from '@/app/actions/orders';
import {
  fetchMonthlySalesCalendar, fetchTodaysSalesForStats, fetchTodaysSalesByPopupForStats, fetchLifetimeSalesTotals,
  fetchPopupDailySales, fetchPopupDayDetail,
} from '@/app/actions/stats';
import { fetchPopupEvents } from '@/app/actions/schedule';
import { kstToday } from '@/lib/date';
import { pickOngoingPopup } from '@/lib/staffing';
import { FEATURES, DISABLED_FEATURE_LABELS } from '@/lib/features';
import { fetchDbSchema, type SchemaTable } from '@/app/actions/devtools';
import CopyText from '@/components/CopyText';

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

/** 진행 중인 팝업(없으면 최신) — 팝업 단위 액션 점검용 */
async function currentPopupId(): Promise<number | null> {
  const res = await fetchPopupEvents();
  const list = res.success ? res.data ?? [] : [];
  return (pickOngoingPopup(list, kstToday()) ?? list[0])?.id ?? null;
}

const kstDayISO = (d: string) => ({ start: new Date(`${d}T00:00:00+09:00`).toISOString(), end: new Date(`${d}T23:59:59.999+09:00`).toISOString() });

// 화면들이 실제로 쓰는 조회 액션 — 결과·응답 시간을 그 자리에서 본다(쓰기 액션은 넣지 않는다)
const API_ACTIONS: { label: string; desc: string; fn: () => Promise<unknown> }[] = [
  { label: 'fetchMenuItems(진행 팝업)', desc: 'POS 메뉴 — 활성 메뉴 중 그 팝업에서 끈 메뉴(popup_menu_hidden) 제외', fn: async () => fetchMenuItems(await currentPopupId()) },
  { label: 'getAllMenu', desc: '전체 메뉴 — 비활성 포함(설정 › 메뉴)', fn: getAllMenu },
  { label: 'fetchPopupMenuHidden', desc: '팝업별로 끈 메뉴 목록', fn: fetchPopupMenuHidden },
  { label: 'fetchPopupEvents', desc: '팝업 목록 — 기간·활성·수수료(fee_percent)', fn: fetchPopupEvents },
  { label: 'fetchTodaysSales', desc: 'POS 오늘 합계 — 결제 번호에 쓰는 원본(정정 미반영)', fn: () => fetchTodaysSales() },
  { label: 'fetchTodaysSalesForStats', desc: '통계 오늘 합계 — 수기 정정 반영(get_day_sales)', fn: fetchTodaysSalesForStats },
  { label: 'fetchTodaysSalesByPopupForStats', desc: '통계 오늘 팝업별 시간대 매출', fn: fetchTodaysSalesByPopupForStats },
  { label: 'fetchHourlySalesByPopup(어제)', desc: '어제 팝업별 시간대 매출 — 어제·지난주·지난 팝업 비교 원본', fn: () => { const d = new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10); const b = kstDayISO(d); return fetchHourlySalesByPopup(b.start, b.end); } },
  { label: 'fetchTodaysOrdersWithItems(5)', desc: '최근 주문 5건 + 품목(1000건 나눠 읽기)', fn: () => fetchTodaysOrdersWithItems(5) },
  { label: 'fetchMonthlySalesCalendar', desc: '이번 달 달력 — 날짜·팝업별 매출(정정 반영)', fn: () => { const n = new Date(); return fetchMonthlySalesCalendar(n.getFullYear(), n.getMonth() + 1); } },
  { label: 'fetchPopupDailySales(진행 팝업)', desc: '팝업 일별 매출 — 팝업 정정 > 날짜 정정 > POS', fn: async () => { const id = await currentPopupId(); return id ? fetchPopupDailySales(id) : '팝업 없음'; } },
  { label: 'fetchPopupDayDetail(진행 팝업, 오늘)', desc: '하루 상세 창 — 합계·시간대·메뉴', fn: async () => { const id = await currentPopupId(); return id ? fetchPopupDayDetail(id, kstToday()) : '팝업 없음'; } },
  { label: 'fetchLifetimeSalesTotals', desc: '누적 총매출 — 집계 테이블(sales_daily) 기반', fn: fetchLifetimeSalesTotals },
];

/** Postgres 정식 타입명은 길어서 표에서 줄바꿈을 유발한다 — 통용되는 축약형으로 보여준다 */
const TYPE_ALIASES: Record<string, string> = {
  'character varying': 'varchar',
  'timestamp without time zone': 'timestamp',
  'timestamp with time zone': 'timestamptz',
  'double precision': 'float8',
  boolean: 'bool',
  integer: 'int4',
  bigint: 'int8',
  smallint: 'int2',
};

const shortType = (t: string) => TYPE_ALIASES[t] ?? t;

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function DevToolsSection() {
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [schema, setSchema] = useState<SchemaTable[] | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [schemaMs, setSchemaMs] = useState<number | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [openTables, setOpenTables] = useState<Set<string>>(new Set());
  const [tableQuery, setTableQuery] = useState('');

  const loadSchema = useCallback(async () => {
    setSchemaLoading(true);
    setSchemaError(null);
    const t0 = performance.now();
    const res = await fetchDbSchema();
    setSchemaMs(Math.round(performance.now() - t0));
    if (res.success && res.data) setSchema(res.data);
    else setSchemaError(res.error ?? '스키마를 불러오지 못했습니다');
    setSchemaLoading(false);
  }, []);

  useEffect(() => { loadSchema(); }, [loadSchema]);

  const visibleTables = useMemo(() => {
    const q = tableQuery.trim().toLowerCase();
    if (!q) return schema ?? [];
    // 테이블명뿐 아니라 컬럼명으로도 찾는다 — "이 컬럼이 어느 표에 있더라"가 실제 사용 패턴이다
    return (schema ?? []).filter(t =>
      t.name.includes(q) || t.columns.some(c => c.name.toLowerCase().includes(q)));
  }, [schema, tableQuery]);

  const totals = useMemo(() => {
    if (!schema) return null;
    return {
      tables: schema.length,
      rows: schema.reduce((s, t) => s + t.rowCount, 0),
      noRls: schema.filter(t => !t.rls).length,
    };
  }, [schema]);

  const runApi = async (action: (typeof API_ACTIONS)[number]) => {
    const id = ++_logId;
    setLogs(p => [{ id, label: action.label, desc: action.desc, status: 'pending', ts: new Date() }, ...p]);
    const t0 = performance.now();
    try {
      const data = await action.fn();
      setLogs(p => p.map(l => (l.id === id ? { ...l, status: 'ok', ms: Math.round(performance.now() - t0), data } : l)));
    } catch (e) {
      setLogs(p => p.map(l => (l.id === id ? { ...l, status: 'err', ms: Math.round(performance.now() - t0), err: String(e) } : l)));
    }
  };

  const toggle = <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, key: T) =>
    setter(p => {
      const next = new Set(p);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  return (
    <div className="space-y-4">

      {/* ── 환경 ── */}
      <Panel eyebrow="environment" title="환경">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="최신 배포">
            <span className="font-mono text-[13px] font-bold text-ink">{formatBuildTime(process.env.NEXT_PUBLIC_BUILD_TIME)}</span>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {process.env.NEXT_PUBLIC_APP_VERSION && <Tag tone="ok">v{process.env.NEXT_PUBLIC_APP_VERSION}</Tag>}
              {process.env.NEXT_PUBLIC_GIT_SHA && (
                <Tag tone="info">
                  <CopyText value={process.env.NEXT_PUBLIC_GIT_SHA} label="커밋 해시">
                    {process.env.NEXT_PUBLIC_GIT_SHA.slice(0, 7)}
                  </CopyText>
                </Tag>
              )}
              <Tag tone={process.env.NODE_ENV === 'production' ? 'ok' : 'warn'}>{process.env.NODE_ENV}</Tag>
            </div>
          </Field>
          <Field label="Supabase 프로젝트">
            <EnvValue value={process.env.NEXT_PUBLIC_SUPABASE_URL} />
          </Field>
          <Field label="런타임">
            <div className="flex flex-wrap gap-1">
              {process.env.NEXT_PUBLIC_NEXT_VERSION && <Tag tone="info">Next.js {process.env.NEXT_PUBLIC_NEXT_VERSION}</Tag>}
              <Tag tone="info">React 19</Tag>
              <Tag tone="info">Supabase</Tag>
            </div>
          </Field>
          <Field label="꺼 둔 기능 (lib/features.ts)">
            <div className="flex flex-wrap gap-1">
              {(Object.keys(FEATURES) as (keyof typeof FEATURES)[]).filter(k => !FEATURES[k]).map(k => (
                <Tag key={k} tone="warn">{DISABLED_FEATURE_LABELS[k]}</Tag>
              ))}
              {(Object.keys(FEATURES) as (keyof typeof FEATURES)[]).every(k => FEATURES[k]) && <Tag tone="ok">없음</Tag>}
            </div>
          </Field>
        </div>
      </Panel>

      {/* ── 서버 액션 점검 ── */}
      <Panel
        eyebrow="server actions"
        title="서버 액션 점검"
        action={logs.length > 0 && (
          <TextButton onClick={() => { setLogs([]); setExpanded(new Set()); }}>로그 지우기</TextButton>
        )}
      >
        <div className="grid gap-1.5 md:grid-cols-2">
          {API_ACTIONS.map(action => (
            <button
              key={action.label}
              onClick={() => runApi(action)}
              className="flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl border border-hairline bg-canvas cursor-pointer text-left transition-colors hover:border-primary-200 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-primary-700"
            >
              <span className="font-mono text-[12px] font-bold text-primary-700">{action.label}</span>
              <span className="text-[11px] text-ink-muted leading-snug">{action.desc}</span>
            </button>
          ))}
        </div>

        {logs.length > 0 && (
          <ul className="m-0 mt-3 p-0 list-none space-y-1.5">
            {logs.map(log => (
              <li key={log.id} className="border border-hairline rounded-xl overflow-hidden bg-canvas">
                <button
                  onClick={() => toggle(setExpanded, log.id)}
                  aria-expanded={expanded.has(log.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 border-none bg-transparent cursor-pointer text-left hover:bg-canvas-soft transition-colors"
                >
                  <StatusDot status={log.status} />
                  <span className="font-mono text-[12px] font-semibold text-ink-secondary flex-1 min-w-0 truncate">{log.label}</span>
                  {log.ms !== undefined && (
                    <span className={`text-[11px] shrink-0 font-bold tabular-nums ${log.ms < 300 ? 'text-emerald-600' : log.ms < 1000 ? 'text-amber-600' : 'text-rose-500'}`}>
                      {log.ms}ms
                    </span>
                  )}
                  <span className="text-[11px] text-ink-faint shrink-0 tabular-nums hidden sm:inline">{log.ts.toLocaleTimeString('ko-KR')}</span>
                  <span className="text-[10px] text-ink-faint shrink-0">{expanded.has(log.id) ? '▲' : '▼'}</span>
                </button>
                {expanded.has(log.id) && (
                  <pre className="m-0 p-3 text-[11px] leading-relaxed bg-ink text-[#e8e6e3] overflow-auto max-h-[320px] select-text">
                    {log.status === 'err' ? log.err : JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ── 데이터베이스 ── */}
      <Panel
        eyebrow="database"
        title="데이터베이스"
        subtitle="실제 DB 카탈로그를 읽어옵니다 — 표가 추가되면 여기에도 바로 나타납니다"
        action={
          <TextButton onClick={loadSchema} disabled={schemaLoading}>
            {schemaLoading ? '읽는 중…' : '다시 읽기'}
          </TextButton>
        }
      >
        {schemaError ? (
          <p className="m-0 px-3 py-6 text-center text-[13px] text-rose-500 border border-dashed border-rose-200 rounded-xl bg-rose-50">
            {schemaError}
          </p>
        ) : !schema ? (
          <p className="m-0 px-3 py-6 text-center text-[13px] text-ink-faint">스키마를 읽는 중…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[12px] text-ink-muted">
              <span>표 <b className="text-ink tabular-nums">{totals!.tables}</b></span>
              <span>전체 행 <b className="text-ink tabular-nums">{totals!.rows.toLocaleString('ko-KR')}</b></span>
              <span>
                RLS 미적용{' '}
                <b className={`tabular-nums ${totals!.noRls > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{totals!.noRls}</b>
              </span>
              {schemaMs !== null && <span className="text-ink-faint tabular-nums ml-auto">{schemaMs}ms</span>}
            </div>

            <input
              type="text" value={tableQuery} onChange={e => setTableQuery(e.target.value)}
              placeholder="표·컬럼 이름으로 찾기"
              className="w-full mb-2 px-3 py-1.5 border border-hairline rounded-xl text-[12px] bg-canvas focus:outline-none focus:border-primary-700"
            />

            {visibleTables.length === 0 ? (
              <p className="m-0 px-3 py-6 text-center text-[13px] text-ink-faint">일치하는 표가 없습니다.</p>
            ) : (
              <ul className="m-0 p-0 list-none space-y-1">
                {visibleTables.map(t => {
                  const q = tableQuery.trim().toLowerCase();
                  const matchedColumn = q !== '' && !t.name.includes(q) && t.columns.some(c => c.name.toLowerCase().includes(q));
                  const open = openTables.has(t.name) || matchedColumn;
                  return (
                    <li key={t.name} className="border border-hairline rounded-xl overflow-hidden bg-canvas">
                      <button
                        onClick={() => toggle(setOpenTables, t.name)}
                        aria-expanded={open}
                        className="w-full flex items-center gap-2 px-3 py-2 border-none bg-transparent cursor-pointer text-left hover:bg-canvas-soft transition-colors"
                      >
                        <span className="font-mono text-[13px] font-bold text-ink flex-1 min-w-0 truncate">{t.name}</span>
                        <span className="text-[11px] text-ink-muted tabular-nums shrink-0">
                          {t.rowCount.toLocaleString('ko-KR')}행
                        </span>
                        <span className="text-[10px] text-ink-faint tabular-nums shrink-0 hidden sm:inline">{t.columns.length}열</span>
                        <span
                          title={t.rls ? 'Row Level Security 적용됨' : 'RLS가 꺼져 있습니다'}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                            t.rls ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          RLS {t.rls ? 'ON' : 'OFF'}
                        </span>
                        <span className="text-[10px] text-ink-faint shrink-0">{open ? '▲' : '▼'}</span>
                      </button>

                      {open && (
                        <div className="border-t border-hairline overflow-x-auto">
                          <table className="w-full border-collapse text-[11px] select-text">
                            <tbody>
                              {t.columns.map(c => {
                                const isPk = t.primaryKey.includes(c.name);
                                const fk = t.foreignKeys.find(f => f.column === c.name);
                                const hit = matchedColumn && c.name.toLowerCase().includes(q);
                                return (
                                  <tr key={c.name} className={`border-b border-hairline last:border-b-0 ${hit ? 'bg-primary-50' : ''}`}>
                                    <td className="px-3 py-1.5 font-mono font-semibold text-ink whitespace-nowrap">
                                      <CopyText value={c.name} label="컬럼명">{c.name}</CopyText>
                                    </td>
                                    <td className="px-2 py-1.5 font-mono text-ink-muted whitespace-nowrap">{shortType(c.type)}</td>
                                    <td className="px-2 py-1.5 text-ink-faint whitespace-nowrap">
                                      {!c.nullable && <span className="text-[10px]">필수</span>}
                                    </td>
                                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                                      {isPk && <Tag tone="key">PK</Tag>}
                                      {fk && (
                                        <span className="ml-1 font-mono text-[10px] text-primary-700">
                                          → {fk.refTable}.{fk.refColumn}
                                        </span>
                                      )}
                                      {c.hasDefault && !isPk && !fk && <span className="text-[10px] text-ink-faint">기본값</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────────────────────

/** 설정 화면 공통 표면 — 앱의 다른 화면(인사·급여)과 같은 카드 스타일을 쓴다 */
function Panel({ eyebrow, title, subtitle, action, children }: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-canvas rounded-2xl border border-hairline shadow-level-1 overflow-hidden">
      <header className="flex items-start gap-3 px-4 py-3 border-b border-hairline bg-canvas-soft">
        <div className="min-w-0 flex-1">
          <p className="m-0 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">{eyebrow}</p>
          <h3 className="m-0 text-[15px] font-bold text-ink leading-tight">{title}</h3>
          {subtitle && <p className="m-0 mt-0.5 text-[11px] text-ink-muted">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0 pt-1">{action}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-hairline bg-canvas-soft px-3 py-2.5">
      <p className="m-0 mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      {children}
    </div>
  );
}

function Tag({ tone, children }: { tone: 'ok' | 'warn' | 'info' | 'key'; children: React.ReactNode }) {
  const tones = {
    ok: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
    info: 'bg-primary-50 text-primary-700',
    key: 'bg-gold-soft text-gold',
  };
  return <span className={`inline-block font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md ${tones[tone]}`}>{children}</span>;
}

function TextButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2.5 py-1 rounded-lg border border-hairline bg-canvas text-[11px] font-semibold text-ink-muted cursor-pointer hover:bg-canvas-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function StatusDot({ status }: { status: 'pending' | 'ok' | 'err' }) {
  const cls = status === 'pending' ? 'bg-amber-400 animate-pulse' : status === 'ok' ? 'bg-emerald-500' : 'bg-rose-500';
  return <span className={`w-2 h-2 rounded-full shrink-0 ${cls}`} />;
}

const BUILD_TIME_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatBuildTime(value: string | undefined): string {
  if (!value) return '미설정';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '미설정';
  return `${BUILD_TIME_FORMATTER.format(d)} KST`;
}

function EnvValue({ value }: { value: string | undefined }) {
  if (!value) {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[12px] font-semibold text-rose-500">
        <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />미설정
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
      <span className="font-mono text-[12px] text-ink-muted truncate">
        <CopyText value={value} label="Supabase URL">{value}</CopyText>
      </span>
    </span>
  );
}
