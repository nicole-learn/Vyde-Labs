"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StudioAppMode } from "./studio-app-mode";
import {
  deleteUploadedAssetFile,
  loadStoredProviderSettings,
  loadStoredWorkspaceSnapshot,
  loadUploadedAssetFile,
  saveStoredProviderSettings,
  saveStoredWorkspaceSnapshot,
  saveUploadedAssetFile,
} from "./studio-browser-storage";
import {
  buildStudioDraftMap,
  createDraft,
  createDraftSnapshot,
  createGeneratedLibraryItem,
  createGenerationRunPreviewUrl,
  createGenerationRunSummary,
  createStudioId,
  createStudioSeedSnapshot,
  HOSTED_STUDIO_WORKSPACE_ID,
  hydrateDraft,
  LOCAL_STUDIO_WORKSPACE_ID,
  toPersistedDraft,
} from "./studio-local-runtime-data";
import {
  appendLibraryItemsToPrompt,
  createDraftReferenceFromFile,
  createDraftReferenceFromLibraryItem,
  createFolderItemCounts,
  createTextLibraryItem,
  createUploadedRunFileAndLibraryItem,
  hasFolderNameConflict,
  isInFlightStudioRunStatus,
  isReferenceEligibleLibraryItem,
  mergeDraftReferences,
  releaseDraftReferencePreview,
  releaseRemovedDraftReferencePreviews,
  releaseUploadedPreview,
  resolveLibraryItemToReferenceFile,
  revokePreviewUrl,
} from "./studio-local-runtime-helpers";
import {
  STUDIO_MODEL_CATALOG,
  STUDIO_MODEL_SECTIONS,
  getStudioModelById,
} from "./studio-model-catalog";
import type {
  HostedStudioMutation,
  HostedStudioSnapshotResponse,
} from "./studio-hosted-mock-api";
import type {
  DraftReference,
  GenerationRun,
  LibraryItem,
  PersistedStudioDraft,
  StudioCreditBalance,
  StudioCreditPack,
  StudioDraft,
  StudioFolder,
  StudioFolderEditorMode,
  StudioFolderItem,
  StudioHostedAccount,
  StudioProviderConnectionStatus,
  StudioProviderSaveResult,
  StudioProviderSettings,
  StudioQueueSettings,
  StudioRunFile,
  StudioWorkspaceSnapshot,
} from "./types";

const EMPTY_PROVIDER_SETTINGS: StudioProviderSettings = {
  falApiKey: "",
  lastValidatedAt: null,
};

function getWorkspaceIdForMode(mode: StudioAppMode) {
  return mode === "hosted" ? HOSTED_STUDIO_WORKSPACE_ID : LOCAL_STUDIO_WORKSPACE_ID;
}

function createEmptyDraftReferenceMap() {
  return Object.fromEntries(
    STUDIO_MODEL_CATALOG.map((model) => [model.id, [] as DraftReference[]])
  ) as Record<string, DraftReference[]>;
}

function quoteCredits(modelId: string, draft: StudioDraft) {
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

function getConcurrencyLimit(mode: StudioAppMode, queueSettings: StudioQueueSettings) {
  if (mode === "hosted") {
    const activeUsers = Math.max(queueSettings.activeHostedUserCount, 1);
    return Math.max(1, Math.floor(queueSettings.providerSlotLimit / activeUsers));
  }

  return queueSettings.localConcurrencyLimit;
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

function sanitizeItemsForStorage(items: LibraryItem[]) {
  return items.map((item) => {
    if (item.storageBucket !== "browser-upload") {
      return item;
    }

    return {
      ...item,
      previewUrl: null,
      thumbnailUrl: null,
    };
  });
}

async function hydrateUploadedPreviewUrls(
  items: LibraryItem[],
  previewUrls: Map<string, string>
) {
  const hydratedItems = await Promise.all(
    items.map(async (item) => {
      if (item.storageBucket !== "browser-upload" || !item.storagePath) {
        return item;
      }

      const blob = await loadUploadedAssetFile(item.storagePath);
      if (!blob) {
        return item;
      }

      const previewUrl = URL.createObjectURL(blob);
      previewUrls.set(item.id, previewUrl);

      return {
        ...item,
        previewUrl,
        thumbnailUrl: previewUrl,
      };
    })
  );

  return hydratedItems;
}

function buildWorkspaceSnapshot(params: {
  activeCreditPack: StudioCreditPack | null;
  appMode: StudioAppMode;
  creditBalance: StudioCreditBalance | null;
  draftsByModelId: Record<string, PersistedStudioDraft>;
  folders: StudioFolder[];
  folderItems: StudioFolderItem[];
  gallerySizeLevel: number;
  items: LibraryItem[];
  profile: StudioWorkspaceSnapshot["profile"];
  providerSettings: StudioProviderSettings;
  queueSettings: StudioQueueSettings;
  runFiles: StudioRunFile[];
  runs: GenerationRun[];
  selectedModelId: string;
}) {
  return {
    schemaVersion: 2,
    mode: params.appMode,
    profile: params.profile,
    providerSettings: params.providerSettings,
    creditBalance: params.creditBalance,
    activeCreditPack: params.activeCreditPack,
    queueSettings: params.queueSettings,
    folders: params.folders,
    folderItems: params.folderItems,
    runFiles: params.runFiles,
    libraryItems: sanitizeItemsForStorage(params.items),
    generationRuns: params.runs,
    draftsByModelId: params.draftsByModelId,
    selectedModelId: params.selectedModelId,
    gallerySizeLevel: params.gallerySizeLevel,
  } satisfies StudioWorkspaceSnapshot;
}

async function fetchHostedSnapshot() {
  const response = await fetch("/api/mock/studio/hosted", {
    method: "GET",
    cache: "no-store",
  });
  const payload = (await response.json()) as HostedStudioSnapshotResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load hosted mock state.");
  }

  return payload.snapshot;
}

async function mutateHostedSnapshot(mutation: HostedStudioMutation) {
  const response = await fetch("/api/mock/studio/hosted", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mutation),
  });
  const payload = (await response.json()) as HostedStudioSnapshotResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Hosted mock mutation failed.");
  }

  return payload.snapshot;
}

async function uploadHostedFiles(files: File[], folderId: string | null) {
  const formData = new FormData();
  if (folderId) {
    formData.set("folderId", folderId);
  }
  for (const file of files) {
    formData.append("files", file);
  }

  const response = await fetch("/api/mock/studio/hosted/uploads", {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json()) as HostedStudioSnapshotResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Hosted mock upload failed.");
  }

  return payload.snapshot;
}

