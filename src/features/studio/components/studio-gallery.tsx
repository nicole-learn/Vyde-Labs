"use client";

import { Copy, Loader2, Play, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { GenerationRun, LibraryItem } from "../types";

interface StudioGalleryProps {
  allowUngroupDrop?: boolean;
  emptyStateActionLabel?: string;
  emptyStateLabel: string;
  items: LibraryItem[];
  pendingRuns?: GenerationRun[];
  selectedItemIdSet: Set<string>;
  selectionModeEnabled: boolean;
  sizeLevel: number;
  onDeleteItem: (itemId: string) => void;
  onEmptyStateAction?: () => void;
  onMoveDraggedItems?: (itemIds: string[]) => void;
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
      type: "pending";
      run: GenerationRun;
      key: string;
      aspectRatio: number;
    };

const ROW_HEIGHTS = [360, 320, 280, 240, 210, 180, 150];
const TILE_GAP_PX = 3;

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
  displayItem,
  isSelected,
  selectionModeEnabled,
  onDeleteItem,
  onReuseItem,
  onToggleItemSelection,
}: {
  displayItem: GalleryDisplayItem;
  isSelected: boolean;
  selectionModeEnabled: boolean;
  onDeleteItem: (itemId: string) => void;
  onReuseItem: (itemId: string) => void;
  onToggleItemSelection: (itemId: string) => void;
}) {
  if (displayItem.type === "pending") {
    return (
      <div
        className="relative h-full w-full overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800"
        aria-label={displayItem.run.prompt}
      >
        <span className="pointer-events-none absolute -top-9 -left-9 h-28 w-28 rounded-full bg-cyan-300/25 blur-2xl" />
        <span className="pointer-events-none absolute -right-10 -bottom-10 h-32 w-32 rounded-full bg-sky-500/20 blur-3xl" />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.32)_46%,rgba(0,0,0,0.16)_100%)]" />

        <div className="relative z-10 flex h-full flex-col p-2.5 text-white">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/28 bg-black/30 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm">
            <Loader2 className="size-3 animate-spin" />
            Generating
          </span>
          <div className="mt-auto">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/72">
              {displayItem.run.modelName}
            </p>
            <p className="mt-1 line-clamp-3 text-sm leading-5 text-white">
              {displayItem.run.prompt}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { item } = displayItem;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!selectionModeEnabled}
      onClick={() => {
        if (selectionModeEnabled) {
          onToggleItemSelection(item.id);
        }
      }}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
          "application/vnd.vydelabs.items",
          JSON.stringify([item.id])
        );
      }}
      className={cn(
        "group relative h-full w-full overflow-hidden outline-none transition focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        selectionModeEnabled ? "cursor-crosshair" : "cursor-default",
        isSelected ? "ring-2 ring-primary/85 ring-inset" : undefined,
        item.kind === "text"
          ? "bg-[#f5f0e8] text-black dark:bg-[#f5f0e8] dark:text-black"
          : "bg-muted/40"
      )}
      aria-label={item.prompt || item.title}
    >
      {item.kind === "image" && item.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.previewUrl} alt={item.title} className="size-full object-cover" />
      ) : item.kind === "video" && item.previewUrl ? (
        <div className="relative size-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.previewUrl} alt={item.title} className="size-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/45 p-1.5 backdrop-blur-sm">
              <Play className="size-4 text-white" />
            </span>
          </div>
        </div>
      ) : item.kind === "text" ? (
        <div className="flex size-full flex-col p-4">
          <p className="line-clamp-8 text-sm leading-6 text-black/82">
            {item.contentText || item.prompt || item.title}
          </p>
          <div className="mt-auto pt-4 text-[11px] uppercase tracking-[0.16em] text-black/52">
            {item.source}
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
  allowUngroupDrop = false,
  emptyStateActionLabel,
  emptyStateLabel,
  items,
  pendingRuns = [],
  selectedItemIdSet,
  selectionModeEnabled,
  sizeLevel,
  onDeleteItem,
  onEmptyStateAction,
  onMoveDraggedItems,
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
    const pendingItems = pendingRuns.map(
      (run): GalleryDisplayItem => ({
        type: "pending",
        run,
        key: run.id,
        aspectRatio: run.kind === "video" ? 16 / 9 : run.kind === "text" ? 0.82 : 4 / 5,
      })
    );

    return [...pendingItems, ...outputItems];
  }, [items, pendingRuns]);

  const rows = useMemo(
    () => buildRows(galleryItems, Math.max(width - 24, 0), sizeLevel),
    [galleryItems, sizeLevel, width]
  );

  return (
    <div
      className="relative flex h-full min-h-0 min-w-0 flex-col bg-background"
      onDragEnter={(event) => {
        if (!allowUngroupDrop || !onMoveDraggedItems) return;
        if (!event.dataTransfer.types.includes("application/vnd.vydelabs.items")) return;
        event.preventDefault();
      }}
      onDragOver={(event) => {
        if (!allowUngroupDrop || !onMoveDraggedItems) return;
        if (!event.dataTransfer.types.includes("application/vnd.vydelabs.items")) return;
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
        if (!allowUngroupDrop || !onMoveDraggedItems) return;
        event.preventDefault();
        setDropActive(false);
        const itemIds = parseDraggedItemIds(event.dataTransfer);
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
                        displayItem={displayItem}
                        isSelected={selectedItemIdSet.has(itemId)}
                        selectionModeEnabled={selectionModeEnabled}
                        onDeleteItem={onDeleteItem}
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
