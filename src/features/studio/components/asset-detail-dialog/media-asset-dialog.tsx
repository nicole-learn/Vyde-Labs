"use client";

import { Copy, Download, Trash2, WandSparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { LibraryItem } from "../../types";
import {
  ASSET_DETAIL_DIALOG_LAYER_CLASS,
  ASSET_DETAIL_INFO_PANEL_CLASS_NAME,
  ActionButton,
  buildAssetInfoRows,
  copyTextToClipboard,
  formatAssetCreatedAt,
  getLibraryItemModelName,
  IconButton,
  InfoRows,
  MediaStage,
  MetaPills,
  splitAssetMetaPills,
} from "./asset-detail-shared";

function MediaInfoPanel({
  item,
  metaPills,
  onClose,
  onDelete,
  onDownload,
  onReuse,
}: {
  item: LibraryItem;
  metaPills: string[];
  onClose: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onReuse: () => void;
}) {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const modelName = getLibraryItemModelName(item);
  const title = item.source === "generated" ? modelName ?? item.title : item.title;
  const subtitle =
    item.source === "generated" ? formatAssetCreatedAt(item.createdAt) : null;
  const infoRows = buildAssetInfoRows(item);
  const promptText =
    item.source === "generated" ? item.prompt.trim() : item.title.trim();

  return (
    <aside className={ASSET_DETAIL_INFO_PANEL_CLASS_NAME}>
      <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-1 pt-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <IconButton label="Close" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>

      <div className="stable-scrollbar flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-3">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {item.source === "generated" ? "Prompt" : "Name"}
            </p>
            <IconButton
              label={item.source === "generated" ? "Copy prompt" : "Copy name"}
              onClick={async () => {
                try {
                  await copyTextToClipboard(promptText || item.title);
                  setCopiedPrompt(true);
                  window.setTimeout(() => setCopiedPrompt(false), 1200);
                } catch {
                  setCopiedPrompt(false);
                }
              }}
              disabled={!promptText}
            >
              <Copy className="size-3.5" />
            </IconButton>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {promptText || "No prompt available."}
          </p>
          {copiedPrompt ? (
            <p className="mt-2 text-[11px] font-medium text-primary">Copied</p>
          ) : null}
        </div>

        <MetaPills pills={metaPills} />
        <InfoRows rows={infoRows} />
      </div>

      <div className="shrink-0 px-5 py-4">
        <div className="flex items-center gap-2">
          <ActionButton
            tone="danger"
            className="shrink-0 px-2.5"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
            <span className="sr-only">Delete</span>
          </ActionButton>
          <ActionButton className="flex-1" onClick={onReuse}>
            <WandSparkles className="size-3.5" />
            Reuse
          </ActionButton>
          <ActionButton tone="primary" className="flex-1" onClick={onDownload}>
            <Download className="size-3.5" />
            Download
          </ActionButton>
        </div>
      </div>
    </aside>
  );
}

export function MediaAssetDialog({
  item,
  onClose,
  onDelete,
  onDownload,
  onReuse,
}: {
  item: LibraryItem;
  onClose: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onReuse: () => void;
}) {
  const metaPills = useMemo(() => splitAssetMetaPills(item.meta), [item.meta]);

  return (
    <div
      className={cn(
        "fixed inset-0 bg-black/50 p-0",
        ASSET_DETAIL_DIALOG_LAYER_CLASS,
        item.kind === "video"
          ? "supports-backdrop-filter:backdrop-blur-none"
          : "supports-backdrop-filter:backdrop-blur-sm"
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1">
        <div className="min-h-0 p-2 sm:p-3">
          <div className="flex h-full min-h-0 items-center justify-center overflow-hidden rounded-xl bg-transparent p-1 sm:p-1.5">
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[10px] bg-transparent">
              <MediaStage item={item} />
            </div>
          </div>
        </div>

        <MediaInfoPanel
          item={item}
          metaPills={metaPills}
          onClose={onClose}
          onDelete={onDelete}
          onDownload={onDownload}
          onReuse={onReuse}
        />
      </div>
    </div>
  );
}
