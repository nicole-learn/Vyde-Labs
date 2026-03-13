import type {
  StudioModelDefinition,
  StudioModelSection,
} from "./types";

const DEFAULT_IMAGE_DRAFT = {
  prompt: "",
  negativePrompt: "",
  videoInputMode: "references" as const,
  aspectRatio: "1:1",
  resolution: "",
  outputFormat: "png",
  imageCount: 1,
  durationSeconds: 6,
  includeAudio: false,
  tone: "Balanced",
  maxTokens: 2048,
  temperature: 0.7,
  voice: "",
  language: "English",
  speakingRate: "1x",
};

const DEFAULT_VIDEO_DRAFT = {
  ...DEFAULT_IMAGE_DRAFT,
  aspectRatio: "16:9",
  resolution: "1080p",
  outputFormat: "mp4",
  durationSeconds: 6,
  includeAudio: true,
};

const DEFAULT_TEXT_DRAFT = {
  ...DEFAULT_IMAGE_DRAFT,
  outputFormat: "text",
  maxTokens: 4096,
};

const DEFAULT_AUDIO_DRAFT = {
  ...DEFAULT_IMAGE_DRAFT,
  aspectRatio: "",
  resolution: "",
  outputFormat: "mp3",
  durationSeconds: 0,
  maxTokens: 4096,
};

const COMMON_IMAGE_RATIOS = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
] as const;

const COMMON_IMAGE_FORMATS = ["png", "jpeg", "webp"] as const;
const COMMON_TEXT_MAX_TOKENS = [1024, 2048, 4096, 8192] as const;
type DraftPatch = Partial<StudioModelDefinition["defaultDraft"]>;

function createTextModel(
  config: Pick<
    StudioModelDefinition,
    | "id"
    | "name"
    | "providerLabel"
    | "description"
    | "heroGradient"
    | "tags"
    | "pricing"
  >
): StudioModelDefinition {
  return {
    ...config,
    kind: "text",
    section: "text",
    requestMode: "chat",
    promptPlaceholder: "Ask anything...",
    supportsNegativePrompt: false,
    supportsReferences: true,
    maxReferenceFiles: 10,
    acceptedReferenceKinds: ["image", "video", "audio", "document"],
    maxTokenOptions: [...COMMON_TEXT_MAX_TOKENS],
    defaultDraft: {
      ...DEFAULT_TEXT_DRAFT,
    },
  };
}

function createSpeechModel(
  config: Pick<
    StudioModelDefinition,
    | "id"
    | "name"
    | "providerLabel"
    | "description"
    | "heroGradient"
    | "tags"
    | "pricing"
  > &
    Partial<
      Pick<
      StudioModelDefinition,
      "outputFormatOptions" | "voiceOptions" | "languageOptions" | "speakingRateOptions"
      >
    > & {
      defaultDraft?: DraftPatch;
    }
): StudioModelDefinition {
  return {
    ...config,
    kind: "audio",
    section: "audio",
    requestMode: "text-to-speech",
    promptPlaceholder: "Write the narration or speech you want to synthesize...",
    supportsNegativePrompt: false,
    supportsReferences: false,
    defaultDraft: {
      ...DEFAULT_AUDIO_DRAFT,
      ...(config.defaultDraft ?? {}),
    },
  };
}

