"use client";

import {
  AlertTriangle,
  Check,
  Clock3,
  Copy,
  Loader2,
  Play,
  Slash,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  isStudioItemDrag,
  parseDraggedLibraryItemIds,
  setDraggedLibraryItems,
} from "../studio-drag-data";
import {
  getLibraryItemPreviewMediaKind,
} from "../studio-preview-utils";
import type { GenerationRun, LibraryItem } from "../types";

interface StudioGalleryProps {
  allowDropMove?: boolean;
  dragImageRef?: RefObject<HTMLDivElement | null>;
  draggingItemIdSet?: Set<string>;
  emptyStateActionLabel?: string;
  emptyStateLabel: string;
  items: LibraryItem[];
  runCards?: GenerationRun[];
  selectedItemIdSet: Set<string>;
  selectionModeEnabled: boolean;
  sizeLevel: number;
  onDeleteItem: (itemId: string) => void;
  onEmptyStateAction?: () => void;
  onItemDragEnd?: () => void;
  onItemDragStart?: (params: {
    itemIds: string[];
    leadItem: LibraryItem;
    x: number;
    y: number;
  }) => void;
  onMoveDraggedItems?: (itemIds: string[]) => void;
  onOpenItem: (itemId: string) => void;
  onReuseItem: (itemId: string) => void;
  onToggleItemSelection: (itemId: string) => void;
}

interface GalleryRow {
  height: number;
  items: Array<GalleryDisplayItem>;
}

type GalleryDisplayItem =
  | {
      type: "asset";
      item: LibraryItem;
      key: string;
      aspectRatio: number;
    }
  | {
      type: "run";
      run: GenerationRun;
      key: string;
      aspectRatio: number;
    };

const ROW_HEIGHTS = [360, 320, 280, 240, 210, 180, 150];
const TILE_GAP_PX = 3;

interface CardStatusVisual {
  badgeClassName: string;
  icon: LucideIcon;
  label: string;
}

function getRunCardSurfaceClassName(kind: GenerationRun["kind"]) {
  if (kind === "video") {
    return "bg-[linear-gradient(180deg,#08111f_0%,#091b32_52%,#061323_100%)]";
  }

  if (kind === "text") {
    return "bg-[linear-gradient(180deg,#0e1022_0%,#111933_54%,#0a1020_100%)]";
  }

  return "bg-[linear-gradient(180deg,#07131f_0%,#092236_52%,#071725_100%)]";
}

function getRunStatusVisual(status: GenerationRun["status"]): CardStatusVisual {
  if (status === "processing") {
    return {
      badgeClassName: "border-primary/30 bg-primary/14 text-primary-foreground/94",
      icon: Loader2,
      label: "Generating",
    };
  }

  if (status === "queued" || status === "pending") {
    return {
      badgeClassName: "border-white/14 bg-white/[0.08] text-white/84",
      icon: Clock3,
      label: "In Queue",
    };
  }

  if (status === "cancelled") {
    return {
      badgeClassName: "border-amber-400/22 bg-amber-500/12 text-amber-100",
      icon: Slash,
      label: "Cancelled",
    };
  }

  return {
    badgeClassName: "border-red-400/24 bg-red-500/12 text-red-100",
    icon: AlertTriangle,
    label: "Failed",
  };
}

function getAssetStatusVisual(item: LibraryItem): CardStatusVisual | null {
  if (item.source !== "generated") {
    return null;
  }

  if (item.kind === "text") {
    return {
      badgeClassName: "border-black/12 bg-black/[0.06] text-black/72",
      icon: Check,
      label: "Done",
    };
  }

  return {
    badgeClassName: "border-white/14 bg-black/30 text-white/88",
    icon: Check,
    label: "Done",
  };
}

function StatusBadge({
  className,
  icon: Icon,
  label,
  spinning = false,
}: {
  className: string;
  icon: LucideIcon;
  label: string;
  spinning?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] backdrop-blur-sm",
        className
      )}
    >
      <Icon className={cn("size-3", spinning ? "animate-spin" : undefined)} />
      {label}
    </span>
  );
}

