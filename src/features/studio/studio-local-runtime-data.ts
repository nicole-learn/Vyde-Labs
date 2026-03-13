import {
  STUDIO_MODEL_CATALOG,
  getStudioModelById,
} from "./studio-model-catalog";
import type {
  GenerationRun,
  LibraryItem,
  StudioDraft,
  StudioFolder,
  StudioModelDefinition,
  StudioModelKind,
} from "./types";

export const LOCAL_STUDIO_WORKSPACE_ID = "workspace-local";
const SEED_BASE_TIMESTAMP = "2026-03-13T18:00:00.000Z";
const SEED_FOLDER_IDS = {
  references: "folder-references",
  prompts: "folder-prompts",
  concepts: "folder-concepts",
} as const;
const SEED_RUN_IDS = {
  completedImage: "run-completed-image",
  completedVideo: "run-completed-video",
  completedText: "run-completed-text",
  queuedImage: "run-queued-image",
  processingVideo: "run-processing-video",
  failedText: "run-failed-text",
} as const;
const SEED_ASSET_IDS = {
  generatedImage: "asset-generated-image",
  generatedVideo: "asset-generated-video",
  generatedText: "asset-generated-text",
  uploadedImage: "asset-uploaded-image",
  uploadedVideo: "asset-uploaded-video",
  uploadedText: "asset-uploaded-text",
} as const;

export function createStudioId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDraft(model: StudioModelDefinition): StudioDraft {
  return {
    ...model.defaultDraft,
    references: [],
  };
}

export function createDraftSnapshot(
  draft: StudioDraft
): GenerationRun["draftSnapshot"] {
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
  const badge = kind === "video" ? "VIDEO" : kind === "text" ? "TEXT" : "IMAGE";
  const [backgroundStart, backgroundEnd] = background.split("|");
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
      <text x="96" y="250" fill="#ffffff" font-size="76" font-weight="700" font-family="Arial, Helvetica, sans-serif">${title}</text>
      <foreignObject x="96" y="300" width="850" height="300">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, Helvetica, sans-serif; font-size: 34px; line-height: 1.45; color: rgba(255,255,255,0.78);">
          ${subtitle}
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
  };
}

function parseAspectRatioValue(value: string): number {
  const [width, height] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 1;
  }

  return width / height;
}

export function createGeneratedLibraryItem(params: {
  id?: string;
  model: StudioModelDefinition;
  draft: StudioDraft;
  createdAt: string;
  folderId: string | null;
  runId?: string | null;
}): LibraryItem {
  const title = params.draft.prompt.trim().slice(0, 40) || params.model.name;
  const backgroundPairs = getPreviewBackgroundPairs();

  if (params.model.kind === "text") {
    const body = [
      `Creative direction for: ${params.draft.prompt.trim() || "Untitled request"}.`,
      `Tone: ${params.draft.tone}. Keep the language concise, useful, and ready to evolve into image or video prompts.`,
      `Suggested next step: turn the strongest paragraph into a shot list or visual prompt sequence.`,
    ].join(" ");

    return {
      id: params.id ?? createStudioId("asset"),
      workspaceId: LOCAL_STUDIO_WORKSPACE_ID,
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
      aspectRatio: 0.82,
      folderId: params.folderId,
      storagePath: null,
      mimeType: "text/plain",
      byteSize: body.length,
      errorMessage: null,
    };
  }

  const previewUrl = createPreviewSvg({
    title: params.model.name,
    subtitle:
      params.draft.prompt.trim() || "Fal-powered generation preview placeholder",
    kind: params.model.kind,
    background: backgroundPairs[params.model.kind],
  });

  return {
    id: params.id ?? createStudioId("asset"),
    workspaceId: LOCAL_STUDIO_WORKSPACE_ID,
    title,
    kind: params.model.kind,
    source: "generated",
    role: "generated_output",
    previewUrl,
    thumbnailUrl: previewUrl,
    contentText: null,
    createdAt: params.createdAt,
    updatedAt: params.createdAt,
    modelId: params.model.id,
    runId: params.runId ?? null,
    provider: "fal",
    status: "ready",
    prompt: params.draft.prompt,
    meta:
      params.model.kind === "image"
        ? `${params.model.name} • ${params.draft.aspectRatio} • ${params.draft.resolution}`
        : `${params.model.name} • ${params.draft.durationSeconds}s • ${params.draft.resolution}`,
    aspectRatio: parseAspectRatioValue(params.draft.aspectRatio),
    folderId: params.folderId,
    storagePath: null,
    mimeType: params.model.kind === "video" ? "video/mp4" : "image/png",
    byteSize: null,
    errorMessage: null,
  };
}