function createImageModel(
  config: Pick<
    StudioModelDefinition,
    | "id"
    | "name"
    | "providerLabel"
    | "description"
    | "heroGradient"
    | "tags"
    | "pricing"
  > &
    Partial<
      Pick<
        StudioModelDefinition,
        | "supportsReferences"
        | "supportsNegativePrompt"
        | "maxReferenceFiles"
        | "minimumReferenceFiles"
        | "acceptedReferenceKinds"
        | "aspectRatioOptions"
        | "resolutionOptions"
        | "outputFormatOptions"
        | "requiresPrompt"
        | "promptPlaceholder"
        | "requestMode"
      >
    > & {
      defaultDraft?: DraftPatch;
    }
): StudioModelDefinition {
  return {
    ...config,
    kind: "image",
    section: "images",
    requestMode: config.requestMode ?? "text-to-image",
    promptPlaceholder:
      config.promptPlaceholder ?? "Describe the image you want to create...",
    supportsNegativePrompt: config.supportsNegativePrompt ?? false,
    supportsReferences: config.supportsReferences ?? false,
    minimumReferenceFiles: config.minimumReferenceFiles,
    maxReferenceFiles: config.maxReferenceFiles,
    acceptedReferenceKinds: config.acceptedReferenceKinds,
    aspectRatioOptions: config.aspectRatioOptions,
    resolutionOptions: config.resolutionOptions,
    outputFormatOptions: config.outputFormatOptions,
    requiresPrompt: config.requiresPrompt,
    defaultDraft: {
      ...DEFAULT_IMAGE_DRAFT,
      aspectRatio: config.aspectRatioOptions?.[0] ?? DEFAULT_IMAGE_DRAFT.aspectRatio,
      resolution: config.resolutionOptions?.[0] ?? DEFAULT_IMAGE_DRAFT.resolution,
      outputFormat:
        config.outputFormatOptions?.[0] ?? DEFAULT_IMAGE_DRAFT.outputFormat,
      ...(config.defaultDraft ?? {}),
    },
  };
}

function createVideoModel(
  config: Pick<
    StudioModelDefinition,
    | "id"
    | "name"
    | "providerLabel"
    | "description"
    | "heroGradient"
    | "tags"
    | "pricing"
  > &
    Pick<
      StudioModelDefinition,
      | "supportsReferences"
      | "acceptedReferenceKinds"
      | "maxReferenceFiles"
      | "durationOptions"
    > &
    Partial<
      Pick<
        StudioModelDefinition,
        | "supportsNegativePrompt"
        | "supportsFrameInputs"
        | "supportsEndFrame"
        | "minimumReferenceFiles"
        | "aspectRatioOptions"
        | "resolutionOptions"
      >
    > & {
      defaultDraft?: DraftPatch;
    }
): StudioModelDefinition {
  return {
    ...config,
    kind: "video",
    section: "videos",
    requestMode: config.supportsFrameInputs ? "text-to-video" : "image-to-video",
    promptPlaceholder: "Describe the video you want to generate...",
    supportsNegativePrompt: config.supportsNegativePrompt ?? true,
    supportsFrameInputs: config.supportsFrameInputs,
    supportsEndFrame: config.supportsEndFrame,
    supportsReferences: config.supportsReferences,
    minimumReferenceFiles: config.minimumReferenceFiles,
    maxReferenceFiles: config.maxReferenceFiles,
    acceptedReferenceKinds: config.acceptedReferenceKinds,
    aspectRatioOptions: config.aspectRatioOptions,
    resolutionOptions: config.resolutionOptions,
    outputFormatOptions: ["mp4"],
    durationOptions: config.durationOptions,
    defaultDraft: {
      ...DEFAULT_VIDEO_DRAFT,
      videoInputMode: config.supportsFrameInputs ? "frames" : "references",
      aspectRatio: config.aspectRatioOptions?.[0] ?? DEFAULT_VIDEO_DRAFT.aspectRatio,
      resolution: config.resolutionOptions?.[0] ?? DEFAULT_VIDEO_DRAFT.resolution,
      durationSeconds:
        config.durationOptions?.[0] ?? DEFAULT_VIDEO_DRAFT.durationSeconds,
      ...(config.defaultDraft ?? {}),
    },
  };
}

