import type { LibraryItemKind } from "./types";

export type StudioUploadedMediaKind = Extract<LibraryItemKind, "image" | "video" | "audio">;

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

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "mov",
  "m4v",
  "avi",
  "mkv",
]);

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
]);

function getFileExtension(fileName: string | null | undefined) {
  const normalizedFileName = fileName?.trim().toLowerCase() ?? "";
  if (!normalizedFileName.includes(".")) {
    return null;
  }

  return normalizedFileName.split(".").pop() ?? null;
}

export function getStudioUploadedMediaKind(params: {
  fileName: string | null | undefined;
  mimeType: string | null | undefined;
}): StudioUploadedMediaKind | null {
  const normalizedMimeType = params.mimeType?.trim().toLowerCase() ?? "";
  const extension = getFileExtension(params.fileName);

  if (normalizedMimeType.startsWith("image/")) {
    return "image";
  }

  if (normalizedMimeType.startsWith("video/")) {
    return "video";
  }

  if (normalizedMimeType.startsWith("audio/")) {
    return "audio";
  }

  if (extension && IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (extension && VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  if (extension && AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }

  return null;
}

export function studioUploadSupportsAlpha(mimeType: string | null | undefined) {
  return Boolean(
    mimeType && /image\/(png|webp|gif|svg\+xml)/i.test(mimeType.trim())
  );
}
