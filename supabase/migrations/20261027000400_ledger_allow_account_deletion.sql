-- The append-only trigger also blocked the ON DELETE CASCADE from auth.users, so an account with Credit
-- history could not be deleted. Lines stay immutable, except that they go with their deleted account.
create or replace function public.credit_ledger_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- The cascade from auth.users runs after the user row is gone.
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  raise exception 'credit_ledger is append-only';
end;
$$;