export function createGenerationRunSummary(
  model: StudioModelDefinition,
  draft: StudioDraft
) {
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

function createSeedFolders(): StudioFolder[] {
  const now = SEED_BASE_TIMESTAMP;
  return [
    {
      id: SEED_FOLDER_IDS.references,
      workspaceId: LOCAL_STUDIO_WORKSPACE_ID,
      name: "References",
      createdAt: now,
      updatedAt: now,
      sortOrder: 0,
    },
    {
      id: SEED_FOLDER_IDS.prompts,
      workspaceId: LOCAL_STUDIO_WORKSPACE_ID,
      name: "Prompts",
      createdAt: now,
      updatedAt: now,
      sortOrder: 1,
    },
    {
      id: SEED_FOLDER_IDS.concepts,
      workspaceId: LOCAL_STUDIO_WORKSPACE_ID,
      name: "Concepts",
      createdAt: now,
      updatedAt: now,
      sortOrder: 2,
    },
  ];
}

function createMockUploadedSeedItem(params: {
  id: string;
  title: string;
  prompt: string;
  kind: "image" | "video" | "text";
  createdAt: string;
  folderId: string | null;
}): LibraryItem {
  const previewUrl =
    params.kind === "text"
      ? null
      : createPreviewSvg({
          title: params.title,
          subtitle: params.prompt,
          kind: params.kind,
          background:
            params.kind === "video"
              ? "#1d4ed8|#0f172a"
              : "#38bdf8|#082f49",
        });

  return {
    id: params.id,
    workspaceId: LOCAL_STUDIO_WORKSPACE_ID,
    title: params.title,
    kind: params.kind,
    source: "uploaded",
    role: params.kind === "text" ? "text_note" : "uploaded_source",
    previewUrl,
    thumbnailUrl: previewUrl,
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
          : "Uploaded image • Mock source",
    aspectRatio:
      params.kind === "video" ? 16 / 9 : params.kind === "image" ? 4 / 5 : 0.82,
    folderId: params.folderId,
    storagePath: null,
    mimeType:
      params.kind === "text"
        ? "text/plain"
        : params.kind === "video"
          ? "video/mp4"
          : "image/png",
    byteSize: params.prompt.length * 32,
    errorMessage: null,
  };
}

function createMockGenerationRun(params: {
  id?: string;
  createdAt: string;
  draft: StudioDraft;
  errorMessage?: string | null;
  folderId: string | null;
  model: StudioModelDefinition;
  progressPercent?: number | null;
  status: GenerationRun["status"];
}) {
  return {
    id: params.id ?? createStudioId("run"),
    workspaceId: LOCAL_STUDIO_WORKSPACE_ID,
    folderId: params.folderId,
    modelId: params.model.id,
    modelName: params.model.name,
    kind: params.model.kind,
    provider: "fal",
    requestMode:
      params.model.kind === "image"
        ? "text-to-image"
        : params.model.kind === "video"
          ? "text-to-video"
          : "chat",
    status: params.status,
    prompt: params.draft.prompt,
    createdAt: params.createdAt,
    startedAt:
      params.status === "processing" || params.status === "completed"
        ? params.createdAt
        : null,
    completedAt: params.status === "completed" ? params.createdAt : null,
    summary: createGenerationRunSummary(params.model, params.draft),
    outputAssetId: null,
    previewUrl: createGenerationRunPreviewUrl(params.model, params.draft),
    progressPercent: params.progressPercent ?? null,
    errorMessage: params.errorMessage ?? null,
    draftSnapshot: createDraftSnapshot(params.draft),
  } satisfies GenerationRun;
}

export function buildStudioDraftMap() {
  return Object.fromEntries(
    STUDIO_MODEL_CATALOG.map((model) => [model.id, createDraft(model)])
  ) as Record<string, StudioDraft>;
}

export function createStudioSeedState(): {
  folders: StudioFolder[];
  items: LibraryItem[];
  runs: GenerationRun[];
} {
  const folders = createSeedFolders();
  const imageModel = getStudioModelById("nano-banana-2");
  const videoModel = getStudioModelById("veo-3.1");
  const textModel = getStudioModelById("gemini-flash");

  const imageDraft = {
    ...createDraft(imageModel),
    prompt:
      "Editorial sneaker still life with chrome reflections and soft studio haze",
  };
  const videoDraft = {
    ...createDraft(videoModel),
    prompt:
      "Slow push-in on a luxury skincare bottle rotating on wet black stone",
  };
  const textDraft = {
    ...createDraft(textModel),
    prompt: "Write three hook-driven ad concepts for a premium matcha brand",
  };

  const createdAt = [
    "2026-03-13T17:46:00.000Z",
    "2026-03-13T17:19:00.000Z",
    "2026-03-13T16:45:00.000Z",
    "2026-03-13T16:28:00.000Z",
    "2026-03-13T15:52:00.000Z",
    "2026-03-13T15:08:00.000Z",
    "2026-03-13T17:56:00.000Z",
    "2026-03-13T17:53:00.000Z",
    "2026-03-13T17:51:00.000Z",
  ];

  const items = [
    createGeneratedLibraryItem({
      id: SEED_ASSET_IDS.generatedImage,
      model: imageModel,
      draft: imageDraft,
      createdAt: createdAt[0],
      folderId: folders[0].id,
      runId: SEED_RUN_IDS.completedImage,
    }),
    createGeneratedLibraryItem({
      id: SEED_ASSET_IDS.generatedVideo,
      model: videoModel,
      draft: videoDraft,
      createdAt: createdAt[1],
      folderId: folders[1].id,
      runId: SEED_RUN_IDS.completedVideo,
    }),
    createGeneratedLibraryItem({
      id: SEED_ASSET_IDS.generatedText,
      model: textModel,
      draft: textDraft,
      createdAt: createdAt[2],
      folderId: folders[2].id,
      runId: SEED_RUN_IDS.completedText,
    }),
    createMockUploadedSeedItem({
      id: SEED_ASSET_IDS.uploadedImage,
      title: "Desk composition reference",
      prompt: "Warm editorial workspace with layered wood tones and late-afternoon window light",
      kind: "image",
      createdAt: createdAt[3],
      folderId: folders[0].id,
    }),
    createMockUploadedSeedItem({
      id: SEED_ASSET_IDS.uploadedVideo,
      title: "Camera move study",
      prompt: "Slow dolly across a tabletop scene with shallow depth and reflective highlights",
      kind: "video",
      createdAt: createdAt[4],
      folderId: null,
    }),
    createMockUploadedSeedItem({
      id: SEED_ASSET_IDS.uploadedText,
      title: "Prompt draft",
      prompt:
        "Turn the desk scene into three visual directions: luxury editorial, quiet productivity, and cinematic twilight.",
      kind: "text",
      createdAt: createdAt[5],
      folderId: folders[1].id,
    }),
  ];

  const runs: GenerationRun[] = [
    {
      id: SEED_RUN_IDS.completedImage,
      workspaceId: LOCAL_STUDIO_WORKSPACE_ID,
      folderId: folders[0].id,
      modelId: imageModel.id,
      modelName: imageModel.name,
      kind: imageModel.kind,
      provider: "fal",
      requestMode: "text-to-image",
      status: "completed",
      prompt: imageDraft.prompt,
      createdAt: createdAt[0],
      startedAt: createdAt[0],
      completedAt: createdAt[0],
      summary: createGenerationRunSummary(imageModel, imageDraft),
      outputAssetId: items[0].id,
      previewUrl: items[0].thumbnailUrl,
      progressPercent: 100,
      errorMessage: null,
      draftSnapshot: createDraftSnapshot(imageDraft),
    },
    {
      id: SEED_RUN_IDS.completedVideo,
      workspaceId: LOCAL_STUDIO_WORKSPACE_ID,
      folderId: folders[1].id,
      modelId: videoModel.id,
      modelName: videoModel.name,
      kind: videoModel.kind,
      provider: "fal",
      requestMode: "text-to-video",
      status: "completed",
      prompt: videoDraft.prompt,
      createdAt: createdAt[1],
      startedAt: createdAt[1],
      completedAt: createdAt[1],
      summary: createGenerationRunSummary(videoModel, videoDraft),
      outputAssetId: items[1].id,
      previewUrl: items[1].thumbnailUrl,
      progressPercent: 100,
      errorMessage: null,
      draftSnapshot: createDraftSnapshot(videoDraft),
    },
    {
      id: SEED_RUN_IDS.completedText,
      workspaceId: LOCAL_STUDIO_WORKSPACE_ID,
      folderId: folders[2].id,
      modelId: textModel.id,
      modelName: textModel.name,
      kind: textModel.kind,
      provider: "fal",
      requestMode: "chat",
      status: "completed",
      prompt: textDraft.prompt,
      createdAt: createdAt[2],
      startedAt: createdAt[2],
      completedAt: createdAt[2],
      summary: createGenerationRunSummary(textModel, textDraft),
      outputAssetId: items[2].id,
      previewUrl: null,
      progressPercent: 100,
      errorMessage: null,
      draftSnapshot: createDraftSnapshot(textDraft),
    },
    createMockGenerationRun({
      id: SEED_RUN_IDS.queuedImage,
      createdAt: createdAt[6],
      draft: {
        ...createDraft(imageModel),
        prompt: "High-gloss studio product shot of a mineral water bottle with drifting condensation",
      },
      folderId: null,
      model: imageModel,
      progressPercent: 8,
      status: "queued",
    }),
    createMockGenerationRun({
      id: SEED_RUN_IDS.processingVideo,
      createdAt: createdAt[7],
      draft: {
        ...createDraft(videoModel),
        prompt: "Floating camera pass through a luxury hotel lobby with reflective marble and warm daylight",
      },
      folderId: null,
      model: videoModel,
      progressPercent: 62,
      status: "processing",
    }),
    createMockGenerationRun({
      id: SEED_RUN_IDS.failedText,
      createdAt: createdAt[8],
      draft: {
        ...createDraft(textModel),
        prompt: "Draft five launch angles for a creator-focused AI studio and force a fail state",
      },
      errorMessage: "Mock Fal response timeout while generating text output.",
      folderId: folders[1].id,
      model: textModel,
      status: "failed",
    }),
  ];

  return { folders, items, runs };
}
