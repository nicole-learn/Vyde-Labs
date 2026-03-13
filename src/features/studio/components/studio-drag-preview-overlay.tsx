"use client";

import { AudioLines, Play } from "lucide-react";
import {
  getLibraryItemThumbnailUrl,
  isTransparentImageItem,
} from "../studio-asset-thumbnails";
import { getPreviewMediaKind } from "../studio-preview-utils";
import type { LibraryItem } from "../types";

interface StudioDragPreviewOverlayProps {
  preview: {
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
  } | null;
}

export function StudioDragPreviewOverlay({
  preview,
}: StudioDragPreviewOverlayProps) {
  if (!preview) {
    return null;
  }

  const previewMediaKind = getPreviewMediaKind({
    kind: preview.leadItem.kind,
    mimeType: preview.leadItem.mimeType,
    previewUrl:
      getLibraryItemThumbnailUrl(preview.leadItem) ?? preview.leadItem.previewUrl,
  });
  const thumbnailUrl = getLibraryItemThumbnailUrl(preview.leadItem);

  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-[95]"
      style={{
        transform: `translate3d(${preview.x + 14}px, ${preview.y + 14}px, 0)`,
      }}
    >
      <div className="relative">
        {preview.count > 1 ? (
          <>
            <div className="absolute left-1.5 top-1.5 size-[58px] rounded-2xl bg-black/48 shadow-[0_16px_28px_rgba(0,0,0,0.28)]" />
            <div className="absolute left-0.5 top-0.5 size-[58px] rounded-2xl bg-black/62 shadow-[0_20px_36px_rgba(0,0,0,0.34)]" />
          </>
        ) : null}

        <div className="relative size-[58px] overflow-hidden rounded-2xl border border-white/12 bg-neutral-950 shadow-[0_24px_48px_rgba(0,0,0,0.42)] ring-1 ring-white/5">
          {preview.leadItem.kind === "audio" ? (
            <div className="relative size-full overflow-hidden bg-[linear-gradient(180deg,rgba(9,18,28,0.96),rgba(8,20,34,0.84))]">
              {thumbnailUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnailUrl}
                    alt={preview.leadItem.title}
                    className="size-full object-cover"
                    draggable={false}
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.66)_0%,rgba(0,0,0,0.18)_58%,rgba(0,0,0,0.08)_100%)]" />
                </>
              ) : null}

              <div className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-black/45 p-1.5 backdrop-blur-sm">
                  <AudioLines className="size-4 text-white" />
                </span>
              </div>
            </div>
          ) : preview.leadItem.kind === "image" || preview.leadItem.kind === "video" ? (
            <>
              {thumbnailUrl && previewMediaKind === "image" ? (
                <div
                  className={
                    isTransparentImageItem(preview.leadItem)
                      ? "size-full bg-[linear-gradient(45deg,rgba(255,255,255,0.07)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.07)_75%,rgba(255,255,255,0.07)),linear-gradient(45deg,rgba(255,255,255,0.07)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.07)_75%,rgba(255,255,255,0.07))] bg-[length:18px_18px] [background-position:0_0,9px_9px]"
                      : "size-full"
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnailUrl}
                    alt={preview.leadItem.title}
                    className="size-full object-cover"
                    draggable={false}
                  />
                </div>
              ) : preview.leadItem.previewUrl && previewMediaKind === "video" ? (
                <video
                  src={preview.leadItem.previewUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="size-full object-cover"
                />
              ) : (
                <div className="size-full bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.04))]" />
              )}

              {preview.leadItem.kind === "video" ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/16">
                  <span className="rounded-full bg-black/45 p-1.5 backdrop-blur-sm">
                    <Play className="size-4 text-white" />
                  </span>
                </div>
              ) : null}

              <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0.10)_55%,rgba(0,0,0,0.00)_100%)]" />
            </>
          ) : (
            <div className="flex size-full flex-col justify-between bg-[#f5f0e8] px-3 py-3 text-black">
              <div className="space-y-1.5">
                <span className="block h-1.5 w-8 rounded-full bg-black/12" />
                <span className="block h-1.5 w-10 rounded-full bg-black/16" />
                <span className="block h-1.5 w-6 rounded-full bg-black/12" />
              </div>
              <div className="line-clamp-2 text-[9px] font-medium leading-3 text-black/72">
                {preview.leadItem.contentText || preview.leadItem.prompt || preview.leadItem.title}
              </div>
            </div>
          )}

          {preview.count > 1 ? (
            <div className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--primary)_74%,black)] text-[10px] font-semibold text-primary-foreground shadow-[0_6px_16px_rgba(0,0,0,0.32)]">
              {preview.count}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
