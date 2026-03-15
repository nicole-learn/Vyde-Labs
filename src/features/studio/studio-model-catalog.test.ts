import { describe, expect, it } from "vitest";
import { createDraft, hydrateDraft, toPersistedDraft } from "./studio-local-runtime-data";
import {
  findStudioModelById,
  getPreferredStudioTextModelIdForFamily,
  getStudioModelById,
  STUDIO_MODEL_CATALOG,
  STUDIO_TEXT_MODEL_FAMILIES,
} from "./studio-model-catalog";

describe("studio-model-catalog", () => {
  it("keeps model ids, names, and provider api ids unique", () => {
    const ids = new Set<string>();
    const names = new Set<string>();
    const providerApiIds = new Set<string>();

    for (const model of STUDIO_MODEL_CATALOG) {
      expect(ids.has(model.id)).toBe(false);
      expect(names.has(model.name)).toBe(false);
      ids.add(model.id);
      names.add(model.name);

      if (model.apiModelId) {
        expect(providerApiIds.has(model.apiModelId)).toBe(false);
        providerApiIds.add(model.apiModelId);
      }
    }
  });

  it("gives every model a valid default draft aligned with its options", () => {
    for (const model of STUDIO_MODEL_CATALOG) {
      const draft = createDraft(model);
      const hydrated = hydrateDraft(toPersistedDraft(draft), model);

      expect(hydrated.prompt).toBeTypeOf("string");
      expect(hydrated.negativePrompt).toBeTypeOf("string");
      expect(hydrated.references).toEqual([]);
      expect(hydrated.startFrame).toBeNull();
      expect(hydrated.endFrame).toBeNull();

      if (model.aspectRatioOptions) {
        expect(model.aspectRatioOptions).toContain(hydrated.aspectRatio);
      }
      if (model.resolutionOptions) {
        expect(model.resolutionOptions).toContain(hydrated.resolution);
      }
      if (model.outputFormatOptions) {
        expect(model.outputFormatOptions).toContain(hydrated.outputFormat);
      }
      if (model.voiceOptions) {
        expect(model.voiceOptions).toContain(hydrated.voice);
      }
      if (model.languageOptions) {
        expect(model.languageOptions).toContain(hydrated.language);
      }
      if (model.speakingRateOptions) {
        expect(model.speakingRateOptions).toContain(hydrated.speakingRate);
      }
      if (model.durationOptions) {
        expect(model.durationOptions).toContain(hydrated.durationSeconds);
      }

      if (model.kind === "text") {
        expect(model.familyId).toBeTruthy();
        expect(model.apiModelId).toBeTruthy();
        expect(model.maxOutputTokens).toBeGreaterThan(0);
        expect(hydrated.maxTokens).toBe(model.maxOutputTokens);
        expect(model.acceptedReferenceKinds).toEqual(["image", "video"]);
      } else {
        expect(model.familyId).toBeUndefined();
      }

      if (model.kind === "audio") {
        expect(model.requestMode).toBe("text-to-speech");
        expect(model.supportsReferences).toBe(false);
      }

      if (model.requestMode === "background-removal") {
        expect(model.requiresPrompt).toBe(false);
        expect(model.supportsReferences).toBe(true);
        expect(model.minimumReferenceFiles).toBe(1);
        expect(model.maxReferenceFiles).toBe(1);
        expect(model.acceptedReferenceKinds).toEqual(["image"]);
        expect(model.outputFormatOptions).toBeUndefined();
      }
    }
  });

  it("only exposes settings that are meaningfully configurable per model", () => {
    const chatterbox = findStudioModelById("chatterbox-tts");
    const dia = findStudioModelById("dia-tts");
    const orpheus = findStudioModelById("orpheus-tts");
    const minimax = findStudioModelById("minimax-speech-2.8-hd");
    const recraft = findStudioModelById("recraft-v4-pro");
    const veo = findStudioModelById("veo-3.1");

    expect(chatterbox?.outputFormatOptions).toBeUndefined();
    expect(chatterbox?.speakingRateOptions).toBeUndefined();

    expect(dia?.outputFormatOptions).toBeUndefined();
    expect(dia?.languageOptions).toBeUndefined();
    expect(dia?.speakingRateOptions).toBeUndefined();

    expect(orpheus?.outputFormatOptions).toBeUndefined();
    expect(orpheus?.speakingRateOptions).toBeUndefined();
    expect(orpheus?.voiceOptions?.length).toBeGreaterThan(1);

    expect(minimax?.outputFormatOptions).toEqual(["mp3", "flac"]);
    expect(minimax?.speakingRateOptions?.length).toBeGreaterThan(1);
    expect(minimax?.languageOptions?.length).toBeGreaterThan(1);

    expect(recraft?.outputFormatOptions).toBeUndefined();
    expect(veo?.outputFormatOptions).toBeUndefined();
  });

  it("keeps text families complete and preferred ids resolvable", () => {
    expect(STUDIO_TEXT_MODEL_FAMILIES).toHaveLength(3);

    for (const family of STUDIO_TEXT_MODEL_FAMILIES) {
      expect(family.modelIds).toHaveLength(3);

      for (const modelId of family.modelIds) {
        const model = findStudioModelById(modelId);
        expect(model?.kind).toBe("text");
        expect(model?.familyId).toBe(family.id);
      }

      expect(getPreferredStudioTextModelIdForFamily(family.id)).toBeTruthy();
      expect(family.modelIds).toContain(getPreferredStudioTextModelIdForFamily(family.id));
    }
  });

  it("throws instead of silently falling back for unknown model ids", () => {
    expect(findStudioModelById("not-a-real-model")).toBeNull();
    expect(() => getStudioModelById("not-a-real-model")).toThrow(
      "Unknown studio model: not-a-real-model"
    );
  });
});
