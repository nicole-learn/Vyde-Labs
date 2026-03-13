"use client";

import { FolderPlus, MoreHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { StudioFolder } from "../types";

interface FolderSidebarProps {
  folders: StudioFolder[];
  folderCounts: Record<string, number>;
  selectedFolderCount: number;
  selectedFolderId: string | null;
  ungroupedCount: number;
  onCreateFolder: () => void;
  onDeleteFolder: (folderId: string) => void;
  onDropItemsToFolder: (itemIds: string[], folderId: string | null) => void;
  onRenameFolder: (folderId: string) => void;
  onSelectFolder: (folderId: string | null) => void;
}

function parseDraggedItemIds(dataTransfer: DataTransfer) {
  const rawValue = dataTransfer.getData("application/vnd.vydelabs.items");
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue) as string[];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

interface FolderRowProps {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
  onDelete?: () => void;
  onDrop?: (itemIds: string[]) => void;
  onRename?: () => void;
}

function FolderRow({
  active,
  count,
  label,
  onClick,
  onDelete,
  onDrop,
  onRename,
}: FolderRowProps) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        onDragEnter={(event) => {
          if (!onDrop) return;
          if (!event.dataTransfer.types.includes("application/vnd.vydelabs.items")) return;
          event.preventDefault();
        }}
        onDragOver={(event) => {
          if (!onDrop) return;
          if (!event.dataTransfer.types.includes("application/vnd.vydelabs.items")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          if (!onDrop) return;
          event.preventDefault();
          onDrop(parseDraggedItemIds(event.dataTransfer));
        }}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm transition-all duration-150",
          active
            ? "bg-primary/10 font-medium text-primary"
            : "text-foreground/80 hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      </button>

      {onRename || onDelete ? (
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          {onRename ? (
            <button
              type="button"
              onClick={onRename}
              className="rounded-md p-1 text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
              aria-label={`Rename ${label}`}
              title="Rename folder"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md p-1 text-muted-foreground transition hover:bg-red-500/14 hover:text-red-200"
              aria-label={`Delete ${label}`}
              title="Delete folder"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function FolderSidebar({
  folders,
  folderCounts,
  selectedFolderCount,
  selectedFolderId,
  ungroupedCount,
  onCreateFolder,
  onDeleteFolder,
  onDropItemsToFolder,
  onRenameFolder,
  onSelectFolder,
}: FolderSidebarProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-l-[2px] border-border/40 bg-background">
      <div className="stable-scrollbar flex-1 min-h-0 overflow-y-auto p-1.5">
        <div className="space-y-0.5">
          <FolderRow
            active={!selectedFolderId}
            count={ungroupedCount}
            label="Ungrouped"
            onClick={() => onSelectFolder(null)}
            onDrop={(itemIds) => onDropItemsToFolder(itemIds, null)}
          />

          {folders.map((folder) => (
            <FolderRow
              key={folder.id}
              active={selectedFolderId === folder.id}
              count={folderCounts[folder.id] ?? 0}
              label={folder.name}
              onClick={() => onSelectFolder(folder.id)}
              onDelete={() => onDeleteFolder(folder.id)}
              onDrop={(itemIds) => onDropItemsToFolder(itemIds, folder.id)}
              onRename={() => onRenameFolder(folder.id)}
            />
          ))}
        </div>
      </div>

      {selectedFolderId ? (
        <div className="border-t border-border/40 px-2.5 py-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Selected folder has {selectedFolderCount} item
          {selectedFolderCount === 1 ? "" : "s"}
        </div>
      ) : null}

      <div className="border-t border-border/40 p-1.5">
        <button
          type="button"
          onClick={onCreateFolder}
          className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <FolderPlus className="size-3.5" />
          <span>Add Folder</span>
        </button>
      </div>
    </aside>
  );
}
