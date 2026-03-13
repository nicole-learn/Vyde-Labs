"use client";

import { FolderPlus } from "lucide-react";
import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/lib/cn";
import { FolderOptionsMenu } from "./folder-options-menu";
import {
  isStudioItemDrag,
  parseDraggedLibraryItemIds,
} from "../studio-drag-data";
import { useDragHoverReset } from "../use-drag-hover-reset";
import { useFolderReorder } from "../use-folder-reorder";
import type { StudioFolder } from "../types";

interface FolderSidebarProps {
  folderCounts: Record<string, number>;
  folders: StudioFolder[];
  onCopyFolderId: (folderId: string) => void;
  onReorderFolders: (orderedFolderIds: string[]) => void;
  onRequestDeleteFolder: (folderId: string) => void;
  selectedFolderId: string | null;
  onCreateFolder: () => void;
  onDownloadFolder: (folderId: string) => void;
  onDropItemsToFolder: (itemIds: string[], folderId: string | null) => void;
  onRenameFolder: (folderId: string) => void;
  onSelectFolder: (folderId: string | null) => void;
}

interface FolderRowProps {
  active: boolean;
  count: number;
  dragOverlay?: boolean;
  folderId: string;
  label: string;
  sortingActive: boolean;
  sortingPlaceholder: boolean;
  onCopyFolderId: () => void;
  onClick: () => void;
  onDownloadFolder: () => void;
  onOpenFolder: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onRegisterNode: (node: HTMLDivElement | null) => void;
  onDrop?: (itemIds: string[]) => void;
  onRequestDelete: () => void;
  onRename: () => void;
}

function getFolderRowClassName(params: {
  active: boolean;
  dragOver: boolean;
  dragOverlay?: boolean;
  sortingPlaceholder: boolean;
}) {
  return cn(
    "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 pr-12 text-left text-[15px] transition-all duration-150",
    params.active
      ? "bg-white/[0.11] font-medium text-foreground"
      : "bg-white/[0.05] text-foreground/84 hover:bg-white/[0.08] hover:text-foreground",
    params.dragOver
      ? "border-primary/65 bg-primary/12 text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_30%,transparent)]"
      : "border-transparent",
    params.sortingPlaceholder ? "opacity-0" : undefined,
    params.dragOverlay
      ? "bg-white/[0.11] text-foreground shadow-[0_18px_48px_rgba(0,0,0,0.45)]"
      : undefined
  );
}

function FolderRow({
  active,
  count,
  dragOverlay = false,
  folderId,
  label,
  sortingActive,
  sortingPlaceholder,
  onCopyFolderId,
  onClick,
  onDownloadFolder,
  onOpenFolder,
  onPointerDown,
  onRegisterNode,
  onDrop,
  onRequestDelete,
  onRename,
}: FolderRowProps) {
  const [dragOver, setDragOver] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const registerRow = useCallback(
    (node: HTMLDivElement | null) => {
      rowRef.current = node;
      onRegisterNode(node);
    },
    [onRegisterNode]
  );

  useDragHoverReset({
    active: dragOver,
    containerRef: rowRef,
    onReset: () => setDragOver(false),
  });

  return (
    <div
      ref={registerRow}
      className={cn(
        "group relative select-none transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        dragOverlay ? "pointer-events-none" : undefined
      )}
      data-folder-id={folderId}
      onPointerDown={dragOverlay ? undefined : onPointerDown}
    >
      <button
        type="button"
        onClick={(event) => {
          if (dragOverlay) {
            event.preventDefault();
            return;
          }

          onClick();
        }}
        onDragEnter={(event) => {
          if (!onDrop) return;
          if (!isStudioItemDrag(event.dataTransfer)) return;
          event.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(event) => {
          if (!onDrop) return;
          if (!isStudioItemDrag(event.dataTransfer)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (!dragOver) {
            setDragOver(true);
          }
        }}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget as Node | null;
          if (nextTarget && event.currentTarget.contains(nextTarget)) return;
          setDragOver(false);
        }}
        onDrop={(event) => {
          if (!onDrop) return;
          event.preventDefault();
          setDragOver(false);
          onDrop(parseDraggedLibraryItemIds(event.dataTransfer));
        }}
        className={getFolderRowClassName({
          active,
          dragOver,
          dragOverlay,
          sortingPlaceholder,
        })}
      >
        <span className="truncate">{label}</span>
      </button>

      {!dragOverlay ? (
        <>
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-medium tabular-nums text-foreground/38 transition-opacity duration-150",
              sortingActive
                ? "opacity-0"
                : "opacity-100 group-hover:opacity-0 group-focus-within:opacity-0"
            )}
          >
            {count}
          </span>

          <FolderOptionsMenu
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 transition-opacity duration-150",
              sortingActive
                ? "pointer-events-none opacity-0"
                : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
            )}
            folderName={label}
            hasItems={count > 0}
            onCopyFolderId={onCopyFolderId}
            onDeleteFolder={onRequestDelete}
            onDownloadFolder={onDownloadFolder}
            onOpenFolder={onOpenFolder}
            onRenameFolder={onRename}
          />
        </>
      ) : null}
    </div>
  );
}

