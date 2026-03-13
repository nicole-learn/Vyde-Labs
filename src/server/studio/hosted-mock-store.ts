import {
  createDraft,
  createGeneratedLibraryItem,
  createGenerationRunPreviewUrl,
  createGenerationRunSummary,
  createStudioId,
  createStudioSeedSnapshot,
  hydrateDraft,
} from "@/features/studio/studio-local-runtime-data";
import { getStudioModelById } from "@/features/studio/studio-model-catalog";
import type { HostedStudioMutation } from "@/features/studio/studio-hosted-mock-api";
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

type HostedMockStore = {
  snapshot: StudioWorkspaceSnapshot;
  files: Map<string, HostedFileRecord>;
  dispatchTimers: Map<string, ReturnType<typeof setTimeout>>;
  completionTimers: Map<string, ReturnType<typeof setTimeout>>;
};

const STORE_KEY = "__VYDELABS_HOSTED_MOCK_STORE__";

function quoteCredits(modelId: string, draft: PersistedStudioDraft) {
  if (modelId === "veo-3.1") {
    const durationMultiplier = Math.max(1, Math.round(draft.durationSeconds / 4));
    const resolutionBase =
      draft.resolution === "4K" ? 24 : draft.resolution === "1080p" ? 16 : 12;
    return resolutionBase + Math.max(0, durationMultiplier - 1) * 4;
  }

  if (modelId === "nano-banana-2") {
    if (draft.resolution === "4K") return 10;
    if (draft.resolution === "2K") return 7;
    return 4;
  }

  return 1;
}

function getConcurrencyLimit(snapshot: StudioWorkspaceSnapshot) {
  const activeUsers = Math.max(snapshot.queueSettings.activeHostedUserCount, 1);
  return Math.max(1, Math.floor(snapshot.queueSettings.providerSlotLimit / activeUsers));
}

function getCompletionDelayMs(run: GenerationRun) {
  if (run.kind === "video") {
    return 3200;
  }

  if (run.kind === "text") {
    return 1200;
  }

  return 1800;
}

function shouldMockRunFail(run: GenerationRun) {
  return /\b(fail|error)\b/i.test(run.prompt);
}

function cloneSnapshot(snapshot: StudioWorkspaceSnapshot) {
  return structuredClone(snapshot);
}

function clearTimer(timer: ReturnType<typeof setTimeout> | undefined) {
  if (timer) {
    clearTimeout(timer);
  }
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

    if (processingCount >= getConcurrencyLimit(store.snapshot)) {
      scheduleDispatch(store, runId, 450);
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

    if (shouldMockRunFail(latestRun)) {
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
    const nextRunFile: StudioRunFile | null =
      latestRun.kind === "text"
        ? null
        : {
            id: nextRunFileId!,
            runId: latestRun.id,
            userId: latestRun.userId,
            fileRole: "output",
            sourceType: "generated",
            storageBucket: "inline-preview",
            storagePath: createGenerationRunPreviewUrl(model, draft),
            mimeType: model.kind === "video" ? "video/mp4" : "image/png",
            fileName: `${latestRun.id}.${model.kind === "video" ? "mp4" : "png"}`,
            fileSizeBytes: null,
            mediaWidth: null,
            mediaHeight: null,
            aspectRatioLabel: draft.aspectRatio,
            metadata: {},
            createdAt: finishedAt,
          };

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

    latestRun.status = "completed";
    latestRun.providerStatus = "completed";
    latestRun.outputAssetId = nextItem.id;
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
  }, getCompletionDelayMs(run));

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
      if (snapshot.activeCreditPack && snapshot.creditBalance) {
        snapshot.creditBalance.balanceCredits += snapshot.activeCreditPack.credits;
        snapshot.creditBalance.updatedAt = new Date().toISOString();
      }
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
        aspectRatioLabel: null,
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
        ...createDraft(model),
        ...mutation.draft,
      };
      const estimatedCredits = quoteCredits(model.id, persistedDraft);
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
        requestMode:
          model.kind === "image"
            ? "text-to-image"
            : model.kind === "video"
              ? "text-to-video"
              : "chat",
        status: "queued",
        prompt: persistedDraft.prompt,
        createdAt,
        queueEnteredAt: createdAt,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        cancelledAt: null,
        updatedAt: createdAt,
        summary: createGenerationRunSummary(model, hydrateDraft(persistedDraft, model)),
        outputAssetId: null,
        previewUrl: createGenerationRunPreviewUrl(model, hydrateDraft(persistedDraft, model)),
        errorMessage: null,
        inputPayload: {
          prompt: persistedDraft.prompt,
        },
        inputSettings: persistedDraft,
        providerRequestId: null,
        providerStatus: "queued",
        estimatedCostUsd: null,
        actualCostUsd: null,
        estimatedCredits,
        actualCredits: null,
        usageSnapshot: {},
        outputText: null,
        pricingSnapshot: {
          estimated_credits: estimatedCredits,
        },
        dispatchAttemptCount: 0,
        dispatchLeaseExpiresAt: null,
        canCancel: true,
        draftSnapshot: {
          ...persistedDraft,
          referenceCount: "referenceCount" in mutation.draft ? mutation.draft.referenceCount : 0,
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
  return cloneSnapshot(snapshot);
}

export async function uploadHostedMockFiles(params: {
  files: File[];
  folderId: string | null;
}) {
  const store = getStore();
  const createdAt = new Date().toISOString();

  for (const file of params.files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const runFileId = createStudioId("run-file");
    const previewUrl = `/api/mock/studio/hosted/files/${runFileId}`;

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
      mediaWidth: null,
      mediaHeight: null,
      aspectRatioLabel: null,
      metadata: {},
      createdAt,
    };

    const kind = file.type.startsWith("video/") ? "video" : "image";
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
      thumbnailUrl: previewUrl,
      contentText: null,
      createdAt,
      updatedAt: createdAt,
      modelId: null,
      runId: null,
      provider: "fal",
      status: "ready",
      prompt: "",
      meta: `${file.type || "File"} • ${(file.size / 1024 / 1024).toFixed(1)} MB`,
      mediaWidth: null,
      mediaHeight: null,
      aspectRatioLabel: null,
      folderId: params.folderId,
      folderIds: params.folderId ? [params.folderId] : [],
      storageBucket: "mock-api",
      storagePath: runFileId,
      thumbnailPath: runFileId,
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
