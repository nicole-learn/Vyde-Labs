"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AssetDetailDialog } from "./asset-detail-dialog";
import { CreateTextDialog } from "./create-text-dialog";
import { FloatingControlBar } from "./floating-control-bar";
import { FolderDialog } from "./folder-dialog";
import { FolderSidebar } from "./folder-sidebar";
import { HostedAccountDialog } from "./hosted-account-dialog";
import { ProviderSettingsDialog } from "./provider-settings-dialog";
import { StudioDevModeOverlay } from "./studio-dev-mode-overlay";
import { StudioDragPreviewOverlay } from "./studio-drag-preview-overlay";
import { StudioGallery } from "./studio-gallery";
import { StudioMobileRail } from "./studio-mobile-rail";
import { StudioTopBar } from "./studio-top-bar";
import { StudioWorkspaceShell } from "./studio-workspace-shell";
import { useStudioAppMode } from "../studio-app-mode";
import { isStudioItemDrag } from "../studio-drag-data";
import { STUDIO_MEDIA_UPLOAD_ACCEPT } from "../studio-local-runtime-helpers";
import { useStudioRuntime } from "../use-studio-runtime";
import type { LibraryItem } from "../types";

const XL_BREAKPOINT_QUERY = "(min-width: 1280px)";

interface StudioPageProps {
  hideDevModeToggle?: boolean;
}

function getDownloadFileName(item: LibraryItem) {
  const safeBaseName = item.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "asset";

  if (item.kind === "text") {
    return `${safeBaseName}.txt`;
  }

  if (item.kind === "video") {
    return `${safeBaseName}.mp4`;
  }

  if (item.kind === "image") {
    return `${safeBaseName}.png`;
  }

  return safeBaseName;
}

