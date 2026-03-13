"use client";

import { createStudioId } from "./studio-local-runtime-data";
import type { DraftReference, LibraryItem, StudioFolder } from "./types";

export const STUDIO_MEDIA_UPLOAD_ACCEPT = "image/*,video/*";

function sanitizeFileName(rawValue: string) {
  return rawValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getFileExtension(params: {
  kind: LibraryItem["kind"];
  mimeType: string | null;
}) {
  const normalizedMimeType = params.mimeType?.toLowerCase() ?? "";
  if (normalizedMimeType.includes("png")) return "png";
  if (normalizedMimeType.includes("jpeg") || normalizedMimeType.includes("jpg")) {
    return "jpg";
  }
  if (normalizedMimeType.includes("svg")) return "svg";
  if (normalizedMimeType.includes("webp")) return "webp";
  if (normalizedMimeType.includes("mp4")) return "mp4";
  if (normalizedMimeType.includes("webm")) return "webm";
  if (params.kind === "video") return "mp4";
  if (params.kind === "text") return "txt";
  return "png";
}

function getFallbackMimeType(item: LibraryItem) {
  if (item.kind === "video") return "video/mp4";
  if (item.kind === "text") return "text/plain";
  return "image/png";
}

export function revokePreviewUrl(url: string | null | undefined) {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export function releaseUploadedPreview(
  item: LibraryItem | undefined,
  previewUrls: Map<string, string>
) {
  if (!item || item.source !== "uploaded" || !item.previewUrl) {
    return;
  }

  revokePreviewUrl(previewUrls.get(item.id) ?? item.previewUrl);
  previewUrls.delete(item.id);
}

export function createFolderItemCounts(
  folders: StudioFolder[],
  items: LibraryItem[]
) {
  return Object.fromEntries(
    folders.map((folder) => [
      folder.id,
      items.filter((item) => item.folderId === folder.id).length,
    ])
  ) as Record<string, number>;
}

export function removePendingTimerId(timerIds: number[], timerId: number) {
  return timerIds.filter((entry) => entry !== timerId);
}

export function isReferenceEligibleLibraryItem(item: LibraryItem) {
  return item.kind === "image" || item.kind === "video";
}

export function getLibraryItemPromptText(item: LibraryItem) {
  const textValue = item.contentText?.trim() || item.prompt.trim() || item.title.trim();
  return textValue || null;
}

export function appendLibraryItemsToPrompt(currentPrompt: string, items: LibraryItem[]) {
  const promptBlocks = items
    .map(getLibraryItemPromptText)
    .filter((entry): entry is string => Boolean(entry));

  if (promptBlocks.length === 0) {
    return currentPrompt;
  }

  const prefix = currentPrompt.trim();
  if (!prefix) {
    return promptBlocks.join("\n\n");
  }

  return `${prefix}\n\n${promptBlocks.join("\n\n")}`;
}

export function getDraftReferenceDedupeKey(reference: DraftReference) {
  if (reference.originAssetId) {
    return `asset:${reference.originAssetId}`;
  }

  const file = reference.file;
  return `file:${file.name}:${file.size}:${file.lastModified}:${file.type}`;
}

export function mergeDraftReferences(
  currentReferences: DraftReference[],
  nextReferences: DraftReference[],
  maxReferences: number
) {
  const mergedReferences = [...currentReferences];
  const seenKeys = new Set(
    currentReferences.map((reference) => getDraftReferenceDedupeKey(reference))
  );

  for (const reference of nextReferences) {
    const dedupeKey = getDraftReferenceDedupeKey(reference);
    if (seenKeys.has(dedupeKey)) {
      continue;
    }

    mergedReferences.push(reference);
    seenKeys.add(dedupeKey);
    if (mergedReferences.length >= maxReferences) {
      break;
    }
  }

  return mergedReferences;
}

export async function resolveLibraryItemToReferenceFile(
  item: LibraryItem
): Promise<File | null> {
  if (!isReferenceEligibleLibraryItem(item)) {
    return null;
  }

  const baseFileName = sanitizeFileName(item.title) || "reference";
  const extension = getFileExtension({
    kind: item.kind,
    mimeType: item.mimeType,
  });
  const fileName = `${baseFileName}.${extension}`;

  if (item.previewUrl) {
    try {
      const response = await fetch(item.previewUrl);
      const blob = await response.blob();
      const mimeType = blob.type || item.mimeType || getFallbackMimeType(item);
      return new File([blob], fileName, {
        type: mimeType,
        lastModified: Date.parse(item.createdAt) || Date.now(),
      });
    } catch {
      // Fall through to an SVG placeholder if the preview cannot be materialized.
    }
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" rx="40" fill="url(#bg)" />
      <rect x="48" y="48" width="1104" height="804" rx="32" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" />
      <text x="96" y="180" fill="#ffffff" font-size="78" font-family="Arial, Helvetica, sans-serif" font-weight="700">${item.title}</text>
      <foreignObject x="96" y="260" width="960" height="360">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, Helvetica, sans-serif; font-size: 34px; line-height: 1.4; color: rgba(255,255,255,0.72);">
          ${item.prompt || item.meta}
        </div>
      </foreignObject>
    </svg>
  `;

  return new File([svg], `${baseFileName}.svg`, {
    type: "image/svg+xml",
    lastModified: Date.parse(item.createdAt) || Date.now(),
  });
}

export function createTextLibraryItem(params: {
  title: string;
  body: string;
  folderId: string | null;
}): LibraryItem {
  const trimmedBody = params.body.trim();
  const fallbackTitle = trimmedBody.slice(0, 36) || "Text note";

  return {
    id: createStudioId("asset"),
    title: params.title.trim() || fallbackTitle,
    kind: "text",
    source: "uploaded",
    role: "text_note",
    previewUrl: null,
    contentText: trimmedBody,
    createdAt: new Date().toISOString(),
    modelId: null,
    prompt: trimmedBody,
    meta: "Text note",
    aspectRatio: 0.82,
    folderId: params.folderId,
    mimeType: "text/plain",
    byteSize: trimmedBody.length,
  };
}

export function createUploadedLibraryItem(
  file: File,
  folderId: string | null
): LibraryItem | null {
  const fileType = file.type.toLowerCase();
  const kind = fileType.startsWith("image/")
    ? "image"
    : fileType.startsWith("video/")
      ? "video"
      : null;

  if (!kind) {
    return null;
  }

  const previewUrl = URL.createObjectURL(file);
  const aspectRatio = kind === "video" ? 16 / 9 : 4 / 5;

  return {
    id: createStudioId("asset"),
    title: file.name,
    kind,
    source: "uploaded",
    role: "uploaded_source",
    previewUrl,
    contentText: null,
    createdAt: new Date().toISOString(),
    modelId: null,
    prompt: "",
    meta: `${file.type || "File"} • ${(file.size / 1024 / 1024).toFixed(1)} MB`,
    aspectRatio,
    folderId,
    mimeType: file.type || null,
    byteSize: file.size,
  };
}

export function hasFolderNameConflict(
  folders: StudioFolder[],
  nextName: string,
  targetFolderId: string | null
) {
  const normalizedName = nextName.trim().toLowerCase();
  return folders.some(
    (folder) =>
      folder.id !== targetFolderId &&
      folder.name.trim().toLowerCase() === normalizedName
  );
}
