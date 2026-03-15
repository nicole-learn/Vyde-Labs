import { describe, expect, it } from "vitest";
import { createDraft } from "./studio-local-runtime-data";
import { STUDIO_MODEL_CATALOG } from "./studio-model-catalog";
import { quoteStudioDraftPricing } from "./studio-model-pricing";

describe("studio-model-pricing catalog coverage", () => {
  it("quotes every model successfully", () => {
    for (const model of STUDIO_MODEL_CATALOG) {
      const draft = createDraft(model);
      if (model.requestMode === "background-removal") {
        draft.prompt = "";
      } else if (!draft.prompt.trim()) {
        draft.prompt = `Prompt for ${model.name}`;
      }

      const quote = quoteStudioDraftPricing(model, draft);
      expect(Number.isFinite(quote.apiCostUsd)).toBe(true);
      expect(Number.isFinite(quote.billedCredits)).toBe(true);
      expect(quote.billedCredits).toBeGreaterThan(0);

      if (model.kind === "text") {
        expect(quote.pricingSnapshot.max_tokens).toBe(model.maxOutputTokens);
      }
    }
  });

  it("covers every priced option value in the catalog", () => {
    for (const model of STUDIO_MODEL_CATALOG) {
      if (model.resolutionOptions) {
        for (const resolution of model.resolutionOptions) {
          const quote = quoteStudioDraftPricing(model, {
            ...createDraft(model),
            prompt: `Prompt for ${model.name}`,
            resolution,
          });
          expect(quote.pricingSnapshot.resolution).toBe(resolution);
          expect(quote.billedCredits).toBeGreaterThan(0);
        }
      }

      if (model.durationOptions) {
        for (const durationSeconds of model.durationOptions) {
          for (const includeAudio of model.kind === "video" ? [true, false] : [false]) {
            const quote = quoteStudioDraftPricing(model, {
              ...createDraft(model),
              prompt: `Prompt for ${model.name}`,
              durationSeconds,
              includeAudio,
            });
            expect(quote.pricingSnapshot.duration_seconds).toBe(durationSeconds);
            expect(quote.pricingSnapshot.include_audio).toBe(includeAudio);
            expect(quote.billedCredits).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("keeps audio model pricing driven by prompt length across the entire catalog", () => {
    for (const model of STUDIO_MODEL_CATALOG.filter((entry) => entry.kind === "audio")) {
      const shortQuote = quoteStudioDraftPricing(model, {
        ...createDraft(model),
        prompt: "Short prompt",
      });
      const longQuote = quoteStudioDraftPricing(model, {
        ...createDraft(model),
        prompt: "Long prompt ".repeat(200),
      });

      expect(longQuote.apiCostUsd).toBeGreaterThan(shortQuote.apiCostUsd);
      expect(longQuote.billedCredits).toBeGreaterThan(shortQuote.billedCredits);
    }
  });
});
