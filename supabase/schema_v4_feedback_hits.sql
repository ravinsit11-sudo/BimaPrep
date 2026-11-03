-- BimaPrep v18: feedback (with admin approval) and anonymous page-view counter. Run once.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  name text not null, email text not null, kind text not null default 'feedback',
  org text, message text not null,
  user_id uuid references public.profiles(id) on delete set null,
  approved boolean not null default false, approved_at timestamptz, approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists "feedback: public read approved" on public.feedback;
create policy "feedback: public read approved" on public.feedback for select using (approved = true);

create table if not exists public.hits (
  id bigint generated always as identity primary key,
  page text not null, vid text not null,
  created_at timestamptz not null default now()
);
create index if not exists hits_created_idx on public.hits(created_at);
alter table public.hits enable row level security;   -- server only

grant select on public.feedback to anon, authenticated;
grant all on public.feedback, public.hits to service_role;
grant usage, select on all sequences in schema public to service_role;
