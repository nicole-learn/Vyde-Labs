"use client";

import { FolderPlus } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
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
import type { StudioFolder } from "../types";

const FOLDER_DRAG_THRESHOLD_PX = 4;

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

interface FolderDragSession {
  active: boolean;
  currentY: number;
  folderId: string;
  initialIds: string[];
  overlayHeight: number;
  overlayLeft: number;
  overlayWidth: number;
  pointerId: number;
  pointerOffsetY: number;
  previewIds: string[];
  startY: number;
}

function sortFoldersByOrder(folders: StudioFolder[]) {
  return [...folders].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt);
    }

    return left.id.localeCompare(right.id);
  });
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

  return (
    <div
      ref={onRegisterNode}
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
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const previousRowTopsRef = useRef(new Map<string, number>());
  const dragSessionRef = useRef<FolderDragSession | null>(null);
  const suppressFolderClickRef = useRef(false);
  const [dragSession, setDragSession] = useState<FolderDragSession | null>(null);

  const sortedFolders = useMemo(() => sortFoldersByOrder(folders), [folders]);
  const folderMap = useMemo(
    () => new Map(sortedFolders.map((folder) => [folder.id, folder])),
    [sortedFolders]
  );

  const displayedFolders = useMemo(() => {
    const orderedIds = dragSession?.previewIds;
    if (!orderedIds) {
      return sortedFolders;
    }

    return orderedIds
      .map((folderId) => folderMap.get(folderId))
      .filter((folder): folder is StudioFolder => Boolean(folder));
  }, [dragSession?.previewIds, folderMap, sortedFolders]);

  useEffect(() => {
    dragSessionRef.current = dragSession;
  }, [dragSession]);

  useEffect(() => {
    if (!dragSession?.active) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragSession?.active]);

  useLayoutEffect(() => {
    const nextTops = new Map<string, number>();

    for (const folder of displayedFolders) {
      const node = rowRefs.current.get(folder.id);
      if (!node) {
        continue;
      }

      const nextTop = node.getBoundingClientRect().top;
      nextTops.set(folder.id, nextTop);

      const previousTop = previousRowTopsRef.current.get(folder.id);
      if (
        previousTop === undefined ||
        Math.abs(previousTop - nextTop) < 1 ||
        dragSession?.folderId === folder.id
      ) {
        continue;
      }

      node.style.transition = "none";
      node.style.transform = `translateY(${previousTop - nextTop}px)`;

      window.requestAnimationFrame(() => {
        node.style.transition =
          "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
        node.style.transform = "";

        window.setTimeout(() => {
          if (rowRefs.current.get(folder.id) === node) {
            node.style.transition = "";
          }
        }, 200);
      });
    }

    previousRowTopsRef.current = nextTops;
  }, [displayedFolders, dragSession?.folderId]);

  useEffect(() => {
    if (!dragSession) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragSessionRef.current?.pointerId) {
        return;
      }

      setDragSession((current) => {
        if (!current || current.pointerId !== event.pointerId) {
          return current;
        }

        const movedEnough =
          Math.abs(event.clientY - current.startY) >= FOLDER_DRAG_THRESHOLD_PX;
        const nextActive = current.active || movedEnough;
        if (!nextActive) {
          return {
            ...current,
            currentY: event.clientY,
          };
        }

        event.preventDefault();

        const orderedWithoutDragged = current.previewIds.filter(
          (folderId) => folderId !== current.folderId
        );
        const draggedCenterY =
          event.clientY - current.pointerOffsetY + current.overlayHeight / 2;

        let insertIndex = orderedWithoutDragged.length;
        for (let index = 0; index < orderedWithoutDragged.length; index += 1) {
          const node = rowRefs.current.get(orderedWithoutDragged[index]);
          if (!node) {
            continue;
          }

          const rect = node.getBoundingClientRect();
          const rowCenterY = rect.top + rect.height / 2;
          if (draggedCenterY < rowCenterY) {
            insertIndex = index;
            break;
          }
        }

        const nextPreviewIds = [...orderedWithoutDragged];
        nextPreviewIds.splice(insertIndex, 0, current.folderId);

        return {
          ...current,
          active: true,
          currentY: event.clientY,
          previewIds: nextPreviewIds,
        };
      });
    };

    const finishDrag = (pointerId: number, commit: boolean) => {
      const current = dragSessionRef.current;
      if (!current || current.pointerId !== pointerId) {
        return;
      }

      const didDrag = current.active;
      const didReorder =
        didDrag &&
        current.previewIds.length === current.initialIds.length &&
        current.previewIds.some(
          (folderId, index) => folderId !== current.initialIds[index]
        );

      setDragSession(null);

      if (didDrag) {
        suppressFolderClickRef.current = true;
        window.setTimeout(() => {
          suppressFolderClickRef.current = false;
        }, 0);
      }

      if (commit && didReorder) {
        onReorderFolders(current.previewIds);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      finishDrag(event.pointerId, true);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      finishDrag(event.pointerId, false);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [dragSession, onReorderFolders]);

  const handleRegisterRowNode = (folderId: string, node: HTMLDivElement | null) => {
    if (node) {
      rowRefs.current.set(folderId, node);
      return;
    }

    rowRefs.current.delete(folderId);
  };

  const handleFolderPointerDown = (
    folderId: string,
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (event.button !== 0) {
      return;
    }

    const eventTarget = event.target as HTMLElement | null;
    if (eventTarget?.closest("[data-folder-menu-root]")) {
      return;
    }

    const node = rowRefs.current.get(folderId);
    if (!node) {
      return;
    }

    const rect = node.getBoundingClientRect();
    const orderedIds = sortedFolders.map((folder) => folder.id);
    suppressFolderClickRef.current = false;

    setDragSession({
      active: false,
      currentY: event.clientY,
      folderId,
      initialIds: orderedIds,
      overlayHeight: rect.height,
      overlayLeft: rect.left,
      overlayWidth: rect.width,
      pointerId: event.pointerId,
      pointerOffsetY: event.clientY - rect.top,
      previewIds: orderedIds,
      startY: event.clientY,
    });
  };

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
                if (suppressFolderClickRef.current) {
                  return;
                }

                onSelectFolder(selectedFolderId === folder.id ? null : folder.id);
              }}
              onDownloadFolder={() => onDownloadFolder(folder.id)}
              onOpenFolder={() => onSelectFolder(folder.id)}
              onPointerDown={(event) => handleFolderPointerDown(folder.id, event)}
              onRegisterNode={(node) => handleRegisterRowNode(folder.id, node)}
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