export function FolderSidebar({
  folderCounts,
  folders,
  onCopyFolderId,
  onReorderFolders,
  onRequestDeleteFolder,
  selectedFolderId,
  onCreateFolder,
  onDownloadFolder,
  onDropItemsToFolder,
  onRenameFolder,
  onSelectFolder,
}: FolderSidebarProps) {
  const { displayedFolders, dragSession, folderMap, registerRowNode, shouldSuppressFolderClick, startFolderDrag } =
    useFolderReorder({
      folders,
      onReorderFolders,
    });

  return (
    <aside className="flex h-full min-h-0 flex-col bg-black px-2 pb-2 pt-3">
      <div className="stable-scrollbar flex-1 min-h-0 overflow-y-auto">
        <div className="space-y-2">
          {displayedFolders.map((folder) => (
            <FolderRow
              key={folder.id}
              active={selectedFolderId === folder.id}
              count={folderCounts[folder.id] ?? 0}
              folderId={folder.id}
              label={folder.name}
              sortingActive={Boolean(dragSession?.active)}
              sortingPlaceholder={Boolean(
                dragSession?.active && dragSession.folderId === folder.id
              )}
              onCopyFolderId={() => onCopyFolderId(folder.id)}
              onClick={() => {
                if (shouldSuppressFolderClick()) {
                  return;
                }

                onSelectFolder(selectedFolderId === folder.id ? null : folder.id);
              }}
              onDownloadFolder={() => onDownloadFolder(folder.id)}
              onOpenFolder={() => onSelectFolder(folder.id)}
              onPointerDown={(event) => startFolderDrag(folder.id, event)}
              onRegisterNode={(node) => registerRowNode(folder.id, node)}
              onDrop={(itemIds) => onDropItemsToFolder(itemIds, folder.id)}
              onRequestDelete={() => onRequestDeleteFolder(folder.id)}
              onRename={() => onRenameFolder(folder.id)}
            />
          ))}
        </div>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={onCreateFolder}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/16 px-4 py-3 text-[15px] text-foreground/84 transition-colors hover:border-white/24 hover:bg-white/[0.04] hover:text-foreground"
        >
          <FolderPlus className="size-4" />
          <span>Add Folder</span>
        </button>
      </div>

      {dragSession?.active ? (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            left: dragSession.overlayLeft,
            top: dragSession.currentY - dragSession.pointerOffsetY,
            width: dragSession.overlayWidth,
          }}
        >
          <FolderRow
            active={selectedFolderId === dragSession.folderId}
            count={folderCounts[dragSession.folderId] ?? 0}
            dragOverlay
            folderId={dragSession.folderId}
            label={folderMap.get(dragSession.folderId)?.name ?? "Folder"}
            sortingActive
            sortingPlaceholder={false}
            onCopyFolderId={() => {}}
            onClick={() => {}}
            onDownloadFolder={() => {}}
            onOpenFolder={() => {}}
            onPointerDown={() => {}}
            onRegisterNode={() => {}}
            onRequestDelete={() => {}}
            onRename={() => {}}
          />
        </div>
      ) : null}
    </aside>
  );
}
