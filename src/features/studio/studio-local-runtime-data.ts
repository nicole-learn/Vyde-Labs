import type { StudioAppMode } from "./studio-app-mode";
import { STUDIO_MODEL_CATALOG } from "./studio-model-catalog";
import { createDefaultStudioEnabledModelIds } from "./studio-model-configuration";
import { createAudioThumbnailForModel } from "./studio-asset-thumbnails";
import type {
  GenerationRun,
  PersistedStudioDraft,
  StudioCreditBalance,
  StudioCreditPack,
  StudioDraft,
  StudioModelDefinition,
  StudioProfile,
  StudioQueueSettings,
  StudioWorkspaceSnapshot,
} from "./types";

export const LOCAL_STUDIO_WORKSPACE_ID = "workspace-local";
export const HOSTED_STUDIO_WORKSPACE_ID = "workspace-hosted";
export const LOCAL_STUDIO_USER_ID = "user-local";
export const HOSTED_STUDIO_USER_ID = "user-hosted";
export const STUDIO_STATE_SCHEMA_VERSION = 7;

const SEED_BASE_TIMESTAMP = "2026-03-14T00:00:00.000Z";

export function createStudioId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function getUserId(mode: StudioAppMode) {
  return mode === "hosted" ? HOSTED_STUDIO_USER_ID : LOCAL_STUDIO_USER_ID;
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
    email: mode === "hosted" ? "nicole@tryplayground.ai" : "local@tryplayground.ai",
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
    balanceCredits: 5,
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

export function createDraft(model: StudioModelDefinition): StudioDraft {
  return {
    ...model.defaultDraft,
    references: [],
    startFrame: null,
    endFrame: null,
  };
}

export function toPersistedDraft(draft: StudioDraft): PersistedStudioDraft {
  return {
    prompt: draft.prompt,
    negativePrompt: draft.negativePrompt,
    videoInputMode: draft.videoInputMode,
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

export function createDraftSnapshot(
  draft: StudioDraft
): GenerationRun["draftSnapshot"] {
  return {
    ...toPersistedDraft(draft),
    referenceCount: draft.references.length,
    startFrameCount: draft.startFrame ? 1 : 0,
    endFrameCount: draft.endFrame ? 1 : 0,
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

function createPreviewSvgDataUrl(params: {
  title: string;
  subtitle: string;
  startColor: string;
  endColor: string;
}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200" fill="none">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${params.startColor}" />
        <stop offset="100%" stop-color="${params.endColor}" />
      </linearGradient>
    </defs>
    <rect width="1600" height="1200" rx="72" fill="url(#bg)" />
    <circle cx="1380" cy="196" r="220" fill="rgba(255,255,255,0.12)" />
    <circle cx="248" cy="1008" r="280" fill="rgba(255,255,255,0.08)" />
    <text x="96" y="184" fill="#ffffff" font-size="98" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(params.title)}</text>
    <text x="96" y="274" fill="rgba(255,255,255,0.85)" font-size="42" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(params.subtitle)}</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createGenerationRunPreviewUrl(
  model: StudioModelDefinition,
  draft: StudioDraft
) {
  if (model.kind === "text") {
    return null;
  }

  if (model.kind === "audio") {
    return createAudioThumbnailForModel({
      model,
      title: model.name,
      subtitle: draft.prompt.trim() || "Queued audio generation",
    });
  }

  const previewTitle = model.kind === "video" ? "Queued video" : "Queued image";
  const previewSubtitle =
    draft.prompt.trim() || (model.requestMode === "background-removal"
      ? "Waiting for background removal input"
      : model.name);

  if (model.kind === "video") {
    return createPreviewSvgDataUrl({
      title: previewTitle,
      subtitle: previewSubtitle,
      startColor: "#1d4ed8",
      endColor: "#0f172a",
    });
  }

  return createPreviewSvgDataUrl({
    title:
      model.requestMode === "background-removal" ? "Background removal" : previewTitle,
    subtitle: previewSubtitle,
    startColor: "#0f766e",
    endColor: "#082f49",
  });
}

export function createGenerationRunSummary(
  model: StudioModelDefinition,
  draft: StudioDraft
) {
  const prompt = draft.prompt.trim();
  if (!prompt) {
    if (model.requestMode === "background-removal") {
      return "Remove the background from the selected image.";
    }

    return model.name;
  }

  return prompt.length > 120 ? `${prompt.slice(0, 117).trimEnd()}...` : prompt;
}

export function buildStudioDraftMap() {
  return Object.fromEntries(
    STUDIO_MODEL_CATALOG.map((model) => [model.id, toPersistedDraft(createDraft(model))])
  ) as Record<string, PersistedStudioDraft>;
}

export function hydrateDraft(
  persistedDraft: PersistedStudioDraft,
  model: StudioModelDefinition
) {
  const hydratedDraft = {
    ...createDraft(model),
    ...persistedDraft,
  };

  if (model.kind === "text" && model.maxOutputTokens) {
    hydratedDraft.maxTokens = model.maxOutputTokens;
  }

  return hydratedDraft;
}

export function createStudioSeedSnapshot(mode: StudioAppMode): StudioWorkspaceSnapshot {
  return {
    schemaVersion: STUDIO_STATE_SCHEMA_VERSION,
    mode,
    profile: createProfile(mode),
    providerSettings: {
      falApiKey: "",
      falLastValidatedAt: null,
      openaiApiKey: "",
      openaiLastValidatedAt: null,
      anthropicApiKey: "",
      anthropicLastValidatedAt: null,
      geminiApiKey: "",
      geminiLastValidatedAt: null,
    },
    creditBalance: createCreditBalance(mode),
    activeCreditPack: createActiveCreditPack(mode),
    modelConfiguration: {
      enabledModelIds: createDefaultStudioEnabledModelIds(),
      updatedAt: SEED_BASE_TIMESTAMP,
    },
    queueSettings: getDefaultQueueSettings(mode),
    folders: [],
    runFiles: [],
    libraryItems: [],
    generationRuns: [],
    draftsByModelId: buildStudioDraftMap(),
    selectedModelId: "nano-banana-2",
    gallerySizeLevel: 3,
  };
}
