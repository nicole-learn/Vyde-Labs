"use client";

import { STUDIO_MODELS, getModelById } from "./catalog";
import type {
  GenerationRun,
  LibraryItem,
  StudioDraft,
  StudioFolder,
  StudioModelDefinition,
  StudioModelKind,
} from "./types";

export function createId(prefix: string) {
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

function parseAspectRatioValue(value: string): number {
  const [width, height] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 1;
  }

  return width / height;
}

export function createGeneratedItem(params: {
  model: StudioModelDefinition;
  draft: StudioDraft;
  createdAt: string;
  folderId: string | null;
}): LibraryItem {
  const title = params.draft.prompt.trim().slice(0, 40) || params.model.name;
  const backgroundPairs: Record<StudioModelKind, string> = {
    image: "#f97316|#7c3aed",
    video: "#22c55e|#0ea5e9",
    text: "#6366f1|#8b5cf6",
  };

  if (params.model.kind === "text") {
    const body = [
      `Creative direction for: ${params.draft.prompt.trim() || "Untitled request"}.`,
      `Tone: ${params.draft.tone}. Keep the language concise, useful, and ready to evolve into image or video prompts.`,
      `Suggested next step: turn the strongest paragraph into a shot list or visual prompt sequence.`,
    ].join(" ");

    return {
      id: createId("asset"),
      title,
      kind: "text",
      source: "generated",
      previewUrl: null,
      contentText: body,
      createdAt: params.createdAt,
      modelId: params.model.id,
      prompt: params.draft.prompt,
      meta: `${params.model.name} • ${params.draft.maxTokens} max tokens • ${params.draft.tone}`,
      aspectRatio: 0.82,
      folderId: params.folderId,
    };
  }

  return {
    id: createId("asset"),
    title,
    kind: params.model.kind,
    source: "generated",
    previewUrl: createPreviewSvg({
      title: params.model.name,
      subtitle:
        params.draft.prompt.trim() || "Fal-powered generation preview placeholder",
      kind: params.model.kind,
      background: backgroundPairs[params.model.kind],
    }),
    contentText: null,
    createdAt: params.createdAt,
    modelId: params.model.id,
    prompt: params.draft.prompt,
    meta:
      params.model.kind === "image"
        ? `${params.model.name} • ${params.draft.aspectRatio} • ${params.draft.resolution}`
        : `${params.model.name} • ${params.draft.durationSeconds}s • ${params.draft.resolution}`,
    aspectRatio: parseAspectRatioValue(params.draft.aspectRatio),
    folderId: params.folderId,
  };
}

export function createRunSummary(
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

function createSeedFolders() {
  const now = new Date().toISOString();
  return [
    { id: createId("folder"), name: "References", createdAt: now },
    { id: createId("folder"), name: "Prompts", createdAt: now },
    { id: createId("folder"), name: "Concepts", createdAt: now },
  ] satisfies StudioFolder[];
}

export function buildDraftMap() {
  return Object.fromEntries(
    STUDIO_MODELS.map((model) => [model.id, createDraft(model)])
  ) as Record<string, StudioDraft>;
}

export function createSeedState() {
  const folders = createSeedFolders();
  const imageModel = getModelById("nano-banana-2");
  const videoModel = getModelById("veo-3.1");
  const textModel = getModelById("llm-router-gpt4-mini");
  const now = Date.now();

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
    new Date(now - 1000 * 60 * 14).toISOString(),
    new Date(now - 1000 * 60 * 41).toISOString(),
    new Date(now - 1000 * 60 * 75).toISOString(),
  ];

  const items = [
    createGeneratedItem({
      model: imageModel,
      draft: imageDraft,
      createdAt: createdAt[0],
      folderId: folders[0].id,
    }),
    createGeneratedItem({
      model: videoModel,
      draft: videoDraft,
      createdAt: createdAt[1],
      folderId: folders[1].id,
    }),
    createGeneratedItem({
      model: textModel,
      draft: textDraft,
      createdAt: createdAt[2],
      folderId: folders[2].id,
    }),
  ];

  const runs: GenerationRun[] = [
    {
      id: createId("run"),
      modelId: imageModel.id,
      modelName: imageModel.name,
      kind: imageModel.kind,
      status: "completed",
      prompt: imageDraft.prompt,
      createdAt: createdAt[0],
      summary: createRunSummary(imageModel, imageDraft),
      outputItemId: items[0].id,
      draftSnapshot: createDraftSnapshot(imageDraft),
    },
    {
      id: createId("run"),
      modelId: videoModel.id,
      modelName: videoModel.name,
      kind: videoModel.kind,
      status: "completed",
      prompt: videoDraft.prompt,
      createdAt: createdAt[1],
      summary: createRunSummary(videoModel, videoDraft),
      outputItemId: items[1].id,
      draftSnapshot: createDraftSnapshot(videoDraft),
    },
    {
      id: createId("run"),
      modelId: textModel.id,
      modelName: textModel.name,
      kind: textModel.kind,
      status: "completed",
      prompt: textDraft.prompt,
      createdAt: createdAt[2],
      summary: createRunSummary(textModel, textDraft),
      outputItemId: items[2].id,
      draftSnapshot: createDraftSnapshot(textDraft),
    },
  ];

  return { folders, items, runs };
}
