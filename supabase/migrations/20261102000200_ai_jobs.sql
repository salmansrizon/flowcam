-- M8: AI Jobs (ADR 0007, 0010, 0011). Prices and model routes are configuration, not code (AGENTS.md).

create type public.ai_job_kind as enum ('presentation', 'script', 'image', 'voiceover');
create type public.ai_quality as enum ('standard', 'best');

-- One row per kind and Quality: its Credit price (per job, or per started minute of audio for voiceover) and the
-- models to try in order (the first is the default, the rest are fallbacks; Standard text jobs escalate to Best's
-- first model when the result fails its validity check, at Standard's price).
create table public.ai_job_config (
  kind    public.ai_job_kind not null,
  quality public.ai_quality not null,
  credits integer not null check (credits >= 0),
  unit    text not null default 'job' check (unit in ('job', 'minute')),
  models  text[] not null check (cardinality(models) >= 1),
  primary key (kind, quality)
);
alter table public.ai_job_config enable row level security;
create policy "anyone reads AI job config" on public.ai_job_config for select using (true);

-- Seeded from PRODUCT.md §5-6 (read 17 October 2026).
insert into public.ai_job_config (kind, quality, credits, unit, models) values
  ('presentation', 'standard', 5, 'job', array['google/gemini-3.1-flash-lite:floor', 'anthropic/claude-sonnet-5.5']),
  ('presentation', 'best', 15, 'job', array['anthropic/claude-sonnet-5.5']),
  ('script', 'standard', 1, 'job', array['google/gemini-3.1-flash-lite:floor', 'anthropic/claude-sonnet-5.5']),
  ('script', 'best', 6, 'job', array['anthropic/claude-sonnet-5.5']),
  ('image', 'standard', 12, 'job', array['google/gemini-3.1-flash-lite-image:floor']),
  ('image', 'best', 45, 'job', array['google/gemini-3-pro-image']),
  ('voiceover', 'standard', 1, 'minute', array['hexgrad/kokoro-82m', 'fish-audio/drama-3']),
  ('voiceover', 'best', 6, 'minute', array['elevenlabs/eleven-flash-v2.5']);

-- The queue: a Job survives the tab closing; the worker runs it, retries, settles its Hold and stores the result.
create table public.ai_jobs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  kind       public.ai_job_kind not null,
  quality    public.ai_quality not null,
  input      jsonb not null,
  status     text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts   integer not null default 0,
  credits    integer not null check (credits >= 0),
  hold_id    bigint references public.credit_ledger (id),
  model      text,
  result     jsonb,
  error      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_jobs_user on public.ai_jobs (user_id, created_at desc);
create index ai_jobs_queue on public.ai_jobs (created_at) where status in ('queued', 'running');
create index ai_jobs_hold on public.ai_jobs (hold_id) where hold_id is not null;
alter table public.ai_jobs enable row level security;
-- Clients read their own Jobs; only the server (secret key) creates and updates them.
create policy "read own AI jobs" on public.ai_jobs for select using (user_id = (select auth.uid()));
