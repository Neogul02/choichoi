create table public.roster_memos (
  id bigint generated always as identity primary key,
  memo_date date not null,
  content text not null,
  author_name text,
  created_at timestamptz not null default now()
);

create index roster_memos_date_idx on public.roster_memos (memo_date);

alter table public.roster_memos enable row level security;
