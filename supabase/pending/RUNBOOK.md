# DB 변경 런북 — 2026-10-17 20:30 KST 이후

영업 중에는 스키마를 바꾸지 않는다.

**적용 현황 (2026-10-18 22:32~22:36 KST):** 1~3단계 적용 완료 → `migrations/20261018133200_fk_indexes`,
`20261018133259_sales_rollups`, `20261018133433_lifetime_totals_v2`, `20261018133520_lifetime_totals_from_rollups`.
백필·스모크 불일치 0, v1↔v2 차집합 0행, 누적 합계 0단계와 동일, 실행 36.8ms → 6.0ms. **4단계는 미적용.**
남은 일: 다음 영업일 마감 후 `02_verify.sql` 재실행, Auth 유출 비밀번호 차단 켜기.
적용한 파일만 `supabase/migrations/<원격 version>_<이름>.sql`로 옮긴다(파일명 = 원격 version, CLAUDE.md).

## 무엇이 바뀌나

| 단계 | 파일 | 바뀌는 것 | 앱 코드 배포 필요 |
| --- | --- | --- | --- |
| 1 | `01_fk_indexes.sql` | 외래키 인덱스 2개 | 없음 |
| 2 | `02_sales_rollups.sql` | 일별 집계 테이블 2개 + 주문 트리거 + 백필 | 없음 |
| 3 | `03_lifetime_from_rollups.sql` → `03b_swap_lifetime.sql` | 누적 합계 RPC가 집계 테이블을 읽음(276ms → 수 ms 목표) | 없음 (함수 이름 동일) |
| 4 | `04_organizations_expand.sql` | 사업장·구성원 테이블, 업무 테이블 28개에 `org_id DEFAULT 1` | 없음 (기본값) |

4는 서비스화 준비(expand)다. 지금 매장 운영에 주는 이득은 없으므로 3까지만 하고 4는 미뤄도 된다.

## 사전 검증 (2026-10-17 오후, 원격에 쓰기 없이)

- 원격 public 스키마를 카탈로그 조회로 떠 PGlite(Postgres 17 WASM)에 올리고 1→2→3→3b→4 적용, 역순 롤백까지
  21개 검사 통과. 실행기 `verify/run.mjs`(스냅샷 `verify/schema.sql`, 결과 `verify/run.log`).
  다시 돌리려면: 아무 빈 폴더에서 `npm i @electric-sql/pglite` 후 그 `node_modules`가 보이는 위치에서 `node verify/run.mjs`.
  - 이 검증에서 **2의 품목 트리거가 INSERT마다 오류를 내는 버그**(할당 안 된 레코드 필드 참조)를 잡아 고쳤다.
    고치기 전 SQL을 그대로 적용했다면 결제의 품목 저장이 전부 실패했다.
  - KST 자정 경계, popup_id NULL, 할인(음수) 품목, 품목 없는 주문, 결제·주문삭제·cascade 삭제·날짜/팝업/금액
    변경·품목 이동, 연속 결제 30건 후 원본 재집계와 행 단위 일치.
  - 롤백 후 스키마 지문(컬럼·인덱스·함수 본문 해시·트리거·제약)이 적용 전과 동일.
- 원격 실데이터(읽기 전용 SELECT):
  - 3의 v2 로직을 집계 테이블 대신 같은 백필 쿼리로 돌려 v1과 비교 → 불일치 0행
    (₩634,146,000 · 40,091건 · 144일 · 산도 60,864개).
  - 급여 기준선 SQL의 유급 분 = `lib/workhours.ts paidMinutes` (배정 571행, 직원·월 58칸, 합계 231,819분, 차이 0).
  - 시간 형식 이상 0, 시작·종료 NULL 0, auth 없는 프로필 0, 고아 품목 0.

## 시작 조건

- [ ] 20:30 이후, **모든 팝업 POS 결제가 끝났다**(2단계 백필 중 주문이 들어오면 잠금 대기로 결제가 멈춘다).
- [ ] 주방 출근부에서 퇴근 처리가 끝났다(4단계 급여 원자료 비교 중 퇴근을 찍으면 불일치로 보인다).
- [ ] `git status`로 `supabase/pending/`이 최신인지 확인.

## 0단계 — 기준값 기록

```sql
select now(), (select count(*) from orders) as orders, (select count(*) from order_items) as items;
select * from get_lifetime_sales_totals();   -- 결과를 적어 둔다(3단계 비교용)
```

## 1단계 — 인덱스

1. MCP `apply_migration` name=`fk_indexes`, 본문 = `01_fk_indexes.sql`.
2. `list_migrations`로 기록된 version 확인 → `supabase/migrations/<version>_fk_indexes.sql`로 복사.

## 2단계 — 일별 집계

