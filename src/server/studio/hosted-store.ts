import { randomUUID } from "node:crypto";
import {
  createDraft,
  createGenerationRunPreviewUrl,
  createGenerationRunSummary,
  HOSTED_STUDIO_WORKSPACE_ID,
  hydrateDraft,
  toPersistedDraft,
} from "@/features/studio/studio-local-runtime-data";
import { createAudioThumbnailUrl } from "@/features/studio/studio-asset-thumbnails";
import {
  getHostedStudioFairShare,
  getStudioRunCompletionDelayMs,
  resolveStudioGenerationRequestMode,
} from "@/features/studio/studio-generation-rules";
import { createMediaMetadataFromAspectRatioLabel } from "@/features/studio/studio-asset-metadata";
import { reorderStudioFoldersByIds } from "@/features/studio/studio-folder-order";
import { getStudioModelById } from "@/features/studio/studio-model-catalog";
import {
  normalizeStudioEnabledModelIds,
  resolveConfiguredStudioModelId,
} from "@/features/studio/studio-model-configuration";
import { quoteStudioDraftPricing } from "@/features/studio/studio-model-pricing";
import type {
  HostedStudioGenerateInputDescriptor,
  HostedStudioMutation,
  HostedStudioUploadManifestEntry,
} from "@/features/studio/studio-hosted-api";
import { getStudioUploadedMediaKind } from "@/features/studio/studio-upload-files";
import type {
  GenerationRun,
  LibraryItemKind,
  LibraryItem,
  PersistedStudioDraft,
  StudioCreditBalance,
  StudioCreditPack,
  StudioFolder,
  StudioHostedClientStateDefaults,
  StudioHostedWorkspaceState,
  StudioProfile,
  StudioQueueSettings,
  StudioRunFile,
  StudioWorkspaceDomainState,
} from "@/features/studio/types";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  applyHostedCreditLedgerEntry,
  deleteHostedBillingCustomersForUser,
} from "@/server/studio/hosted-billing";
import {
  getStudioFalQueuedResult,
  getStudioFalQueueStatus,
  resolveStudioFalCompletedPayload,
  submitStudioFalRequest,
  toStudioFalWebhookUrl,
  type StudioFalInputFile,
} from "@/server/fal/studio-fal";
import { getFalServerEnv } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createStudioRouteError } from "@/server/studio/studio-route-errors";
import { validateStudioGenerationRequest } from "@/server/studio/studio-request-validation";
import {
  generateStudioTextProviderPayload,
  getHostedTextProviderKey,
} from "@/server/studio/studio-text-providers";

const HOSTED_SYNC_INTERVAL_MS = 1400;
const HOSTED_MEDIA_BUCKET = "hosted-media";

type HostedSupabaseClient = SupabaseClient<Database>;
type StudioAccountRow = Database["public"]["Tables"]["studio_accounts"]["Row"];
type StudioSystemConfigRow = Database["public"]["Tables"]["studio_system_config"]["Row"];
type FolderRow = Database["public"]["Tables"]["folders"]["Row"];
type RunFileRow = Database["public"]["Tables"]["run_files"]["Row"];
type LibraryItemRow = Database["public"]["Tables"]["library_items"]["Row"];
type GenerationRunRow = Database["public"]["Tables"]["generation_runs"]["Row"];

function createHostedUuid() {
  return randomUUID();
}

function sanitizeStorageFileName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "file.bin";
}

function parseObjectJson(value: Json, fallback: Record<string, unknown> = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fallback;
}

function parseDraftSnapshot(value: Json, modelId: string) {
  const model = getStudioModelById(modelId);
  const fallback = {
    ...toPersistedDraft(createDraft(model)),
    referenceCount: 0,
    startFrameCount: 0,
    endFrameCount: 0,
  } satisfies GenerationRun["draftSnapshot"];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const draft = value as Partial<GenerationRun["draftSnapshot"]>;
  return {
    ...fallback,
    ...draft,
    referenceCount:
      typeof draft.referenceCount === "number" ? draft.referenceCount : 0,
    startFrameCount:
      typeof draft.startFrameCount === "number" ? draft.startFrameCount : 0,
    endFrameCount:
      typeof draft.endFrameCount === "number" ? draft.endFrameCount : 0,
  };
}

function toHostedFileUrl(storagePath: string) {
  return `/api/studio/hosted/files/${encodeURIComponent(storagePath)}`;
}

function resolveStoredAssetUrl(storageBucket: string, storagePath: string | null) {
  if (!storagePath) {
    return null;
  }

  if (storageBucket === HOSTED_MEDIA_BUCKET) {
    return toHostedFileUrl(storagePath);
  }

  if (
    storagePath.startsWith("data:") ||
    storagePath.startsWith("blob:") ||
    /^https?:\/\//i.test(storagePath)
  ) {
    return storagePath;
  }

  return storagePath.startsWith("/") ? storagePath : `/${storagePath}`;
}

function createActiveCreditPack(credits: number | null, updatedAt: string): StudioCreditPack | null {
  if (credits !== 100) {
    return null;
  }

  return {
    id: `credit-pack-${credits}`,
    credits,
    priceCents: 1000,
    currency: "usd",
    isActive: true,
    displayOrder: 0,
    createdAt: updatedAt,
    updatedAt,
  };
}

function mapProfile(account: StudioAccountRow, user: User): StudioProfile {
  return {
    id: account.user_id,
    email: user.email ?? `${account.user_id}@tryplayground.ai`,
    displayName: account.display_name,
    avatarLabel: account.avatar_label,
    avatarUrl: account.avatar_url,
    preferences: {},
    createdAt: account.created_at,
    updatedAt: account.updated_at,
  };
}

function mapCreditBalance(account: StudioAccountRow): StudioCreditBalance {
  return {
    userId: account.user_id,
    balanceCredits: account.credit_balance,
    updatedAt: account.updated_at,
  };
}

function mapQueueSettings(config: StudioSystemConfigRow, activeHostedUserCount: number): StudioQueueSettings {
  return {
    maxActiveJobsPerUser: config.max_active_jobs_per_user,
    providerSlotLimit: config.provider_slot_limit,
    localConcurrencyLimit: config.local_concurrency_limit,
    activeHostedUserCount,
  };
}

async function assertHostedFolderExists(
  supabase: HostedSupabaseClient,
  userId: string,
  folderId: string | null
) {
  if (!folderId) {
    return;
  }

  const { data, error } = await supabase
    .from("folders")
    .select("id")
    .eq("id", folderId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    createStudioRouteError(404, "The selected folder could not be found.");
  }
}

function mapFolder(row: FolderRow): StudioFolder {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: HOSTED_STUDIO_WORKSPACE_ID,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sortOrder: row.sort_order,
  };
}

function mapRunFile(row: RunFileRow): StudioRunFile {
  return {
    id: row.id,
    runId: row.run_id,
    userId: row.user_id,
    fileRole: row.file_role as StudioRunFile["fileRole"],
    sourceType: row.source_type as StudioRunFile["sourceType"],
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileName: row.file_name,
    fileSizeBytes: row.file_size_bytes,
    mediaWidth: row.media_width,
    mediaHeight: row.media_height,
    mediaDurationSeconds: row.media_duration_seconds,
    aspectRatioLabel: row.aspect_ratio_label,
    hasAlpha: row.has_alpha,
    metadata: parseObjectJson(row.metadata),
    createdAt: row.created_at,
  };
}

function mapLibraryItem(
  row: LibraryItemRow,
  runFileMap: Map<string, RunFileRow>,
  thumbnailFileMap: Map<string, RunFileRow>
): LibraryItem {
  const runFile = row.run_file_id ? runFileMap.get(row.run_file_id) ?? null : null;
  const thumbnailFile =
    row.thumbnail_file_id ? thumbnailFileMap.get(row.thumbnail_file_id) ?? null : null;
  const previewUrl =
    row.kind === "text"
      ? null
      : resolveStoredAssetUrl(runFile?.storage_bucket ?? "inline-preview", runFile?.storage_path ?? null);
  const thumbnailUrl =
    row.kind === "text"
      ? null
      : thumbnailFile
        ? resolveStoredAssetUrl(thumbnailFile.storage_bucket, thumbnailFile.storage_path)
        : row.kind === "audio"
          ? createAudioThumbnailUrl({
              title: row.title,
              subtitle: row.meta || "Audio asset",
              accentSeed: row.id,
            })
          : previewUrl;

  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: HOSTED_STUDIO_WORKSPACE_ID,
    runFileId: row.run_file_id,
    sourceRunId: row.source_run_id,
    title: row.title,
    kind: row.kind as LibraryItem["kind"],
    source: row.source as LibraryItem["source"],
    role: row.role as LibraryItem["role"],
    previewUrl,
    thumbnailUrl,
    contentText: row.content_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    modelId: row.model_id,
    runId: row.run_id,
    provider: row.provider as LibraryItem["provider"],
    status: row.status as LibraryItem["status"],
    prompt: row.prompt,
    meta: row.meta,
    mediaWidth: row.media_width,
    mediaHeight: row.media_height,
    mediaDurationSeconds: row.media_duration_seconds,
    aspectRatioLabel: row.aspect_ratio_label,
    hasAlpha: row.has_alpha,
    folderId: row.folder_id,
    storageBucket: runFile?.storage_bucket ?? (row.kind === "text" ? "inline-text" : "inline-preview"),
    storagePath: runFile?.storage_path ?? null,
    thumbnailPath: thumbnailFile?.storage_path ?? null,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    metadata: parseObjectJson(row.metadata),
    errorMessage: row.error_message,
  };
}

