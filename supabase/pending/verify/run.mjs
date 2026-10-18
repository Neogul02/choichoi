// supabase/pending 마이그레이션을 원격 스키마 스냅샷(PGlite) 위에서 적용·검증·롤백한다.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { paidMinutes } from '../../../lib/workhours.ts'

const P = new URL('../', import.meta.url).pathname
const read = f => readFileSync(f.startsWith('/') ? f : P + f, 'utf8')
const db = new PGlite()
let failures = 0
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++ }
const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async sql => (await q(sql))[0]
const tx = async sql => db.exec(`begin;\n${sql}\ncommit;`)   // apply_migration은 트랜잭션으로 감싼다

await db.exec(`set timezone = 'UTC';`)   // Supabase 세션 기본값과 같게
await db.exec(read(new URL('./schema.sql', import.meta.url).pathname))

// 스키마 지문 — 롤백 후 원래대로 돌아왔는지 비교
const fingerprint = async () => JSON.stringify(await q(`
  select 'col' k, table_schema||'.'||table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') v
    from information_schema.columns where table_schema in ('public','ops_backup')
  union all select 'idx', schemaname||'.'||indexname from pg_indexes where schemaname='public'
  union all select 'fn', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'||md5(p.prosrc)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  union all select 'trg', tgname from pg_trigger where not tgisinternal
  union all select 'con', conname from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'
  order by 1, 2`))
const fp0 = await fingerprint()

// ── 시드: 경계 케이스 위주 ─────────────────────────────────────────────────────
await db.exec(`
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into user_profiles (id, name, worker_role) values
 ('00000000-0000-0000-0000-000000000001','관리자','admin'),('00000000-0000-0000-0000-000000000002','주방','kiosk'),('00000000-0000-0000-0000-000000000003','직원','worker');
insert into popup_events (id, name, start_date, end_date) values (1,'홍대','2026-09-01','2026-10-31'),(2,'분당','2026-10-09','2026-10-20');
insert into menu_items (id, name, price) values (1,'망고산도',9000),(2,'후르츠산도',9000),(3,'아이스팩',500),(4,'할인',-1000);
-- 주문: 팝업 1·2·NULL, KST 자정 경계(UTC 14:59 = KST 23:59 / UTC 15:00 = 다음날 00:00), 할인(음수) 품목
insert into orders (id, total_price, created_at, popup_id) values
 (1, 18000, '2026-10-09 01:00', 1), (2, 9500, '2026-10-09 14:59', 1), (3, 9000, '2026-10-09 15:00', 1),
 (4, 8000, '2026-10-10 03:00', 2), (5, 500, '2026-10-10 04:00', null), (6, 9000, '2026-10-10 05:00', 2),
 (7, 0, '2026-10-11 05:00', 1);   -- 품목 없는 유령 주문도 원본 집계처럼 1건으로 센다
insert into order_items (order_id, menu_item_id, quantity, unit_price, subtotal) values
 (1,1,1,9000,9000),(1,2,1,9000,9000),(2,1,1,9000,9000),(2,3,1,500,500),(3,2,1,9000,9000),
 (4,1,1,9000,9000),(4,4,1,-1000,-1000),(5,3,1,500,500),(6,2,1,9000,9000);
select setval('orders_id_seq', 200); select setval('order_items_id_seq', 200); select setval('menu_items_id_seq', 10);
-- 수동 정정: 날짜 전체(daily_sales), 팝업 하루(popup_daily_sales), 메뉴 수기
insert into daily_sales (sale_date, total_orders, total_revenue) values ('2026-09-05', 40, 400000);
insert into popup_daily_sales (popup_id, sale_date, total_revenue, total_orders) values (2, '2026-10-10', 50000, 5);
insert into manual_menu_sales (popup_id, menu_item_id, quantity) values (2, 1, 30);
insert into manual_daily_menu_sales (popup_id, sale_date, menu_item_id, quantity) values (1, '2026-10-09', 2, 7);
-- 근무: 휴게 규칙 경계(배정 NULL/0/30, 파트 0=미설정/45), 자정 넘김, 같은 시각=24시간, 시작·종료 NULL→파트 폴백
insert into staff_profiles (id, name, hourly_rate, status) overriding system value values (1,'가',10030,'confirmed'),(2,'나',11000,'confirmed');
insert into roster_shifts (id, staff_role, name, start_time, end_time, break_minutes) overriding system value values
 (1,'kitchen','오전','09:00','18:00',0),(2,'kitchen','야간','22:00','06:00',45);
insert into roster_assignments (work_date, staff_id, start_time, end_time, staff_role, shift_id, break_minutes) values
 ('2026-10-09',1,'09:00','18:00','kitchen',1,null),
 ('2026-10-10',1,'09:00','18:00','kitchen',1,0),
 ('2026-10-11',1,'10:00','15:30','kitchen',1,30),
 ('2026-10-09',2,'22:00','06:00','kitchen',2,null),
 ('2026-10-10',2,'09:00','09:00','kitchen',2,null),
 ('2026-11-01',2,null,null,'kitchen',2,null);
insert into attendance_records (staff_id, work_date, clock_in_at, status) values (1,'2026-10-09','2026-10-09 00:00+00','open');
insert into payroll_payments (period_key, staff_id, paid_by) values ('2026-10',1,'00000000-0000-0000-0000-000000000001');
insert into payroll_adjustments (period_key, staff_id, label, amount) values ('2026-10',1,'원천징수',-3300);
`)

