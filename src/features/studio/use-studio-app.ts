"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MODEL_SECTIONS, STUDIO_MODELS, getModelById } from "./catalog";
import {
  loadStoredGridDensity,
  loadStoredSettings,
  saveStoredGridDensity,
  saveStoredSettings,
} from "./local-storage";
import {
  buildDraftMap,
  createDraft,
  createDraftSnapshot,
  createGeneratedItem,
  createId,
  createRunSummary,
  createSeedState,
} from "./mock-data";
import type {
  DraftReference,
  GenerationRun,
  LibraryItem,
  LocalProviderSettings,
  StudioDraft,
  StudioFolder,
} from "./types";

function revokePreview(url: string | null | undefined) {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

function releaseUploadedPreview(
  item: LibraryItem | undefined,
  previewUrls: Map<string, string>
) {
  if (!item || item.source !== "uploaded" || !item.previewUrl) {
    return;
  }

  revokePreview(previewUrls.get(item.id) ?? item.previewUrl);
  previewUrls.delete(item.id);
}

function createFolderCounts(folders: StudioFolder[], items: LibraryItem[]) {
  return Object.fromEntries(
    folders.map((folder) => [
      folder.id,
      items.filter((item) => item.folderId === folder.id).length,
    ])
  ) as Record<string, number>;
}

function removeTimer(timerIds: number[], timerId: number) {
  return timerIds.filter((entry) => entry !== timerId);
}

function createTextItem(params: {
  title: string;
  body: string;
  folderId: string | null;
}): LibraryItem {
  const trimmedBody = params.body.trim();
  const fallbackTitle = trimmedBody.slice(0, 36) || "Text note";

  return {
    id: createId("asset"),
    title: params.title.trim() || fallbackTitle,
    kind: "text",
    source: "uploaded",
    previewUrl: null,
    contentText: trimmedBody,
    createdAt: new Date().toISOString(),
    modelId: null,
    prompt: trimmedBody,
    meta: "Text note",
    aspectRatio: 0.82,
    folderId: params.folderId,
  };
}

function createUploadedItem(file: File, folderId: string | null): LibraryItem {
  const fileType = file.type.toLowerCase();
  const kind =
    fileType.startsWith("image/")
      ? "image"
      : fileType.startsWith("video/")
        ? "video"
        : "file";
  const previewUrl =
    kind === "image" || kind === "video" ? URL.createObjectURL(file) : null;
  const aspectRatio =
    kind === "video" ? 16 / 9 : kind === "image" ? 4 / 5 : 0.82;

  return {
    id: createId("asset"),
    title: file.name,
    kind,
    source: "uploaded",
    previewUrl,
    contentText: null,
    createdAt: new Date().toISOString(),
    modelId: null,
    prompt: "",
    meta: `${file.type || "File"} • ${(file.size / 1024 / 1024).toFixed(1)} MB`,
    aspectRatio,
    folderId,
  };
}

function hasFolderNameConflict(
  folders: StudioFolder[],
  nextName: string,
  targetFolderId: string | null
) {
  const normalizedName = nextName.trim().toLowerCase();
  return folders.some(
    (folder) =>
      folder.id !== targetFolderId &&
      folder.name.trim().toLowerCase() === normalizedName
  );
}

export function useStudioApp() {
  const seedState = useMemo(() => createSeedState(), []);
  const previewUrlsRef = useRef(new Map<string, string>());
  const pendingTimersRef = useRef<number[]>([]);

  const [models] = useState(STUDIO_MODELS);
  const [selectedModelId, setSelectedModelId] = useState(STUDIO_MODELS[0].id);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState(seedState.folders);
  const [items, setItems] = useState(seedState.items);
  const [runs, setRuns] = useState(seedState.runs);
  const [draftsByModelId, setDraftsByModelId] = useState(buildDraftMap);
  const [gallerySizeLevel, setGallerySizeLevel] = useState(
    () => loadStoredGridDensity() ?? 2
  );
  const [settings, setSettings] = useState<LocalProviderSettings>(
    () => loadStoredSettings() ?? { falApiKey: "" }
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  useEffect(() => {
    saveStoredSettings(settings);
  }, [settings]);

  useEffect(() => {
    const previewUrls = previewUrlsRef.current;
    const pendingTimers = pendingTimersRef.current;

    return () => {
      for (const previewUrl of previewUrls.values()) {
        revokePreview(previewUrl);
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
    () => createFolderCounts(folders, items),
    [folders, items]
  );

  const selectedItemIdSet = useMemo(
    () => new Set(selectedItemIds),
    [selectedItemIds]
  );

  const selectedItemCount = selectedItemIds.length;
  const hasFalKey = settings.falApiKey.trim().length > 0;

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

  const addReferences = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      const nextReferences: DraftReference[] = files.map((file) => ({
        id: createId("ref"),
        file,
      }));

      updateDraft({
        references: [...currentDraft.references, ...nextReferences].slice(0, 6),
      });
    },
    [currentDraft.references, updateDraft]
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
        id: createId("folder"),
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
      moveItemsToFolder(
        items.filter((item) => item.folderId === folderId).map((item) => item.id),
        null
      );
      setSelectedFolderId((current) => (current === folderId ? null : current));
    },
    [items, moveItemsToFolder]
  );

  const reuseRun = useCallback(
    (runId: string) => {
      const run = runs.find((entry) => entry.id === runId);
      if (!run) return;

      const nextModel = getModelById(run.modelId);
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

      const nextModel = getModelById(item.modelId);
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

  const uploadFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      const nextItems = files.map((file) => createUploadedItem(file, selectedFolderId));

      for (const item of nextItems) {
        if (item.previewUrl) {
          previewUrlsRef.current.set(item.id, item.previewUrl);
        }
      }

      setItems((current) => [...nextItems, ...current]);
    },
    [selectedFolderId]
  );

  const saveSettings = useCallback((nextSettings: LocalProviderSettings) => {
    setSettings(nextSettings);
    setSettingsOpen(false);
  }, []);

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

    const nextItem = createTextItem({
      title: createTextTitle,
      body: createTextBody,
      folderId: selectedFolderId,
    });

    setItems((current) => [nextItem, ...current]);
    closeCreateTextComposer();
  }, [closeCreateTextComposer, createTextBody, createTextTitle, selectedFolderId]);

  const generate = useCallback(() => {
    if (!currentDraft.prompt.trim() || !hasFalKey) {
      return;
    }

    const createdAt = new Date().toISOString();
    const runId = createId("run");
    const run: GenerationRun = {
      id: runId,
      modelId: selectedModel.id,
      modelName: selectedModel.name,
      kind: selectedModel.kind,
      status: "running",
      prompt: currentDraft.prompt,
      createdAt,
      summary: createRunSummary(selectedModel, currentDraft),
      outputItemId: null,
      draftSnapshot: createDraftSnapshot(currentDraft),
    };

    setRuns((current) => [run, ...current]);

    const timeoutId = window.setTimeout(() => {
      const nextItem = createGeneratedItem({
        model: selectedModel,
        draft: currentDraft,
        createdAt,
        folderId: selectedFolderId,
      });

      pendingTimersRef.current = removeTimer(pendingTimersRef.current, timeoutId);

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
  }, [currentDraft, hasFalKey, selectedFolderId, selectedModel]);

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
    hasFalKey,
    items,
    modelSections: MODEL_SECTIONS,
    models,
    moveItemsToFolder,
    openCreateFolder,
    openCreateTextComposer,
    openRenameFolder,
    pendingRuns,
    removeReference,
    reuseItem,
    reuseRun,
    saveFolder,
    saveSettings,
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
    setSettingsOpen,
    settings,
    settingsOpen,
    toggleItemSelection,
    toggleSelectionMode,
    ungroupedItems,
    updateDraft,
    uploadFiles,
  };
}
