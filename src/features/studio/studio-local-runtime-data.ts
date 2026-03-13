import type { StudioAppMode } from "./studio-app-mode";
import {
  STUDIO_MODEL_CATALOG,
  getStudioModelById,
} from "./studio-model-catalog";
import {
  createMediaMetadataFromAspectRatioLabel,
  formatAspectRatioLabel,
} from "./studio-asset-metadata";
import {
  createAudioThumbnailForModel,
  createAudioThumbnailUrl,
} from "./studio-asset-thumbnails";
import type {
  GenerationRun,
  LibraryItem,
  PersistedStudioDraft,
  StudioCreditBalance,
  StudioCreditPack,
  StudioDraft,
  StudioFolder,
  StudioFolderItem,
  StudioModelDefinition,
  StudioModelKind,
  StudioProfile,
  StudioQueueSettings,
  StudioRunFile,
  StudioWorkspaceSnapshot,
} from "./types";

export const LOCAL_STUDIO_WORKSPACE_ID = "workspace-local";
export const HOSTED_STUDIO_WORKSPACE_ID = "workspace-hosted";
export const LOCAL_STUDIO_USER_ID = "user-local";
export const HOSTED_STUDIO_USER_ID = "user-hosted";
export const STUDIO_STATE_SCHEMA_VERSION = 3;

const MOCK_MEDIA = {
  generatedImage: {
    previewUrl: "/mock-media/nasa-neowise.jpg",
    mediaWidth: 1600,
    mediaHeight: 1200,
    fileName: "nasa-neowise.jpg",
    mimeType: "image/jpeg",
  },
  generatedVideo: {
    previewUrl: "/mock-media/nasa-winston-clip.mp4",
    mediaWidth: 960,
    mediaHeight: 540,
    mediaDurationSeconds: 6,
    fileName: "nasa-winston-clip.mp4",
    mimeType: "video/mp4",
  },
  generatedAudioMp3: {
    previewUrl: "/mock-media/tryplayground-voiceover-sample.mp3",
    mediaDurationSeconds: 6,
    fileName: "tryplayground-voiceover-sample.mp3",
    mimeType: "audio/mpeg",
  },
  generatedAudioWav: {
    previewUrl: "/mock-media/tryplayground-voiceover-sample.wav",
    mediaDurationSeconds: 6,
    fileName: "tryplayground-voiceover-sample.wav",
    mimeType: "audio/wav",
  },
  generatedAudioFlac: {
    previewUrl: "/mock-media/tryplayground-voiceover-sample.flac",
    mediaDurationSeconds: 6,
    fileName: "tryplayground-voiceover-sample.flac",
    mimeType: "audio/flac",
  },
  generatedCutoutImage: {
    previewUrl: "/mock-media/product-cutout.png",
    mediaWidth: 1400,
    mediaHeight: 1400,
    fileName: "product-cutout.png",
    mimeType: "image/png",
    hasAlpha: true,
  },
  uploadedImage: {
    previewUrl: "/mock-media/jacmel-beach.jpg",
    mediaWidth: 1146,
    mediaHeight: 982,
    fileName: "jacmel-beach.jpg",
    mimeType: "image/jpeg",
  },
  uploadedVideo: {
    previewUrl: "/mock-media/moon-passing-earth-clip.mp4",
    mediaWidth: 960,
    mediaHeight: 540,
    mediaDurationSeconds: 6,
    fileName: "moon-passing-earth-clip.mp4",
    mimeType: "video/mp4",
  },
  uploadedAudio: {
    previewUrl: "/mock-media/tryplayground-uploaded-voice-note.mp3",
    mediaDurationSeconds: 5,
    fileName: "tryplayground-uploaded-voice-note.mp3",
    mimeType: "audio/mpeg",
  },
} as const;

const SEED_BASE_TIMESTAMP = "2026-03-13T18:00:00.000Z";

const SEED_FOLDER_IDS = {
  references: "folder-references",
  prompts: "folder-prompts",
  concepts: "folder-concepts",
} as const;

const SEED_RUN_IDS = {
  completedImage: "run-completed-image",
  completedCutoutImage: "run-completed-cutout-image",
  completedVideo: "run-completed-video",
  completedAudio: "run-completed-audio",
  completedText: "run-completed-text",
  queuedImage: "run-queued-image",
  processingVideo: "run-processing-video",
  processingAudio: "run-processing-audio",
  failedText: "run-failed-text",
} as const;

const SEED_RUN_FILE_IDS = {
  generatedImage: "run-file-generated-image",
  generatedCutoutImage: "run-file-generated-cutout-image",
  generatedVideo: "run-file-generated-video",
  generatedAudio: "run-file-generated-audio",
  uploadedImage: "run-file-uploaded-image",
  uploadedVideo: "run-file-uploaded-video",
  uploadedAudio: "run-file-uploaded-audio",
} as const;

const SEED_ASSET_IDS = {
  generatedImage: "asset-generated-image",
  generatedCutoutImage: "asset-generated-cutout-image",
  generatedVideo: "asset-generated-video",
  generatedAudio: "asset-generated-audio",
  generatedText: "asset-generated-text",
  uploadedImage: "asset-uploaded-image",
  uploadedVideo: "asset-uploaded-video",
  uploadedAudio: "asset-uploaded-audio",
  uploadedText: "asset-uploaded-text",
} as const;

export function createStudioId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function getWorkspaceId(mode: StudioAppMode) {
  return mode === "hosted" ? HOSTED_STUDIO_WORKSPACE_ID : LOCAL_STUDIO_WORKSPACE_ID;
}

function getUserId(mode: StudioAppMode) {
  return mode === "hosted" ? HOSTED_STUDIO_USER_ID : LOCAL_STUDIO_USER_ID;
}

export function createDraft(model: StudioModelDefinition): StudioDraft {
  return {
    ...model.defaultDraft,
    references: [],
  };
}

