create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.studio_system_config (
  id boolean primary key default true,
  provider_slot_limit integer not null default 30 check (provider_slot_limit > 0),
  max_active_jobs_per_user integer not null default 100 check (max_active_jobs_per_user > 0),
  local_concurrency_limit integer not null default 3 check (local_concurrency_limit > 0),
  rotation_slice_ms integer not null default 1400 check (rotation_slice_ms >= 250),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (id)
);

insert into public.studio_system_config (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.studio_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'TryPlayground User',
  avatar_label text not null default 'T',
  avatar_url text,
  credit_balance numeric(12,1) not null default 0,
  active_credit_pack integer,
  enabled_model_ids text[] not null default array[
    'nano-banana-2',
    'veo-3.1',
    'gpt-5.4',
    'gpt-5.2',
    'gpt-5-mini',
    'claude-opus-4.6',
    'claude-sonnet-4.6',
    'claude-haiku-4.5',
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-flash-lite'
  ]::text[],
  selected_model_id text not null default 'nano-banana-2',
  gallery_size_level integer not null default 3 check (gallery_size_level between 0 and 6),
  revision bigint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint studio_accounts_active_credit_pack_check
    check (active_credit_pack is null or active_credit_pack in (100))
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.studio_accounts (user_id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.generation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.studio_accounts (user_id) on delete cascade,
  folder_id uuid references public.folders (id) on delete set null,
  deleted_at timestamptz,
  model_id text not null,
  model_name text not null,
  kind text not null check (kind in ('image', 'video', 'text', 'audio')),
  provider text not null default 'fal' check (provider in ('fal', 'openai', 'anthropic', 'google')),
  request_mode text not null check (
    request_mode in (
      'text-to-image',
      'text-to-video',
      'image-to-video',
      'first-last-frame-to-video',
      'reference-to-video',
      'text-to-speech',
      'background-removal',
      'chat'
    )
  ),
  status text not null check (status in ('pending', 'queued', 'processing', 'completed', 'failed', 'cancelled')),
  prompt text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  queue_entered_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  summary text not null default '',
  output_asset_id uuid,
  preview_url text,
  error_message text,
  input_payload jsonb not null default '{}'::jsonb,
  input_settings jsonb not null default '{}'::jsonb,
  provider_request_id text,
  provider_status text,
  estimated_cost_usd numeric(12,6),
  actual_cost_usd numeric(12,6),
  estimated_credits numeric(12,1),
  actual_credits numeric(12,1),
  usage_snapshot jsonb not null default '{}'::jsonb,
  output_text text,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  dispatch_attempt_count integer not null default 0,
  dispatch_lease_expires_at timestamptz,
  can_cancel boolean not null default true,
  draft_snapshot jsonb not null default '{}'::jsonb
);

create table if not exists public.run_files (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.generation_runs (id) on delete set null,
  user_id uuid not null references public.studio_accounts (user_id) on delete cascade,
  file_role text not null check (file_role in ('input', 'output', 'thumbnail')),
  source_type text not null check (source_type in ('generated', 'uploaded')),
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  file_name text,
  file_size_bytes bigint,
  media_width integer,
  media_height integer,
  media_duration_seconds numeric(10,3),
  aspect_ratio_label text,
  has_alpha boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.studio_accounts (user_id) on delete cascade,
  run_file_id uuid references public.run_files (id) on delete set null,
  thumbnail_file_id uuid references public.run_files (id) on delete set null,
  source_run_id uuid references public.generation_runs (id) on delete set null,
  title text not null,
  kind text not null check (kind in ('image', 'video', 'text', 'audio')),
  source text not null check (source in ('generated', 'uploaded')),
  role text not null check (role in ('generated_output', 'uploaded_source', 'text_note')),
  content_text text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  model_id text,
  run_id uuid references public.generation_runs (id) on delete set null,
  provider text not null default 'fal' check (provider in ('fal', 'openai', 'anthropic', 'google')),
  status text not null default 'ready' check (status in ('ready', 'processing', 'failed')),
  prompt text not null default '',
  meta text not null default '',
  media_width integer,
  media_height integer,
  media_duration_seconds numeric(10,3),
  aspect_ratio_label text,
  has_alpha boolean not null default false,
  folder_id uuid references public.folders (id) on delete set null,
  file_name text,
  mime_type text,
  byte_size bigint,
  metadata jsonb not null default '{}'::jsonb,
  error_message text
);

create table if not exists public.generation_run_inputs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.studio_accounts (user_id) on delete cascade,
  run_id uuid not null references public.generation_runs (id) on delete cascade,
  input_role text not null check (input_role in ('reference', 'start_frame', 'end_frame')),
  position integer not null default 0,
  library_item_id uuid references public.library_items (id) on delete set null,
  run_file_id uuid references public.run_files (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.studio_accounts (user_id) on delete cascade,
  delta_credits numeric(12,1) not null,
  balance_after numeric(12,1) not null,
  reason text not null check (
    reason in (
      'purchase',
      'purchase_refund',
      'generation_hold',
      'generation_settlement',
      'generation_refund',
      'admin_adjustment'
    )
  ),
  related_run_id uuid references public.generation_runs (id) on delete set null,
  idempotency_key text,
  source_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.studio_accounts (user_id) on delete cascade,
  stripe_customer_id text not null,
  livemode boolean not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, livemode),
  unique (stripe_customer_id)
);

