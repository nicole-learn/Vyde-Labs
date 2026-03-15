import { describe, expect, it } from "vitest";
import { getStudioModelById } from "./studio-model-catalog";
import { createDraft, toPersistedDraft } from "./studio-local-runtime-data";
import {
  buildTransferredStudioDraftState,
  type StudioDraftFrameInputs,
} from "./studio-draft-transfer";
import type { DraftReference } from "./types";

function createReference(params: {
  id: string;
  kind: DraftReference["kind"];
  name: string;
}): DraftReference {
  const file = new File([params.name], params.name, {
    type:
      params.kind === "image"
        ? "image/png"
        : params.kind === "video"
          ? "video/mp4"
          : "application/octet-stream",
  });

  return {
    id: params.id,
    file,
    source: "upload",
    originAssetId: null,
    title: params.name,
    kind: params.kind,
    mimeType: file.type,
    previewUrl: null,
    previewSource: "none",
  };
}

function emptyFrames(): StudioDraftFrameInputs {
  return {
    startFrame: null,
    endFrame: null,
  };
}

describe("buildTransferredStudioDraftState", () => {
  it("carries prompt and compatible references across prompt-based models", () => {
    const sourceModel = getStudioModelById("gpt-5.2");
    const targetModel = getStudioModelById("claude-sonnet-4.6");
    const imageReference = createReference({
      id: "ref-image",
      kind: "image",
      name: "forest.png",
    });

    const sourceDraft = {
      ...createDraft(sourceModel),
      prompt: "Summarize this image",
      references: [imageReference],
    };

    const result = buildTransferredStudioDraftState({
      sourceModel,
      targetModel,
      sourceDraft,
      targetPersistedDraft: toPersistedDraft(createDraft(targetModel)),
      targetReferences: [],
      targetFrames: emptyFrames(),
    });

    expect(result.persistedDraft.prompt).toBe("Summarize this image");
    expect(result.references).toEqual([imageReference]);
  });

  it("keeps the target prompt when switching away from background removal", () => {
    const sourceModel = getStudioModelById("bria-rmbg-2");
    const targetModel = getStudioModelById("nano-banana-2");
    const targetDraft = {
      ...createDraft(targetModel),
      prompt: "Create a product hero shot",
    };

    const result = buildTransferredStudioDraftState({
      sourceModel,
      targetModel,
      sourceDraft: createDraft(sourceModel),
      targetPersistedDraft: toPersistedDraft(targetDraft),
      targetReferences: [],
      targetFrames: emptyFrames(),
    });

    expect(result.persistedDraft.prompt).toBe("Create a product hero shot");
  });

  it("clears prompt and keeps one compatible image when switching to background removal", () => {
    const sourceModel = getStudioModelById("veo-3.1");
    const targetModel = getStudioModelById("bria-rmbg-2");
    const startFrame = createReference({
      id: "frame-start",
      kind: "image",
      name: "subject.png",
    });
    const sourceDraft = {
      ...createDraft(sourceModel),
      prompt: "Animate this character",
      videoInputMode: "frames" as const,
      references: [],
      startFrame,
      endFrame: null,
    };

    const result = buildTransferredStudioDraftState({
      sourceModel,
      targetModel,
      sourceDraft,
      targetPersistedDraft: toPersistedDraft(createDraft(targetModel)),
      targetReferences: [],
      targetFrames: emptyFrames(),
    });

    expect(result.persistedDraft.prompt).toBe("");
    expect(result.references).toEqual([startFrame]);
    expect(result.frames).toEqual(emptyFrames());
  });
});
