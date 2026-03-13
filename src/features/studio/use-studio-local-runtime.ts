"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadStoredGridDensity,
  loadStoredProviderSettings,
  saveStoredGridDensity,
  saveStoredProviderSettings,
} from "./studio-browser-storage";
import {
  buildStudioDraftMap,
  createDraft,
  createDraftSnapshot,
  createGeneratedLibraryItem,
  createGenerationRunPreviewUrl,
  createGenerationRunSummary,
  createStudioId,
  createStudioSeedState,
  LOCAL_STUDIO_WORKSPACE_ID,
} from "./studio-local-runtime-data";
import {
  appendLibraryItemsToPrompt,
  createDraftReferenceFromFile,
  createDraftReferenceFromLibraryItem,
  createFolderItemCounts,
  createTextLibraryItem,
  createUploadedLibraryItem,
  hasFolderNameConflict,
  isInFlightStudioRunStatus,
  isReferenceEligibleLibraryItem,
  mergeDraftReferences,
  releaseDraftReferencePreview,
  releaseRemovedDraftReferencePreviews,
  releaseUploadedPreview,
  resolveLibraryItemToReferenceFile,
  removePendingTimerId,
  revokePreviewUrl,
} from "./studio-local-runtime-helpers";
import {
  STUDIO_MODEL_CATALOG,
  STUDIO_MODEL_SECTIONS,
  getStudioModelById,
} from "./studio-model-catalog";
import type { StudioAppMode } from "./studio-app-mode";
import type {
  DraftReference,
  GenerationRun,
  LibraryItem,
  StudioDraft,
  StudioFolder,
  StudioProviderSettings,
} from "./types";

interface UseStudioLocalRuntimeOptions {
  appMode?: StudioAppMode;
}

