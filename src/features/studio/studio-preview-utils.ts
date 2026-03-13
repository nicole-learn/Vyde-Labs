import type { DraftReference, LibraryItem } from "./types";

export type StudioPreviewMediaKind = "image" | "video" | "file";

function looksLikeImageUrl(url: string) {
  const normalized = url.trim().toLowerCase();
  return (
    normalized.startsWith("data:image/") ||
    /\.(png|jpe?g|webp|gif|svg)(\?|#|$)/.test(normalized)
  );
}

function looksLikeVideoUrl(url: string) {
  const normalized = url.trim().toLowerCase();
  return (
    normalized.startsWith("data:video/") ||
    /\.(mp4|webm|mov|m4v)(\?|#|$)/.test(normalized)
  );
}

export function getPreviewMediaKind(params: {
  kind?: "image" | "video" | "text" | "audio" | "document";
  mimeType?: string | null;
  previewUrl?: string | null;
  preferImagePreview?: boolean;
}): StudioPreviewMediaKind {
  const previewUrl = params.previewUrl ?? null;
  const mimeType = params.mimeType?.trim().toLowerCase() ?? null;

  if (!previewUrl) {
    return "file";
  }

  if (looksLikeImageUrl(previewUrl)) {
    return "image";
  }

  if (looksLikeVideoUrl(previewUrl)) {
    return "video";
  }

  if (previewUrl.startsWith("blob:")) {
    if (mimeType?.startsWith("video/")) return "video";
    if (mimeType?.startsWith("image/")) return "image";
  }

  if (mimeType?.startsWith("image/")) {
    return "image";
  }

  if (mimeType?.startsWith("video/")) {
    return params.preferImagePreview ? "image" : "video";
  }

  if (params.preferImagePreview && params.kind === "video") {
    return "image";
  }

  if (params.kind === "video") {
    return "video";
  }

  if (params.kind === "image") {
    return "image";
  }

  return "file";
}

export function getLibraryItemPreviewMediaKind(item: LibraryItem) {
  const previewUrl = item.thumbnailUrl ?? item.previewUrl;
  return getPreviewMediaKind({
    kind: item.kind,
    mimeType: item.mimeType,
    previewUrl,
    preferImagePreview: Boolean(
      item.thumbnailUrl && item.previewUrl && item.thumbnailUrl !== item.previewUrl
    ),
  });
}

export function getDraftReferencePreviewMediaKind(
  reference: Pick<DraftReference, "kind" | "mimeType" | "previewUrl">
) {
  return getPreviewMediaKind({
    kind: reference.kind,
    mimeType: reference.mimeType,
    previewUrl: reference.previewUrl,
  });
}

export function isPlayableVideoPreview(params: {
  mimeType?: string | null;
  previewUrl?: string | null;
}) {
  return (
    getPreviewMediaKind({
      mimeType: params.mimeType,
      previewUrl: params.previewUrl,
    }) === "video"
  );
}