function mapGenerationRun(row: GenerationRunRow): GenerationRun {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: HOSTED_STUDIO_WORKSPACE_ID,
    folderId: row.folder_id,
    deletedAt: row.deleted_at,
    modelId: row.model_id,
    modelName: row.model_name,
    kind: row.kind as GenerationRun["kind"],
    provider: row.provider as GenerationRun["provider"],
    requestMode: row.request_mode as GenerationRun["requestMode"],
    status: row.status as GenerationRun["status"],
    prompt: row.prompt,
    createdAt: row.created_at,
    queueEnteredAt: row.queue_entered_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    cancelledAt: row.cancelled_at,
    updatedAt: row.updated_at,
    summary: row.summary,
    outputAssetId: row.output_asset_id,
    previewUrl: row.preview_url,
    errorMessage: row.error_message,
    inputPayload: parseObjectJson(row.input_payload),
    inputSettings: parseObjectJson(row.input_settings),
    providerRequestId: row.provider_request_id,
    providerStatus: row.provider_status,
    estimatedCostUsd: row.estimated_cost_usd,
    actualCostUsd: row.actual_cost_usd,
    estimatedCredits: row.estimated_credits,
    actualCredits: row.actual_credits,
    usageSnapshot: parseObjectJson(row.usage_snapshot),
    outputText: row.output_text,
    pricingSnapshot: parseObjectJson(row.pricing_snapshot),
    dispatchAttemptCount: row.dispatch_attempt_count,
    dispatchLeaseExpiresAt: row.dispatch_lease_expires_at,
    canCancel: row.can_cancel,
    draftSnapshot: parseDraftSnapshot(row.draft_snapshot, row.model_id),
  };
}

async function ensureHostedAccount(supabase: HostedSupabaseClient, user: User) {
  const { data: existingAccount, error: selectError } = await supabase
    .from("studio_accounts")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectError) {
    throw new Error(selectError.message);
  }

  const displayName =
    String(user.user_metadata.full_name ?? "").trim() ||
    String(user.user_metadata.name ?? "").trim() ||
    String(user.user_metadata.display_name ?? "").trim() ||
    (user.email?.split("@")[0] ?? "").trim() ||
    "TryPlayground User";
  const avatarUrl =
    String(user.user_metadata.avatar_url ?? "").trim() ||
    String(user.user_metadata.picture ?? "").trim() ||
    null;

  if (existingAccount) {
    if (
      existingAccount.display_name !== displayName ||
      existingAccount.avatar_url !== avatarUrl ||
      existingAccount.avatar_label !== (displayName.slice(0, 1).toUpperCase() || "T")
    ) {
      const { data: updatedAccount, error: updateError } = await supabase
        .from("studio_accounts")
        .update({
          display_name: displayName,
          avatar_label: displayName.slice(0, 1).toUpperCase() || "T",
          avatar_url: avatarUrl,
        })
        .eq("user_id", user.id)
        .select("*")
        .single();

      if (updateError || !updatedAccount) {
        throw new Error(updateError?.message ?? "Could not sync hosted account.");
      }

      return updatedAccount;
    }

    return existingAccount;
  }

  const { data: insertedAccount, error: insertError } = await supabase
    .from("studio_accounts")
    .insert({
      user_id: user.id,
      display_name: displayName,
      avatar_label: displayName.slice(0, 1).toUpperCase() || "T",
      avatar_url: avatarUrl,
    })
    .select("*")
    .single();

  if (insertError || !insertedAccount) {
    throw new Error(insertError?.message ?? "Could not create hosted account.");
  }

  await applyHostedCreditLedgerEntry({
    supabase,
    userId: user.id,
    deltaCredits: 5,
    reason: "admin_adjustment",
    idempotencyKey: `studio-account:${user.id}:signup-bonus`,
    sourceEventId: `studio_account:${user.id}:signup_bonus`,
    metadata: {
      source: "signup_bonus",
      description: "Free starting credits",
    },
  });

  const { data: creditedAccount, error: reloadError } = await supabase
    .from("studio_accounts")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (reloadError || !creditedAccount) {
    throw new Error(reloadError?.message ?? "Could not reload hosted account.");
  }

  return creditedAccount;
}

async function getHostedSystemConfig(supabase: HostedSupabaseClient) {
  const { data, error } = await supabase
    .from("studio_system_config")
    .select("*")
    .eq("id", true)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not load hosted queue settings.");
  }

  return data;
}

async function getActiveHostedUserCount(supabase: HostedSupabaseClient) {
  const { data, error } = await supabase.rpc("get_tryplayground_active_hosted_user_count");
  if (error) {
    throw new Error(error.message);
  }

  return typeof data === "number" ? data : 1;
}

