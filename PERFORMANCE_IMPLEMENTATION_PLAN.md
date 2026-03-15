# Performance Implementation Plan

## Goal

Make TryPlayground feel immediate without removing any existing functionality.

Primary targets:

- Generate click to visible queued card: under 200ms on a normal connection
- Hosted completed output to gallery visibility: under 1s median
- Initial page shell render: immediate
- Initial interactive workspace load: under 2s median for normal-sized libraries

## Current Bottlenecks

### 1. Generate requests wait too long before responding

- [src/features/studio/use-studio-runtime-core.ts](/Users/nic0le/reelmint/tryplayground/src/features/studio/use-studio-runtime-core.ts) waits for full queue request completion before the card appears.
- [src/server/studio/hosted-store.ts](/Users/nic0le/reelmint/tryplayground/src/server/studio/hosted-store.ts) calls `syncHostedUserQueue()` and `buildHostedState()` inside `queueHostedGeneration()`, so the request does more work than necessary before returning.
- [src/server/local/local-store.ts](/Users/nic0le/reelmint/tryplayground/src/server/local/local-store.ts) similarly calls `syncLocalQueue()` before returning from `queueLocalGeneration()`.

### 2. Realtime is still polling-driven

- [src/app/api/studio/hosted/events/route.ts](/Users/nic0le/reelmint/tryplayground/src/app/api/studio/hosted/events/route.ts) polls every `1400ms`.
- [src/app/api/studio/local/events/route.ts](/Users/nic0le/reelmint/tryplayground/src/app/api/studio/local/events/route.ts) polls every `1200ms`.
- [src/server/studio/hosted-store.ts](/Users/nic0le/reelmint/tryplayground/src/server/studio/hosted-store.ts) performs queue sync and full state rebuild during read/sync paths.

### 3. Hosted sync returns too much state too often

- [src/server/studio/hosted-store.ts](/Users/nic0le/reelmint/tryplayground/src/server/studio/hosted-store.ts) rebuilds folders, run files, items, and runs together.
- The grid does not need full run-file/detail payloads on every change.

### 4. Page load is client-heavy

- [src/app/page.tsx](/Users/nic0le/reelmint/tryplayground/src/app/page.tsx) mounts a large client-side studio directly.
- There is no route-level [loading.tsx](/Users/nic0le/reelmint/tryplayground/src/app/loading.tsx), so there is no server-rendered loading UI.

### 5. Media delivery is more expensive than it should be

- Hosted media still flows through [src/app/api/studio/hosted/files/[storagePath]/route.ts](/Users/nic0le/reelmint/tryplayground/src/app/api/studio/hosted/files/[storagePath]/route.ts).
- Gallery thumbnails are not yet optimized around Supabase Storage transforms + Smart CDN.

## Non-Negotiable Product Constraints

- No functionality regressions
- Keep the schema simple
- Keep local and hosted behavior aligned where possible
- Keep model-specific behavior intact
- Maintain accurate queue, credit, and deletion behavior

## Implementation Principles

1. Writes should be cheap and return immediately.
2. Dispatch and recovery should happen off the request path.
3. Reads should not perform provider sync work.
4. Realtime should be event-driven first, with polling only as a watchdog.
5. The gallery should load a lightweight projection, not the full object graph.
6. Thumbnails should be first-class assets, not derived at render time.

## Phase 1: Fast Queue Acknowledgement

### Objective

Show a queued card immediately after click.

### Changes

#### Hosted

- Change [src/app/api/studio/hosted/generate/route.ts](/Users/nic0le/reelmint/tryplayground/src/app/api/studio/hosted/generate/route.ts) and [src/server/studio/hosted-store.ts](/Users/nic0le/reelmint/tryplayground/src/server/studio/hosted-store.ts) so the request does only:
  - validation
  - DB insert for `generation_runs`
  - DB insert for `generation_run_inputs`
  - upload of only required ad-hoc input files
  - credit hold
  - immediate response
- Remove `syncHostedUserQueue()` and full `buildHostedState()` from the hot path.
- Return a minimal mutation response:
  - `run`
  - optional lightweight `galleryEntry`
  - `revision`

#### Local

- Make [src/server/local/local-store.ts](/Users/nic0le/reelmint/tryplayground/src/server/local/local-store.ts) return immediately after SQLite/file writes.
- Move dispatch into an async local background path after response.

#### Frontend

- Insert an optimistic queued card immediately in [src/features/studio/use-studio-runtime-core.ts](/Users/nic0le/reelmint/tryplayground/src/features/studio/use-studio-runtime-core.ts).
- Reconcile the optimistic card with the authoritative server run row when the response or realtime event arrives.

