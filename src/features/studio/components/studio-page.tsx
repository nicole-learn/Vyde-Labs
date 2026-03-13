"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AssetDetailDialog } from "./asset-detail-dialog";
import { CreateTextDialog } from "./create-text-dialog";
import { FloatingControlBar } from "./floating-control-bar";
import { FolderDeleteDialog } from "./folder-delete-dialog";
import { FolderDialog } from "./folder-dialog";
import { FolderSidebar } from "./folder-sidebar";
import { HostedAccountDialog } from "./hosted-account-dialog";
import { ProviderSettingsDialog } from "./provider-settings-dialog";
import { QueueLimitDialog } from "./queue-limit-dialog";
import { StudioDevModeOverlay } from "./studio-dev-mode-overlay";
import { StudioDragPreviewOverlay } from "./studio-drag-preview-overlay";
import { StudioGallery } from "./studio-gallery";
import { StudioMobileRail } from "./studio-mobile-rail";
import { StudioTopBar } from "./studio-top-bar";
import { UploadFilesDialog } from "./upload-files-dialog";
import { StudioWorkspaceShell } from "./studio-workspace-shell";
import { useStudioAppMode } from "../studio-app-mode";
import { downloadFolderItems, downloadLibraryItem } from "../studio-downloads";
import { isStudioItemDrag } from "../studio-drag-data";
import { useStudioRuntime } from "../use-studio-runtime";
import type { LibraryItem } from "../types";

const XL_BREAKPOINT_QUERY = "(min-width: 1280px)";

interface StudioPageProps {
  hideDevModeToggle?: boolean;
}

