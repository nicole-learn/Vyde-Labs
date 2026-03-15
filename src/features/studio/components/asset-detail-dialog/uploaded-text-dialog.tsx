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
  ActionButton,
  copyTextToClipboard,
  IconButton,
  MetaPills,
  splitAssetMetaPills,
} from "./asset-detail-shared";

export function UploadedTextDialog({
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
  const [copiedText, setCopiedText] = useState(false);
  const metaPills = useMemo(() => splitAssetMetaPills(item.meta), [item.meta]);

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
      <div className="flex h-full items-center justify-center p-2 sm:p-3">
        <div className="flex h-[85vh] min-h-[30rem] max-h-[50rem] w-[90vw] max-w-[72rem] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/95 shadow-2xl supports-backdrop-filter:backdrop-blur-xl">
          <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3">
            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-border/50 hover:bg-foreground/[0.02] focus:border-border/60 focus:bg-foreground/[0.02]"
                placeholder="Untitled text file"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <IconButton
                label="Copy text"
                onClick={async () => {
                  try {
                    await copyTextToClipboard(body);
                    setCopiedText(true);
                    window.setTimeout(() => setCopiedText(false), 1200);
                  } catch {
                    setCopiedText(false);
                  }
                }}
                disabled={!body.trim()}
              >
                <Copy className="size-4" />
              </IconButton>
              <IconButton label="Close" onClick={onClose}>
                <X className="size-4" />
              </IconButton>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-5 pb-5">
            <textarea
              value={body}
              onChange={(event) => onBodyChange(event.target.value)}
              className="min-h-0 flex-1 resize-none rounded-xl border border-border/50 bg-foreground/[0.02] px-3 py-3 font-mono text-[13px] leading-6 text-foreground outline-none"
              placeholder="No text content available."
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

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{createdLabel}</span>
              {copiedText ? <span className="font-medium text-primary">Copied</span> : null}
            </div>

            <div className="mt-3">
              <MetaPills pills={metaPills} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
