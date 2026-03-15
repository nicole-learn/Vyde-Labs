alter table public.generation_runs
  add column if not exists deleted_at timestamptz;

create index if not exists generation_runs_user_visible_created_idx
  on public.generation_runs (user_id, created_at desc)
  where deleted_at is null;

create index if not exists generation_runs_user_deleted_status_queue_idx
  on public.generation_runs (user_id, status, queue_entered_at asc)
  where deleted_at is not null;
