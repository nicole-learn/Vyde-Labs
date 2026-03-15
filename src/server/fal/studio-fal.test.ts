import { describe, expect, it } from "vitest";
import { createDraft, toPersistedDraft } from "@/features/studio/studio-local-runtime-data";
import {
  findStudioModelById,
  STUDIO_MODEL_CATALOG,
} from "@/features/studio/studio-model-catalog";
import { buildStudioFalQueuedRequest } from "./studio-fal";

const IMAGE_SIZE_BY_ASPECT_RATIO: Record<string, string> = {
  "1:1": "square_hd",
  "4:3": "landscape_4_3",
  "3:4": "portrait_4_3",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
};

function getModel(modelId: string) {
  const model = findStudioModelById(modelId);
  if (!model) {
    throw new Error(`Missing model ${modelId}`);
  }
  return model;
}

function createPersistedDraft(
  modelId: string,
  overrides?: Partial<ReturnType<typeof createDraft>>
) {
  const model = getModel(modelId);
  return toPersistedDraft({
    ...createDraft(model),
    ...(overrides ?? {}),
  });
}

function buildRequest(params: {
  modelId: string;
  requestMode?: Parameters<typeof buildStudioFalQueuedRequest>[0]["requestMode"];
  draftOverrides?: Partial<ReturnType<typeof createDraft>>;
  inputUrls?: {
    references: string[];
    startFrame: string | null;
    endFrame: string | null;
  };
}) {
  const model = getModel(params.modelId);
  return buildStudioFalQueuedRequest({
    modelId: model.id,
    requestMode: params.requestMode ?? model.requestMode,
    draft: createPersistedDraft(model.id, params.draftOverrides),
    inputUrls: params.inputUrls ?? {
      references: [],
      startFrame: null,
      endFrame: null,
    },
  });
}

