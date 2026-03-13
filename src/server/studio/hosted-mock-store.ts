import {
  createDraft,
  createGeneratedLibraryItem,
  createGenerationRunPreviewUrl,
  createGenerationRunSummary,
  createRunFile,
  createStudioId,
  createStudioSeedSnapshot,
  hydrateDraft,
  toPersistedDraft,
} from "@/features/studio/studio-local-runtime-data";
import { createAudioThumbnailUrl } from "@/features/studio/studio-asset-thumbnails";
import {
  getStudioRunCompletionDelayMs,
  getHostedStudioFairShare,
  resolveStudioGenerationRequestMode,
  shouldStudioMockRunFail,
} from "@/features/studio/studio-generation-rules";
import {
  normalizeStudioEnabledModelIds,
} from "@/features/studio/studio-model-configuration";
import {
  reorderStudioFoldersByIds,
} from "@/features/studio/studio-folder-order";
import { getStudioModelById } from "@/features/studio/studio-model-catalog";
import type {
  HostedStudioMutation,
  HostedStudioUploadManifestEntry,
} from "@/features/studio/studio-hosted-mock-api";
import { quoteStudioDraftPricing } from "@/features/studio/studio-model-pricing";
import {
  getStudioUploadedMediaKind,
  studioUploadSupportsAlpha,
} from "@/features/studio/studio-upload-files";
import type {
  GenerationRun,
  LibraryItem,
  PersistedStudioDraft,
  StudioFolder,
  StudioRunFile,
  StudioWorkspaceSnapshot,
} from "@/features/studio/types";

type HostedFileRecord = {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
};

type HostedUploadedFileEntry = {
  file: File;
  metadata: HostedStudioUploadManifestEntry;
};

type HostedMockStore = {
  snapshot: StudioWorkspaceSnapshot;
  files: Map<string, HostedFileRecord>;
  dispatchTimers: Map<string, ReturnType<typeof setTimeout>>;
  completionTimers: Map<string, ReturnType<typeof setTimeout>>;
};

const STORE_KEY = "__TRYPLAYGROUND_HOSTED_MOCK_STORE__";

function cloneSnapshot(snapshot: StudioWorkspaceSnapshot) {
  return structuredClone(snapshot);
}

function clearTimer(timer: ReturnType<typeof setTimeout> | undefined) {
  if (timer) {
    clearTimeout(timer);
  }
}

function resolveHostedMockUserId(snapshot: StudioWorkspaceSnapshot) {
  return snapshot.profile.id;
}

function createHostedMockFileUrl(fileId: string) {
  return `/api/mock/studio/hosted/files/${encodeURIComponent(fileId)}`;
}

function createHostedMutationInputPayload(params: {
  modelId: string;
  prompt: string;
  requestMode: GenerationRun["requestMode"];
  referenceCount: number;
  startFrameCount: number;
  endFrameCount: number;
  videoInputMode: PersistedStudioDraft["videoInputMode"];
}) {
  return {
    prompt: params.prompt,
    request_mode: params.requestMode,
    reference_count: params.referenceCount,
    start_frame_count: params.startFrameCount,
    end_frame_count: params.endFrameCount,
    video_input_mode: params.videoInputMode,
    reference_asset_ids: [],
    reference_run_file_ids: [],
    model_id: params.modelId,
  };
}

function validateHostedUploadedFiles(params: {
  files: File[];
  manifest: HostedStudioUploadManifestEntry[];
}) {
  if (params.files.length === 0) {
    throw new Error("No files were provided.");
  }

  if (params.files.length !== params.manifest.length) {
    throw new Error("Upload metadata did not match the provided files.");
  }

  return params.files.map((file, index) => {
    const metadata = params.manifest[index];
    const inferredKind = getStudioUploadedMediaKind({
      fileName: file.name,
      mimeType: file.type,
    });

    if (!metadata || !inferredKind || inferredKind !== metadata.kind) {
      throw new Error(`Unsupported upload: ${file.name}`);
    }

    return {
      file,
      metadata: {
        ...metadata,
        hasAlpha:
          metadata.kind === "image"
            ? metadata.hasAlpha || studioUploadSupportsAlpha(file.type)
            : false,
      },
    } satisfies HostedUploadedFileEntry;
  });
}

