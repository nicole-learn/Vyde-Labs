# Generation Queue And Concurrency

## Purpose

This document defines how TryPlayground should handle generation queueing, concurrency, fairness, cancellation, and recovery in both hosted mode and local mode.

The goal is not just to prevent overload. The goal is to make queueing feel predictable to users, fair across active hosted users, simple to explain, and safe to operate.

## Non-Negotiable Product Rules

These rules should hold across the product unless there is an explicit future product decision to change them.

### Hard user limit

- every user can have at most 100 active jobs at one time
- `active jobs` means anything in `queued`, `dispatching`, or `generating`
- completed, failed, and cancelled jobs do not count toward the limit
- this cap applies in both hosted and local mode

### Limit popup

If a user tries to enqueue another generation while already at 100 active jobs, the request is rejected before it is created.

The UI should show a simple popup with this exact message:

`limit of 100 concurrent queues/ generations reached, please wait for your generations to finish before continuing.`

There should be no partial enqueue, no silent failure, and no hidden background retry for the rejected request.

### Cancellation rule

- jobs in queue can be cancelled from the UI
- jobs that have already started generating cannot be cancelled from the UI
- if a cancellation races with dispatch and the job has already moved out of the queue, the cancel request should fail cleanly and the UI should refresh into the generating state

### User-facing statuses

The user-facing card states should stay simple:

- `In Queue`
- `Generating`
- `Done`
- `Failed`
- `Cancelled`

Internal states may be more detailed, but the user-facing language should remain simple.

## High-Level Principles

### 1. Fairness matters more than raw FIFO

A pure global FIFO queue is not enough for hosted TryPlayground. If one user floods the queue, other users still need a fair share of the available provider capacity.

TryPlayground should use:

- FIFO within each user's queue
- equal-weight fair sharing across active users

### 2. Full slot utilization matters

If there are open provider slots and a queued job is eligible to run, the system should fill the slot quickly.

Fairness should not leave slots idle.

### 3. The queue must be durable

Hosted queue state must survive:

- app refreshes
- Edge Function crashes
- temporary Fal errors
- temporary network failures
- dispatcher restarts

### 4. The queue must be observable

Users should always be able to tell:

- whether a job is queued or generating
- whether it can still be cancelled
- why it failed

Operators should always be able to tell:

- how many total slots are configured
- how many are currently occupied
- which users are consuming slots
- which jobs are stuck

## Hosted Mode Design

### Core Recommendation

Hosted mode should use ordinary Postgres tables as the authoritative queue state, not a pure FIFO message queue as the source of truth.

Reason:

- we need per-user caps
- we need fair-share scheduling
- we need user-visible cancellation
- we need credit reservation and settlement
- we need provider reconciliation
- we need durable job state that is easy to query directly

Supabase Queues / `pgmq` can still be useful for internal wakeups or later batch-processing helpers, but the user-visible queue should live in regular application tables.

## Recommended Supabase Building Blocks

Recommended platform primitives:

- Postgres tables as the authoritative queue state
- Supabase Realtime for live UI updates on job state changes
- Supabase Edge Functions for dispatching, reconciliation, and Fal callbacks/polling
- `pg_cron` for periodic recovery and safety sweeps
- optional `pg_net` or direct Edge Function invocation to wake the dispatcher immediately after enqueue, completion, or cancel events

This is aligned with official Supabase primitives that exist today:

- Supabase Queues / `pgmq` for durable queue semantics and visibility windows
- `pg_cron` for scheduled jobs
- Realtime for low-latency state updates

## Hosted Queue Objects

The hosted implementation should have a small set of authoritative records.

### 1. `generation_jobs`

One row per requested generation.

Recommended fields:

- `id`
- `user_id`
- `workspace_id`
- `folder_id`
- `model_id`
- `generation_kind`
- `request_payload`
- `status`
- `queue_entered_at`
- `started_at`
- `completed_at`
- `cancelled_at`
- `provider`
- `provider_request_id`
- `provider_status`
- `output_asset_id`
- `quoted_credit_cost`
- `credit_hold_id`
- `dispatch_attempt_count`
- `dispatch_lease_expires_at`
- `last_reconciled_at`
- `error_code`
- `error_message`
- `created_at`
- `updated_at`

Recommended internal statuses:

- `queued`
- `dispatching`
- `generating`
- `completed`
- `failed`
- `cancelled`

### 2. `queue_config`

One small config table for global queue settings.

Recommended fields:

- `provider_slot_limit`
- `max_active_jobs_per_user`
- `updated_at`

Initial values:

- `provider_slot_limit = 30`
- `max_active_jobs_per_user = 100`

### 3. `queue_user_fairness`

One row per active hosted user who has recently held a slot.

Recommended fields:

- `user_id`
- `last_slot_granted_at`
- `last_slot_sequence`
- `updated_at`

This table exists only to keep fair-share rotation stable and explainable.

