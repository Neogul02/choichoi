create table public.staff_popup_assignments (
  id bigint generated always as identity primary key,
  staff_id bigint not null references public.staff_profiles(id) on delete cascade,
  popup_id bigint not null references public.popup_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint staff_popup_assignments_unique unique (staff_id, popup_id)
);

create index idx_staff_popup_assignments_staff_id on public.staff_popup_assignments (staff_id);
create index idx_staff_popup_assignments_popup_id on public.staff_popup_assignments (popup_id);

alter table public.staff_popup_assignments enable row level security;
-- 서버 액션(service-role) 전용 — staff_profiles/roster_assignments와 동일 컨벤션, 정책 없음