const lifetimeV1 = async () => one(`select * from get_lifetime_sales_totals()`)
const before = await lifetimeV1()
console.log('lifetime v1 (seed):', before)

// ── 01 ─────────────────────────────────────────────────────────────────────
await tx(read('01_fk_indexes.sql'))
ok((await q(`select 1 from pg_indexes where indexname in ('attendance_records_assignment_staff_idx','payroll_payments_paid_by_idx')`)).length === 2, '01 인덱스 2개 생성')

// ── 02 ─────────────────────────────────────────────────────────────────────
await tx(read('02_sales_rollups.sql'))
let v = await one(read('02_verify.sql'))
ok(Number(v.sales_daily_mismatch) === 0 && Number(v.menu_sales_daily_mismatch) === 0, `02 백필 직후 원본과 일치 ${JSON.stringify(v)}`)
const sd = await q(`select sale_date::text, popup_key, revenue::text, orders::text from sales_daily order by 1,2`)
ok(sd.some(r => r.sale_date === '2026-10-09' && r.popup_key == 1 && r.revenue === '27500' && r.orders === '2')
   && sd.some(r => r.sale_date === '2026-10-10' && r.popup_key == 1 && r.orders === '1'),
   'KST 자정 경계: UTC 14:59는 10-09, 15:00은 10-10로 집계')
ok(sd.some(r => r.popup_key == -1), 'popup_id NULL 주문은 popup_key -1')

// ── 03 v2 ──────────────────────────────────────────────────────────────────
await tx(read('03_lifetime_from_rollups.sql'))
const diff = async () => Number((await one(`select count(*) c from (
  (select * from get_lifetime_sales_totals() except select * from get_lifetime_sales_totals_v2())
  union all (select * from get_lifetime_sales_totals_v2() except select * from get_lifetime_sales_totals())) d`)).c)
ok(await diff() === 0, '03 v1과 v2 결과 동일(백필 직후)')

// ── 트리거: 앱의 실제 쓰기 경로 + 그 밖의 변경 ──────────────────────────────────
// 결제(saveOrder): orders insert → order_items insert
await db.exec(`insert into orders (id, total_price, created_at, popup_id) values (101, 9500, '2026-10-12 02:00', 1);
  insert into order_items (order_id, menu_item_id, quantity, unit_price, subtotal) values (101,1,1,9000,9000),(101,3,1,500,500);`)
// 주문 삭제(removeOrder): order_items 먼저, 그다음 orders
await db.exec(`delete from order_items where order_id = 6; delete from orders where id = 6;`)
// 저장 실패 정리: orders delete → order_items cascade
await db.exec(`delete from orders where id = 4;`)
// 갱신: 날짜·팝업·금액 이동, 품목 수량 변경, 품목의 주문 이동
await db.exec(`update orders set created_at = '2026-10-13 02:00', popup_id = 2 where id = 1;
  update orders set total_price = 9900 where id = 2;
  update order_items set quantity = 3, subtotal = 27000 where order_id = 3;
  update order_items set order_id = 2 where order_id = 5;
  update orders set is_prepared = true where id = 3;`)
// 같은 (날짜, 팝업)의 마지막 주문 삭제 → 행이 사라져야 day_count가 원본과 같다
await db.exec(`delete from order_items where order_id = 7; delete from orders where id = 7;`)
v = await one(read('02_verify.sql'))
ok(Number(v.sales_daily_mismatch) === 0 && Number(v.menu_sales_daily_mismatch) === 0, `트리거 후 원본과 일치 ${JSON.stringify(v)}`)
ok(await diff() === 0, '트리거 후 v1과 v2 결과 동일')
ok((await q(`select 1 from sales_daily where orders <= 0`)).length === 0, '주문 0건 행 없음')

// 동시 결제 흉내: 같은 (날짜, 팝업)에 연속 upsert
for (let i = 0; i < 30; i++) await db.exec(`insert into orders (total_price, created_at, popup_id) values (1000, '2026-10-14 03:00', 2);`)
v = await one(read('02_verify.sql'))
ok(Number(v.sales_daily_mismatch) === 0, '연속 결제 30건 후 일치')

const afterMut = await one(`select * from get_lifetime_sales_totals_v2()`)
const v1Now = await lifetimeV1()

// ── 03b 교체 ───────────────────────────────────────────────────────────────
await tx(read('03b_swap_lifetime.sql'))
const swapped = await lifetimeV1()
ok(JSON.stringify(swapped) === JSON.stringify(v1Now) && JSON.stringify(swapped) === JSON.stringify(afterMut), '03b 교체 후 결과가 교체 전 v1과 동일')
ok((await q(`select 1 from pg_proc where proname = 'get_lifetime_sales_totals_v2'`)).length === 0, '03b 후 v2 함수 정리됨')

