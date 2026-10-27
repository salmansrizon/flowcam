-- M4: accounts, plans, the Credit Ledger and Sync of Presentations and Images.
-- Writes that need checks (plans, Credits, versioned saves) go through server code or security-definer
-- functions; clients may only read their own rows directly.

create extension if not exists citext;

-- One profile per signed-in user, created when the auth user is.
create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      citext not null,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select using (id = auth.uid());

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Plans. Only the server writes this table: billing webhooks later, a dev script for now.
create type public.plan as enum ('pro', 'trial');
create table public.subscriptions (
  user_id            uuid primary key references auth.users on delete cascade,
  plan               public.plan not null,
  status             text not null check (status in ('active', 'cancelled', 'expired')),
  current_period_end timestamptz not null,
  founding           boolean not null default false,
  updated_at         timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy "read own subscription" on public.subscriptions for select using (user_id = auth.uid());

-- Pro or an active Trial, now. Cancelled-but-paid users keep view-only access (ADR 0005), not Pro.
create function public.is_pro(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = uid and s.status = 'active' and s.current_period_end > now()
  );
$$;

-- Credit Ledger (ADR 0011): append-only lines; a user's balance is their sum.
-- `bucket` records where Credits came from, for the spending order monthly, bonus, then top-up (PRODUCT.md §5).
create type public.credit_kind as enum ('grant', 'hold', 'charge', 'release', 'expiry');
create type public.credit_bucket as enum ('signup', 'monthly', 'bonus', 'topup', 'trial');
create table public.credit_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  kind       public.credit_kind not null,
  bucket     public.credit_bucket not null,
  -- Signed: grants and releases add, holds and expiries subtract; a charge settles a hold and adds nothing.
  amount     integer not null,
  hold_id    bigint references public.credit_ledger (id),
  expires_at timestamptz,
  note       text,
  created_at timestamptz not null default now(),
  check ((kind in ('grant', 'release') and amount >= 0) or (kind in ('hold', 'expiry') and amount <= 0) or (kind = 'charge' and amount = 0)),
  check ((kind in ('charge', 'release')) = (hold_id is not null))
);
create index credit_ledger_user on public.credit_ledger (user_id, created_at);
alter table public.credit_ledger enable row level security;
create policy "read own credit lines" on public.credit_ledger for select using (user_id = auth.uid());

-- Lines are never edited or deleted, not even by the server.
create function public.credit_ledger_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'credit_ledger is append-only';
end;
$$;
create trigger credit_ledger_no_update before update or delete on public.credit_ledger
  for each row execute function public.credit_ledger_append_only();

-- Synced Presentations: the client's Presentation JSON, with a version for conflict detection.
create table public.presentations (
  id         uuid primary key,
  owner_id   uuid not null references auth.users on delete cascade,
  version    integer not null default 1 check (version >= 1),
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index presentations_owner on public.presentations (owner_id, updated_at desc);
alter table public.presentations enable row level security;
-- Reads only; saves go through a versioned function so a stale save is refused, never silently overwrites.
create policy "read own presentations" on public.presentations for select using (owner_id = auth.uid());

-- Synced Images: one row per stored file, keyed like OPFS assets/<sha256>.
create table public.assets (
  owner_id     uuid not null references auth.users on delete cascade,
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes        bigint not null check (bytes > 0),
  content_type text not null check (content_type like 'image/%'),
  created_at   timestamptz not null default now(),
  primary key (owner_id, sha256)
);
alter table public.assets enable row level security;
create policy "read own assets" on public.assets for select using (owner_id = auth.uid());
create policy "Pro users add own assets" on public.assets for insert
  with check (owner_id = auth.uid() and public.is_pro(auth.uid()));

-- Image files live in a private bucket at <user id>/<sha256>.
insert into storage.buckets (id, name, public) values ('assets', 'assets', false)
  on conflict (id) do nothing;
create policy "read own asset files" on storage.objects for select
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Pro users upload own asset files" on storage.objects for insert
  with check (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text and public.is_pro(auth.uid()));