### 4. `generation_attempts`

One row per dispatch attempt.

Recommended fields:

- `id`
- `generation_job_id`
- `attempt_number`
- `provider_request_id`
- `started_at`
- `finished_at`
- `result`
- `error_code`
- `error_message`

### 5. Credit records

Whatever final billing schema TryPlayground uses, it must support:

- a hold when a hosted job enters the queue
- release of that hold if the queued job is cancelled before provider acceptance
- conversion of that hold into a finalized charge once the provider accepts the generation

## Hosted Lifecycle

### Step 1. Enqueue

When the user clicks Generate in hosted mode:

1. Start a transaction.
2. Count the user's active jobs in `queued`, `dispatching`, and `generating`.
3. If the count is already 100, reject immediately and return the limit popup message.
4. Compute the quoted credit cost using the current pricing table.
5. Verify the user has enough spendable credits.
6. Create a credit hold for the quoted amount.
7. Insert the `generation_jobs` row in `queued`.
8. Commit.
9. Notify the dispatcher and stream the new row to the UI.

Important:

- the job does not exist if the limit check fails
- the credit hold happens at enqueue, not later
- the queued job now counts against the 100-job cap

### Step 2. Dispatch claim

The dispatcher claims queued work only when a provider slot is available.

Claim flow:

1. Acquire a singleton dispatcher lease.
2. Compute available provider slots.
3. Choose which users should receive those slots using the fair-share algorithm below.
4. Claim the chosen jobs with row locking.
5. Move those rows from `queued` to `dispatching`.
6. Set a short dispatch lease expiry.
7. Release the transaction.
8. Submit to Fal.

`dispatching` is an internal protection state. It prevents the same queued job from being claimed twice while a provider request is being created.

### Step 3. Provider acceptance

If Fal accepts the request:

- store `provider_request_id`
- move the job from `dispatching` to `generating`
- clear the dispatch lease
- finalize the credit hold into a real charge
- emit the UI update

If Fal rejects the request before acceptance:

- either requeue with retry backoff or fail terminally depending on the error class
- release any hold if the request never became a real provider job

### Step 4. Completion

When Fal completes:

- store the output asset
- move the job to `completed`
- clear any temporary recovery metadata
- stream the update to the UI

If Fal returns a final provider failure:

- move the job to `failed`
- preserve provider error metadata
- do not silently retry if the provider may already have consumed the request

## Hosted Fair-Share Scheduler

### Scheduling Goal

Hosted mode must satisfy this rule:

- if 1 active user has enough queued work, they get all available slots
- if 2 active users have enough queued work, they split slots evenly
- if 3 active users have enough queued work, they split slots evenly
- if there are more active users than slots, the slots rotate fairly over time

This is equal-weight fair sharing.

## Definitions

- `slot_limit`: current global provider concurrency, initially 30
- `running_count`: total jobs in `dispatching` or `generating`
- `free_slots = slot_limit - running_count`
- `active users`: users with at least one queued job or at least one running job

## Allocation Algorithm

The scheduler should work in two passes.

### Pass 1: fill fair-share deficits

1. Build the active user set.
2. Order users by `last_slot_granted_at ASC`, then `user_id ASC`.
3. Compute:
   - `base_share = floor(slot_limit / active_user_count)`
   - `remainder = slot_limit % active_user_count`
4. For the first `remainder` users in the ordered list, target share is `base_share + 1`.
5. For all remaining users, target share is `base_share`.
6. For each user, compute:
   - `running_for_user`
   - `deficit = max(0, target_share - running_for_user)`
7. Grant queued jobs to each user up to their deficit, oldest queued job first.

This guarantees convergence toward an even split without preempting jobs that are already running.

### Pass 2: fill spare capacity

If there are still free slots after Pass 1 because some users had no backlog or did not need their full target:

1. Iterate the same ordered list again.
2. Hand out remaining free slots one by one to users who still have queued work.
3. Continue oldest queued job first within each user.

This keeps the system fully utilized.

### Rotation rule

Every time a user is granted a slot:

- update `last_slot_granted_at`
- increment `last_slot_sequence`

This causes the next scheduling wave to start with the least recently served users, which rotates remainder slots fairly over time.

## Worked Examples

### Example A: 1 active user, 30 slots

- slot limit: 30
- active users: 1
- result: that user can hold up to 30 generating jobs at once

If they have 100 queued jobs:

- 30 generating
- 70 in queue

### Example B: 2 active users, 30 slots

- slot limit: 30
- active users: 2
- base share: 15
- remainder: 0
- result: 15 slots each while both have backlog

### Example C: 3 active users, 30 slots

- slot limit: 30
- active users: 3
- base share: 10
- remainder: 0
- result: 10 slots each while all three have backlog

### Example D: 50 active users, 30 slots

- slot limit: 30
- active users: 50
- base share: 0
- remainder: 30

In the current wave:

- 30 users get 1 slot
- 20 users remain queued

As slots free:

- the next grants start with the least recently served users
- over time, users rotate through the available 30 slots
- one user should not keep receiving the extra remainder slot ahead of everyone else

This is the behavior TryPlayground wants.

## Cancellation Rules

### Allowed

- `queued` jobs can be cancelled from the UI

### Not allowed

- `dispatching` jobs cannot be cancelled from the UI
- `generating` jobs cannot be cancelled from the UI

### Why this boundary matters

Once a slot has been claimed and provider submission has started, cancellation becomes ambiguous:

- the job may already exist on the provider
- the provider may already bill for it
- the output may still return even if the UI thinks it was cancelled

For TryPlayground v1, the clean rule is:

- cancel while queued
- do not cancel once generation has started

## Retry And Recovery Rules

### Pre-accept failures

If the provider request fails before the system can confirm provider acceptance:

- retry with backoff if the error is clearly transient
- keep the job in a queued-like state
- do not create duplicate provider jobs

Recommended transient retry examples:

- network timeout before response
- temporary 5xx response
- short-lived provider outage

### Post-accept failures

If the provider already accepted the request or may have accepted it:

- do not blindly retry
- reconcile first
- only retry if the system can prove the provider job never started

This is essential to avoid duplicate generations and accidental double charging.

### Stale dispatch recovery

If a job remains in `dispatching` past its dispatch lease:

- a sweeper should inspect it
- if no provider request id exists, move it back to `queued`
- if a provider request id exists, reconcile provider state before changing anything

### Stale generating recovery

If a job remains in `generating` too long:

- reconcile with provider status
- if provider reports completion, finish the job
- if provider reports failure, fail the job
- if provider state is unknown, mark for deeper reconciliation before any retry

## Sweepers And Safety Nets

Hosted mode should not rely only on direct event-driven dispatch.

Recommended safety jobs:

- `dispatch-sweeper` every 5 seconds
- `stale-dispatch-recovery` every 10 seconds
- `stale-generating-reconciliation` every 15 to 30 seconds

These are lightweight control-plane jobs, not long-running workers.

Their purpose:

- fill newly available slots
- recover leased jobs after crashes
- reconcile stuck provider work
- prevent deadlocks in queue state

## Credits And Queueing

Hosted credits must be part of the queue design.

### Recommended rule

- reserve credits at enqueue
- finalize the charge when the provider accepts the job
- release the hold if the queued job is cancelled before provider acceptance

This prevents a user from queueing more work than they can pay for while avoiding charges for work that never really started.

## Realtime UI Updates

Hosted UI updates should come from Realtime-backed job changes, not from guesswork in the client.

The UI should update immediately when a job changes:

- queued
- generating
- completed
- failed
- cancelled

This is how the asset gallery, folder views, and queue limit counts stay correct across tabs and devices.

## Local Mode Design

Local mode needs the same product rules but does not need the hosted fairness machinery.

## Local rules

- same 100 active-job cap
- same limit popup
- queued jobs are cancellable
- generating jobs are not cancellable from the UI

## Local scheduler

Recommended local behavior:

- keep a lightweight local job list in app-local storage
- dispatch local jobs FIFO
- use a small local concurrency cap instead of trying to mirror hosted global fairness

Recommended v1 default:

- local dispatch cap of 3 simultaneously generating jobs

Reason:

- the open-source app cannot assume what concurrency a user's personal Fal account has
- a conservative default is safer than trying to saturate an unknown provider limit
- the important user-facing limit is still 100 total active jobs

If TryPlayground later adds an advanced local setting for concurrency, it can build on the same queue controller.

## Local recovery

Local mode can be simpler, but it should still be decent:

- queued local jobs should survive a refresh if stored locally
- generating jobs should store enough metadata to reconcile on next launch if possible
- if reconciliation is not possible, the job should be marked clearly as interrupted or failed instead of disappearing silently

## Recommended Implementation Order

### Phase 1

- add the 100-job limit check
- add the limit popup
- add queued cancellation only
- add consistent statuses in the UI

### Phase 2

- build hosted authoritative `generation_jobs`
- add credit holds
- add fair-share dispatcher
- add Realtime UI updates

### Phase 3

- add sweepers and stale-job recovery
- add provider reconciliation hardening
- add operator dashboards and queue metrics

## Final Recommendation

Hosted TryPlayground should use:

- relational job state in Postgres
- equal-weight fair-share scheduling across active users
- FIFO ordering within each user's queue
- a hard per-user active cap of 100
- queue-only cancellation from the UI
- event-driven dispatch plus periodic sweepers

Local TryPlayground should use:

- the same 100-job cap
- the same user-facing statuses
- queue-only cancellation from the UI
- a much simpler local FIFO scheduler with a small local concurrency cap

This gives TryPlayground a queue system that is understandable to users, fair under load, and realistic to build cleanly on Supabase and Next.js.