1. `apply_migration` name=`sales_rollups`, 본문 = `02_sales_rollups.sql`(한 트랜잭션 — 실패하면 전부 취소된다).
2. `02_verify.sql` → `sales_daily_mismatch = 0`, `menu_sales_daily_mismatch = 0`.
3. 트리거 스모크 테스트(되돌리는 트랜잭션 — 실제 데이터는 남지 않는다. 주문 id 시퀀스만 1 증가):
   ```sql
   begin;
   insert into orders (total_price, payment_method, payment_status, popup_id) values (9000, 'cash', 'completed', null) returning id;
   insert into order_items (order_id, menu_item_id, quantity, unit_price, subtotal)
     select currval('orders_id_seq'), (select id from menu_items order by id limit 1), 1, 9000, 9000;
   -- 아래 두 값이 0이어야 한다
   with src as (select (created_at + interval '9 hours')::date d, coalesce(popup_id,-1) k, sum(total_price) r, count(*) c from orders group by 1,2)
   select count(*) from ((select * from src except select sale_date, popup_key, revenue, orders from sales_daily)
                         union all (select sale_date, popup_key, revenue, orders from sales_daily except select * from src)) x;
   rollback;
   ```
4. version 확인 후 `supabase/migrations/<version>_sales_rollups.sql`로 복사.

중단 기준: 2-2 또는 2-3에서 0이 아니면 `02_rollback.sql` 실행 후 중단.

## 3단계 — 누적 합계를 집계에서

1. `apply_migration` name=`lifetime_totals_v2`, 본문 = `03_lifetime_from_rollups.sql`.
2. 비교(두 쿼리 모두 0행):
   ```sql
   select * from get_lifetime_sales_totals() except select * from get_lifetime_sales_totals_v2();
   select * from get_lifetime_sales_totals_v2() except select * from get_lifetime_sales_totals();
   ```
3. `apply_migration` name=`lifetime_totals_from_rollups`, 본문 = `03b_swap_lifetime.sql`.
4. `select * from get_lifetime_sales_totals();` 가 0단계 기록과 같고,
   `explain analyze select * from get_lifetime_sales_totals();` 실행 시간이 0단계보다 짧은지 확인.
5. 두 version 모두 파일로 복사.

중단 기준: 3-2에서 1행이라도 나오면 v2를 지우고(`drop function get_lifetime_sales_totals_v2()`) 중단 — v1은 그대로다.

## 4단계 — 사업장 expand (선택)

1. `execute_sql`로 `payroll_baseline_before.sql` 실행 → 결과(행 수·총 유급 분)를 기록.
2. `apply_migration` name=`organizations_expand`, 본문 = `04_organizations_expand.sql`.
3. `payroll_baseline_compare.sql` → `minute_mismatch = 0`, `raw_row_mismatch = 0`, `total_paid_minutes_delta = 0`.
   - `payroll_payments`에 정산 완료로 찍힌 달의 값이 바뀌었다면 실제 돈 차이다 — 즉시 `04_rollback.sql`.
4. 0을 확인한 뒤 기준선 삭제: `drop table ops_backup.payroll_baseline_minutes; drop table ops_backup.payroll_baseline_rows;`
5. `select count(*) from org_members;` 가 `user_profiles` 행 수와 같은지 확인. version 확인 후 파일 복사.

## 마무리

- [ ] `get_advisors`(performance·security) 다시 확인 — unindexed_foreign_keys 2건이 사라져야 한다.
- [ ] 다음 영업일 마감 후 `02_verify.sql` 한 번 더(실제 결제·삭제가 트리거를 거친 뒤에도 0인지).
- [ ] Supabase 대시보드 Auth → 유출 비밀번호 차단(HaveIBeenPwned) 켜기 — SQL이 아니라 설정이다.

## 되돌리기

역순으로만: `04_rollback.sql` → `03_rollback.sql` → `02_rollback.sql` → `01_rollback.sql`.
되돌린 단계의 `supabase/migrations/` 파일은 지우지 말고, 되돌리기 SQL을 새 마이그레이션으로 적용해 이력을 맞춘다
(원격 이력과 파일이 어긋나면 CLI가 멈춘다).

## 아직 하지 않는 것

- 4의 contract 단계: `DEFAULT 1` 제거, 유니크 키에 `org_id`(예: `daily_sales(sale_date)`, `pos_note id=1`), RLS 정책,
  JWT `org_id` 클레임, 직무 CHECK(`kitchen`/`cashier`) → 사업장별 직무 테이블. org_id를 쓰는 코드가 먼저 배포돼야 한다.
- `orders.created_at`을 `timestamptz`로 바꾸기 — 모든 매출 RPC가 `+ 9 hours`에 기대고 있어 함께 바꿔야 한다.
- `roster_assignments.shift_id` FK의 `on delete cascade` → `set null`(CLAUDE.md '아직 하면 안 되는 것').