function getHostedWorkspaceId(snapshot: StudioWorkspaceSnapshot) {
  return snapshot.folders[0]?.workspaceId ?? "workspace-hosted";
}

function getStore(): HostedMockStore {
  const globalStore = globalThis as typeof globalThis & {
    [STORE_KEY]?: HostedMockStore;
  };

  if (!globalStore[STORE_KEY]) {
    globalStore[STORE_KEY] = {
      snapshot: createStudioSeedSnapshot("hosted"),
      files: new Map(),
      dispatchTimers: new Map(),
      completionTimers: new Map(),
    };
    syncHostedQueue(globalStore[STORE_KEY]);
  }

  return globalStore[STORE_KEY]!;
}

function resetHostedMockStore(store: HostedMockStore) {
  for (const timer of store.dispatchTimers.values()) {
    clearTimer(timer);
  }
  for (const timer of store.completionTimers.values()) {
    clearTimer(timer);
  }

  store.dispatchTimers.clear();
  store.completionTimers.clear();
  store.files.clear();
  store.snapshot = createStudioSeedSnapshot("hosted");
}

function syncFolderMemberships(snapshot: StudioWorkspaceSnapshot) {
  snapshot.folderItems = snapshot.libraryItems.flatMap((item) =>
    item.folderIds.map((folderId) => ({
      folderId,
      libraryItemId: item.id,
      createdAt: item.createdAt,
    }))
  );
}

function scheduleDispatch(store: HostedMockStore, runId: string, delayMs = 320) {
  clearTimer(store.dispatchTimers.get(runId));
  const timer = setTimeout(() => {
    store.dispatchTimers.delete(runId);

    const run = store.snapshot.generationRuns.find((entry) => entry.id === runId);
    if (!run || (run.status !== "queued" && run.status !== "pending")) {
      return;
    }

    const processingCount = store.snapshot.generationRuns.filter(
      (entry) => entry.status === "processing"
    ).length;
    const fairShare = getHostedStudioFairShare({
      queueSettings: store.snapshot.queueSettings,
      userId: resolveHostedMockUserId(store.snapshot),
    });

    if (processingCount >= fairShare.maxProcessing) {
      scheduleDispatch(store, runId, fairShare.nextRetryDelayMs);
      return;
    }

    const startedAt = new Date().toISOString();
    Object.assign(run, {
      status: "processing",
      startedAt,
      updatedAt: startedAt,
      providerRequestId: run.providerRequestId ?? `fal_mock_${run.id}`,
      providerStatus: "running",
      dispatchAttemptCount: run.dispatchAttemptCount + 1,
      canCancel: false,
    });

    syncHostedQueue(store);
  }, delayMs);

  store.dispatchTimers.set(runId, timer);
}

