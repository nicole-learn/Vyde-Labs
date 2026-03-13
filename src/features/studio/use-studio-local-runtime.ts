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
  createGenerationRunSummary,
  createStudioId,
  createStudioSeedState,
} from "./studio-local-runtime-data";
import {
  appendLibraryItemsToPrompt,
  createFolderItemCounts,
  createTextLibraryItem,
  createUploadedLibraryItem,
  hasFolderNameConflict,
  isReferenceEligibleLibraryItem,
  mergeDraftReferences,
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

const MAX_REFERENCE_FILES = 6;

interface UseStudioLocalRuntimeOptions {
  appMode?: StudioAppMode;
}

export function useStudioLocalRuntime(options?: UseStudioLocalRuntimeOptions) {
  const appMode = options?.appMode ?? "local";
  const isHostedMode = appMode === "hosted";
  const initialStudioState = useMemo(() => createStudioSeedState(), []);
  const previewUrlsRef = useRef(new Map<string, string>());
  const pendingTimersRef = useRef<number[]>([]);

  const [models] = useState(STUDIO_MODEL_CATALOG);
  const [selectedModelId, setSelectedModelId] = useState(
    STUDIO_MODEL_CATALOG[0].id
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState(initialStudioState.folders);
  const [items, setItems] = useState(initialStudioState.items);
  const [runs, setRuns] = useState(initialStudioState.runs);
  const [draftsByModelId, setDraftsByModelId] = useState(buildStudioDraftMap);
  const [gallerySizeLevel, setGallerySizeLevelState] = useState(
    () => loadStoredGridDensity() ?? 2
  );
  const [providerSettings, setProviderSettings] = useState<StudioProviderSettings>(
    () => loadStoredProviderSettings() ?? { falApiKey: "" }
  );
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
  const [selectionModeEnabled, setSelectionModeEnabled] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [createTextDialogOpen, setCreateTextDialogOpen] = useState(false);
  const [createTextTitle, setCreateTextTitle] = useState("");
  const [createTextBody, setCreateTextBody] = useState("");

  useEffect(() => {
    saveStoredGridDensity(gallerySizeLevel);
  }, [gallerySizeLevel]);

  const setGallerySizeLevel = useCallback((value: number) => {
    const nextValue = Math.min(Math.max(Math.round(value), 0), 6);
    setGallerySizeLevelState(nextValue);
  }, []);

  useEffect(() => {
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

  const pendingRuns = useMemo(
    () => runs.filter((run) => run.status === "running" && !run.outputItemId),
    [runs]
  );

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

  const addDraftReferences = useCallback(
    (nextReferences: DraftReference[]) => {
      const mergedReferences = mergeDraftReferences(
        currentDraft.references,
        nextReferences,
        MAX_REFERENCE_FILES
      );

      updateDraft({
        references: mergedReferences,
      });

      return {
        addedCount: Math.max(
          0,
          mergedReferences.length - currentDraft.references.length
        ),
        maxReached: mergedReferences.length >= MAX_REFERENCE_FILES,
      };
    },
    [currentDraft.references, updateDraft]
  );

  const addReferences = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      const nextReferences: DraftReference[] = files.map((file) => ({
        id: createStudioId("ref"),
        file,
        source: "upload",
        originAssetId: null,
      }));

      addDraftReferences(nextReferences);
    },
    [addDraftReferences]
  );

  const removeReference = useCallback(
    (referenceId: string) => {
      updateDraft({
        references: currentDraft.references.filter(
          (reference) => reference.id !== referenceId
        ),
      });
    },
    [currentDraft.references, updateDraft]
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

              return {
                id: createStudioId("ref"),
                file,
                source: "library-item" as const,
                originAssetId: item.id,
              };
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
                "Those references are already attached or the six-reference limit is full."
              );
            } else if (addedCount < validReferences.length || maxReached) {
              messages.push(
                "Some references were skipped because they were duplicates or the limit is six."
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

  const saveFolder = useCallback(() => {
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
      const nextFolder: StudioFolder = {
        id: createStudioId("folder"),
        name: nextName,
        createdAt: new Date().toISOString(),
      };

      setFolders((current) => [nextFolder, ...current]);
      setSelectedFolderId(nextFolder.id);
      resetFolderEditor();
      return;
    }

    if (!folderEditorTargetId) return;

    setFolders((current) =>
      current.map((folder) =>
        folder.id === folderEditorTargetId
          ? { ...folder, name: nextName }
          : folder
      )
    );
    resetFolderEditor();
  }, [
    folderEditorMode,
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
      setFolders((current) => current.filter((folder) => folder.id !== folderId));
      setItems((current) =>
        current.map((item) =>
          item.folderId === folderId ? { ...item, folderId: null } : item
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
      setDraftsByModelId((current) => ({
        ...current,
        [nextModel.id]: {
          ...(current[nextModel.id] ?? createDraft(nextModel)),
          ...run.draftSnapshot,
          references: [],
        },
      }));
    },
    [runs]
  );

  const reuseItem = useCallback(
    (itemId: string) => {
      const item = items.find((entry) => entry.id === itemId);
      if (!item?.modelId) return;

      const matchingRun = runs.find((run) => run.outputItemId === item.id);
      if (matchingRun) {
        reuseRun(matchingRun.id);
        return;
      }

      const nextModel = getStudioModelById(item.modelId);
      setSelectedModelId(nextModel.id);
      setDraftsByModelId((current) => ({
        ...current,
        [nextModel.id]: {
          ...(current[nextModel.id] ?? createDraft(nextModel)),
          prompt: item.prompt,
          references: [],
        },
      }));
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
        run.outputItemId && itemIdSet.has(run.outputItemId)
          ? { ...run, outputItemId: null }
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
          };
        })
      );
    },
    []
  );

  const uploadFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      const nextItems = files
        .map((file) => createUploadedLibraryItem(file, selectedFolderId))
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
    },
    [selectedFolderId]
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
    setCreateTextDialogOpen(true);
  }, []);

  const closeCreateTextComposer = useCallback(() => {
    setCreateTextDialogOpen(false);
    setCreateTextTitle("");
    setCreateTextBody("");
  }, []);

  const createTextAsset = useCallback(() => {
    if (!createTextBody.trim()) {
      return;
    }

    const nextItem = createTextLibraryItem({
      title: createTextTitle,
      body: createTextBody,
      folderId: selectedFolderId,
    });

    setItems((current) => [nextItem, ...current]);
    closeCreateTextComposer();
  }, [closeCreateTextComposer, createTextBody, createTextTitle, selectedFolderId]);

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
    const run: GenerationRun = {
      id: runId,
      modelId: selectedModel.id,
      modelName: selectedModel.name,
      kind: selectedModel.kind,
      status: "running",
      prompt: currentDraft.prompt,
      createdAt,
      summary: createGenerationRunSummary(selectedModel, currentDraft),
      outputItemId: null,
      draftSnapshot: createDraftSnapshot(currentDraft),
    };

    setRuns((current) => [run, ...current]);

    const timeoutId = window.setTimeout(() => {
      const nextItem = createGeneratedLibraryItem({
        model: selectedModel,
        draft: currentDraft,
        createdAt,
        folderId: selectedFolderId,
      });

      pendingTimersRef.current = removePendingTimerId(
        pendingTimersRef.current,
        timeoutId
      );

      setItems((current) => [nextItem, ...current]);
      setRuns((current) =>
        current.map((entry) =>
          entry.id === runId
            ? { ...entry, status: "completed", outputItemId: nextItem.id }
            : entry
        )
      );
    }, 900);

    pendingTimersRef.current = [...pendingTimersRef.current, timeoutId];
  }, [currentDraft, hasFalKey, isHostedMode, selectedFolderId, selectedModel]);

  return {
    addReferences,
    clearSelection,
    createTextAsset,
    createTextBody,
    createTextDialogOpen,
    createTextTitle,
    currentDraft,
    deleteFolder,
    deleteItem,
    deleteSelectedItems,
    folderCounts,
    folderEditorError,
    folderEditorMode,
    folderEditorOpen,
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
    openCreateFolder,
    openCreateTextComposer,
    openRenameFolder,
    pendingRuns,
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
    selectedItemCount,
    selectedItemIdSet,
    selectedModel,
    selectedModelId,
    selectionModeEnabled,
    setCreateTextBody,
    setCreateTextDialogOpen,
    setCreateTextTitle,
    setFolderEditorOpen,
    setFolderEditorValue,
    setGallerySizeLevel,
    setSelectedFolderId,
    setSelectedModelId,
    setProviderSettingsOpen,
    toggleItemSelection,
    toggleSelectionMode,
    ungroupedItems,
    updateTextItem,
    updateDraft,
    uploadFiles,
  };
}
