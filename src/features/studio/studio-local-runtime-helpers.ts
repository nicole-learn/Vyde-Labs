"use client";

import { readUploadedAssetMediaMetadata } from "./studio-asset-metadata";
import { createAudioThumbnailUrl } from "./studio-asset-thumbnails";
import type {
  DraftReference,
  LibraryItem,
  StudioFolder,
  StudioFolderItem,
  StudioReferenceInputKind,
  StudioRunFile,
  StudioRunStatus,
} from "./types";
import { createStudioId } from "./studio-local-runtime-data";

export const STUDIO_MEDIA_UPLOAD_ACCEPT = "image/*,video/*,audio/*";

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

function sanitizeFileName(rawValue: string) {
  return rawValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getFileExtension(params: {
  kind: LibraryItem["kind"];
  mimeType: string | null;
  fileName?: string | null;
}) {
  const normalizedMimeType = params.mimeType?.toLowerCase() ?? "";
  const normalizedFileName = params.fileName?.toLowerCase() ?? "";

  if (normalizedFileName.includes(".")) {
    return normalizedFileName.split(".").pop() ?? "bin";
  }
  if (normalizedMimeType.includes("png")) return "png";
  if (normalizedMimeType.includes("jpeg") || normalizedMimeType.includes("jpg")) {
    return "jpg";
  }
  if (normalizedMimeType.includes("svg")) return "svg";
  if (normalizedMimeType.includes("webp")) return "webp";
  if (normalizedMimeType.includes("mp4")) return "mp4";
  if (normalizedMimeType.includes("webm")) return "webm";
  if (normalizedMimeType.includes("mpeg")) return "mp3";
  if (normalizedMimeType.includes("wav")) return "wav";
  if (normalizedMimeType.includes("flac")) return "flac";
  if (normalizedMimeType.includes("x-m4a") || normalizedMimeType.includes("audio/mp4")) {
    return "m4a";
  }
  if (params.kind === "video") return "mp4";
  if (params.kind === "audio") return "mp3";
  if (params.kind === "text") return "txt";
  return "png";
}

function getFallbackMimeType(item: LibraryItem) {
  if (item.kind === "video") return "video/mp4";
  if (item.kind === "audio") {
    const extension = getFileExtension({
      kind: item.kind,
      mimeType: item.mimeType,
      fileName: item.fileName,
    });

    if (extension === "wav") return "audio/wav";
    if (extension === "flac") return "audio/flac";
    if (extension === "m4a") return "audio/mp4";
    return "audio/mpeg";
  }
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
  folderItems: StudioFolderItem[]
) {
  return Object.fromEntries(
    folders.map((folder) => [
      folder.id,
      folderItems.filter((entry) => entry.folderId === folder.id).length,
    ])
  ) as Record<string, number>;
}

export function removePendingTimerId(timerIds: number[], timerId: number) {
  return timerIds.filter((entry) => entry !== timerId);
}

export function isReferenceEligibleLibraryItem(item: LibraryItem) {
  return item.kind === "image" || item.kind === "video" || item.kind === "audio";
}

export function getReferenceInputKindFromFile(
  file: Pick<File, "name" | "type">
): StudioReferenceInputKind {
  const mimeType = file.type.trim().toLowerCase();
  const extension = file.name.trim().toLowerCase().split(".").pop() ?? null;

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (
    mimeType === "application/pdf" ||
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    mimeType === "text/csv" ||
    mimeType === "application/json"
  ) {
    return "document";
  }

  if (extension && AUDIO_EXTENSIONS.has(extension)) return "audio";
  return "document";
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

export function releaseDraftReferencePreview(reference: DraftReference) {
  if (reference.previewSource !== "owned") {
    return;
  }

  revokePreviewUrl(reference.previewUrl);
}

export function releaseRemovedDraftReferencePreviews(
  currentReferences: DraftReference[],
  nextReferences: DraftReference[]
) {
  const nextReferenceIds = new Set(nextReferences.map((reference) => reference.id));

  for (const reference of currentReferences) {
    if (!nextReferenceIds.has(reference.id)) {
      releaseDraftReferencePreview(reference);
    }
  }
}

export function createDraftReferenceFromFile(file: File): DraftReference {
  const kind = getReferenceInputKindFromFile(file);
  const previewUrl =
    kind === "image" || kind === "video"
      ? URL.createObjectURL(file)
      : kind === "audio"
        ? createAudioThumbnailUrl({
            title: file.name,
            subtitle: "Audio reference",
            accentSeed: file.name,
          })
        : null;

  return {
    id: createStudioId("ref"),
    file,
    source: "upload",
    originAssetId: null,
    title: file.name,
    kind,
    mimeType: file.type || null,
    previewUrl,
    previewSource:
      kind === "audio" ? "none" : previewUrl ? "owned" : "none",
  };
}

export function createDraftReferenceFromLibraryItem(params: {
  file: File;
  item: LibraryItem;
}): DraftReference {
  const kind = params.item.kind === "text" ? "document" : params.item.kind;
  const previewUrl = params.item.thumbnailUrl ?? params.item.previewUrl;

  return {
    id: createStudioId("ref"),
    file: params.file,
    source: "library-item",
    originAssetId: params.item.id,
    title: params.item.title,
    kind,
    mimeType: params.item.mimeType,
    previewUrl,
    previewSource: previewUrl ? "asset" : "none",
  };
}

export function isInFlightStudioRunStatus(status: StudioRunStatus) {
  return status === "pending" || status === "queued" || status === "processing";
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
    fileName: item.fileName,
  });
  const fileName = `${baseFileName}.${extension}`;

  const sourcePreviewUrl =
    item.kind === "audio" ? item.previewUrl : item.thumbnailUrl ?? item.previewUrl;

  if (sourcePreviewUrl) {
    try {
      const response = await fetch(sourcePreviewUrl);
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

  if (item.kind === "audio") {
    return null;
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
  userId: string;
  workspaceId: string;
  title: string;
  body: string;
  folderId: string | null;
}): LibraryItem {
  const trimmedBody = params.body.trim();
  const fallbackTitle = trimmedBody.slice(0, 36) || "Text note";
  const timestamp = new Date().toISOString();
  const folderIds = params.folderId ? [params.folderId] : [];
  const fileName = `${sanitizeFileName(params.title || fallbackTitle) || "text-note"}.txt`;

  return {
    id: createStudioId("asset"),
    userId: params.userId,
    workspaceId: params.workspaceId,
    runFileId: null,
    sourceRunId: null,
    title: params.title.trim() || fallbackTitle,
    kind: "text",
    source: "uploaded",
    role: "text_note",
    previewUrl: null,
    thumbnailUrl: null,
    contentText: trimmedBody,
    createdAt: timestamp,
    updatedAt: timestamp,
    modelId: null,
    runId: null,
    provider: "fal",
    status: "ready",
    prompt: trimmedBody,
    meta: "Text note",
    mediaWidth: null,
    mediaHeight: null,
    mediaDurationSeconds: null,
    aspectRatioLabel: null,
    hasAlpha: false,
    folderId: params.folderId,
    folderIds,
    storageBucket: "inline-text",
    storagePath: null,
    thumbnailPath: null,
    fileName,
    mimeType: "text/plain",
    byteSize: trimmedBody.length,
    metadata: {},
    errorMessage: null,
  };
}

export async function createUploadedRunFileAndLibraryItem(params: {
  file: File;
  userId: string;
  workspaceId: string;
  folderId: string | null;
}): Promise<{ runFile: StudioRunFile; item: LibraryItem } | null> {
  const fileType = params.file.type.toLowerCase();
  const kind = fileType.startsWith("image/")
    ? "image"
    : fileType.startsWith("video/")
      ? "video"
      : fileType.startsWith("audio/")
        ? "audio"
      : null;

  if (!kind) {
    return null;
  }

  const previewUrl = URL.createObjectURL(params.file);
  const mediaMetadata = await readUploadedAssetMediaMetadata({
    kind,
    previewUrl,
    mimeType: params.file.type,
  });
  const timestamp = new Date().toISOString();
  const runFileId = createStudioId("run-file");
  const storagePath = `uploads/${runFileId}/${sanitizeFileName(params.file.name) || "upload.bin"}`;
  const folderIds = params.folderId ? [params.folderId] : [];

  const runFile: StudioRunFile = {
    id: runFileId,
    runId: null,
    userId: params.userId,
    fileRole: "input",
    sourceType: "uploaded",
    storageBucket: "browser-upload",
    storagePath,
    mimeType: params.file.type || null,
    fileName: params.file.name,
    fileSizeBytes: params.file.size,
    mediaWidth: mediaMetadata.mediaWidth,
    mediaHeight: mediaMetadata.mediaHeight,
    mediaDurationSeconds: mediaMetadata.mediaDurationSeconds,
    aspectRatioLabel: mediaMetadata.aspectRatioLabel,
    hasAlpha: mediaMetadata.hasAlpha,
    metadata: {},
    createdAt: timestamp,
  };
  const thumbnailUrl =
    kind === "audio"
      ? createAudioThumbnailUrl({
          title: params.file.name,
          subtitle: `${(params.file.size / 1024 / 1024).toFixed(1)} MB audio upload`,
          accentSeed: params.file.name,
        })
      : previewUrl;

  const item: LibraryItem = {
    id: createStudioId("asset"),
    userId: params.userId,
    workspaceId: params.workspaceId,
    runFileId,
    sourceRunId: null,
    title: params.file.name,
    kind,
    source: "uploaded",
    role: "uploaded_source",
    previewUrl,
    thumbnailUrl,
    contentText: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    modelId: null,
    runId: null,
    provider: "fal",
    status: "ready",
    prompt: "",
    meta:
      kind === "audio"
        ? `${params.file.type || "Audio"} • ${(params.file.size / 1024 / 1024).toFixed(1)} MB`
        : `${params.file.type || "File"} • ${(params.file.size / 1024 / 1024).toFixed(1)} MB`,
    mediaWidth: mediaMetadata.mediaWidth,
    mediaHeight: mediaMetadata.mediaHeight,
    mediaDurationSeconds: mediaMetadata.mediaDurationSeconds,
    aspectRatioLabel: mediaMetadata.aspectRatioLabel,
    hasAlpha: mediaMetadata.hasAlpha,
    folderId: params.folderId,
    folderIds,
    storageBucket: "browser-upload",
    storagePath,
    thumbnailPath: kind === "audio" ? null : storagePath,
    fileName: params.file.name,
    mimeType: params.file.type || null,
    byteSize: params.file.size,
    metadata: {},
    errorMessage: null,
  };

  return { runFile, item };
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