### Acceptance Criteria

- Generate button click always shows a card instantly.
- Queue request no longer waits for provider dispatch.
- No duplicate cards on reconciliation.

## Phase 2: Move Dispatch and Recovery Off Read Paths

### Objective

Prevent page loads and realtime sync from doing provider work.

### Changes

#### Hosted

- Create Trigger.dev tasks using `@trigger.dev/sdk`:
  - `dispatch-hosted-generation`
  - `reconcile-hosted-provider-run`
  - `hosted-queue-watchdog`
- `queueHostedGeneration()` should trigger `dispatch-hosted-generation` and return.
- Fal webhook completion should update DB and broadcast a state-change event, not rely on the next polling tick.
- Recovery logic for stuck runs should move into a Trigger.dev scheduled/watchdog task, not `getHostedSyncPayload()`.

#### Local

- Replace request-path queue sync with an in-process async dispatcher plus watchdog.
- Local read endpoints should only read state.

### Acceptance Criteria

- [src/server/studio/hosted-store.ts](/Users/nic0le/reelmint/tryplayground/src/server/studio/hosted-store.ts) no longer calls provider status/result APIs during sync reads.
- Initial page load is not slowed by Fal/provider checks.

## Phase 3: Replace Hosted Polling with Supabase Broadcast

### Objective

Stop server-side SSE polling loops from driving hosted realtime.

### Changes

- Add Supabase Realtime Broadcast triggers for user-scoped workspace changes:
  - `generation_runs`
  - `library_items`
  - `run_files`
  - `folders`
  - `credit_ledger`
  - `studio_accounts`
- Broadcast payload should stay small:
  - `user_id`
  - `revision`
  - `event_type`
  - `entity_type`
  - `entity_id`
- Replace hosted SSE subscription logic in [src/features/studio/use-studio-runtime-core.ts](/Users/nic0le/reelmint/tryplayground/src/features/studio/use-studio-runtime-core.ts) with a Supabase channel subscription.
- Keep the current hosted SSE route only as a temporary fallback during rollout, then remove it.

### Acceptance Criteria

- Hosted clients update from DB-triggered broadcast events.
- The app no longer depends on a `1400ms` hosted poll loop.
- Completed generations appear without manual reload.

## Phase 4: Slim the Hosted Read Model

### Objective

Send less data on load and on refresh.

### Changes

- Split the hosted read model into:
  - `workspace bootstrap`
  - `gallery feed`
  - `asset detail`
  - `folder list / counts`
- Keep `run_files` out of the main bootstrap unless directly needed by visible gallery cards.
- Build a unified gallery projection for the main grid instead of assembling full items + runs on the client.

Recommended shape:

- `GET /api/studio/hosted/bootstrap`
  - profile
  - credits
  - queue settings
  - model configuration
  - folders
  - first page of gallery entries
  - UI defaults
- `GET /api/studio/hosted/gallery?cursor=...`
  - paginated gallery entries only
- `GET /api/studio/hosted/items/:id`
  - full asset detail payload

### Acceptance Criteria

- Initial hosted load avoids sending the entire workspace graph.
- Asset detail is lazy-loaded only when needed.

## Phase 5: Thumbnail and Media Delivery Optimization

### Objective

Make gallery media cheap to render.

### Changes

- Treat thumbnails as canonical first-class artifacts for all non-text assets.
- For hosted image thumbnails:
  - use Supabase Storage transformations
  - serve transformed, size-appropriate thumbnails
  - let Smart CDN handle edge caching
- For hosted video/audio/alpha PNG:
  - generate and persist thumbnail assets at upload/completion time
- Prefer direct signed Storage URLs for thumbnail delivery instead of proxying through Next.js when auth allows it.
- Keep the current proxy only for protected original-source download paths that genuinely require it.

### Acceptance Criteria

- Gallery cards use small thumbnail URLs, not full source files.
- Image thumbs use transformed dimensions appropriate to card size.
- Reloading the page does not refetch large originals for gallery paint.

## Phase 6: Next.js 16 Route and Bundle Optimization

### Objective

Improve first paint and interactive startup.

### Changes

- Enable a static shell + streamed dynamic workspace using Next.js 16 Cache Components where appropriate.
- Add [src/app/loading.tsx](/Users/nic0le/reelmint/tryplayground/src/app/loading.tsx) for the studio route.
- Keep auth/user-specific workspace data dynamic, but cache stable shell content and low-churn metadata.
- Lazy-load heavy secondary surfaces:
  - settings dialog
  - asset detail dialog
  - feedback dialog
  - upload dialog
