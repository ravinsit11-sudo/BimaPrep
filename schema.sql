-- BimaPrep database schema. Run once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).

-- ---------- profiles (one row per signed-up user) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  org text,
  goal text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id)
  with check (auth.uid() = id and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid()));

-- create the profile automatically when a user signs up; first admin is bootstrapped by email
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, org, goal, is_admin)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'name',''),
          coalesce(new.raw_user_meta_data->>'org',''),
          coalesce(new.raw_user_meta_data->>'goal',''),
          lower(new.email) = lower('ravi.nsit11@gmail.com'))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- orders (one per checkout attempt) ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pack text not null,
  list_amount integer not null,          -- rupees
  coupon_code text,
  discount integer not null default 0,   -- rupees
  final_amount integer not null,         -- rupees
  razorpay_order_id text unique,
  razorpay_payment_id text,
  status text not null default 'created', -- created | paid | failed | free
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.orders enable row level security;
drop policy if exists "orders: read own" on public.orders;
create policy "orders: read own" on public.orders for select using (auth.uid() = user_id);

-- ---------- entitlements (what a user can access) ----------
create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pack text not null,
  source text not null,                  -- payment | coupon | admin
  starts_at timestamptz not null default now(),
  expires_at timestamptz,                -- null = lifetime
  order_id uuid references public.orders(id),
  note text,
  granted_by uuid references public.profiles(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists entitlements_user_idx on public.entitlements(user_id);
alter table public.entitlements enable row level security;
drop policy if exists "entitlements: read own" on public.entitlements;
create policy "entitlements: read own" on public.entitlements for select using (auth.uid() = user_id);

-- ---------- coupons ----------
create table if not exists public.coupons (
  code text primary key,
  kind text not null check (kind in ('percent','flat')),
  value integer not null check (value > 0),
  packs text[],                          -- null = all packs
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  max_uses integer,                      -- null = unlimited
  max_uses_per_user integer not null default 1,
  active boolean not null default true,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.coupons enable row level security;   -- no client policies: server only

create table if not exists public.coupon_uses (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.coupons(code) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id),
  used_at timestamptz not null default now()
);
alter table public.coupon_uses enable row level security;

-- ---------- mock test attempts ----------
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mock_id text not null,
  title text,
  correct integer not null,
  total integer not null,
  pct integer not null,
  seconds_used integer,
  answers jsonb,
  created_at timestamptz not null default now()
);
create index if not exists attempts_user_idx on public.attempts(user_id, created_at desc);
alter table public.attempts enable row level security;
drop policy if exists "attempts: read own" on public.attempts;
create policy "attempts: read own" on public.attempts for select using (auth.uid() = user_id);
drop policy if exists "attempts: insert own" on public.attempts;
create policy "attempts: insert own" on public.attempts for insert with check (auth.uid() = user_id);

-- ---------- launch interest (notify me) ----------
create table if not exists public.notify_interest (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  pack text not null,
  created_at timestamptz not null default now(),
  unique (email, pack)
);
alter table public.notify_interest enable row level security;

-- ---------- audit log of admin actions ----------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid references public.profiles(id),
  action text not null,
  target text,
  detail jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;

-- helper view used by the app: active entitlements only
create or replace view public.active_entitlements with (security_invoker = true) as
  select * from public.entitlements
  where revoked_at is null and (expires_at is null or expires_at > now());
