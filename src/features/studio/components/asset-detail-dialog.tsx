"use client";

import {
  Copy,
  Download,
  Play,
  Save,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { getStudioModelById } from "../studio-model-catalog";
import type { LibraryItem } from "../types";

interface AssetDetailDialogProps {
  item: LibraryItem | null;
  open: boolean;
  onClose: () => void;
  onDelete: (itemId: string) => void;
  onDownload: (item: LibraryItem) => void;
  onReuse: (itemId: string) => void;
  onSaveText: (
    itemId: string,
    patch: { title?: string; contentText?: string }
  ) => void;
}

interface AssetInfoRow {
  label: string;
  value: string;
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatByteSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function splitMetaPills(meta: string) {
  return meta
    .split("•")
    .map((part) => part.trim())
    .filter(Boolean);
}

function isPlayableVideoUrl(url: string | null) {
  if (!url) return false;
  return (
    url.startsWith("blob:") ||
    url.startsWith("data:video") ||
    url.endsWith(".mp4") ||
    url.endsWith(".webm") ||
    url.endsWith(".mov")
  );
}

function copyToClipboard(text: string) {
  return navigator.clipboard.writeText(text);
}

function getItemModelName(item: LibraryItem) {
  if (!item.modelId) return null;
  return getStudioModelById(item.modelId).name;
}

function buildInfoRows(item: LibraryItem): AssetInfoRow[] {
  const rows: AssetInfoRow[] = [
    {
      label: "Type",
      value: item.kind.charAt(0).toUpperCase() + item.kind.slice(1),
    },
    {
      label: "Source",
      value: item.source.charAt(0).toUpperCase() + item.source.slice(1),
    },
    {
      label: "Created",
      value: formatCreatedAt(item.createdAt),
    },
  ];

  if (item.mimeType) {
    rows.push({
      label: "Format",
      value: item.mimeType,
    });
  }

  if (item.mediaWidth && item.mediaHeight) {
    rows.push({
      label: "Dimensions",
      value: `${item.mediaWidth} x ${item.mediaHeight}`,
    });
  }

  if (item.aspectRatioLabel) {
    rows.push({
      label: "Aspect Ratio",
      value: item.aspectRatioLabel,
    });
  }

  const byteSizeLabel = formatByteSize(item.byteSize);
  if (byteSizeLabel) {
    rows.push({
      label: "Size",
      value: byteSizeLabel,
    });
  }

  return rows;
}

function IconButton({
  className,
  disabled = false,
  label,
  onClick,
  children,
}: {
  className?: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-40",
        className
      )}
    >
      {children}
    </button>
  );
}

function ActionButton({
  className,
  disabled = false,
  onClick,
  tone = "secondary",
  children,
}: {
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  tone?: "secondary" | "primary" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-w-0 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition disabled:opacity-40",
        tone === "primary"
          ? "bg-primary text-primary-foreground hover:brightness-110"
          : tone === "danger"
            ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
            : "border border-white/10 bg-white/[0.03] text-foreground hover:bg-white/[0.06]",
        className
      )}
    >
      {children}
    </button>
  );
}

function MediaStage({
  item,
}: {
  item: LibraryItem;
}) {
  if (!item.previewUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-black/30 text-sm text-white/55">
        Preview unavailable
      </div>
    );
  }

  if (item.kind === "video" && isPlayableVideoUrl(item.previewUrl)) {
    return (
      <video
        src={item.previewUrl}
        controls
        autoPlay
        playsInline
        className="max-h-full max-w-full rounded-[10px] object-contain"
      />
    );
  }

  return (
    <div className="relative flex max-h-full max-w-full items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.previewUrl}
        alt={item.title}
        className="max-h-full max-w-full rounded-[10px] object-contain"
      />
      {item.kind === "video" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/40 p-3 text-white shadow-xl backdrop-blur-sm">
            <Play className="size-6" />
          </span>
        </div>
      ) : null}
    </div>
  );
}

