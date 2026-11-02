-- Plan prices and limits live in the database (ADR 0008), never in code. One row is active at a time.
create table public.pricing (
  id                        uuid primary key default gen_random_uuid(),
  active                    boolean not null default true,
  currency                  text not null check (currency ~ '^[A-Z]{3}$'),
  list_monthly_cents        integer not null check (list_monthly_cents > 0),
  list_yearly_cents         integer not null check (list_yearly_cents > 0),
  founding_monthly_cents    integer not null check (founding_monthly_cents > 0),
  founding_yearly_cents     integer not null check (founding_yearly_cents > 0),
  -- Null until launch, which means the Founding window is open.
  founding_until            timestamptz,
  founding_max_subscribers  integer not null check (founding_max_subscribers > 0),
  trial_days                integer not null check (trial_days > 0),
  trial_credits             integer not null check (trial_credits >= 0),
  monthly_credits           integer not null check (monthly_credits >= 0),
  created_at                timestamptz not null default now()
);
create unique index pricing_one_active on public.pricing (active) where active;

-- Anyone may read the active prices; there are no write policies, so only the service role can change them.
alter table public.pricing enable row level security;
create policy "read active pricing" on public.pricing for select using (active);

insert into public.pricing (currency, list_monthly_cents, list_yearly_cents, founding_monthly_cents, founding_yearly_cents,
  founding_until, founding_max_subscribers, trial_days, trial_credits, monthly_credits)
values ('USD', 2000, 20000, 1700, 17000, null, 500, 7, 200, 1000);