- Split studio-only utilities and secondary dialogs out of the initial client bundle.

### Acceptance Criteria

- Route shell appears immediately on navigation/load.
- Heavy dialogs are not part of the initial JS path.

## Phase 7: Query and Index Pass

### Objective

Match indexes to actual production query shapes.

### Changes

- Capture and analyze real query plans using `EXPLAIN` / Supabase Query Performance.
- Add or adjust indexes only where justified by actual feed/bootstrap queries.
- Expected likely additions:
  - main gallery feed index aligned to `user_id + created_at desc`
  - visible-only partial indexes for gallery and run feeds
  - any composite index needed by folder-filtered gallery queries
- Keep existing partial indexes for hidden/deleted run behavior.

### Acceptance Criteria

- Bootstrap and gallery queries use efficient index-backed plans.
- No speculative over-indexing.

## Phase 8: Reliability and Watchdogs

### Objective

Make the system fast without becoming fragile.

### Changes

- Add explicit run state telemetry:
  - queue insert timestamp
  - dispatch start timestamp
  - provider accepted timestamp
  - completion timestamp
- Add Trigger.dev watchdogs for:
  - queued too long
  - processing too long
  - missing webhook reconciliation
- Add client-side recovery behavior:
  - if Broadcast disconnects, reconnect automatically
  - if reconnect lags, do a one-time sync fetch

### Acceptance Criteria

- Stuck runs can be recovered without relying on constant read-time polling.
- Realtime disconnects do not require page reloads.

## Rollout Order

### Sprint 1

- Phase 1
- Phase 2

This is the biggest win for queue speed and “card appears late.”

### Sprint 2

- Phase 3
- Phase 4

This fixes “completed but doesn’t appear until reload” and cuts hosted sync cost.

### Sprint 3

- Phase 5
- Phase 6

This fixes gallery/media load cost and page-load smoothness.

### Sprint 4

- Phase 7
- Phase 8

This hardens the system for scale.

## What We Should Not Do

- Do not build a complex client-side diff engine first.
- Do not keep provider polling inside read endpoints.
- Do not over-index before checking the actual query plans.
- Do not proxy all hosted media forever through Next.js if Storage can serve it directly.
- Do not mix queue dispatch, sync, and bootstrap into one request path.

## Success Metrics

- Generate click to queued card visible:
  - target under 200ms
- Hosted generation completion to visible card:
  - target under 1s median
- Hosted bootstrap API payload size:
  - cut substantially from current full-workspace shape
- Initial route shell:
  - visible immediately with `loading.tsx`
- Manual reload needed to see completed outputs:
  - zero

## References

- Next.js 16 Cache Components: [nextjs.org/docs/app/getting-started/cache-components](https://nextjs.org/docs/app/getting-started/cache-components)
- Next.js 16 loading UI: [nextjs.org/docs/app/api-reference/file-conventions/loading](https://nextjs.org/docs/app/api-reference/file-conventions/loading)
- Next.js 16 release notes: [nextjs.org/blog/next-16](https://nextjs.org/blog/next-16)
- Supabase Realtime Broadcast recommendation: [supabase.com/docs/guides/realtime/subscribing-to-database-changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- Supabase Realtime benchmarks: [supabase.com/docs/guides/realtime/benchmarks](https://supabase.com/docs/guides/realtime/benchmarks)
- Supabase SSR auth for Next.js: [supabase.com/docs/guides/auth/server-side/nextjs](https://supabase.com/docs/guides/auth/server-side/nextjs)
- Supabase Smart CDN: [supabase.com/docs/guides/storage/cdn/smart-cdn](https://supabase.com/docs/guides/storage/cdn/smart-cdn)
- Supabase image transformations: [supabase.com/docs/guides/storage/image-transformations](https://supabase.com/docs/guides/storage/image-transformations)
- Supabase resumable uploads: [supabase.com/docs/guides/storage/uploads/resumable-uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
- Supabase query optimization: [supabase.com/docs/guides/database/query-optimization](https://supabase.com/docs/guides/database/query-optimization)
- Supabase index guidance: [supabase.com/docs/guides/database/postgres/indexes](https://supabase.com/docs/guides/database/postgres/indexes)
- Replicate async prediction pattern: [replicate.com/docs/topics/predictions/create-a-prediction](https://replicate.com/docs/topics/predictions/create-a-prediction)