describe("buildStudioFalQueuedRequest", () => {
  it("builds a default request for every Fal-backed non-text model", () => {
    const falModels = STUDIO_MODEL_CATALOG.filter(
      (model) => model.provider === "fal" && model.kind !== "text"
    );

    for (const model of falModels) {
      const request = buildRequest({
        modelId: model.id,
        requestMode: model.kind === "video" ? "text-to-video" : undefined,
        inputUrls:
          model.requestMode === "background-removal"
            ? {
                references: ["https://example.com/reference.png"],
                startFrame: null,
                endFrame: null,
              }
            : undefined,
      });

      expect(request.endpointId.length).toBeGreaterThan(0);
      expect(request.input).toBeTruthy();
    }
  });

  it("applies every image model aspect ratio option to the provider request", () => {
    const imageModels = STUDIO_MODEL_CATALOG.filter(
      (model) =>
        model.provider === "fal" &&
        model.kind === "image" &&
        model.requestMode !== "background-removal" &&
        model.aspectRatioOptions
    );

    for (const model of imageModels) {
      for (const aspectRatio of model.aspectRatioOptions ?? []) {
        const request = buildRequest({
          modelId: model.id,
          draftOverrides: { aspectRatio },
        });
        const input = request.input as Record<string, unknown>;

        if (model.id === "qwen-image-2-pro" || model.id === "recraft-v4-pro") {
          expect(input.image_size).toBe(
            IMAGE_SIZE_BY_ASPECT_RATIO[aspectRatio] ?? "square_hd"
          );
        } else {
          expect(input.aspect_ratio).toBe(aspectRatio);
        }
      }
    }
  });

  it("applies every image model configurable format and resolution option", () => {
    for (const model of STUDIO_MODEL_CATALOG.filter(
      (entry) => entry.provider === "fal" && entry.kind === "image"
    )) {
      for (const outputFormat of model.outputFormatOptions ?? []) {
        const request = buildRequest({
          modelId: model.id,
          draftOverrides: { outputFormat },
        });
        const input = request.input as Record<string, unknown>;
        expect(input.output_format).toBe(outputFormat);
      }

      for (const resolution of model.resolutionOptions ?? []) {
        const request = buildRequest({
          modelId: model.id,
          draftOverrides: { resolution },
        });
        const input = request.input as Record<string, unknown>;
        expect(input.resolution).toBe(resolution);
      }
    }
  });

  it("switches edit-capable image models to their reference endpoints", () => {
    const referenceCapableImages = ["nano-banana-2", "flux-kontext-pro"] as const;

    for (const modelId of referenceCapableImages) {
      const request = buildRequest({
        modelId,
        inputUrls: {
          references: ["https://example.com/reference.png"],
          startFrame: null,
          endFrame: null,
        },
      });
      const input = request.input as Record<string, unknown>;

      if (modelId === "nano-banana-2") {
        expect(request.endpointId).toContain("/edit");
        expect(input.image_urls).toEqual(["https://example.com/reference.png"]);
      } else {
        expect(request.endpointId).toContain("/kontext");
        expect(input.image_url).toBe("https://example.com/reference.png");
      }
    }
  });

  it("requires an image input for background removal models", () => {
    for (const modelId of ["bria-rmbg-2", "pixelcut-background-removal"] as const) {
      expect(() =>
        buildRequest({
          modelId,
        })
      ).toThrow(/requires an image/i);

      const request = buildRequest({
        modelId,
        inputUrls: {
          references: ["https://example.com/reference.png"],
          startFrame: null,
          endFrame: null,
        },
      });
      const input = request.input as Record<string, unknown>;
      expect(input.image_url).toBe("https://example.com/reference.png");
    }
  });

  it("applies every video model duration, resolution, and audio setting", () => {
    const videoModels = STUDIO_MODEL_CATALOG.filter(
      (model) => model.provider === "fal" && model.kind === "video"
    );

    for (const model of videoModels) {
      for (const durationSeconds of model.durationOptions ?? []) {
        const request = buildRequest({
          modelId: model.id,
          requestMode: "text-to-video",
          draftOverrides: { durationSeconds },
        });
        const input = request.input as Record<string, unknown>;
        expect(String(input.duration ?? durationSeconds)).toContain(String(durationSeconds));
      }

      for (const resolution of model.resolutionOptions ?? []) {
        const request = buildRequest({
          modelId: model.id,
          requestMode: "text-to-video",
          draftOverrides: { resolution },
        });
        const input = request.input as Record<string, unknown>;
        expect(String(input.resolution ?? resolution).toLowerCase()).toBe(
          resolution === "4K" ? "4k" : resolution.toLowerCase()
        );
      }

      for (const includeAudio of [true, false]) {
        const request = buildRequest({
          modelId: model.id,
          requestMode: "text-to-video",
          draftOverrides: { includeAudio },
        });
        const input = request.input as Record<string, unknown>;
        expect(input.generate_audio).toBe(includeAudio);
      }
    }
  });

  it("covers frame and reference video request modes", () => {
    const veo = "veo-3.1";
    const fastVeo = "veo-3.1-fast";
    const kling = "kling-o3-pro";

    const firstLast = buildRequest({
      modelId: veo,
      requestMode: "first-last-frame-to-video",
      inputUrls: {
        references: [],
        startFrame: "https://example.com/start.png",
        endFrame: "https://example.com/end.png",
      },
    });
    expect(firstLast.endpointId).toContain("/first-last-frame-to-video");

    const imageToVideo = buildRequest({
      modelId: veo,
      requestMode: "image-to-video",
      inputUrls: {
        references: [],
        startFrame: "https://example.com/start.png",
        endFrame: null,
      },
    });
    expect(imageToVideo.endpointId).toContain("/image-to-video");

    const referenceToVideo = buildRequest({
      modelId: veo,
      requestMode: "reference-to-video",
      inputUrls: {
        references: [
          "https://example.com/ref-1.png",
          "https://example.com/ref-2.png",
        ],
        startFrame: null,
        endFrame: null,
      },
    });
    expect(referenceToVideo.endpointId).toContain("/reference-to-video");

    expect(() =>
      buildRequest({
        modelId: fastVeo,
        requestMode: "reference-to-video",
        inputUrls: {
          references: [
            "https://example.com/ref-1.png",
            "https://example.com/ref-2.png",
          ],
          startFrame: null,
          endFrame: null,
        },
      })
    ).toThrow(/does not support multi-reference/i);

    const klingReference = buildRequest({
      modelId: kling,
      requestMode: "reference-to-video",
      inputUrls: {
        references: [
          "https://example.com/ref-1.png",
          "https://example.com/ref-2.png",
        ],
        startFrame: null,
        endFrame: null,
      },
    });
    expect(klingReference.endpointId).toContain("/reference-to-video");
  });

  it("applies every supported TTS setting to the Fal request", () => {
    const minimax = getModel("minimax-speech-2.8-hd");
    const orpheus = getModel("orpheus-tts");

    for (const outputFormat of minimax.outputFormatOptions ?? []) {
      const request = buildRequest({
        modelId: minimax.id,
        draftOverrides: { outputFormat },
      });
      const input = request.input as Record<string, unknown>;
      expect(
        (input.audio_setting as { format?: string } | undefined)?.format
      ).toBe(outputFormat);
    }

    for (const language of minimax.languageOptions ?? []) {
      const request = buildRequest({
        modelId: minimax.id,
        draftOverrides: { language },
      });
      const input = request.input as Record<string, unknown>;
      expect(input.language_boost).toBe(language);
    }

    for (const voice of minimax.voiceOptions ?? []) {
      const request = buildRequest({
        modelId: minimax.id,
        draftOverrides: { voice },
      });
      const input = request.input as Record<string, unknown>;
      expect(
        (input.voice_setting as { voice_id?: string } | undefined)?.voice_id
      ).toBe(voice.replaceAll(" ", "_"));
    }

    for (const speakingRate of minimax.speakingRateOptions ?? []) {
      const request = buildRequest({
        modelId: minimax.id,
        draftOverrides: { speakingRate },
      });
      const input = request.input as Record<string, unknown>;
      expect(
        (input.voice_setting as { speed?: number } | undefined)?.speed
      ).toBe(Number.parseFloat(speakingRate));
    }

    for (const voice of orpheus.voiceOptions ?? []) {
      const request = buildRequest({
        modelId: orpheus.id,
        draftOverrides: { voice },
      });
      const input = request.input as Record<string, unknown>;
      expect(input.voice).toBe(voice.toLowerCase());
    }

    for (const modelId of ["chatterbox-tts", "dia-tts"] as const) {
      const request = buildRequest({ modelId });
      expect(request.endpointId.length).toBeGreaterThan(0);
    }
  });
});