function InfoRows({ rows }: { rows: AssetInfoRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={`${row.label}:${row.value}`}
          className="flex items-start justify-between gap-4"
        >
          <span className="text-xs text-muted-foreground">{row.label}</span>
          <span className="max-w-[65%] break-words text-right text-xs font-medium text-foreground">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function MetaPills({ pills }: { pills: string[] }) {
  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((pill) => (
        <span
          key={pill}
          className="inline-flex rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-foreground/82"
        >
          {pill}
        </span>
      ))}
    </div>
  );
}

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
  const modelName = getItemModelName(item);
  const title = item.source === "generated" ? modelName ?? item.title : item.title;
  const subtitle = item.source === "generated" ? formatCreatedAt(item.createdAt) : null;
  const infoRows = buildInfoRows(item);
  const promptText =
    item.source === "generated" ? item.prompt.trim() : item.title.trim();

  return (
    <aside className="flex min-h-0 flex-col bg-background/95 shadow-2xl supports-backdrop-filter:backdrop-blur-xl">
      <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-1">
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

      <div className="stable-scrollbar flex-1 space-y-4 overflow-y-auto px-5 pt-3 pb-5">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {item.source === "generated" ? "Prompt" : "Name"}
            </p>
            <IconButton
              label={item.source === "generated" ? "Copy prompt" : "Copy name"}
              onClick={async () => {
                try {
                  await copyToClipboard(promptText || item.title);
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

function MediaAssetDialog({
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
  const metaPills = useMemo(() => splitMetaPills(item.meta), [item.meta]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[90] bg-black/50 p-0",
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
  const metaPills = useMemo(() => splitMetaPills(item.meta), [item.meta]);
  const modelName = getItemModelName(item) ?? item.title;

  return (
    <div className="stable-scrollbar hidden h-[85vh] min-h-[30rem] max-h-[50rem] w-[360px] shrink-0 flex-col overflow-y-auto rounded-2xl bg-background/95 shadow-2xl supports-backdrop-filter:backdrop-blur-xl lg:flex">
      <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-1">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{modelName}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{createdLabel}</p>
        </div>
        <IconButton label="Close" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>

      <div className="flex-1 space-y-4 px-5 pt-3 pb-5">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Prompt</p>
            <IconButton
              label="Copy prompt"
              onClick={async () => {
                try {
                  await copyToClipboard(item.prompt || "");
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

function GeneratedTextDialog({
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
      className="fixed inset-0 z-[90] bg-black/50 supports-backdrop-filter:backdrop-blur-sm"
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
                  await copyToClipboard(body.trim());
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

function UploadedTextDialog({
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
  const metaPills = useMemo(() => splitMetaPills(item.meta), [item.meta]);

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/50 supports-backdrop-filter:backdrop-blur-sm"
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
                    await copyToClipboard(body);
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

export function AssetDetailDialog({
  item,
  open,
  onClose,
  onDelete,
  onDownload,
  onReuse,
  onSaveText,
}: AssetDetailDialogProps) {
  const [draftTitle, setDraftTitle] = useState(() => item?.title ?? "");
  const [draftBody, setDraftBody] = useState(
    () => item?.contentText ?? item?.prompt ?? ""
  );

  if (!open || !item) return null;

  const createdLabel = formatCreatedAt(item.createdAt);
  const dirty =
    draftTitle.trim() !== item.title.trim() ||
    draftBody.trim() !== (item.contentText ?? item.prompt ?? "").trim();

  const handleSave = () => {
    onSaveText(item.id, {
      title: draftTitle,
      contentText: draftBody,
    });
  };

  if (item.kind === "image" || item.kind === "video") {
    return (
      <MediaAssetDialog
        item={item}
        onClose={onClose}
        onDelete={() => onDelete(item.id)}
        onDownload={() => onDownload(item)}
        onReuse={() => onReuse(item.id)}
      />
    );
  }

  if (item.source === "generated") {
    return (
      <GeneratedTextDialog
        body={draftBody}
        createdLabel={createdLabel}
        dirty={dirty}
        item={item}
        onBodyChange={setDraftBody}
        onClose={onClose}
        onDelete={() => onDelete(item.id)}
        onDownload={() => onDownload(item)}
        onReuse={() => onReuse(item.id)}
        onSave={handleSave}
        onTitleChange={setDraftTitle}
        title={draftTitle}
      />
    );
  }

  return (
    <UploadedTextDialog
      body={draftBody}
      createdLabel={createdLabel}
      dirty={dirty}
      item={item}
      onBodyChange={setDraftBody}
      onClose={onClose}
      onDelete={() => onDelete(item.id)}
      onDownload={() => onDownload(item)}
      onReuse={() => onReuse(item.id)}
      onSave={handleSave}
      onTitleChange={setDraftTitle}
      title={draftTitle}
    />
  );
}
