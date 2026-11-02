-- M9: a cancelled subscription stays Pro until its period ends; anyone who paid once keeps Share Links live (ADR 0005).
alter table public.subscriptions
  add column cancel_at_period_end boolean not null default false,
  add column paid_once boolean not null default false;
