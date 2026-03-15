with ranked_generated_items as (
  select
    li.id,
    li.run_file_id,
    li.thumbnail_file_id,
    coalesce(li.source_run_id, li.run_id) as generation_run_id,
    row_number() over (
      partition by coalesce(li.source_run_id, li.run_id)
      order by
        case
          when li.id = gr.output_asset_id then 0
          else 1
        end,
        li.created_at desc,
        li.id desc
    ) as rank_in_run
  from public.library_items li
  left join public.generation_runs gr
    on gr.id = coalesce(li.source_run_id, li.run_id)
  where li.source = 'generated'
    and coalesce(li.source_run_id, li.run_id) is not null
),
canonical_generated_items as (
  select generation_run_id, id
  from ranked_generated_items
  where rank_in_run = 1
),
relinked_runs as (
  update public.generation_runs gr
  set
    output_asset_id = canonical_generated_items.id,
    updated_at = timezone('utc', now())
  from canonical_generated_items
  where gr.id = canonical_generated_items.generation_run_id
    and gr.output_asset_id is distinct from canonical_generated_items.id
  returning gr.id
),
deleted_generated_items as (
  delete from public.library_items li
  using ranked_generated_items ranked
  where li.id = ranked.id
    and ranked.rank_in_run > 1
  returning li.run_file_id, li.thumbnail_file_id
),
candidate_run_files as (
  select distinct run_file_id as id
  from deleted_generated_items
  where run_file_id is not null

  union

  select distinct thumbnail_file_id as id
  from deleted_generated_items
  where thumbnail_file_id is not null
)
delete from public.run_files rf
using candidate_run_files candidate
where rf.id = candidate.id
  and not exists (
    select 1
    from public.library_items li
    where li.run_file_id = rf.id
       or li.thumbnail_file_id = rf.id
  )
  and not exists (
    select 1
    from public.generation_run_inputs gri
    where gri.run_file_id = rf.id
  );

create unique index if not exists library_items_generated_source_run_unique
  on public.library_items (source_run_id)
  where source = 'generated'
    and source_run_id is not null;

create unique index if not exists library_items_generated_run_unique
  on public.library_items (run_id)
  where source = 'generated'
    and run_id is not null;
