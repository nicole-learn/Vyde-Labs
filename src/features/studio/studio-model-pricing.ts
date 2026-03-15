import { getStudioModelById } from "./studio-model-catalog";
import type { StudioDraft, StudioModelDefinition } from "./types";

const CREDIT_MARKUP_MULTIPLIER = 1.15;
const CREDITS_PER_USD = 10;

function roundStudioCredits(value: number) {
  return Math.max(0.1, Math.ceil(value * 10) / 10);
}

function estimatePromptTokens(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return 0;
  }

  return Math.max(1, Math.ceil(trimmed.length / 4));
}

function resolveQuotedMaxTokens(
  model: StudioModelDefinition,
  draft: Pick<StudioDraft, "maxTokens">
) {
  if (model.kind === "text" && model.maxOutputTokens) {
    return model.maxOutputTokens;
  }

  return draft.maxTokens;
}

function estimateApiCostUsd(
  model: StudioModelDefinition,
  draft: Pick<
    StudioDraft,
    "prompt" | "durationSeconds" | "resolution" | "includeAudio" | "maxTokens"
  >
) {
  const pricing = model.pricing;

  switch (pricing.type) {
    case "fixed":
      return pricing.apiCostUsd;
    case "resolution": {
      const resolutionKey =
        draft.resolution && pricing.resolutionMultipliers[draft.resolution]
          ? draft.resolution
          : Object.keys(pricing.resolutionMultipliers)[0] ?? "default";
      const multiplier = pricing.resolutionMultipliers[resolutionKey] ?? 1;
      return pricing.baseCostUsd * multiplier;
    }
    case "video": {
      const resolutionKey =
        draft.resolution && pricing.resolutionRates[draft.resolution]
          ? draft.resolution
          : pricing.defaultResolution;
      const rateCard =
        pricing.resolutionRates[resolutionKey] ??
        pricing.resolutionRates[pricing.defaultResolution];
      if (!rateCard) {
        return 0;
      }

      const perSecondRate = draft.includeAudio
        ? rateCard.withAudio
        : rateCard.withoutAudio;
      return perSecondRate * Math.max(1, draft.durationSeconds);
    }
    case "tts": {
      const characters = Math.max(1, draft.prompt.trim().length);
      return (characters / 1000) * pricing.apiCostUsdPerThousandCharacters;
    }
    case "llm": {
      const inputTokens = estimatePromptTokens(draft.prompt);
      const outputTokens = Math.max(1, resolveQuotedMaxTokens(model, draft));

      return (
        (inputTokens / 1_000_000) * pricing.apiCostUsdPerMillionInputTokens +
        (outputTokens / 1_000_000) * pricing.apiCostUsdPerMillionOutputTokens
      );
    }
    default:
      return 0;
  }
}

export function quoteStudioDraftPricing(
  modelOrId: StudioModelDefinition | string,
  draft: Pick<
    StudioDraft,
    "prompt" | "durationSeconds" | "resolution" | "includeAudio" | "maxTokens"
  >
) {
  const model =
    typeof modelOrId === "string" ? getStudioModelById(modelOrId) : modelOrId;
  const apiCostUsd = estimateApiCostUsd(model, draft);
  const billedCredits = roundStudioCredits(
    apiCostUsd * CREDITS_PER_USD * CREDIT_MARKUP_MULTIPLIER
  );
  const maxTokens = resolveQuotedMaxTokens(model, draft);

  return {
    apiCostUsd,
    billedCredits,
    pricingSnapshot: {
      credit_markup_multiplier: CREDIT_MARKUP_MULTIPLIER,
      api_cost_usd: apiCostUsd,
      billed_credits: billedCredits,
      pricing_type: model.pricing.type,
      resolution: draft.resolution,
      duration_seconds: draft.durationSeconds,
      include_audio: draft.includeAudio,
      estimated_prompt_tokens: estimatePromptTokens(draft.prompt),
      max_tokens: maxTokens,
    },
  };
}

export function quoteStudioDraftCredits(
  modelOrId: StudioModelDefinition | string,
  draft: Pick<
    StudioDraft,
    "prompt" | "durationSeconds" | "resolution" | "includeAudio" | "maxTokens"
  >
) {
  return quoteStudioDraftPricing(modelOrId, draft).billedCredits;
}
