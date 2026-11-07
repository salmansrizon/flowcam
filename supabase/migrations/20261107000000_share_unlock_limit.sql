-- #49: limit Share Link password guesses per link and client (hashed IP). Only the service role reads or writes.
create table public.share_unlock_attempts (
  share_id     text not null references public.share_links on delete cascade,
  client       text not null,
  window_start timestamptz not null default now(),
  attempts     integer not null default 1,
  primary key (share_id, client)
);
alter table public.share_unlock_attempts enable row level security;

-- Counts one attempt and returns whether it is within the limit (max_attempts per window_seconds).
create function public.share_unlock_attempt(link_id text, client_key text, max_attempts integer default 10, window_seconds integer default 900)
returns boolean
language sql security definer set search_path = '' as $$
  insert into public.share_unlock_attempts as a (share_id, client) values (link_id, client_key)
  on conflict (share_id, client) do update set
    window_start = case when a.window_start <= now() - make_interval(secs => window_seconds) then now() else a.window_start end,
    attempts     = case when a.window_start <= now() - make_interval(secs => window_seconds) then 1 else a.attempts + 1 end
  returning attempts <= max_attempts;
$$;
revoke execute on function public.share_unlock_attempt(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.share_unlock_attempt(text, text, integer, integer) to service_role;
