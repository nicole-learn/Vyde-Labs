"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AssetDetailDialog } from "./asset-detail-dialog";
import { CreateTextDialog } from "./create-text-dialog";
import { FloatingControlBar } from "./floating-control-bar";
import { FolderDialog } from "./folder-dialog";
import { FolderSidebar } from "./folder-sidebar";
import { HostedAccountDialog } from "./hosted-account-dialog";
import { ProviderSettingsDialog } from "./provider-settings-dialog";
import { StudioGallery } from "./studio-gallery";
import { StudioMobileRail } from "./studio-mobile-rail";
import { StudioTopBar } from "./studio-top-bar";
import { StudioWorkspaceShell } from "./studio-workspace-shell";
import { useStudioAppMode } from "../studio-app-mode";
import { useStudioRuntime } from "../use-studio-runtime";
import type { LibraryItem } from "../types";

const XL_BREAKPOINT_QUERY = "(min-width: 1280px)";

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

export function StudioPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { appMode, canSwitchModes, setAppMode } = useStudioAppMode();
  const studio = useStudioRuntime(appMode);
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(XL_BREAKPOINT_QUERY).matches;
  });
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [hostedAccountOpen, setHostedAccountOpen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(XL_BREAKPOINT_QUERY);
    const syncViewport = () => {
      setIsDesktopViewport(mediaQuery.matches);
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  const activeItem = useMemo(
    () => studio.items.find((item) => item.id === activeItemId) ?? null,
    [activeItemId, studio.items]
  );

  const handleAppModeChange = (nextMode: "local" | "hosted") => {
    setHostedAccountOpen(false);
    setAppMode(nextMode);
  };

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

  const primaryGallery = (
    <StudioGallery
      allowDropMove={Boolean(studio.selectedFolderId)}
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
      onMoveDraggedItems={(itemIds) => studio.moveItemsToFolder(itemIds, null)}
      onOpenItem={setActiveItemId}
      onReuseItem={studio.reuseItem}
      onToggleItemSelection={studio.toggleItemSelection}
    />
  );

  const secondaryGallery = studio.selectedFolder ? (
    <StudioGallery
      allowDropMove
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
        multiple
        className="hidden"
        onChange={(event) => {
          studio.uploadFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      <StudioWorkspaceShell
        floatingOverlay={
          <FloatingControlBar
            draft={studio.currentDraft}
            model={studio.selectedModel}
            models={studio.models}
            sections={studio.modelSections}
            selectedModelId={studio.selectedModelId}
            onAddReferences={studio.addReferences}
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
            canSwitchModes={canSwitchModes}
            hasFalKey={studio.hasFalKey}
            onDeleteSelected={studio.deleteSelectedItems}
            onOpenCreateText={studio.openCreateTextComposer}
            onOpenAccount={openAccountSurface}
            onOpenUpload={() => fileInputRef.current?.click()}
            onAppModeChange={handleAppModeChange}
            onSizeLevelChange={studio.setGallerySizeLevel}
            onToggleSelectionMode={studio.toggleSelectionMode}
            selectedItemCount={studio.selectedItemCount}
            selectionModeEnabled={studio.selectionModeEnabled}
            sizeLevel={studio.gallerySizeLevel}
          />
        }
      />

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
