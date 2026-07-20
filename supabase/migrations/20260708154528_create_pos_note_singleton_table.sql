
create table public.pos_note (
  id smallint primary key default 1 check (id = 1),
  content text not null default '',
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into public.pos_note (id, content) values (1, '');

alter publication supabase_realtime add table public.pos_note;