export function StudioPage({
  hideDevModeToggle = false,
}: StudioPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emptyDragImageRef = useRef<HTMLDivElement | null>(null);
  const { appMode, canSwitchModes, setAppMode } = useStudioAppMode();
  const studio = useStudioRuntime(appMode);
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(XL_BREAKPOINT_QUERY).matches;
  });
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [hostedAccountOpen, setHostedAccountOpen] = useState(false);
  const [dragPreview, setDragPreview] = useState<{
    count: number;
    itemIds: string[];
    leadItem: Pick<
      LibraryItem,
      "id" | "kind" | "title" | "previewUrl" | "contentText" | "prompt"
    >;
    x: number;
    y: number;
  } | null>(null);
  const hasDragPreview = dragPreview !== null;

  useEffect(() => {
    const mediaQuery = window.matchMedia(XL_BREAKPOINT_QUERY);
    const syncViewport = () => {
      setIsDesktopViewport(mediaQuery.matches);
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!hasDragPreview) {
      return;
    }

    const handleDrag = (event: DragEvent) => {
      if (event.clientX === 0 && event.clientY === 0) {
        return;
      }

      setDragPreview((current) =>
        current
          ? {
              ...current,
              x: event.clientX,
              y: event.clientY,
            }
          : current
      );
    };

    const clearDragPreview = () => {
      setDragPreview(null);
    };

    document.addEventListener("drag", handleDrag);
    document.addEventListener("drop", clearDragPreview);
    document.addEventListener("dragend", clearDragPreview);

    return () => {
      document.removeEventListener("drag", handleDrag);
      document.removeEventListener("drop", clearDragPreview);
      document.removeEventListener("dragend", clearDragPreview);
    };
  }, [hasDragPreview]);

  useEffect(() => {
    const handleUnhandledInternalDrop = (event: DragEvent) => {
      if (!event.dataTransfer || !isStudioItemDrag(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener("drop", handleUnhandledInternalDrop);
    return () => window.removeEventListener("drop", handleUnhandledInternalDrop);
  }, []);

  const activeItem = useMemo(
    () => studio.items.find((item) => item.id === activeItemId) ?? null,
    [activeItemId, studio.items]
  );
  const draggingItemIdSet = useMemo(
    () => new Set(dragPreview?.itemIds ?? []),
    [dragPreview]
  );

  const handleAppModeChange = (nextMode: "local" | "hosted") => {
    setHostedAccountOpen(false);
    setAppMode(nextMode);
  };
  const showDevModeToggle = canSwitchModes && !hideDevModeToggle;

  const openAccountSurface = () => {
    if (appMode === "hosted") {
      setHostedAccountOpen(true);
      return;
    }

    studio.setProviderSettingsOpen(true);
  };

  const downloadItem = (item: LibraryItem) => {
    if (typeof window === "undefined") return;

    if (item.kind === "text") {
      const blob = new Blob([item.contentText || item.prompt || item.title], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getDownloadFileName(item);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      return;
    }

    if (!item.previewUrl) return;

    const link = document.createElement("a");
    link.href = item.previewUrl;
    link.download = getDownloadFileName(item);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleItemDragStart = (params: {
    itemIds: string[];
    leadItem: LibraryItem;
    x: number;
    y: number;
  }) => {
    setDragPreview({
      count: params.itemIds.length,
      itemIds: params.itemIds,
      leadItem: {
        id: params.leadItem.id,
        kind: params.leadItem.kind,
        title: params.leadItem.title,
        previewUrl: params.leadItem.previewUrl,
        contentText: params.leadItem.contentText,
        prompt: params.leadItem.prompt,
      },
      x: params.x,
      y: params.y,
    });
  };

  const primaryGallery = (
    <StudioGallery
      allowDropMove={Boolean(studio.selectedFolderId)}
      dragImageRef={emptyDragImageRef}
      draggingItemIdSet={draggingItemIdSet}
      emptyStateActionLabel="Upload Assets"
      emptyStateLabel="Generate or Upload an asset to get started"
      items={studio.ungroupedItems}
      pendingRuns={studio.pendingRuns}
      selectedItemIdSet={studio.selectedItemIdSet}
      selectionModeEnabled={studio.selectionModeEnabled}
      sizeLevel={studio.gallerySizeLevel}
      onDeleteItem={(itemId) => {
        if (activeItemId === itemId) {
          setActiveItemId(null);
        }
        studio.deleteItem(itemId);
      }}
      onEmptyStateAction={() => fileInputRef.current?.click()}
      onItemDragEnd={() => setDragPreview(null)}
      onItemDragStart={handleItemDragStart}
      onMoveDraggedItems={(itemIds) => studio.moveItemsToFolder(itemIds, null)}
      onOpenItem={setActiveItemId}
      onReuseItem={studio.reuseItem}
      onToggleItemSelection={studio.toggleItemSelection}
    />
  );

  const secondaryGallery = studio.selectedFolder ? (
    <StudioGallery
      allowDropMove
      dragImageRef={emptyDragImageRef}
      draggingItemIdSet={draggingItemIdSet}
      emptyStateActionLabel="Upload Assets"
      emptyStateLabel="Drag or Upload an asset into this folder to see it here"
      items={studio.selectedFolderItems}
      selectedItemIdSet={studio.selectedItemIdSet}
      selectionModeEnabled={studio.selectionModeEnabled}
      sizeLevel={studio.gallerySizeLevel}
      onDeleteItem={(itemId) => {
        if (activeItemId === itemId) {
          setActiveItemId(null);
        }
        studio.deleteItem(itemId);
      }}
      onEmptyStateAction={() => fileInputRef.current?.click()}
      onItemDragEnd={() => setDragPreview(null)}
      onItemDragStart={handleItemDragStart}
      onMoveDraggedItems={(itemIds) =>
        studio.moveItemsToFolder(itemIds, studio.selectedFolderId)
      }
      onOpenItem={setActiveItemId}
      onReuseItem={studio.reuseItem}
      onToggleItemSelection={studio.toggleItemSelection}
    />
  ) : null;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={STUDIO_MEDIA_UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          studio.uploadFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <div
        ref={emptyDragImageRef}
        aria-hidden
        className="pointer-events-none fixed left-[-1000px] top-[-1000px] size-2 bg-transparent"
      />

      <StudioWorkspaceShell
        floatingOverlay={
          <FloatingControlBar
            draft={studio.currentDraft}
            getDropHint={studio.getPromptBarDropHint}
            model={studio.selectedModel}
            models={studio.models}
            sections={studio.modelSections}
            selectedModelId={studio.selectedModelId}
            onAddReferences={studio.addReferences}
            onDropLibraryItems={studio.dropLibraryItemsIntoPromptBar}
            onGenerate={studio.generate}
            onRemoveReference={studio.removeReference}
            onSelectModel={studio.setSelectedModelId}
            onUpdateDraft={studio.updateDraft}
          />
        }
        isDesktopViewport={isDesktopViewport}
        mobileRail={
          <StudioMobileRail
            appMode={appMode}
            folderCounts={studio.folderCounts}
            folders={studio.folders}
            hasFalKey={studio.hasFalKey}
            selectedFolderId={studio.selectedFolderId}
            selectionModeEnabled={studio.selectionModeEnabled}
            sizeLevel={studio.gallerySizeLevel}
            onCreateFolder={studio.openCreateFolder}
            onOpenCreateText={studio.openCreateTextComposer}
            onOpenAccount={openAccountSurface}
            onOpenUpload={() => fileInputRef.current?.click()}
            onSelectFolder={studio.setSelectedFolderId}
            onSizeLevelChange={studio.setGallerySizeLevel}
            onToggleSelectionMode={studio.toggleSelectionMode}
          />
        }
        onCloseSecondary={() => studio.setSelectedFolderId(null)}
        primaryPanel={primaryGallery}
        secondaryPanel={secondaryGallery}
        rightSidebar={
          <FolderSidebar
            folders={studio.folders}
            selectedFolderCount={studio.selectedFolderItems.length}
            selectedFolderId={studio.selectedFolderId}
            onCreateFolder={studio.openCreateFolder}
            onDeleteFolder={studio.deleteFolder}
            onDropItemsToFolder={studio.moveItemsToFolder}
            onRenameFolder={studio.openRenameFolder}
            onSelectFolder={studio.setSelectedFolderId}
          />
        }
        topBar={
          <StudioTopBar
            appMode={appMode}
            hasFalKey={studio.hasFalKey}
            onDeleteSelected={studio.deleteSelectedItems}
            onOpenCreateText={studio.openCreateTextComposer}
            onOpenAccount={openAccountSurface}
            onOpenUpload={() => fileInputRef.current?.click()}
            onSizeLevelChange={studio.setGallerySizeLevel}
            onToggleSelectionMode={studio.toggleSelectionMode}
            selectedItemCount={studio.selectedItemCount}
            selectionModeEnabled={studio.selectionModeEnabled}
            sizeLevel={studio.gallerySizeLevel}
          />
        }
      />

      <StudioDragPreviewOverlay preview={dragPreview} />
      {showDevModeToggle ? (
        <StudioDevModeOverlay
          appMode={appMode}
          onChange={handleAppModeChange}
        />
      ) : null}

      {appMode === "local" ? (
        <ProviderSettingsDialog
          open={studio.providerSettingsOpen}
          initialValues={studio.providerSettings}
          onClose={() => studio.setProviderSettingsOpen(false)}
          onSave={studio.saveProviderSettings}
        />
      ) : null}

      <HostedAccountDialog
        open={appMode === "hosted" && hostedAccountOpen}
        onClose={() => setHostedAccountOpen(false)}
      />

      <FolderDialog
        errorMessage={studio.folderEditorError}
        open={studio.folderEditorOpen}
        mode={studio.folderEditorMode}
        value={studio.folderEditorValue}
        onValueChange={studio.setFolderEditorValue}
        onClose={() => studio.setFolderEditorOpen(false)}
        onSave={studio.saveFolder}
      />

      <CreateTextDialog
        open={studio.createTextDialogOpen}
        title={studio.createTextTitle}
        body={studio.createTextBody}
        onTitleChange={studio.setCreateTextTitle}
        onBodyChange={studio.setCreateTextBody}
        onClose={() => studio.setCreateTextDialogOpen(false)}
        onSubmit={studio.createTextAsset}
      />

      <AssetDetailDialog
        key={activeItem?.id ?? "asset-dialog-closed"}
        item={activeItem}
        open={Boolean(activeItem)}
        onClose={() => setActiveItemId(null)}
        onDelete={(itemId) => {
          studio.deleteItem(itemId);
          setActiveItemId(null);
        }}
        onDownload={downloadItem}
        onReuse={(itemId) => {
          studio.reuseItem(itemId);
          setActiveItemId(null);
        }}
        onSaveText={studio.updateTextItem}
      />
    </>
  );
}
