"use client";

import {
  Copy,
  Download,
  Save,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { LibraryItem } from "../../types";
import {
  ASSET_DETAIL_DIALOG_LAYER_CLASS,
  ASSET_DETAIL_INFO_PANEL_CLASS_NAME,
  ActionButton,
  copyTextToClipboard,
  getLibraryItemModelName,
  IconButton,
  MetaPills,
  splitAssetMetaPills,
} from "./asset-detail-shared";

function GeneratedTextInfoPanel({
  createdLabel,
  item,
  onClose,
  onDelete,
  onDownload,
  onReuse,
}: {
  createdLabel: string;
  item: LibraryItem;
  onClose: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onReuse: () => void;
}) {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const metaPills = useMemo(() => splitAssetMetaPills(item.meta), [item.meta]);
  const modelName = getLibraryItemModelName(item) ?? item.title;

  return (
    <div
      className={cn(
        ASSET_DETAIL_INFO_PANEL_CLASS_NAME,
        "stable-scrollbar hidden w-[360px] shrink-0 rounded-2xl lg:flex"
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-1 pt-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{modelName}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{createdLabel}</p>
        </div>
        <IconButton label="Close" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>

      <div className="stable-scrollbar flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-3">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Prompt</p>
            <IconButton
              label="Copy prompt"
              onClick={async () => {
                try {
                  await copyTextToClipboard(item.prompt || "");
                  setCopiedPrompt(true);
                  window.setTimeout(() => setCopiedPrompt(false), 1200);
                } catch {
                  setCopiedPrompt(false);
                }
              }}
              disabled={!item.prompt.trim()}
            >
              <Copy className="size-3.5" />
            </IconButton>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {item.prompt.trim() || "No prompt available."}
          </p>
          {copiedPrompt ? (
            <p className="mt-2 text-[11px] font-medium text-primary">Copied</p>
          ) : null}
        </div>

        <MetaPills pills={metaPills} />
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
    </div>
  );
}

export function GeneratedTextDialog({
  body,
  createdLabel,
  dirty,
  item,
  onBodyChange,
  onClose,
  onDelete,
  onDownload,
  onReuse,
  onSave,
  onTitleChange,
  title,
}: {
  body: string;
  createdLabel: string;
  dirty: boolean;
  item: LibraryItem;
  onBodyChange: (value: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onReuse: () => void;
  onSave: () => void;
  onTitleChange: (value: string) => void;
  title: string;
}) {
  const [copiedOutput, setCopiedOutput] = useState(false);

  return (
    <div
      className={cn(
        "fixed inset-0 bg-black/50 supports-backdrop-filter:backdrop-blur-sm",
        ASSET_DETAIL_DIALOG_LAYER_CLASS
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex h-full min-h-0 items-center justify-center gap-3 p-2 sm:p-3">
        <div className="flex h-[85vh] min-h-[30rem] max-h-[50rem] w-[90vw] max-w-md flex-col overflow-hidden rounded-2xl bg-background/95 shadow-2xl supports-backdrop-filter:backdrop-blur-xl sm:max-w-lg">
          <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3">
            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-border/50 hover:bg-foreground/[0.02] focus:border-border/60 focus:bg-foreground/[0.02]"
                placeholder="Untitled"
              />
            </div>
            <IconButton
              label="Copy output"
              onClick={async () => {
                try {
                  await copyTextToClipboard(body.trim());
                  setCopiedOutput(true);
                  window.setTimeout(() => setCopiedOutput(false), 1200);
                } catch {
                  setCopiedOutput(false);
                }
              }}
              disabled={!body.trim()}
            >
              <Copy className="size-4" />
            </IconButton>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-5 pb-5">
            <textarea
              value={body}
              onChange={(event) => onBodyChange(event.target.value)}
              className="min-h-0 flex-1 resize-none rounded-xl border border-border/50 bg-foreground/[0.02] px-3 py-3 font-mono text-[13px] leading-6 text-foreground outline-none"
              placeholder="No output returned yet."
            />

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ActionButton
                tone="danger"
                className="px-2.5"
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Delete</span>
              </ActionButton>
              <ActionButton onClick={onReuse}>
                <WandSparkles className="size-3.5" />
                Reuse
              </ActionButton>
              {dirty ? (
                <ActionButton onClick={onSave}>
                  <Save className="size-3.5" />
                  Save Changes
                </ActionButton>
              ) : null}
              <ActionButton tone="primary" onClick={onDownload}>
                <Download className="size-3.5" />
                Download
              </ActionButton>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{createdLabel}</span>
              <span className="font-medium text-primary">
                {copiedOutput ? "Copied" : ""}
              </span>
            </div>
          </div>
        </div>

        <GeneratedTextInfoPanel
          createdLabel={createdLabel}
          item={item}
          onClose={onClose}
          onDelete={onDelete}
          onDownload={onDownload}
          onReuse={onReuse}
        />
      </div>
    </div>
  );
}
