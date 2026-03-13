import type { StudioAppMode } from "./studio-app-mode";
import type {
  GenerationRun,
  StudioDraft,
  StudioGenerationRequestMode,
  StudioModelDefinition,
  StudioQueueSettings,
} from "./types";

type RunTimingShape = Pick<GenerationRun, "kind" | "prompt">;
type HostedQueueShape = Pick<
  StudioQueueSettings,
  "activeHostedUserCount" | "providerSlotLimit"
>;

const HOSTED_QUEUE_ROTATION_SLICE_MS = 1400;

function hashUserIdToPosition(userId: string, modulo: number) {
  let hash = 0;

  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }

  return modulo <= 1 ? 0 : hash % modulo;
}

export function getHostedStudioConcurrencyLimit(queueSettings: HostedQueueShape) {
  const activeUsers = Math.max(queueSettings.activeHostedUserCount, 1);
  return Math.max(1, Math.floor(queueSettings.providerSlotLimit / activeUsers));
}

export function getHostedStudioFairShare(params: {
  queueSettings: HostedQueueShape;
  userId: string;
  now?: number;
}) {
  const activeUsers = Math.max(params.queueSettings.activeHostedUserCount, 1);
  const providerSlotLimit = Math.max(params.queueSettings.providerSlotLimit, 1);
  const now = params.now ?? Date.now();
  const sliceNumber = Math.floor(now / HOSTED_QUEUE_ROTATION_SLICE_MS);
  const userPosition = hashUserIdToPosition(params.userId, activeUsers);
  const guaranteedSlots = Math.floor(providerSlotLimit / activeUsers);
  const rotatingSlots = providerSlotLimit % activeUsers;
  const rotationStart = sliceNumber % activeUsers;
  const distanceFromRotationStart =
    (userPosition - rotationStart + activeUsers) % activeUsers;
  const receivesRotatingSlot =
    rotatingSlots > 0 && distanceFromRotationStart < rotatingSlots;
  const maxProcessing = guaranteedSlots + (receivesRotatingSlot ? 1 : 0);

  return {
    maxProcessing,
    nextRetryDelayMs:
      HOSTED_QUEUE_ROTATION_SLICE_MS - (now % HOSTED_QUEUE_ROTATION_SLICE_MS) + 40,
    rotationSliceMs: HOSTED_QUEUE_ROTATION_SLICE_MS,
  };
}

export function getStudioConcurrencyLimitForMode(
  mode: StudioAppMode,
  queueSettings: StudioQueueSettings
) {
  if (mode === "hosted") {
    return getHostedStudioConcurrencyLimit(queueSettings);
  }

  return queueSettings.localConcurrencyLimit;
}

export function getStudioRunCompletionDelayMs(run: Pick<RunTimingShape, "kind">) {
  if (run.kind === "video") {
    return 3200;
  }

  if (run.kind === "audio") {
    return 1600;
  }

  if (run.kind === "text") {
    return 1200;
  }

  return 1800;
}

export function shouldStudioMockRunFail(run: Pick<RunTimingShape, "prompt">) {
  return /\b(fail|error)\b/i.test(run.prompt);
}

export function resolveStudioGenerationRequestMode(
  model: Pick<
    StudioModelDefinition,
    "kind" | "requestMode" | "supportsFrameInputs" | "supportsEndFrame"
  >,
  draft: Pick<
    StudioDraft,
    "references" | "startFrame" | "endFrame" | "videoInputMode"
  >
): StudioGenerationRequestMode {
  if (model.kind !== "video") {
    return model.requestMode;
  }

  if (model.supportsFrameInputs && draft.videoInputMode === "frames") {
    if (draft.startFrame && draft.endFrame && model.supportsEndFrame) {
      return "first-last-frame-to-video";
    }

    if (draft.startFrame || draft.endFrame) {
      return "image-to-video";
    }

    return "text-to-video";
  }

  if (draft.references.length > 1) {
    return "reference-to-video";
  }

  if (draft.references.length > 0) {
    return "image-to-video";
  }

  return "text-to-video";
}

export function canGenerateWithDraft(
  model: Pick<StudioModelDefinition, "minimumReferenceFiles" | "requiresPrompt">,
  draft: Pick<StudioDraft, "prompt" | "references">
) {
  const requiresPrompt = model.requiresPrompt ?? true;
  const minimumReferenceFiles = model.minimumReferenceFiles ?? 0;

  if (requiresPrompt && draft.prompt.trim().length === 0) {
    return false;
  }

  if (draft.references.length < minimumReferenceFiles) {
    return false;
  }

  return true;
}
