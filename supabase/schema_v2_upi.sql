-- BimaPrep v2: manual UPI payments with admin approval. Run once in Supabase -> SQL Editor.
alter table public.orders add column if not exists utr text;
alter table public.orders add column if not exists proof_path text;
alter table public.orders add column if not exists submitted_at timestamptz;
alter table public.orders add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.orders add column if not exists reviewed_at timestamptz;
alter table public.orders add column if not exists review_note text;
create index if not exists orders_status_idx on public.orders(status);

-- private bucket for payment screenshots; users upload only into their own folder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
drop policy if exists "proofs: upload own" on storage.objects;
create policy "proofs: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "proofs: read own" on storage.objects;
create policy "proofs: read own" on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);

-- permissions for signed-in users (row security still applies)
grant usage on schema public to anon, authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
alter default privileges in schema public grant select, insert, update on tables to authenticated;