async function listHostedUserFolders(supabase: HostedSupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function listHostedUserRunFiles(supabase: HostedSupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("run_files")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function listHostedUserItems(supabase: HostedSupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("library_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function listHostedUserRuns(
  supabase: HostedSupabaseClient,
  userId: string,
  options?: {
    includeDeleted?: boolean;
  }
) {
  let query = supabase
    .from("generation_runs")
    .select("*")
    .eq("user_id", userId);

  if (!options?.includeDeleted) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function listHostedRunInputs(supabase: HostedSupabaseClient, runId: string) {
  const { data, error } = await supabase
    .from("generation_run_inputs")
    .select("*")
    .eq("run_id", runId)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function removeHostedStoragePaths(
  supabase: HostedSupabaseClient,
  storagePaths: string[]
) {
  if (storagePaths.length === 0) {
    return;
  }

  const { error } = await supabase.storage
    .from(HOSTED_MEDIA_BUCKET)
    .remove(storagePaths);

  if (error) {
    throw new Error(error.message);
  }
}

async function purgeHostedRuns(params: {
  supabase: HostedSupabaseClient;
  userId: string;
  runIds: string[];
  refundActiveRuns: boolean;
}) {
  const targetRunIdSet = new Set(params.runIds);
  const runRows = await listHostedUserRuns(params.supabase, params.userId, {
    includeDeleted: true,
  });
  const targetRuns = runRows.filter((run) => targetRunIdSet.has(run.id));

  if (targetRuns.length === 0) {
    return;
  }

  const outputAssetIdSet = new Set(
    targetRuns
      .map((run) => run.output_asset_id)
      .filter((value): value is string => Boolean(value))
  );
  const itemRows = await listHostedUserItems(params.supabase, params.userId);
  const generatedItems = itemRows.filter(
    (item) =>
      outputAssetIdSet.has(item.id) ||
      (item.source_run_id ? targetRunIdSet.has(item.source_run_id) : false) ||
      (item.run_id ? targetRunIdSet.has(item.run_id) : false)
  );
  const generatedItemIds = generatedItems.map((item) => item.id);
  const generatedRunFileIdSet = new Set(
    generatedItems
      .flatMap((item) => [item.run_file_id, item.thumbnail_file_id])
      .filter((value): value is string => Boolean(value))
  );
  const runFileRows = await listHostedUserRunFiles(params.supabase, params.userId);
  const generatedRunFiles = runFileRows.filter(
    (runFile) =>
      (runFile.run_id ? targetRunIdSet.has(runFile.run_id) : false) ||
      generatedRunFileIdSet.has(runFile.id)
  );
  const generatedRunFileIds = generatedRunFiles.map((runFile) => runFile.id);
  const hostedStoragePaths = Array.from(
    new Set(
      generatedRunFiles
        .filter((runFile) => runFile.storage_bucket === HOSTED_MEDIA_BUCKET)
        .map((runFile) => runFile.storage_path)
    )
  );

  for (const run of targetRuns) {
    if (
      params.refundActiveRuns &&
      (run.status === "queued" || run.status === "pending" || run.status === "processing") &&
      run.estimated_credits
    ) {
      await applyHostedCreditLedgerEntry({
        supabase: params.supabase,
        userId: params.userId,
        deltaCredits: run.estimated_credits,
        reason: "generation_refund",
        relatedRunId: run.id,
        idempotencyKey: `generation:${run.id}:delete_refund`,
        sourceEventId: `generation_run:${run.id}:deleted`,
        metadata: {
          status: run.status,
        },
      });
    }
  }

  await removeHostedStoragePaths(params.supabase, hostedStoragePaths);

  if (generatedItemIds.length > 0) {
    const { error: deleteItemsError } = await params.supabase
      .from("library_items")
      .delete()
      .eq("user_id", params.userId)
      .in("id", generatedItemIds);

    if (deleteItemsError) {
      throw new Error(deleteItemsError.message);
    }
  }

  if (generatedRunFileIds.length > 0) {
    const { error: deleteRunFilesError } = await params.supabase
      .from("run_files")
      .delete()
      .eq("user_id", params.userId)
      .in("id", generatedRunFileIds);

    if (deleteRunFilesError) {
      throw new Error(deleteRunFilesError.message);
    }
  }

  const { error: deleteRunsError } = await params.supabase
    .from("generation_runs")
    .delete()
    .eq("user_id", params.userId)
    .in("id", Array.from(targetRunIdSet));

  if (deleteRunsError) {
    throw new Error(deleteRunsError.message);
  }
}

async function deleteHostedRuns(params: {
  supabase: HostedSupabaseClient;
  user: User;
  runIds: string[];
}) {
  const targetRunIdSet = new Set(params.runIds);
  const runRows = await listHostedUserRuns(params.supabase, params.user.id, {
    includeDeleted: true,
  });
  const targetRuns = runRows.filter((run) => targetRunIdSet.has(run.id));

  if (targetRuns.length === 0) {
    return;
  }

  const deletedAt = new Date().toISOString();
  const processingRunIds = targetRuns
    .filter((run) => run.status === "processing")
    .map((run) => run.id);
  const hardDeleteRunIds = targetRuns
    .filter((run) => run.status !== "processing")
    .map((run) => run.id);

  if (processingRunIds.length > 0) {
    const { error: hideRunsError } = await params.supabase
      .from("generation_runs")
      .update({
        deleted_at: deletedAt,
        updated_at: deletedAt,
        can_cancel: false,
      })
      .eq("user_id", params.user.id)
      .in("id", processingRunIds);

    if (hideRunsError) {
      throw new Error(hideRunsError.message);
    }
  }

  if (hardDeleteRunIds.length > 0) {
    await purgeHostedRuns({
      supabase: params.supabase,
      userId: params.user.id,
      runIds: hardDeleteRunIds,
      refundActiveRuns: true,
    });
  }
}

async function finalizeDeletedHostedRun(params: {
  supabase: HostedSupabaseClient;
  run: GenerationRunRow;
}) {
  await purgeHostedRuns({
    supabase: params.supabase,
    userId: params.run.user_id,
    runIds: [params.run.id],
    refundActiveRuns: false,
  });
}

async function getHostedRunByProviderRequestId(
  supabase: HostedSupabaseClient,
  requestId: string
) {
  const { data, error } = await supabase
    .from("generation_runs")
    .select("*")
    .eq("provider_request_id", requestId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getHostedRunById(
  supabase: HostedSupabaseClient,
  runId: string
) {
  const { data, error } = await supabase
    .from("generation_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function findHostedGeneratedItemIdForRun(params: {
  supabase: HostedSupabaseClient;
  userId: string;
  runId: string;
  preferredItemId?: string | null;
}) {
  const preferredItemId = params.preferredItemId?.trim() || null;

  if (preferredItemId) {
    const { data, error } = await params.supabase
      .from("library_items")
      .select("id")
      .eq("id", preferredItemId)
      .eq("user_id", params.userId)
      .eq("source", "generated")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data.id;
    }
  }

  const { data, error } = await params.supabase
    .from("library_items")
    .select("id")
    .eq("user_id", params.userId)
    .eq("source", "generated")
    .or(`source_run_id.eq.${params.runId},run_id.eq.${params.runId}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

async function removeHostedGeneratedOutputArtifacts(params: {
  supabase: HostedSupabaseClient;
  userId: string;
  runFileId: string | null;
  storagePath: string | null;
}) {
  if (params.storagePath) {
    await removeHostedStoragePaths(params.supabase, [params.storagePath]);
  }

  if (!params.runFileId) {
    return;
  }

  const { error } = await params.supabase
    .from("run_files")
    .delete()
    .eq("id", params.runFileId)
    .eq("user_id", params.userId);

  if (error) {
    throw new Error(error.message);
  }
}

async function markHostedRunCompleted(params: {
  supabase: HostedSupabaseClient;
  run: GenerationRunRow;
  outputAssetId: string;
  finishedAt: string;
  outputText: string | null;
  usageSnapshot: Record<string, unknown>;
}) {
  const usageCost =
    typeof params.usageSnapshot.cost === "number" ? params.usageSnapshot.cost : null;
  const { error: runError } = await params.supabase
    .from("generation_runs")
    .update({
      status: "completed",
      provider_status: "completed",
      output_asset_id: params.outputAssetId,
      actual_cost_usd: usageCost ?? params.run.estimated_cost_usd,
      actual_credits: params.run.estimated_credits,
      completed_at: params.finishedAt,
      updated_at: params.finishedAt,
      can_cancel: false,
      output_text: params.outputText,
      usage_snapshot: params.usageSnapshot as Json,
    })
    .eq("id", params.run.id)
    .eq("user_id", params.run.user_id)
    .is("deleted_at", null);

  if (runError) {
    throw new Error(runError.message);
  }
}

async function downloadHostedStorageBlob(params: {
  supabase: HostedSupabaseClient;
  storageBucket: string;
  storagePath: string;
}) {
  if (params.storageBucket === HOSTED_MEDIA_BUCKET) {
    const { data, error } = await params.supabase
      .storage
      .from(HOSTED_MEDIA_BUCKET)
      .download(params.storagePath);

    if (error || !data) {
      throw new Error(error?.message ?? "Could not load hosted input file.");
    }

    return data;
  }

  const response = await fetch(resolveStoredAssetUrl(params.storageBucket, params.storagePath) ?? "");
  if (!response.ok) {
    throw new Error("Could not download hosted input file.");
  }

  return response.blob();
}

async function loadHostedRunInputFiles(params: {
  supabase: HostedSupabaseClient;
  run: GenerationRunRow;
}) {
  const inputRows = await listHostedRunInputs(params.supabase, params.run.id);
  if (inputRows.length === 0) {
    return [] satisfies StudioFalInputFile[];
  }

  const runFileIds = inputRows
    .map((row) => row.run_file_id)
    .filter((value): value is string => Boolean(value));
  const libraryItemIds = inputRows
    .map((row) => row.library_item_id)
    .filter((value): value is string => Boolean(value));

  const [runFilesResult, libraryItemsResult] = await Promise.all([
    runFileIds.length > 0
      ? params.supabase
          .from("run_files")
          .select("*")
          .in("id", runFileIds)
      : Promise.resolve({ data: [], error: null }),
    libraryItemIds.length > 0
      ? params.supabase
          .from("library_items")
          .select("*")
          .in("id", libraryItemIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (runFilesResult.error) {
    throw new Error(runFilesResult.error.message);
  }

  if (libraryItemsResult.error) {
    throw new Error(libraryItemsResult.error.message);
  }

  const runFileMap = new Map((runFilesResult.data ?? []).map((row) => [row.id, row]));
  const libraryItemMap = new Map((libraryItemsResult.data ?? []).map((row) => [row.id, row]));

  const relatedRunFileIds = (libraryItemsResult.data ?? [])
    .map((row) => row.run_file_id)
    .filter((value): value is string => Boolean(value));

  if (relatedRunFileIds.length > 0) {
    const { data, error } = await params.supabase
      .from("run_files")
      .select("*")
      .in("id", relatedRunFileIds);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of data ?? []) {
      runFileMap.set(row.id, row);
    }
  }

  const inputs: StudioFalInputFile[] = [];

  for (const row of inputRows) {
    const directRunFile = row.run_file_id ? runFileMap.get(row.run_file_id) ?? null : null;
    const libraryItem = row.library_item_id
      ? libraryItemMap.get(row.library_item_id) ?? null
      : null;
    const libraryRunFile =
      libraryItem?.run_file_id ? runFileMap.get(libraryItem.run_file_id) ?? null : null;
    const sourceRunFile = directRunFile ?? libraryRunFile;

    if (!sourceRunFile || !sourceRunFile.storage_path) {
      continue;
    }

    const blob = await downloadHostedStorageBlob({
      supabase: params.supabase,
      storageBucket: sourceRunFile.storage_bucket,
      storagePath: sourceRunFile.storage_path,
    });

    inputs.push({
      slot:
        row.input_role === "start_frame"
          ? "start_frame"
          : row.input_role === "end_frame"
            ? "end_frame"
            : "reference",
      kind:
        (libraryItem?.kind as StudioFalInputFile["kind"] | undefined) ??
        (sourceRunFile.mime_type?.startsWith("video/")
          ? "video"
          : sourceRunFile.mime_type?.startsWith("audio/")
            ? "audio"
            : "image"),
      title: libraryItem?.title ?? sourceRunFile.file_name ?? "Input asset",
      file: blob,
      fileName: sourceRunFile.file_name,
      mimeType: sourceRunFile.mime_type,
    });
  }

  return inputs;
}

async function buildHostedDomainState(params: {
  supabase: HostedSupabaseClient;
  user: User;
  account: StudioAccountRow;
  systemConfig: StudioSystemConfigRow;
  activeHostedUserCount: number;
}): Promise<StudioWorkspaceDomainState> {
  const [folderRows, runFileRows, itemRows, runRows] = await Promise.all([
    listHostedUserFolders(params.supabase, params.user.id),
    listHostedUserRunFiles(params.supabase, params.user.id),
    listHostedUserItems(params.supabase, params.user.id),
    listHostedUserRuns(params.supabase, params.user.id),
  ]);

  const runFileMap = new Map(runFileRows.map((row) => [row.id, row]));
  const folders = folderRows.map(mapFolder);
  const runFiles = runFileRows.map(mapRunFile);
  const libraryItems = itemRows.map((row) =>
    mapLibraryItem(row, runFileMap, runFileMap)
  );
  const generationRuns = runRows.map(mapGenerationRun);

  return {
    profile: mapProfile(params.account, params.user),
    creditBalance: mapCreditBalance(params.account),
    activeCreditPack: createActiveCreditPack(
      params.account.active_credit_pack,
      params.account.updated_at
    ),
    modelConfiguration: {
      enabledModelIds: params.account.enabled_model_ids,
      updatedAt: params.account.updated_at,
    },
    queueSettings: mapQueueSettings(
      params.systemConfig,
      params.activeHostedUserCount
    ),
    folders,
    runFiles,
    libraryItems,
    generationRuns,
  };
}

async function buildHostedState(params: {
  supabase: HostedSupabaseClient;
  user: User;
  account?: StudioAccountRow;
  systemConfig?: StudioSystemConfigRow;
  activeHostedUserCount?: number;
}) {
  const account =
    params.account ?? (await ensureHostedAccount(params.supabase, params.user));
  const systemConfig =
    params.systemConfig ?? (await getHostedSystemConfig(params.supabase));
  const activeHostedUserCount =
    params.activeHostedUserCount ?? (await getActiveHostedUserCount(params.supabase));
  const domainState = await buildHostedDomainState({
    supabase: params.supabase,
    user: params.user,
    account,
    systemConfig,
    activeHostedUserCount,
  });

  return {
    account,
    systemConfig,
    activeHostedUserCount,
    state: {
      schemaVersion: 6,
      mode: "hosted",
      revision: account.revision,
      syncedAt: new Date().toISOString(),
      ...domainState,
    } satisfies StudioHostedWorkspaceState,
    uiStateDefaults: {
      selectedModelId: account.selected_model_id,
      gallerySizeLevel: account.gallery_size_level,
    } satisfies StudioHostedClientStateDefaults,
  };
}

async function uploadHostedGeneratedOutputFile(params: {
  supabase: HostedSupabaseClient;
  run: GenerationRunRow;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
}) {
  const response = await fetch(params.fileUrl);
  if (!response.ok) {
    throw new Error("Could not download the generated output from Fal.");
  }

  const blob = await response.blob();
  const runFileId = createHostedUuid();
  const fileName =
    params.fileName ?? `${params.run.model_id}-${params.run.id}.${blob.type.split("/").pop() ?? "bin"}`;
  const storagePath = `${params.run.user_id}/${runFileId}-${sanitizeStorageFileName(fileName)}`;
  const { error } = await params.supabase.storage
    .from(HOSTED_MEDIA_BUCKET)
    .upload(storagePath, blob, {
      contentType: params.mimeType ?? blob.type ?? "application/octet-stream",
      upsert: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  return {
    runFileId,
    storagePath,
    byteSize: blob.size,
    mimeType: params.mimeType ?? blob.type ?? "application/octet-stream",
    fileName,
  };
}

async function completeHostedRunFromProviderPayload(params: {
  supabase: HostedSupabaseClient;
  run: GenerationRunRow;
  payload: Record<string, unknown>;
}) {
  const currentRun = await getHostedRunById(params.supabase, params.run.id);
  if (!currentRun) {
    return;
  }

  if (currentRun.deleted_at) {
    await finalizeDeletedHostedRun({
      supabase: params.supabase,
      run: currentRun,
    });
    return;
  }

  const model = getStudioModelById(currentRun.model_id);
  const draft = hydrateDraft(
    parseDraftSnapshot(currentRun.draft_snapshot, currentRun.model_id),
    model
  );
  const resolved = resolveStudioFalCompletedPayload({
    modelId: currentRun.model_id,
    requestMode: currentRun.request_mode as GenerationRun["requestMode"],
    draft: toPersistedDraft(draft),
    payload: params.payload,
  });
  const finishedAt = new Date().toISOString();
  const outputTitle =
    currentRun.prompt.trim().slice(0, 72) || `${currentRun.model_name} output`;
  const existingItemId = await findHostedGeneratedItemIdForRun({
    supabase: params.supabase,
    userId: currentRun.user_id,
    runId: currentRun.id,
    preferredItemId: currentRun.output_asset_id,
  });

  if (existingItemId) {
    if (currentRun.status === "completed" && currentRun.output_asset_id === existingItemId) {
      return;
    }

    await markHostedRunCompleted({
      supabase: params.supabase,
      run: currentRun,
      outputAssetId: existingItemId,
      finishedAt,
      outputText: resolved.outputText,
      usageSnapshot: resolved.usageSnapshot,
    });
    return;
  }

  let outputRunFileId: string | null = null;
  let outputStoragePath: string | null = null;
  let fileName: string | null = null;
  let mimeType: string | null = null;
  let byteSize: number | null = null;
  let mediaWidth: number | null = null;
  let mediaHeight: number | null = null;
  let mediaDurationSeconds: number | null = null;
  let aspectRatioLabel: string | null = null;
  let hasAlpha = false;

  if (resolved.outputFile) {
    const uploaded = await uploadHostedGeneratedOutputFile({
      supabase: params.supabase,
      run: currentRun,
      fileUrl: resolved.outputFile.url,
      fileName: resolved.outputFile.fileName,
      mimeType: resolved.outputFile.mimeType,
    });
    outputRunFileId = uploaded.runFileId;
    outputStoragePath = uploaded.storagePath;
    fileName = uploaded.fileName;
    mimeType = uploaded.mimeType;
    byteSize = uploaded.byteSize;
    mediaWidth = resolved.outputFile.mediaWidth;
    mediaHeight = resolved.outputFile.mediaHeight;
    mediaDurationSeconds = resolved.outputFile.mediaDurationSeconds;
    aspectRatioLabel = resolved.outputFile.aspectRatioLabel;
    hasAlpha = resolved.outputFile.hasAlpha;

    const { error: runFileError } = await params.supabase.from("run_files").insert({
      id: outputRunFileId,
      run_id: currentRun.id,
      user_id: currentRun.user_id,
      file_role: "output",
      source_type: "generated",
      storage_bucket: HOSTED_MEDIA_BUCKET,
      storage_path: uploaded.storagePath,
      mime_type: mimeType,
      file_name: fileName,
      file_size_bytes: byteSize,
      media_width: mediaWidth,
      media_height: mediaHeight,
      media_duration_seconds: mediaDurationSeconds,
      aspect_ratio_label: aspectRatioLabel,
      has_alpha: hasAlpha,
      metadata: {} as Json,
      created_at: finishedAt,
    });

    if (runFileError) {
      throw new Error(runFileError.message);
    }
  } else if (resolved.outputKind !== "text") {
    const inferredMetadata = createMediaMetadataFromAspectRatioLabel(
      resolved.outputKind,
      draft.aspectRatio
    );
    mediaWidth = inferredMetadata.mediaWidth;
    mediaHeight = inferredMetadata.mediaHeight;
    aspectRatioLabel = inferredMetadata.aspectRatioLabel;
  }

  const nextItemId = createHostedUuid();
  const latestRun = await getHostedRunById(params.supabase, currentRun.id);
  if (!latestRun) {
    if (outputRunFileId) {
      await params.supabase.from("run_files").delete().eq("id", outputRunFileId);
    }
    if (outputStoragePath) {
      await removeHostedStoragePaths(params.supabase, [outputStoragePath]);
    }
    return;
  }

  if (latestRun.deleted_at) {
    await removeHostedGeneratedOutputArtifacts({
      supabase: params.supabase,
      userId: currentRun.user_id,
      runFileId: outputRunFileId,
      storagePath: outputStoragePath,
    });
    await finalizeDeletedHostedRun({
      supabase: params.supabase,
      run: latestRun,
    });
    return;
  }

  const latestExistingItemId = await findHostedGeneratedItemIdForRun({
    supabase: params.supabase,
    userId: latestRun.user_id,
    runId: latestRun.id,
    preferredItemId: latestRun.output_asset_id,
  });

  if (latestExistingItemId) {
    await removeHostedGeneratedOutputArtifacts({
      supabase: params.supabase,
      userId: latestRun.user_id,
      runFileId: outputRunFileId,
      storagePath: outputStoragePath,
    });

    if (latestRun.status === "completed" && latestRun.output_asset_id === latestExistingItemId) {
      return;
    }

    await markHostedRunCompleted({
      supabase: params.supabase,
      run: latestRun,
      outputAssetId: latestExistingItemId,
      finishedAt,
      outputText: resolved.outputText,
      usageSnapshot: resolved.usageSnapshot,
    });
    return;
  }

  const { error: itemError } = await params.supabase.from("library_items").insert({
    id: nextItemId,
    user_id: latestRun.user_id,
    run_file_id: outputRunFileId,
    thumbnail_file_id: null,
    source_run_id: latestRun.id,
    title: outputTitle,
    kind: resolved.outputKind,
    source: "generated",
    role: "generated_output",
    content_text: resolved.outputText,
    created_at: finishedAt,
    updated_at: finishedAt,
    model_id: latestRun.model_id,
    run_id: latestRun.id,
    provider: latestRun.provider as LibraryItem["provider"],
    status: "ready",
    prompt: latestRun.prompt,
    meta: `${latestRun.model_name} • ${latestRun.summary}`,
    media_width: mediaWidth,
    media_height: mediaHeight,
    media_duration_seconds: mediaDurationSeconds,
    aspect_ratio_label: aspectRatioLabel,
    has_alpha: hasAlpha,
    folder_id: latestRun.folder_id,
    file_name: fileName,
    mime_type: mimeType,
    byte_size: byteSize,
    metadata: resolved.providerPayload as Json,
    error_message: null,
  });

  if (itemError) {
    if (itemError.code === "23505") {
      const conflictingItemId = await findHostedGeneratedItemIdForRun({
        supabase: params.supabase,
        userId: latestRun.user_id,
        runId: latestRun.id,
        preferredItemId: latestRun.output_asset_id,
      });

      if (conflictingItemId) {
        await removeHostedGeneratedOutputArtifacts({
          supabase: params.supabase,
          userId: latestRun.user_id,
          runFileId: outputRunFileId,
          storagePath: outputStoragePath,
        });

        await markHostedRunCompleted({
          supabase: params.supabase,
          run: latestRun,
          outputAssetId: conflictingItemId,
          finishedAt,
          outputText: resolved.outputText,
          usageSnapshot: resolved.usageSnapshot,
        });
        return;
      }
    }

    throw new Error(itemError.message);
  }

  await markHostedRunCompleted({
    supabase: params.supabase,
    run: latestRun,
    outputAssetId: nextItemId,
    finishedAt,
    outputText: resolved.outputText,
    usageSnapshot: resolved.usageSnapshot,
  });
}

async function failHostedRun(params: {
  supabase: HostedSupabaseClient;
  run: GenerationRunRow;
  refundCredits: boolean;
  errorMessage: string;
}) {
  const currentRun = await getHostedRunById(params.supabase, params.run.id);
  if (!currentRun) {
    return;
  }

  if (currentRun.deleted_at) {
    await finalizeDeletedHostedRun({
      supabase: params.supabase,
      run: currentRun,
    });
    return;
  }

  const finishedAt = new Date().toISOString();

  const { error } = await params.supabase
    .from("generation_runs")
    .update({
      status: "failed",
      provider_status: "failed",
      completed_at: finishedAt,
      failed_at: finishedAt,
      updated_at: finishedAt,
      can_cancel: false,
      error_message: params.errorMessage,
    })
    .eq("id", currentRun.id)
    .eq("user_id", currentRun.user_id);

  if (error) {
    throw new Error(error.message);
  }

  if (params.refundCredits && currentRun.estimated_credits) {
    await applyHostedCreditLedgerEntry({
      supabase: params.supabase,
      userId: currentRun.user_id,
      deltaCredits: currentRun.estimated_credits,
      reason: "generation_refund",
      relatedRunId: currentRun.id,
      idempotencyKey: `generation:${currentRun.id}:failed_refund`,
      sourceEventId: `generation_run:${currentRun.id}:failed`,
      metadata: {
        status: "failed",
      },
    });
  }
}

async function dispatchHostedRun(params: {
  supabase: HostedSupabaseClient;
  run: GenerationRunRow;
  webhookBaseUrl: string;
}) {
  const model = getStudioModelById(params.run.model_id);
  const draft = hydrateDraft(
    parseDraftSnapshot(params.run.draft_snapshot, params.run.model_id),
    model
  );
  const requestMode = params.run.request_mode as GenerationRun["requestMode"];
  const startedAt = new Date().toISOString();

  if (model.kind === "text") {
    const providerApiKey = getHostedTextProviderKey(params.run.model_id);
    if (!providerApiKey) {
      throw new Error(`${model.providerLabel} is not configured on the hosted server.`);
    }

    const { data: claimedRun, error: startError } = await params.supabase
      .from("generation_runs")
      .update({
        status: "processing",
        started_at: startedAt,
        updated_at: startedAt,
        provider_status: "running",
        dispatch_attempt_count: params.run.dispatch_attempt_count + 1,
        can_cancel: false,
      })
      .eq("id", params.run.id)
      .eq("user_id", params.run.user_id)
      .in("status", ["queued", "pending"])
      .select("*")
      .maybeSingle();

    if (startError) {
      throw new Error(startError.message);
    }

    if (!claimedRun) {
      return;
    }

    const inputs = await loadHostedRunInputFiles({
      supabase: params.supabase,
      run: claimedRun,
    });
    const result = await generateStudioTextProviderPayload({
      modelId: claimedRun.model_id,
      prompt: draft.prompt,
      providerApiKey,
      inputs,
    });

    await completeHostedRunFromProviderPayload({
      supabase: params.supabase,
      run: {
        ...claimedRun,
        status: "processing",
        started_at: startedAt,
        updated_at: startedAt,
        provider_status: "running",
      },
      payload: result.payload,
    });
    return;
  }

  const { falKey, webhookSecret } = getFalServerEnv();
  if (!webhookSecret) {
    throw new Error("FAL_WEBHOOK_SECRET is not configured.");
  }

  const { data: claimedRun, error: claimError } = await params.supabase
    .from("generation_runs")
    .update({
      status: "processing",
      started_at: startedAt,
      updated_at: startedAt,
      provider_status: "in_queue",
      dispatch_attempt_count: params.run.dispatch_attempt_count + 1,
      can_cancel: false,
    })
    .eq("id", params.run.id)
    .eq("user_id", params.run.user_id)
    .in("status", ["queued", "pending"])
    .select("*")
    .maybeSingle();

  if (claimError) {
    throw new Error(claimError.message);
  }

  if (!claimedRun) {
    return;
  }

  const inputs = await loadHostedRunInputFiles({
    supabase: params.supabase,
    run: claimedRun,
  });
  const queuedRequest = await submitStudioFalRequest({
    falKey,
    modelId: claimedRun.model_id,
    requestMode,
    draft: toPersistedDraft(draft),
    inputs,
    webhookUrl: toStudioFalWebhookUrl({
      baseUrl: params.webhookBaseUrl,
      runId: claimedRun.id,
      webhookSecret,
    }),
  });
  const { error } = await params.supabase
    .from("generation_runs")
    .update({
      status: "processing",
      started_at: startedAt,
      updated_at: startedAt,
      provider_request_id: queuedRequest.requestId,
      provider_status: "in_queue",
      can_cancel: false,
      input_payload: {
        ...parseObjectJson(claimedRun.input_payload),
        provider_endpoint_id: queuedRequest.endpointId,
      } as Json,
    })
    .eq("id", claimedRun.id)
    .eq("user_id", claimedRun.user_id)
    .eq("status", "processing");

  if (error) {
    throw new Error(error.message);
  }
}

async function dispatchHostedQueuedRuns(params: {
  supabase: HostedSupabaseClient;
  userId: string;
  systemConfig: StudioSystemConfigRow;
  activeHostedUserCount: number;
  runRows: GenerationRunRow[];
  webhookBaseUrl: string;
}) {
  const processingCount = params.runRows.filter(
    (run) => run.status === "processing"
  ).length;
  const fairShare = getHostedStudioFairShare({
    queueSettings: {
      activeHostedUserCount: params.activeHostedUserCount,
      providerSlotLimit: params.systemConfig.provider_slot_limit,
    },
    userId: params.userId,
  });
  const availableDispatchSlots = Math.max(0, fairShare.maxProcessing - processingCount);

  if (availableDispatchSlots <= 0) {
    return;
  }

  const queuedRuns = params.runRows
    .filter((run) => run.status === "queued" || run.status === "pending")
    .sort(
      (left, right) =>
        Date.parse(left.queue_entered_at) - Date.parse(right.queue_entered_at)
    );

  for (const run of queuedRuns.slice(0, availableDispatchSlots)) {
    try {
      await dispatchHostedRun({
        supabase: params.supabase,
        run,
        webhookBaseUrl: params.webhookBaseUrl,
      });
    } catch (error) {
      await failHostedRun({
        supabase: params.supabase,
        run,
        refundCredits: true,
        errorMessage:
          error instanceof Error
            ? error.message
            : "The hosted generation could not be submitted to Fal.",
      });
    }
  }
}

async function syncHostedUserQueue(params: {
  supabase: HostedSupabaseClient;
  user: User;
  webhookBaseUrl: string;
}) {
  await ensureHostedAccount(params.supabase, params.user);
  const [systemConfig, activeHostedUserCount, runRows] = await Promise.all([
    getHostedSystemConfig(params.supabase),
    getActiveHostedUserCount(params.supabase),
    listHostedUserRuns(params.supabase, params.user.id, {
      includeDeleted: true,
    }),
  ]);

  const processingRuns = runRows.filter((run) => run.status === "processing");
  for (const run of processingRuns) {
    const model = getStudioModelById(run.model_id);
    if (model.kind === "text" && model.provider !== "fal") {
      const startedAt = run.started_at ? Date.parse(run.started_at) : Date.now();
      if (Date.now() - startedAt > 120_000) {
        await failHostedRun({
          supabase: params.supabase,
          run,
          refundCredits: true,
          errorMessage:
            "The direct text generation did not finish and had to be reset.",
        });
      }
      continue;
    }

    const providerRequestId = run.provider_request_id?.trim() || null;
    const providerEndpointId = String(
      parseObjectJson(run.input_payload).provider_endpoint_id ?? ""
    ).trim();

    if (!providerRequestId || !providerEndpointId) {
      const startedAt = run.started_at ? Date.parse(run.started_at) : Date.now();
      if (
        Date.now() - startedAt <
        getStudioRunCompletionDelayMs({ kind: run.kind as GenerationRun["kind"] })
      ) {
        continue;
      }

      await failHostedRun({
        supabase: params.supabase,
        run,
        refundCredits: true,
        errorMessage:
          "The queued provider request could not be recovered for this generation.",
      });
      continue;
    }

    try {
      const { falKey } = getFalServerEnv();
      const queueStatus = await getStudioFalQueueStatus({
        falKey,
        endpointId: providerEndpointId,
        requestId: providerRequestId,
      });
      const normalizedStatus = String(queueStatus.status ?? "").toLowerCase();
      const nextProviderStatus =
        normalizedStatus === "completed"
          ? "completed"
          : normalizedStatus === "in_progress"
            ? "running"
            : "in_queue";

      if (nextProviderStatus !== run.provider_status) {
        await params.supabase
          .from("generation_runs")
          .update({
            provider_status: nextProviderStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", run.id)
          .eq("user_id", run.user_id)
          .eq("status", "processing");
      }

      if (normalizedStatus === "completed") {
        const result = await getStudioFalQueuedResult({
          falKey,
          endpointId: providerEndpointId,
          requestId: providerRequestId,
        });

        await completeHostedRunFromProviderPayload({
          supabase: params.supabase,
          run,
          payload:
            result && typeof result.data === "object" && result.data !== null
              ? (result.data as Record<string, unknown>)
              : {},
        });
        continue;
      }
    } catch (error) {
      void error;
    }
  }

  const refreshedRuns = await listHostedUserRuns(params.supabase, params.user.id, {
    includeDeleted: true,
  });
  await dispatchHostedQueuedRuns({
    supabase: params.supabase,
    userId: params.user.id,
    systemConfig,
    activeHostedUserCount,
    runRows: refreshedRuns,
    webhookBaseUrl: params.webhookBaseUrl,
  });
}

export async function syncHostedQueueForUserId(params: {
  supabase: HostedSupabaseClient;
  userId: string;
  webhookBaseUrl: string;
}) {
  const [systemConfig, activeHostedUserCount, runRows] = await Promise.all([
    getHostedSystemConfig(params.supabase),
    getActiveHostedUserCount(params.supabase),
    listHostedUserRuns(params.supabase, params.userId, {
      includeDeleted: true,
    }),
  ]);

  await dispatchHostedQueuedRuns({
    supabase: params.supabase,
    userId: params.userId,
    systemConfig,
    activeHostedUserCount,
    runRows,
    webhookBaseUrl: params.webhookBaseUrl,
  });
}

export async function handleHostedFalWebhook(params: {
  supabase: HostedSupabaseClient;
  requestId: string;
  runId: string | null;
  status: "OK" | "ERROR";
  payload: Record<string, unknown>;
  errorMessage: string | null;
  webhookBaseUrl: string;
}) {
  const run =
    (params.runId
      ? await getHostedRunById(params.supabase, params.runId)
      : null) ??
    (await getHostedRunByProviderRequestId(params.supabase, params.requestId));

  if (!run) {
    return {
      ok: true,
      userId: null,
      runId: params.runId,
      alreadyProcessed: true,
    };
  }

  if (run.provider_request_id && run.provider_request_id !== params.requestId) {
    throw new Error("The webhook request id did not match the stored generation run.");
  }

  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    return {
      ok: true,
      userId: run.user_id,
      runId: run.id,
      alreadyProcessed: true,
    };
  }

  if (params.status === "OK") {
    await completeHostedRunFromProviderPayload({
      supabase: params.supabase,
      run,
      payload: params.payload,
    });
  } else {
    await failHostedRun({
      supabase: params.supabase,
      run,
      refundCredits: true,
      errorMessage:
        params.errorMessage ??
        "Fal generation failed before an output asset was returned.",
    });
  }

  await syncHostedQueueForUserId({
    supabase: params.supabase,
    userId: run.user_id,
    webhookBaseUrl: params.webhookBaseUrl,
  });

  return {
    ok: true,
    userId: run.user_id,
    runId: run.id,
    alreadyProcessed: false,
  };
}

export async function getHostedSyncPayload(params: {
  supabase: HostedSupabaseClient;
  user: User;
  sinceRevision: number | null;
  webhookBaseUrl: string;
}) {
  await syncHostedUserQueue({
    supabase: params.supabase,
    user: params.user,
    webhookBaseUrl: params.webhookBaseUrl,
  });

  const nextState = await buildHostedState({
    supabase: params.supabase,
    user: params.user,
  });

  if (
    params.sinceRevision !== null &&
    params.sinceRevision >= nextState.state.revision
  ) {
    return {
      kind: "noop" as const,
      revision: nextState.state.revision,
      syncIntervalMs: HOSTED_SYNC_INTERVAL_MS,
    };
  }

  return {
    kind: params.sinceRevision === null ? ("bootstrap" as const) : ("refresh" as const),
    revision: nextState.state.revision,
    syncIntervalMs: HOSTED_SYNC_INTERVAL_MS,
    uiStateDefaults:
      params.sinceRevision === null ? nextState.uiStateDefaults : undefined,
    state: nextState.state,
  };
}

export async function mutateHostedState(params: {
  supabase: HostedSupabaseClient;
  user: User;
  mutation: HostedStudioMutation;
}) {
  await ensureHostedAccount(params.supabase, params.user);
  const mutation = params.mutation;

  switch (mutation.action) {
    case "set_enabled_models": {
      const enabledModelIds = normalizeStudioEnabledModelIds(mutation.enabledModelIds);
      const { error } = await params.supabase
        .from("studio_accounts")
        .update({
          enabled_model_ids: enabledModelIds,
        })
        .eq("user_id", params.user.id);

      if (error) {
        throw new Error(error.message);
      }
      break;
    }
    case "save_ui_state": {
      const { data: account, error: accountError } = await params.supabase
        .from("studio_accounts")
        .select("enabled_model_ids")
        .eq("user_id", params.user.id)
        .single();

      if (accountError || !account) {
        throw new Error(accountError?.message ?? "Could not load the studio account.");
      }

      const enabledModelIds = normalizeStudioEnabledModelIds(account.enabled_model_ids);
      const selectedModelId = resolveConfiguredStudioModelId({
        currentModelId: mutation.selectedModelId,
        enabledModelIds,
      });
      const { error } = await params.supabase
        .from("studio_accounts")
        .update({
          selected_model_id: selectedModelId,
          gallery_size_level: mutation.gallerySizeLevel,
        })
        .eq("user_id", params.user.id);

      if (error) {
        throw new Error(error.message);
      }
      break;
    }
    case "create_folder": {
      const folders = await listHostedUserFolders(params.supabase, params.user.id);
      const { error } = await params.supabase.from("folders").insert({
        user_id: params.user.id,
        name: mutation.name.trim(),
        sort_order: folders.length,
      });

      if (error) {
        throw new Error(error.message);
      }
      break;
    }
    case "rename_folder": {
      await assertHostedFolderExists(params.supabase, params.user.id, mutation.folderId);
      const { error } = await params.supabase
        .from("folders")
        .update({
          name: mutation.name.trim(),
        })
        .eq("id", mutation.folderId)
        .eq("user_id", params.user.id);

      if (error) {
        throw new Error(error.message);
      }
      break;
    }
    case "delete_folder": {
      await assertHostedFolderExists(params.supabase, params.user.id, mutation.folderId);
      const { error: clearItemsError } = await params.supabase
        .from("library_items")
        .update({
          folder_id: null,
        })
        .eq("user_id", params.user.id)
        .eq("folder_id", mutation.folderId);

      if (clearItemsError) {
        throw new Error(clearItemsError.message);
      }

      const { error: clearRunsError } = await params.supabase
        .from("generation_runs")
        .update({
          folder_id: null,
        })
        .eq("user_id", params.user.id)
        .eq("folder_id", mutation.folderId);

      if (clearRunsError) {
        throw new Error(clearRunsError.message);
      }

      const { error } = await params.supabase
        .from("folders")
        .delete()
        .eq("id", mutation.folderId)
        .eq("user_id", params.user.id);

      if (error) {
        throw new Error(error.message);
      }

      const reorderedFolders = reorderStudioFoldersByIds(
        (await listHostedUserFolders(params.supabase, params.user.id)).map(mapFolder),
        (await listHostedUserFolders(params.supabase, params.user.id)).map((folder) => folder.id),
        new Date().toISOString()
      );

      for (const folder of reorderedFolders) {
        const { error: reorderError } = await params.supabase
          .from("folders")
          .update({
            sort_order: folder.sortOrder,
          })
          .eq("id", folder.id)
          .eq("user_id", params.user.id);

        if (reorderError) {
          throw new Error(reorderError.message);
        }
      }
      break;
    }
    case "reorder_folders": {
      const folderRows = await listHostedUserFolders(params.supabase, params.user.id);
      const reorderedFolders = reorderStudioFoldersByIds(
        folderRows.map(mapFolder),
        mutation.orderedFolderIds,
        new Date().toISOString()
      );

      for (const folder of reorderedFolders) {
        const { error } = await params.supabase
          .from("folders")
          .update({
            sort_order: folder.sortOrder,
          })
          .eq("id", folder.id)
          .eq("user_id", params.user.id);

        if (error) {
          throw new Error(error.message);
        }
      }
      break;
    }
    case "move_items": {
      await assertHostedFolderExists(params.supabase, params.user.id, mutation.folderId);
      const { error } = await params.supabase
        .from("library_items")
        .update({
          folder_id: mutation.folderId,
        })
        .eq("user_id", params.user.id)
        .in("id", mutation.itemIds);

      if (error) {
        throw new Error(error.message);
      }
      break;
    }
    case "delete_items": {
      const itemRows = await listHostedUserItems(params.supabase, params.user.id);
      const targetItems = itemRows.filter((item) => mutation.itemIds.includes(item.id));
      const hostedRunFileIds = targetItems
        .flatMap((item) => [item.run_file_id, item.thumbnail_file_id])
        .filter((value): value is string => Boolean(value));

      if (hostedRunFileIds.length > 0) {
        const runFileRows = await listHostedUserRunFiles(params.supabase, params.user.id);
        const filePaths = runFileRows
          .filter(
            (runFile) =>
              hostedRunFileIds.includes(runFile.id) &&
              runFile.storage_bucket === HOSTED_MEDIA_BUCKET
          )
          .map((runFile) => runFile.storage_path);

        await removeHostedStoragePaths(params.supabase, filePaths);
      }

      const { error: deleteItemsError } = await params.supabase
        .from("library_items")
        .delete()
        .eq("user_id", params.user.id)
        .in("id", mutation.itemIds);

      if (deleteItemsError) {
        throw new Error(deleteItemsError.message);
      }

      if (hostedRunFileIds.length > 0) {
        const { error: deleteRunFilesError } = await params.supabase
          .from("run_files")
          .delete()
          .eq("user_id", params.user.id)
          .in("id", hostedRunFileIds);

        if (deleteRunFilesError) {
          throw new Error(deleteRunFilesError.message);
        }
      }

      break;
    }
    case "delete_runs": {
      await deleteHostedRuns({
        supabase: params.supabase,
        user: params.user,
        runIds: mutation.runIds,
      });
      break;
    }
    case "update_text_item": {
      const payload: { title?: string; content_text?: string; prompt?: string } = {};
      if (typeof mutation.title === "string") {
        payload.title = mutation.title.trim();
      }
      if (typeof mutation.contentText === "string") {
        payload.content_text = mutation.contentText.trim();
        payload.prompt = mutation.contentText.trim();
      }

      const { error } = await params.supabase
        .from("library_items")
        .update(payload)
        .eq("id", mutation.itemId)
        .eq("user_id", params.user.id)
        .eq("kind", "text");

      if (error) {
        throw new Error(error.message);
      }
      break;
    }
    case "create_text_item": {
      await assertHostedFolderExists(params.supabase, params.user.id, mutation.folderId);
      const body = mutation.body.trim();
      const title = mutation.title.trim() || body.slice(0, 36) || "Text note";
      const now = new Date().toISOString();
      const { error } = await params.supabase.from("library_items").insert({
        id: createHostedUuid(),
        user_id: params.user.id,
        title,
        kind: "text",
        source: "uploaded",
        role: "text_note",
        content_text: body,
        created_at: now,
        updated_at: now,
        model_id: null,
        run_id: null,
        provider: "fal",
        status: "ready",
        prompt: body,
        meta: "Text note",
        media_width: null,
        media_height: null,
        media_duration_seconds: null,
        aspect_ratio_label: null,
        has_alpha: false,
        folder_id: mutation.folderId,
        file_name: `${createHostedUuid()}.txt`,
        mime_type: "text/plain",
        byte_size: body.length,
        metadata: {} as Json,
        error_message: null,
      });

      if (error) {
        throw new Error(error.message);
      }
      break;
    }
    case "cancel_run": {
      const { data: run, error: runError } = await params.supabase
        .from("generation_runs")
        .select("*")
        .eq("id", mutation.runId)
        .eq("user_id", params.user.id)
        .maybeSingle();

      if (runError) {
        throw new Error(runError.message);
      }

      if (run && (run.status === "queued" || run.status === "pending")) {
        const cancelledAt = new Date().toISOString();
        const { error } = await params.supabase
          .from("generation_runs")
          .update({
            status: "cancelled",
            cancelled_at: cancelledAt,
            completed_at: cancelledAt,
            updated_at: cancelledAt,
            provider_status: "cancelled",
            can_cancel: false,
          })
          .eq("id", run.id)
          .eq("user_id", params.user.id);

        if (error) {
          throw new Error(error.message);
        }

        if (run.estimated_credits) {
          await applyHostedCreditLedgerEntry({
            supabase: params.supabase,
            userId: params.user.id,
            deltaCredits: run.estimated_credits,
            reason: "generation_refund",
            relatedRunId: run.id,
            idempotencyKey: `generation:${run.id}:cancelled_refund`,
            sourceEventId: `generation_run:${run.id}:cancelled`,
            metadata: {
              status: "cancelled",
            },
          });
        }
      }
      break;
    }
    case "generate":
    case "sign_out":
    case "delete_account": {
      break;
    }
  }

  const nextState = await buildHostedState({
    supabase: params.supabase,
    user: params.user,
  });

  return {
    revision: nextState.state.revision,
    state: nextState.state,
  };
}

async function uploadHostedStorageFile(params: {
  supabase: HostedSupabaseClient;
  userId: string;
  runFileId: string;
  file: File;
}) {
  const storagePath = `${params.userId}/${params.runFileId}-${sanitizeStorageFileName(params.file.name)}`;
  const { error } = await params.supabase.storage
    .from(HOSTED_MEDIA_BUCKET)
    .upload(storagePath, params.file, {
      contentType: params.file.type || "application/octet-stream",
      upsert: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  return storagePath;
}

export async function uploadHostedFiles(params: {
  supabase: HostedSupabaseClient;
  user: User;
  files: File[];
  folderId: string | null;
  manifest: HostedStudioUploadManifestEntry[];
}) {
  if (params.files.length === 0) {
    throw new Error("No files were provided.");
  }

  if (params.files.length !== params.manifest.length) {
    throw new Error("Upload metadata did not match the provided files.");
  }

  await ensureHostedAccount(params.supabase, params.user);
  await assertHostedFolderExists(params.supabase, params.user.id, params.folderId);
  const createdAt = new Date().toISOString();

  for (const [index, file] of params.files.entries()) {
    const metadata = params.manifest[index];
    const kind = getStudioUploadedMediaKind({
      fileName: file.name,
      mimeType: file.type,
    });

    if (!metadata || !kind || kind !== metadata.kind) {
      throw new Error(`Unsupported upload: ${file.name}`);
    }

    const runFileId = createHostedUuid();
    let storagePath: string | null = null;

    try {
      storagePath = await uploadHostedStorageFile({
        supabase: params.supabase,
        userId: params.user.id,
        runFileId,
        file,
      });

      const { error: runFileError } = await params.supabase.from("run_files").insert({
        id: runFileId,
        run_id: null,
        user_id: params.user.id,
        file_role: "input",
        source_type: "uploaded",
        storage_bucket: HOSTED_MEDIA_BUCKET,
        storage_path: storagePath,
        mime_type: file.type || "application/octet-stream",
        file_name: file.name,
        file_size_bytes: file.size,
        media_width: metadata.mediaWidth,
        media_height: metadata.mediaHeight,
        media_duration_seconds: metadata.mediaDurationSeconds,
        aspect_ratio_label: metadata.aspectRatioLabel,
        has_alpha: metadata.hasAlpha,
        metadata: {} as Json,
        created_at: createdAt,
      });

      if (runFileError) {
        throw new Error(runFileError.message);
      }

      const metaLabel =
        kind === "audio"
          ? `${file.type || "Audio"} • ${(file.size / 1024 / 1024).toFixed(1)} MB`
          : `${file.type || "File"} • ${(file.size / 1024 / 1024).toFixed(1)} MB`;

      const { error: itemError } = await params.supabase.from("library_items").insert({
        id: createHostedUuid(),
        user_id: params.user.id,
        run_file_id: runFileId,
        thumbnail_file_id: null,
        source_run_id: null,
        title: file.name,
        kind,
        source: "uploaded",
        role: "uploaded_source",
        content_text: null,
        created_at: createdAt,
        updated_at: createdAt,
        model_id: null,
        run_id: null,
        provider: "fal",
        status: "ready",
        prompt: "",
        meta: metaLabel,
        media_width: metadata.mediaWidth,
        media_height: metadata.mediaHeight,
        media_duration_seconds: metadata.mediaDurationSeconds,
        aspect_ratio_label: metadata.aspectRatioLabel,
        has_alpha: metadata.hasAlpha,
        folder_id: params.folderId,
        file_name: file.name,
        mime_type: file.type || null,
        byte_size: file.size,
        metadata: {} as Json,
        error_message: null,
      });

      if (itemError) {
        throw new Error(itemError.message);
      }
    } catch (error) {
      await params.supabase.from("run_files").delete().eq("id", runFileId).eq("user_id", params.user.id);
      if (storagePath) {
        await params.supabase.storage.from(HOSTED_MEDIA_BUCKET).remove([storagePath]).catch(() => undefined);
      }
      throw error;
    }
  }

  const nextState = await buildHostedState({
    supabase: params.supabase,
    user: params.user,
  });

  return {
    revision: nextState.state.revision,
    state: nextState.state,
  };
}

export async function queueHostedGeneration(params: {
  supabase: HostedSupabaseClient;
  user: User;
  modelId: string;
  folderId: string | null;
  draft: GenerationRun["draftSnapshot"] | PersistedStudioDraft;
  inputs: HostedStudioGenerateInputDescriptor[];
  uploadedFiles: Map<string, File>;
  webhookBaseUrl: string;
}) {
  const [account, systemConfig] = await Promise.all([
    ensureHostedAccount(params.supabase, params.user),
    getHostedSystemConfig(params.supabase),
  ]);
  const enabledModelIds = normalizeStudioEnabledModelIds(account.enabled_model_ids);

  if (!enabledModelIds.includes(params.modelId)) {
    throw new Error("That model is disabled for this workspace.");
  }

  const { data: activeRuns, error: activeRunsError } = await params.supabase
    .from("generation_runs")
    .select("id")
    .eq("user_id", params.user.id)
    .in("status", ["queued", "pending", "processing"]);

  if (activeRunsError) {
    throw new Error(activeRunsError.message);
  }

  if ((activeRuns ?? []).length >= systemConfig.max_active_jobs_per_user) {
    throw new Error(
      "limit of 100 concurrent queues/ generations reached, please wait for your generations to finish before continuing."
    );
  }

  const model = getStudioModelById(params.modelId);
  const persistedDraft: PersistedStudioDraft = {
    ...toPersistedDraft(createDraft(model)),
    ...params.draft,
  };
  const referencedAssetIds = Array.from(
    new Set(
      params.inputs
        .map((input) => input.originAssetId?.trim() || null)
        .filter((value): value is string => Boolean(value))
    )
  );
  const referencedAssetKinds = new Map<string, LibraryItemKind>();
  if (referencedAssetIds.length > 0) {
    const { data: referencedItems, error: referencedItemsError } = await params.supabase
      .from("library_items")
      .select("id, kind")
      .eq("user_id", params.user.id)
      .in("id", referencedAssetIds);

    if (referencedItemsError) {
      throw new Error(referencedItemsError.message);
    }

    for (const item of referencedItems ?? []) {
      referencedAssetKinds.set(item.id, item.kind as LibraryItemKind);
    }
  }
  validateStudioGenerationRequest({
    modelId: model.id,
    draft: persistedDraft,
    inputs: params.inputs,
    referencedAssetKinds,
  });
  const hydratedDraft = hydrateDraft(persistedDraft, model);
  const requestMode = resolveStudioGenerationRequestMode(model, hydratedDraft);
  const referenceCount = params.inputs.filter((entry) => entry.slot === "reference").length;
  const startFrameCount = params.inputs.filter((entry) => entry.slot === "start_frame").length;
  const endFrameCount = params.inputs.filter((entry) => entry.slot === "end_frame").length;
  const pricingQuote = quoteStudioDraftPricing(model, persistedDraft);

  if (account.credit_balance < pricingQuote.billedCredits) {
    throw new Error("Not enough credits to queue this generation.");
  }

  const createdAt = new Date().toISOString();
  const runId = createHostedUuid();
  const previewUrl = createGenerationRunPreviewUrl(model, hydratedDraft);

  const runInsert: Database["public"]["Tables"]["generation_runs"]["Row"] = {
    id: runId,
    user_id: params.user.id,
    folder_id: null,
    deleted_at: null,
    model_id: model.id,
    model_name: model.name,
    kind: model.kind,
    provider: model.provider,
    request_mode: requestMode,
    status: "queued",
    prompt: persistedDraft.prompt,
    created_at: createdAt,
    queue_entered_at: createdAt,
    started_at: null,
    completed_at: null,
    failed_at: null,
    cancelled_at: null,
    updated_at: createdAt,
    summary: createGenerationRunSummary(model, hydratedDraft),
    output_asset_id: null,
    preview_url: previewUrl,
    error_message: null,
    input_payload: {
      prompt: persistedDraft.prompt,
      request_mode: requestMode,
      reference_count: referenceCount,
      start_frame_count: startFrameCount,
      end_frame_count: endFrameCount,
      video_input_mode: persistedDraft.videoInputMode,
      reference_asset_ids: params.inputs
        .filter((entry) => entry.slot === "reference" && entry.originAssetId)
        .map((entry) => entry.originAssetId),
      model_id: model.id,
    },
    input_settings: {
      ...persistedDraft,
      start_frame_count: startFrameCount,
      end_frame_count: endFrameCount,
      video_input_mode: persistedDraft.videoInputMode,
    },
    provider_request_id: null,
    provider_status: "queued",
    estimated_cost_usd: pricingQuote.apiCostUsd,
    actual_cost_usd: null,
    estimated_credits: pricingQuote.billedCredits,
    actual_credits: null,
    usage_snapshot: {},
    output_text: null,
    pricing_snapshot: pricingQuote.pricingSnapshot,
    dispatch_attempt_count: 0,
    dispatch_lease_expires_at: null,
    can_cancel: true,
    draft_snapshot: {
      ...persistedDraft,
      referenceCount,
      startFrameCount,
      endFrameCount,
    },
  };

  const createdStoragePaths: string[] = [];
  const createdRunFileIds: string[] = [];
  let holdApplied = false;

  try {
    const { error: runInsertError } = await params.supabase
      .from("generation_runs")
      .insert(runInsert);

    if (runInsertError) {
      throw new Error(runInsertError.message);
    }

    let inputPosition = 0;
    for (const input of params.inputs) {
      let runFileId: string | null = null;
      const libraryItemId: string | null = input.originAssetId;

      if (!libraryItemId && input.uploadField) {
        const uploadedFile = params.uploadedFiles.get(input.uploadField);
        if (!uploadedFile) {
          throw new Error("A generation input file was missing.");
        }

        runFileId = createHostedUuid();
        const storagePath = await uploadHostedStorageFile({
          supabase: params.supabase,
          userId: params.user.id,
          runFileId,
          file: uploadedFile,
        });
        createdStoragePaths.push(storagePath);
        createdRunFileIds.push(runFileId);

        const { error: runFileError } = await params.supabase.from("run_files").insert({
          id: runFileId,
          run_id: runId,
          user_id: params.user.id,
          file_role: "input",
          source_type: "uploaded",
          storage_bucket: HOSTED_MEDIA_BUCKET,
          storage_path: storagePath,
          mime_type: uploadedFile.type || input.mimeType || "application/octet-stream",
          file_name: uploadedFile.name,
          file_size_bytes: uploadedFile.size,
          media_width: null,
          media_height: null,
          media_duration_seconds: null,
          aspect_ratio_label: null,
          has_alpha: false,
          metadata: {
            input_slot: input.slot,
            source: input.source,
          } as Json,
          created_at: createdAt,
        });

        if (runFileError) {
          throw new Error(runFileError.message);
        }
      }

      const { error: inputError } = await params.supabase
        .from("generation_run_inputs")
        .insert({
          user_id: params.user.id,
          run_id: runId,
          input_role:
            input.slot === "start_frame"
              ? "start_frame"
              : input.slot === "end_frame"
                ? "end_frame"
                : "reference",
          position: inputPosition,
          library_item_id: libraryItemId,
          run_file_id: runFileId,
        });

      if (inputError) {
        throw new Error(inputError.message);
      }
      inputPosition += 1;
    }

    await applyHostedCreditLedgerEntry({
      supabase: params.supabase,
      userId: params.user.id,
      deltaCredits: -pricingQuote.billedCredits,
      reason: "generation_hold",
      relatedRunId: runId,
      idempotencyKey: `generation:${runId}:hold`,
      sourceEventId: `generation_run:${runId}:hold`,
      metadata: {
        model_id: model.id,
        request_mode: requestMode,
      },
    });
    holdApplied = true;
  } catch (error) {
    await params.supabase
      .from("generation_run_inputs")
      .delete()
      .eq("run_id", runId)
      .eq("user_id", params.user.id);
    if (createdRunFileIds.length > 0) {
      await params.supabase
        .from("run_files")
        .delete()
        .eq("user_id", params.user.id)
        .in("id", createdRunFileIds);
    }
    await params.supabase
      .from("generation_runs")
      .delete()
      .eq("id", runId)
      .eq("user_id", params.user.id);
    if (createdStoragePaths.length > 0) {
      await params.supabase.storage.from(HOSTED_MEDIA_BUCKET).remove(createdStoragePaths).catch(() => undefined);
    }
    if (holdApplied) {
      await applyHostedCreditLedgerEntry({
        supabase: params.supabase,
        userId: params.user.id,
        deltaCredits: pricingQuote.billedCredits,
        reason: "generation_refund",
        relatedRunId: runId,
        idempotencyKey: `generation:${runId}:setup_refund`,
        sourceEventId: `generation_run:${runId}:setup_failed`,
        metadata: {
          status: "failed_setup",
        },
      }).catch(() => undefined);
    }
    throw error;
  }

  await syncHostedUserQueue({
    supabase: params.supabase,
    user: params.user,
    webhookBaseUrl: params.webhookBaseUrl,
  });

  const nextState = await buildHostedState({
    supabase: params.supabase,
    user: params.user,
  });

  return {
    revision: nextState.state.revision,
    state: nextState.state,
  };
}

export async function deleteHostedAccount(params: {
  supabase: HostedSupabaseClient;
  user: User;
}) {
  const adminSupabase = createSupabaseAdminClient();
  const { data: runFiles, error: runFilesError } = await adminSupabase
    .from("run_files")
    .select("storage_bucket, storage_path")
    .eq("user_id", params.user.id)
    .eq("storage_bucket", HOSTED_MEDIA_BUCKET);

  if (runFilesError) {
    throw new Error(runFilesError.message);
  }

  const hostedStoragePaths = (runFiles ?? [])
    .map((file) => file.storage_path?.trim() || null)
    .filter((value): value is string => Boolean(value));

  if (hostedStoragePaths.length > 0) {
    const { error: storageDeleteError } = await adminSupabase.storage
      .from(HOSTED_MEDIA_BUCKET)
      .remove(hostedStoragePaths);

    if (storageDeleteError) {
      throw new Error(storageDeleteError.message);
    }
  }

  const { error: feedbackDeleteError } = await adminSupabase
    .from("feedback_submissions")
    .delete()
    .eq("user_id", params.user.id);

  if (feedbackDeleteError) {
    throw new Error(feedbackDeleteError.message);
  }

  await deleteHostedBillingCustomersForUser({
    supabase: adminSupabase,
    userId: params.user.id,
  });

  const { error: deleteUserError } = await adminSupabase.auth.admin.deleteUser(
    params.user.id
  );

  if (deleteUserError) {
    throw new Error(deleteUserError.message);
  }
}

export async function downloadHostedFile(params: {
  supabase: HostedSupabaseClient;
  storagePath: string;
}) {
  const { data, error } = await params.supabase
    .storage
    .from(HOSTED_MEDIA_BUCKET)
    .download(params.storagePath);

  if (error || !data) {
    throw new Error(error?.message ?? "Could not load hosted file.");
  }

  return data;
}
