-- Fixes from Supabase's security and performance advisors after 20261027000000.

-- is_pro answers only for the signed-in user, so nobody can look up another user's plan.
-- It reads subscriptions under the caller's own row-level security, so it needs no extra privilege.
drop policy "Pro users add own assets" on public.assets;
drop policy "Pro users upload own asset files" on storage.objects;
drop function public.is_pro(uuid);
create function public.is_pro() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = (select auth.uid()) and s.status = 'active' and s.current_period_end > now()
  );
$$;
revoke execute on function public.is_pro() from anon, public;

-- The new-user trigger must not be callable over the API.
revoke execute on function public.handle_new_user() from anon, authenticated, public;

alter function public.credit_ledger_append_only() set search_path = '';

alter extension citext set schema extensions;

-- Evaluate auth.uid() once per query, not once per row.
alter policy "read own profile" on public.profiles using (id = (select auth.uid()));
alter policy "read own subscription" on public.subscriptions using (user_id = (select auth.uid()));
alter policy "read own credit lines" on public.credit_ledger using (user_id = (select auth.uid()));
alter policy "read own presentations" on public.presentations using (owner_id = (select auth.uid()));
alter policy "read own assets" on public.assets using (owner_id = (select auth.uid()));
create policy "Pro users add own assets" on public.assets for insert
  with check (owner_id = (select auth.uid()) and (select public.is_pro()));
alter policy "read own asset files" on storage.objects
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Pro users upload own asset files" on storage.objects for insert
  with check (bucket_id = 'assets' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_pro()));

create index credit_ledger_hold on public.credit_ledger (hold_id) where hold_id is not null;