create table if not exists public.credit_packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  credits numeric(12,1) not null check (credits > 0),
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'usd',
  stripe_product_id_test text,
  stripe_price_id_test text,
  stripe_product_id_live text,
  stripe_price_id_live text,
  is_active boolean not null default true,
  display_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.studio_accounts (user_id) on delete cascade,
  credit_pack_id uuid not null references public.credit_packs (id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  credits_amount numeric(12,1) not null check (credits_amount > 0),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  status text not null check (status in ('pending', 'completed', 'expired', 'failed', 'refunded')),
  livemode boolean not null,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_customer_id text,
  stripe_refund_id text,
  checkout_request_id text,
  stripe_checkout_url text,
  fulfilled_ledger_entry_id uuid references public.credit_ledger (id) on delete set null,
  refund_ledger_entry_id uuid references public.credit_ledger (id) on delete set null,
  credited_at timestamptz,
  refunded_at timestamptz,
  refunded_amount_cents integer not null default 0,
  refunded_credits numeric(12,1) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint credit_purchases_refund_bounds_check check (
    refunded_amount_cents >= 0
    and refunded_amount_cents <= amount_cents
    and refunded_credits >= 0
    and refunded_credits <= credits_amount
  )
);

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  livemode boolean not null,
  status text not null check (status in ('processing', 'processed', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  message text not null check (
    char_length(btrim(message)) > 0
    and char_length(message) <= 4000
  ),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists folders_user_name_unique
  on public.folders (user_id, lower(name));

create index if not exists folders_user_sort_idx
  on public.folders (user_id, sort_order, created_at desc);

create index if not exists generation_runs_user_status_queue_idx
  on public.generation_runs (user_id, status, queue_entered_at asc);

create index if not exists generation_runs_status_queue_idx
  on public.generation_runs (status, queue_entered_at asc);

create index if not exists generation_runs_folder_idx
  on public.generation_runs (folder_id)
  where folder_id is not null;

create index if not exists generation_runs_user_visible_created_idx
  on public.generation_runs (user_id, created_at desc)
  where deleted_at is null;

create index if not exists generation_runs_user_deleted_status_queue_idx
  on public.generation_runs (user_id, status, queue_entered_at asc)
  where deleted_at is not null;

create index if not exists run_files_user_created_idx
  on public.run_files (user_id, created_at desc);

create index if not exists run_files_run_idx
  on public.run_files (run_id)
  where run_id is not null;

create index if not exists library_items_user_folder_created_idx
  on public.library_items (user_id, folder_id, created_at desc);

create index if not exists library_items_user_created_idx
  on public.library_items (user_id, created_at desc);

create index if not exists library_items_folder_idx
  on public.library_items (folder_id)
  where folder_id is not null;

create index if not exists library_items_run_file_idx
  on public.library_items (run_file_id)
  where run_file_id is not null;

create index if not exists library_items_run_idx
  on public.library_items (run_id)
  where run_id is not null;

create index if not exists library_items_source_run_idx
  on public.library_items (source_run_id)
  where source_run_id is not null;

create index if not exists library_items_thumbnail_file_idx
  on public.library_items (thumbnail_file_id)
  where thumbnail_file_id is not null;

create unique index if not exists library_items_generated_source_run_unique
  on public.library_items (source_run_id)
  where source = 'generated'
    and source_run_id is not null;

create unique index if not exists library_items_generated_run_unique
  on public.library_items (run_id)
  where source = 'generated'
    and run_id is not null;

create index if not exists generation_run_inputs_run_role_position_idx
  on public.generation_run_inputs (run_id, input_role, position);

create index if not exists generation_run_inputs_library_item_idx
  on public.generation_run_inputs (library_item_id)
  where library_item_id is not null;

create index if not exists generation_run_inputs_run_file_idx
  on public.generation_run_inputs (run_file_id)
  where run_file_id is not null;

create index if not exists generation_run_inputs_user_idx
  on public.generation_run_inputs (user_id);

create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);

create unique index if not exists credit_ledger_idempotency_key_unique
  on public.credit_ledger (idempotency_key)
  where idempotency_key is not null;

create index if not exists credit_ledger_source_event_idx
  on public.credit_ledger (source_event_id)
  where source_event_id is not null;

create index if not exists credit_ledger_related_run_idx
  on public.credit_ledger (related_run_id)
  where related_run_id is not null;

create unique index if not exists credit_purchases_checkout_session_unique
  on public.credit_purchases (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists credit_purchases_payment_intent_unique
  on public.credit_purchases (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create unique index if not exists credit_purchases_charge_unique
  on public.credit_purchases (stripe_charge_id)
  where stripe_charge_id is not null;

create unique index if not exists credit_purchases_user_checkout_request_unique
  on public.credit_purchases (user_id, checkout_request_id)
  where checkout_request_id is not null;

create index if not exists credit_purchases_user_created_idx
  on public.credit_purchases (user_id, created_at desc);

create index if not exists credit_purchases_user_pending_idx
  on public.credit_purchases (user_id, created_at desc)
  where status = 'pending';

create index if not exists credit_purchases_credit_pack_idx
  on public.credit_purchases (credit_pack_id);

create index if not exists credit_purchases_fulfilled_ledger_idx
  on public.credit_purchases (fulfilled_ledger_entry_id)
  where fulfilled_ledger_entry_id is not null;

create index if not exists credit_purchases_refund_ledger_idx
  on public.credit_purchases (refund_ledger_entry_id)
  where refund_ledger_entry_id is not null;

create index if not exists stripe_webhook_events_status_created_idx
  on public.stripe_webhook_events (status, created_at desc);

create index if not exists feedback_submissions_created_at_idx
  on public.feedback_submissions (created_at desc);

create index if not exists feedback_submissions_user_created_at_idx
  on public.feedback_submissions (user_id, created_at desc);

create unique index if not exists run_files_generated_output_role_unique
  on public.run_files (run_id, file_role)
  where run_id is not null
    and file_role in ('output', 'thumbnail');

alter table public.studio_system_config enable row level security;
alter table public.studio_accounts enable row level security;
alter table public.folders enable row level security;
alter table public.generation_runs enable row level security;
alter table public.run_files enable row level security;
alter table public.library_items enable row level security;
alter table public.generation_run_inputs enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.billing_customers enable row level security;
alter table public.credit_packs enable row level security;
alter table public.credit_purchases enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.feedback_submissions enable row level security;

create or replace function public.bump_studio_account_revision(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.studio_accounts
  set revision = revision + 1,
      updated_at = timezone('utc', now())
  where user_id = target_user_id;
end;
$$;

create or replace function public.bump_studio_account_revision_from_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  target_user_id = coalesce(new.user_id, old.user_id);

  if target_user_id is not null then
    perform public.bump_studio_account_revision(target_user_id);
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.handle_tryplayground_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_display_name text;
begin
  next_display_name = coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'TryPlayground User'
  );

  insert into public.studio_accounts (
    user_id,
    display_name,
    avatar_label
  ) values (
    new.id,
    next_display_name,
    upper(left(next_display_name, 1))
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function public.get_tryplayground_active_hosted_user_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select greatest(
    1,
    count(distinct generation_runs.user_id)
  )::integer
  from public.generation_runs
  where generation_runs.status in ('queued', 'processing');
$$;

create or replace function public.broadcast_tryplayground_studio_revision()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  if new.user_id is null or new.revision is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.revision is distinct from old.revision then
    perform realtime.send(
      jsonb_build_object(
        'revision', new.revision,
        'user_id', new.user_id,
        'event_type', 'workspace_revision'
      ),
      'studio.sync',
      'studio:' || new.user_id::text,
      true
    );
  end if;

  return new;
end;
$$;

create or replace function public.apply_tryplayground_credit_ledger_entry(
  p_user_id uuid,
  p_delta_credits numeric,
  p_reason text,
  p_related_run_id uuid default null,
  p_idempotency_key text default null,
  p_source_event_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_allow_negative_balance boolean default false,
  p_active_credit_pack integer default null
)
returns public.credit_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.credit_ledger%rowtype;
  v_account public.studio_accounts%rowtype;
  v_balance_after numeric(12,1);
begin
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

    select *
    into v_existing
    from public.credit_ledger
    where idempotency_key = p_idempotency_key
    limit 1;

    if found then
      return v_existing;
    end if;
  end if;

  select *
  into v_account
  from public.studio_accounts
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'studio account not found for user %', p_user_id;
  end if;

  v_balance_after = coalesce(v_account.credit_balance, 0) + p_delta_credits;

  if not p_allow_negative_balance and v_balance_after < 0 then
    raise exception 'INSUFFICIENT_CREDITS: not enough credits to complete this operation';
  end if;

  update public.studio_accounts
  set credit_balance = v_balance_after,
      active_credit_pack = coalesce(p_active_credit_pack, active_credit_pack),
      updated_at = timezone('utc', now())
  where user_id = p_user_id;

  insert into public.credit_ledger (
    user_id,
    delta_credits,
    balance_after,
    reason,
    related_run_id,
    idempotency_key,
    source_event_id,
    metadata
  ) values (
    p_user_id,
    p_delta_credits,
    v_balance_after,
    p_reason,
    p_related_run_id,
    p_idempotency_key,
    p_source_event_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning *
  into v_existing;

  return v_existing;
end;
$$;

create or replace function public.fulfill_tryplayground_credit_purchase(
  p_purchase_id uuid,
  p_stripe_checkout_session_id text default null,
  p_stripe_payment_intent_id text default null,
  p_stripe_charge_id text default null,
  p_stripe_customer_id text default null,
  p_source_event_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.credit_purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.credit_purchases%rowtype;
  v_credit_pack public.credit_packs%rowtype;
  v_ledger public.credit_ledger%rowtype;
begin
  select *
  into v_purchase
  from public.credit_purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'credit purchase % was not found', p_purchase_id;
  end if;

  if v_purchase.status = 'completed' and v_purchase.fulfilled_ledger_entry_id is not null then
    return v_purchase;
  end if;

  select *
  into v_credit_pack
  from public.credit_packs
  where id = v_purchase.credit_pack_id;

  if not found then
    raise exception 'credit pack % was not found for purchase %', v_purchase.credit_pack_id, p_purchase_id;
  end if;

  v_ledger := public.apply_tryplayground_credit_ledger_entry(
    p_user_id := v_purchase.user_id,
    p_delta_credits := v_purchase.credits_amount,
    p_reason := 'purchase',
    p_related_run_id := null,
    p_idempotency_key := format('stripe:credit_purchase:%s:grant', v_purchase.id),
    p_source_event_id := p_source_event_id,
    p_metadata := jsonb_build_object(
      'credit_purchase_id', v_purchase.id,
      'credit_pack_id', v_purchase.credit_pack_id,
      'stripe_checkout_session_id', coalesce(p_stripe_checkout_session_id, v_purchase.stripe_checkout_session_id),
      'stripe_payment_intent_id', coalesce(p_stripe_payment_intent_id, v_purchase.stripe_payment_intent_id),
      'stripe_charge_id', coalesce(p_stripe_charge_id, v_purchase.stripe_charge_id)
    ) || coalesce(p_metadata, '{}'::jsonb),
    p_allow_negative_balance := false,
    p_active_credit_pack := v_credit_pack.credits::integer
  );

  update public.credit_purchases
  set status = 'completed',
      stripe_checkout_session_id = coalesce(p_stripe_checkout_session_id, stripe_checkout_session_id),
      stripe_payment_intent_id = coalesce(p_stripe_payment_intent_id, stripe_payment_intent_id),
      stripe_charge_id = coalesce(p_stripe_charge_id, stripe_charge_id),
      stripe_customer_id = coalesce(p_stripe_customer_id, stripe_customer_id),
      fulfilled_ledger_entry_id = v_ledger.id,
      credited_at = coalesce(credited_at, timezone('utc', now())),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      updated_at = timezone('utc', now())
  where id = v_purchase.id
  returning *
  into v_purchase;

  return v_purchase;
end;
$$;

grant execute on function public.get_tryplayground_active_hosted_user_count() to authenticated;

grant execute on function public.apply_tryplayground_credit_ledger_entry(
  uuid,
  numeric,
  text,
  uuid,
  text,
  text,
  jsonb,
  boolean,
  integer
) to authenticated, service_role;

grant execute on function public.fulfill_tryplayground_credit_purchase(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

drop trigger if exists set_studio_system_config_updated_at on public.studio_system_config;
create trigger set_studio_system_config_updated_at
before update on public.studio_system_config
for each row
execute function public.set_updated_at();

drop trigger if exists set_studio_accounts_updated_at on public.studio_accounts;
create trigger set_studio_accounts_updated_at
before update on public.studio_accounts
for each row
execute function public.set_updated_at();

drop trigger if exists set_folders_updated_at on public.folders;
create trigger set_folders_updated_at
before update on public.folders
for each row
execute function public.set_updated_at();

drop trigger if exists set_generation_runs_updated_at on public.generation_runs;
create trigger set_generation_runs_updated_at
before update on public.generation_runs
for each row
execute function public.set_updated_at();

drop trigger if exists set_library_items_updated_at on public.library_items;
create trigger set_library_items_updated_at
before update on public.library_items
for each row
execute function public.set_updated_at();

drop trigger if exists set_billing_customers_updated_at on public.billing_customers;
create trigger set_billing_customers_updated_at
before update on public.billing_customers
for each row
execute function public.set_updated_at();

drop trigger if exists set_credit_packs_updated_at on public.credit_packs;
create trigger set_credit_packs_updated_at
before update on public.credit_packs
for each row
execute function public.set_updated_at();

drop trigger if exists set_credit_purchases_updated_at on public.credit_purchases;
create trigger set_credit_purchases_updated_at
before update on public.credit_purchases
for each row
execute function public.set_updated_at();

drop trigger if exists set_stripe_webhook_events_updated_at on public.stripe_webhook_events;
create trigger set_stripe_webhook_events_updated_at
before update on public.stripe_webhook_events
for each row
execute function public.set_updated_at();

drop trigger if exists folders_bump_studio_revision on public.folders;
create trigger folders_bump_studio_revision
after insert or update or delete on public.folders
for each row
execute function public.bump_studio_account_revision_from_trigger();

drop trigger if exists generation_runs_bump_studio_revision on public.generation_runs;
create trigger generation_runs_bump_studio_revision
after insert or update or delete on public.generation_runs
for each row
execute function public.bump_studio_account_revision_from_trigger();

drop trigger if exists run_files_bump_studio_revision on public.run_files;
create trigger run_files_bump_studio_revision
after insert or update or delete on public.run_files
for each row
execute function public.bump_studio_account_revision_from_trigger();

drop trigger if exists library_items_bump_studio_revision on public.library_items;
create trigger library_items_bump_studio_revision
after insert or update or delete on public.library_items
for each row
execute function public.bump_studio_account_revision_from_trigger();

drop trigger if exists generation_run_inputs_bump_studio_revision on public.generation_run_inputs;
create trigger generation_run_inputs_bump_studio_revision
after insert or update or delete on public.generation_run_inputs
for each row
execute function public.bump_studio_account_revision_from_trigger();

drop trigger if exists credit_ledger_bump_studio_revision on public.credit_ledger;
create trigger credit_ledger_bump_studio_revision
after insert or update or delete on public.credit_ledger
for each row
execute function public.bump_studio_account_revision_from_trigger();

drop trigger if exists on_auth_user_created_tryplayground on auth.users;
create trigger on_auth_user_created_tryplayground
after insert on auth.users
for each row
execute function public.handle_tryplayground_new_user();

drop trigger if exists studio_accounts_broadcast_tryplayground_revision
  on public.studio_accounts;
create trigger studio_accounts_broadcast_tryplayground_revision
after update of revision on public.studio_accounts
for each row
execute function public.broadcast_tryplayground_studio_revision();

insert into public.studio_accounts (user_id, display_name, avatar_label)
select
  users.id,
  coalesce(
    nullif(trim(users.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'TryPlayground User'
  ),
  upper(left(
    coalesce(
      nullif(trim(users.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
      'T'
    ),
    1
  ))
from auth.users as users
on conflict (user_id) do nothing;

drop policy if exists "studio_accounts_select_own" on public.studio_accounts;
create policy "studio_accounts_select_own"
on public.studio_accounts
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "studio_accounts_insert_own" on public.studio_accounts;
create policy "studio_accounts_insert_own"
on public.studio_accounts
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "studio_accounts_update_own" on public.studio_accounts;
create policy "studio_accounts_update_own"
on public.studio_accounts
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "studio_accounts_delete_own" on public.studio_accounts;
create policy "studio_accounts_delete_own"
on public.studio_accounts
for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "folders_manage_own" on public.folders;
create policy "folders_manage_own"
on public.folders
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "generation_runs_manage_own" on public.generation_runs;
create policy "generation_runs_manage_own"
on public.generation_runs
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "run_files_manage_own" on public.run_files;
create policy "run_files_manage_own"
on public.run_files
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "library_items_manage_own" on public.library_items;
create policy "library_items_manage_own"
on public.library_items
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "generation_run_inputs_manage_own" on public.generation_run_inputs;
create policy "generation_run_inputs_manage_own"
on public.generation_run_inputs
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "credit_ledger_manage_own" on public.credit_ledger;
create policy "credit_ledger_manage_own"
on public.credit_ledger
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "studio_system_config_read_authenticated" on public.studio_system_config;
create policy "studio_system_config_read_authenticated"
on public.studio_system_config
for select
to authenticated
using (true);

drop policy if exists "billing_customers_select_own" on public.billing_customers;
create policy "billing_customers_select_own"
on public.billing_customers
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "billing_customers_insert_own" on public.billing_customers;
create policy "billing_customers_insert_own"
on public.billing_customers
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "billing_customers_update_own" on public.billing_customers;
create policy "billing_customers_update_own"
on public.billing_customers
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "credit_packs_read_authenticated" on public.credit_packs;
create policy "credit_packs_read_authenticated"
on public.credit_packs
for select
to authenticated
using (is_active = true);

drop policy if exists "credit_purchases_select_own" on public.credit_purchases;
create policy "credit_purchases_select_own"
on public.credit_purchases
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "credit_purchases_insert_own" on public.credit_purchases;
create policy "credit_purchases_insert_own"
on public.credit_purchases
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "credit_purchases_update_own" on public.credit_purchases;
create policy "credit_purchases_update_own"
on public.credit_purchases
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "stripe_webhook_events_service_role_all" on public.stripe_webhook_events;
create policy "stripe_webhook_events_service_role_all"
on public.stripe_webhook_events
for all
to service_role
using (true)
with check (true);

drop policy if exists "feedback_submissions_service_role_all" on public.feedback_submissions;
create policy "feedback_submissions_service_role_all"
on public.feedback_submissions
for all
to service_role
using (true)
with check (true);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'hosted-media',
  'hosted-media',
  false,
  524288000,
  array['image/*', 'video/*', 'audio/*', 'text/plain', 'image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "hosted_media_bucket_visible" on storage.buckets;
create policy "hosted_media_bucket_visible"
on storage.buckets
for select
to authenticated
using (id = 'hosted-media');

drop policy if exists "hosted_media_select_own" on storage.objects;
create policy "hosted_media_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'hosted-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "hosted_media_insert_own" on storage.objects;
create policy "hosted_media_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'hosted-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "hosted_media_update_own" on storage.objects;
create policy "hosted_media_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'hosted-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'hosted-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "hosted_media_delete_own" on storage.objects;
create policy "hosted_media_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'hosted-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists tryplayground_studio_broadcast_select on realtime.messages;
create policy tryplayground_studio_broadcast_select
  on realtime.messages
  for select
  to authenticated
  using (realtime.topic() = ('studio:'::text || ((select auth.uid()))::text));

insert into public.credit_packs (
  slug,
  name,
  credits,
  price_cents,
  currency,
  stripe_product_id_test,
  stripe_price_id_test,
  stripe_product_id_live,
  stripe_price_id_live,
  is_active,
  display_order,
  metadata
) values (
  'hosted-100-credits',
  '100 Credits',
  100,
  1000,
  'usd',
  'prod_TyWtYjPfoef2kR',
  'price_1T0ZpTLEQVurFIbfkgaKoCiz',
  'prod_TyXJx97z0OdquL',
  'price_1T0aEQLGjQTKKAtFTRBZlkKy',
  true,
  0,
  jsonb_build_object(
    'source', '20260315070000_tryplayground_baseline',
    'description', 'Hosted 100-credit pack'
  )
)
on conflict (slug) do update
set name = excluded.name,
    credits = excluded.credits,
    price_cents = excluded.price_cents,
    currency = excluded.currency,
    stripe_product_id_test = excluded.stripe_product_id_test,
    stripe_price_id_test = excluded.stripe_price_id_test,
    stripe_product_id_live = excluded.stripe_product_id_live,
    stripe_price_id_live = excluded.stripe_price_id_live,
    is_active = excluded.is_active,
    display_order = excluded.display_order,
    metadata = public.credit_packs.metadata || excluded.metadata,
    updated_at = timezone('utc', now());
