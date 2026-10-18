-- 원격(itepgkguufdjazlnojoi) public 스키마 스냅샷, 2026-10-17 17:5x KST, 카탈로그 읽기 전용 조회로 생성.
-- Supabase 기본 롤(마이그레이션의 revoke가 참조)
create role anon;
create role authenticated;
create schema auth;
create table auth.users (id uuid primary key);
create sequence public.daily_sales_id_seq;
create sequence public.memos_id_seq;
create sequence public.menu_items_id_seq;
create sequence public.order_items_id_seq;
create sequence public.orders_id_seq;
create sequence public.popup_events_id_seq;
create sequence public.restock_events_id_seq;
create table public.attendance_records (
  id bigint generated always as identity not null,
  staff_id bigint not null,
  work_date date not null,
  assignment_id bigint,
  clock_in_at timestamp with time zone not null,
  clock_out_at timestamp with time zone,
  break_minutes integer,
  planned_start_time text,
  planned_end_time text,
  planned_break_minutes integer,
  unscheduled boolean default false not null,
  status text default 'open'::text not null,
  voided_by uuid,
  voided_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);
create table public.contracts (
  id uuid default gen_random_uuid() not null,
  worker_id integer not null,
  popup_id integer,
  start_date date not null,
  end_date date,
  hourly_rate integer not null,
  work_schedule text,
  workplace text,
  pdf_url text,
  pdf_hash text,
  issued_at timestamp with time zone default now() not null,
  created_by uuid,
  created_at timestamp with time zone default now(),
  contract_data jsonb,
  worker_address text,
  worker_signed_at timestamp with time zone
);
create table public.daily_sales (
  id bigint default nextval('daily_sales_id_seq'::regclass) not null,
  sale_date date not null,
  total_orders integer default 0,
  total_revenue numeric default 0,
  created_at timestamp without time zone default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone default CURRENT_TIMESTAMP,
  note text
);
create table public.ingredients (
  id text not null,
  name text not null,
  category text not null,
  color text not null,
  unit_type text not null,
  base_unit text not null,
  vendor text,
  lead_days integer,
  unit_price integer,
  sort_order integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  total_count numeric default 0 not null,
  reorder_at numeric default 5 not null
);
create table public.manual_daily_menu_sales (
  id bigint generated always as identity not null,
  popup_id bigint not null,
  sale_date date not null,
  menu_item_id bigint not null,
  quantity integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.manual_hourly_sales (
  id bigint generated always as identity not null,
  popup_id bigint not null,
  hour smallint not null,
  total_revenue bigint default 0 not null,
  total_orders integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.manual_menu_sales (
  id bigint generated always as identity not null,
  popup_id bigint not null,
  menu_item_id bigint not null,
  quantity integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.memos (
  id bigint default nextval('memos_id_seq'::regclass) not null,
  title character varying,
  content text not null,
  color character varying default '#fff9c4'::character varying,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  is_pinned boolean default false not null,
  type text default 'note'::text not null
);
create table public.menu_items (
  id bigint default nextval('menu_items_id_seq'::regclass) not null,
  name character varying not null,
  price numeric not null,
  color character varying,
  stock integer default 999,
  is_active boolean default true,
  created_at timestamp without time zone default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone default CURRENT_TIMESTAMP,
  display_order integer,
  emoji text,
  image_url text,
  is_sold_out boolean default false not null
);
create table public.order_items (
  id bigint default nextval('order_items_id_seq'::regclass) not null,
  order_id bigint not null,
  menu_item_id bigint not null,
  quantity integer not null,
  unit_price numeric not null,
  subtotal numeric not null,
  created_at timestamp without time zone default CURRENT_TIMESTAMP
);
create table public.orders (
  id bigint default nextval('orders_id_seq'::regclass) not null,
  total_price numeric not null,
  payment_method character varying,
  payment_status character varying default 'pending'::character varying,
  created_at timestamp without time zone default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone default CURRENT_TIMESTAMP,
  cashier_name text,
  is_prepared boolean default false not null,
  popup_id bigint
);
create table public.payroll_adjustment_presets (
  id bigint generated always as identity not null,
  label text not null,
  amount integer not null,
  created_at timestamp with time zone default now() not null
);
create table public.payroll_adjustments (
  id bigint generated always as identity not null,
  period_key text not null,
  staff_id bigint not null,
  label text not null,
  amount integer not null,
  created_at timestamp with time zone default now() not null
);
create table public.payroll_payments (
  id bigint generated always as identity not null,
  period_key text not null,
  staff_id bigint not null,
  paid_at timestamp with time zone default now() not null,
  paid_by uuid
);
create table public.popup_closed_days (
  id bigint generated always as identity not null,
  popup_id bigint not null,
  closed_date date not null,
  reason text,
  created_at timestamp with time zone default now() not null
);
create table public.popup_daily_sales (
  id bigint generated always as identity not null,
  popup_id bigint not null,
  sale_date date not null,
  total_revenue bigint not null,
  total_orders integer default 0 not null,
  note text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.popup_events (
  id bigint default nextval('popup_events_id_seq'::regclass) not null,
  name character varying not null,
  start_date date not null,
  end_date date not null,
  created_at timestamp with time zone default now(),
  is_active boolean default true not null
);
create table public.pos_note (
  id smallint default 1 not null,
  content text default ''::text not null,
  updated_by text,
  updated_at timestamp with time zone default now() not null,
  ydoc text
);
create table public.restock_events (
  id bigint default nextval('restock_events_id_seq'::regclass) not null,
  ingredient_id text not null,
  note text,
  created_by text,
  created_at timestamp with time zone default now(),
  delta numeric default 0 not null
);
create table public.roster_assignments (
  id bigint generated always as identity not null,
  work_date date not null,
  staff_id bigint not null,
  start_time text,
  end_time text,
  created_at timestamp with time zone default now() not null,
  staff_role text default 'kitchen'::text not null,
  shift_id bigint not null,
  popup_id bigint,
  break_minutes integer
);
create table public.roster_shift_requirements (
  id bigint generated always as identity not null,
  work_date date not null,
  shift_id bigint not null,
  required integer not null
);
create table public.roster_shifts (
  id bigint generated always as identity not null,
  staff_role text not null,
  name text not null,
  start_time text default '09:00'::text not null,
  end_time text default '18:00'::text not null,
  weekday_required integer default 2 not null,
  weekend_required integer default 2 not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  active_from date,
  active_to date,
  break_minutes integer default 0 not null,
  popup_id bigint
);
create table public.staff_popup_assignments (
  id bigint generated always as identity not null,
  staff_id bigint not null,
  popup_id bigint not null,
  created_at timestamp with time zone default now() not null
);
create table public.staff_profiles (
  id bigint generated always as identity not null,
  name text not null,
  phone text,
  preferred_days integer[] default '{}'::integer[] not null,
  available_ranges jsonb default '[]'::jsonb not null,
  has_health_cert boolean default false not null,
  wants_insurance boolean default true not null,
  hourly_rate integer,
  status text default 'candidate'::text not null,
  notes text,
  user_profile_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  max_days_per_week integer,
  staff_role text default 'kitchen'::text not null,
  preferred_shift_ids bigint[] default '{}'::bigint[] not null,
  health_cert_url text,
  sort_order integer default 0,
  bank_name text,
  bank_account text,
  popup_id bigint
);
create table public.storage_object_items (
  id bigint generated always as identity not null,
  object_id uuid not null,
  ingredient_id text not null,
  created_at timestamp with time zone default now() not null
);
create table public.storage_objects (
  id uuid default gen_random_uuid() not null,
  name text not null,
  icon text default 'box'::text not null,
  pos_x numeric(5,2) default 50 not null,
  pos_y numeric(5,2) default 50 not null,
  sort_order integer default 0 not null,
  created_by text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.user_profiles (
  id uuid not null,
  name text not null,
  phone text,
  bank_name text,
  bank_account text,
  health_cert_url text,
  worker_role text default 'worker'::text not null,
  created_at timestamp with time zone default now(),
  total_revenue integer default 0 not null,
  resident_reg_no_enc text,
  resident_reg_no_masked text
);
alter table public.attendance_records add constraint attendance_records_pkey PRIMARY KEY (id);
alter table public.contracts add constraint contracts_pkey PRIMARY KEY (id);
alter table public.daily_sales add constraint daily_sales_pkey PRIMARY KEY (id);
alter table public.ingredients add constraint ingredients_pkey PRIMARY KEY (id);
alter table public.manual_daily_menu_sales add constraint manual_daily_menu_sales_pkey PRIMARY KEY (id);
alter table public.manual_hourly_sales add constraint manual_hourly_sales_pkey PRIMARY KEY (id);
alter table public.manual_menu_sales add constraint manual_menu_sales_pkey PRIMARY KEY (id);
alter table public.memos add constraint memos_pkey PRIMARY KEY (id);
alter table public.menu_items add constraint menu_items_pkey PRIMARY KEY (id);
alter table public.order_items add constraint order_items_pkey PRIMARY KEY (id);
alter table public.orders add constraint orders_pkey PRIMARY KEY (id);
alter table public.payroll_adjustment_presets add constraint payroll_adjustment_presets_pkey PRIMARY KEY (id);
alter table public.payroll_adjustments add constraint payroll_adjustments_pkey PRIMARY KEY (id);
alter table public.payroll_payments add constraint payroll_payments_pkey PRIMARY KEY (id);
alter table public.popup_closed_days add constraint popup_closed_days_pkey PRIMARY KEY (id);
alter table public.popup_daily_sales add constraint popup_daily_sales_pkey PRIMARY KEY (id);
alter table public.popup_events add constraint popup_events_pkey PRIMARY KEY (id);
alter table public.pos_note add constraint pos_note_pkey PRIMARY KEY (id);
alter table public.restock_events add constraint restock_events_pkey PRIMARY KEY (id);
alter table public.roster_assignments add constraint roster_assignments_pkey PRIMARY KEY (id);
alter table public.roster_shift_requirements add constraint roster_shift_requirements_pkey PRIMARY KEY (id);
alter table public.roster_shifts add constraint roster_shifts_pkey PRIMARY KEY (id);
alter table public.staff_popup_assignments add constraint staff_popup_assignments_pkey PRIMARY KEY (id);
alter table public.staff_profiles add constraint staff_profiles_pkey PRIMARY KEY (id);
alter table public.storage_object_items add constraint storage_object_items_pkey PRIMARY KEY (id);
alter table public.storage_objects add constraint storage_objects_pkey PRIMARY KEY (id);
alter table public.user_profiles add constraint user_profiles_pkey PRIMARY KEY (id);
alter table public.daily_sales add constraint daily_sales_sale_date_key UNIQUE (sale_date);
alter table public.manual_daily_menu_sales add constraint manual_daily_menu_sales_popup_id_sale_date_menu_item_id_key UNIQUE (popup_id, sale_date, menu_item_id);
alter table public.manual_hourly_sales add constraint manual_hourly_sales_popup_id_hour_key UNIQUE (popup_id, hour);
alter table public.manual_menu_sales add constraint manual_menu_sales_popup_id_menu_item_id_key UNIQUE (popup_id, menu_item_id);
alter table public.payroll_adjustment_presets add constraint payroll_adjustment_presets_label_amount_key UNIQUE (label, amount);
alter table public.payroll_payments add constraint payroll_payments_period_key_staff_id_key UNIQUE (period_key, staff_id);
alter table public.popup_closed_days add constraint popup_closed_days_popup_id_closed_date_key UNIQUE (popup_id, closed_date);
alter table public.popup_daily_sales add constraint popup_daily_sales_popup_id_sale_date_key UNIQUE (popup_id, sale_date);
alter table public.roster_assignments add constraint roster_assignments_unique UNIQUE (work_date, shift_id, staff_id);
alter table public.roster_assignments add constraint roster_assignments_id_staff_key UNIQUE (id, staff_id);
alter table public.roster_shift_requirements add constraint roster_shift_requirements_work_date_shift_id_key UNIQUE (work_date, shift_id);
alter table public.staff_popup_assignments add constraint staff_popup_assignments_unique UNIQUE (staff_id, popup_id);
alter table public.storage_object_items add constraint storage_object_items_object_id_ingredient_id_key UNIQUE (object_id, ingredient_id);
alter table public.attendance_records add constraint attendance_records_closed_has_out CHECK (((status <> 'closed'::text) OR (clock_out_at IS NOT NULL)));
alter table public.attendance_records add constraint attendance_records_clock_order CHECK (((clock_out_at IS NULL) OR ((clock_out_at > clock_in_at) AND (clock_out_at < (clock_in_at + '24:00:00'::interval)))));
alter table public.attendance_records add constraint attendance_records_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'voided'::text])));
alter table public.attendance_records add constraint attendance_records_break_range CHECK (((break_minutes IS NULL) OR ((break_minutes >= 0) AND (break_minutes <= 1440))));
alter table public.ingredients add constraint ingredients_unit_type_check CHECK ((unit_type = ANY (ARRAY['count'::text, 'weight'::text])));
alter table public.manual_daily_menu_sales add constraint manual_daily_menu_sales_quantity_check CHECK ((quantity >= 0));
alter table public.manual_hourly_sales add constraint manual_hourly_sales_total_orders_check CHECK ((total_orders >= 0));
alter table public.manual_hourly_sales add constraint manual_hourly_sales_total_revenue_check CHECK ((total_revenue >= 0));
alter table public.manual_hourly_sales add constraint manual_hourly_sales_hour_check CHECK (((hour >= 0) AND (hour <= 23)));
alter table public.manual_menu_sales add constraint manual_menu_sales_quantity_check CHECK ((quantity >= 0));
alter table public.memos add constraint memos_type_check CHECK ((type = ANY (ARRAY['note'::text, 'checklist'::text])));
alter table public.popup_daily_sales add constraint popup_daily_sales_total_orders_check CHECK ((total_orders >= 0));
alter table public.popup_daily_sales add constraint popup_daily_sales_total_revenue_check CHECK ((total_revenue >= 0));
alter table public.pos_note add constraint pos_note_id_check CHECK ((id = 1));
alter table public.roster_assignments add constraint roster_assignments_staff_role_check CHECK ((staff_role = ANY (ARRAY['kitchen'::text, 'cashier'::text])));
alter table public.roster_assignments add constraint roster_assignments_unit_check CHECK ((((staff_role = 'kitchen'::text) AND (popup_id IS NULL)) OR ((staff_role = 'cashier'::text) AND (popup_id IS NOT NULL))));
alter table public.roster_shifts add constraint roster_shifts_staff_role_check CHECK ((staff_role = ANY (ARRAY['kitchen'::text, 'cashier'::text])));
alter table public.roster_shifts add constraint roster_shifts_unit_check CHECK ((((staff_role = 'kitchen'::text) AND (popup_id IS NULL)) OR ((staff_role = 'cashier'::text) AND (popup_id IS NOT NULL))));
alter table public.staff_profiles add constraint staff_profiles_phone_digits_only CHECK (((phone IS NULL) OR (phone ~ '^0[0-9]{8,10}$'::text)));
alter table public.staff_profiles add constraint staff_profiles_status_check CHECK ((status = ANY (ARRAY['candidate'::text, 'confirmed'::text, 'inactive'::text])));
alter table public.staff_profiles add constraint staff_profiles_staff_role_check CHECK ((staff_role = ANY (ARRAY['kitchen'::text, 'cashier'::text])));
alter table public.staff_profiles add constraint staff_profiles_max_days_per_week_check CHECK (((max_days_per_week IS NULL) OR ((max_days_per_week >= 1) AND (max_days_per_week <= 7))));
alter table public.staff_profiles add constraint staff_profiles_bank_account_digits_only CHECK (((bank_account IS NULL) OR (bank_account ~ '^[0-9]{10,16}$'::text)));
alter table public.storage_objects add constraint storage_objects_pos_x_check CHECK (((pos_x >= (0)::numeric) AND (pos_x <= (100)::numeric)));
alter table public.storage_objects add constraint storage_objects_pos_y_check CHECK (((pos_y >= (0)::numeric) AND (pos_y <= (100)::numeric)));
alter table public.storage_objects add constraint storage_objects_icon_check CHECK ((icon = ANY (ARRAY['fridge'::text, 'freezer'::text, 'shelf'::text, 'box'::text, 'other'::text])));
alter table public.user_profiles add constraint user_profiles_phone_digits_only CHECK (((phone IS NULL) OR (phone ~ '^0[0-9]{8,10}$'::text)));
alter table public.user_profiles add constraint user_profiles_bank_account_digits_only CHECK (((bank_account IS NULL) OR (bank_account ~ '^[0-9]{10,16}$'::text)));
alter table public.attendance_records add constraint attendance_records_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_profiles(id) ON DELETE RESTRICT;
alter table public.attendance_records add constraint attendance_records_assignment_fkey FOREIGN KEY (assignment_id, staff_id) REFERENCES roster_assignments(id, staff_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
alter table public.contracts add constraint contracts_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES popup_events(id);
alter table public.contracts add constraint contracts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.contracts add constraint contracts_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES staff_profiles(id);
alter table public.manual_daily_menu_sales add constraint manual_daily_menu_sales_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES popup_events(id) ON DELETE CASCADE;
alter table public.manual_daily_menu_sales add constraint manual_daily_menu_sales_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE;
alter table public.manual_hourly_sales add constraint manual_hourly_sales_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES popup_events(id) ON DELETE CASCADE;
alter table public.manual_menu_sales add constraint manual_menu_sales_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES popup_events(id) ON DELETE CASCADE;
alter table public.manual_menu_sales add constraint manual_menu_sales_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE;
alter table public.order_items add constraint order_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES menu_items(id);
alter table public.order_items add constraint order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.orders add constraint orders_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES popup_events(id);
alter table public.payroll_adjustments add constraint payroll_adjustments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_profiles(id) ON DELETE CASCADE;
alter table public.payroll_payments add constraint payroll_payments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_profiles(id) ON DELETE CASCADE;
alter table public.payroll_payments add constraint payroll_payments_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.popup_closed_days add constraint popup_closed_days_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES popup_events(id) ON DELETE CASCADE;
alter table public.popup_daily_sales add constraint popup_daily_sales_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES popup_events(id) ON DELETE CASCADE;
alter table public.restock_events add constraint restock_events_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE;
alter table public.roster_assignments add constraint roster_assignments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_profiles(id) ON DELETE CASCADE;
alter table public.roster_assignments add constraint roster_assignments_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES popup_events(id) ON DELETE CASCADE;
alter table public.roster_assignments add constraint roster_assignments_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES roster_shifts(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX roster_shifts_id_unit_key ON public.roster_shifts USING btree (id, staff_role, popup_id);
alter table public.roster_assignments add constraint roster_assignments_unit_consistency_fkey FOREIGN KEY (shift_id, staff_role, popup_id) REFERENCES roster_shifts(id, staff_role, popup_id) ON UPDATE CASCADE ON DELETE CASCADE;
alter table public.roster_shift_requirements add constraint roster_shift_requirements_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES roster_shifts(id) ON DELETE CASCADE;
alter table public.roster_shifts add constraint roster_shifts_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES popup_events(id) ON DELETE CASCADE;
alter table public.staff_popup_assignments add constraint staff_popup_assignments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_profiles(id) ON DELETE CASCADE;
alter table public.staff_popup_assignments add constraint staff_popup_assignments_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES popup_events(id) ON DELETE CASCADE;
alter table public.staff_profiles add constraint staff_profiles_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
alter table public.staff_profiles add constraint staff_profiles_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES popup_events(id) ON DELETE SET NULL;
alter table public.storage_object_items add constraint storage_object_items_object_id_fkey FOREIGN KEY (object_id) REFERENCES storage_objects(id) ON DELETE CASCADE;
alter table public.storage_object_items add constraint storage_object_items_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE;
alter table public.user_profiles add constraint user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_manual_menu_sales_menu_item_id ON public.manual_menu_sales USING btree (menu_item_id);
CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at);
CREATE INDEX orders_popup_created_idx ON public.orders USING btree (popup_id, created_at);
CREATE INDEX staff_profiles_status_idx ON public.staff_profiles USING btree (status);
CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id);
CREATE INDEX idx_order_items_menu_item_id ON public.order_items USING btree (menu_item_id);
CREATE UNIQUE INDEX attendance_records_one_per_day ON public.attendance_records USING btree (staff_id, work_date) WHERE (status <> 'voided'::text);
CREATE INDEX attendance_records_assignment_idx ON public.attendance_records USING btree (assignment_id);
CREATE INDEX roster_assignments_staff_date_idx ON public.roster_assignments USING btree (staff_id, work_date);
CREATE INDEX popup_daily_sales_sale_date_idx ON public.popup_daily_sales USING btree (sale_date);
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.roster_assignments enable row level security;
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$ begin new.updated_at = now(); return new; end; $function$;
CREATE TRIGGER ingredients_updated_at BEFORE UPDATE ON public.ingredients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_storage_objects_updated_at BEFORE UPDATE ON public.storage_objects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE FUNCTION public.get_lifetime_sales_totals()
 RETURNS TABLE(total_revenue numeric, total_orders bigint, day_count integer, first_date date, last_date date, popup_count integer, sando_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH since AS (
    SELECT COALESCE(MIN(start_date), '0001-01-01'::date) AS d FROM popup_events
  ),
  pos_popup AS (
    SELECT
      (created_at + INTERVAL '9 hours')::date AS d,
      COALESCE(popup_id, -1)                  AS pk,
      SUM(total_price)::numeric               AS rev,
      COUNT(*)::bigint                        AS cnt
    FROM orders
    GROUP BY 1, 2
  ),
  pos AS (
    SELECT COALESCE(v.sale_date, p.d) AS d,
           SUM(COALESCE(v.total_revenue::numeric, p.rev))::numeric AS rev,
           SUM(COALESCE(v.total_orders::bigint, p.cnt))::bigint    AS cnt
    FROM pos_popup p
    FULL OUTER JOIN popup_daily_sales v ON v.sale_date = p.d AND v.popup_id = p.pk
    GROUP BY 1
  ),
  man AS (
    SELECT
      sale_date                           AS d,
      COALESCE(total_revenue, 0)::numeric AS rev,
      COALESCE(total_orders, 0)::bigint   AS cnt
    FROM daily_sales
  ),
  merged AS (
    SELECT
      COALESCE(m.d, p.d)     AS d,
      COALESCE(m.rev, p.rev) AS rev,
      COALESCE(m.cnt, p.cnt) AS cnt
    FROM pos p
    FULL OUTER JOIN man m ON m.d = p.d
  ),
  sales AS (
    SELECT
      COALESCE(SUM(mg.rev), 0)::numeric AS total_revenue,
      COALESCE(SUM(mg.cnt), 0)::bigint  AS total_orders,
      COUNT(*)::integer                 AS day_count,
      MIN(mg.d)                         AS first_date,
      MAX(mg.d)                         AS last_date
    FROM merged mg, since s
    WHERE mg.d >= s.d
  ),
  sando AS (SELECT id FROM menu_items WHERE name ILIKE '%산도%'),
  qty_pos AS (
    SELECT COALESCE(o.popup_id, -1) AS pk, oi.menu_item_id AS mid, SUM(oi.quantity)::bigint AS qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE (o.created_at + INTERVAL '9 hours')::date >= (SELECT d FROM since)
    GROUP BY 1, 2
  ),
  qty_man AS (
    SELECT COALESCE(popup_id, -1) AS pk, menu_item_id AS mid, SUM(quantity)::bigint AS qty
    FROM manual_menu_sales GROUP BY 1, 2
  ),
  qty_dman AS (
    SELECT COALESCE(popup_id, -1) AS pk, menu_item_id AS mid, SUM(quantity)::bigint AS qty
    FROM manual_daily_menu_sales GROUP BY 1, 2
  ),
  qty_keys AS (
    SELECT pk, mid FROM qty_pos
    UNION SELECT pk, mid FROM qty_man
    UNION SELECT pk, mid FROM qty_dman
  ),
  sando_total AS (
    SELECT COALESCE(SUM(COALESCE(d.qty, m.qty, p.qty, 0)), 0)::bigint AS n
    FROM qty_keys k
    LEFT JOIN qty_pos  p ON p.pk = k.pk AND p.mid = k.mid
    LEFT JOIN qty_man  m ON m.pk = k.pk AND m.mid = k.mid
    LEFT JOIN qty_dman d ON d.pk = k.pk AND d.mid = k.mid
    WHERE k.mid IN (SELECT id FROM sando)
  )
  SELECT
    sa.total_revenue, sa.total_orders, sa.day_count, sa.first_date, sa.last_date,
    (SELECT COUNT(*)::integer FROM popup_events) AS popup_count,
    st.n AS sando_count
  FROM sales sa, sando_total st
$function$;
