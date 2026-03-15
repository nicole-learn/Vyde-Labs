"use client";

import { Play } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { getStudioModelById } from "../../studio-model-catalog";
import type { LibraryItem } from "../../types";

export interface AssetInfoRow {
  label: string;
  value: string;
}

export const ASSET_DETAIL_DIALOG_LAYER_CLASS = "z-[10000]";

export const ASSET_DETAIL_INFO_PANEL_CLASS_NAME =
  "flex min-h-0 flex-col overflow-hidden rounded-2xl bg-background/95 shadow-2xl supports-backdrop-filter:backdrop-blur-xl lg:max-h-[calc(100vh-1.5rem)] lg:self-start";

export function formatAssetCreatedAt(value: string) {
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

function formatMediaDuration(seconds: number | null) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function splitAssetMetaPills(meta: string) {
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

export function copyTextToClipboard(text: string) {
  return navigator.clipboard.writeText(text);
}

export function getLibraryItemModelName(item: LibraryItem) {
  if (!item.modelId) return null;
  return getStudioModelById(item.modelId).name;
}

export function buildAssetInfoRows(item: LibraryItem): AssetInfoRow[] {
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
      value: formatAssetCreatedAt(item.createdAt),
    },
  ];

  if (item.mimeType) {
    rows.push({
      label: "Format",
      value: item.mimeType,
    });
  }

  const durationLabel = formatMediaDuration(item.mediaDurationSeconds);
  if (durationLabel) {
    rows.push({
      label: "Duration",
      value: durationLabel,
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

  if (item.hasAlpha) {
    rows.push({
      label: "Transparency",
      value: "Alpha background",
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

export function IconButton({
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

export function ActionButton({
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

export function MediaStage({ item }: { item: LibraryItem }) {
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
    <div
      className={cn(
        "relative flex max-h-full max-w-full items-center justify-center",
        item.hasAlpha
          ? "bg-[linear-gradient(45deg,rgba(255,255,255,0.09)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.09)_75%,rgba(255,255,255,0.09)),linear-gradient(45deg,rgba(255,255,255,0.09)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.09)_75%,rgba(255,255,255,0.09))] bg-[length:28px_28px] [background-position:0_0,14px_14px]"
          : undefined
      )}
    >
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

export function InfoRows({ rows }: { rows: AssetInfoRow[] }) {
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

export function MetaPills({ pills }: { pills: string[] }) {
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