function buildRows(items: GalleryDisplayItem[], containerWidth: number, sizeLevel: number) {
  if (containerWidth <= 0 || items.length === 0) {
    return [] satisfies GalleryRow[];
  }

  const targetHeight = ROW_HEIGHTS[sizeLevel] ?? ROW_HEIGHTS[2];
  const minHeight = Math.max(targetHeight * 0.66, 130);
  const maxHeight = targetHeight * 1.16;
  const rows: GalleryRow[] = [];

  let currentRow: GalleryDisplayItem[] = [];
  let aspectRatioSum = 0;

  for (const item of items) {
    currentRow.push(item);
    aspectRatioSum += item.aspectRatio;

    const availableWidth = containerWidth - TILE_GAP_PX * (currentRow.length - 1);
    const rowHeight = availableWidth / aspectRatioSum;
    const shouldCommit =
      rowHeight <= targetHeight || currentRow.length >= 4 || item === items[items.length - 1];

    if (!shouldCommit) {
      continue;
    }

    rows.push({
      items: currentRow,
      height: Math.min(Math.max(rowHeight, minHeight), maxHeight),
    });

    currentRow = [];
    aspectRatioSum = 0;
  }

  return rows;
}

function useMeasuredWidth() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      setWidth(nextWidth);
    });

    observer.observe(container);
    setWidth(container.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, []);

  return { containerRef, width };
}

