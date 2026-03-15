import { toPersistedDraft, createDraft } from "./studio-local-runtime-data";
import { getDraftReferenceDedupeKey } from "./studio-local-runtime-helpers";
import type {
  DraftReference,
  PersistedStudioDraft,
  StudioDraft,
  StudioModelDefinition,
} from "./types";

export interface StudioDraftFrameInputs {
  startFrame: DraftReference | null;
  endFrame: DraftReference | null;
}

interface BuildTransferredStudioDraftStateParams {
  sourceModel: Pick<
    StudioModelDefinition,
    | "requestMode"
    | "supportsNegativePrompt"
    | "supportsReferences"
    | "supportsFrameInputs"
    | "supportsEndFrame"
    | "acceptedReferenceKinds"
  >;
  targetModel: StudioModelDefinition;
  sourceDraft: StudioDraft;
  targetPersistedDraft?: PersistedStudioDraft | null;
  targetReferences?: DraftReference[] | null;
  targetFrames?: StudioDraftFrameInputs | null;
}

function supportsPromptInput(
  model: Pick<StudioModelDefinition, "requestMode">
) {
  return model.requestMode !== "background-removal";
}

function getAcceptedReferenceKinds(
  model: Pick<StudioModelDefinition, "acceptedReferenceKinds">
) {
  return model.acceptedReferenceKinds ?? ["image", "video"];
}

function filterCompatibleReferences(
  model: Pick<
    StudioModelDefinition,
    "acceptedReferenceKinds" | "maxReferenceFiles"
  >,
  references: DraftReference[]
) {
  const acceptedKinds = getAcceptedReferenceKinds(model);
  const maxReferenceFiles = model.maxReferenceFiles ?? 6;
  const seenKeys = new Set<string>();
  const compatibleReferences: DraftReference[] = [];

  for (const reference of references) {
    if (!acceptedKinds.includes(reference.kind)) {
      continue;
    }

    const dedupeKey = getDraftReferenceDedupeKey(reference);
    if (seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);
    compatibleReferences.push(reference);

    if (compatibleReferences.length >= maxReferenceFiles) {
      break;
    }
  }

  return compatibleReferences;
}

function collectFrameReferences(
  draft: Pick<StudioDraft, "startFrame" | "endFrame">
) {
  const candidates = [draft.startFrame, draft.endFrame].filter(
    (reference): reference is DraftReference => Boolean(reference)
  );

  return candidates.filter((reference) => reference.kind === "image");
}

function getCompatibleFrame(
  reference: DraftReference | null,
  model: Pick<StudioModelDefinition, "acceptedReferenceKinds">
) {
  if (!reference || reference.kind !== "image") {
    return null;
  }

  return getAcceptedReferenceKinds(model).includes("image") ? reference : null;
}

export function buildTransferredStudioDraftState(
  params: BuildTransferredStudioDraftStateParams
) {
  const targetDraft = {
    ...createDraft(params.targetModel),
    ...(params.targetPersistedDraft ?? {}),
  };
  const targetFrames = params.targetFrames ?? {
    startFrame: null,
    endFrame: null,
  };
  let nextPrompt = targetDraft.prompt;

  if (params.targetModel.requestMode === "background-removal") {
    nextPrompt = "";
  } else if (supportsPromptInput(params.sourceModel)) {
    nextPrompt = params.sourceDraft.prompt;
  }

  const nextPersistedDraft: PersistedStudioDraft = {
    ...toPersistedDraft(targetDraft),
    prompt: nextPrompt,
  };

  if (
    params.sourceModel.supportsNegativePrompt &&
    params.targetModel.supportsNegativePrompt
  ) {
    nextPersistedDraft.negativePrompt = params.sourceDraft.negativePrompt;
  }

  const sourceCanDriveReferenceState =
    params.sourceModel.supportsReferences ||
    params.sourceModel.supportsFrameInputs ||
    params.sourceModel.requestMode === "background-removal";

  const sourceReferences = params.sourceDraft.references;
  const sourceFrameReferences = collectFrameReferences(params.sourceDraft);

  if (params.targetModel.supportsFrameInputs) {
    if (
      params.sourceModel.supportsFrameInputs &&
      params.sourceDraft.videoInputMode === "frames"
    ) {
      const nextStartFrame = getCompatibleFrame(
        params.sourceDraft.startFrame,
        params.targetModel
      );
      const nextEndFrame = params.targetModel.supportsEndFrame
        ? getCompatibleFrame(params.sourceDraft.endFrame, params.targetModel)
        : null;

      return {
        persistedDraft: {
          ...nextPersistedDraft,
          videoInputMode:
            nextStartFrame || nextEndFrame ? "frames" : "references",
        },
        references: filterCompatibleReferences(params.targetModel, sourceReferences),
        frames: {
          startFrame: nextStartFrame,
          endFrame: nextEndFrame,
        } satisfies StudioDraftFrameInputs,
      };
    }

    if (sourceCanDriveReferenceState) {
      return {
        persistedDraft: {
          ...nextPersistedDraft,
          videoInputMode: "references",
        },
        references: filterCompatibleReferences(params.targetModel, [
          ...sourceReferences,
          ...sourceFrameReferences,
        ]),
        frames: {
          startFrame: null,
          endFrame: null,
        } satisfies StudioDraftFrameInputs,
      };
    }

    return {
      persistedDraft: nextPersistedDraft,
      references: params.targetReferences ?? [],
      frames: targetFrames,
    };
  }

  if (params.targetModel.supportsReferences) {
    return {
      persistedDraft: nextPersistedDraft,
      references: sourceCanDriveReferenceState
        ? filterCompatibleReferences(params.targetModel, [
            ...sourceReferences,
            ...sourceFrameReferences,
          ])
        : (params.targetReferences ?? []),
      frames: {
        startFrame: null,
        endFrame: null,
      } satisfies StudioDraftFrameInputs,
    };
  }

  return {
    persistedDraft: nextPersistedDraft,
    references: [],
    frames: {
      startFrame: null,
      endFrame: null,
    } satisfies StudioDraftFrameInputs,
  };
}
