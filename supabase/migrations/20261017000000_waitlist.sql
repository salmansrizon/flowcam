-- Launch waitlist: people who asked to be emailed when Flowcam launches.
create extension if not exists citext;

create table public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       citext not null unique,
  source      text not null default 'home',   -- page they joined from: 'home' or a feature slug
  consent     boolean not null check (consent),
  created_at  timestamptz not null default now(),
  notified_at timestamptz                      -- set when the launch email is sent
);

-- No policies: only the server, using the secret key, reads or writes this table.
alter table public.waitlist enable row level security;
