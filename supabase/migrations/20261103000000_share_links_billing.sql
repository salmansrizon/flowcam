-- M9: Share Links (ADR 0005, 0009, 0015) and billing (ADR 0008, 0014), each behind a demo adapter until keys exist.

-- ---- Billing

-- Top-ups are priced in config like the plans (PRODUCT.md §5: 1,000 Credits for $10).
alter table public.pricing
  add column topup_cents integer not null default 1000 check (topup_cents > 0),
  add column topup_credits integer not null default 1000 check (topup_credits > 0);

-- Where a subscription came from, so webhooks can find and update it.
alter table public.subscriptions
  add column provider text check (provider in ('lemonsqueezy', 'demo')),
  add column provider_customer_id text,
  add column provider_subscription_id text,
  add column billing_interval text check (billing_interval in ('month', 'year'));
create unique index subscriptions_provider_sub on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

-- Every webhook event processed, keyed by the provider's event id: a repeated delivery does nothing.
create table public.billing_events (
  id           text primary key,
  provider     text not null check (provider in ('lemonsqueezy', 'demo')),
  type         text not null,
  user_id      uuid references auth.users on delete set null,
  payload      jsonb not null,
  processed_at timestamptz not null default now()
);
create index billing_events_user on public.billing_events (user_id) where user_id is not null;
alter table public.billing_events enable row level security; -- No policies: server only.

-- A paid Top-up: Credits in the topup bucket, which never expire. Idempotent per order reference.
create function public.grant_topup_credits(uid uuid, amount integer, ref text) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if amount <= 0 then raise exception 'amount must be positive'; end if;
  if exists (select 1 from public.credit_ledger where user_id = uid and note = 'topup:' || ref) then return 0; end if;
  insert into public.credit_ledger (user_id, kind, bucket, amount, note) values (uid, 'grant', 'topup', amount, 'topup:' || ref);
  return amount;
end;
$$;
revoke execute on function public.grant_topup_credits(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.grant_topup_credits(uuid, integer, text) to service_role;

-- ---- Share Links

-- A Pro user's shared Recording. The share page is served by the server (secret key), which checks the password
-- and never exposes `password_hash`, so there is no public read policy; owners read their own links.
create table public.share_links (
  id              text primary key check (id ~ '^[A-Za-z0-9_-]{10,32}$'),
  owner_id        uuid not null references auth.users on delete cascade,
  title           text not null,
  -- The Presentation behind the video, for Open Board and Remix.
  presentation    jsonb not null,
  status          text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  -- Demo or overflow playback: an MP4 in the private `shares` bucket. Mux playback when the real key exists.
  video_path      text,
  mux_asset_id    text,
  mux_playback_id text,
  duration_ms     integer check (duration_ms > 0),
  password_hash   text,
  views           integer not null default 0,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index share_links_owner on public.share_links (owner_id, created_at desc);
alter table public.share_links enable row level security;
create policy "read own share links" on public.share_links for select using (owner_id = (select auth.uid()));

insert into storage.buckets (id, name, public) values ('shares', 'shares', false) on conflict (id) do nothing;
-- Uploads and playback URLs go through the server with the secret key; no client policies.