// ── 급여 기준선 + 04 ────────────────────────────────────────────────────────
const base = await db.exec(read('payroll_baseline_before.sql'))
const baseRow = base.at(-1).rows[0]
console.log('payroll baseline:', baseRow)

// SQL 유급 분이 lib/workhours.ts paidMinutes와 같은지 — 기준선 SQL이 실제 급여 규칙을 재고 있는지 확인
const raw = await q(`select ra.staff_id, to_char(ra.work_date,'YYYY-MM') ym, coalesce(ra.start_time, rs.start_time) st, coalesce(ra.end_time, rs.end_time) et,
  ra.break_minutes ab, rs.break_minutes sb from roster_assignments ra left join roster_shifts rs on rs.id = ra.shift_id`)
const js = {}
for (const r of raw) { const k = `${r.staff_id}|${r.ym}`; js[k] = (js[k] ?? 0) + paidMinutes(r.st, r.et, r.ab, r.sb) }
const sqlRows = await q(`select staff_id, ym, paid_minutes from ops_backup.payroll_baseline_minutes`)
const sqlMap = Object.fromEntries(sqlRows.map(r => [`${r.staff_id}|${r.ym}`, Number(r.paid_minutes)]))
ok(JSON.stringify(Object.entries(js).sort()) === JSON.stringify(Object.entries(sqlMap).sort()), `기준선 SQL 유급 분 = workhours.paidMinutes ${JSON.stringify(sqlMap)}`)

await tx(read('04_organizations_expand.sql'))
const cmp = (await db.exec(read('payroll_baseline_compare.sql'))).at(-1).rows[0]
ok(Number(cmp.minute_mismatch) === 0 && Number(cmp.raw_row_mismatch) === 0 && Number(cmp.total_paid_minutes_delta) === 0, `04 후 급여 기준선 불일치 0 ${JSON.stringify(cmp)}`)
ok(Number((await one(`select count(*) c from org_members`)).c) === 3, 'org_members 백필 3명')
ok((await one(`select role from org_members where user_id = '00000000-0000-0000-0000-000000000002'`)).role === 'kiosk', 'kiosk 역할 유지')
// 지금 코드처럼 org_id 없이 insert해도 동작(기본값 1)
await db.exec(`insert into orders (total_price, created_at, popup_id) values (500, '2026-10-15 03:00', 1);`)
ok(Number((await one(`select org_id from orders order by id desc limit 1`)).org_id) === 1, 'org_id 없는 insert → 기본값 1')
ok(Number((await one(`select count(*) c from information_schema.columns where column_name='org_id' and table_schema='public' and table_name <> 'org_members'`)).c) === 28, '업무 테이블 28개에 org_id')
v = await one(read('02_verify.sql'))
ok(Number(v.sales_daily_mismatch) === 0, '04 후에도 집계 트리거 정상')

// 급여 기준선 정리(런북: 확인 후 drop)
await db.exec(`drop table ops_backup.payroll_baseline_minutes; drop table ops_backup.payroll_baseline_rows;`)
// 시드 이후 변경으로 불일치를 잡아내는지(음성 대조): 기준선을 다시 떠서 휴게 하나 바꾸면 불일치가 나와야 한다
await db.exec(read('payroll_baseline_before.sql'))
await db.exec(`update roster_assignments set break_minutes = 15 where work_date = '2026-10-11'`)
const neg = (await db.exec(read('payroll_baseline_compare.sql'))).at(-1).rows[0]
ok(Number(neg.minute_mismatch) > 0 && Number(neg.total_paid_minutes_delta) === 15, `음성 대조: 휴게 30→15분 변경을 잡아냄 ${JSON.stringify(neg)}`)
await db.exec(`update roster_assignments set break_minutes = 30 where work_date = '2026-10-11'; drop table ops_backup.payroll_baseline_minutes; drop table ops_backup.payroll_baseline_rows;`)

// ── 롤백(역순) ──────────────────────────────────────────────────────────────
await tx(read('04_rollback.sql'))
await tx(read('03_rollback.sql'))
await tx(read('02_rollback.sql'))
await tx(read('01_rollback.sql'))
await db.exec(`drop schema if exists ops_backup cascade;`)
const fp1 = await fingerprint()
ok(fp0 === fp1, '롤백 후 스키마 지문이 적용 전과 동일')
if (fp0 !== fp1) {
  const a = new Set(JSON.parse(fp0).map(r => r.k + ' ' + r.v)), b = new Set(JSON.parse(fp1).map(r => r.k + ' ' + r.v))
  console.log('only before:', [...a].filter(x => !b.has(x)), 'only after:', [...b].filter(x => !a.has(x)))
}
ok(JSON.stringify(await lifetimeV1()) !== 'undefined', '롤백 후 누적 합계 함수 동작')

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