export function toPersistedDraft(draft: StudioDraft): PersistedStudioDraft {
  return {
    prompt: draft.prompt,
    negativePrompt: draft.negativePrompt,
    aspectRatio: draft.aspectRatio,
    resolution: draft.resolution,
    outputFormat: draft.outputFormat,
    imageCount: draft.imageCount,
    durationSeconds: draft.durationSeconds,
    includeAudio: draft.includeAudio,
    tone: draft.tone,
    maxTokens: draft.maxTokens,
    temperature: draft.temperature,
    voice: draft.voice,
    language: draft.language,
    speakingRate: draft.speakingRate,
  };
}

function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createDraftSnapshot(
  draft: StudioDraft
): GenerationRun["draftSnapshot"] {
  return {
    ...toPersistedDraft(draft),
    referenceCount: draft.references.length,
  };
}

function createPreviewSvg({
  title,
  subtitle,
  kind,
  background,
}: {
  title: string;
  subtitle: string;
  kind: StudioModelKind;
  background: string;
}) {
  const badge =
    kind === "video"
      ? "VIDEO"
      : kind === "text"
        ? "TEXT"
        : kind === "audio"
          ? "AUDIO"
          : "IMAGE";
  const [backgroundStart, backgroundEnd] = background.split("|");
  const safeTitle = escapeSvgText(title);
  const safeSubtitle = escapeSvgText(subtitle);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="${backgroundStart}" />
          <stop offset="100%" stop-color="${backgroundEnd}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#bg)" rx="48" />
      <rect x="48" y="48" width="1104" height="804" rx="36" fill="rgba(11,15,25,0.36)" stroke="rgba(255,255,255,0.18)" />
      <text x="96" y="132" fill="rgba(255,255,255,0.75)" font-size="32" font-family="Arial, Helvetica, sans-serif" letter-spacing="4">${badge}</text>
      <text x="96" y="250" fill="#ffffff" font-size="76" font-weight="700" font-family="Arial, Helvetica, sans-serif">${safeTitle}</text>
      <foreignObject x="96" y="300" width="850" height="300">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, Helvetica, sans-serif; font-size: 34px; line-height: 1.45; color: rgba(255,255,255,0.78);">
          ${safeSubtitle}
        </div>
      </foreignObject>
      ${
        kind === "video"
          ? '<circle cx="1030" cy="450" r="96" fill="rgba(255,255,255,0.14)" /><polygon points="1008,396 1008,504 1094,450" fill="#ffffff" />'
          : ""
      }
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getPreviewBackgroundPairs(): Record<StudioModelKind, string> {
  return {
    image: "#38bdf8|#0f172a",
    video: "#0ea5e9|#082f49",
    text: "#60a5fa|#1e1b4b",
    audio: "#22d3ee|#0f172a",
  };
}

function getMimeTypeFromPreviewUrl(params: {
  kind: Exclude<StudioModelKind, "text">;
  previewUrl: string | null | undefined;
}) {
  const previewUrl = params.previewUrl?.toLowerCase() ?? "";

  if (params.kind === "video") {
    if (previewUrl.endsWith(".webm")) return "video/webm";
    return "video/mp4";
  }

  if (params.kind === "audio") {
    if (previewUrl.endsWith(".wav")) return "audio/wav";
    if (previewUrl.endsWith(".flac")) return "audio/flac";
    if (previewUrl.endsWith(".mp3")) return "audio/mpeg";
    return "audio/mp4";
  }

  if (previewUrl.endsWith(".jpg") || previewUrl.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (previewUrl.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/png";
}

function getGeneratedAudioMedia(params: {
  modelId: string;
  outputFormat: string;
}) {
  if (params.modelId === "orpheus-tts") {
    return MOCK_MEDIA.generatedAudioWav;
  }

  if (params.outputFormat === "flac") {
    return MOCK_MEDIA.generatedAudioFlac;
  }

  return MOCK_MEDIA.generatedAudioMp3;
}

function createStoragePath(fileName: string) {
  const sanitized = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || `${createStudioId("asset")}.bin`;
}

function getDefaultQueueSettings(mode: StudioAppMode): StudioQueueSettings {
  return {
    maxActiveJobsPerUser: 100,
    providerSlotLimit: 30,
    localConcurrencyLimit: 3,
    activeHostedUserCount: mode === "hosted" ? 1 : 0,
  };
}

function createProfile(mode: StudioAppMode): StudioProfile {
  const userId = getUserId(mode);
  return {
    id: userId,
    email:
      mode === "hosted" ? "nicole@tryplayground.ai" : "local@tryplayground.ai",
    displayName: mode === "hosted" ? "Nicole" : "Local Workspace",
    avatarLabel: mode === "hosted" ? "N" : "T",
    avatarUrl: null,
    preferences: {},
    createdAt: SEED_BASE_TIMESTAMP,
    updatedAt: SEED_BASE_TIMESTAMP,
  };
}

function createCreditBalance(mode: StudioAppMode): StudioCreditBalance | null {
  if (mode !== "hosted") {
    return null;
  }

  return {
    userId: HOSTED_STUDIO_USER_ID,
    balanceCredits: 300,
    updatedAt: SEED_BASE_TIMESTAMP,
  };
}

function createActiveCreditPack(mode: StudioAppMode): StudioCreditPack | null {
  if (mode !== "hosted") {
    return null;
  }

  return {
    id: "credit-pack-100",
    credits: 100,
    priceCents: 1000,
    currency: "usd",
    isActive: true,
    displayOrder: 0,
    createdAt: SEED_BASE_TIMESTAMP,
    updatedAt: SEED_BASE_TIMESTAMP,
  };
}

function createSeedFolders(mode: StudioAppMode): StudioFolder[] {
  const now = SEED_BASE_TIMESTAMP;
  const userId = getUserId(mode);
  const workspaceId = getWorkspaceId(mode);

  return [
    {
      id: SEED_FOLDER_IDS.references,
      userId,
      workspaceId,
      name: "References",
      createdAt: now,
      updatedAt: now,
      sortOrder: 0,
    },
    {
      id: SEED_FOLDER_IDS.prompts,
      userId,
      workspaceId,
      name: "Prompts",
      createdAt: now,
      updatedAt: now,
      sortOrder: 1,
    },
    {
      id: SEED_FOLDER_IDS.concepts,
      userId,
      workspaceId,
      name: "Concepts",
      createdAt: now,
      updatedAt: now,
      sortOrder: 2,
    },
  ];
}

function createFolderMemberships(items: LibraryItem[]): StudioFolderItem[] {
  return items.flatMap((item) =>
    item.folderIds.map((folderId) => ({
      folderId,
      libraryItemId: item.id,
      createdAt: item.createdAt,
    }))
  );
}

export function createRunFile(params: {
  id: string;
  runId: string | null;
  userId: string;
  sourceType: "generated" | "uploaded";
  fileRole: StudioRunFile["fileRole"];
  previewUrl: string;
  fileName: string;
  mimeType: string;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaDurationSeconds?: number | null;
  hasAlpha?: boolean;
  createdAt: string;
  fileSizeBytes?: number | null;
}) {
  return {
    id: params.id,
    runId: params.runId,
    userId: params.userId,
    fileRole: params.fileRole,
    sourceType: params.sourceType,
    storageBucket: params.sourceType === "uploaded" ? "browser-upload" : "mock-public",
    storagePath:
      params.sourceType === "uploaded"
        ? `uploads/${params.id}/${createStoragePath(params.fileName)}`
        : params.previewUrl.replace(/^\//, ""),
    mimeType: params.mimeType,
    fileName: params.fileName,
    fileSizeBytes: params.fileSizeBytes ?? null,
    mediaWidth: params.mediaWidth,
    mediaHeight: params.mediaHeight,
    mediaDurationSeconds: params.mediaDurationSeconds ?? null,
    aspectRatioLabel: formatAspectRatioLabel({
      mediaWidth: params.mediaWidth,
      mediaHeight: params.mediaHeight,
    }),
    hasAlpha: params.hasAlpha ?? false,
    metadata: {},
    createdAt: params.createdAt,
  } satisfies StudioRunFile;
}

export function createGeneratedLibraryItem(params: {
  id?: string;
  runFileId: string | null;
  sourceRunId: string | null;
  model: StudioModelDefinition;
  draft: StudioDraft;
  createdAt: string;
  folderId: string | null;
  userId: string;
  workspaceId: string;
  previewUrlOverride?: string | null;
  thumbnailUrlOverride?: string | null;
  runId?: string | null;
  mediaWidthOverride?: number | null;
  mediaHeightOverride?: number | null;
  mediaDurationSecondsOverride?: number | null;
  fileNameOverride?: string | null;
  mimeTypeOverride?: string | null;
  hasAlphaOverride?: boolean;
}): LibraryItem {
  const title = params.draft.prompt.trim().slice(0, 40) || params.model.name;
  const backgroundPairs = getPreviewBackgroundPairs();
  const folderIds = params.folderId ? [params.folderId] : [];

  if (params.model.kind === "text") {
    const body = [
      `Creative direction for: ${params.draft.prompt.trim() || "Untitled request"}.`,
      `Tone: ${params.draft.tone}. Keep the language concise, useful, and ready to evolve into image or video prompts.`,
      `Suggested next step: turn the strongest paragraph into a shot list or visual prompt sequence.`,
    ].join(" ");

    return {
      id: params.id ?? createStudioId("asset"),
      userId: params.userId,
      workspaceId: params.workspaceId,
      runFileId: params.runFileId,
      sourceRunId: params.sourceRunId,
      title,
      kind: "text",
      source: "generated",
      role: "generated_output",
      previewUrl: null,
      thumbnailUrl: null,
      contentText: body,
      createdAt: params.createdAt,
      updatedAt: params.createdAt,
      modelId: params.model.id,
      runId: params.runId ?? null,
      provider: "fal",
      status: "ready",
      prompt: params.draft.prompt,
      meta: `${params.model.name} • ${params.draft.maxTokens} max tokens • ${params.draft.tone}`,
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
      fileName: `${createStoragePath(title)}.txt`,
      mimeType: "text/plain",
      byteSize: body.length,
      metadata: {
        output_format: "text",
      },
      errorMessage: null,
    };
  }

  const defaultGeneratedMedia =
    params.model.kind === "audio"
      ? getGeneratedAudioMedia({
          modelId: params.model.id,
          outputFormat: params.draft.outputFormat,
        })
      : params.model.requestMode === "background-removal"
        ? MOCK_MEDIA.generatedCutoutImage
        : params.model.kind === "video"
          ? MOCK_MEDIA.generatedVideo
          : MOCK_MEDIA.generatedImage;
  const previewUrl =
    params.previewUrlOverride ??
    defaultGeneratedMedia.previewUrl ??
    createPreviewSvg({
      title: params.model.name,
      subtitle:
        params.draft.prompt.trim() || "Fal-powered generation preview placeholder",
      kind: params.model.kind,
      background: backgroundPairs[params.model.kind],
    });
  const thumbnailUrl =
    params.thumbnailUrlOverride ??
    (params.model.kind === "audio"
      ? createAudioThumbnailForModel({
          model: params.model,
          title: params.model.name,
          subtitle: params.draft.prompt.trim() || "Generated speech preview",
        })
      : previewUrl);
  const mediaMetadata = createMediaMetadataFromAspectRatioLabel(
    params.model.kind,
    params.draft.aspectRatio
  );
  const defaultMediaWidth =
    "mediaWidth" in defaultGeneratedMedia ? defaultGeneratedMedia.mediaWidth ?? null : null;
  const defaultMediaHeight =
    "mediaHeight" in defaultGeneratedMedia ? defaultGeneratedMedia.mediaHeight ?? null : null;
  const mediaWidth =
    params.mediaWidthOverride ??
    defaultMediaWidth ??
    mediaMetadata.mediaWidth;
  const mediaHeight =
    params.mediaHeightOverride ??
    defaultMediaHeight ??
    mediaMetadata.mediaHeight;
  const mediaDurationSeconds =
    params.mediaDurationSecondsOverride ??
    ("mediaDurationSeconds" in defaultGeneratedMedia
      ? defaultGeneratedMedia.mediaDurationSeconds ?? null
      : null);
  const hasAlpha =
    params.hasAlphaOverride ??
    ("hasAlpha" in defaultGeneratedMedia ? defaultGeneratedMedia.hasAlpha ?? false : false);
  const fileName =
    params.fileNameOverride ??
    defaultGeneratedMedia.fileName ??
    `${createStoragePath(title)}.${
      params.model.kind === "video"
        ? "mp4"
        : params.model.kind === "audio"
          ? "mp3"
          : "png"
    }`;
  const mimeType =
    params.mimeTypeOverride ??
    defaultGeneratedMedia.mimeType ??
    getMimeTypeFromPreviewUrl({
      kind: params.model.kind,
      previewUrl,
    });

  return {
    id: params.id ?? createStudioId("asset"),
    userId: params.userId,
    workspaceId: params.workspaceId,
    runFileId: params.runFileId,
    sourceRunId: params.sourceRunId,
    title,
    kind: params.model.kind,
    source: "generated",
    role: "generated_output",
    previewUrl,
    thumbnailUrl,
    contentText: null,
    createdAt: params.createdAt,
    updatedAt: params.createdAt,
    modelId: params.model.id,
    runId: params.runId ?? null,
    provider: "fal",
    status: "ready",
    prompt: params.draft.prompt,
    meta:
      params.model.requestMode === "background-removal"
        ? `${params.model.name} • Transparent PNG`
        : params.model.kind === "image"
        ? `${params.model.name} • ${params.draft.aspectRatio} • ${params.draft.resolution}`
        : params.model.kind === "audio"
          ? `${params.model.name} • TTS • ${params.draft.outputFormat.toUpperCase()}`
        : `${params.model.name} • ${params.draft.durationSeconds}s • ${params.draft.resolution}`,
    mediaWidth,
    mediaHeight,
    mediaDurationSeconds,
    aspectRatioLabel:
      params.model.kind === "audio"
        ? null
        : formatAspectRatioLabel({ mediaWidth, mediaHeight }) ?? params.draft.aspectRatio,
    hasAlpha,
    folderId: params.folderId,
    folderIds,
    storageBucket: previewUrl.startsWith("/mock-media/") ? "mock-public" : "inline-preview",
    storagePath: previewUrl.startsWith("/") ? previewUrl.replace(/^\//, "") : previewUrl,
    thumbnailPath: thumbnailUrl.startsWith("/") ? thumbnailUrl.replace(/^\//, "") : null,
    fileName,
    mimeType,
    byteSize: null,
    metadata: {
      output_format: params.draft.outputFormat,
      resolution: params.draft.resolution,
      request_mode: params.model.requestMode,
      voice: params.draft.voice,
      language: params.draft.language,
      speaking_rate: params.draft.speakingRate,
    },
    errorMessage: null,
  };
}

export function createGenerationRunSummary(
  model: StudioModelDefinition,
  draft: StudioDraft
) {
  if (model.kind === "audio") {
    return `${draft.outputFormat.toUpperCase()} • TTS`;
  }

  if (model.requestMode === "background-removal") {
    return "Transparent PNG • 1 image";
  }

  if (model.kind === "image") {
    return `${draft.imageCount} image • ${draft.aspectRatio} • ${draft.resolution}`;
  }

  if (model.kind === "video") {
    return `${draft.durationSeconds}s • ${draft.aspectRatio} • ${draft.resolution}`;
  }

  return `${draft.tone} • ${draft.maxTokens} max tokens`;
}

export function createGenerationRunPreviewUrl(
  model: StudioModelDefinition,
  draft: StudioDraft
) {
  if (model.kind === "audio") {
    return createAudioThumbnailForModel({
      model,
      title: model.name,
      subtitle: draft.prompt.trim() || "Queued workspace speech generation",
    });
  }

  return createPreviewSvg({
    title: model.name,
    subtitle:
      draft.prompt.trim() ||
      (model.kind === "text"
        ? "Queued workspace text generation"
        : "Queued workspace media generation"),
    kind: model.kind,
    background: getPreviewBackgroundPairs()[model.kind],
  });
}

function createMockUploadedSeedItem(params: {
  id: string;
  runFileId: string | null;
  userId: string;
  workspaceId: string;
  title: string;
  prompt: string;
  kind: "image" | "video" | "text" | "audio";
  createdAt: string;
  folderId: string | null;
  previewUrlOverride?: string | null;
  thumbnailUrlOverride?: string | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  mediaDurationSeconds?: number | null;
  fileName?: string | null;
  mimeType?: string | null;
  hasAlpha?: boolean;
}): LibraryItem {
  const previewUrl =
    params.kind === "text"
      ? null
      : params.previewUrlOverride ??
        createPreviewSvg({
          title: params.title,
          subtitle: params.prompt,
          kind: params.kind,
          background:
            params.kind === "video"
              ? "#1d4ed8|#0f172a"
              : params.kind === "audio"
                ? "#38bdf8|#082f49"
                : "#38bdf8|#082f49",
        });
  const thumbnailUrl =
    params.kind === "text"
      ? null
      : params.thumbnailUrlOverride ??
        (params.kind === "audio"
          ? createAudioThumbnailUrl({
              title: params.title,
              subtitle: params.prompt || "Uploaded audio source",
              accentSeed: params.title,
            })
          : previewUrl);
  const folderIds = params.folderId ? [params.folderId] : [];
  const mimeType =
    params.kind === "text"
      ? "text/plain"
      : params.mimeType ??
        getMimeTypeFromPreviewUrl({
          kind: params.kind,
          previewUrl,
        });
  const fileName =
    params.fileName ??
    `${createStoragePath(params.title)}.${
      params.kind === "video" ? "mp4" : params.kind === "audio" ? "mp3" : "jpg"
    }`;

  return {
    id: params.id,
    userId: params.userId,
    workspaceId: params.workspaceId,
    runFileId: params.runFileId,
    sourceRunId: null,
    title: params.title,
    kind: params.kind,
    source: "uploaded",
    role:
      params.kind === "text"
        ? "text_note"
        : "uploaded_source",
    previewUrl,
    thumbnailUrl,
    contentText: params.kind === "text" ? params.prompt : null,
    createdAt: params.createdAt,
    updatedAt: params.createdAt,
    modelId: null,
    runId: null,
    provider: "fal",
    status: "ready",
    prompt: params.prompt,
    meta:
      params.kind === "text"
        ? "Text note"
        : params.kind === "video"
          ? "Uploaded video • Mock source"
          : params.kind === "audio"
            ? "Uploaded audio • Mock source"
          : "Uploaded image • Mock source",
    mediaWidth: params.kind === "text" ? null : (params.mediaWidth ?? null),
    mediaHeight: params.kind === "text" ? null : (params.mediaHeight ?? null),
    mediaDurationSeconds:
      params.kind === "audio" || params.kind === "video"
        ? params.mediaDurationSeconds ?? null
        : null,
    aspectRatioLabel:
      params.kind === "text" || params.kind === "audio"
        ? null
        : formatAspectRatioLabel({
            mediaWidth: params.mediaWidth,
            mediaHeight: params.mediaHeight,
          }),
    hasAlpha: params.hasAlpha ?? false,
    folderId: params.folderId,
    folderIds,
    storageBucket: params.kind === "text" ? "inline-text" : "mock-public",
    storagePath:
      params.kind === "text" ? null : previewUrl?.replace(/^\//, "") ?? null,
    thumbnailPath:
      params.kind === "text"
        ? null
        : thumbnailUrl?.startsWith("/")
          ? thumbnailUrl.replace(/^\//, "")
          : null,
    fileName,
    mimeType,
    byteSize: params.prompt.length * 32,
    metadata: {
      original_source: "mock-seed",
    },
    errorMessage: null,
  };
}

function createMockGenerationRun(params: {
  id: string;
  userId: string;
  workspaceId: string;
  createdAt: string;
  draft: StudioDraft;
  errorMessage?: string | null;
  folderId: string | null;
  model: StudioModelDefinition;
  status: GenerationRun["status"];
  outputAssetId?: string | null;
}) {
  const requestMode =
    params.model.requestMode;

  return {
    id: params.id,
    userId: params.userId,
    workspaceId: params.workspaceId,
    folderId: params.folderId,
    modelId: params.model.id,
    modelName: params.model.name,
    kind: params.model.kind,
    provider: "fal",
    requestMode,
    status: params.status,
    prompt: params.draft.prompt,
    createdAt: params.createdAt,
    queueEnteredAt: params.createdAt,
    startedAt:
      params.status === "processing" || params.status === "completed"
        ? params.createdAt
        : null,
    completedAt: params.status === "completed" ? params.createdAt : null,
    failedAt: params.status === "failed" ? params.createdAt : null,
    cancelledAt: params.status === "cancelled" ? params.createdAt : null,
    updatedAt: params.createdAt,
    summary: createGenerationRunSummary(params.model, params.draft),
    outputAssetId: params.outputAssetId ?? null,
    previewUrl: createGenerationRunPreviewUrl(params.model, params.draft),
    errorMessage: params.errorMessage ?? null,
    inputPayload: {
      prompt: params.draft.prompt,
      reference_count: params.draft.references.length,
      request_mode: requestMode,
    },
    inputSettings: {
      aspect_ratio: params.draft.aspectRatio,
      resolution: params.draft.resolution,
      output_format: params.draft.outputFormat,
      duration_seconds: params.draft.durationSeconds,
      include_audio: params.draft.includeAudio,
      image_count: params.draft.imageCount,
      tone: params.draft.tone,
      max_tokens: params.draft.maxTokens,
      temperature: params.draft.temperature,
      voice: params.draft.voice,
      language: params.draft.language,
      speaking_rate: params.draft.speakingRate,
    },
    providerRequestId:
      params.status === "queued" || params.status === "pending"
        ? null
        : `fal_mock_${params.id}`,
    providerStatus:
      params.status === "completed"
        ? "completed"
        : params.status === "processing"
          ? "running"
          : params.status === "failed"
            ? "failed"
            : "queued",
    estimatedCostUsd: null,
    actualCostUsd: null,
    estimatedCredits:
      params.model.requestMode === "background-removal"
        ? 1
        : params.model.kind === "audio"
          ? 2
          : params.model.kind === "video"
            ? 14
            : params.model.kind === "image"
              ? 6
              : 1,
    actualCredits:
      params.status === "completed"
        ? params.model.requestMode === "background-removal"
          ? 1
          : params.model.kind === "audio"
            ? 2
            : params.model.kind === "video"
              ? 14
              : params.model.kind === "image"
                ? 6
                : 1
        : null,
    usageSnapshot: {},
    outputText: params.model.kind === "text" && params.status === "completed"
      ? "Mock generated text output"
      : null,
    pricingSnapshot: {},
    dispatchAttemptCount:
      params.status === "queued" || params.status === "pending" ? 0 : 1,
    dispatchLeaseExpiresAt: null,
    canCancel: params.status === "queued" || params.status === "pending",
    draftSnapshot: createDraftSnapshot(params.draft),
  } satisfies GenerationRun;
}

export function buildStudioDraftMap() {
  return Object.fromEntries(
    STUDIO_MODEL_CATALOG.map((model) => [model.id, toPersistedDraft(createDraft(model))])
  ) as Record<string, PersistedStudioDraft>;
}

export function hydrateDraft(persistedDraft: PersistedStudioDraft, model: StudioModelDefinition) {
  return {
    ...createDraft(model),
    ...persistedDraft,
  };
}

export function createStudioSeedSnapshot(mode: StudioAppMode): StudioWorkspaceSnapshot {
  const folders = createSeedFolders(mode);
  const userId = getUserId(mode);
  const workspaceId = getWorkspaceId(mode);
  const imageModel = getStudioModelById("nano-banana-2");
  const backgroundRemovalModel = getStudioModelById("bria-background-remove");
  const videoModel = getStudioModelById("veo-3.1");
  const audioModel = getStudioModelById("minimax-speech-2.8-hd");
  const textModel = getStudioModelById("gemini-flash");

  const imageDraft = {
    ...createDraft(imageModel),
    prompt:
      "Editorial sneaker still life with chrome reflections and soft studio haze",
  };
  const cutoutDraft = {
    ...createDraft(backgroundRemovalModel),
    prompt: "Remove the background and keep the cutout clean around the product edges.",
  };
  const videoDraft = {
    ...createDraft(videoModel),
    prompt:
      "Slow push-in on a luxury skincare bottle rotating on wet black stone",
  };
  const audioDraft = {
    ...createDraft(audioModel),
    prompt:
      "TryPlayground turns one prompt into images, video, text, speech, and clean production-ready assets in one workspace.",
  };
  const textDraft = {
    ...createDraft(textModel),
    prompt: "Write three hook-driven ad concepts for a premium matcha brand",
  };

  const createdAt = [
    "2026-03-13T17:46:00.000Z",
    "2026-03-13T17:38:00.000Z",
    "2026-03-13T17:19:00.000Z",
    "2026-03-13T17:02:00.000Z",
    "2026-03-13T16:45:00.000Z",
    "2026-03-13T16:28:00.000Z",
    "2026-03-13T15:52:00.000Z",
    "2026-03-13T15:27:00.000Z",
    "2026-03-13T15:08:00.000Z",
    "2026-03-13T17:56:00.000Z",
    "2026-03-13T17:53:00.000Z",
    "2026-03-13T17:49:00.000Z",
    "2026-03-13T17:47:00.000Z",
  ];

  const runFiles: StudioRunFile[] = [
    createRunFile({
      id: SEED_RUN_FILE_IDS.generatedImage,
      runId: SEED_RUN_IDS.completedImage,
      userId,
      sourceType: "generated",
      fileRole: "output",
      previewUrl: MOCK_MEDIA.generatedImage.previewUrl,
      fileName: MOCK_MEDIA.generatedImage.fileName,
      mimeType: MOCK_MEDIA.generatedImage.mimeType,
      mediaWidth: MOCK_MEDIA.generatedImage.mediaWidth,
      mediaHeight: MOCK_MEDIA.generatedImage.mediaHeight,
      createdAt: createdAt[0],
    }),
    createRunFile({
      id: SEED_RUN_FILE_IDS.generatedCutoutImage,
      runId: SEED_RUN_IDS.completedCutoutImage,
      userId,
      sourceType: "generated",
      fileRole: "output",
      previewUrl: MOCK_MEDIA.generatedCutoutImage.previewUrl,
      fileName: MOCK_MEDIA.generatedCutoutImage.fileName,
      mimeType: MOCK_MEDIA.generatedCutoutImage.mimeType,
      mediaWidth: MOCK_MEDIA.generatedCutoutImage.mediaWidth,
      mediaHeight: MOCK_MEDIA.generatedCutoutImage.mediaHeight,
      hasAlpha: true,
      createdAt: createdAt[1],
    }),
    createRunFile({
      id: SEED_RUN_FILE_IDS.generatedVideo,
      runId: SEED_RUN_IDS.completedVideo,
      userId,
      sourceType: "generated",
      fileRole: "output",
      previewUrl: MOCK_MEDIA.generatedVideo.previewUrl,
      fileName: MOCK_MEDIA.generatedVideo.fileName,
      mimeType: MOCK_MEDIA.generatedVideo.mimeType,
      mediaWidth: MOCK_MEDIA.generatedVideo.mediaWidth,
      mediaHeight: MOCK_MEDIA.generatedVideo.mediaHeight,
      mediaDurationSeconds: MOCK_MEDIA.generatedVideo.mediaDurationSeconds,
      createdAt: createdAt[2],
    }),
    createRunFile({
      id: SEED_RUN_FILE_IDS.generatedAudio,
      runId: SEED_RUN_IDS.completedAudio,
      userId,
      sourceType: "generated",
      fileRole: "output",
      previewUrl: MOCK_MEDIA.generatedAudioMp3.previewUrl,
      fileName: MOCK_MEDIA.generatedAudioMp3.fileName,
      mimeType: MOCK_MEDIA.generatedAudioMp3.mimeType,
      mediaWidth: null,
      mediaHeight: null,
      mediaDurationSeconds: MOCK_MEDIA.generatedAudioMp3.mediaDurationSeconds,
      createdAt: createdAt[3],
    }),
    createRunFile({
      id: SEED_RUN_FILE_IDS.uploadedImage,
      runId: null,
      userId,
      sourceType: "uploaded",
      fileRole: "input",
      previewUrl: MOCK_MEDIA.uploadedImage.previewUrl,
      fileName: MOCK_MEDIA.uploadedImage.fileName,
      mimeType: MOCK_MEDIA.uploadedImage.mimeType,
      mediaWidth: MOCK_MEDIA.uploadedImage.mediaWidth,
      mediaHeight: MOCK_MEDIA.uploadedImage.mediaHeight,
      createdAt: createdAt[5],
    }),
    createRunFile({
      id: SEED_RUN_FILE_IDS.uploadedVideo,
      runId: null,
      userId,
      sourceType: "uploaded",
      fileRole: "input",
      previewUrl: MOCK_MEDIA.uploadedVideo.previewUrl,
      fileName: MOCK_MEDIA.uploadedVideo.fileName,
      mimeType: MOCK_MEDIA.uploadedVideo.mimeType,
      mediaWidth: MOCK_MEDIA.uploadedVideo.mediaWidth,
      mediaHeight: MOCK_MEDIA.uploadedVideo.mediaHeight,
      mediaDurationSeconds: MOCK_MEDIA.uploadedVideo.mediaDurationSeconds,
      createdAt: createdAt[6],
    }),
    createRunFile({
      id: SEED_RUN_FILE_IDS.uploadedAudio,
      runId: null,
      userId,
      sourceType: "uploaded",
      fileRole: "input",
      previewUrl: MOCK_MEDIA.uploadedAudio.previewUrl,
      fileName: MOCK_MEDIA.uploadedAudio.fileName,
      mimeType: MOCK_MEDIA.uploadedAudio.mimeType,
      mediaWidth: null,
      mediaHeight: null,
      mediaDurationSeconds: MOCK_MEDIA.uploadedAudio.mediaDurationSeconds,
      createdAt: createdAt[7],
    }),
  ];

  const items = [
    createGeneratedLibraryItem({
      id: SEED_ASSET_IDS.generatedImage,
      runFileId: SEED_RUN_FILE_IDS.generatedImage,
      sourceRunId: SEED_RUN_IDS.completedImage,
      model: imageModel,
      draft: imageDraft,
      createdAt: createdAt[0],
      folderId: folders[0].id,
      previewUrlOverride: MOCK_MEDIA.generatedImage.previewUrl,
      mediaWidthOverride: MOCK_MEDIA.generatedImage.mediaWidth,
      mediaHeightOverride: MOCK_MEDIA.generatedImage.mediaHeight,
      fileNameOverride: MOCK_MEDIA.generatedImage.fileName,
      mimeTypeOverride: MOCK_MEDIA.generatedImage.mimeType,
      runId: SEED_RUN_IDS.completedImage,
      userId,
      workspaceId,
    }),
    createGeneratedLibraryItem({
      id: SEED_ASSET_IDS.generatedCutoutImage,
      runFileId: SEED_RUN_FILE_IDS.generatedCutoutImage,
      sourceRunId: SEED_RUN_IDS.completedCutoutImage,
      model: backgroundRemovalModel,
      draft: cutoutDraft,
      createdAt: createdAt[1],
      folderId: folders[0].id,
      previewUrlOverride: MOCK_MEDIA.generatedCutoutImage.previewUrl,
      mediaWidthOverride: MOCK_MEDIA.generatedCutoutImage.mediaWidth,
      mediaHeightOverride: MOCK_MEDIA.generatedCutoutImage.mediaHeight,
      fileNameOverride: MOCK_MEDIA.generatedCutoutImage.fileName,
      mimeTypeOverride: MOCK_MEDIA.generatedCutoutImage.mimeType,
      hasAlphaOverride: true,
      runId: SEED_RUN_IDS.completedCutoutImage,
      userId,
      workspaceId,
    }),
    createGeneratedLibraryItem({
      id: SEED_ASSET_IDS.generatedVideo,
      runFileId: SEED_RUN_FILE_IDS.generatedVideo,
      sourceRunId: SEED_RUN_IDS.completedVideo,
      model: videoModel,
      draft: videoDraft,
      createdAt: createdAt[2],
      folderId: folders[1].id,
      previewUrlOverride: MOCK_MEDIA.generatedVideo.previewUrl,
      mediaWidthOverride: MOCK_MEDIA.generatedVideo.mediaWidth,
      mediaHeightOverride: MOCK_MEDIA.generatedVideo.mediaHeight,
      mediaDurationSecondsOverride: MOCK_MEDIA.generatedVideo.mediaDurationSeconds,
      fileNameOverride: MOCK_MEDIA.generatedVideo.fileName,
      mimeTypeOverride: MOCK_MEDIA.generatedVideo.mimeType,
      runId: SEED_RUN_IDS.completedVideo,
      userId,
      workspaceId,
    }),
    createGeneratedLibraryItem({
      id: SEED_ASSET_IDS.generatedAudio,
      runFileId: SEED_RUN_FILE_IDS.generatedAudio,
      sourceRunId: SEED_RUN_IDS.completedAudio,
      model: audioModel,
      draft: audioDraft,
      createdAt: createdAt[3],
      folderId: folders[2].id,
      previewUrlOverride: MOCK_MEDIA.generatedAudioMp3.previewUrl,
      mediaDurationSecondsOverride: MOCK_MEDIA.generatedAudioMp3.mediaDurationSeconds,
      fileNameOverride: MOCK_MEDIA.generatedAudioMp3.fileName,
      mimeTypeOverride: MOCK_MEDIA.generatedAudioMp3.mimeType,
      runId: SEED_RUN_IDS.completedAudio,
      userId,
      workspaceId,
    }),
    createGeneratedLibraryItem({
      id: SEED_ASSET_IDS.generatedText,
      runFileId: null,
      sourceRunId: SEED_RUN_IDS.completedText,
      model: textModel,
      draft: textDraft,
      createdAt: createdAt[4],
      folderId: folders[2].id,
      runId: SEED_RUN_IDS.completedText,
      userId,
      workspaceId,
    }),
    createMockUploadedSeedItem({
      id: SEED_ASSET_IDS.uploadedImage,
      runFileId: SEED_RUN_FILE_IDS.uploadedImage,
      userId,
      workspaceId,
      title: "Desk composition reference",
      prompt: "Warm editorial workspace with layered wood tones and late-afternoon window light",
      kind: "image",
      createdAt: createdAt[5],
      folderId: folders[0].id,
      previewUrlOverride: MOCK_MEDIA.uploadedImage.previewUrl,
      mediaWidth: MOCK_MEDIA.uploadedImage.mediaWidth,
      mediaHeight: MOCK_MEDIA.uploadedImage.mediaHeight,
      fileName: MOCK_MEDIA.uploadedImage.fileName,
      mimeType: MOCK_MEDIA.uploadedImage.mimeType,
    }),
    createMockUploadedSeedItem({
      id: SEED_ASSET_IDS.uploadedVideo,
      runFileId: SEED_RUN_FILE_IDS.uploadedVideo,
      userId,
      workspaceId,
      title: "Camera move study",
      prompt: "Slow dolly across a tabletop scene with shallow depth and reflective highlights",
      kind: "video",
      createdAt: createdAt[6],
      folderId: null,
      previewUrlOverride: MOCK_MEDIA.uploadedVideo.previewUrl,
      mediaWidth: MOCK_MEDIA.uploadedVideo.mediaWidth,
      mediaHeight: MOCK_MEDIA.uploadedVideo.mediaHeight,
      mediaDurationSeconds: MOCK_MEDIA.uploadedVideo.mediaDurationSeconds,
      fileName: MOCK_MEDIA.uploadedVideo.fileName,
      mimeType: MOCK_MEDIA.uploadedVideo.mimeType,
    }),
    createMockUploadedSeedItem({
      id: SEED_ASSET_IDS.uploadedAudio,
      runFileId: SEED_RUN_FILE_IDS.uploadedAudio,
      userId,
      workspaceId,
      title: "Voice note reference",
      prompt:
        "Calm, clear product narration with a confident but conversational delivery.",
      kind: "audio",
      createdAt: createdAt[7],
      folderId: folders[1].id,
      previewUrlOverride: MOCK_MEDIA.uploadedAudio.previewUrl,
      mediaDurationSeconds: MOCK_MEDIA.uploadedAudio.mediaDurationSeconds,
      fileName: MOCK_MEDIA.uploadedAudio.fileName,
      mimeType: MOCK_MEDIA.uploadedAudio.mimeType,
    }),
    createMockUploadedSeedItem({
      id: SEED_ASSET_IDS.uploadedText,
      runFileId: null,
      userId,
      workspaceId,
      title: "Prompt draft",
      prompt:
        "Turn the desk scene into three visual directions: luxury editorial, quiet productivity, and cinematic twilight.",
      kind: "text",
      createdAt: createdAt[8],
      folderId: folders[1].id,
    }),
  ];

  const runs: GenerationRun[] = [
    createMockGenerationRun({
      id: SEED_RUN_IDS.completedImage,
      userId,
      workspaceId,
      createdAt: createdAt[0],
      draft: imageDraft,
      folderId: folders[0].id,
      model: imageModel,
      status: "completed",
      outputAssetId: items[0].id,
    }),
    createMockGenerationRun({
      id: SEED_RUN_IDS.completedCutoutImage,
      userId,
      workspaceId,
      createdAt: createdAt[1],
      draft: cutoutDraft,
      folderId: folders[0].id,
      model: backgroundRemovalModel,
      status: "completed",
      outputAssetId: items[1].id,
    }),
    createMockGenerationRun({
      id: SEED_RUN_IDS.completedVideo,
      userId,
      workspaceId,
      createdAt: createdAt[2],
      draft: videoDraft,
      folderId: folders[1].id,
      model: videoModel,
      status: "completed",
      outputAssetId: items[2].id,
    }),
    createMockGenerationRun({
      id: SEED_RUN_IDS.completedAudio,
      userId,
      workspaceId,
      createdAt: createdAt[3],
      draft: audioDraft,
      folderId: folders[2].id,
      model: audioModel,
      status: "completed",
      outputAssetId: items[3].id,
    }),
    createMockGenerationRun({
      id: SEED_RUN_IDS.completedText,
      userId,
      workspaceId,
      createdAt: createdAt[4],
      draft: textDraft,
      folderId: folders[2].id,
      model: textModel,
      status: "completed",
      outputAssetId: items[4].id,
    }),
    createMockGenerationRun({
      id: SEED_RUN_IDS.queuedImage,
      userId,
      workspaceId,
      createdAt: createdAt[9],
      draft: {
        ...createDraft(imageModel),
        prompt:
          "High-gloss studio product shot of a mineral water bottle with drifting condensation",
      },
      folderId: null,
      model: imageModel,
      status: "queued",
    }),
    createMockGenerationRun({
      id: SEED_RUN_IDS.processingVideo,
      userId,
      workspaceId,
      createdAt: createdAt[10],
      draft: {
        ...createDraft(videoModel),
        prompt:
          "Floating camera pass through a luxury hotel lobby with reflective marble and warm daylight",
      },
      folderId: null,
      model: videoModel,
      status: "processing",
    }),
    createMockGenerationRun({
      id: SEED_RUN_IDS.processingAudio,
      userId,
      workspaceId,
      createdAt: createdAt[11],
      draft: {
        ...createDraft(audioModel),
        prompt:
          "A friendly onboarding voiceover that explains how to group assets into folders and reuse them.",
      },
      folderId: folders[2].id,
      model: audioModel,
      status: "processing",
    }),
    createMockGenerationRun({
      id: SEED_RUN_IDS.failedText,
      userId,
      workspaceId,
      createdAt: createdAt[12],
      draft: {
        ...createDraft(textModel),
        prompt:
          "Draft five launch angles for a creator-focused AI studio and force a fail state",
      },
      errorMessage: "Mock Fal response timeout while generating text output.",
      folderId: folders[1].id,
      model: textModel,
      status: "failed",
    }),
  ];

  return {
    schemaVersion: STUDIO_STATE_SCHEMA_VERSION,
    mode,
    profile: createProfile(mode),
    providerSettings: {
      falApiKey: "",
      lastValidatedAt: null,
    },
    creditBalance: createCreditBalance(mode),
    activeCreditPack: createActiveCreditPack(mode),
    queueSettings: getDefaultQueueSettings(mode),
    folders,
    folderItems: createFolderMemberships(items),
    runFiles,
    libraryItems: items,
    generationRuns: runs,
    draftsByModelId: buildStudioDraftMap(),
    selectedModelId: STUDIO_MODEL_CATALOG[0].id,
    gallerySizeLevel: 2,
  };
}