function AssetTile({
  dragImageRef,
  dragItemIds,
  displayItem,
  isBeingDragged,
  isSelected,
  selectionModeEnabled,
  onDeleteItem,
  onDragEndItem,
  onDragStartItem,
  onReuseItem,
  onOpenItem,
  onToggleItemSelection,
}: {
  dragImageRef?: RefObject<HTMLDivElement | null>;
  dragItemIds: string[];
  displayItem: GalleryDisplayItem;
  isBeingDragged: boolean;
  isSelected: boolean;
  selectionModeEnabled: boolean;
  onDeleteItem: (itemId: string) => void;
  onDragEndItem?: () => void;
  onDragStartItem?: (params: {
    itemIds: string[];
    leadItem: LibraryItem;
    x: number;
    y: number;
  }) => void;
  onOpenItem: (itemId: string) => void;
  onReuseItem: (itemId: string) => void;
  onToggleItemSelection: (itemId: string) => void;
}) {
  if (displayItem.type === "run") {
    const statusVisual = getRunStatusVisual(displayItem.run.status);

    return (
      <div
        className={cn(
          "relative h-full w-full overflow-hidden",
          getRunCardSurfaceClassName(displayItem.run.kind)
        )}
        aria-label={displayItem.run.prompt}
      >
        <span className="pointer-events-none absolute -top-8 left-4 h-24 w-24 rounded-full bg-primary/18 blur-3xl" />
        <span className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-white/[0.05] blur-3xl" />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.54)_0%,rgba(0,0,0,0.28)_42%,rgba(0,0,0,0.12)_100%)]" />

        <div className="relative z-10 flex h-full flex-col justify-between p-3 text-white">
          <div>
            <StatusBadge
              className={statusVisual.badgeClassName}
              icon={statusVisual.icon}
              label={statusVisual.label}
              spinning={displayItem.run.status === "processing"}
            />
          </div>

          <div className="mt-auto">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/62">
              {displayItem.run.modelName}
            </p>
            <p className="mt-1 line-clamp-3 text-[15px] leading-5 text-white">
              {displayItem.run.prompt}
            </p>
            {displayItem.run.errorMessage ? (
              <p className="mt-2 line-clamp-2 text-xs leading-4 text-red-100/88">
                {displayItem.run.errorMessage}
              </p>
            ) : null}
            {typeof displayItem.run.progressPercent === "number" ? (
              <div className="mt-3 space-y-1.5">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/14">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-300",
                      displayItem.run.status === "failed"
                        ? "bg-red-300/85"
                        : "bg-primary"
                    )}
                    style={{
                      width: `${Math.min(
                        Math.max(displayItem.run.progressPercent, 0),
                        100
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/48">
                  {displayItem.run.progressPercent}% complete
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const { item } = displayItem;
  const previewMediaKind = getLibraryItemPreviewMediaKind(item);
  const assetStatusVisual = getAssetStatusVisual(item);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onClick={() => {
        if (selectionModeEnabled) {
          onToggleItemSelection(item.id);
          return;
        }

        onOpenItem(item.id);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (selectionModeEnabled) {
          onToggleItemSelection(item.id);
          return;
        }
        onOpenItem(item.id);
      }}
      onDragStart={(event) => {
        if (dragImageRef?.current) {
          event.dataTransfer.setDragImage(dragImageRef.current, 0, 0);
        }

        setDraggedLibraryItems(event.dataTransfer, {
          itemIds: dragItemIds,
          leadItem: item,
          sourceFolderId: item.folderId,
        });
        onDragStartItem?.({
          itemIds: dragItemIds,
          leadItem: item,
          x: event.clientX,
          y: event.clientY,
        });
      }}
      onDragEnd={() => onDragEndItem?.()}
      className={cn(
        "group relative h-full w-full overflow-hidden outline-none transition focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        selectionModeEnabled ? "cursor-crosshair" : "cursor-default",
        isBeingDragged ? "scale-[0.985] opacity-30" : undefined,
        isSelected ? "ring-2 ring-primary/85 ring-inset" : undefined,
        item.kind === "text"
          ? "bg-[#f5f0e8] text-black dark:bg-[#f5f0e8] dark:text-black"
          : "bg-muted/40"
      )}
      aria-label={item.prompt || item.title}
    >
      {assetStatusVisual ? (
        <div className="pointer-events-none absolute left-3 top-3 z-20">
          <StatusBadge
            className={assetStatusVisual.badgeClassName}
            icon={assetStatusVisual.icon}
            label={assetStatusVisual.label}
          />
        </div>
      ) : null}

      {previewMediaKind === "image" && item.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnailUrl ?? item.previewUrl}
          alt={item.title}
          className="size-full object-cover"
        />
      ) : previewMediaKind === "video" && item.previewUrl ? (
        <div className="relative size-full">
          <video
            src={item.previewUrl}
            muted
            playsInline
            preload="metadata"
            className="size-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/45 p-1.5 backdrop-blur-sm">
              <Play className="size-4 text-white" />
            </span>
          </div>
        </div>
      ) : item.kind === "text" ? (
        <div className="flex size-full flex-col p-4 pt-12">
          <p className="line-clamp-8 text-sm leading-6 text-black/82">
            {item.contentText || item.prompt || item.title}
          </p>
          <div className="mt-auto pt-4 text-[11px] uppercase tracking-[0.16em] text-black/52">
            {item.source === "generated" ? item.meta : item.source}
          </div>
        </div>
      ) : (
        <div className="flex size-full items-center justify-center bg-[linear-gradient(to_bottom,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] text-white/60">
          {item.title}
        </div>
      )}

      {item.kind !== "text" ? (
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.28)_46%,rgba(0,0,0,0.10)_100%)]" />
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
        <div
          className={cn(
            "pointer-events-none flex items-end justify-between gap-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
            selectionModeEnabled ? "opacity-100" : undefined
          )}
        >
          <div className="min-w-0">
            <p
              className={cn(
                "truncate text-sm font-medium",
                item.kind === "text" ? "text-black/90" : "text-white"
              )}
            >
              {item.title}
            </p>
            <p
              className={cn(
                "mt-0.5 truncate text-xs",
                item.kind === "text" ? "text-black/56" : "text-white/62"
              )}
            >
              {item.meta}
            </p>
          </div>

          <div className="pointer-events-auto flex items-center gap-1">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onReuseItem(item.id);
              }}
              className="flex size-8 items-center justify-center rounded-md bg-black/55 text-white/90 backdrop-blur-sm transition hover:bg-black/70"
              aria-label={`Reuse ${item.title}`}
            >
              <Copy className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDeleteItem(item.id);
              }}
              className="flex size-8 items-center justify-center rounded-md bg-black/55 text-white/90 backdrop-blur-sm transition hover:bg-red-500/80"
              aria-label={`Delete ${item.title}`}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {selectionModeEnabled ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleItemSelection(item.id);
          }}
          className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-sm"
        >
          {isSelected ? "Selected" : "Select"}
        </button>
      ) : null}
    </div>
  );
}

export function StudioGallery({
  allowDropMove = false,
  dragImageRef,
  draggingItemIdSet,
  emptyStateActionLabel,
  emptyStateLabel,
  items,
  runCards = [],
  selectedItemIdSet,
  selectionModeEnabled,
  sizeLevel,
  onDeleteItem,
  onEmptyStateAction,
  onItemDragEnd,
  onItemDragStart,
  onMoveDraggedItems,
  onOpenItem,
  onReuseItem,
  onToggleItemSelection,
}: StudioGalleryProps) {
  const { containerRef, width } = useMeasuredWidth();
  const [dropActive, setDropActive] = useState(false);

  const galleryItems = useMemo(() => {
    const outputItems = items.map(
      (item): GalleryDisplayItem => ({
        type: "asset",
        item,
        key: item.id,
        aspectRatio: item.aspectRatio,
      })
    );
    const runDisplayItems = runCards.map(
      (run): GalleryDisplayItem => ({
        type: "run",
        run,
        key: run.id,
        aspectRatio: run.kind === "video" ? 16 / 9 : run.kind === "text" ? 0.82 : 4 / 5,
      })
    );

    return [...runDisplayItems, ...outputItems];
  }, [items, runCards]);

  const rows = useMemo(
    () => buildRows(galleryItems, Math.max(width - 24, 0), sizeLevel),
    [galleryItems, sizeLevel, width]
  );

  return (
    <div
      className="relative flex h-full min-h-0 min-w-0 flex-col bg-background"
      onDragEnter={(event) => {
        if (!allowDropMove || !onMoveDraggedItems) return;
        if (!isStudioItemDrag(event.dataTransfer)) return;
        event.preventDefault();
      }}
      onDragOver={(event) => {
        if (!allowDropMove || !onMoveDraggedItems) return;
        if (!isStudioItemDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropActive(true);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (nextTarget && event.currentTarget.contains(nextTarget)) return;
        setDropActive(false);
      }}
      onDrop={(event) => {
        if (!allowDropMove || !onMoveDraggedItems) return;
        event.preventDefault();
        setDropActive(false);
        const itemIds = parseDraggedLibraryItemIds(event.dataTransfer);
        onMoveDraggedItems(itemIds);
      }}
    >
      <div
        ref={containerRef}
        className="stable-scrollbar min-w-0 flex-1 overflow-y-auto overscroll-contain pb-48 bg-background px-3 pt-3"
      >
        {galleryItems.length === 0 ? (
          <div className="flex min-h-full items-center justify-center bg-background p-6">
            {emptyStateActionLabel && onEmptyStateAction ? (
              <div className="flex w-full max-w-md flex-col items-center px-7 py-8 text-center">
                <p className="max-w-[20rem] text-sm font-medium text-foreground text-balance">
                  {emptyStateLabel}
                </p>
                <button
                  type="button"
                  onClick={onEmptyStateAction}
                  className="mt-4 rounded-full border border-border/70 bg-background/95 px-4 py-2 text-sm shadow-sm transition hover:bg-background"
                >
                  {emptyStateActionLabel}
                </button>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">{emptyStateLabel}</div>
            )}
          </div>
        ) : (
          <div className="space-y-[3px]">
            {rows.map((row, rowIndex) => (
              <div key={`row-${rowIndex}`} className="flex gap-[3px]">
                {row.items.map((displayItem) => {
                  const widthPx = Math.max(1, row.height * displayItem.aspectRatio);
                  const itemId =
                    displayItem.type === "asset" ? displayItem.item.id : displayItem.run.id;
                  const dragItemIds =
                    displayItem.type === "asset" &&
                    selectedItemIdSet.has(displayItem.item.id) &&
                    selectedItemIdSet.size > 1
                      ? Array.from(selectedItemIdSet)
                      : displayItem.type === "asset"
                        ? [displayItem.item.id]
                        : [];

                  return (
                    <div
                      key={displayItem.key}
                      className="group shrink-0"
                      style={{
                        width: `${widthPx}px`,
                        height: `${row.height}px`,
                      }}
                    >
                      <AssetTile
                        dragImageRef={dragImageRef}
                        dragItemIds={dragItemIds}
                        displayItem={displayItem}
                        isBeingDragged={
                          displayItem.type === "asset"
                            ? draggingItemIdSet?.has(displayItem.item.id) ?? false
                            : false
                        }
                        isSelected={selectedItemIdSet.has(itemId)}
                        selectionModeEnabled={selectionModeEnabled}
                        onDeleteItem={onDeleteItem}
                        onDragEndItem={onItemDragEnd}
                        onDragStartItem={onItemDragStart}
                        onOpenItem={onOpenItem}
                        onReuseItem={onReuseItem}
                        onToggleItemSelection={onToggleItemSelection}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {dropActive ? (
        <div className="pointer-events-none absolute inset-0 z-30 border border-primary/60 bg-primary/5" />
      ) : null}
    </div>
  );
}
