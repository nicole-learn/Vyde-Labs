"use client";

import { useRef } from "react";
import { CreateTextDialog } from "./create-text-dialog";
import { FolderDialog } from "./folder-dialog";
import { FloatingControlBar } from "./floating-control-bar";
import { LocalSettingsDialog } from "./local-settings-dialog";
import { FolderSidebar } from "./folder-sidebar";
import { StudioGallery } from "./studio-gallery";
import { StudioTopBar } from "./studio-top-bar";
import { StudioWorkspaceShell } from "./studio-workspace-shell";
import { useStudioApp } from "../use-studio-app";

export function StudioPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const studio = useStudioApp();

  return (
    <>
      <div className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
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
          topBar={
            <StudioTopBar
              hasFalKey={studio.hasFalKey}
              onDeleteSelected={studio.deleteSelectedItems}
              onOpenCreateText={studio.openCreateTextComposer}
              onOpenSettings={() => studio.setSettingsOpen(true)}
              onOpenUpload={() => fileInputRef.current?.click()}
              onSizeLevelChange={studio.setGallerySizeLevel}
              onToggleSelectionMode={studio.toggleSelectionMode}
              selectedItemCount={studio.selectedItemCount}
              selectionModeEnabled={studio.selectionModeEnabled}
              sizeLevel={studio.gallerySizeLevel}
            />
          }
          primaryPanel={
            <div className="relative h-full min-h-0 min-w-0">
              <StudioGallery
                allowUngroupDrop={Boolean(studio.selectedFolderId)}
                emptyStateActionLabel="Upload Assets"
                emptyStateLabel="Generate or Upload an asset to get started"
                items={studio.ungroupedItems}
                pendingRuns={studio.pendingRuns}
                selectedItemIdSet={studio.selectedItemIdSet}
                selectionModeEnabled={studio.selectionModeEnabled}
                sizeLevel={studio.gallerySizeLevel}
                onDeleteItem={studio.deleteItem}
                onEmptyStateAction={() => fileInputRef.current?.click()}
                onMoveDraggedItems={(itemIds) => studio.moveItemsToFolder(itemIds, null)}
                onReuseItem={studio.reuseItem}
                onToggleItemSelection={studio.toggleItemSelection}
              />
              <FloatingControlBar
                draft={studio.currentDraft}
                hasFalKey={studio.hasFalKey}
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
            </div>
          }
          secondaryPanel={
            studio.selectedFolder ? (
              <StudioGallery
                emptyStateActionLabel="Upload Assets"
                emptyStateLabel="Drag or Upload an asset into this folder to see it here"
                items={studio.selectedFolderItems}
                selectedItemIdSet={studio.selectedItemIdSet}
                selectionModeEnabled={studio.selectionModeEnabled}
                sizeLevel={studio.gallerySizeLevel}
                onDeleteItem={studio.deleteItem}
                onEmptyStateAction={() => fileInputRef.current?.click()}
                onReuseItem={studio.reuseItem}
                onToggleItemSelection={studio.toggleItemSelection}
              />
            ) : null
          }
          rightSidebar={
            <FolderSidebar
              folders={studio.folders}
              folderCounts={studio.folderCounts}
              selectedFolderCount={studio.selectedFolderItems.length}
              selectedFolderId={studio.selectedFolderId}
              ungroupedCount={studio.ungroupedItems.length + studio.pendingRuns.length}
              onCreateFolder={studio.openCreateFolder}
              onDeleteFolder={studio.deleteFolder}
              onDropItemsToFolder={(itemIds, folderId) =>
                studio.moveItemsToFolder(itemIds, folderId)
              }
              onRenameFolder={studio.openRenameFolder}
              onSelectFolder={studio.setSelectedFolderId}
            />
          }
        />
      </div>

      <LocalSettingsDialog
        open={studio.settingsOpen}
        initialValues={studio.settings}
        onClose={() => studio.setSettingsOpen(false)}
        onSave={studio.saveSettings}
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
    </>
  );
}
