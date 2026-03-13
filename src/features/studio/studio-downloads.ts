"use client";

import type { LibraryItem } from "./types";

function sanitizeBaseName(rawValue: string) {
  return (
    rawValue.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
    "asset"
  );
}

function getExtensionFromMimeType(mimeType: string | null) {
  const normalized = mimeType?.toLowerCase() ?? "";

  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("svg")) return "svg";
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("quicktime")) return "mov";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("flac")) return "flac";
  if (normalized.includes("audio/mp4") || normalized.includes("x-m4a")) return "m4a";
  if (normalized.includes("plain")) return "txt";

  return null;
}

function getDownloadFileName(item: LibraryItem) {
  if (item.fileName?.trim()) {
    return item.fileName.trim();
  }

  const safeBaseName = sanitizeBaseName(item.title);
  const extension = getExtensionFromMimeType(item.mimeType);

  if (extension) {
    return `${safeBaseName}.${extension}`;
  }

  if (item.kind === "text") {
    return `${safeBaseName}.txt`;
  }

  if (item.kind === "video") {
    return `${safeBaseName}.mp4`;
  }

  if (item.kind === "audio") {
    return `${safeBaseName}.mp3`;
  }

  return `${safeBaseName}.png`;
}

function triggerDownload(url: string, fileName: string) {
  if (typeof window === "undefined") return;

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function downloadLibraryItem(item: LibraryItem) {
  if (typeof window === "undefined") return;

  const fileName = getDownloadFileName(item);

  if (item.kind === "text") {
    const blob = new Blob([item.contentText || item.prompt || item.title], {
      type: item.mimeType || "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, fileName);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return;
  }

  if (!item.previewUrl) return;
  triggerDownload(item.previewUrl, fileName);
}

export function downloadFolderItems(items: LibraryItem[]) {
  if (items.length === 0 || typeof window === "undefined") return;

  items.forEach((item, index) => {
    window.setTimeout(() => {
      downloadLibraryItem(item);
    }, index * 120);
  });
}
