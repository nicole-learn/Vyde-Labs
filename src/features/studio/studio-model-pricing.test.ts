import { describe, expect, it } from "vitest";
import {
  quoteStudioDraftCredits,
  quoteStudioDraftPricing,
} from "./studio-model-pricing";
import type { StudioDraft, StudioModelDefinition, StudioModelPricing } from "./types";

function createDraft(overrides?: Partial<StudioDraft>): StudioDraft {
  return {
    prompt: "Test prompt for pricing",
    negativePrompt: "",
    videoInputMode: "references",
    aspectRatio: "1:1",
    resolution: "1024",
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
    references: [],
    startFrame: null,
    endFrame: null,
    ...overrides,
  };
}

function createModel(pricing: StudioModelPricing): StudioModelDefinition {
  return {
    id: `model-${pricing.type}`,
    name: `Model ${pricing.type}`,
    provider:
      pricing.type === "llm"
        ? "openai"
        : "fal",
    providerLabel: "Test",
    kind:
      pricing.type === "video"
        ? "video"
        : pricing.type === "tts"
          ? "audio"
          : pricing.type === "llm"
            ? "text"
            : "image",
    section:
      pricing.type === "video"
        ? "videos"
        : pricing.type === "tts"
          ? "audio"
          : pricing.type === "llm"
            ? "text"
            : "images",
    description: "Test model",
    heroGradient: "from-slate-400 to-slate-800",
    tags: [],
    requestMode:
      pricing.type === "video"
        ? "text-to-video"
        : pricing.type === "tts"
          ? "text-to-speech"
          : pricing.type === "llm"
            ? "chat"
            : "text-to-image",
    promptPlaceholder: "Prompt",
    supportsNegativePrompt: false,
    supportsReferences: false,
    maxOutputTokens: pricing.type === "llm" ? 128_000 : undefined,
    pricing,
    defaultDraft: createDraft(),
  };
}

describe("studio-model-pricing", () => {
  it("quotes fixed pricing models", () => {
    const model = createModel({
      type: "fixed",
      apiCostUsd: 0.12,
    });
    const quote = quoteStudioDraftPricing(model, createDraft());

    expect(quote.apiCostUsd).toBe(0.12);
    expect(quote.billedCredits).toBe(1.4);
    expect(quote.pricingSnapshot.pricing_type).toBe("fixed");
  });

  it("quotes resolution pricing models from the selected resolution", () => {
    const model = createModel({
      type: "resolution",
      baseCostUsd: 0.08,
      resolutionMultipliers: {
        "1024": 1,
        "2048": 1.5,
      },
    });

    expect(
      quoteStudioDraftCredits(model, createDraft({ resolution: "2048" }))
    ).toBe(1.4);
  });

  it("rounds quoted credits up to the next tenth", () => {
    const model = createModel({
      type: "resolution",
      baseCostUsd: 0.08,
      resolutionMultipliers: {
        "1024": 1,
      },
    });

    expect(
      quoteStudioDraftCredits(model, createDraft({ resolution: "1024" }))
    ).toBe(1.0);
  });

  it("quotes video models differently depending on audio settings", () => {
    const model = createModel({
      type: "video",
      defaultResolution: "1080p",
      resolutionRates: {
        "1080p": {
          withoutAudio: 0.2,
          withAudio: 0.35,
        },
      },
    });

    const withoutAudio = quoteStudioDraftPricing(
      model,
      createDraft({ durationSeconds: 4, includeAudio: false, resolution: "1080p" })
    );
    const withAudio = quoteStudioDraftPricing(
      model,
      createDraft({ durationSeconds: 4, includeAudio: true, resolution: "1080p" })
    );

    expect(withAudio.apiCostUsd).toBeGreaterThan(withoutAudio.apiCostUsd);
    expect(withAudio.billedCredits).toBeGreaterThan(withoutAudio.billedCredits);
  });

  it("quotes text-to-speech models by prompt length", () => {
    const model = createModel({
      type: "tts",
      apiCostUsdPerThousandCharacters: 0.5,
    });
    const shortQuote = quoteStudioDraftPricing(model, createDraft({ prompt: "Short" }));
    const longQuote = quoteStudioDraftPricing(
      model,
      createDraft({ prompt: "Long prompt ".repeat(200) })
    );

    expect(longQuote.apiCostUsd).toBeGreaterThan(shortQuote.apiCostUsd);
    expect(longQuote.billedCredits).toBeGreaterThan(shortQuote.billedCredits);
  });

  it("quotes llm models from prompt tokens and the model output ceiling", () => {
    const model = createModel({
      type: "llm",
      apiCostUsdPerMillionInputTokens: 4,
      apiCostUsdPerMillionOutputTokens: 12,
    });
    const quote = quoteStudioDraftPricing(
      model,
      createDraft({ prompt: "A short question", maxTokens: 256 })
    );

    expect(quote.pricingSnapshot.max_tokens).toBe(128000);
    expect(quote.apiCostUsd).toBeGreaterThan(1);
  });
});
