create table if not exists public.quiz_attempts (
  ups_id text primary key check (char_length(ups_id) between 2 and 64),
  display_name text not null check (char_length(display_name) between 1 and 50),
  attempt_token uuid not null unique,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score smallint check (score between 0 and 100),
  duration_ms integer check (duration_ms > 0)
);

alter table public.quiz_attempts enable row level security;
revoke all on public.quiz_attempts from anon, authenticated;
grant all on public.quiz_attempts to service_role;

create index if not exists quiz_attempts_leaderboard_idx
  on public.quiz_attempts (score desc, duration_ms asc, submitted_at asc)
  where submitted_at is not null;
