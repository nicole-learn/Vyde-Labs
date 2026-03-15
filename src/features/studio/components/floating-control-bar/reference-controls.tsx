"use client";

import { AudioLines, FileText, Play, Plus, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { cn } from "@/lib/cn";
import { STUDIO_MEDIA_UPLOAD_ACCEPT } from "../../studio-local-runtime-helpers";
import { getDraftReferencePreviewMediaKind } from "../../studio-preview-utils";
import type {
  DraftReference,
  StudioModelDefinition,
} from "../../types";

type ReferencePreviewKind = "image" | "video" | "file";

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "m4a",
  "aac",
  "ogg",
  "flac",
  "aiff",
  "aif",
  "opus",
]);

const DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
]);

export function AddReferenceButton({
  acceptTypes,
  canAdd,
  onAdd,
  variant = "small",
}: {
  acceptTypes: string;
  canAdd: boolean;
  onAdd: (files: File[]) => void;
  variant?: "small" | "thumbnail";
}) {
  return (
    <label
      className={cn(
        "flex shrink-0 items-center justify-center border border-dashed border-border/70 text-muted-foreground transition-colors",
        canAdd
          ? "cursor-pointer hover:bg-muted/50 hover:text-foreground"
          : "cursor-not-allowed opacity-50",
        variant === "thumbnail" ? "size-14 rounded-lg" : "size-7 rounded-md"
      )}
      aria-label="Add reference file"
      title="Add reference file"
    >
      <input
        type="file"
        accept={acceptTypes}
        multiple
        className="hidden"
        disabled={!canAdd}
        onChange={(event) => {
          onAdd(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <Plus className={variant === "thumbnail" ? "size-5" : "size-3.5"} />
    </label>
  );
}

export function BackgroundRemovalInputSurface({
  acceptTypes,
  canAdd,
  onAdd,
  onPreviewReference,
  onRemove,
  reference,
}: {
  acceptTypes: string;
  canAdd: boolean;
  onAdd: (files: File[]) => void;
  onPreviewReference: (reference: DraftReference) => void;
  onRemove: () => void;
  reference: DraftReference | null;
}) {
  const previewKind = reference ? getReferencePreviewKind(reference) : "file";
  const previewUrl =
    reference && previewKind !== "file" ? reference.previewUrl : null;

  if (!reference) {
    return (
      <label
        className={cn(
          "flex min-h-[3.25rem] w-full items-center rounded-xl px-2 py-1 text-sm font-semibold uppercase tracking-[0.12em] transition-colors",
          canAdd
            ? "cursor-pointer text-foreground/74 hover:bg-white/[0.04]"
            : "cursor-not-allowed text-foreground/40"
        )}
      >
        <input
          type="file"
          accept={acceptTypes}
          multiple
          className="hidden"
          disabled={!canAdd}
          onChange={(event) => {
            onAdd(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <span>ADD AN IMAGE HERE TO REMOVE THE BACKGROUND FOR IT.</span>
      </label>
    );
  }

  return (
    <div className="flex min-h-[3.25rem] w-full items-center px-2 py-1">
      <div
        className="group relative size-16 shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-muted/70 transition-transform duration-200 hover:scale-[1.02]"
        title={reference.title}
      >
        <button
          type="button"
          onClick={() => onPreviewReference(reference)}
          className="absolute inset-0 z-10 cursor-zoom-in rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label={`Preview ${reference.title}`}
        />

        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={reference.title}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted/80">
            <FileText className="size-4 text-muted-foreground/60" />
          </div>
        )}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="absolute right-0 top-0 z-20 flex size-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-black/85 group-hover:opacity-100 group-focus-within:opacity-100"
          aria-label={`Remove ${reference.title}`}
        >
          <X className="size-3 text-white" />
        </button>
      </div>
    </div>
  );
}

function getReferencePreviewKind(
  reference: Pick<DraftReference, "kind" | "mimeType" | "previewUrl">
): ReferencePreviewKind {
  return getDraftReferencePreviewMediaKind(reference);
}

function getFileExtension(fileName: string): string | null {
  const trimmed = fileName.trim().toLowerCase();
  if (!trimmed.includes(".")) return null;
  return trimmed.split(".").pop()?.trim() ?? null;
}

export function getSupportedReferenceAcceptTypes(model: StudioModelDefinition) {
  const acceptedKinds = model.acceptedReferenceKinds ?? ["image", "video"];
  const acceptParts: string[] = [];

  if (acceptedKinds.includes("image")) {
    acceptParts.push("image/*");
  }
  if (acceptedKinds.includes("video")) {
    acceptParts.push("video/*");
  }
  if (acceptedKinds.includes("audio")) {
    acceptParts.push("audio/*");
  }
  if (acceptedKinds.includes("document")) {
    acceptParts.push(
      ".pdf",
      ".txt",
      ".md",
      ".markdown",
      ".csv",
      ".json",
      "application/pdf",
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json"
    );
  }

  return acceptParts.length > 0
    ? Array.from(new Set(acceptParts)).join(",")
    : STUDIO_MEDIA_UPLOAD_ACCEPT;
}

export function isReferenceFileSupported(
  model: StudioModelDefinition,
  file: File
) {
  const mimeType = file.type.trim().toLowerCase();
  const extension = getFileExtension(file.name);
  const acceptedKinds = model.acceptedReferenceKinds ?? ["image", "video"];

  if (mimeType.startsWith("image/")) {
    return acceptedKinds.includes("image");
  }
  if (mimeType.startsWith("video/")) {
    return acceptedKinds.includes("video");
  }
  if (mimeType.startsWith("audio/")) {
    return acceptedKinds.includes("audio");
  }

  if (
    acceptedKinds.includes("document") &&
    (mimeType === "application/pdf" ||
      mimeType === "text/plain" ||
      mimeType === "text/markdown" ||
      mimeType === "text/csv" ||
      mimeType === "application/json")
  ) {
    return true;
  }

  if (!extension) {
    return false;
  }

  if (acceptedKinds.includes("audio") && AUDIO_EXTENSIONS.has(extension)) {
    return true;
  }

  if (acceptedKinds.includes("document") && DOCUMENT_EXTENSIONS.has(extension)) {
    return true;
  }

  return false;
}

export function ReferenceFileThumbnail({
  reference,
  onPreviewReference,
  onRemove,
}: {
  reference: DraftReference;
  onPreviewReference: (reference: DraftReference) => void;
  onRemove: () => void;
}) {
  const previewKind = getReferencePreviewKind(reference);
  const previewUrl = previewKind === "file" ? null : reference.previewUrl;

  return (
    <div
      className="group relative size-14 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-muted/70 transition-transform duration-200 hover:scale-105"
      title={reference.title}
    >
      <button
        type="button"
        onClick={() => onPreviewReference(reference)}
        className="absolute inset-0 z-10 cursor-zoom-in rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-primary/60"
        aria-label={`Preview ${reference.title}`}
      />

      {previewKind === "video" && previewUrl ? (
        <div className="relative size-full">
          <video
            src={previewUrl}
            muted
            playsInline
            preload="metadata"
            className="size-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/45 p-1.5 backdrop-blur-sm">
              <Play className="size-4 text-white" />
            </span>
          </div>
        </div>
      ) : reference.kind === "audio" ? (
        <div className="relative size-full">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={reference.title}
              className="size-full object-cover"
            />
          ) : (
            <div className="size-full bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.04))]" />
          )}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/45 p-1.5 backdrop-blur-sm">
              <AudioLines className="size-4 text-white" />
            </span>
          </div>
        </div>
      ) : previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={reference.title}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center bg-muted/80">
          <FileText className="size-4 text-muted-foreground/60" />
        </div>
      )}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        className="absolute right-0 top-0 z-20 flex size-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-black/85 group-hover:opacity-100 group-focus-within:opacity-100"
        aria-label={`Remove ${reference.title}`}
      >
        <X className="size-3 text-white" />
      </button>
    </div>
  );
}

export function ReferencePreviewDialog({
  reference,
  onClose,
}: {
  reference: DraftReference | null;
  onClose: () => void;
}) {
  const previewKind = useMemo(
    () => (reference ? getReferencePreviewKind(reference) : null),
    [reference]
  );
  const previewUrl =
    reference && previewKind !== "file" ? reference.previewUrl : null;
  const audioUrl = useMemo(() => {
    if (!reference || reference.kind !== "audio") {
      return null;
    }

    return URL.createObjectURL(reference.file);
  }, [reference]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  if (!reference) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative flex max-h-[80vh] w-full max-w-4xl items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white transition hover:bg-black/70"
          aria-label="Close preview"
        >
          <X className="size-4" />
        </button>

        {reference.kind === "audio" ? (
          <div className="flex min-h-[18rem] w-full max-w-3xl flex-col gap-6 px-8 py-10 text-white">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,#071722_0%,#0b2033_48%,#07131f_100%)] p-6">
              {previewUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={reference.title}
                    className="absolute inset-0 size-full object-cover opacity-90"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.78)_0%,rgba(0,0,0,0.20)_58%,rgba(0,0,0,0.12)_100%)]" />
                </>
              ) : null}
              <div className="relative z-10 flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
                    Audio reference
                  </div>
                  <div className="text-xl font-semibold">{reference.title}</div>
                </div>
                <span className="rounded-full bg-black/40 p-3 backdrop-blur-sm">
                  <AudioLines className="size-5 text-white" />
                </span>
              </div>
            </div>
            <audio
              src={audioUrl ?? undefined}
              controls
              autoPlay
              className="w-full"
            />
          </div>
        ) : previewKind === "video" && previewUrl ? (
          <video
            src={previewUrl}
            controls
            autoPlay
            playsInline
            className="max-h-[80vh] w-full bg-black object-contain"
          />
        ) : previewKind === "image" && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={reference.title}
            className="max-h-[80vh] w-full object-contain"
          />
        ) : (
          <div className="flex min-h-[18rem] w-full flex-col items-center justify-center gap-4 px-8 py-10 text-center text-white">
            <FileText className="size-8 text-white/70" />
            <div className="space-y-1">
              <div className="text-sm font-medium">{reference.title}</div>
              <div className="text-xs text-white/60">
                Preview is not available for this file type.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