function scheduleCompletion(store: HostedMockStore, runId: string) {
  clearTimer(store.completionTimers.get(runId));
  const run = store.snapshot.generationRuns.find((entry) => entry.id === runId);
  if (!run) {
    return;
  }

  const timer = setTimeout(() => {
    store.completionTimers.delete(runId);
    const latestRun = store.snapshot.generationRuns.find((entry) => entry.id === runId);
    if (!latestRun || latestRun.status !== "processing") {
      return;
    }

    const finishedAt = new Date().toISOString();

    if (shouldStudioMockRunFail(latestRun)) {
      latestRun.status = "failed";
      latestRun.providerStatus = "failed";
      latestRun.completedAt = finishedAt;
      latestRun.failedAt = finishedAt;
      latestRun.updatedAt = finishedAt;
      latestRun.canCancel = false;
      latestRun.errorMessage =
        "Mock Fal generation failed before an output asset was returned.";

      if (store.snapshot.creditBalance && latestRun.estimatedCredits) {
        store.snapshot.creditBalance.balanceCredits += latestRun.estimatedCredits;
        store.snapshot.creditBalance.updatedAt = finishedAt;
      }

      syncHostedQueue(store);
      return;
    }

    const model = getStudioModelById(latestRun.modelId);
    const draft = hydrateDraft(latestRun.draftSnapshot, model);
    const nextRunFileId = latestRun.kind === "text" ? null : createStudioId("run-file");

    const nextItem = createGeneratedLibraryItem({
      runFileId: nextRunFileId,
      sourceRunId: latestRun.id,
      model,
      draft,
      createdAt: finishedAt,
      folderId: latestRun.folderId,
      runId: latestRun.id,
      userId: latestRun.userId,
      workspaceId: latestRun.workspaceId,
    });
    const nextRunFile: StudioRunFile | null =
      nextRunFileId && nextItem.previewUrl
        ? createRunFile({
            id: nextRunFileId,
            runId: latestRun.id,
            userId: latestRun.userId,
            sourceType: "generated",
            fileRole: "output",
            previewUrl: nextItem.previewUrl,
            fileName: nextItem.fileName ?? `${latestRun.id}.bin`,
            mimeType: nextItem.mimeType || "application/octet-stream",
            mediaWidth: nextItem.mediaWidth,
            mediaHeight: nextItem.mediaHeight,
            mediaDurationSeconds: nextItem.mediaDurationSeconds,
            hasAlpha: nextItem.hasAlpha,
            createdAt: finishedAt,
          })
        : null;

    latestRun.status = "completed";
    latestRun.providerStatus = "completed";
    latestRun.outputAssetId = nextItem.id;
    latestRun.actualCostUsd = latestRun.estimatedCostUsd;
    latestRun.actualCredits = latestRun.estimatedCredits;
    latestRun.completedAt = finishedAt;
    latestRun.updatedAt = finishedAt;
    latestRun.canCancel = false;
    latestRun.outputText = nextItem.kind === "text" ? nextItem.contentText : null;

    store.snapshot.libraryItems.unshift(nextItem);
    if (nextRunFile) {
      store.snapshot.runFiles.unshift(nextRunFile);
    }
    syncFolderMemberships(store.snapshot);
    syncHostedQueue(store);
  }, getStudioRunCompletionDelayMs(run));

  store.completionTimers.set(runId, timer);
}

function syncHostedQueue(store: HostedMockStore) {
  const queuedIds = new Set(
    store.snapshot.generationRuns
      .filter((run) => run.status === "queued" || run.status === "pending")
      .map((run) => run.id)
  );
  for (const [runId, timer] of store.dispatchTimers.entries()) {
    if (!queuedIds.has(runId)) {
      clearTimer(timer);
      store.dispatchTimers.delete(runId);
    }
  }

  const processingIds = new Set(
    store.snapshot.generationRuns
      .filter((run) => run.status === "processing")
      .map((run) => run.id)
  );
  for (const [runId, timer] of store.completionTimers.entries()) {
    if (!processingIds.has(runId)) {
      clearTimer(timer);
      store.completionTimers.delete(runId);
    }
  }

  for (const run of store.snapshot.generationRuns) {
    if ((run.status === "queued" || run.status === "pending") && !store.dispatchTimers.has(run.id)) {
      scheduleDispatch(store, run.id);
    }
    if (run.status === "processing" && !store.completionTimers.has(run.id)) {
      scheduleCompletion(store, run.id);
    }
  }
}

export function getHostedMockSnapshot() {
  return cloneSnapshot(getStore().snapshot);
}

