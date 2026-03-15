"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { FloatingControlBar } from "./floating-control-bar";
import { FolderSidebar } from "./folder-sidebar";
import { StudioDevModeOverlay } from "./studio-dev-mode-overlay";
import { StudioDragPreviewOverlay } from "./studio-drag-preview-overlay";
import { StudioGallery } from "./studio-gallery";
import { StudioMobileRail } from "./studio-mobile-rail";
import { StudioTopBar } from "./studio-top-bar";
import { StudioWorkspaceShell } from "./studio-workspace-shell";
import { useStudioAppMode } from "../studio-app-mode";
import { downloadFolderItems, downloadLibraryItem } from "../studio-downloads";
import { isStudioItemDrag } from "../studio-drag-data";
import { useStudioRuntime } from "../use-studio-runtime";
import type { LibraryItem } from "../types";

const AssetDetailDialog = dynamic(
  () => import("./asset-detail-dialog").then((mod) => mod.AssetDetailDialog),
  { loading: () => null, ssr: false }
);
const CreateTextDialog = dynamic(
  () => import("./create-text-dialog").then((mod) => mod.CreateTextDialog),
  { loading: () => null, ssr: false }
);
const FolderDeleteDialog = dynamic(
  () => import("./folder-delete-dialog").then((mod) => mod.FolderDeleteDialog),
  { loading: () => null, ssr: false }
);
const FolderDialog = dynamic(
  () => import("./folder-dialog").then((mod) => mod.FolderDialog),
  { loading: () => null, ssr: false }
);
const HostedAuthDialog = dynamic(
  () => import("./hosted-auth-dialog").then((mod) => mod.HostedAuthDialog),
  { loading: () => null, ssr: false }
);
const QueueLimitDialog = dynamic(
  () => import("./queue-limit-dialog").then((mod) => mod.QueueLimitDialog),
  { loading: () => null, ssr: false }
);
const StudioFeedbackDialog = dynamic(
  () => import("./studio-feedback-dialog").then((mod) => mod.StudioFeedbackDialog),
  { loading: () => null, ssr: false }
);
const StudioMessageDialog = dynamic(
  () => import("./studio-message-dialog").then((mod) => mod.StudioMessageDialog),
  { loading: () => null, ssr: false }
);
const StudioSettingsDialog = dynamic(
  () => import("./studio-settings-dialog").then((mod) => mod.StudioSettingsDialog),
  { loading: () => null, ssr: false }
);
const UploadFilesDialog = dynamic(
  () => import("./upload-files-dialog").then((mod) => mod.UploadFilesDialog),
  { loading: () => null, ssr: false }
);

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
    studio.setSettingsDialogOpen(false);
    setAppMode(nextMode);
  };
  const showDevModeToggle = canSwitchModes && !hideDevModeToggle;

  const openAccountSurface = () => {
    if (appMode === "hosted" && !studio.hostedUserSignedIn) {
      studio.openHostedAuthDialog();
      return;
    }

    studio.setSettingsDialogOpen(true);
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
      allRuns={studio.runs}
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
      onDeleteRun={studio.deleteRun}
      onDownloadItem={(itemId) => {
        const item = studio.items.find((entry) => entry.id === itemId);
        if (!item) {
          return;
        }

        void downloadItem(item);
      }}
      onReuseItem={studio.reuseItem}
      onToggleItemSelection={studio.toggleItemSelection}
    />
  );

  const secondaryGallery = studio.selectedFolder ? (
    <StudioGallery
      allowDropMove
      allRuns={studio.runs}
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
      onDeleteRun={studio.deleteRun}
      onDownloadItem={(itemId) => {
        const item = studio.items.find((entry) => entry.id === itemId);
        if (!item) {
          return;
        }

        void downloadItem(item);
      }}
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
            onClearEndFrame={studio.clearEndFrame}
            onClearStartFrame={studio.clearStartFrame}
            onDropLibraryItems={studio.dropLibraryItemsIntoPromptBar}
            onDropLibraryItemsToEndFrame={studio.dropLibraryItemsIntoEndFrame}
            onDropLibraryItemsToStartFrame={studio.dropLibraryItemsIntoStartFrame}
            onGenerate={studio.generate}
            generatePending={studio.generatePending}
            onRemoveReference={studio.removeReference}
            onSavePrompt={studio.saveCurrentPromptAsTextItem}
            savePromptPending={studio.savePromptPending}
            onSelectModel={studio.setSelectedModelId}
            onSetEndFrame={studio.setEndFrame}
            onSetStartFrame={studio.setStartFrame}
            onSetVideoInputMode={studio.setVideoInputMode}
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
            hostedAuthenticated={studio.hostedUserSignedIn}
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
            onOpenFeedback={studio.openFeedbackDialog}
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
            hostedAuthenticated={studio.hostedUserSignedIn}
            onClearSelection={studio.clearSelection}
            onDeleteSelected={studio.deleteSelectedItems}
            onDownloadSelected={downloadSelectedItems}
            onOpenAccount={openAccountSurface}
            onOpenFeedback={studio.openFeedbackDialog}
            onOpenUpload={studio.openUploadDialog}
            onSizeLevelChange={studio.setGallerySizeLevel}
            onToggleSelectionMode={studio.toggleSelectionMode}
            selectedItemCount={studio.selectedItemCount}
            selectionModeEnabled={studio.selectionModeEnabled}
            sizeLevel={studio.gallerySizeLevel}
          />
        }
      />

      {!isDesktopViewport ? (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/96 px-6 text-center backdrop-blur-md">
          <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-background/92 px-8 py-10 shadow-2xl shadow-black/60">
            <div className="text-[13px] font-semibold uppercase tracking-[0.22em] text-primary/88">
              Desktop Only
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">
              TryPlayground isn&apos;t available on mobile yet.
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/68">
              Open TryPlayground on a PC or laptop to use the full workspace.
            </p>
          </div>
        </div>
      ) : null}

      <StudioDragPreviewOverlay preview={dragPreview} />
      {showDevModeToggle ? (
        <StudioDevModeOverlay
          appMode={appMode}
          onChange={handleAppModeChange}
        />
      ) : null}

      <HostedAuthDialog
        errorMessage={studio.hostedAuthErrorMessage}
        open={studio.hostedAuthDialogOpen}
        pending={studio.hostedAuthPending}
        onClose={studio.closeHostedAuthDialog}
        onContinue={studio.signInWithGoogleHostedAccount}
      />

      <StudioSettingsDialog
        key={`${appMode}:${studio.settingsDialogOpen ? "open" : "closed"}:${studio.highlightedProviderKey ?? "none"}`}
        appMode={appMode}
        accountActionErrorMessage={studio.accountActionErrorMessage}
        accountActionPending={studio.accountActionPending}
        hostedAccount={studio.hostedAccount}
        modelConfigurationErrorMessage={studio.modelConfigurationErrorMessage}
        modelConfigurationPending={studio.modelConfigurationPending}
        modelConfiguration={studio.modelConfiguration}
        open={studio.settingsDialogOpen}
        purchaseErrorMessage={studio.purchaseCreditsErrorMessage}
        highlightedProviderKey={studio.highlightedProviderKey}
        providerSettings={studio.providerSettings}
        purchasePending={studio.purchaseCreditsPending}
        onClose={() => studio.setSettingsDialogOpen(false)}
        onDeleteAccount={studio.deleteHostedAccount}
        onPurchaseCredits={studio.purchaseHostedCredits}
        onSaveProviderSettings={studio.saveProviderSettings}
        onSignOut={studio.signOutHostedAccount}
        onToggleModelEnabled={studio.toggleModelEnabled}
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
        errorMessage={studio.uploadErrorMessage}
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

      <StudioMessageDialog
        open={studio.generationErrorDialogOpen}
        title="Generation Error"
        message={studio.generationErrorMessage}
        onClose={studio.closeGenerationErrorDialog}
      />

      <StudioFeedbackDialog
        errorMessage={studio.feedbackErrorMessage}
        message={studio.feedbackMessage}
        open={studio.feedbackDialogOpen}
        pending={studio.feedbackPending}
        successMessage={studio.feedbackSuccessMessage}
        onClose={studio.closeFeedbackDialog}
        onMessageChange={studio.updateFeedbackMessage}
        onSubmit={studio.submitFeedback}
      />
    </>
  );
}