export function StudioPage({
  hideDevModeToggle = false,
}: StudioPageProps) {
  const emptyDragImageRef = useRef<HTMLDivElement | null>(null);
  const { appMode, canSwitchModes, setAppMode } = useStudioAppMode();
  const studio = useStudioRuntime(appMode);
  const [isDesktopViewport, setIsDesktopViewport] = useState(true);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [folderDeleteTargetId, setFolderDeleteTargetId] = useState<string | null>(
    null
  );
  const [hostedAccountOpen, setHostedAccountOpen] = useState(false);
  const [dragPreview, setDragPreview] = useState<{
    count: number;
    itemIds: string[];
    leadItem: Pick<
      LibraryItem,
      | "id"
      | "kind"
      | "title"
      | "previewUrl"
      | "thumbnailUrl"
      | "mimeType"
      | "contentText"
      | "prompt"
      | "hasAlpha"
    >;
    x: number;
    y: number;
  } | null>(null);
  const hasDragPreview = dragPreview !== null;
  const selectionModeEnabled = studio.selectionModeEnabled;
  const toggleSelectionMode = studio.toggleSelectionMode;

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

  useEffect(() => {
    if (!selectionModeEnabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      toggleSelectionMode();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionModeEnabled, toggleSelectionMode]);

  const activeItem = useMemo(
    () => studio.items.find((item) => item.id === activeItemId) ?? null,
    [activeItemId, studio.items]
  );
  const selectedItems = useMemo(
    () => studio.items.filter((item) => studio.selectedItemIdSet.has(item.id)),
    [studio.items, studio.selectedItemIdSet]
  );
  const folderDeleteTarget = useMemo(
    () =>
      studio.folders.find((folder) => folder.id === folderDeleteTargetId) ?? null,
    [folderDeleteTargetId, studio.folders]
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
    void downloadLibraryItem(item);
  };

  const downloadFolder = (folderId: string) => {
    const folderItems = studio.getItemsForFolder(folderId);
    void downloadFolderItems(folderItems);
  };

  const downloadSelectedItems = () => {
    void downloadFolderItems(selectedItems);
  };

  const copyFolderId = async (folderId: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(folderId);
    } catch {
      // Ignore clipboard failures in unsupported or restricted environments.
    }
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
        thumbnailUrl: params.leadItem.thumbnailUrl,
        mimeType: params.leadItem.mimeType,
        contentText: params.leadItem.contentText,
        prompt: params.leadItem.prompt,
        hasAlpha: params.leadItem.hasAlpha,
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
      runCards={studio.ungroupedRunCards}
      selectedItemIdSet={studio.selectedItemIdSet}
      selectionModeEnabled={studio.selectionModeEnabled}
      sizeLevel={studio.gallerySizeLevel}
      onDeleteItem={(itemId) => {
        if (activeItemId === itemId) {
          setActiveItemId(null);
        }
        studio.deleteItem(itemId);
      }}
      onEmptyStateAction={studio.openUploadDialog}
      onItemDragEnd={() => setDragPreview(null)}
      onItemDragStart={handleItemDragStart}
      onMoveDraggedItems={(itemIds) => studio.moveItemsToFolder(itemIds, null)}
      onOpenItem={setActiveItemId}
      onCancelRun={studio.cancelRun}
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
      runCards={studio.selectedFolderRunCards}
      selectedItemIdSet={studio.selectedItemIdSet}
      selectionModeEnabled={studio.selectionModeEnabled}
      sizeLevel={studio.gallerySizeLevel}
      onDeleteItem={(itemId) => {
        if (activeItemId === itemId) {
          setActiveItemId(null);
        }
        studio.deleteItem(itemId);
      }}
      onEmptyStateAction={studio.openUploadDialog}
      onItemDragEnd={() => setDragPreview(null)}
      onItemDragStart={handleItemDragStart}
      onMoveDraggedItems={(itemIds) =>
        studio.moveItemsToFolder(itemIds, studio.selectedFolderId)
      }
      onOpenItem={setActiveItemId}
      onCancelRun={studio.cancelRun}
      onReuseItem={studio.reuseItem}
      onToggleItemSelection={studio.toggleItemSelection}
    />
  ) : null;

  return (
    <>
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
            accountLabel={studio.accountButtonLabel}
            folderCounts={studio.folderCounts}
            folders={studio.folders}
            hasFalKey={studio.hasFalKey}
            onClearSelection={studio.clearSelection}
            onDownloadSelected={downloadSelectedItems}
            onDeleteSelected={studio.deleteSelectedItems}
            selectedFolderId={studio.selectedFolderId}
            selectedItemCount={studio.selectedItemCount}
            selectionModeEnabled={studio.selectionModeEnabled}
            sizeLevel={studio.gallerySizeLevel}
            onCreateFolder={studio.openCreateFolder}
            onOpenCreateText={studio.openCreateTextComposer}
            onOpenAccount={openAccountSurface}
            onOpenUpload={studio.openUploadDialog}
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
            folderCounts={studio.folderCounts}
            folders={studio.folders}
            onCopyFolderId={copyFolderId}
            onReorderFolders={studio.reorderFolders}
            onRequestDeleteFolder={setFolderDeleteTargetId}
            selectedFolderId={studio.selectedFolderId}
            onCreateFolder={studio.openCreateFolder}
            onDownloadFolder={downloadFolder}
            onDropItemsToFolder={studio.moveItemsToFolder}
            onRenameFolder={studio.openRenameFolder}
            onSelectFolder={studio.setSelectedFolderId}
          />
        }
        topBar={
          <StudioTopBar
            appMode={appMode}
            accountLabel={studio.accountButtonLabel}
            hasFalKey={studio.hasFalKey}
            onClearSelection={studio.clearSelection}
            onDeleteSelected={studio.deleteSelectedItems}
            onDownloadSelected={downloadSelectedItems}
            onOpenCreateText={studio.openCreateTextComposer}
            onOpenAccount={openAccountSurface}
            onOpenUpload={studio.openUploadDialog}
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
        account={studio.hostedAccount}
        open={appMode === "hosted" && hostedAccountOpen}
        purchasePending={studio.purchaseCreditsPending}
        onClose={() => setHostedAccountOpen(false)}
        onPurchaseCredits={studio.purchaseHostedCredits}
      />

      <FolderDialog
        errorMessage={studio.folderEditorError}
        saving={studio.folderEditorSaving}
        open={studio.folderEditorOpen}
        mode={studio.folderEditorMode}
        value={studio.folderEditorValue}
        onValueChange={studio.updateFolderEditorValue}
        onOpenChange={(open) => {
          if (!open) {
            studio.closeFolderEditor();
          }
        }}
        onSubmit={studio.saveFolder}
      />

      <FolderDeleteDialog
        folderName={folderDeleteTarget?.name ?? "this folder"}
        open={Boolean(folderDeleteTarget)}
        onClose={() => setFolderDeleteTargetId(null)}
        onDelete={() => {
          if (!folderDeleteTargetId) return;
          studio.deleteFolder(folderDeleteTargetId);
          setFolderDeleteTargetId(null);
        }}
      />

      <CreateTextDialog
        open={studio.createTextDialogOpen}
        title={studio.createTextTitle}
        body={studio.createTextBody}
        errorMessage={studio.createTextErrorMessage}
        saving={studio.createTextSaving}
        onTitleChange={studio.updateCreateTextTitle}
        onBodyChange={studio.updateCreateTextBody}
        onClose={studio.closeCreateTextComposer}
        onSubmit={studio.createTextAsset}
      />

      <UploadFilesDialog
        folders={studio.folders}
        loading={studio.uploadAssetsLoading}
        open={studio.uploadDialogOpen}
        selectedFolderId={studio.uploadDialogFolderId}
        onChooseFiles={(files) => studio.uploadFiles(files, studio.uploadDialogFolderId)}
        onClose={studio.closeUploadDialog}
        onSelectFolder={studio.setUploadDialogFolder}
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

      <QueueLimitDialog
        open={studio.queueLimitDialogOpen}
        onClose={studio.closeQueueLimitDialog}
      />
    </>
  );
}
