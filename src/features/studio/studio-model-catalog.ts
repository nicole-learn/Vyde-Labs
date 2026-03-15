import type {
  StudioModelDefinition,
  StudioModelSection,
  StudioTextModelFamilyId,
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
  maxTokens: 65_536,
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
type DraftPatch = Partial<StudioModelDefinition["defaultDraft"]>;

function createTextModel(
  config: Pick<
    StudioModelDefinition,
    | "id"
    | "name"
    | "provider"
    | "providerLabel"
    | "familyId"
    | "apiModelId"
    | "maxOutputTokens"
    | "description"
    | "heroGradient"
    | "tags"
    | "pricing"
  >
): StudioModelDefinition {
  return {
    ...config,
    provider: config.provider,
    kind: "text",
    section: "text",
    requestMode: "chat",
    promptPlaceholder: "Ask anything...",
    supportsNegativePrompt: false,
    supportsReferences: true,
    maxReferenceFiles: 6,
    acceptedReferenceKinds: ["image", "video"],
    defaultDraft: {
      ...DEFAULT_TEXT_DRAFT,
      maxTokens: config.maxOutputTokens ?? DEFAULT_TEXT_DRAFT.maxTokens,
    },
  };
}

function createTextModelFamily(
  familyId: StudioTextModelFamilyId,
  models: StudioModelDefinition[]
) {
  return {
    id: familyId,
    label:
      familyId === "chatgpt"
        ? "ChatGPT"
        : familyId === "claude"
          ? "Claude"
          : "Gemini",
    modelIds: models.map((model) => model.id),
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
    provider: "fal",
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
    provider: "fal",
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
    provider: "fal",
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
    id: "claude-opus-4.1",
    name: "Claude Opus 4.1",
    provider: "anthropic",
    providerLabel: "Anthropic",
    familyId: "claude",
    apiModelId: "claude-opus-4-1-20250805",
    maxOutputTokens: 64_000,
    description:
      "Anthropic's strongest Claude model for deep reasoning, writing, and agentic workflows.",
    heroGradient: "from-violet-300/25 via-fuchsia-300/10 to-transparent",
    tags: ["LLM", "Premium", "Reasoning"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 15,
      apiCostUsdPerMillionOutputTokens: 75,
    },
  }),
  createTextModel({
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    providerLabel: "Anthropic",
    familyId: "claude",
    apiModelId: "claude-sonnet-4-20250514",
    maxOutputTokens: 64_000,
    description:
      "Anthropic's balanced flagship for strong reasoning, coding, and everyday assistant work.",
    heroGradient: "from-indigo-300/25 via-violet-300/10 to-transparent",
    tags: ["LLM", "Featured", "Balanced"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 3,
      apiCostUsdPerMillionOutputTokens: 15,
    },
  }),
  createTextModel({
    id: "claude-haiku-3.5",
    name: "Claude Haiku 3.5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    familyId: "claude",
    apiModelId: "claude-3-5-haiku-20241022",
    maxOutputTokens: 8_192,
    description:
      "Anthropic's fast low-cost model for chat, extraction, and lightweight generation.",
    heroGradient: "from-slate-300/25 via-violet-300/10 to-transparent",
    tags: ["LLM", "Fast", "Affordable"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 0.8,
      apiCostUsdPerMillionOutputTokens: 4,
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
    id: "gemini-3-pro-preview",
    name: "Gemini 3 Pro",
    provider: "google",
    providerLabel: "Google",
    familyId: "gemini",
    apiModelId: "gemini-3-pro-preview",
    maxOutputTokens: 64_000,
    description:
      "Google's strongest current Gemini text model for advanced reasoning and complex generation.",
    heroGradient: "from-sky-300/25 via-cyan-300/10 to-transparent",
    tags: ["LLM", "Premium", "Reasoning"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 2,
      apiCostUsdPerMillionOutputTokens: 12,
    },
  }),
  createTextModel({
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    provider: "google",
    providerLabel: "Google",
    familyId: "gemini",
    apiModelId: "gemini-3-flash",
    maxOutputTokens: 64_000,
    description:
      "Google's fast, frontier-class Gemini model with strong latency-to-quality balance.",
    heroGradient: "from-cyan-300/25 via-blue-300/10 to-transparent",
    tags: ["LLM", "Fast", "Multimodal"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 0.5,
      apiCostUsdPerMillionOutputTokens: 3,
    },
  }),
  createTextModel({
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
    provider: "google",
    providerLabel: "Google",
    familyId: "gemini",
    apiModelId: "gemini-2.5-flash-lite",
    maxOutputTokens: 65_536,
    description:
      "Google's lowest-cost Gemini text model for fast chat, extraction, and support workflows.",
    heroGradient: "from-cyan-300/25 via-teal-300/10 to-transparent",
    tags: ["LLM", "Affordable", "Fast"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 0.1,
      apiCostUsdPerMillionOutputTokens: 0.4,
    },
  }),
  createTextModel({
    id: "gpt-5.4",
    name: "GPT-5.4",
    provider: "openai",
    providerLabel: "OpenAI",
    familyId: "chatgpt",
    apiModelId: "gpt-5.4",
    maxOutputTokens: 128_000,
    description:
      "OpenAI's current top-tier model for high-stakes reasoning, writing, and tool use.",
    heroGradient: "from-blue-300/25 via-sky-300/10 to-transparent",
    tags: ["LLM", "Premium", "Reasoning"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 2.5,
      apiCostUsdPerMillionOutputTokens: 15,
    },
  }),
  createTextModel({
    id: "gpt-5.2",
    name: "GPT-5.2",
    provider: "openai",
    providerLabel: "OpenAI",
    familyId: "chatgpt",
    apiModelId: "gpt-5.2",
    maxOutputTokens: 128_000,
    description:
      "OpenAI's balanced GPT-5 tier for strong quality, reasoning, and better cost efficiency than the flagship.",
    heroGradient: "from-sky-300/25 via-blue-300/10 to-transparent",
    tags: ["LLM", "Balanced", "General"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 1.75,
      apiCostUsdPerMillionOutputTokens: 14,
    },
  }),
  createTextModel({
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    provider: "openai",
    providerLabel: "OpenAI",
    familyId: "chatgpt",
    apiModelId: "gpt-5-mini",
    maxOutputTokens: 128_000,
    description:
      "OpenAI's affordable fast GPT-5 tier for chat, extraction, and light reasoning.",
    heroGradient: "from-blue-300/25 via-indigo-300/10 to-transparent",
    tags: ["LLM", "Fast"],
    pricing: {
      type: "llm",
      apiCostUsdPerMillionInputTokens: 0.25,
      apiCostUsdPerMillionOutputTokens: 2,
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
    maxReferenceFiles: 1,
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
    title: "Text",
    description: "Text generation models",
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

export const STUDIO_TEXT_MODEL_FAMILIES = [
  createTextModelFamily(
    "chatgpt",
    STUDIO_MODEL_CATALOG.filter((model) => model.familyId === "chatgpt")
  ),
  createTextModelFamily(
    "claude",
    STUDIO_MODEL_CATALOG.filter((model) => model.familyId === "claude")
  ),
  createTextModelFamily(
    "gemini",
    STUDIO_MODEL_CATALOG.filter((model) => model.familyId === "gemini")
  ),
].sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));

export const STUDIO_PREFERRED_TEXT_MODEL_BY_FAMILY: Record<
  StudioTextModelFamilyId,
  string
> = {
  chatgpt: "gpt-5.2",
  claude: "claude-sonnet-4",
  gemini: "gemini-3-flash",
};

export function getStudioTextFamilyLabel(familyId: StudioTextModelFamilyId) {
  return (
    STUDIO_TEXT_MODEL_FAMILIES.find((family) => family.id === familyId)?.label ??
    familyId
  );
}

export function getPreferredStudioTextModelIdForFamily(
  familyId: StudioTextModelFamilyId,
  availableModels: StudioModelDefinition[] = STUDIO_MODEL_CATALOG
) {
  const familyModels = availableModels.filter((model) => model.familyId === familyId);
  if (familyModels.length === 0) {
    return null;
  }

  const preferredId = STUDIO_PREFERRED_TEXT_MODEL_BY_FAMILY[familyId];
  return (
    familyModels.find((model) => model.id === preferredId)?.id ??
    familyModels[0]?.id ??
    null
  );
}

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