export async function mutateHostedMockSnapshot(mutation: HostedStudioMutation) {
  const store = getStore();
  const snapshot = store.snapshot;

  switch (mutation.action) {
    case "purchase_credits": {
      if (snapshot.creditBalance) {
        snapshot.creditBalance.balanceCredits += mutation.credits;
        snapshot.creditBalance.updatedAt = new Date().toISOString();
      }
      if (snapshot.activeCreditPack) {
        snapshot.activeCreditPack = {
          ...snapshot.activeCreditPack,
          credits: mutation.credits,
          priceCents: mutation.credits,
          updatedAt: new Date().toISOString(),
        };
      }
      break;
    }
    case "set_enabled_models": {
      snapshot.modelConfiguration = {
        enabledModelIds: normalizeStudioEnabledModelIds(mutation.enabledModelIds),
        updatedAt: new Date().toISOString(),
      };
      break;
    }
    case "sign_out":
    case "delete_account": {
      resetHostedMockStore(store);
      break;
    }
    case "create_folder": {
      const createdAt = new Date().toISOString();
      const nextFolder: StudioFolder = {
        id: createStudioId("folder"),
        userId: snapshot.profile.id,
        workspaceId: getHostedWorkspaceId(snapshot),
        name: mutation.name.trim(),
        createdAt,
        updatedAt: createdAt,
        sortOrder: 0,
      };
      snapshot.folders = [
        nextFolder,
        ...snapshot.folders.map((folder, index) => ({
          ...folder,
          sortOrder: index + 1,
        })),
      ];
      break;
    }
    case "rename_folder": {
      const updatedAt = new Date().toISOString();
      snapshot.folders = snapshot.folders.map((folder) =>
        folder.id === mutation.folderId
          ? { ...folder, name: mutation.name.trim(), updatedAt }
          : folder
      );
      break;
    }
    case "reorder_folders": {
      snapshot.folders = reorderStudioFoldersByIds(
        snapshot.folders,
        mutation.orderedFolderIds,
        new Date().toISOString()
      );
      break;
    }
    case "delete_folder": {
      snapshot.folders = snapshot.folders
        .filter((folder) => folder.id !== mutation.folderId)
        .map((folder, index) => ({
          ...folder,
          sortOrder: index,
        }));
      snapshot.libraryItems = snapshot.libraryItems.map((item) =>
        item.folderIds.includes(mutation.folderId)
          ? { ...item, folderId: null, folderIds: [], updatedAt: new Date().toISOString() }
          : item
      );
      snapshot.generationRuns = snapshot.generationRuns.map((run) =>
        run.folderId === mutation.folderId ? { ...run, folderId: null } : run
      );
      syncFolderMemberships(snapshot);
      break;
    }
    case "move_items": {
      const updatedAt = new Date().toISOString();
      const itemIdSet = new Set(mutation.itemIds);
      snapshot.libraryItems = snapshot.libraryItems.map((item) =>
        itemIdSet.has(item.id)
          ? {
              ...item,
              folderId: mutation.folderId,
              folderIds: mutation.folderId ? [mutation.folderId] : [],
              updatedAt,
            }
          : item
      );
      syncFolderMemberships(snapshot);
      break;
    }
    case "delete_items": {
      const itemIdSet = new Set(mutation.itemIds);
      const removedRunFileIds = new Set(
        snapshot.libraryItems
          .filter((item) => itemIdSet.has(item.id))
          .map((item) => item.runFileId)
          .filter((value): value is string => Boolean(value))
      );

      snapshot.libraryItems = snapshot.libraryItems.filter((item) => !itemIdSet.has(item.id));
      snapshot.runFiles = snapshot.runFiles.filter((runFile) => !removedRunFileIds.has(runFile.id));
      for (const runFileId of removedRunFileIds) {
        store.files.delete(runFileId);
      }
      snapshot.generationRuns = snapshot.generationRuns.map((run) =>
        run.outputAssetId && itemIdSet.has(run.outputAssetId)
          ? { ...run, outputAssetId: null }
          : run
      );
      syncFolderMemberships(snapshot);
      break;
    }
    case "update_text_item": {
      const updatedAt = new Date().toISOString();
      snapshot.libraryItems = snapshot.libraryItems.map((item) => {
        if (item.id !== mutation.itemId || item.kind !== "text") {
          return item;
        }

        const nextContentText = mutation.contentText?.trim() ?? item.contentText ?? "";
        return {
          ...item,
          title: mutation.title?.trim() || item.title,
          contentText: nextContentText,
          prompt: nextContentText,
          updatedAt,
        };
      });
      break;
    }
    case "create_text_item": {
      const createdAt = new Date().toISOString();
      const body = mutation.body.trim();
      const item: LibraryItem = {
        id: createStudioId("asset"),
        userId: snapshot.profile.id,
        workspaceId: getHostedWorkspaceId(snapshot),
        runFileId: null,
        sourceRunId: null,
        title: mutation.title.trim() || body.slice(0, 36) || "Text note",
        kind: "text",
        source: "uploaded",
        role: "text_note",
        previewUrl: null,
        thumbnailUrl: null,
        contentText: body,
        createdAt,
        updatedAt: createdAt,
        modelId: null,
        runId: null,
        provider: "fal",
        status: "ready",
        prompt: body,
        meta: "Text note",
        mediaWidth: null,
        mediaHeight: null,
        mediaDurationSeconds: null,
        aspectRatioLabel: null,
        hasAlpha: false,
        folderId: mutation.folderId,
        folderIds: mutation.folderId ? [mutation.folderId] : [],
        storageBucket: "inline-text",
        storagePath: null,
        thumbnailPath: null,
        fileName: `${createStudioId("text")}.txt`,
        mimeType: "text/plain",
        byteSize: body.length,
        metadata: {},
        errorMessage: null,
      };
      snapshot.libraryItems.unshift(item);
      syncFolderMemberships(snapshot);
      break;
    }
    case "generate": {
      const enabledModelIds = normalizeStudioEnabledModelIds(
        snapshot.modelConfiguration.enabledModelIds
      );
      if (!enabledModelIds.includes(mutation.modelId)) {
        throw new Error("That model is disabled for this workspace.");
      }

      const activeJobs = snapshot.generationRuns.filter(
        (run) => run.status === "queued" || run.status === "pending" || run.status === "processing"
      ).length;
      if (activeJobs >= snapshot.queueSettings.maxActiveJobsPerUser) {
        throw new Error(
          "limit of 100 concurrent queues/ generations reached, please wait for your generations to finish before continuing."
        );
      }

      const model = getStudioModelById(mutation.modelId);
      const persistedDraft: PersistedStudioDraft = {
        ...toPersistedDraft(createDraft(model)),
        ...mutation.draft,
      };
      const hydratedDraft = hydrateDraft(persistedDraft, model);
      const requestMode = resolveStudioGenerationRequestMode(model, hydratedDraft);
      const referenceCount =
        "referenceCount" in mutation.draft ? mutation.draft.referenceCount : 0;
      const startFrameCount =
        "startFrameCount" in mutation.draft ? mutation.draft.startFrameCount : 0;
      const endFrameCount =
        "endFrameCount" in mutation.draft ? mutation.draft.endFrameCount : 0;
      const pricingQuote = quoteStudioDraftPricing(model, persistedDraft);
      const estimatedCredits = pricingQuote.billedCredits;
      if (
        snapshot.creditBalance &&
        snapshot.creditBalance.balanceCredits < estimatedCredits
      ) {
        throw new Error("Not enough credits to queue this generation.");
      }

      const createdAt = new Date().toISOString();
      const run: GenerationRun = {
        id: createStudioId("run"),
        userId: snapshot.profile.id,
        workspaceId: getHostedWorkspaceId(snapshot),
        folderId: mutation.folderId,
        modelId: model.id,
        modelName: model.name,
        kind: model.kind,
        provider: "fal",
        requestMode,
        status: "queued",
        prompt: persistedDraft.prompt,
        createdAt,
        queueEnteredAt: createdAt,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        cancelledAt: null,
        updatedAt: createdAt,
        summary: createGenerationRunSummary(model, hydratedDraft),
        outputAssetId: null,
        previewUrl: createGenerationRunPreviewUrl(model, hydratedDraft),
        errorMessage: null,
        inputPayload: createHostedMutationInputPayload({
          modelId: model.id,
          prompt: persistedDraft.prompt,
          requestMode,
          referenceCount,
          startFrameCount,
          endFrameCount,
          videoInputMode: persistedDraft.videoInputMode,
        }),
        inputSettings: {
          ...persistedDraft,
          start_frame_count: startFrameCount,
          end_frame_count: endFrameCount,
          video_input_mode: persistedDraft.videoInputMode,
        },
        providerRequestId: null,
        providerStatus: "queued",
        estimatedCostUsd: pricingQuote.apiCostUsd,
        actualCostUsd: null,
        estimatedCredits,
        actualCredits: null,
        usageSnapshot: {},
        outputText: null,
        pricingSnapshot: pricingQuote.pricingSnapshot,
        dispatchAttemptCount: 0,
        dispatchLeaseExpiresAt: null,
        canCancel: true,
        draftSnapshot: {
          ...persistedDraft,
          referenceCount,
          startFrameCount,
          endFrameCount,
        },
      };

      snapshot.generationRuns.unshift(run);
      if (snapshot.creditBalance) {
        snapshot.creditBalance.balanceCredits -= estimatedCredits;
        snapshot.creditBalance.updatedAt = createdAt;
      }
      syncHostedQueue(store);
      break;
    }
    case "cancel_run": {
      const run = snapshot.generationRuns.find((entry) => entry.id === mutation.runId);
      if (!run || (run.status !== "queued" && run.status !== "pending")) {
        break;
      }
      const cancelledAt = new Date().toISOString();
      run.status = "cancelled";
      run.cancelledAt = cancelledAt;
      run.completedAt = cancelledAt;
      run.updatedAt = cancelledAt;
      run.providerStatus = "cancelled";
      run.canCancel = false;
      if (snapshot.creditBalance && run.estimatedCredits) {
        snapshot.creditBalance.balanceCredits += run.estimatedCredits;
        snapshot.creditBalance.updatedAt = cancelledAt;
      }
      clearTimer(store.dispatchTimers.get(run.id));
      store.dispatchTimers.delete(run.id);
      break;
    }
  }

  syncHostedQueue(store);
  return cloneSnapshot(store.snapshot);
}

