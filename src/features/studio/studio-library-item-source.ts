import { loadUploadedAssetFile } from "./studio-browser-storage";
import type { LibraryItem } from "./types";

function sanitizeBaseName(rawValue: string) {
  return (
    rawValue.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
    "asset"
  );
}

export function getLibraryItemFileExtension(item: Pick<LibraryItem, "kind" | "mimeType" | "fileName">) {
  const normalizedMimeType = item.mimeType?.toLowerCase() ?? "";
  const normalizedFileName = item.fileName?.toLowerCase() ?? "";

  if (normalizedFileName.includes(".")) {
    return normalizedFileName.split(".").pop() ?? "bin";
  }
  if (normalizedMimeType.includes("jpeg") || normalizedMimeType.includes("jpg")) return "jpg";
  if (normalizedMimeType.includes("png")) return "png";
  if (normalizedMimeType.includes("webp")) return "webp";
  if (normalizedMimeType.includes("gif")) return "gif";
  if (normalizedMimeType.includes("svg")) return "svg";
  if (normalizedMimeType.includes("mp4")) return "mp4";
  if (normalizedMimeType.includes("webm")) return "webm";
  if (normalizedMimeType.includes("quicktime")) return "mov";
  if (normalizedMimeType.includes("mpeg")) return "mp3";
  if (normalizedMimeType.includes("wav")) return "wav";
  if (normalizedMimeType.includes("flac")) return "flac";
  if (normalizedMimeType.includes("audio/mp4") || normalizedMimeType.includes("x-m4a")) {
    return "m4a";
  }
  if (normalizedMimeType.includes("plain")) return "txt";
  if (item.kind === "text") return "txt";
  if (item.kind === "video") return "mp4";
  if (item.kind === "audio") return "mp3";
  return "png";
}

export function getLibraryItemFallbackMimeType(item: Pick<LibraryItem, "kind" | "mimeType" | "fileName">) {
  if (item.mimeType?.trim()) {
    return item.mimeType.trim();
  }

  const extension = getLibraryItemFileExtension(item);
  if (extension === "wav") return "audio/wav";
  if (extension === "flac") return "audio/flac";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "webm") return "video/webm";
  if (extension === "mov") return "video/quicktime";
  if (extension === "mp4") return "video/mp4";
  if (extension === "jpg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "txt") return "text/plain";

  if (item.kind === "text") return "text/plain";
  if (item.kind === "video") return "video/mp4";
  if (item.kind === "audio") return "audio/mpeg";
  return "image/png";
}

export function getLibraryItemDownloadFileName(
  item: Pick<LibraryItem, "fileName" | "kind" | "mimeType" | "title">
) {
  if (item.fileName?.trim()) {
    return item.fileName.trim();
  }

  const safeBaseName = sanitizeBaseName(item.title);
  return `${safeBaseName}.${getLibraryItemFileExtension(item)}`;
}

export function getLibraryItemSourceUrl(
  item: Pick<LibraryItem, "storageBucket" | "storagePath" | "previewUrl">
) {
  if (item.storageBucket === "browser-upload") {
    return null;
  }

  if (item.storageBucket === "mock-api" && item.storagePath) {
    return `/api/mock/studio/hosted/files/${encodeURIComponent(item.storagePath)}`;
  }

  if (item.storagePath?.trim()) {
    if (
      item.storagePath.startsWith("data:") ||
      item.storagePath.startsWith("blob:") ||
      /^https?:\/\//i.test(item.storagePath)
    ) {
      return item.storagePath;
    }

    return item.storagePath.startsWith("/")
      ? item.storagePath
      : `/${item.storagePath}`;
  }

  return item.previewUrl;
}

export async function readLibraryItemSourceBlob(
  item: Pick<
    LibraryItem,
    | "contentText"
    | "fileName"
    | "kind"
    | "mimeType"
    | "previewUrl"
    | "storageBucket"
    | "storagePath"
  >
) {
  if (item.kind === "text") {
    return new Blob([item.contentText || ""], {
      type: getLibraryItemFallbackMimeType(item),
    });
  }

  if (item.storageBucket === "browser-upload" && item.storagePath) {
    return loadUploadedAssetFile(item.storagePath);
  }

  const sourceUrl = getLibraryItemSourceUrl(item);
  if (!sourceUrl) {
    return null;
  }

  try {
    const response = await fetch(sourceUrl, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) {
      return null;
    }

    return await response.blob();
  } catch {
    return null;
  }
}