export function useStudioMockRuntime(appMode: StudioAppMode) {
  const seedSnapshot = useMemo(() => createStudioSeedSnapshot(appMode), [appMode]);
  const previewUrlsRef = useRef(new Map<string, string>());
  const storageHydratedRef = useRef(false);
  const dispatchTimersRef = useRef(new Map<string, number>());
  const completionTimersRef = useRef(new Map<string, number>());
  const draftReferencesRef = useRef(createEmptyDraftReferenceMap());
  const runsRef = useRef(seedSnapshot.generationRuns);

  const [models] = useState(STUDIO_MODEL_CATALOG);
  const [profile, setProfile] = useState(seedSnapshot.profile);
  const [creditBalance, setCreditBalance] = useState(seedSnapshot.creditBalance);
  const [activeCreditPack, setActiveCreditPack] = useState(seedSnapshot.activeCreditPack);
  const [queueSettings, setQueueSettings] = useState(seedSnapshot.queueSettings);
  const [selectedModelId, setSelectedModelIdState] = useState(seedSnapshot.selectedModelId);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState(seedSnapshot.folders);
  const [folderItems, setFolderItems] = useState(seedSnapshot.folderItems);
  const [items, setItems] = useState(seedSnapshot.libraryItems);
  const [runFiles, setRunFiles] = useState(seedSnapshot.runFiles);
  const [runs, setRuns] = useState(seedSnapshot.generationRuns);
  const [draftsByModelId, setDraftsByModelId] = useState(seedSnapshot.draftsByModelId);
  const [draftReferencesByModelId, setDraftReferencesByModelId] = useState(
    createEmptyDraftReferenceMap
  );
  const [gallerySizeLevel, setGallerySizeLevelState] = useState(
    seedSnapshot.gallerySizeLevel
  );
  const [providerSettings, setProviderSettings] = useState<StudioProviderSettings>(
    EMPTY_PROVIDER_SETTINGS
  );
  const [providerSettingsOpen, setProviderSettingsOpen] = useState(false);
  const [providerConnectionStatus, setProviderConnectionStatus] =
    useState<StudioProviderConnectionStatus>("idle");
  const [folderEditorOpen, setFolderEditorOpen] = useState(false);
  const [folderEditorMode, setFolderEditorMode] =
    useState<StudioFolderEditorMode>("create");
  const [folderEditorValue, setFolderEditorValue] = useState("");
  const [folderEditorTargetId, setFolderEditorTargetId] = useState<string | null>(
    null
  );
  const [folderEditorError, setFolderEditorError] = useState<string | null>(null);
  const [folderEditorSaving, setFolderEditorSaving] = useState(false);
  const [selectionModeEnabled, setSelectionModeEnabled] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [createTextDialogOpen, setCreateTextDialogOpen] = useState(false);
  const [createTextTitle, setCreateTextTitle] = useState("");
  const [createTextBody, setCreateTextBody] = useState("");
  const [createTextSaving, setCreateTextSaving] = useState(false);
  const [createTextErrorMessage, setCreateTextErrorMessage] = useState<string | null>(
    null
  );
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadDialogFolderId, setUploadDialogFolderId] = useState<string | null>(
    null
  );
  const [uploadAssetsLoading, setUploadAssetsLoading] = useState(false);
  const [queueLimitDialogOpen, setQueueLimitDialogOpen] = useState(false);
  const [purchaseCreditsPending, setPurchaseCreditsPending] = useState(false);

  const applySnapshot = useCallback(
    (nextSnapshot: StudioWorkspaceSnapshot, options?: { preserveDrafts?: boolean }) => {
      setProfile(nextSnapshot.profile);
      setCreditBalance(nextSnapshot.creditBalance);
      setActiveCreditPack(nextSnapshot.activeCreditPack);
      setQueueSettings(nextSnapshot.queueSettings);
      setFolders(nextSnapshot.folders);
      setFolderItems(nextSnapshot.folderItems);
      setRunFiles(nextSnapshot.runFiles);
      setRuns(nextSnapshot.generationRuns);
      setItems(nextSnapshot.libraryItems);

      if (!options?.preserveDrafts) {
        setDraftsByModelId(nextSnapshot.draftsByModelId);
        setSelectedModelIdState(nextSnapshot.selectedModelId);
        setGallerySizeLevelState(nextSnapshot.gallerySizeLevel);
      }
    },
    []
  );

  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  useEffect(() => {
    draftReferencesRef.current = draftReferencesByModelId;
  }, [draftReferencesByModelId]);

  const clearAllTimers = useCallback(() => {
    for (const timerId of dispatchTimersRef.current.values()) {
      window.clearTimeout(timerId);
    }
    for (const timerId of completionTimersRef.current.values()) {
      window.clearTimeout(timerId);
    }
    dispatchTimersRef.current.clear();
    completionTimersRef.current.clear();
  }, []);

  const cleanupPreviewUrls = useCallback(() => {
    for (const previewUrl of previewUrlsRef.current.values()) {
      revokePreviewUrl(previewUrl);
    }
    previewUrlsRef.current.clear();
  }, []);

  const cleanupDraftReferences = useCallback(() => {
    for (const references of Object.values(draftReferencesRef.current)) {
      for (const reference of references) {
        releaseDraftReferencePreview(reference);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      clearAllTimers();
      cleanupPreviewUrls();
      cleanupDraftReferences();
    };
  }, [cleanupDraftReferences, cleanupPreviewUrls, clearAllTimers]);

  useEffect(() => {
    let cancelled = false;

    storageHydratedRef.current = false;
    clearAllTimers();
    cleanupPreviewUrls();
    cleanupDraftReferences();

    const resetUiState = () => {
      setProviderSettings(EMPTY_PROVIDER_SETTINGS);
      setProviderConnectionStatus("idle");
      setSelectedFolderId(null);
      setSelectionModeEnabled(false);
      setSelectedItemIds([]);
      setFolderEditorOpen(false);
      setFolderEditorError(null);
      setFolderEditorTargetId(null);
      setFolderEditorValue("");
      setCreateTextDialogOpen(false);
      setCreateTextTitle("");
      setCreateTextBody("");
      setCreateTextErrorMessage(null);
      setUploadDialogOpen(false);
      setUploadDialogFolderId(null);
      setQueueLimitDialogOpen(false);
      setDraftReferencesByModelId(createEmptyDraftReferenceMap());
    };

    resetUiState();

    if (appMode === "hosted") {
      void fetchHostedSnapshot()
        .then((nextSnapshot) => {
          if (cancelled) {
            return;
          }

          applySnapshot(nextSnapshot);
          storageHydratedRef.current = true;
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          applySnapshot(seedSnapshot);
          storageHydratedRef.current = true;
        });

      return () => {
        cancelled = true;
      };
    }

    const nextSnapshot = loadStoredWorkspaceSnapshot(appMode) ?? seedSnapshot;
    const nextProviderSettings = loadStoredProviderSettings() ?? nextSnapshot.providerSettings;

    applySnapshot(nextSnapshot);
    setProviderSettings(nextProviderSettings);
    setProviderConnectionStatus(nextProviderSettings.falApiKey ? "connected" : "idle");
    setSelectedFolderId(null);

    void hydrateUploadedPreviewUrls(nextSnapshot.libraryItems, previewUrlsRef.current).then(
      (hydratedItems) => {
        if (cancelled) {
          for (const item of hydratedItems) {
            if (item.previewUrl?.startsWith("blob:")) {
              revokePreviewUrl(item.previewUrl);
            }
          }
          return;
        }

        setItems(hydratedItems);
        storageHydratedRef.current = true;
      }
    );

    if (nextSnapshot.libraryItems.every((item) => item.storageBucket !== "browser-upload")) {
      setItems(nextSnapshot.libraryItems);
      storageHydratedRef.current = true;
    }

    return () => {
      cancelled = true;
    };
  }, [
    appMode,
    applySnapshot,
    cleanupDraftReferences,
    cleanupPreviewUrls,
    clearAllTimers,
    seedSnapshot,
  ]);

  useEffect(() => {
    if (!storageHydratedRef.current || appMode !== "local") {
      return;
    }

    const snapshot = buildWorkspaceSnapshot({
      activeCreditPack,
      appMode,
      creditBalance,
      draftsByModelId,
      folders,
      folderItems,
      gallerySizeLevel,
      items,
      profile,
      providerSettings,
      queueSettings,
      runFiles,
      runs,
      selectedModelId,
    });

    saveStoredWorkspaceSnapshot(appMode, snapshot);
  }, [
    activeCreditPack,
    appMode,
    creditBalance,
    draftsByModelId,
    folderItems,
    folders,
    gallerySizeLevel,
    items,
    profile,
    providerSettings,
    queueSettings,
    runFiles,
    runs,
    selectedModelId,
  ]);

  useEffect(() => {
    if (appMode !== "local" || !storageHydratedRef.current) {
      return;
    }

    saveStoredProviderSettings(providerSettings);
  }, [appMode, providerSettings]);

  useEffect(() => {
    if (appMode !== "hosted" || !storageHydratedRef.current) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchHostedSnapshot()
        .then((nextSnapshot) => {
          applySnapshot(nextSnapshot, { preserveDrafts: true });
        })
        .catch(() => {
          // Keep the last known hosted mock state if polling fails.
        });
    }, 1200);

    return () => window.clearInterval(intervalId);
  }, [appMode, applySnapshot]);

  const scheduleDispatchAttempt = useCallback(
    (runId: string, delayMs: number) => {
      const existingTimerId = dispatchTimersRef.current.get(runId);
      if (existingTimerId) {
        window.clearTimeout(existingTimerId);
      }

      const timerId = window.setTimeout(() => {
        dispatchTimersRef.current.delete(runId);
        let reschedule = false;

        setRuns((current) => {
          const run = current.find((entry) => entry.id === runId);
          if (!run || (run.status !== "queued" && run.status !== "pending")) {
            return current;
          }

          const concurrencyLimit = getConcurrencyLimit(appMode, queueSettings);
          const processingCount = current.filter(
            (entry) => entry.status === "processing"
          ).length;

          if (processingCount >= concurrencyLimit) {
            reschedule = true;
            return current;
          }

          const startedAt = new Date().toISOString();
          return current.map((entry) =>
            entry.id === runId
              ? {
                  ...entry,
                  status: "processing",
                  startedAt,
                  updatedAt: startedAt,
                  providerRequestId: entry.providerRequestId ?? `fal_mock_${entry.id}`,
                  providerStatus: "running",
                  dispatchAttemptCount: entry.dispatchAttemptCount + 1,
                  dispatchLeaseExpiresAt: null,
                  canCancel: false,
                }
              : entry
          );
        });

        if (reschedule) {
          scheduleDispatchAttempt(runId, 450);
        }
      }, delayMs);

      dispatchTimersRef.current.set(runId, timerId);
    },
    [appMode, queueSettings]
  );

  const finalizeRunFailure = useCallback(
    (run: GenerationRun) => {
      const finishedAt = new Date().toISOString();
      const heldCredits = run.estimatedCredits ?? 0;

      setRuns((current) =>
        current.map((entry) =>
          entry.id === run.id
            ? {
                ...entry,
                status: "failed",
                completedAt: finishedAt,
                failedAt: finishedAt,
                updatedAt: finishedAt,
                providerStatus: "failed",
                errorMessage:
                  "Mock Fal generation failed before an output asset was returned.",
                canCancel: false,
              }
            : entry
        )
      );

      if (appMode === "hosted" && heldCredits > 0 && creditBalance) {
        setCreditBalance((current) =>
          current
            ? {
                ...current,
                balanceCredits: current.balanceCredits + heldCredits,
                updatedAt: finishedAt,
              }
            : current
        );
      }
    },
    [appMode, creditBalance]
  );

  const finalizeRunSuccess = useCallback(
    (run: GenerationRun) => {
      const model = getStudioModelById(run.modelId);
      const draft = hydrateDraft(run.draftSnapshot, model);
      const completedAt = new Date().toISOString();
      const nextRunFileId =
        run.kind === "text" ? null : createStudioId("run-file");
      const nextRunFile: StudioRunFile | null =
        run.kind === "text"
          ? null
          : {
              id: nextRunFileId!,
              runId: run.id,
              userId: run.userId,
              fileRole: "output",
              sourceType: "generated",
              storageBucket: "inline-preview",
              storagePath: createGenerationRunPreviewUrl(model, draft),
              mimeType: model.kind === "video" ? "video/mp4" : "image/png",
              fileName: `${run.id}.${model.kind === "video" ? "mp4" : "png"}`,
              fileSizeBytes: null,
              mediaWidth: null,
              mediaHeight: null,
              aspectRatioLabel: draft.aspectRatio,
              metadata: {},
              createdAt: completedAt,
            };

      const nextItem = createGeneratedLibraryItem({
        runFileId: nextRunFileId,
        sourceRunId: run.id,
        model,
        draft,
        createdAt: completedAt,
        folderId: run.folderId,
        runId: run.id,
        userId: run.userId,
        workspaceId: run.workspaceId,
      });

      setItems((current) => [nextItem, ...current]);
      setFolderItems((current) => [
        ...nextItem.folderIds.map((folderId) => ({
          folderId,
          libraryItemId: nextItem.id,
          createdAt: completedAt,
        })),
        ...current,
      ]);

      if (nextRunFile) {
        setRunFiles((current) => [nextRunFile, ...current]);
      }

      setRuns((current) =>
        current.map((entry) =>
          entry.id === run.id
            ? {
                ...entry,
                status: "completed",
                completedAt,
                updatedAt: completedAt,
                providerStatus: "completed",
                outputAssetId: nextItem.id,
                actualCredits: entry.estimatedCredits,
                outputText: nextItem.kind === "text" ? nextItem.contentText : null,
                canCancel: false,
              }
            : entry
        )
      );
    },
    []
  );

  const scheduleRunCompletion = useCallback(
    (run: GenerationRun) => {
      const existingTimerId = completionTimersRef.current.get(run.id);
      if (existingTimerId) {
        window.clearTimeout(existingTimerId);
      }

      const elapsedMs = run.startedAt
        ? Math.max(0, Date.now() - Date.parse(run.startedAt))
        : 0;
      const delayMs = Math.max(400, getCompletionDelayMs(run) - elapsedMs);

      const timerId = window.setTimeout(() => {
        completionTimersRef.current.delete(run.id);

        const latestRun = runsRef.current.find((entry) => entry.id === run.id);
        if (!latestRun || latestRun.status !== "processing") {
          return;
        }

        if (shouldMockRunFail(latestRun)) {
          finalizeRunFailure(latestRun);
          return;
        }

        finalizeRunSuccess(latestRun);
      }, delayMs);

      completionTimersRef.current.set(run.id, timerId);
    },
    [finalizeRunFailure, finalizeRunSuccess]
  );

  useEffect(() => {
    if (appMode === "hosted") {
      clearAllTimers();
      return;
    }

    const activeRunIds = new Set(
      runs
        .filter((run) => run.status === "queued" || run.status === "pending")
        .map((run) => run.id)
    );
    for (const [runId, timerId] of dispatchTimersRef.current) {
      if (!activeRunIds.has(runId)) {
        window.clearTimeout(timerId);
        dispatchTimersRef.current.delete(runId);
      }
    }

    const processingRunIds = new Set(
      runs.filter((run) => run.status === "processing").map((run) => run.id)
    );
    for (const [runId, timerId] of completionTimersRef.current) {
      if (!processingRunIds.has(runId)) {
        window.clearTimeout(timerId);
        completionTimersRef.current.delete(runId);
      }
    }

    for (const run of runs) {
      if ((run.status === "queued" || run.status === "pending") && !dispatchTimersRef.current.has(run.id)) {
        scheduleDispatchAttempt(run.id, 320);
      }

      if (run.status === "processing" && !completionTimersRef.current.has(run.id)) {
        scheduleRunCompletion(run);
      }
    }
  }, [appMode, clearAllTimers, runs, scheduleDispatchAttempt, scheduleRunCompletion]);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? models[0],
    [models, selectedModelId]
  );

  const currentDraft = useMemo(() => {
    const persistedDraft =
      draftsByModelId[selectedModel.id] ?? buildStudioDraftMap()[selectedModel.id];
    const references = draftReferencesByModelId[selectedModel.id] ?? [];

    return {
      ...hydrateDraft(persistedDraft, selectedModel),
      references,
    } satisfies StudioDraft;
  }, [draftReferencesByModelId, draftsByModelId, selectedModel]);

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );

  const ungroupedItems = useMemo(
    () => items.filter((item) => item.folderIds.length === 0),
    [items]
  );

  const selectedFolderItems = useMemo(() => {
    if (!selectedFolderId) {
      return [];
    }

    return items.filter((item) => item.folderIds.includes(selectedFolderId));
  }, [items, selectedFolderId]);

  const ungroupedRunCards = useMemo(
    () =>
      runs.filter(
        (run) =>
          run.folderId === null &&
          run.outputAssetId === null &&
          (isInFlightStudioRunStatus(run.status) ||
            run.status === "failed" ||
            run.status === "cancelled")
      ),
    [runs]
  );

  const selectedFolderRunCards = useMemo(() => {
    if (!selectedFolderId) {
      return [];
    }

    return runs.filter(
      (run) =>
        run.folderId === selectedFolderId &&
        run.outputAssetId === null &&
        (isInFlightStudioRunStatus(run.status) ||
          run.status === "failed" ||
          run.status === "cancelled")
    );
  }, [runs, selectedFolderId]);

  const folderCounts = useMemo(
    () => createFolderItemCounts(folders, folderItems),
    [folderItems, folders]
  );

  const selectedItemIdSet = useMemo(
    () => new Set(selectedItemIds),
    [selectedItemIds]
  );

  const selectedItemCount = selectedItemIds.length;
  const hasFalKey = providerSettings.falApiKey.trim().length > 0;
  const maxReferenceFiles = selectedModel.maxReferenceFiles ?? 6;

  const applyHostedMutation = useCallback(
    async (mutation: HostedStudioMutation) => {
      const nextSnapshot = await mutateHostedSnapshot(mutation);
      applySnapshot(nextSnapshot, { preserveDrafts: true });
      return nextSnapshot;
    },
    [applySnapshot]
  );

  const applyHostedUpload = useCallback(
    async (files: File[], folderId: string | null) => {
      const nextSnapshot = await uploadHostedFiles(files, folderId);
      applySnapshot(nextSnapshot, { preserveDrafts: true });
      return nextSnapshot;
    },
    [applySnapshot]
  );

  const hostedAccount = useMemo(() => {
    if (appMode !== "hosted" || !creditBalance || !activeCreditPack) {
      return null;
    }

    return {
      profile,
      creditBalance,
      activeCreditPack,
      queuedCount: runs.filter((run) => run.status === "queued").length,
      generatingCount: runs.filter((run) => run.status === "processing").length,
      completedCount: runs.filter((run) => run.status === "completed").length,
      pricingSummary: "Fal market rate + 25%",
      environmentLabel: "Hosted preview",
    } satisfies StudioHostedAccount;
  }, [activeCreditPack, appMode, creditBalance, profile, runs]);

  const accountButtonLabel =
    appMode === "hosted" ? profile.avatarLabel || "U" : "V";

  const clearSelection = useCallback(() => {
    setSelectedItemIds([]);
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionModeEnabled((current) => {
      if (current) {
        setSelectedItemIds([]);
      }

      return !current;
    });
  }, []);

  const toggleItemSelection = useCallback((itemId: string) => {
    setSelectedItemIds((current) =>
      current.includes(itemId)
        ? current.filter((entry) => entry !== itemId)
        : [...current, itemId]
    );
  }, []);

  const updatePersistedDraft = useCallback(
    (patch: Partial<PersistedStudioDraft>) => {
      setDraftsByModelId((current) => ({
        ...current,
        [selectedModel.id]: {
          ...(current[selectedModel.id] ?? toPersistedDraft(createDraft(selectedModel))),
          ...patch,
        },
      }));
    },
    [selectedModel]
  );

  const updateDraft = useCallback(
    (patch: Partial<StudioDraft>) => {
      const nextPatch = { ...patch };
      delete nextPatch.references;
      updatePersistedDraft(nextPatch);
    },
    [updatePersistedDraft]
  );

  const replaceDraftReferences = useCallback(
    (
      nextReferencesOrUpdater:
        | DraftReference[]
        | ((currentReferences: DraftReference[]) => DraftReference[])
    ) => {
      setDraftReferencesByModelId((current) => {
        const existingReferences = current[selectedModel.id] ?? [];
        const nextReferences =
          typeof nextReferencesOrUpdater === "function"
            ? nextReferencesOrUpdater(existingReferences)
            : nextReferencesOrUpdater;

        releaseRemovedDraftReferencePreviews(existingReferences, nextReferences);

        return {
          ...current,
          [selectedModel.id]: nextReferences,
        };
      });
    },
    [selectedModel.id]
  );

  const addDraftReferences = useCallback(
    (nextReferences: DraftReference[]) => {
      const mergedReferences = mergeDraftReferences(
        currentDraft.references,
        nextReferences,
        maxReferenceFiles
      );

      const keptReferenceIds = new Set(
        mergedReferences.map((reference) => reference.id)
      );
      for (const reference of nextReferences) {
        if (!keptReferenceIds.has(reference.id)) {
          releaseDraftReferencePreview(reference);
        }
      }

      replaceDraftReferences(mergedReferences);

      return {
        addedCount: Math.max(0, mergedReferences.length - currentDraft.references.length),
        maxReached: mergedReferences.length >= maxReferenceFiles,
      };
    },
    [currentDraft.references, maxReferenceFiles, replaceDraftReferences]
  );

  const addReferences = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      addDraftReferences(files.map(createDraftReferenceFromFile));
    },
    [addDraftReferences]
  );

  const removeReference = useCallback(
    (referenceId: string) => {
      replaceDraftReferences((currentReferences) =>
        currentReferences.filter((reference) => reference.id !== referenceId)
      );
    },
    [replaceDraftReferences]
  );

  const getItemsById = useCallback(
    (itemIds: string[]) => {
      const uniqueIds = Array.from(new Set(itemIds));
      const itemMap = new Map(items.map((item) => [item.id, item]));
      return uniqueIds
        .map((itemId) => itemMap.get(itemId))
        .filter((item): item is LibraryItem => Boolean(item));
    },
    [items]
  );

  const getPromptBarDropHint = useCallback(
    (itemIds: string[]) => {
      const droppedItems = getItemsById(itemIds);
      if (droppedItems.length === 0) {
        return "Drop into prompt bar";
      }

      const hasTextItems = droppedItems.some((item) => item.kind === "text");
      const hasReferenceItems = droppedItems.some(isReferenceEligibleLibraryItem);

      if (hasTextItems && hasReferenceItems) {
        return selectedModel.supportsReferences
          ? "Drop to add references and prompt text"
          : "Drop to merge text into the prompt";
      }

      if (hasTextItems) {
        return droppedItems.length > 1
          ? "Drop to merge into the prompt"
          : "Drop to use as prompt";
      }

      if (hasReferenceItems) {
        return selectedModel.supportsReferences
          ? droppedItems.length > 1
            ? "Drop to add as references"
            : "Drop to add as reference"
          : "This model doesn't support references yet";
      }

      return "Drop into prompt bar";
    },
    [getItemsById, selectedModel.supportsReferences]
  );

  const dropLibraryItemsIntoPromptBar = useCallback(
    async (itemIds: string[]) => {
      const droppedItems = getItemsById(itemIds);
      if (droppedItems.length === 0) {
        return "That asset is no longer available.";
      }

      const textItems = droppedItems.filter((item) => item.kind === "text");
      const referenceItems = droppedItems.filter(isReferenceEligibleLibraryItem);
      const messages: string[] = [];

      if (textItems.length > 0) {
        updateDraft({
          prompt: appendLibraryItemsToPrompt(currentDraft.prompt, textItems),
        });
      }

      if (referenceItems.length > 0) {
        if (!selectedModel.supportsReferences) {
          messages.push("This model doesn't support references yet.");
        } else {
          const resolvedReferenceEntries = await Promise.all(
            referenceItems.map(async (item) => {
              const file = await resolveLibraryItemToReferenceFile(item);
              if (!file) return null;

              return createDraftReferenceFromLibraryItem({
                file,
                item,
              });
            })
          );

          const validReferences = resolvedReferenceEntries.filter(
            (reference): reference is NonNullable<(typeof resolvedReferenceEntries)[number]> =>
              Boolean(reference)
          );

          if (validReferences.length === 0) {
            messages.push("Could not load the dropped asset as a reference.");
          } else {
            const { addedCount, maxReached } = addDraftReferences(validReferences);
            if (addedCount === 0) {
              messages.push(
                `Those references are already attached or the ${maxReferenceFiles}-reference limit is full.`
              );
            } else if (addedCount < validReferences.length || maxReached) {
              messages.push(
                `Some references were skipped because they were duplicates or the limit is ${maxReferenceFiles}.`
              );
            }
          }
        }
      }

      if (textItems.length === 0 && referenceItems.length === 0) {
        return "Only text, image, and video assets can be dropped here.";
      }

      return messages[0] ?? null;
    },
    [
      addDraftReferences,
      currentDraft.prompt,
      getItemsById,
      maxReferenceFiles,
      selectedModel.supportsReferences,
      updateDraft,
    ]
  );

  const moveItemsToFolder = useCallback((itemIds: string[], folderId: string | null) => {
    if (itemIds.length === 0) {
      return;
    }

    if (appMode === "hosted") {
      void applyHostedMutation({
        action: "move_items",
        itemIds,
        folderId,
      });
      return;
    }

    const itemIdSet = new Set(itemIds);
    const updatedAt = new Date().toISOString();

    setItems((current) =>
      current.map((item) =>
        itemIdSet.has(item.id)
          ? {
              ...item,
              folderId,
              folderIds: folderId ? [folderId] : [],
              updatedAt,
            }
          : item
      )
    );

    setFolderItems((current) => {
      const remaining = current.filter(
        (entry) => !itemIdSet.has(entry.libraryItemId)
      );
      if (!folderId) {
        return remaining;
      }

      return [
        ...itemIds.map((itemId) => ({
          folderId,
          libraryItemId: itemId,
          createdAt: updatedAt,
        })),
        ...remaining,
      ];
    });
  }, [appMode, applyHostedMutation]);

  const deleteItems = useCallback((itemIds: string[]) => {
    if (itemIds.length === 0) return;

    if (appMode === "hosted") {
      void applyHostedMutation({
        action: "delete_items",
        itemIds,
      });
      setSelectedItemIds((current) =>
        current.filter((itemId) => !itemIds.includes(itemId))
      );
      return;
    }

    const itemIdSet = new Set(itemIds);
    const itemsToDelete = items.filter((item) => itemIdSet.has(item.id));

    for (const item of itemsToDelete) {
      releaseUploadedPreview(item, previewUrlsRef.current);
      if (item.storageBucket === "browser-upload" && item.storagePath) {
        void deleteUploadedAssetFile(item.storagePath);
      }
    }

    setItems((current) => current.filter((item) => !itemIdSet.has(item.id)));
    setRunFiles((current) =>
      current.filter(
        (runFile) =>
          !itemsToDelete.some((item) => item.runFileId && item.runFileId === runFile.id)
      )
    );
    setFolderItems((current) =>
      current.filter((entry) => !itemIdSet.has(entry.libraryItemId))
    );
    setRuns((current) =>
      current.map((run) =>
        run.outputAssetId && itemIdSet.has(run.outputAssetId)
          ? { ...run, outputAssetId: null }
          : run
      )
    );
    setSelectedItemIds((current) =>
      current.filter((itemId) => !itemIdSet.has(itemId))
    );
  }, [appMode, applyHostedMutation, items]);

  const deleteItem = useCallback(
    (itemId: string) => {
      deleteItems([itemId]);
    },
    [deleteItems]
  );

  const deleteSelectedItems = useCallback(() => {
    deleteItems(selectedItemIds);
  }, [deleteItems, selectedItemIds]);

  const resetFolderEditor = useCallback(() => {
    setFolderEditorOpen(false);
    setFolderEditorValue("");
    setFolderEditorTargetId(null);
    setFolderEditorError(null);
  }, []);

  const closeFolderEditor = useCallback(() => {
    if (folderEditorSaving) {
      return;
    }

    resetFolderEditor();
  }, [folderEditorSaving, resetFolderEditor]);

  const updateFolderEditorValue = useCallback((value: string) => {
    setFolderEditorValue(value);
    setFolderEditorError(null);
  }, []);

  const openCreateFolder = useCallback(() => {
    setFolderEditorMode("create");
    setFolderEditorTargetId(null);
    setFolderEditorValue("");
    setFolderEditorError(null);
    setFolderEditorOpen(true);
  }, []);

  const openRenameFolder = useCallback(
    (folderId: string) => {
      const folder = folders.find((entry) => entry.id === folderId);
      if (!folder) return;

      setFolderEditorMode("rename");
      setFolderEditorTargetId(folder.id);
      setFolderEditorValue(folder.name);
      setFolderEditorError(null);
      setFolderEditorOpen(true);
    },
    [folders]
  );

  const saveFolder = useCallback(async () => {
    if (folderEditorSaving) {
      return;
    }

    setFolderEditorSaving(true);

    try {
      const nextName = folderEditorValue.trim();
      if (!nextName) {
        setFolderEditorError("Folder name is required.");
        return;
      }

      if (hasFolderNameConflict(folders, nextName, folderEditorTargetId)) {
        setFolderEditorError("A folder with that name already exists.");
        return;
      }

      if (appMode === "hosted") {
        if (folderEditorMode === "create") {
          await applyHostedMutation({
            action: "create_folder",
            name: nextName,
          });
        } else if (folderEditorTargetId) {
          await applyHostedMutation({
            action: "rename_folder",
            folderId: folderEditorTargetId,
            name: nextName,
          });
        }

        resetFolderEditor();
        return;
      }

      if (folderEditorMode === "create") {
        const createdAt = new Date().toISOString();
        const nextFolder: StudioFolder = {
          id: createStudioId("folder"),
          userId: profile.id,
          workspaceId: getWorkspaceIdForMode(appMode),
          name: nextName,
          createdAt,
          updatedAt: createdAt,
          sortOrder: 0,
        };

        setFolders((current) => [
          nextFolder,
          ...current.map((folder, index) => ({
            ...folder,
            sortOrder: index + 1,
          })),
        ]);
        setSelectedFolderId(nextFolder.id);
        resetFolderEditor();
        return;
      }

      if (!folderEditorTargetId) {
        return;
      }

      setFolders((current) =>
        current.map((folder) =>
          folder.id === folderEditorTargetId
            ? { ...folder, name: nextName, updatedAt: new Date().toISOString() }
            : folder
        )
      );
      resetFolderEditor();
    } finally {
      setFolderEditorSaving(false);
    }
  }, [
    appMode,
    folderEditorMode,
    folderEditorSaving,
    folderEditorTargetId,
    folderEditorValue,
    folders,
    applyHostedMutation,
    profile.id,
    resetFolderEditor,
  ]);

  const deleteFolder = useCallback((folderId: string) => {
    if (appMode === "hosted") {
      void applyHostedMutation({
        action: "delete_folder",
        folderId,
      });
      setSelectedFolderId((current) => (current === folderId ? null : current));
      return;
    }

    setFolders((current) =>
      current
        .filter((folder) => folder.id !== folderId)
        .map((folder, index) => ({
          ...folder,
          sortOrder: index,
        }))
    );
    setFolderItems((current) =>
      current.filter((entry) => entry.folderId !== folderId)
    );
    setItems((current) =>
      current.map((item) =>
        item.folderIds.includes(folderId)
          ? {
              ...item,
              folderId: null,
              folderIds: [],
              updatedAt: new Date().toISOString(),
            }
          : item
      )
    );
    setRuns((current) =>
      current.map((run) =>
        run.folderId === folderId ? { ...run, folderId: null } : run
      )
    );
    setSelectedFolderId((current) => (current === folderId ? null : current));
  }, [appMode, applyHostedMutation]);

  const reuseRun = useCallback(
    (runId: string) => {
      const run = runs.find((entry) => entry.id === runId);
      if (!run) return;

      const nextModel = getStudioModelById(run.modelId);
      setSelectedModelIdState(nextModel.id);
      setDraftsByModelId((current) => ({
        ...current,
        [nextModel.id]: {
          ...current[nextModel.id],
          ...run.draftSnapshot,
        },
      }));
      setDraftReferencesByModelId((current) => {
        releaseRemovedDraftReferencePreviews(current[nextModel.id] ?? [], []);
        return {
          ...current,
          [nextModel.id]: [],
        };
      });
    },
    [runs]
  );

  const reuseItem = useCallback(
    (itemId: string) => {
      const item = items.find((entry) => entry.id === itemId);
      if (!item?.modelId) return;

      const matchingRun = runs.find((run) => run.outputAssetId === item.id);
      if (matchingRun) {
        reuseRun(matchingRun.id);
        return;
      }

      const nextModel = getStudioModelById(item.modelId);
      setSelectedModelIdState(nextModel.id);
      setDraftsByModelId((current) => ({
        ...current,
        [nextModel.id]: {
          ...(current[nextModel.id] ?? toPersistedDraft(createDraft(nextModel))),
          prompt: item.prompt,
        },
      }));
      setDraftReferencesByModelId((current) => {
        releaseRemovedDraftReferencePreviews(current[nextModel.id] ?? [], []);
        return {
          ...current,
          [nextModel.id]: [],
        };
      });
    },
    [items, reuseRun, runs]
  );

  const updateTextItem = useCallback(
    (itemId: string, patch: { title?: string; contentText?: string }) => {
      if (appMode === "hosted") {
        void applyHostedMutation({
          action: "update_text_item",
          itemId,
          title: patch.title,
          contentText: patch.contentText,
        });
        return;
      }

      setItems((current) =>
        current.map((item) => {
          if (item.id !== itemId || item.kind !== "text") {
            return item;
          }

          const nextTitle = patch.title?.trim() ?? item.title;
          const nextContentText = patch.contentText?.trim() ?? item.contentText ?? "";

          return {
            ...item,
            title: nextTitle || "Text note",
            contentText: nextContentText,
            prompt: nextContentText,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    },
    [appMode, applyHostedMutation]
  );

  const openCreateTextComposer = useCallback(() => {
    setCreateTextTitle("");
    setCreateTextBody("");
    setCreateTextErrorMessage(null);
    setCreateTextDialogOpen(true);
  }, []);

  const closeCreateTextComposer = useCallback(() => {
    if (createTextSaving) {
      return;
    }

    setCreateTextDialogOpen(false);
    setCreateTextTitle("");
    setCreateTextBody("");
    setCreateTextErrorMessage(null);
  }, [createTextSaving]);

  const updateCreateTextTitle = useCallback((value: string) => {
    setCreateTextTitle(value);
    setCreateTextErrorMessage(null);
  }, []);

  const updateCreateTextBody = useCallback((value: string) => {
    setCreateTextBody(value);
    setCreateTextErrorMessage(null);
  }, []);

  const createTextAsset = useCallback(async () => {
    if (createTextSaving) {
      return;
    }

    const nextBody = createTextBody.trim();
    if (!nextBody) {
      setCreateTextErrorMessage("Prompt body is required.");
      return;
    }

    setCreateTextSaving(true);
    setCreateTextErrorMessage(null);

    try {
      if (appMode === "hosted") {
        await applyHostedMutation({
          action: "create_text_item",
          title: createTextTitle,
          body: createTextBody,
          folderId: selectedFolderId,
        });
        setCreateTextSaving(false);
        setCreateTextDialogOpen(false);
        setCreateTextTitle("");
        setCreateTextBody("");
        setCreateTextErrorMessage(null);
        return;
      }

      const nextItem = createTextLibraryItem({
        userId: profile.id,
        workspaceId: getWorkspaceIdForMode(appMode),
        title: createTextTitle,
        body: createTextBody,
        folderId: selectedFolderId,
      });

      setItems((current) => [nextItem, ...current]);
      if (nextItem.folderId) {
        setFolderItems((current) => [
          {
            folderId: nextItem.folderId!,
            libraryItemId: nextItem.id,
            createdAt: nextItem.createdAt,
          },
          ...current,
        ]);
      }
      setCreateTextSaving(false);
      setCreateTextDialogOpen(false);
      setCreateTextTitle("");
      setCreateTextBody("");
      setCreateTextErrorMessage(null);
    } catch (error) {
      setCreateTextErrorMessage(
        error instanceof Error ? error.message : "Failed to create prompt file."
      );
      setCreateTextSaving(false);
    }
  }, [
    appMode,
    applyHostedMutation,
    createTextBody,
    createTextSaving,
    createTextTitle,
    profile.id,
    selectedFolderId,
  ]);

  const openUploadDialog = useCallback(() => {
    if (uploadAssetsLoading) {
      return;
    }

    setUploadDialogFolderId(selectedFolderId);
    setUploadDialogOpen(true);
  }, [selectedFolderId, uploadAssetsLoading]);

  const closeUploadDialog = useCallback(() => {
    if (uploadAssetsLoading) {
      return;
    }

    setUploadDialogOpen(false);
  }, [uploadAssetsLoading]);

  const setUploadDialogFolder = useCallback((folderId: string | null) => {
    setUploadDialogFolderId(folderId);
  }, []);

  const uploadFiles = useCallback(
    async (files: File[], folderIdOverride?: string | null) => {
      if (files.length === 0 || uploadAssetsLoading) {
        return;
      }

      setUploadAssetsLoading(true);
      try {
        if (appMode === "hosted") {
          await applyHostedUpload(files, folderIdOverride ?? selectedFolderId);
          setUploadDialogOpen(false);
          return;
        }

        const createdEntriesResult = await Promise.all(
          files.map((file) =>
            createUploadedRunFileAndLibraryItem({
              file,
              userId: profile.id,
              workspaceId: getWorkspaceIdForMode(appMode),
              folderId: folderIdOverride ?? selectedFolderId,
            })
          )
        );
        const createdEntries = createdEntriesResult.filter(
          (entry): entry is NonNullable<(typeof createdEntriesResult)[number]> =>
            Boolean(entry)
        );

        if (createdEntries.length === 0) {
          return;
        }

        for (const [index, entry] of createdEntriesResult.entries()) {
          if (!entry) {
            continue;
          }

          if (entry.item.previewUrl) {
            previewUrlsRef.current.set(entry.item.id, entry.item.previewUrl);
          }

          if (entry.item.storagePath) {
            const sourceFile = files[index];
            if (sourceFile) {
              await saveUploadedAssetFile(entry.item.storagePath, sourceFile);
            }
          }
        }

        const nextItems = createdEntries.map((entry) => entry.item);
        const nextRunFiles = createdEntries.map((entry) => entry.runFile);
        const nextFolderItems = nextItems.flatMap((item) =>
          item.folderIds.map((folderId) => ({
            folderId,
            libraryItemId: item.id,
            createdAt: item.createdAt,
          }))
        );

        setItems((current) => [...nextItems, ...current]);
        setRunFiles((current) => [...nextRunFiles, ...current]);
        setFolderItems((current) => [...nextFolderItems, ...current]);
        setUploadDialogOpen(false);
      } finally {
        setUploadAssetsLoading(false);
      }
    },
    [appMode, applyHostedUpload, profile.id, selectedFolderId, uploadAssetsLoading]
  );

  const saveProviderSettings = useCallback(
    async (nextSettings: StudioProviderSettings): Promise<StudioProviderSaveResult> => {
      const falApiKey = nextSettings.falApiKey.trim();

      if (!falApiKey) {
        setProviderConnectionStatus("invalid");
        return {
          ok: false,
          errorMessage: "Enter your Fal API key.",
        };
      }

      if (falApiKey.length < 16 || /\s/.test(falApiKey)) {
        setProviderConnectionStatus("invalid");
        return {
          ok: false,
          errorMessage: "Enter a valid Fal API key.",
        };
      }

      const validatedAt = new Date().toISOString();
      setProviderSettings({
        falApiKey,
        lastValidatedAt: validatedAt,
      });
      setProviderConnectionStatus("connected");
      setProviderSettingsOpen(false);

      return { ok: true };
    },
    []
  );

  const cancelRun = useCallback(
    (runId: string) => {
      const targetRun = runsRef.current.find((run) => run.id === runId);
      if (!targetRun || (targetRun.status !== "queued" && targetRun.status !== "pending")) {
        return;
      }

      if (appMode === "hosted") {
        void applyHostedMutation({
          action: "cancel_run",
          runId,
        });
        return;
      }

      const queuedTimerId = dispatchTimersRef.current.get(runId);
      if (queuedTimerId) {
        window.clearTimeout(queuedTimerId);
        dispatchTimersRef.current.delete(runId);
      }

      const cancelledAt = new Date().toISOString();
      setRuns((current) =>
        current.map((entry) =>
          entry.id === runId
            ? {
                ...entry,
                status: "cancelled",
                cancelledAt,
                completedAt: cancelledAt,
                updatedAt: cancelledAt,
                providerStatus: "cancelled",
                canCancel: false,
              }
            : entry
        )
      );
    },
    [appMode, applyHostedMutation]
  );

  const purchaseHostedCredits = useCallback(async () => {
    if (appMode !== "hosted" || !activeCreditPack) {
      return;
    }

    setPurchaseCreditsPending(true);
    try {
      await applyHostedMutation({
        action: "purchase_credits",
      });
    } finally {
      setPurchaseCreditsPending(false);
    }
  }, [activeCreditPack, appMode, applyHostedMutation]);

  const setGallerySizeLevel = useCallback((value: number) => {
    const nextValue = Math.min(Math.max(Math.round(value), 0), 6);
    setGallerySizeLevelState(nextValue);
  }, []);

  const setSelectedModelId = useCallback((modelId: string) => {
    setSelectedModelIdState(modelId);
  }, []);

  const generate = useCallback(() => {
    if (!currentDraft.prompt.trim()) {
      return;
    }

    if (appMode === "local" && !hasFalKey) {
      setProviderSettingsOpen(true);
      return;
    }

    if (appMode === "hosted") {
      void applyHostedMutation({
        action: "generate",
        modelId: selectedModel.id,
        folderId: selectedFolderId,
        draft: createDraftSnapshot(currentDraft),
      }).catch((error) => {
        if (
          error instanceof Error &&
          error.message ===
            "limit of 100 concurrent queues/ generations reached, please wait for your generations to finish before continuing."
        ) {
          setQueueLimitDialogOpen(true);
        }
      });
      return;
    }

    const activeJobCount = runsRef.current.filter((run) =>
      run.status === "queued" || run.status === "pending" || run.status === "processing"
    ).length;
    if (activeJobCount >= queueSettings.maxActiveJobsPerUser) {
      setQueueLimitDialogOpen(true);
      return;
    }

    const estimatedCredits = quoteCredits(selectedModel.id, currentDraft);

    const createdAt = new Date().toISOString();
    const runId = createStudioId("run");
    const nextRun: GenerationRun = {
      id: runId,
      userId: profile.id,
      workspaceId: getWorkspaceIdForMode(appMode),
      folderId: selectedFolderId,
      modelId: selectedModel.id,
      modelName: selectedModel.name,
      kind: selectedModel.kind,
      provider: "fal",
      requestMode:
        selectedModel.kind === "image"
          ? "text-to-image"
          : selectedModel.kind === "video"
            ? "text-to-video"
            : "chat",
      status: "queued",
      prompt: currentDraft.prompt,
      createdAt,
      queueEnteredAt: createdAt,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      cancelledAt: null,
      updatedAt: createdAt,
      summary: createGenerationRunSummary(selectedModel, currentDraft),
      outputAssetId: null,
      previewUrl: createGenerationRunPreviewUrl(selectedModel, currentDraft),
      errorMessage: null,
      inputPayload: {
        prompt: currentDraft.prompt,
        negative_prompt: currentDraft.negativePrompt,
        reference_count: currentDraft.references.length,
      },
      inputSettings: {
        aspect_ratio: currentDraft.aspectRatio,
        resolution: currentDraft.resolution,
        output_format: currentDraft.outputFormat,
        duration_seconds: currentDraft.durationSeconds,
        include_audio: currentDraft.includeAudio,
        image_count: currentDraft.imageCount,
        tone: currentDraft.tone,
        max_tokens: currentDraft.maxTokens,
        temperature: currentDraft.temperature,
      },
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
      draftSnapshot: createDraftSnapshot(currentDraft),
    };

    setRuns((current) => [nextRun, ...current]);
  }, [
    appMode,
    applyHostedMutation,
    currentDraft,
    hasFalKey,
    profile.id,
    queueSettings.maxActiveJobsPerUser,
    selectedFolderId,
    selectedModel,
  ]);

  return {
    accountButtonLabel,
    addReferences,
    cancelRun,
    clearSelection,
    closeCreateTextComposer,
    closeFolderEditor,
    closeQueueLimitDialog: () => setQueueLimitDialogOpen(false),
    closeUploadDialog,
    createTextAsset,
    createTextBody,
    createTextDialogOpen,
    createTextErrorMessage,
    createTextSaving,
    createTextTitle,
    currentDraft,
    deleteFolder,
    deleteItem,
    deleteSelectedItems,
    dropLibraryItemsIntoPromptBar,
    folderCounts,
    folderEditorError,
    folderEditorMode,
    folderEditorOpen,
    folderEditorSaving,
    folderEditorValue,
    folders,
    gallerySizeLevel,
    generate,
    getItemsForFolder: (folderId: string) =>
      items.filter((item) => item.folderIds.includes(folderId)),
    getPromptBarDropHint,
    hasFalKey,
    hostedAccount,
    items,
    modelSections: STUDIO_MODEL_SECTIONS,
    models,
    moveItemsToFolder,
    openCreateFolder,
    openCreateTextComposer,
    openRenameFolder,
    openUploadDialog,
    providerConnectionStatus,
    providerSettings,
    providerSettingsOpen,
    purchaseCreditsPending,
    purchaseHostedCredits,
    queueLimitDialogOpen,
    removeReference,
    reuseItem,
    reuseRun,
    saveFolder,
    saveProviderSettings,
    selectedFolder,
    selectedFolderId,
    selectedFolderItems,
    selectedFolderRunCards,
    selectedItemCount,
    selectedItemIdSet,
    selectedModel,
    selectedModelId,
    selectionModeEnabled,
    setGallerySizeLevel,
    setProviderSettingsOpen,
    setSelectedFolderId,
    setSelectedModelId,
    setUploadDialogFolder,
    toggleItemSelection,
    toggleSelectionMode,
    ungroupedItems,
    ungroupedRunCards,
    updateCreateTextBody,
    updateCreateTextTitle,
    updateDraft,
    updateFolderEditorValue,
    updateTextItem,
    uploadAssetsLoading,
    uploadDialogFolderId,
    uploadDialogOpen,
    uploadFiles,
  };
}