export async function uploadHostedMockFiles(params: {
  files: File[];
  folderId: string | null;
  manifest: HostedStudioUploadManifestEntry[];
}) {
  const store = getStore();
  const createdAt = new Date().toISOString();
  const entries = validateHostedUploadedFiles({
    files: params.files,
    manifest: params.manifest,
  });

  for (const entry of entries) {
    const { file, metadata } = entry;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const runFileId = createStudioId("run-file");
    const previewUrl = createHostedMockFileUrl(runFileId);

    store.files.set(runFileId, {
      bytes,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
    });

      const runFile: StudioRunFile = {
        id: runFileId,
        runId: null,
        userId: store.snapshot.profile.id,
      fileRole: "input",
      sourceType: "uploaded",
      storageBucket: "mock-api",
      storagePath: runFileId,
      mimeType: file.type || "application/octet-stream",
      fileName: file.name,
      fileSizeBytes: file.size,
      mediaWidth: metadata.mediaWidth,
      mediaHeight: metadata.mediaHeight,
      mediaDurationSeconds: metadata.mediaDurationSeconds,
      aspectRatioLabel: metadata.aspectRatioLabel,
      hasAlpha: metadata.hasAlpha,
      metadata: {},
      createdAt,
    };

    const kind = metadata.kind;
    const thumbnailUrl =
      kind === "audio"
        ? createAudioThumbnailUrl({
            title: file.name,
            subtitle: `${(file.size / 1024 / 1024).toFixed(1)} MB audio upload`,
            accentSeed: file.name,
          })
        : previewUrl;
    const item: LibraryItem = {
      id: createStudioId("asset"),
      userId: store.snapshot.profile.id,
      workspaceId: getHostedWorkspaceId(store.snapshot),
      runFileId,
      sourceRunId: null,
      title: file.name,
      kind,
      source: "uploaded",
      role: "uploaded_source",
      previewUrl,
      thumbnailUrl,
      contentText: null,
      createdAt,
      updatedAt: createdAt,
      modelId: null,
      runId: null,
      provider: "fal",
      status: "ready",
      prompt: "",
      meta:
        kind === "audio"
          ? `${file.type || "Audio"} • ${(file.size / 1024 / 1024).toFixed(1)} MB`
          : `${file.type || "File"} • ${(file.size / 1024 / 1024).toFixed(1)} MB`,
      mediaWidth: metadata.mediaWidth,
      mediaHeight: metadata.mediaHeight,
      mediaDurationSeconds: metadata.mediaDurationSeconds,
      aspectRatioLabel: metadata.aspectRatioLabel,
      hasAlpha: metadata.hasAlpha,
      folderId: params.folderId,
      folderIds: params.folderId ? [params.folderId] : [],
      storageBucket: "mock-api",
      storagePath: runFileId,
      thumbnailPath: kind === "audio" ? null : runFileId,
      fileName: file.name,
      mimeType: file.type || null,
      byteSize: file.size,
      metadata: {},
      errorMessage: null,
    };

    store.snapshot.runFiles.unshift(runFile);
    store.snapshot.libraryItems.unshift(item);
  }

  syncFolderMemberships(store.snapshot);
  return cloneSnapshot(store.snapshot);
}

export function getHostedMockFile(fileId: string) {
  const record = getStore().files.get(fileId);
  if (!record) {
    return null;
  }

  return {
    ...record,
  };
}