export function useStudioLocalRuntime(options?: UseStudioLocalRuntimeOptions) {
  const appMode = options?.appMode ?? "local";
  const isHostedMode = appMode === "hosted";
  const initialStudioState = useMemo(() => createStudioSeedState(), []);
  const previewUrlsRef = useRef(new Map<string, string>());
  const pendingTimersRef = useRef<number[]>([]);
  const draftsByModelIdRef = useRef(buildStudioDraftMap());
  const storageHydratedRef = useRef(false);

  const [models] = useState(STUDIO_MODEL_CATALOG);
  const [selectedModelId, setSelectedModelId] = useState(
    STUDIO_MODEL_CATALOG[0].id
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState(initialStudioState.folders);
  const [items, setItems] = useState(initialStudioState.items);
  const [runs, setRuns] = useState(initialStudioState.runs);
  const [draftsByModelId, setDraftsByModelId] = useState(buildStudioDraftMap);
  const [gallerySizeLevel, setGallerySizeLevelState] = useState(2);
  const [providerSettings, setProviderSettings] = useState<StudioProviderSettings>({
    falApiKey: "",
  });
  const [providerSettingsOpen, setProviderSettingsOpen] = useState(false);
  const [folderEditorOpen, setFolderEditorOpen] = useState(false);
  const [folderEditorMode, setFolderEditorMode] = useState<"create" | "rename">(
    "create"
  );
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
  const [createTextErrorMessage, setCreateTextErrorMessage] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadDialogFolderId, setUploadDialogFolderId] = useState<string | null>(null);
  const [uploadAssetsLoading, setUploadAssetsLoading] = useState(false);

  useEffect(() => {
    draftsByModelIdRef.current = draftsByModelId;
  }, [draftsByModelId]);

  useEffect(() => {
    const storedGridDensity = loadStoredGridDensity();
    const storedProviderSettings = loadStoredProviderSettings();

    if (storedGridDensity !== null) {
      setGallerySizeLevelState(storedGridDensity);
    }

    if (storedProviderSettings) {
      setProviderSettings(storedProviderSettings);
    }

    storageHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!storageHydratedRef.current) {
      return;
    }

    saveStoredGridDensity(gallerySizeLevel);
  }, [gallerySizeLevel]);

  const setGallerySizeLevel = useCallback((value: number) => {
    const nextValue = Math.min(Math.max(Math.round(value), 0), 6);
    setGallerySizeLevelState(nextValue);
  }, []);

  useEffect(() => {
    if (!storageHydratedRef.current) {
      return;
    }

    saveStoredProviderSettings(providerSettings);
  }, [providerSettings]);

  useEffect(() => {
    const previewUrls = previewUrlsRef.current;
    const pendingTimers = pendingTimersRef.current;

    return () => {
      for (const previewUrl of previewUrls.values()) {
        revokePreviewUrl(previewUrl);
      }

      for (const timerId of pendingTimers) {
        window.clearTimeout(timerId);
      }

      for (const draft of Object.values(draftsByModelIdRef.current)) {
        for (const reference of draft.references) {
          releaseDraftReferencePreview(reference);
        }
      }
    };
  }, []);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? models[0],
    [models, selectedModelId]
  );

  const currentDraft =
    draftsByModelId[selectedModel.id] ?? createDraft(selectedModel);

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );

  const ungroupedItems = useMemo(
    () => items.filter((item) => item.folderId === null),
    [items]
  );

  const selectedFolderItems = useMemo(() => {
    if (!selectedFolderId) {
      return [];
    }

    return items.filter((item) => item.folderId === selectedFolderId);
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
    () => createFolderItemCounts(folders, items),
    [folders, items]
  );

  const selectedItemIdSet = useMemo(
    () => new Set(selectedItemIds),
    [selectedItemIds]
  );

  const selectedItemCount = selectedItemIds.length;
  const hasFalKey = providerSettings.falApiKey.trim().length > 0;
  const maxReferenceFiles = selectedModel.maxReferenceFiles ?? 6;

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

  const updateDraft = useCallback(
    (patch: Partial<StudioDraft>) => {
      setDraftsByModelId((current) => ({
        ...current,
        [selectedModel.id]: {
          ...(current[selectedModel.id] ?? createDraft(selectedModel)),
          ...patch,
        },
      }));
    },
    [selectedModel]
  );

  const replaceDraftReferences = useCallback(
    (
      nextReferencesOrUpdater:
        | DraftReference[]
        | ((currentReferences: DraftReference[]) => DraftReference[])
    ) => {
      setDraftsByModelId((current) => {
        const existingDraft = current[selectedModel.id] ?? createDraft(selectedModel);
        const nextReferences =
          typeof nextReferencesOrUpdater === "function"
            ? nextReferencesOrUpdater(existingDraft.references)
            : nextReferencesOrUpdater;

        releaseRemovedDraftReferencePreviews(
          existingDraft.references,
          nextReferences
        );

        return {
          ...current,
          [selectedModel.id]: {
            ...existingDraft,
            references: nextReferences,
          },
        };
      });
    },
    [selectedModel]
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
        addedCount: Math.max(
          0,
          mergedReferences.length - currentDraft.references.length
        ),
        maxReached: mergedReferences.length >= maxReferenceFiles,
      };
    },
    [currentDraft.references, maxReferenceFiles, replaceDraftReferences]
  );

  const addReferences = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      const nextReferences = files.map(createDraftReferenceFromFile);

      addDraftReferences(nextReferences);
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
            (
              reference
            ): reference is NonNullable<
              (typeof resolvedReferenceEntries)[number]
            > => Boolean(reference)
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

      if (folderEditorMode === "create") {
        const createdAt = new Date().toISOString();
        const nextFolder: StudioFolder = {
          id: createStudioId("folder"),
          workspaceId: LOCAL_STUDIO_WORKSPACE_ID,
          name: nextName,
          createdAt,
          updatedAt: createdAt,
          sortOrder: 0,
        };

        setFolders((current) => [
          {
            ...nextFolder,
            sortOrder: 0,
          },
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
    folderEditorMode,
    folderEditorSaving,
    folderEditorTargetId,
    folderEditorValue,
    folders,
    resetFolderEditor,
  ]);

  const moveItemsToFolder = useCallback(
    (itemIds: string[], folderId: string | null) => {
      if (itemIds.length === 0) return;

      const itemIdSet = new Set(itemIds);
      setItems((current) =>
        current.map((item) =>
          itemIdSet.has(item.id) ? { ...item, folderId } : item
        )
      );
    },
    []
  );

  const deleteFolder = useCallback(
    (folderId: string) => {
      setFolders((current) =>
        current
          .filter((folder) => folder.id !== folderId)
          .map((folder, index) => ({
            ...folder,
            sortOrder: index,
          }))
      );
      setItems((current) =>
        current.map((item) =>
          item.folderId === folderId ? { ...item, folderId: null } : item
        )
      );
      setRuns((current) =>
        current.map((run) =>
          run.folderId === folderId ? { ...run, folderId: null } : run
        )
      );
      setSelectedFolderId((current) => (current === folderId ? null : current));
    },
    []
  );

  const reuseRun = useCallback(
    (runId: string) => {
      const run = runs.find((entry) => entry.id === runId);
      if (!run) return;

      const nextModel = getStudioModelById(run.modelId);
      setSelectedModelId(nextModel.id);
      setDraftsByModelId((current) => {
        const currentDraft = current[nextModel.id] ?? createDraft(nextModel);
        releaseRemovedDraftReferencePreviews(currentDraft.references, []);

        return {
          ...current,
          [nextModel.id]: {
            ...currentDraft,
            ...run.draftSnapshot,
            references: [],
          },
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
      setSelectedModelId(nextModel.id);
      setDraftsByModelId((current) => {
        const currentDraft = current[nextModel.id] ?? createDraft(nextModel);
        releaseRemovedDraftReferencePreviews(currentDraft.references, []);

        return {
          ...current,
          [nextModel.id]: {
            ...currentDraft,
            prompt: item.prompt,
            references: [],
          },
        };
      });
    },
    [items, reuseRun, runs]
  );

  const deleteItems = useCallback((itemIds: string[]) => {
    if (itemIds.length === 0) return;

    const itemIdSet = new Set(itemIds);
    setItems((current) => {
      for (const item of current) {
        if (itemIdSet.has(item.id)) {
          releaseUploadedPreview(item, previewUrlsRef.current);
        }
      }

      return current.filter((item) => !itemIdSet.has(item.id));
    });
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
  }, []);

  const deleteItem = useCallback(
    (itemId: string) => {
      deleteItems([itemId]);
    },
    [deleteItems]
  );

  const deleteSelectedItems = useCallback(() => {
    deleteItems(selectedItemIds);
  }, [deleteItems, selectedItemIds]);

  const updateTextItem = useCallback(
    (itemId: string, patch: { title?: string; contentText?: string }) => {
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
    []
  );

  const uploadFiles = useCallback(
    async (files: File[], folderIdOverride?: string | null) => {
      if (files.length === 0) return;

      if (uploadAssetsLoading) {
        return;
      }

      setUploadAssetsLoading(true);
      try {
        const nextItems = (
          await Promise.all(
            files.map((file) =>
              createUploadedLibraryItem(file, folderIdOverride ?? selectedFolderId)
            )
          )
        )
          .filter((item): item is LibraryItem => Boolean(item));

        if (nextItems.length === 0) {
          return;
        }

        for (const item of nextItems) {
          if (item.previewUrl) {
            previewUrlsRef.current.set(item.id, item.previewUrl);
          }
        }

        setItems((current) => [...nextItems, ...current]);
        setUploadDialogOpen(false);
      } finally {
        setUploadAssetsLoading(false);
      }
    },
    [selectedFolderId, uploadAssetsLoading]
  );

  const saveProviderSettings = useCallback(
    (nextSettings: StudioProviderSettings) => {
      setProviderSettings({
        falApiKey: nextSettings.falApiKey.trim(),
      });
      setProviderSettingsOpen(false);
    },
    []
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

  const toggleUploadDialogFolder = useCallback((folderId: string) => {
    setUploadDialogFolderId((current) => (current === folderId ? null : folderId));
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
      const nextItem = createTextLibraryItem({
        title: createTextTitle,
        body: createTextBody,
        folderId: selectedFolderId,
      });

      setItems((current) => [nextItem, ...current]);
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
  }, [createTextBody, createTextSaving, createTextTitle, selectedFolderId]);

  const generate = useCallback(() => {
    if (!currentDraft.prompt.trim()) {
      return;
    }

    if (!isHostedMode && !hasFalKey) {
      setProviderSettingsOpen(true);
      return;
    }

    const createdAt = new Date().toISOString();
    const runId = createStudioId("run");
    const shouldFailGeneration = /\b(fail|error)\b/i.test(currentDraft.prompt);
    const run: GenerationRun = {
      id: runId,
      workspaceId: LOCAL_STUDIO_WORKSPACE_ID,
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
      startedAt: null,
      completedAt: null,
      summary: createGenerationRunSummary(selectedModel, currentDraft),
      outputAssetId: null,
      previewUrl: createGenerationRunPreviewUrl(selectedModel, currentDraft),
      progressPercent: 6,
      errorMessage: null,
      draftSnapshot: createDraftSnapshot(currentDraft),
    };

    setRuns((current) => [run, ...current]);

    const processingTimerId = window.setTimeout(() => {
      pendingTimersRef.current = removePendingTimerId(
        pendingTimersRef.current,
        processingTimerId
      );

      setRuns((current) =>
        current.map((entry) =>
          entry.id === runId
            ? {
                ...entry,
                status: "processing",
                startedAt: new Date().toISOString(),
                progressPercent: 54,
              }
            : entry
        )
      );
    }, 350);

    const completionTimerId = window.setTimeout(() => {
      pendingTimersRef.current = removePendingTimerId(
        pendingTimersRef.current,
        completionTimerId
      );

      if (shouldFailGeneration) {
        setRuns((current) =>
          current.map((entry) =>
            entry.id === runId
              ? {
                  ...entry,
                  status: "failed",
                  completedAt: new Date().toISOString(),
                  progressPercent: null,
                  errorMessage: "Mock Fal generation failed before an output asset was returned.",
                }
              : entry
          )
        );
        return;
      }

      const nextItem = createGeneratedLibraryItem({
        model: selectedModel,
        draft: currentDraft,
        createdAt,
        folderId: selectedFolderId,
        runId,
      });

      setItems((current) => [nextItem, ...current]);
      setRuns((current) =>
        current.map((entry) =>
          entry.id === runId
            ? {
                ...entry,
                status: "completed",
                completedAt: new Date().toISOString(),
                outputAssetId: nextItem.id,
                progressPercent: 100,
              }
            : entry
        )
      );
    }, 1200);

    pendingTimersRef.current = [
      ...pendingTimersRef.current,
      processingTimerId,
      completionTimerId,
    ];
  }, [currentDraft, hasFalKey, isHostedMode, selectedFolderId, selectedModel]);

  return {
    addReferences,
    clearSelection,
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
    folderCounts,
    folderEditorError,
    folderEditorMode,
    folderEditorOpen,
    folderEditorSaving,
    folderEditorValue,
    folders,
    gallerySizeLevel,
    generate,
    getPromptBarDropHint,
    hasFalKey,
    items,
    modelSections: STUDIO_MODEL_SECTIONS,
    models,
    moveItemsToFolder,
    openUploadDialog,
    openCreateFolder,
    openCreateTextComposer,
    openRenameFolder,
    dropLibraryItemsIntoPromptBar,
    removeReference,
    reuseItem,
    reuseRun,
    saveFolder,
    providerSettings,
    providerSettingsOpen,
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
    closeFolderEditor,
    closeCreateTextComposer,
    closeUploadDialog,
    toggleUploadDialogFolder,
    uploadAssetsLoading,
    uploadDialogFolderId,
    uploadDialogOpen,
    updateCreateTextBody,
    updateCreateTextTitle,
    updateFolderEditorValue,
    setGallerySizeLevel,
    setSelectedFolderId,
    setSelectedModelId,
    setProviderSettingsOpen,
    toggleItemSelection,
    toggleSelectionMode,
    ungroupedItems,
    ungroupedRunCards,
    updateTextItem,
    updateDraft,
    uploadFiles,
  };
}
