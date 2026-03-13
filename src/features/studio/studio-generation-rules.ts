import type { StudioAppMode } from "./studio-app-mode";
import type {
  GenerationRun,
  StudioDraft,
  StudioModelDefinition,
  StudioQueueSettings,
} from "./types";

type CreditQuoteDraft = Pick<StudioDraft, "durationSeconds" | "resolution">;
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

export function quoteStudioDraftCredits(
  modelId: string,
  draft: CreditQuoteDraft
) {
  if (modelId === "bria-background-remove") {
    return 1;
  }

  if (
    modelId === "minimax-speech-2.8-hd" ||
    modelId === "orpheus-tts" ||
    modelId === "dia-tts"
  ) {
    return 2;
  }

  if (modelId === "veo-3.1") {
    const durationMultiplier = Math.max(1, Math.round(draft.durationSeconds / 4));
    const resolutionBase =
      draft.resolution === "4K" ? 24 : draft.resolution === "1080p" ? 16 : 12;
    return resolutionBase + Math.max(0, durationMultiplier - 1) * 4;
  }

  if (modelId === "nano-banana-2") {
    if (draft.resolution === "4K") return 10;
    if (draft.resolution === "2K") return 7;
    return 4;
  }

  return 1;
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