export const STUDIO_MODEL_CATALOG: StudioModelDefinition[] = [
  createImageModel({
    id: "bria-rmbg-2",
    name: "Bria RMBG 2.0",
    providerLabel: "Bria",
    description:
      "High-quality transparent cutouts for product, portrait, and ecommerce imagery.",
    heroGradient: "from-slate-300/18 via-sky-200/10 to-transparent",
    tags: ["Image", "Utility", "Transparent PNG"],
    pricing: {
      type: "fixed",
      apiCostUsd: 0.018,
    },
    requestMode: "background-removal",
    requiresPrompt: false,
    supportsReferences: true,
    minimumReferenceFiles: 1,
    maxReferenceFiles: 1,
    acceptedReferenceKinds: ["image"],
    outputFormatOptions: ["png"],
    promptPlaceholder:
      "Drop an image to remove the background. Optional note here.",
    defaultDraft: {
      outputFormat: "png",
    },
  }),
  createTextModel({
    id: "claude-opus-4.6",
    name: "Claude Opus 4.6",
    providerLabel: "Anthropic",
    description:
      "High-end reasoning and writing via Fal's OpenRouter router.",
    heroGradient: "from-violet-300/25 via-fuchsia-300/10 to-transparent",
    tags: ["LLM", "Premium", "Reasoning"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 5,
      apiCostUsdPerMillionOutputTokens: 25,
    },
  }),
  createTextModel({
    id: "claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    providerLabel: "Anthropic",
    description:
      "Balanced flagship reasoning and writing via Fal's OpenRouter router.",
    heroGradient: "from-indigo-300/25 via-violet-300/10 to-transparent",
    tags: ["LLM", "Featured", "Balanced"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 3,
      apiCostUsdPerMillionOutputTokens: 15,
    },
  }),
  createSpeechModel({
    id: "chatterbox-tts",
    name: "Chatterbox TTS",
    providerLabel: "Resemble AI",
    description:
      "Fast, low-cost speech synthesis for clean narration and prototypes.",
    heroGradient: "from-cyan-300/25 via-sky-300/10 to-transparent",
    tags: ["TTS", "Fast", "Affordable"],
    pricing: {
      type: "tts",
      apiCostUsdPerThousandCharacters: 0.025,
    },
    outputFormatOptions: ["wav"],
    speakingRateOptions: ["0.9x", "1x", "1.1x"],
    defaultDraft: {
      outputFormat: "wav",
      voice: "Default",
    },
  }),
  createSpeechModel({
    id: "dia-tts",
    name: "Dia TTS",
    providerLabel: "Nari Labs",
    description:
      "Conversational speech synthesis tuned for dialogue-style delivery.",
    heroGradient: "from-sky-300/25 via-teal-300/10 to-transparent",
    tags: ["TTS", "Dialogue"],
    pricing: {
      type: "tts",
      apiCostUsdPerThousandCharacters: 0.04,
    },
    outputFormatOptions: ["mp3"],
    languageOptions: ["English"],
    speakingRateOptions: ["0.9x", "1x", "1.1x"],
    defaultDraft: {
      outputFormat: "mp3",
      voice: "Zero Shot",
      language: "English",
    },
  }),
  createImageModel({
    id: "flux-kontext-pro",
    name: "FLUX.1 Kontext [pro]",
    providerLabel: "Black Forest Labs",
    description:
      "Premium image generation and editing with strong text-following and reference support.",
    heroGradient: "from-amber-300/25 via-orange-300/10 to-transparent",
    tags: ["Image", "Editing", "Premium"],
    pricing: {
      type: "fixed",
      apiCostUsd: 0.04,
    },
    supportsReferences: true,
    maxReferenceFiles: 1,
    acceptedReferenceKinds: ["image"],
    aspectRatioOptions: [...COMMON_IMAGE_RATIOS],
    outputFormatOptions: [...COMMON_IMAGE_FORMATS],
  }),
  createTextModel({
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    providerLabel: "Google",
    description:
      "Fast multimodal prompting through Fal's OpenRouter router.",
    heroGradient: "from-cyan-300/25 via-blue-300/10 to-transparent",
    tags: ["LLM", "Fast", "Multimodal"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 0.3,
      apiCostUsdPerMillionOutputTokens: 2.5,
    },
  }),
  createTextModel({
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    providerLabel: "Google",
    description:
      "High-end multimodal reasoning through Fal's OpenRouter router.",
    heroGradient: "from-sky-300/25 via-cyan-300/10 to-transparent",
    tags: ["LLM", "Multimodal", "Reasoning"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 1.25,
      apiCostUsdPerMillionOutputTokens: 10,
    },
  }),
  createTextModel({
    id: "gpt-4.1",
    name: "GPT-4.1",
    providerLabel: "OpenAI",
    description:
      "General-purpose text generation and reasoning via Fal's OpenRouter router.",
    heroGradient: "from-blue-300/25 via-sky-300/10 to-transparent",
    tags: ["LLM", "General"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 2,
      apiCostUsdPerMillionOutputTokens: 8,
    },
  }),
  createTextModel({
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    providerLabel: "OpenAI",
    description:
      "Fast low-latency LLM routing through Fal's OpenRouter router.",
    heroGradient: "from-blue-300/25 via-indigo-300/10 to-transparent",
    tags: ["LLM", "Fast"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 0.25,
      apiCostUsdPerMillionOutputTokens: 2,
    },
  }),
  createTextModel({
    id: "gpt-oss-120b",
    name: "GPT OSS 120B",
    providerLabel: "OpenAI",
    description:
      "Cost-efficient open-weight reasoning through Fal's OpenRouter router.",
    heroGradient: "from-slate-300/25 via-blue-300/10 to-transparent",
    tags: ["LLM", "Affordable"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 0.039,
      apiCostUsdPerMillionOutputTokens: 0.19,
    },
  }),
  createVideoModel({
    id: "kling-o3-pro",
    name: "Kling O3 Image to Video [Pro]",
    providerLabel: "Kling",
    description:
      "Premium image-to-video generation with optional audio and strong motion fidelity.",
    heroGradient: "from-fuchsia-300/25 via-pink-300/10 to-transparent",
    tags: ["Video", "Image to Video", "Premium"],
    pricing: {
      type: "video",
      resolutionRates: {
        default: {
          withoutAudio: 0.084,
          withAudio: 0.112,
        },
      },
      defaultResolution: "default",
    },
    supportsReferences: true,
    minimumReferenceFiles: 1,
    maxReferenceFiles: 1,
    acceptedReferenceKinds: ["image"],
    aspectRatioOptions: ["16:9", "9:16"],
    durationOptions: [5, 10],
    supportsNegativePrompt: false,
    defaultDraft: {
      includeAudio: false,
      durationSeconds: 5,
    },
  }),
  createVideoModel({
    id: "kling-video-v3-pro",
    name: "Kling Video v3 Image to Video [Pro]",
    providerLabel: "Kling",
    description:
      "High-end image-to-video generation with stronger cinematic motion and audio support.",
    heroGradient: "from-pink-300/25 via-rose-300/10 to-transparent",
    tags: ["Video", "Image to Video", "Cinematic"],
    pricing: {
      type: "video",
      resolutionRates: {
        default: {
          withoutAudio: 0.112,
          withAudio: 0.168,
        },
      },
      defaultResolution: "default",
    },
    supportsReferences: true,
    minimumReferenceFiles: 1,
    maxReferenceFiles: 1,
    acceptedReferenceKinds: ["image"],
    aspectRatioOptions: ["16:9", "9:16"],
    durationOptions: [5, 10],
    supportsNegativePrompt: false,
    defaultDraft: {
      includeAudio: false,
      durationSeconds: 5,
    },
  }),
  createTextModel({
    id: "llama-4-maverick",
    name: "Llama 4 Maverick",
    providerLabel: "Meta",
    description:
      "Low-cost large-context prompting through Fal's OpenRouter router.",
    heroGradient: "from-emerald-300/25 via-teal-300/10 to-transparent",
    tags: ["LLM", "Affordable", "Open"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 0.15,
      apiCostUsdPerMillionOutputTokens: 0.6,
    },
  }),
  createSpeechModel({
    id: "minimax-speech-2.8-hd",
    name: "MiniMax Speech 2.8 HD",
    providerLabel: "MiniMax",
    description:
      "High-fidelity speech generation with strong naturalness and polished long-form delivery.",
    heroGradient: "from-cyan-300/25 via-sky-300/10 to-transparent",
    tags: ["TTS", "Featured", "HD"],
    pricing: {
      type: "tts",
      apiCostUsdPerThousandCharacters: 0.1,
    },
    outputFormatOptions: ["mp3", "flac"],
    languageOptions: ["English", "Spanish", "French", "Japanese", "Korean"],
    speakingRateOptions: ["0.85x", "1x", "1.15x"],
    voiceOptions: ["Wise Woman", "Warm Narrator", "Bright Guide"],
    defaultDraft: {
      outputFormat: "mp3",
      voice: "Wise Woman",
      language: "English",
    },
  }),
  createImageModel({
    id: "nano-banana-2",
    name: "Nano Banana 2",
    providerLabel: "Google",
    description:
      "Fast still-image generation with strong reference handling and flexible output sizing.",
    heroGradient: "from-orange-400/25 via-amber-300/10 to-transparent",
    tags: ["Image", "Featured", "Reference-ready"],
    pricing: {
      type: "resolution",
      baseCostUsd: 0.08,
      resolutionMultipliers: {
        "1K": 1,
        "2K": 1.5,
        "4K": 2,
      },
    },
    supportsReferences: true,
    maxReferenceFiles: 10,
    acceptedReferenceKinds: ["image"],
    aspectRatioOptions: [
      ...COMMON_IMAGE_RATIOS,
      "21:9",
      "9:21",
      "auto",
    ],
    resolutionOptions: ["1K", "2K", "4K"],
    outputFormatOptions: [...COMMON_IMAGE_FORMATS],
    defaultDraft: {
      resolution: "1K",
    },
  }),
  createSpeechModel({
    id: "orpheus-tts",
    name: "Orpheus TTS",
    providerLabel: "Canopy",
    description:
      "Expressive speech generation tuned for more emotive, performance-style reads.",
    heroGradient: "from-blue-300/25 via-indigo-300/10 to-transparent",
    tags: ["TTS", "Expressive"],
    pricing: {
      type: "tts",
      apiCostUsdPerThousandCharacters: 0.05,
    },
    outputFormatOptions: ["wav"],
    voiceOptions: ["Tara", "Leah", "Jess", "Leo"],
    speakingRateOptions: ["0.9x", "1x", "1.1x"],
    defaultDraft: {
      outputFormat: "wav",
      voice: "Tara",
      language: "English",
    },
  }),
  createImageModel({
    id: "pixelcut-background-removal",
    name: "Pixelcut Background Removal",
    providerLabel: "Pixelcut",
    description:
      "Fast transparent cutouts for straightforward background removal workflows.",
    heroGradient: "from-slate-300/18 via-sky-300/12 to-transparent",
    tags: ["Image", "Utility", "Transparent PNG"],
    pricing: {
      type: "fixed",
      apiCostUsd: 0.016,
    },
    requestMode: "background-removal",
    requiresPrompt: false,
    supportsReferences: true,
    minimumReferenceFiles: 1,
    maxReferenceFiles: 1,
    acceptedReferenceKinds: ["image"],
    outputFormatOptions: ["png"],
    promptPlaceholder:
      "Drop an image to remove the background. Optional note here.",
    defaultDraft: {
      outputFormat: "png",
    },
  }),
  createImageModel({
    id: "qwen-image-2-pro",
    name: "Qwen Image 2 Pro",
    providerLabel: "Qwen",
    description:
      "Premium prompt-following image generation with strong style and detail control.",
    heroGradient: "from-yellow-300/25 via-orange-300/10 to-transparent",
    tags: ["Image", "Prompting", "Premium"],
    pricing: {
      type: "fixed",
      apiCostUsd: 0.075,
    },
    aspectRatioOptions: [...COMMON_IMAGE_RATIOS],
    outputFormatOptions: [...COMMON_IMAGE_FORMATS],
  }),
  createImageModel({
    id: "recraft-v4-pro",
    name: "Recraft V4 Pro",
    providerLabel: "Recraft",
    description:
      "High-end image generation with polished commercial design output.",
    heroGradient: "from-lime-300/25 via-emerald-300/10 to-transparent",
    tags: ["Image", "Design", "Premium"],
    pricing: {
      type: "fixed",
      apiCostUsd: 0.25,
    },
    aspectRatioOptions: [...COMMON_IMAGE_RATIOS],
    outputFormatOptions: [...COMMON_IMAGE_FORMATS],
  }),
  createVideoModel({
    id: "veo-3.1",
    name: "Veo 3.1",
    providerLabel: "Google",
    description:
      "Flagship narrative video generation with duration, resolution, audio, and frame controls.",
    heroGradient: "from-sky-400/25 via-cyan-300/10 to-transparent",
    tags: ["Video", "Featured", "Audio"],
    pricing: {
      type: "video",
      resolutionRates: {
        "720p": {
          withoutAudio: 0.2,
          withAudio: 0.4,
        },
        "1080p": {
          withoutAudio: 0.2,
          withAudio: 0.4,
        },
        "4K": {
          withoutAudio: 0.4,
          withAudio: 0.6,
        },
      },
      defaultResolution: "1080p",
    },
    supportsReferences: true,
    supportsFrameInputs: true,
    supportsEndFrame: true,
    maxReferenceFiles: 3,
    acceptedReferenceKinds: ["image"],
    aspectRatioOptions: ["16:9", "9:16"],
    resolutionOptions: ["720p", "1080p", "4K"],
    durationOptions: [4, 6, 8],
    defaultDraft: {
      resolution: "1080p",
      durationSeconds: 6,
      includeAudio: true,
    },
  }),
  createVideoModel({
    id: "veo-3.1-fast",
    name: "Veo 3.1 Fast",
    providerLabel: "Google",
    description:
      "Lower-latency Veo generation with the same core controls at a lower cost.",
    heroGradient: "from-cyan-300/25 via-sky-300/10 to-transparent",
    tags: ["Video", "Fast", "Audio"],
    pricing: {
      type: "video",
      resolutionRates: {
        "720p": {
          withoutAudio: 0.1,
          withAudio: 0.15,
        },
        "1080p": {
          withoutAudio: 0.1,
          withAudio: 0.15,
        },
        "4K": {
          withoutAudio: 0.3,
          withAudio: 0.35,
        },
      },
      defaultResolution: "1080p",
    },
    supportsReferences: true,
    supportsFrameInputs: true,
    supportsEndFrame: true,
    maxReferenceFiles: 3,
    acceptedReferenceKinds: ["image"],
    aspectRatioOptions: ["16:9", "9:16"],
    resolutionOptions: ["720p", "1080p", "4K"],
    durationOptions: [4, 6, 8],
    defaultDraft: {
      resolution: "1080p",
      durationSeconds: 6,
      includeAudio: true,
    },
  }),
];

