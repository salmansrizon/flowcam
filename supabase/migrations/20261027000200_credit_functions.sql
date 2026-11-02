-- B2: Credit grants, Holds and balance (ADR 0011). Server-only: every function is security definer and callable
-- by service_role alone, so clients can never grant or hold Credits themselves.
--
-- A Hold is a group of `hold` lines, one per bucket it draws from. The group id is the first line's id; the other
-- lines carry note 'hold:<group id>'. Each `charge`/`release` line points (hold_id) at the one hold line it settles.
-- All writers for one user serialise on a per-user advisory lock, so balance checks and writes cannot interleave.

-- Available balance: the sum of all lines (holds already subtracted, charges are zero).
create function public.credit_balance(uid uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount), 0)::integer from public.credit_ledger where user_id = uid;
$$;

create function public.grant_signup_credits(uid uuid) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext(uid::text));
  if not exists (select 1 from auth.users where id = uid and email_confirmed_at is not null) then return 0; end if;
  if exists (select 1 from public.credit_ledger where user_id = uid and kind = 'grant' and bucket = 'signup') then return 0; end if;
  insert into public.credit_ledger (user_id, kind, bucket, amount, note) values (uid, 'grant', 'signup', 50, 'sign-up');
  return 50;
end;
$$;

create function public.grant_trial_credits(uid uuid) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext(uid::text));
  if exists (select 1 from public.credit_ledger where user_id = uid and kind = 'grant' and bucket = 'trial') then return 0; end if;
  insert into public.credit_ledger (user_id, kind, bucket, amount, note) values (uid, 'grant', 'trial', 200, 'trial');
  return 200;
end;
$$;

-- Monthly allowance for Pro (or an active Trial: same rule as is_pro, read directly since is_pro() needs auth.uid()).
-- Unspent monthly Credits from earlier periods expire first, because the allowance resets.
create function public.grant_monthly_credits(uid uuid, period_start timestamptz) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  period_note text := 'period:' || to_char(period_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  leftover integer;
begin
  perform pg_advisory_xact_lock(hashtext(uid::text));
  if not exists (select 1 from public.subscriptions s where s.user_id = uid and s.status = 'active' and s.current_period_end > now()) then return 0; end if;
  if exists (select 1 from public.credit_ledger where user_id = uid and kind = 'grant' and bucket = 'monthly' and note = period_note) then return 0; end if;
  select coalesce(sum(amount), 0) into leftover from public.credit_ledger where user_id = uid and bucket = 'monthly';
  if leftover > 0 then
    insert into public.credit_ledger (user_id, kind, bucket, amount, note) values (uid, 'expiry', 'monthly', -leftover, 'expired before ' || period_note);
  end if;
  insert into public.credit_ledger (user_id, kind, bucket, amount, note) values (uid, 'grant', 'monthly', 1000, period_note);
  return 1000;
end;
$$;

-- Spending order (PRODUCT.md §5): monthly, then sign-up and trial, then bonus, then top-up. Returns the hold group id.
create function public.place_hold(uid uuid, amount integer, note text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  remaining integer := amount;
  grp bigint;
  b record;
  take integer;
  new_id bigint;
begin
  if amount is null or amount <= 0 then raise exception 'hold amount must be positive'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  if amount > public.credit_balance(uid) then raise exception 'insufficient_credits'; end if;
  for b in
    select bucket, sum(l.amount)::integer as available
    from public.credit_ledger l where l.user_id = uid
    group by bucket having sum(l.amount) > 0
    order by case bucket when 'monthly' then 1 when 'signup' then 2 when 'trial' then 2 when 'bonus' then 3 else 4 end, bucket
  loop
    exit when remaining = 0;
    take := least(remaining, b.available);
    insert into public.credit_ledger (user_id, kind, bucket, amount, note)
      values (uid, 'hold', b.bucket, -take, case when grp is null then note else 'hold:' || grp end)
      returning id into new_id;
    grp := coalesce(grp, new_id);
    remaining := remaining - take;
  end loop;
  if remaining > 0 then raise exception 'insufficient_credits'; end if; -- unreachable unless a bucket is negative
  return grp;
end;
$$;

-- Settle a Hold: charge keeps the Credits spent, release returns them to the same buckets. Each happens once.
create function public.settle_hold(hold_id bigint, to_kind public.credit_kind) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  select user_id into uid from public.credit_ledger where id = settle_hold.hold_id and kind = 'hold' and (note is null or note not like 'hold:%'); -- later lines of a group are not group ids
  if uid is null then raise exception 'unknown hold'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  if exists (
    select 1 from public.credit_ledger s
    join public.credit_ledger h on h.id = s.hold_id
    where h.kind = 'hold' and (h.id = settle_hold.hold_id or h.note = 'hold:' || settle_hold.hold_id)
  ) then raise exception 'hold already settled'; end if;
  insert into public.credit_ledger (user_id, kind, bucket, amount, hold_id, note)
    select uid, to_kind, h.bucket, case when to_kind = 'release' then -h.amount else 0 end, h.id, 'hold:' || settle_hold.hold_id
    from public.credit_ledger h
    where h.kind = 'hold' and (h.id = settle_hold.hold_id or h.note = 'hold:' || settle_hold.hold_id);
end;
$$;

create function public.charge_hold(hold_id bigint) returns void
language sql security definer set search_path = '' as $$
  select public.settle_hold(hold_id, 'charge');
$$;

create function public.release_hold(hold_id bigint) returns void
language sql security definer set search_path = '' as $$
  select public.settle_hold(hold_id, 'release');
$$;

revoke execute on function
  public.credit_balance(uuid), public.grant_signup_credits(uuid), public.grant_trial_credits(uuid),
  public.grant_monthly_credits(uuid, timestamptz), public.place_hold(uuid, integer, text),
  public.settle_hold(bigint, public.credit_kind), public.charge_hold(bigint), public.release_hold(bigint)
  from public, anon, authenticated;
grant execute on function
  public.credit_balance(uuid), public.grant_signup_credits(uuid), public.grant_trial_credits(uuid),
  public.grant_monthly_credits(uuid, timestamptz), public.place_hold(uuid, integer, text),
  public.charge_hold(bigint), public.release_hold(bigint)
  to service_role;