export const STUDIO_MODEL_SECTIONS = [
  {
    id: "images",
    title: "Images",
    description: "Image and utility models",
  },
  {
    id: "videos",
    title: "Videos",
    description: "Video generation models",
  },
  {
    id: "text",
    title: "LLMs",
    description: "Large language models",
  },
  {
    id: "audio",
    title: "TTS",
    description: "Text-to-speech models",
  },
] as const satisfies ReadonlyArray<{
  id: StudioModelSection;
  title: string;
  description: string;
}>;

function compareModelNames(a: StudioModelDefinition, b: StudioModelDefinition) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

const STUDIO_MODEL_MAP = new Map(
  STUDIO_MODEL_CATALOG.map((model) => [model.id, model] as const)
);

export const STUDIO_MODEL_CATALOG_ALPHABETICAL = [...STUDIO_MODEL_CATALOG].sort(
  compareModelNames
);

export function getStudioModelIds() {
  return STUDIO_MODEL_CATALOG.map((model) => model.id);
}

export function getStudioModelById(modelId: string) {
  return STUDIO_MODEL_MAP.get(modelId) ?? STUDIO_MODEL_CATALOG[0];
}

export function sortStudioModelsBySectionAndName(models: StudioModelDefinition[]) {
  const sectionOrder = new Map<StudioModelSection, number>(
    STUDIO_MODEL_SECTIONS.map((section, index) => [section.id, index])
  );

  return [...models].sort((left, right) => {
    const leftSectionOrder = sectionOrder.get(left.section) ?? 0;
    const rightSectionOrder = sectionOrder.get(right.section) ?? 0;
    if (leftSectionOrder !== rightSectionOrder) {
      return leftSectionOrder - rightSectionOrder;
    }
    return compareModelNames(left, right);
  });
}

export function getStudioModelsForPromptBar(enabledModelIds: string[]) {
  const enabledIdSet = new Set(enabledModelIds);
  return sortStudioModelsBySectionAndName(
    STUDIO_MODEL_CATALOG.filter((model) => enabledIdSet.has(model.id))
  );
}
