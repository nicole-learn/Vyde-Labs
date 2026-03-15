"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { StudioAppMode } from "./studio-app-mode";
import { readUploadedAssetMediaMetadata } from "./studio-asset-metadata";
import {
  loadStoredProviderSettings,
  saveStoredProviderSettings,
} from "./studio-browser-storage";
import { buildTransferredStudioDraftState } from "./studio-draft-transfer";
import { normalizeTextReferenceForProvider } from "./studio-text-reference-preparation";
import {
  canGenerateWithDraft,
  resolveStudioGenerationRequestMode,
} from "./studio-generation-rules";
import { reorderStudioFoldersByIds, sortStudioFoldersByOrder } from "./studio-folder-order";
import {
  getConfiguredStudioModels,
  normalizeStudioEnabledModelIds,
  resolveConfiguredStudioModelId,
  toggleStudioModelEnabled,
} from "./studio-model-configuration";
import {
  buildStudioDraftMap,
  createDraft,
  createGenerationRunPreviewUrl,
  createGenerationRunSummary,
  createDraftSnapshot,
  createStudioSeedSnapshot,
  hydrateDraft,
  toPersistedDraft,
} from "./studio-local-runtime-data";
import {
  appendLibraryItemsToPrompt,
  createDraftReferenceFromFile,
  createDraftReferenceFromLibraryItem,
  createFolderItemCounts,
  hasFolderNameConflict,
  isInFlightStudioRunStatus,
  isReferenceEligibleLibraryItem,
  mergeDraftReferences,
  releaseDraftReferencePreview,
  releaseRemovedDraftReferencePreviews,
  resolveLibraryItemToReferenceFile,
  revokePreviewUrl,
} from "./studio-local-runtime-helpers";
import {
  findReusableRunIdForLibraryItem,
  getTextNotePromptBarValue,
  isTextNoteLibraryItem,
  resolvePromptBarReuseModelId,
} from "./studio-library-item-behavior";
import {
  STUDIO_MODEL_CATALOG,
  STUDIO_MODEL_SECTIONS,
  getStudioModelById,
} from "./studio-model-catalog";
import { quoteStudioDraftPricing } from "./studio-model-pricing";
import {
  getHostedAccessToken,
  getHostedSessionState,
  signInWithGoogleHostedSession,
  signOutHostedSession,
  subscribeToHostedAuthChanges,
} from "./studio-hosted-session";
import type {
  LocalStudioGenerateResponse,
  LocalStudioGenerateInputDescriptor,
  LocalStudioMutation,
  LocalStudioSnapshotResponse,
  LocalStudioSyncResponse,
  LocalStudioUploadManifestEntry,
} from "./studio-local-api";
import type {
  HostedStudioGenerateResponse,
  HostedStudioGenerateInputDescriptor,
  HostedStudioMutation,
  HostedStudioMutationResponse,
  HostedStudioSyncResponse,
  HostedStudioUploadManifestEntry,
} from "./studio-hosted-api";
import { getStudioUploadedMediaKind, studioUploadSupportsAlpha } from "./studio-upload-files";
import type {
  DraftReference,
  GenerationRun,
  LibraryItem,
  PersistedStudioDraft,
  StudioDraft,
  StudioFolderEditorMode,
  StudioHostedAccount,
  StudioHostedWorkspaceState,
  StudioModelConfiguration,
  StudioProviderKeyId,
  StudioProviderSaveResult,
  StudioProviderSettings,
  StudioVideoInputMode,
  StudioWorkspaceSnapshot,
} from "./types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const EMPTY_PROVIDER_SETTINGS: StudioProviderSettings = {
  falApiKey: "",
  falLastValidatedAt: null,
  openaiApiKey: "",
  openaiLastValidatedAt: null,
  anthropicApiKey: "",
  anthropicLastValidatedAt: null,
  geminiApiKey: "",
  geminiLastValidatedAt: null,
};

type HostedAuthStatus = "checking" | "signed_out" | "signed_in";

function getProviderKeyIdForModelProvider(
  provider: "fal" | "openai" | "anthropic" | "google"
): StudioProviderKeyId {
  switch (provider) {
    case "openai":
      return "openai";
    case "anthropic":
      return "anthropic";
    case "google":
      return "gemini";
    default:
      return "fal";
  }
}

function getLocalProviderKeyForModel(params: {
  provider: "fal" | "openai" | "anthropic" | "google";
  providerSettings: StudioProviderSettings;
}) {
  switch (params.provider) {
    case "openai":
      return params.providerSettings.openaiApiKey.trim();
    case "anthropic":
      return params.providerSettings.anthropicApiKey.trim();
    case "google":
      return params.providerSettings.geminiApiKey.trim();
    default:
      return params.providerSettings.falApiKey.trim();
  }
}

function createSignedOutHostedSnapshot(seedSnapshot: StudioWorkspaceSnapshot) {
  return {
    ...seedSnapshot,
    profile: {
      ...seedSnapshot.profile,
      id: "hosted-signed-out",
      email: "",
      displayName: "",
      avatarLabel: "G",
      avatarUrl: null,
    },
    creditBalance: null,
    activeCreditPack: null,
    folders: [],
    runFiles: [],
    libraryItems: [],
    generationRuns: [],
  } satisfies StudioWorkspaceSnapshot;
}

function createEmptyDraftReferenceMap() {
  return Object.fromEntries(
    STUDIO_MODEL_CATALOG.map((model) => [model.id, [] as DraftReference[]])
  ) as Record<string, DraftReference[]>;
}

type DraftFrameInputs = {
  startFrame: DraftReference | null;
  endFrame: DraftReference | null;
};

function createEmptyDraftFrameMap() {
  return Object.fromEntries(
    STUDIO_MODEL_CATALOG.map((model) => [
      model.id,
      { startFrame: null, endFrame: null } satisfies DraftFrameInputs,
    ])
  ) as Record<string, DraftFrameInputs>;
}

function createOptimisticRunId() {
  return `optimistic-${crypto.randomUUID()}`;
}

function createOptimisticQueuedRun(params: {
  appMode: StudioAppMode;
  modelId: string;
  userId: string;
  workspaceId: string;
  draft: StudioDraft;
}) {
  const model = getStudioModelById(params.modelId);
  const persistedDraft = toPersistedDraft(params.draft);
  const createdAt = new Date().toISOString();
  const pricingQuote = quoteStudioDraftPricing(model, persistedDraft);
  const referenceCount = params.draft.references.length;
  const startFrameCount = params.draft.startFrame ? 1 : 0;
  const endFrameCount = params.draft.endFrame ? 1 : 0;

  return {
    id: createOptimisticRunId(),
    userId: params.userId,
    workspaceId: params.workspaceId,
    folderId: null,
    deletedAt: null,
    modelId: model.id,
    modelName: model.name,
    kind: model.kind,
    provider: model.provider,
    requestMode: resolveStudioGenerationRequestMode(model, params.draft),
    status: "queued",
    prompt: params.draft.prompt,
    createdAt,
    queueEnteredAt: createdAt,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    updatedAt: createdAt,
    summary: createGenerationRunSummary(model, params.draft),
    outputAssetId: null,
    previewUrl: createGenerationRunPreviewUrl(model, params.draft),
    errorMessage: null,
    inputPayload: {
      prompt: params.draft.prompt,
      request_mode: resolveStudioGenerationRequestMode(model, params.draft),
      reference_count: referenceCount,
      start_frame_count: startFrameCount,
      end_frame_count: endFrameCount,
      video_input_mode: persistedDraft.videoInputMode,
      model_id: model.id,
      optimistic: true,
      mode: params.appMode,
    },
    inputSettings: {
      ...persistedDraft,
      reference_count: referenceCount,
      start_frame_count: startFrameCount,
      end_frame_count: endFrameCount,
    },
    providerRequestId: null,
    providerStatus: "queued",
    estimatedCostUsd: pricingQuote.apiCostUsd,
    actualCostUsd: null,
    estimatedCredits: pricingQuote.billedCredits,
    actualCredits: null,
    usageSnapshot: {},
    outputText: null,
    pricingSnapshot: pricingQuote.pricingSnapshot,
    dispatchAttemptCount: 0,
    dispatchLeaseExpiresAt: null,
    canCancel: true,
    draftSnapshot: {
      ...persistedDraft,
      referenceCount,
      startFrameCount,
      endFrameCount,
    },
  } satisfies GenerationRun;
}

async function fetchHostedWithSession(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  const accessToken = await getHostedAccessToken();
  if (!accessToken) {
    throw new Error("Sign in with Google to use hosted mode.");
  }

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(input, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  });

  if (response.status !== 401) {
    return response;
  }

  await signOutHostedSession().catch(() => undefined);
  throw new Error("Your hosted session expired. Sign in with Google again.");
}

function isAbortRequestError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function submitFeedbackRequest(params: {
  message: string;
  signal?: AbortSignal;
}) {
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: params.message,
    }),
    cache: "no-store",
    credentials: "same-origin",
    signal: params.signal,
  });

  const payload = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Could not submit feedback.");
  }
}

async function syncLocalProviderSession(
  providerSettings: StudioProviderSettings,
  signal?: AbortSignal
) {
  const keyMap = {
    falApiKey: providerSettings.falApiKey.trim(),
    openaiApiKey: providerSettings.openaiApiKey.trim(),
    anthropicApiKey: providerSettings.anthropicApiKey.trim(),
    geminiApiKey: providerSettings.geminiApiKey.trim(),
  };
  const hasAnyKey = Object.values(keyMap).some((value) => value.length > 0);
  const response = await fetch("/api/studio/local/provider-session", {
    method: hasAnyKey ? "POST" : "DELETE",
    headers: hasAnyKey
      ? {
          "Content-Type": "application/json",
        }
      : undefined,
    body: hasAnyKey
      ? JSON.stringify(keyMap)
      : undefined,
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const payload = (await response.json()) as { error?: string; ok?: boolean };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Could not sync the local provider session.");
  }
}

async function fetchLocalBootstrap(params?: {
  signal?: AbortSignal;
}) {
  const response = await fetch("/api/studio/local/bootstrap", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    signal: params?.signal,
  });
  const payload = (await response.json()) as LocalStudioSyncResponse & {
    error?: string;
  };

  if (!response.ok || payload.kind === "noop") {
    throw new Error(payload.error ?? "Could not load local workspace.");
  }

  return payload;
}

async function fetchLocalSync(params: {
  sinceRevision: number | null;
  signal?: AbortSignal;
}) {
  const searchParams = new URLSearchParams();
  if (typeof params.sinceRevision === "number") {
    searchParams.set("sinceRevision", String(params.sinceRevision));
  }

  const response = await fetch(`/api/studio/local/sync?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    signal: params.signal,
  });
  const payload = (await response.json()) as LocalStudioSyncResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not sync local workspace.");
  }

  return payload;
}

async function mutateLocalSnapshot(
  mutation: LocalStudioMutation,
  signal?: AbortSignal
) {
  const response = await fetch("/api/studio/local/mutate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mutation),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const payload = (await response.json()) as LocalStudioSnapshotResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Local workspace mutation failed.");
  }

  return payload;
}

async function uploadLocalFiles(
  files: File[],
  folderId: string | null,
  signal?: AbortSignal
) {
  const manifest = (
    await Promise.all(
      files.map(async (file) => {
        const kind = getStudioUploadedMediaKind({
          fileName: file.name,
          mimeType: file.type,
        });

        if (!kind) {
          return null;
        }

        const previewUrl = URL.createObjectURL(file);
        try {
          const metadata = await readUploadedAssetMediaMetadata({
            kind,
            previewUrl,
            mimeType: file.type,
            hasAlpha: studioUploadSupportsAlpha(file.type),
          });

          return {
            kind,
            mediaWidth: metadata.mediaWidth,
            mediaHeight: metadata.mediaHeight,
            mediaDurationSeconds: metadata.mediaDurationSeconds,
            aspectRatioLabel: metadata.aspectRatioLabel,
            hasAlpha: metadata.hasAlpha,
          } satisfies LocalStudioUploadManifestEntry;
        } finally {
          URL.revokeObjectURL(previewUrl);
        }
      })
    )
  ).filter((entry): entry is LocalStudioUploadManifestEntry => Boolean(entry));

  if (manifest.length !== files.length) {
    throw new Error("Only image, video, and audio uploads are supported.");
  }

  const formData = new FormData();
  if (folderId) {
    formData.set("folderId", folderId);
  }
  formData.set("manifest", JSON.stringify(manifest));
  for (const file of files) {
    formData.append("files", file);
  }

  const response = await fetch("/api/studio/local/uploads", {
    method: "POST",
    body: formData,
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const payload = (await response.json()) as LocalStudioSnapshotResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Local upload failed.");
  }

  return payload;
}

async function queueLocalGenerationRequest(params: {
  clientRequestId: string;
  modelId: string;
  folderId: string | null;
  draft: PersistedStudioDraft;
  inputs: LocalStudioGenerateInputDescriptor[];
  filesByField: Map<string, File>;
  signal?: AbortSignal;
}) {
  const formData = new FormData();
  formData.set("clientRequestId", params.clientRequestId);
  formData.set("modelId", params.modelId);
  formData.set("draft", JSON.stringify(params.draft));
  formData.set("inputs", JSON.stringify(params.inputs));
  for (const [field, file] of params.filesByField.entries()) {
    formData.set(`input-file:${field}`, file);
  }

  const response = await fetch("/api/studio/local/generate", {
    method: "POST",
    body: formData,
    cache: "no-store",
    credentials: "same-origin",
    signal: params.signal,
  });
  const payload = (await response.json()) as LocalStudioGenerateResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Local generation failed.");
  }

  return payload;
}

async function fetchHostedSync(params: {
  sinceRevision: number | null;
  signal?: AbortSignal;
}) {
  const searchParams = new URLSearchParams();
  if (typeof params.sinceRevision === "number") {
    searchParams.set("sinceRevision", String(params.sinceRevision));
  }

  const response = await fetchHostedWithSession(`/api/studio/hosted/sync?${searchParams.toString()}`, {
    method: "GET",
    signal: params.signal,
  });
  const payload = (await response.json()) as HostedStudioSyncResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load hosted workspace.");
  }

  return payload;
}

async function mutateHostedSnapshot(
  mutation: HostedStudioMutation,
  signal?: AbortSignal
) {
  const response = await fetchHostedWithSession("/api/studio/hosted/mutate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mutation),
    signal,
  });
  const payload = (await response.json()) as HostedStudioMutationResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Hosted workspace mutation failed.");
  }

  return payload;
}

async function uploadHostedFiles(
  files: File[],
  folderId: string | null,
  signal?: AbortSignal
) {
  const manifest = (
    await Promise.all(
      files.map(async (file) => {
        const kind = getStudioUploadedMediaKind({
          fileName: file.name,
          mimeType: file.type,
        });

        if (!kind) {
          return null;
        }

        const previewUrl = URL.createObjectURL(file);
        try {
          const metadata = await readUploadedAssetMediaMetadata({
            kind,
            previewUrl,
            mimeType: file.type,
            hasAlpha: studioUploadSupportsAlpha(file.type),
          });

          return {
            kind,
            mediaWidth: metadata.mediaWidth,
            mediaHeight: metadata.mediaHeight,
            mediaDurationSeconds: metadata.mediaDurationSeconds,
            aspectRatioLabel: metadata.aspectRatioLabel,
            hasAlpha: metadata.hasAlpha,
          } satisfies HostedStudioUploadManifestEntry;
        } finally {
          URL.revokeObjectURL(previewUrl);
        }
      })
    )
  ).filter(
    (entry): entry is HostedStudioUploadManifestEntry => Boolean(entry)
  );
  if (manifest.length !== files.length) {
    throw new Error("Only image, video, and audio uploads are supported.");
  }

  const formData = new FormData();
  if (folderId) {
    formData.set("folderId", folderId);
  }
  formData.set("manifest", JSON.stringify(manifest));
  for (const file of files) {
    formData.append("files", file);
  }

  const response = await fetchHostedWithSession("/api/studio/hosted/uploads", {
    method: "POST",
    body: formData,
    signal,
  });
  const payload = (await response.json()) as HostedStudioMutationResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Hosted upload failed.");
  }

  return payload;
}

async function queueHostedGeneration(params: {
  clientRequestId: string;
  modelId: string;
  folderId: string | null;
  draft: GenerationRun["draftSnapshot"] | PersistedStudioDraft;
  inputs: HostedStudioGenerateInputDescriptor[];
  filesByField: Map<string, File>;
  signal?: AbortSignal;
}) {
  const formData = new FormData();
  formData.set("clientRequestId", params.clientRequestId);
  formData.set("modelId", params.modelId);
  formData.set("draft", JSON.stringify(params.draft));
  formData.set("inputs", JSON.stringify(params.inputs));

  for (const [field, file] of params.filesByField.entries()) {
    formData.append(`input-file:${field}`, file);
  }

  const response = await fetchHostedWithSession("/api/studio/hosted/generate", {
    method: "POST",
    body: formData,
    signal: params.signal,
  });
  const payload = (await response.json()) as HostedStudioGenerateResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Hosted generation could not be queued.");
  }

  return payload;
}

async function createHostedCheckoutSessionRequest(params: {
  successPath?: string;
  cancelPath?: string;
  checkoutRequestId?: string;
  signal?: AbortSignal;
}) {
  const response = await fetchHostedWithSession(
    "/api/studio/hosted/billing/checkout",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        successPath: params.successPath,
        cancelPath: params.cancelPath,
        checkoutRequestId: params.checkoutRequestId,
      }),
      signal: params.signal,
    }
  );
  const payload = (await response.json()) as {
    checkoutUrl?: string;
    error?: string;
  };

  if (!response.ok || !payload.checkoutUrl) {
    throw new Error(payload.error ?? "Could not start the Stripe Checkout flow.");
  }

  return payload.checkoutUrl;
}

async function completeHostedCheckoutSessionRequest(params: {
  checkoutSessionId: string;
  signal?: AbortSignal;
}) {
  const response = await fetchHostedWithSession(
    "/api/studio/hosted/billing/complete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        checkoutSessionId: params.checkoutSessionId,
      }),
      signal: params.signal,
    }
  );
  const payload = (await response.json()) as {
    error?: string;
    status?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not finalize the Stripe checkout session.");
  }

  return payload;
}

async function deleteHostedAccountRequest(signal?: AbortSignal) {
  const response = await fetchHostedWithSession("/api/studio/hosted/account", {
    method: "DELETE",
    signal,
  });
  const payload = (await response.json()) as { error?: string; ok?: boolean };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Could not delete your hosted account.");
  }
}

async function validateProviderApiKey(provider: StudioProviderKeyId, apiKey: string) {
  const response = await fetch("/api/providers/validate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ provider, apiKey }),
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = (await response.json()) as {
    error?: string;
    ok?: boolean;
    validatedAt?: string;
  };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Could not validate your Fal API key.");
  }

  return payload.validatedAt ?? new Date().toISOString();
}

export function useStudioRuntimeCore(appMode: StudioAppMode) {
  const seedSnapshot = useMemo(() => createStudioSeedSnapshot(appMode), [appMode]);
  const signedOutHostedSnapshot = useMemo(
    () => createSignedOutHostedSnapshot(seedSnapshot),
    [seedSnapshot]
  );
  const previewUrlsRef = useRef(new Map<string, string>());
  const storageHydratedRef = useRef(false);
  const dispatchTimersRef = useRef(new Map<string, number>());
  const completionTimersRef = useRef(new Map<string, number>());
  const draftReferencesRef = useRef(createEmptyDraftReferenceMap());
  const draftFramesRef = useRef(createEmptyDraftFrameMap());
  const runsRef = useRef(seedSnapshot.generationRuns);
  const optimisticRunIdByClientRequestRef = useRef(new Map<string, string>());
  const localModeSessionRef = useRef(0);
  const localLatestStartedRequestRef = useRef(0);
  const localLatestAppliedRequestRef = useRef(0);
  const localRevisionRef = useRef(0);
  const localSyncIntervalRef = useRef(1200);
  const localRequestControllersRef = useRef(new Set<AbortController>());
  const hostedModeSessionRef = useRef(0);
  const hostedLatestStartedRequestRef = useRef(0);
  const hostedLatestAppliedRequestRef = useRef(0);
  const hostedRevisionRef = useRef(0);
  const hostedSyncIntervalRef = useRef(1400);
  const hostedRequestControllersRef = useRef(new Set<AbortController>());
  const hostedRealtimeRefreshTimerRef = useRef<number | null>(null);
  const completedCheckoutSessionIdsRef = useRef(new Set<string>());
  const zeroCreditsDialogOpenedRef = useRef(false);

  const [profile, setProfile] = useState(seedSnapshot.profile);
  const [creditBalance, setCreditBalance] = useState(seedSnapshot.creditBalance);
  const [activeCreditPack, setActiveCreditPack] = useState(seedSnapshot.activeCreditPack);
  const [modelConfiguration, setModelConfiguration] = useState<StudioModelConfiguration>(
    seedSnapshot.modelConfiguration
  );
  const [, setQueueSettings] = useState(seedSnapshot.queueSettings);
  const [selectedModelId, setSelectedModelIdState] = useState(seedSnapshot.selectedModelId);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState(seedSnapshot.folders);
  const [items, setItems] = useState(seedSnapshot.libraryItems);
  const [, setRunFiles] = useState(seedSnapshot.runFiles);
  const [runs, setRuns] = useState(seedSnapshot.generationRuns);
  const [draftsByModelId, setDraftsByModelId] = useState(seedSnapshot.draftsByModelId);
  const [draftReferencesByModelId, setDraftReferencesByModelId] = useState(
    createEmptyDraftReferenceMap
  );
  const [draftFramesByModelId, setDraftFramesByModelId] = useState(
    createEmptyDraftFrameMap
  );
  const [gallerySizeLevel, setGallerySizeLevelState] = useState(
    seedSnapshot.gallerySizeLevel
  );
  const [providerSettings, setProviderSettings] = useState<StudioProviderSettings>(
    EMPTY_PROVIDER_SETTINGS
  );
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [highlightedProviderKey, setHighlightedProviderKey] =
    useState<StudioProviderKeyId | null>(null);
  const [folderEditorOpen, setFolderEditorOpen] = useState(false);
  const [folderEditorMode, setFolderEditorMode] =
    useState<StudioFolderEditorMode>("create");
  const [folderEditorValue, setFolderEditorValue] = useState("");
  const [folderEditorTargetId, setFolderEditorTargetId] = useState<string | null>(
    null
  );
  const [folderEditorError, setFolderEditorError] = useState<string | null>(null);
  const [folderEditorSaving, setFolderEditorSaving] = useState(false);
  const [selectionModeEnabled, setSelectionModeEnabled] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [createTextDialogOpen, setCreateTextDialogOpen] = useState(false);
  const [createTextTitle, setCreateTextTitle] = useState("");
  const [createTextBody, setCreateTextBody] = useState("");
  const [createTextSaving, setCreateTextSaving] = useState(false);
  const [createTextErrorMessage, setCreateTextErrorMessage] = useState<string | null>(
    null
  );
  const [savePromptPending, setSavePromptPending] = useState(false);
  const [generatePending, setGeneratePending] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadDialogFolderId, setUploadDialogFolderId] = useState<string | null>(
    null
  );
  const [uploadAssetsLoading, setUploadAssetsLoading] = useState(false);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [feedbackErrorMessage, setFeedbackErrorMessage] = useState<string | null>(
    null
  );
  const [feedbackSuccessMessage, setFeedbackSuccessMessage] = useState<
    string | null
  >(null);
  const [generationErrorDialogOpen, setGenerationErrorDialogOpen] = useState(false);
  const [generationErrorMessage, setGenerationErrorMessage] = useState("");
  const [queueLimitDialogOpen, setQueueLimitDialogOpen] = useState(false);
  const [purchaseCreditsPending, setPurchaseCreditsPending] = useState(false);
  const [purchaseCreditsErrorMessage, setPurchaseCreditsErrorMessage] = useState<string | null>(
    null
  );
  const [modelConfigurationPending, setModelConfigurationPending] = useState(false);
  const [modelConfigurationErrorMessage, setModelConfigurationErrorMessage] =
    useState<string | null>(null);
  const [hostedSetupMessage, setHostedSetupMessage] = useState<string | null>(null);
  const [hostedAuthStatus, setHostedAuthStatus] = useState<HostedAuthStatus>(
    appMode === "hosted" ? "checking" : "signed_out"
  );
  const [hostedAuthDialogOpen, setHostedAuthDialogOpen] = useState(false);
  const [hostedAuthPending, setHostedAuthPending] = useState(false);
  const [hostedAuthErrorMessage, setHostedAuthErrorMessage] = useState<string | null>(
    null
  );
  const [accountActionPending, setAccountActionPending] = useState<
    "delete" | "sign_out" | null
  >(null);
  const [accountActionErrorMessage, setAccountActionErrorMessage] = useState<
    string | null
  >(null);
  const [hostedSessionUser, setHostedSessionUser] = useState<User | null>(null);
  const openSettingsDialog = useCallback((highlightedProvider?: StudioProviderKeyId) => {
    setHighlightedProviderKey(highlightedProvider ?? null);
    setSettingsDialogOpen(true);
  }, []);

  const closeSettingsDialog = useCallback(() => {
    setHighlightedProviderKey(null);
    setSettingsDialogOpen(false);
  }, []);
  const normalizedEnabledModelIds = useMemo(
    () => normalizeStudioEnabledModelIds(modelConfiguration.enabledModelIds),
    [modelConfiguration.enabledModelIds]
  );
  const models = useMemo(
    () => getConfiguredStudioModels(normalizedEnabledModelIds),
    [normalizedEnabledModelIds]
  );
  const hostedUserSignedIn = hostedAuthStatus === "signed_in";

  const applySnapshot = useCallback(
    (nextSnapshot: StudioWorkspaceSnapshot, options?: { preserveDrafts?: boolean }) => {
      setProfile(nextSnapshot.profile);
      setCreditBalance(nextSnapshot.creditBalance);
      setActiveCreditPack(nextSnapshot.activeCreditPack);
      setModelConfiguration({
        ...nextSnapshot.modelConfiguration,
        enabledModelIds: normalizeStudioEnabledModelIds(
          nextSnapshot.modelConfiguration.enabledModelIds
        ),
      });
      setQueueSettings(nextSnapshot.queueSettings);
      setFolders(sortStudioFoldersByOrder(nextSnapshot.folders));
      setRunFiles(nextSnapshot.runFiles);
      setRuns(nextSnapshot.generationRuns);
      setItems(nextSnapshot.libraryItems);

      if (!options?.preserveDrafts) {
        setDraftsByModelId(nextSnapshot.draftsByModelId);
        setSelectedModelIdState(nextSnapshot.selectedModelId);
        setGallerySizeLevelState(nextSnapshot.gallerySizeLevel);
      }
    },
    []
  );

  const applyHostedState = useCallback((nextState: StudioHostedWorkspaceState) => {
    hostedRevisionRef.current = nextState.revision;
    setProfile(nextState.profile);
    setCreditBalance(nextState.creditBalance);
    setActiveCreditPack(nextState.activeCreditPack);
    setModelConfiguration({
      ...nextState.modelConfiguration,
      enabledModelIds: normalizeStudioEnabledModelIds(
        nextState.modelConfiguration.enabledModelIds
      ),
    });
    setQueueSettings(nextState.queueSettings);
    setFolders(sortStudioFoldersByOrder(nextState.folders));
    setRunFiles(nextState.runFiles);
    setRuns(nextState.generationRuns);
    setItems(nextState.libraryItems);
  }, []);

  const applyHostedSyncPayload = useCallback(
    (payload: HostedStudioSyncResponse) => {
      if (payload.revision < hostedRevisionRef.current) {
        return;
      }

      if (payload.kind === "noop") {
        hostedRevisionRef.current = Math.max(
          hostedRevisionRef.current,
          payload.revision
        );
        return;
      }

      if (payload.revision === hostedRevisionRef.current) {
        return;
      }

      hostedRevisionRef.current = payload.revision;
      applyHostedState(payload.state);
      if (payload.kind === "bootstrap") {
        setSelectedModelIdState(payload.uiStateDefaults.selectedModelId);
        setGallerySizeLevelState(payload.uiStateDefaults.gallerySizeLevel);
      }
    },
    [applyHostedState]
  );

  const insertOptimisticRun = useCallback(
    (clientRequestId: string, optimisticRun: GenerationRun) => {
      optimisticRunIdByClientRequestRef.current.set(clientRequestId, optimisticRun.id);
      setRuns((current) => [
        optimisticRun,
        ...current.filter((entry) => entry.id !== optimisticRun.id),
      ]);
    },
    []
  );

  const removeOptimisticRun = useCallback((clientRequestId: string) => {
    const optimisticRunId =
      optimisticRunIdByClientRequestRef.current.get(clientRequestId) ?? null;
    if (!optimisticRunId) {
      return;
    }

    optimisticRunIdByClientRequestRef.current.delete(clientRequestId);
    setRuns((current) => current.filter((entry) => entry.id !== optimisticRunId));
  }, []);

  const reconcileOptimisticRun = useCallback(
    (clientRequestId: string | null, nextRun: GenerationRun) => {
      const optimisticRunId =
        clientRequestId
          ? optimisticRunIdByClientRequestRef.current.get(clientRequestId) ?? null
          : null;

      if (clientRequestId) {
        optimisticRunIdByClientRequestRef.current.delete(clientRequestId);
      }

      setRuns((current) => [
        nextRun,
        ...current.filter(
          (entry) => entry.id !== nextRun.id && entry.id !== optimisticRunId
        ),
      ]);
    },
    []
  );

  const applyLocalQueuedRunResponse = useCallback(
    (
      payload: LocalStudioGenerateResponse,
      params: { requestId: number; sessionId: number }
    ) => {
      if (localModeSessionRef.current !== params.sessionId) {
        return false;
      }

      if (payload.revision < localRevisionRef.current) {
        return false;
      }

      if (
        payload.revision === localRevisionRef.current &&
        params.requestId <= localLatestAppliedRequestRef.current
      ) {
        return false;
      }

      localLatestAppliedRequestRef.current = Math.max(
        localLatestAppliedRequestRef.current,
        params.requestId
      );
      localRevisionRef.current = Math.max(localRevisionRef.current, payload.revision);
      reconcileOptimisticRun(payload.clientRequestId, payload.run);
      return true;
    },
    [reconcileOptimisticRun]
  );

  const applyHostedQueuedRunResponse = useCallback(
    (
      payload: HostedStudioGenerateResponse,
      params: { requestId: number; sessionId: number }
    ) => {
      if (hostedModeSessionRef.current !== params.sessionId) {
        return false;
      }

      if (payload.revision < hostedRevisionRef.current) {
        return false;
      }

      if (
        payload.revision === hostedRevisionRef.current &&
        params.requestId <= hostedLatestAppliedRequestRef.current
      ) {
        return false;
      }

      hostedLatestAppliedRequestRef.current = Math.max(
        hostedLatestAppliedRequestRef.current,
        params.requestId
      );
      hostedRevisionRef.current = Math.max(hostedRevisionRef.current, payload.revision);
      if (payload.creditBalance) {
        setCreditBalance(payload.creditBalance);
      }
      reconcileOptimisticRun(payload.clientRequestId, payload.run);
      return true;
    },
    [reconcileOptimisticRun]
  );

  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  const getVisibleModelId = useCallback(
    (modelId: string) => {
      return resolveConfiguredStudioModelId({
        currentModelId: modelId,
        enabledModelIds: normalizedEnabledModelIds,
      });
    },
    [normalizedEnabledModelIds]
  );

  const visibleSelectedModelId = getVisibleModelId(selectedModelId);

  useEffect(() => {
    if (selectedModelId !== visibleSelectedModelId) {
      setSelectedModelIdState(visibleSelectedModelId);
    }
  }, [selectedModelId, visibleSelectedModelId]);

  useEffect(() => {
    draftReferencesRef.current = draftReferencesByModelId;
  }, [draftReferencesByModelId]);

  useEffect(() => {
    draftFramesRef.current = draftFramesByModelId;
  }, [draftFramesByModelId]);

  const clearAllTimers = useCallback(() => {
    for (const timerId of dispatchTimersRef.current.values()) {
      window.clearTimeout(timerId);
    }
    for (const timerId of completionTimersRef.current.values()) {
      window.clearTimeout(timerId);
    }
    dispatchTimersRef.current.clear();
    completionTimersRef.current.clear();
    if (hostedRealtimeRefreshTimerRef.current !== null) {
      window.clearTimeout(hostedRealtimeRefreshTimerRef.current);
      hostedRealtimeRefreshTimerRef.current = null;
    }
  }, []);

  const abortLocalRequests = useCallback(() => {
    for (const controller of localRequestControllersRef.current) {
      controller.abort();
    }
    localRequestControllersRef.current.clear();
  }, []);

  const beginLocalRequest = useCallback(() => {
    const controller = new AbortController();
    const sessionId = localModeSessionRef.current;
    const requestId = localLatestStartedRequestRef.current + 1;
    localLatestStartedRequestRef.current = requestId;
    localRequestControllersRef.current.add(controller);

    return {
      controller,
      requestId,
      sessionId,
    };
  }, []);

  const finishLocalRequest = useCallback((controller: AbortController) => {
    localRequestControllersRef.current.delete(controller);
  }, []);

  const applyLocalResponse = useCallback(
    (
      nextSnapshot: StudioWorkspaceSnapshot,
      params: { preserveDrafts?: boolean; requestId: number; sessionId: number; revision: number }
    ) => {
      if (localModeSessionRef.current !== params.sessionId) {
        return false;
      }

      if (params.revision < localRevisionRef.current) {
        return false;
      }

      if (
        params.revision === localRevisionRef.current &&
        params.requestId <= localLatestAppliedRequestRef.current
      ) {
        return false;
      }

      localLatestAppliedRequestRef.current = Math.max(
        localLatestAppliedRequestRef.current,
        params.requestId
      );
      localRevisionRef.current = Math.max(
        localRevisionRef.current,
        params.revision
      );
      applySnapshot(nextSnapshot, { preserveDrafts: params.preserveDrafts });
      return true;
    },
    [applySnapshot]
  );

  const abortHostedRequests = useCallback(() => {
    for (const controller of hostedRequestControllersRef.current) {
      controller.abort();
    }
    hostedRequestControllersRef.current.clear();
  }, []);

  const beginHostedRequest = useCallback(() => {
    const controller = new AbortController();
    const sessionId = hostedModeSessionRef.current;
    const requestId = hostedLatestStartedRequestRef.current + 1;
    hostedLatestStartedRequestRef.current = requestId;
    hostedRequestControllersRef.current.add(controller);

    return {
      controller,
      requestId,
      sessionId,
    };
  }, []);

  const finishHostedRequest = useCallback((controller: AbortController) => {
    hostedRequestControllersRef.current.delete(controller);
  }, []);

  const scheduleHostedRealtimeRefresh = useCallback(() => {
    if (hostedRealtimeRefreshTimerRef.current !== null) {
      return;
    }

    hostedRealtimeRefreshTimerRef.current = window.setTimeout(() => {
      hostedRealtimeRefreshTimerRef.current = null;
      const request = beginHostedRequest();

      void fetchHostedSync({
        sinceRevision: hostedRevisionRef.current,
        signal: request.controller.signal,
      })
        .then((response) => {
          finishHostedRequest(request.controller);
          if (response.kind === "noop") {
            hostedRevisionRef.current = Math.max(
              hostedRevisionRef.current,
              response.revision
            );
            return;
          }

          hostedSyncIntervalRef.current = response.syncIntervalMs;
          applyHostedSyncPayload(response);
        })
        .catch(() => {
          finishHostedRequest(request.controller);
        });
    }, 120);
  }, [applyHostedSyncPayload, beginHostedRequest, finishHostedRequest]);

  const applyHostedResponse = useCallback(
    (
      nextState: StudioHostedWorkspaceState,
      params: { requestId: number; sessionId: number }
    ) => {
      if (hostedModeSessionRef.current !== params.sessionId) {
        return false;
      }

      if (nextState.revision < hostedRevisionRef.current) {
        return false;
      }

      if (
        nextState.revision === hostedRevisionRef.current &&
        params.requestId <= hostedLatestAppliedRequestRef.current
      ) {
        return false;
      }

      hostedLatestAppliedRequestRef.current = Math.max(
        hostedLatestAppliedRequestRef.current,
        params.requestId
      );
      applyHostedState(nextState);
      return true;
    },
    [applyHostedState]
  );

  const cleanupPreviewUrls = useCallback(() => {
    for (const previewUrl of previewUrlsRef.current.values()) {
      revokePreviewUrl(previewUrl);
    }
    previewUrlsRef.current.clear();
  }, []);

  const cleanupDraftReferences = useCallback(() => {
    for (const references of Object.values(draftReferencesRef.current)) {
      for (const reference of references) {
        releaseDraftReferencePreview(reference);
      }
    }

    for (const frameInputs of Object.values(draftFramesRef.current)) {
      if (frameInputs.startFrame) {
        releaseDraftReferencePreview(frameInputs.startFrame);
      }
      if (frameInputs.endFrame) {
        releaseDraftReferencePreview(frameInputs.endFrame);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      abortLocalRequests();
      abortHostedRequests();
      clearAllTimers();
      cleanupPreviewUrls();
      cleanupDraftReferences();
    };
  }, [
    abortLocalRequests,
    abortHostedRequests,
    cleanupDraftReferences,
    cleanupPreviewUrls,
    clearAllTimers,
  ]);

  useEffect(() => {
    if (appMode !== "hosted") {
      setHostedAuthStatus("signed_out");
      setHostedSessionUser(null);
      setHostedAuthDialogOpen(false);
      setHostedAuthPending(false);
      setHostedAuthErrorMessage(null);
      return;
    }

    let cancelled = false;
    setHostedAuthStatus("checking");

    const clearHostedAuthErrorFromUrl = () => {
      if (typeof window === "undefined") {
        return;
      }

      const url = new URL(window.location.href);
      if (!url.searchParams.has("hostedAuthError")) {
        return;
      }

      url.searchParams.delete("hostedAuthError");
      window.history.replaceState({}, "", url.toString());
    };

    void getHostedSessionState()
      .then((sessionState) => {
        if (cancelled) {
          return;
        }

        clearHostedAuthErrorFromUrl();
        setHostedSessionUser(sessionState.user);
        setHostedAuthStatus(
          sessionState.accessToken ? "signed_in" : "signed_out"
        );
        setHostedAuthDialogOpen(!sessionState.accessToken);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setHostedSessionUser(null);
        setHostedAuthStatus("signed_out");
        setHostedAuthDialogOpen(true);
        setHostedAuthErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not check your hosted session."
        );
      })
      .finally(() => {
        if (!cancelled) {
          setHostedAuthPending(false);
        }
      });

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("hostedAuthError") === "google-sign-in") {
        setHostedAuthErrorMessage(
          "Google sign-in could not be completed. Try again."
        );
      } else {
        setHostedAuthErrorMessage(null);
      }
    }

    const unsubscribe = subscribeToHostedAuthChanges((sessionState) => {
      if (cancelled) {
        return;
      }

      setHostedSessionUser(sessionState.user);
      setHostedAuthStatus(sessionState.accessToken ? "signed_in" : "signed_out");
      setHostedAuthDialogOpen(!sessionState.accessToken);
      setHostedAuthPending(false);
      if (sessionState.accessToken) {
        setHostedAuthErrorMessage(null);
      }

      if (!sessionState.accessToken) {
        closeSettingsDialog();
        zeroCreditsDialogOpenedRef.current = false;
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [appMode, closeSettingsDialog]);

  useEffect(() => {
    let cancelled = false;

    storageHydratedRef.current = false;
    localModeSessionRef.current += 1;
    localLatestStartedRequestRef.current = 0;
    localLatestAppliedRequestRef.current = 0;
    localRevisionRef.current = 0;
    abortLocalRequests();
    hostedModeSessionRef.current += 1;
    hostedLatestStartedRequestRef.current = 0;
    hostedLatestAppliedRequestRef.current = 0;
    hostedRevisionRef.current = 0;
    abortHostedRequests();
    clearAllTimers();
    cleanupPreviewUrls();
    cleanupDraftReferences();

    const resetUiState = () => {
      setProviderSettings(EMPTY_PROVIDER_SETTINGS);
      closeSettingsDialog();
      setSelectedFolderId(null);
      setSelectionModeEnabled(false);
      setSelectedItemIds([]);
      setFolderEditorOpen(false);
      setFolderEditorError(null);
      setFolderEditorTargetId(null);
      setFolderEditorValue("");
      setCreateTextDialogOpen(false);
      setCreateTextTitle("");
      setCreateTextBody("");
      setCreateTextErrorMessage(null);
      setSavePromptPending(false);
      setUploadDialogOpen(false);
      setUploadDialogFolderId(null);
      setQueueLimitDialogOpen(false);
      setPurchaseCreditsErrorMessage(null);
      setHostedSetupMessage(null);
      setDraftReferencesByModelId(createEmptyDraftReferenceMap());
      setDraftFramesByModelId(createEmptyDraftFrameMap());
    };

    resetUiState();

    if (appMode === "hosted") {
      if (hostedAuthStatus !== "signed_in") {
        applySnapshot(signedOutHostedSnapshot);
        storageHydratedRef.current = true;
        return () => {
          cancelled = true;
        };
      }

      const request = beginHostedRequest();

      void fetchHostedSync({
        sinceRevision: null,
        signal: request.controller.signal,
      })
        .then((response) => {
          finishHostedRequest(request.controller);

          if (cancelled) {
            return;
          }

          setHostedSetupMessage(null);
          if (response.kind === "noop") {
            applySnapshot(seedSnapshot);
            storageHydratedRef.current = true;
            return;
          }

          hostedSyncIntervalRef.current = response.syncIntervalMs;
          applyHostedSyncPayload(response);
          storageHydratedRef.current = true;
        })
        .catch((error) => {
          finishHostedRequest(request.controller);

          if (cancelled) {
            return;
          }

          setHostedSetupMessage(
            error instanceof Error
              ? error.message
              : "Hosted setup is incomplete."
          );
          applySnapshot(signedOutHostedSnapshot);
          storageHydratedRef.current = true;
        });

      return () => {
        cancelled = true;
      };
    }

    const nextProviderSettings =
      loadStoredProviderSettings() ?? EMPTY_PROVIDER_SETTINGS;
    setProviderSettings(nextProviderSettings);
    const request = beginLocalRequest();

    void syncLocalProviderSession(
      nextProviderSettings,
      request.controller.signal
    )
      .catch(() => undefined)
      .then(() =>
        fetchLocalBootstrap({
          signal: request.controller.signal,
        })
      )
      .then((response) => {
        finishLocalRequest(request.controller);

        if (cancelled) {
          return;
        }

        localSyncIntervalRef.current = response.syncIntervalMs;
        applyLocalResponse(response.snapshot, {
          requestId: request.requestId,
          revision: response.revision,
          sessionId: request.sessionId,
        });
        storageHydratedRef.current = true;
      })
      .catch(() => {
        finishLocalRequest(request.controller);

        if (cancelled) {
          return;
        }

        applySnapshot(seedSnapshot);
        storageHydratedRef.current = true;
      });

    return () => {
      cancelled = true;
    };
  }, [
    appMode,
    abortLocalRequests,
    applySnapshot,
    applyLocalResponse,
    closeSettingsDialog,
    cleanupDraftReferences,
    cleanupPreviewUrls,
    clearAllTimers,
    seedSnapshot,
    signedOutHostedSnapshot,
    abortHostedRequests,
    applyHostedResponse,
    applyHostedSyncPayload,
    hostedAuthStatus,
    beginLocalRequest,
    beginHostedRequest,
    finishLocalRequest,
    finishHostedRequest,
  ]);

  useEffect(() => {
    if (!storageHydratedRef.current || appMode !== "local") {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      const request = beginLocalRequest();

      void mutateLocalSnapshot(
        {
          action: "save_ui_state",
          draftsByModelId,
          selectedModelId: visibleSelectedModelId,
          gallerySizeLevel,
          lastValidatedAt: providerSettings.falLastValidatedAt,
        },
        request.controller.signal
      )
        .then((response) => {
          finishLocalRequest(request.controller);

          if (cancelled) {
            return;
          }

          applyLocalResponse(response.snapshot, {
            preserveDrafts: true,
            requestId: request.requestId,
            revision: response.revision,
            sessionId: request.sessionId,
          });
        })
        .catch((error) => {
          finishLocalRequest(request.controller);
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    appMode,
    draftsByModelId,
    gallerySizeLevel,
    providerSettings,
    visibleSelectedModelId,
    applyLocalResponse,
    beginLocalRequest,
    finishLocalRequest,
  ]);

  useEffect(() => {
    if (
      !storageHydratedRef.current ||
      appMode !== "hosted" ||
      !hostedUserSignedIn
    ) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      const request = beginHostedRequest();

      void mutateHostedSnapshot(
        {
          action: "save_ui_state",
          selectedModelId: visibleSelectedModelId,
          gallerySizeLevel,
        },
        request.controller.signal
      )
        .then((response) => {
          finishHostedRequest(request.controller);

          if (cancelled) {
            return;
          }

          applyHostedResponse(response.state, {
            requestId: request.requestId,
            sessionId: request.sessionId,
          });
        })
        .catch((error) => {
          finishHostedRequest(request.controller);
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    appMode,
    gallerySizeLevel,
    hostedUserSignedIn,
    visibleSelectedModelId,
    applyHostedResponse,
    beginHostedRequest,
    finishHostedRequest,
  ]);

  useEffect(() => {
    if (appMode !== "local" || !storageHydratedRef.current) {
      return;
    }

    saveStoredProviderSettings(providerSettings);
  }, [appMode, providerSettings]);

  useEffect(() => {
    if (
      appMode !== "hosted" ||
      !storageHydratedRef.current ||
      !hostedUserSignedIn ||
      typeof window === "undefined"
    ) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const connect = async () => {
      try {
        const accessToken = await getHostedAccessToken();
        if (!accessToken || cancelled) {
          return;
        }

        supabase.realtime.setAuth(accessToken);
        channel = supabase
          .channel(`studio:${profile.id}`, {
            config: {
              private: true,
            },
          })
          .on("broadcast", { event: "studio.sync" }, (payload) => {
            const nextRevision = Number(
              (payload as { payload?: { revision?: number } }).payload?.revision ?? 0
            );

            if (!Number.isFinite(nextRevision) || nextRevision <= hostedRevisionRef.current) {
              return;
            }

            scheduleHostedRealtimeRefresh();
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              scheduleHostedRealtimeRefresh();
            }
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              scheduleHostedRealtimeRefresh();
            }
          });
      } catch {
        scheduleHostedRealtimeRefresh();
      }
    };

    void connect();

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [appMode, hostedUserSignedIn, profile.id, scheduleHostedRealtimeRefresh]);

  useEffect(() => {
    if (
      appMode !== "local" ||
      !storageHydratedRef.current ||
      typeof window === "undefined"
    ) {
      return;
    }

    let cancelled = false;
    let eventSource: EventSource | null = null;

    void syncLocalProviderSession(providerSettings)
      .catch(() => undefined)
      .then(() => {
        if (cancelled) {
          return;
        }

        const eventsUrl = new URL("/api/studio/local/events", window.location.origin);
        if (localRevisionRef.current > 0) {
          eventsUrl.searchParams.set("sinceRevision", String(localRevisionRef.current));
        }

        eventSource = new EventSource(eventsUrl.toString());

        const handleSync = (event: MessageEvent<string>) => {
          try {
            const payload = JSON.parse(event.data) as LocalStudioSyncResponse;
            if (payload.kind === "noop") {
              localRevisionRef.current = Math.max(
                localRevisionRef.current,
                payload.revision
              );
              return;
            }

            if (payload.revision <= localRevisionRef.current) {
              return;
            }

            localRevisionRef.current = payload.revision;
            applySnapshot(payload.snapshot, {
              preserveDrafts: true,
            });
          } catch {
            // Ignore malformed realtime payloads and keep the stream alive.
          }
        };

        const handleError = () => {
          // EventSource reconnects automatically; keep the last applied state.
        };

        eventSource.addEventListener("studio-sync", handleSync as EventListener);
        eventSource.addEventListener("studio-error", handleError as EventListener);
        eventSource.onerror = handleError;
      });

    return () => {
      cancelled = true;
      eventSource?.close();
    };
  }, [appMode, applySnapshot, providerSettings]);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === visibleSelectedModelId) ?? models[0],
    [models, visibleSelectedModelId]
  );

  const currentDraft = useMemo(() => {
    const persistedDraft =
      draftsByModelId[selectedModel.id] ?? buildStudioDraftMap()[selectedModel.id];
    const references = draftReferencesByModelId[selectedModel.id] ?? [];
    const frameInputs =
      draftFramesByModelId[selectedModel.id] ??
      ({ startFrame: null, endFrame: null } satisfies DraftFrameInputs);

    return {
      ...hydrateDraft(persistedDraft, selectedModel),
      references,
      startFrame: frameInputs.startFrame,
      endFrame: frameInputs.endFrame,
    } satisfies StudioDraft;
  }, [draftFramesByModelId, draftReferencesByModelId, draftsByModelId, selectedModel]);

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );

  const ungroupedItems = useMemo(
    () => items.filter((item) => item.folderId === null),
    [items]
  );

  const itemBackedRunIds = useMemo(
    () =>
      new Set(
        items.flatMap((item) => {
          const runId = item.sourceRunId ?? item.runId;
          return runId ? [runId] : [];
        })
      ),
    [items]
  );

  const selectedFolderItems = useMemo(() => {
    if (!selectedFolderId) {
      return [];
    }

    return items.filter((item) => item.folderId === selectedFolderId);
  }, [items, selectedFolderId]);

  const ungroupedRunCards = useMemo(
    () =>
      runs.filter(
        (run) =>
          run.folderId === null &&
          run.outputAssetId === null &&
          !itemBackedRunIds.has(run.id) &&
          (isInFlightStudioRunStatus(run.status) ||
            run.status === "failed" ||
            run.status === "cancelled")
      ),
    [itemBackedRunIds, runs]
  );

  const selectedFolderRunCards = useMemo(() => {
    if (!selectedFolderId) {
      return [];
    }

    return runs.filter(
      (run) =>
        run.folderId === selectedFolderId &&
        run.outputAssetId === null &&
        !itemBackedRunIds.has(run.id) &&
        (isInFlightStudioRunStatus(run.status) ||
          run.status === "failed" ||
          run.status === "cancelled")
    );
  }, [itemBackedRunIds, runs, selectedFolderId]);

  const folderCounts = useMemo(
    () => createFolderItemCounts(folders, items, runs),
    [folders, items, runs]
  );

  const selectedItemIdSet = useMemo(
    () => new Set(selectedItemIds),
    [selectedItemIds]
  );

  const selectedItemCount = selectedItemIds.length;
  const hasFalKey = Boolean(
    providerSettings.falApiKey.trim() ||
      providerSettings.openaiApiKey.trim() ||
      providerSettings.anthropicApiKey.trim() ||
      providerSettings.geminiApiKey.trim()
  );
  const maxReferenceFiles = selectedModel.maxReferenceFiles ?? 6;

  const applyLocalMutation = useCallback(
    async (
      mutation: LocalStudioMutation,
      options?: { preserveDrafts?: boolean }
    ) => {
      const request = beginLocalRequest();

      try {
        const response = await mutateLocalSnapshot(mutation, request.controller.signal);
        applyLocalResponse(response.snapshot, {
          preserveDrafts: options?.preserveDrafts ?? true,
          requestId: request.requestId,
          revision: response.revision,
          sessionId: request.sessionId,
        });
        return response.snapshot;
      } finally {
        finishLocalRequest(request.controller);
      }
    },
    [
      applyLocalResponse,
      beginLocalRequest,
      finishLocalRequest,
    ]
  );

  const applyLocalUpload = useCallback(
    async (files: File[], folderId: string | null) => {
      const request = beginLocalRequest();

      try {
        const response = await uploadLocalFiles(files, folderId, request.controller.signal);
        applyLocalResponse(response.snapshot, {
          preserveDrafts: true,
          requestId: request.requestId,
          revision: response.revision,
          sessionId: request.sessionId,
        });
        return response.snapshot;
      } finally {
        finishLocalRequest(request.controller);
      }
    },
    [
      applyLocalResponse,
      beginLocalRequest,
      finishLocalRequest,
    ]
  );

  const refreshLocalState = useCallback(() => {
    const request = beginLocalRequest();

    void fetchLocalSync({
      sinceRevision: null,
      signal: request.controller.signal,
    })
      .then((response) => {
        finishLocalRequest(request.controller);
        if (response.kind === "noop") {
          return;
        }

        localSyncIntervalRef.current = response.syncIntervalMs;
        applyLocalResponse(response.snapshot, {
          preserveDrafts: true,
          requestId: request.requestId,
          revision: response.revision,
          sessionId: request.sessionId,
        });
      })
      .catch(() => {
        finishLocalRequest(request.controller);
      });
  }, [
    applyLocalResponse,
    beginLocalRequest,
    finishLocalRequest,
  ]);

  const applyHostedMutation = useCallback(
    async (mutation: HostedStudioMutation) => {
      const request = beginHostedRequest();

      try {
        const response = await mutateHostedSnapshot(
          mutation,
          request.controller.signal
        );
        applyHostedResponse(response.state, {
          requestId: request.requestId,
          sessionId: request.sessionId,
        });
        return response.state;
      } finally {
        finishHostedRequest(request.controller);
      }
    },
    [applyHostedResponse, beginHostedRequest, finishHostedRequest]
  );

  const applyHostedUpload = useCallback(
    async (files: File[], folderId: string | null) => {
      const request = beginHostedRequest();

      try {
        const response = await uploadHostedFiles(
          files,
          folderId,
          request.controller.signal
        );
        applyHostedResponse(response.state, {
          requestId: request.requestId,
          sessionId: request.sessionId,
        });
        return response.state;
      } finally {
        finishHostedRequest(request.controller);
      }
    },
    [applyHostedResponse, beginHostedRequest, finishHostedRequest]
  );

  const refreshHostedState = useCallback((sinceRevision: number | null = null) => {
    const request = beginHostedRequest();

    void fetchHostedSync({
      sinceRevision,
      signal: request.controller.signal,
    })
      .then((response) => {
        finishHostedRequest(request.controller);
        if (response.kind === "noop") {
          hostedRevisionRef.current = Math.max(
            hostedRevisionRef.current,
            response.revision
          );
          return;
        }

        hostedSyncIntervalRef.current = response.syncIntervalMs;
        applyHostedSyncPayload(response);
      })
      .catch(() => {
        finishHostedRequest(request.controller);
      });
  }, [applyHostedSyncPayload, beginHostedRequest, finishHostedRequest]);

  const surfaceGenerationError = useCallback((message: string) => {
    setGenerationErrorMessage(message);
    setGenerationErrorDialogOpen(true);
  }, []);

  const hostedAccount = useMemo(() => {
    if (appMode !== "hosted" || !creditBalance) {
      return null;
    }

    return {
      profile,
      creditBalance,
      activeCreditPack,
      queuedCount: runs.filter((run) => run.status === "queued").length,
      generatingCount: runs.filter((run) => run.status === "processing").length,
      completedCount: runs.filter((run) => run.status === "completed").length,
      pricingSummary: "Fal market rate + 15%",
      environmentLabel: hostedSetupMessage ?? "Hosted preview",
    } satisfies StudioHostedAccount;
  }, [activeCreditPack, appMode, creditBalance, hostedSetupMessage, profile, runs]);

  useEffect(() => {
    if (
      appMode !== "hosted" ||
      !hostedUserSignedIn ||
      !creditBalance
    ) {
      zeroCreditsDialogOpenedRef.current = false;
      return;
    }

    if (creditBalance.balanceCredits <= 0) {
      if (!zeroCreditsDialogOpenedRef.current) {
        openSettingsDialog();
        zeroCreditsDialogOpenedRef.current = true;
      }
      return;
    }

    zeroCreditsDialogOpenedRef.current = false;
  }, [appMode, creditBalance, hostedUserSignedIn, openSettingsDialog]);

  useEffect(() => {
    if (settingsDialogOpen) {
      return;
    }

    setAccountActionErrorMessage(null);
    setModelConfigurationErrorMessage(null);
  }, [settingsDialogOpen]);

  useEffect(() => {
    if (appMode !== "hosted" || !hostedUserSignedIn || typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const checkoutSessionId = url.searchParams.get("session_id")?.trim() ?? "";
    const checkoutState = url.searchParams.get("checkout")?.trim() ?? "";

    if (!checkoutSessionId) {
      if (checkoutState === "cancelled") {
        url.searchParams.delete("checkout");
        window.history.replaceState({}, "", url.toString());
      }
      return;
    }

    if (completedCheckoutSessionIdsRef.current.has(checkoutSessionId)) {
      return;
    }

    completedCheckoutSessionIdsRef.current.add(checkoutSessionId);
    const controller = new AbortController();
    setPurchaseCreditsPending(true);
    setPurchaseCreditsErrorMessage(null);

    void completeHostedCheckoutSessionRequest({
      checkoutSessionId,
      signal: controller.signal,
    })
      .then((payload) => {
        if (payload.status === "completed") {
          openSettingsDialog();
        }

        refreshHostedState();
      })
      .catch((error) => {
        completedCheckoutSessionIdsRef.current.delete(checkoutSessionId);
        setPurchaseCreditsErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not finalize your Stripe checkout."
        );
      })
      .finally(() => {
        setPurchaseCreditsPending(false);
        url.searchParams.delete("checkout");
        url.searchParams.delete("session_id");
        window.history.replaceState({}, "", url.toString());
      });

    return () => {
      controller.abort();
    };
  }, [appMode, hostedUserSignedIn, openSettingsDialog, refreshHostedState]);

  const hostedSessionAvatarLabel =
    String(
      hostedSessionUser?.user_metadata.full_name ??
        hostedSessionUser?.user_metadata.name ??
        hostedSessionUser?.email ??
        ""
    )
      .trim()
      .slice(0, 1)
      .toUpperCase() || "U";

  const accountButtonLabel =
    appMode === "hosted"
      ? hostedUserSignedIn
        ? profile.avatarLabel || hostedSessionAvatarLabel
        : "G"
      : "T";

  const updateModelConfiguration = useCallback(
    async (enabledModelIds: string[]) => {
      if (modelConfigurationPending) {
        return;
      }

      const nextEnabledModelIds = normalizeStudioEnabledModelIds(enabledModelIds);
      const updatedAt = new Date().toISOString();
      const previousConfiguration = {
        enabledModelIds: [...modelConfiguration.enabledModelIds],
        updatedAt: modelConfiguration.updatedAt,
      } satisfies StudioModelConfiguration;

      setModelConfigurationErrorMessage(null);
      setModelConfigurationPending(true);

      if (appMode === "hosted") {
        setModelConfiguration({
          enabledModelIds: nextEnabledModelIds,
          updatedAt,
        });
        try {
          await applyHostedMutation({
            action: "set_enabled_models",
            enabledModelIds: nextEnabledModelIds,
          });
          return;
        } catch (error) {
          if (!isAbortRequestError(error)) {
            setModelConfiguration(previousConfiguration);
            setModelConfigurationErrorMessage(
              error instanceof Error
                ? error.message
                : "Could not update model configuration."
            );
            refreshHostedState();
          }
          return;
        } finally {
          setModelConfigurationPending(false);
        }
      }

      setModelConfiguration({
        enabledModelIds: nextEnabledModelIds,
        updatedAt,
      });
      try {
        await applyLocalMutation({
          action: "set_enabled_models",
          enabledModelIds: nextEnabledModelIds,
        });
      } catch (error) {
        if (!isAbortRequestError(error)) {
          setModelConfiguration(previousConfiguration);
          setModelConfigurationErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not update model configuration."
          );
          refreshLocalState();
        }
      } finally {
        setModelConfigurationPending(false);
      }
    },
    [
      appMode,
      applyLocalMutation,
      applyHostedMutation,
      modelConfiguration,
      modelConfigurationPending,
      refreshLocalState,
      refreshHostedState,
    ]
  );

  const toggleModelEnabled = useCallback(
    (modelId: string) => {
      if (modelConfigurationPending) {
        return;
      }

      updateModelConfiguration(
        toggleStudioModelEnabled({
          enabledModelIds: normalizedEnabledModelIds,
          modelId,
        })
      );
    },
    [modelConfigurationPending, normalizedEnabledModelIds, updateModelConfiguration]
  );

  const clearSelection = useCallback(() => {
    setSelectedItemIds([]);
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionModeEnabled((current) => {
      if (current) {
        setSelectedItemIds([]);
      }

      return !current;
    });
  }, []);

  const toggleItemSelection = useCallback((itemId: string) => {
    setSelectedItemIds((current) =>
      current.includes(itemId)
        ? current.filter((entry) => entry !== itemId)
        : [...current, itemId]
    );
  }, []);

  const updatePersistedDraft = useCallback(
    (patch: Partial<PersistedStudioDraft>) => {
      setDraftsByModelId((current) => ({
        ...current,
        [selectedModel.id]: {
          ...(current[selectedModel.id] ?? toPersistedDraft(createDraft(selectedModel))),
          ...patch,
        },
      }));
    },
    [selectedModel]
  );

  const updateDraft = useCallback(
    (patch: Partial<StudioDraft>) => {
      const nextPatch = { ...patch };
      delete nextPatch.references;
      updatePersistedDraft(nextPatch);
    },
    [updatePersistedDraft]
  );

  const replaceDraftReferences = useCallback(
    (
      nextReferencesOrUpdater:
        | DraftReference[]
        | ((currentReferences: DraftReference[]) => DraftReference[])
    ) => {
      setDraftReferencesByModelId((current) => {
        const existingReferences = current[selectedModel.id] ?? [];
        const nextReferences =
          typeof nextReferencesOrUpdater === "function"
            ? nextReferencesOrUpdater(existingReferences)
            : nextReferencesOrUpdater;

        releaseRemovedDraftReferencePreviews(existingReferences, nextReferences);

        return {
          ...current,
          [selectedModel.id]: nextReferences,
        };
      });
    },
    [selectedModel.id]
  );

  const replaceDraftFrameInputs = useCallback(
    (
      nextFramesOrUpdater:
        | DraftFrameInputs
        | ((currentFrames: DraftFrameInputs) => DraftFrameInputs)
    ) => {
      setDraftFramesByModelId((current) => {
        const existingFrames =
          current[selectedModel.id] ??
          ({ startFrame: null, endFrame: null } satisfies DraftFrameInputs);
        const nextFrames =
          typeof nextFramesOrUpdater === "function"
            ? nextFramesOrUpdater(existingFrames)
            : nextFramesOrUpdater;

        if (
          existingFrames.startFrame &&
          existingFrames.startFrame.id !== nextFrames.startFrame?.id
        ) {
          releaseDraftReferencePreview(existingFrames.startFrame);
        }

        if (
          existingFrames.endFrame &&
          existingFrames.endFrame.id !== nextFrames.endFrame?.id
        ) {
          releaseDraftReferencePreview(existingFrames.endFrame);
        }

        return {
          ...current,
          [selectedModel.id]: nextFrames,
        };
      });
    },
    [selectedModel.id]
  );

  const clearDraftFrameInputs = useCallback(() => {
    replaceDraftFrameInputs({
      startFrame: null,
      endFrame: null,
    });
  }, [replaceDraftFrameInputs]);

  const setVideoInputMode = useCallback(
    (mode: StudioVideoInputMode) => {
      updatePersistedDraft({ videoInputMode: mode });
      replaceDraftReferences([]);
      clearDraftFrameInputs();
    },
    [clearDraftFrameInputs, replaceDraftReferences, updatePersistedDraft]
  );

  const setFrameInput = useCallback(
    (slot: "start" | "end", file: File) => {
      const nextReference = createDraftReferenceFromFile(file);

      updatePersistedDraft({ videoInputMode: "frames" });
      replaceDraftReferences([]);
      replaceDraftFrameInputs((currentFrames) => ({
        startFrame:
          slot === "start" ? nextReference : currentFrames.startFrame,
        endFrame: slot === "end" ? nextReference : currentFrames.endFrame,
      }));
    },
    [replaceDraftFrameInputs, replaceDraftReferences, updatePersistedDraft]
  );

  const clearFrameInput = useCallback(
    (slot: "start" | "end") => {
      replaceDraftFrameInputs((currentFrames) => ({
        startFrame: slot === "start" ? null : currentFrames.startFrame,
        endFrame: slot === "end" ? null : currentFrames.endFrame,
      }));
    },
    [replaceDraftFrameInputs]
  );

  const addDraftReferences = useCallback(
    (nextReferences: DraftReference[]) => {
      const mergedReferences = mergeDraftReferences(
        currentDraft.references,
        nextReferences,
        maxReferenceFiles
      );

      const keptReferenceIds = new Set(
        mergedReferences.map((reference) => reference.id)
      );
      for (const reference of nextReferences) {
        if (!keptReferenceIds.has(reference.id)) {
          releaseDraftReferencePreview(reference);
        }
      }

      replaceDraftReferences(mergedReferences);

      return {
        addedCount: Math.max(0, mergedReferences.length - currentDraft.references.length),
        maxReached: mergedReferences.length >= maxReferenceFiles,
      };
    },
    [currentDraft.references, maxReferenceFiles, replaceDraftReferences]
  );

  const addReferences = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      if (selectedModel.kind === "video" && selectedModel.supportsFrameInputs) {
        updatePersistedDraft({ videoInputMode: "references" });
        clearDraftFrameInputs();
      }
      addDraftReferences(files.map(createDraftReferenceFromFile));
    },
    [addDraftReferences, clearDraftFrameInputs, selectedModel.kind, selectedModel.supportsFrameInputs, updatePersistedDraft]
  );

  const removeReference = useCallback(
    (referenceId: string) => {
      replaceDraftReferences((currentReferences) =>
        currentReferences.filter((reference) => reference.id !== referenceId)
      );
    },
    [replaceDraftReferences]
  );

  const getItemsById = useCallback(
    (itemIds: string[]) => {
      const uniqueIds = Array.from(new Set(itemIds));
      const itemMap = new Map(items.map((item) => [item.id, item]));
      return uniqueIds
        .map((itemId) => itemMap.get(itemId))
        .filter((item): item is LibraryItem => Boolean(item));
    },
    [items]
  );

  const isSupportedReferenceItemForSelectedModel = useCallback(
    (item: LibraryItem) => {
      if (!isReferenceEligibleLibraryItem(item)) {
        return false;
      }

      const acceptedKinds = selectedModel.acceptedReferenceKinds ?? ["image", "video"];
      return acceptedKinds.includes(item.kind as "image" | "video" | "audio" | "document");
    },
    [selectedModel.acceptedReferenceKinds]
  );

  const setFrameFromLibraryItems = useCallback(
    async (itemIds: string[], slot: "start" | "end") => {
      const droppedItems = getItemsById(itemIds);
      const imageItem = droppedItems.find((item) => item.kind === "image");

      if (!imageItem) {
        return `Only image assets can be used as a ${slot} frame.`;
      }

      const file = await resolveLibraryItemToReferenceFile(imageItem);
      if (!file) {
        return `Could not load that asset as a ${slot} frame.`;
      }

      setFrameInput(slot, file);
      return null;
    },
    [getItemsById, setFrameInput]
  );

  const getPromptBarDropHint = useCallback(
    (itemIds: string[]) => {
      const droppedItems = getItemsById(itemIds);
      if (droppedItems.length === 0) {
        return "Drop into prompt bar";
      }

      const hasTextItems = droppedItems.some((item) => item.kind === "text");
      const hasReferenceItems = droppedItems.some(
        isSupportedReferenceItemForSelectedModel
      );

      if (hasTextItems && hasReferenceItems) {
        if (
          selectedModel.kind === "video" &&
          selectedModel.supportsFrameInputs &&
          currentDraft.videoInputMode === "frames"
        ) {
          return "Drop text here, and drop images onto Start or End frame";
        }

        return selectedModel.supportsReferences
          ? "Drop to add references and prompt text"
          : "Drop to merge text into the prompt";
      }

      if (hasTextItems) {
        return droppedItems.length > 1
          ? "Drop to merge into the prompt"
          : "Drop to merge into the prompt";
      }

      if (hasReferenceItems) {
        if (
          selectedModel.kind === "video" &&
          selectedModel.supportsFrameInputs &&
          currentDraft.videoInputMode === "frames"
        ) {
          return "Drop image assets onto Start or End frame";
        }

        return selectedModel.supportsReferences
          ? droppedItems.length > 1
            ? "Drop to add as references"
            : "Drop to add as reference"
          : "This model doesn't support references yet";
      }

      return "Drop into prompt bar";
    },
    [
      currentDraft.videoInputMode,
      getItemsById,
      isSupportedReferenceItemForSelectedModel,
      selectedModel.kind,
      selectedModel.supportsFrameInputs,
      selectedModel.supportsReferences,
    ]
  );

  const dropLibraryItemsIntoPromptBar = useCallback(
    async (itemIds: string[]) => {
      const droppedItems = getItemsById(itemIds);
      if (droppedItems.length === 0) {
        return "That asset is no longer available.";
      }

      const textItems = droppedItems.filter((item) => item.kind === "text");
      const referenceItems = droppedItems.filter(
        isSupportedReferenceItemForSelectedModel
      );
      const messages: string[] = [];

      if (textItems.length > 0) {
        updateDraft({
          prompt: appendLibraryItemsToPrompt(currentDraft.prompt, textItems),
        });
      }

      if (referenceItems.length > 0) {
        const wantsFrameInputs =
          selectedModel.kind === "video" &&
          selectedModel.supportsFrameInputs &&
          currentDraft.videoInputMode === "frames";

        if (wantsFrameInputs) {
          messages.push("Drop image assets onto Start or End frame.");
        } else if (!selectedModel.supportsReferences) {
          messages.push("This model doesn't support references yet.");
        } else {
          const resolvedReferenceEntries = await Promise.all(
            referenceItems.map(async (item) => {
              const file = await resolveLibraryItemToReferenceFile(item);
              if (!file) return null;

              return createDraftReferenceFromLibraryItem({
                file,
                item,
              });
            })
          );

          const validReferences = resolvedReferenceEntries.filter(
            (reference): reference is NonNullable<(typeof resolvedReferenceEntries)[number]> =>
              Boolean(reference)
          );

          if (validReferences.length === 0) {
            messages.push("Could not load the dropped asset as a reference.");
          } else {
            const { addedCount, maxReached } = addDraftReferences(validReferences);
            if (addedCount === 0) {
              messages.push(
                `Those references are already attached or the ${maxReferenceFiles}-reference limit is full.`
              );
            } else if (addedCount < validReferences.length || maxReached) {
              messages.push(
                `Some references were skipped because they were duplicates or the limit is ${maxReferenceFiles}.`
              );
            }
          }
        }
      }

      if (textItems.length === 0 && referenceItems.length === 0) {
        return "Only text, image, video, and audio assets can be dropped here.";
      }

      return messages[0] ?? null;
    },
    [
      addDraftReferences,
      currentDraft.prompt,
      getItemsById,
      isSupportedReferenceItemForSelectedModel,
      maxReferenceFiles,
      currentDraft.videoInputMode,
      selectedModel.supportsReferences,
      selectedModel.kind,
      selectedModel.supportsFrameInputs,
      updateDraft,
    ]
  );

  const moveItemsToFolder = useCallback((itemIds: string[], folderId: string | null) => {
    if (itemIds.length === 0) {
      return;
    }

    if (appMode === "hosted") {
      void applyHostedMutation({
        action: "move_items",
        itemIds,
        folderId,
      });
      return;
    }

    void applyLocalMutation({
      action: "move_items",
      itemIds,
      folderId,
    }).catch(refreshLocalState);
  }, [appMode, applyHostedMutation, applyLocalMutation, refreshLocalState]);

  const deleteItems = useCallback((itemIds: string[]) => {
    if (itemIds.length === 0) return;

    if (appMode === "hosted") {
      void applyHostedMutation({
        action: "delete_items",
        itemIds,
      });
      setSelectedItemIds((current) =>
        current.filter((itemId) => !itemIds.includes(itemId))
      );
      return;
    }

    setSelectedItemIds((current) =>
      current.filter((itemId) => !itemIds.includes(itemId))
    );
    void applyLocalMutation({
      action: "delete_items",
      itemIds,
    }).catch(refreshLocalState);
  }, [appMode, applyHostedMutation, applyLocalMutation, refreshLocalState]);

  const deleteItem = useCallback(
    (itemId: string) => {
      deleteItems([itemId]);
    },
    [deleteItems]
  );

  const deleteRun = useCallback(
    (runId: string) => {
      const targetRun = runsRef.current.find((run) => run.id === runId);
      if (!targetRun) {
        return;
      }

      if (targetRun.outputAssetId) {
        setSelectedItemIds((current) =>
          current.filter((itemId) => itemId !== targetRun.outputAssetId)
        );
      }

      if (appMode === "hosted") {
        void applyHostedMutation({
          action: "delete_runs",
          runIds: [runId],
        });
        return;
      }

      void applyLocalMutation({
        action: "delete_runs",
        runIds: [runId],
      }).catch(refreshLocalState);
    },
    [appMode, applyHostedMutation, applyLocalMutation, refreshLocalState]
  );

  const deleteSelectedItems = useCallback(() => {
    deleteItems(selectedItemIds);
  }, [deleteItems, selectedItemIds]);

  const resetFolderEditor = useCallback(() => {
    setFolderEditorOpen(false);
    setFolderEditorValue("");
    setFolderEditorTargetId(null);
    setFolderEditorError(null);
  }, []);

  const closeFolderEditor = useCallback(() => {
    if (folderEditorSaving) {
      return;
    }

    resetFolderEditor();
  }, [folderEditorSaving, resetFolderEditor]);

  const updateFolderEditorValue = useCallback((value: string) => {
    setFolderEditorValue(value);
    setFolderEditorError(null);
  }, []);

  const openCreateFolder = useCallback(() => {
    setFolderEditorMode("create");
    setFolderEditorTargetId(null);
    setFolderEditorValue("");
    setFolderEditorError(null);
    setFolderEditorOpen(true);
  }, []);

  const openRenameFolder = useCallback(
    (folderId: string) => {
      const folder = folders.find((entry) => entry.id === folderId);
      if (!folder) return;

      setFolderEditorMode("rename");
      setFolderEditorTargetId(folder.id);
      setFolderEditorValue(folder.name);
      setFolderEditorError(null);
      setFolderEditorOpen(true);
    },
    [folders]
  );

  const saveFolder = useCallback(async () => {
    if (folderEditorSaving) {
      return;
    }

    setFolderEditorSaving(true);

    try {
      const nextName = folderEditorValue.trim();
      if (!nextName) {
        setFolderEditorError("Folder name is required.");
        return;
      }

      if (hasFolderNameConflict(folders, nextName, folderEditorTargetId)) {
        setFolderEditorError("A folder with that name already exists.");
        return;
      }

      if (appMode === "hosted") {
        if (folderEditorMode === "create") {
          await applyHostedMutation({
            action: "create_folder",
            name: nextName,
          });
        } else if (folderEditorTargetId) {
          await applyHostedMutation({
            action: "rename_folder",
            folderId: folderEditorTargetId,
            name: nextName,
          });
        }

        resetFolderEditor();
        return;
      }

      if (folderEditorMode === "create") {
        const nextSnapshot = await applyLocalMutation({
          action: "create_folder",
          name: nextName,
        });
        setSelectedFolderId(nextSnapshot.folders[0]?.id ?? null);
        resetFolderEditor();
        return;
      }

      if (!folderEditorTargetId) {
        return;
      }

      await applyLocalMutation({
        action: "rename_folder",
        folderId: folderEditorTargetId,
        name: nextName,
      });
      resetFolderEditor();
    } catch (error) {
      setFolderEditorError(
        error instanceof Error ? error.message : "Could not save folder."
      );
    } finally {
      setFolderEditorSaving(false);
    }
  }, [
    appMode,
    applyLocalMutation,
    folderEditorMode,
    folderEditorSaving,
    folderEditorTargetId,
    folderEditorValue,
    folders,
    applyHostedMutation,
    resetFolderEditor,
  ]);

  const deleteFolder = useCallback((folderId: string) => {
    if (appMode === "hosted") {
      void applyHostedMutation({
        action: "delete_folder",
        folderId,
      });
      setSelectedFolderId((current) => (current === folderId ? null : current));
      return;
    }

    setSelectedFolderId((current) => (current === folderId ? null : current));
    void applyLocalMutation({
      action: "delete_folder",
      folderId,
    }).catch(refreshLocalState);
  }, [appMode, applyHostedMutation, applyLocalMutation, refreshLocalState]);

  const reorderFolders = useCallback(
    (orderedFolderIds: string[]) => {
      if (orderedFolderIds.length === 0) {
        return;
      }

      const updatedAt = new Date().toISOString();
      setFolders((current) =>
        reorderStudioFoldersByIds(current, orderedFolderIds, updatedAt)
      );

      if (appMode === "hosted") {
        void applyHostedMutation({
          action: "reorder_folders",
          orderedFolderIds,
        }).catch(refreshHostedState);
        return;
      }

      void applyLocalMutation({
        action: "reorder_folders",
        orderedFolderIds,
      }).catch(refreshLocalState);
    },
    [
      appMode,
      applyLocalMutation,
      applyHostedMutation,
      refreshLocalState,
      refreshHostedState,
    ]
  );

  const reuseRun = useCallback(
    (runId: string) => {
      const run = runs.find((entry) => entry.id === runId);
      if (!run) return;

      const nextModel = getStudioModelById(run.modelId);
      const nextVisibleModelId = getVisibleModelId(nextModel.id);
      const nextVisibleModel = getStudioModelById(nextVisibleModelId);
      const {
        referenceCount,
        startFrameCount,
        endFrameCount,
        ...persistedRunDraft
      } = run.draftSnapshot;
      void referenceCount;
      void startFrameCount;
      void endFrameCount;
      const nextDraft = {
        ...(buildStudioDraftMap()[nextVisibleModel.id] ??
          toPersistedDraft(createDraft(nextVisibleModel))),
        ...persistedRunDraft,
      };

      if (nextVisibleModel.id !== nextModel.id) {
        nextDraft.outputFormat = nextVisibleModel.defaultDraft.outputFormat;
        nextDraft.voice = nextVisibleModel.defaultDraft.voice;
        nextDraft.language = nextVisibleModel.defaultDraft.language;
        nextDraft.speakingRate = nextVisibleModel.defaultDraft.speakingRate;
      }

      setSelectedModelIdState(nextVisibleModel.id);
      setDraftsByModelId((current) => ({
        ...current,
        [nextVisibleModel.id]: nextDraft,
      }));
      setDraftReferencesByModelId((current) => {
        releaseRemovedDraftReferencePreviews(current[nextVisibleModel.id] ?? [], []);
        return {
          ...current,
          [nextVisibleModel.id]: [],
        };
      });
      setDraftFramesByModelId((current) => {
        const existingFrames =
          current[nextVisibleModel.id] ??
          ({ startFrame: null, endFrame: null } satisfies DraftFrameInputs);
        if (existingFrames.startFrame) {
          releaseDraftReferencePreview(existingFrames.startFrame);
        }
        if (existingFrames.endFrame) {
          releaseDraftReferencePreview(existingFrames.endFrame);
        }
        return {
          ...current,
          [nextVisibleModel.id]: {
            startFrame: null,
            endFrame: null,
          },
        };
      });
    },
    [getVisibleModelId, runs]
  );

  const reuseItem = useCallback(
    (itemId: string) => {
      const item = items.find((entry) => entry.id === itemId);
      if (!item) return;

      if (isTextNoteLibraryItem(item)) {
        const promptText = getTextNotePromptBarValue(item);
        if (!promptText) {
          return;
        }

        const targetModelId = resolvePromptBarReuseModelId({
          currentModelId: visibleSelectedModelId,
          models,
        });

        setSelectedModelIdState(targetModelId);
        setDraftsByModelId((current) => ({
          ...current,
          [targetModelId]: {
            ...(current[targetModelId] ??
              toPersistedDraft(createDraft(getStudioModelById(targetModelId)))),
            prompt: promptText,
          },
        }));
        return;
      }

      const matchingRunId = findReusableRunIdForLibraryItem(item, runs);
      if (matchingRunId) {
        reuseRun(matchingRunId);
        return;
      }

      if (!item.modelId) return;

      const nextModel = getStudioModelById(item.modelId);
      const nextVisibleModelId = getVisibleModelId(nextModel.id);
      setSelectedModelIdState(nextVisibleModelId);
      setDraftsByModelId((current) => ({
        ...current,
        [nextVisibleModelId]: {
          ...(current[nextVisibleModelId] ??
            toPersistedDraft(createDraft(getStudioModelById(nextVisibleModelId)))),
          prompt: item.prompt,
        },
      }));
      setDraftReferencesByModelId((current) => {
        releaseRemovedDraftReferencePreviews(current[nextVisibleModelId] ?? [], []);
        return {
          ...current,
          [nextVisibleModelId]: [],
        };
      });
      setDraftFramesByModelId((current) => {
        const existingFrames =
          current[nextVisibleModelId] ??
          ({ startFrame: null, endFrame: null } satisfies DraftFrameInputs);
        if (existingFrames.startFrame) {
          releaseDraftReferencePreview(existingFrames.startFrame);
        }
        if (existingFrames.endFrame) {
          releaseDraftReferencePreview(existingFrames.endFrame);
        }
        return {
          ...current,
          [nextVisibleModelId]: {
            startFrame: null,
            endFrame: null,
          },
        };
      });
    },
    [getVisibleModelId, items, models, reuseRun, runs, visibleSelectedModelId]
  );

  const updateTextItem = useCallback(
    (itemId: string, patch: { title?: string; contentText?: string }) => {
      if (appMode === "hosted") {
        void applyHostedMutation({
          action: "update_text_item",
          itemId,
          title: patch.title,
          contentText: patch.contentText,
        });
        return;
      }

      void applyLocalMutation({
        action: "update_text_item",
        itemId,
        title: patch.title,
        contentText: patch.contentText,
      }).catch(refreshLocalState);
    },
    [appMode, applyHostedMutation, applyLocalMutation, refreshLocalState]
  );

  const openCreateTextComposer = useCallback(() => {
    setCreateTextTitle("");
    setCreateTextBody("");
    setCreateTextErrorMessage(null);
    setCreateTextDialogOpen(true);
  }, []);

  const closeCreateTextComposer = useCallback(() => {
    if (createTextSaving) {
      return;
    }

    setCreateTextDialogOpen(false);
    setCreateTextTitle("");
    setCreateTextBody("");
    setCreateTextErrorMessage(null);
  }, [createTextSaving]);

  const updateCreateTextTitle = useCallback((value: string) => {
    setCreateTextTitle(value);
    setCreateTextErrorMessage(null);
  }, []);

  const updateCreateTextBody = useCallback((value: string) => {
    setCreateTextBody(value);
    setCreateTextErrorMessage(null);
  }, []);

  const createTextAsset = useCallback(async () => {
    if (createTextSaving) {
      return;
    }

    const nextBody = createTextBody.trim();
    if (!nextBody) {
      setCreateTextErrorMessage("Prompt body is required.");
      return;
    }

    setCreateTextSaving(true);
    setCreateTextErrorMessage(null);

    try {
      if (appMode === "hosted") {
        await applyHostedMutation({
          action: "create_text_item",
          title: createTextTitle,
          body: createTextBody,
          folderId: selectedFolderId,
        });
        setCreateTextSaving(false);
        setCreateTextDialogOpen(false);
        setCreateTextTitle("");
        setCreateTextBody("");
        setCreateTextErrorMessage(null);
        return;
      }

      await applyLocalMutation({
        action: "create_text_item",
        title: createTextTitle,
        body: createTextBody,
        folderId: selectedFolderId,
      });
      setCreateTextSaving(false);
      setCreateTextDialogOpen(false);
      setCreateTextTitle("");
      setCreateTextBody("");
      setCreateTextErrorMessage(null);
    } catch (error) {
      setCreateTextErrorMessage(
        error instanceof Error ? error.message : "Failed to create prompt file."
      );
      setCreateTextSaving(false);
    }
  }, [
    appMode,
    applyLocalMutation,
    applyHostedMutation,
    createTextBody,
    createTextSaving,
    createTextTitle,
    selectedFolderId,
  ]);

  const saveCurrentPromptAsTextItem = useCallback(async () => {
    if (savePromptPending) {
      return;
    }

    const nextBody = currentDraft.prompt.trim();
    if (!nextBody) {
      return;
    }

    if (appMode === "hosted" && !hostedUserSignedIn) {
      setHostedAuthDialogOpen(true);
      return;
    }

    setSavePromptPending(true);

    try {
      if (appMode === "hosted") {
        await applyHostedMutation({
          action: "create_text_item",
          title: "",
          body: currentDraft.prompt,
          folderId: selectedFolderId,
        });
        return;
      }

      await applyLocalMutation({
        action: "create_text_item",
        title: "",
        body: currentDraft.prompt,
        folderId: selectedFolderId,
      });
    } catch (error) {
      if (isAbortRequestError(error)) {
        return;
      }

      surfaceGenerationError(
        error instanceof Error ? error.message : "Failed to save prompt file."
      );

      if (appMode !== "hosted") {
        refreshLocalState();
      }
    } finally {
      setSavePromptPending(false);
    }
  }, [
    appMode,
    applyHostedMutation,
    applyLocalMutation,
    currentDraft.prompt,
    hostedUserSignedIn,
    refreshLocalState,
    savePromptPending,
    selectedFolderId,
    surfaceGenerationError,
  ]);

  const openUploadDialog = useCallback(() => {
    if (uploadAssetsLoading) {
      return;
    }

    setUploadErrorMessage(null);
    setUploadDialogFolderId(selectedFolderId);
    setUploadDialogOpen(true);
  }, [selectedFolderId, uploadAssetsLoading]);

  const closeUploadDialog = useCallback(() => {
    if (uploadAssetsLoading) {
      return;
    }

    setUploadErrorMessage(null);
    setUploadDialogOpen(false);
  }, [uploadAssetsLoading]);

  const setUploadDialogFolder = useCallback((folderId: string | null) => {
    setUploadDialogFolderId(folderId);
  }, []);

  const openFeedbackDialog = useCallback(() => {
    setFeedbackErrorMessage(null);
    setFeedbackSuccessMessage(null);
    setFeedbackDialogOpen(true);
  }, []);

  const closeFeedbackDialog = useCallback(() => {
    if (feedbackPending) {
      return;
    }

    setFeedbackDialogOpen(false);
    setFeedbackErrorMessage(null);
    setFeedbackSuccessMessage(null);
  }, [feedbackPending]);

  const updateFeedbackMessage = useCallback((value: string) => {
    setFeedbackMessage(value);
    setFeedbackErrorMessage(null);
    setFeedbackSuccessMessage(null);
  }, []);

  const uploadFiles = useCallback(
    async (files: File[], folderIdOverride?: string | null) => {
      if (files.length === 0 || uploadAssetsLoading) {
        return;
      }

      setUploadAssetsLoading(true);
      setUploadErrorMessage(null);
      try {
        if (appMode === "hosted") {
          await applyHostedUpload(files, folderIdOverride ?? selectedFolderId);
          setUploadDialogOpen(false);
          return;
        }

        await applyLocalUpload(files, folderIdOverride ?? selectedFolderId);
        setUploadDialogOpen(false);
      } catch (error) {
        if (isAbortRequestError(error)) {
          return;
        }

        setUploadErrorMessage(
          error instanceof Error ? error.message : "Could not upload those files."
        );
      } finally {
        setUploadAssetsLoading(false);
      }
    },
    [appMode, applyHostedUpload, applyLocalUpload, selectedFolderId, uploadAssetsLoading]
  );

  const submitFeedback = useCallback(async () => {
    if (feedbackPending) {
      return;
    }

    const nextMessage = feedbackMessage.trim();
    if (!nextMessage) {
      setFeedbackErrorMessage("Feedback message is required.");
      return;
    }

    setFeedbackPending(true);
    setFeedbackErrorMessage(null);
    setFeedbackSuccessMessage(null);

    try {
      await submitFeedbackRequest({
        message: nextMessage,
      });
      setFeedbackMessage("");
      setFeedbackSuccessMessage("Feedback sent. Thank you.");
    } catch (error) {
      if (isAbortRequestError(error)) {
        return;
      }

      setFeedbackErrorMessage(
        error instanceof Error ? error.message : "Could not submit feedback."
      );
    } finally {
      setFeedbackPending(false);
    }
  }, [feedbackMessage, feedbackPending]);

  const saveProviderSettings = useCallback(
    async (nextSettings: StudioProviderSettings): Promise<StudioProviderSaveResult> => {
      const trimmedSettings: StudioProviderSettings = {
        falApiKey: nextSettings.falApiKey.trim(),
        falLastValidatedAt: nextSettings.falLastValidatedAt,
        openaiApiKey: nextSettings.openaiApiKey.trim(),
        openaiLastValidatedAt: nextSettings.openaiLastValidatedAt,
        anthropicApiKey: nextSettings.anthropicApiKey.trim(),
        anthropicLastValidatedAt: nextSettings.anthropicLastValidatedAt,
        geminiApiKey: nextSettings.geminiApiKey.trim(),
        geminiLastValidatedAt: nextSettings.geminiLastValidatedAt,
      };

      const validations: Array<{
        provider: StudioProviderKeyId;
        apiKey: string;
        lastValidatedAtKey:
          | "falLastValidatedAt"
          | "openaiLastValidatedAt"
          | "anthropicLastValidatedAt"
          | "geminiLastValidatedAt";
      }> = [
        {
          provider: "fal",
          apiKey: trimmedSettings.falApiKey,
          lastValidatedAtKey: "falLastValidatedAt",
        },
        {
          provider: "openai",
          apiKey: trimmedSettings.openaiApiKey,
          lastValidatedAtKey: "openaiLastValidatedAt",
        },
        {
          provider: "anthropic",
          apiKey: trimmedSettings.anthropicApiKey,
          lastValidatedAtKey: "anthropicLastValidatedAt",
        },
        {
          provider: "gemini",
          apiKey: trimmedSettings.geminiApiKey,
          lastValidatedAtKey: "geminiLastValidatedAt",
        },
      ];

      for (const validation of validations) {
        if (!validation.apiKey) {
          trimmedSettings[validation.lastValidatedAtKey] = null;
          continue;
        }

        if (validation.apiKey.length < 16 || /\s/.test(validation.apiKey)) {
          return {
            ok: false,
            errorMessage: `Enter a valid ${validation.provider === "anthropic" ? "Claude" : validation.provider === "openai" ? "OpenAI" : validation.provider === "gemini" ? "Gemini" : "Fal"} API key.`,
          };
        }

        try {
          trimmedSettings[validation.lastValidatedAtKey] =
            await validateProviderApiKey(validation.provider, validation.apiKey);
        } catch (error) {
          return {
            ok: false,
            errorMessage:
              error instanceof Error
                ? error.message
                : `Could not validate your ${validation.provider} API key.`,
          };
        }
      }

      try {
        await syncLocalProviderSession(trimmedSettings);
      } catch (error) {
        return {
          ok: false,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Could not sync the local provider session.",
        };
      }

      setProviderSettings(trimmedSettings);

      return {
        ok: true,
        successMessage: "API keys connected for this browser session.",
      };
    },
    []
  );

  const openHostedAuthDialog = useCallback(() => {
    setHostedAuthErrorMessage(null);
    setHostedAuthDialogOpen(true);
  }, []);

  const closeHostedAuthDialog = useCallback(() => {
    if (hostedAuthPending) {
      return;
    }

    setHostedAuthDialogOpen(false);
  }, [hostedAuthPending]);

  const signInWithGoogleHostedAccount = useCallback(async () => {
    if (appMode !== "hosted" || hostedAuthPending) {
      return;
    }

    setHostedAuthPending(true);
    setHostedAuthErrorMessage(null);

    try {
      await signInWithGoogleHostedSession();
    } catch (error) {
      setHostedAuthPending(false);
      setHostedAuthErrorMessage(
        error instanceof Error
          ? error.message
          : "Google sign-in could not be started."
      );
    }
  }, [appMode, hostedAuthPending]);

  const cancelRun = useCallback(
    (runId: string) => {
      const targetRun = runsRef.current.find((run) => run.id === runId);
      if (!targetRun || (targetRun.status !== "queued" && targetRun.status !== "pending")) {
        return;
      }

      if (appMode === "hosted") {
        void applyHostedMutation({
          action: "cancel_run",
          runId,
        });
        return;
      }

      void applyLocalMutation({
        action: "cancel_run",
        runId,
      }).catch(refreshLocalState);
    },
    [appMode, applyHostedMutation, applyLocalMutation, refreshLocalState]
  );

  const purchaseHostedCredits = useCallback(async () => {
    if (appMode !== "hosted") {
      return;
    }

    setPurchaseCreditsPending(true);
    setPurchaseCreditsErrorMessage(null);
    try {
      const successPath =
        typeof window === "undefined"
          ? "/"
          : `${window.location.pathname}${window.location.search}`;
      const checkoutUrl = await createHostedCheckoutSessionRequest({
        successPath,
        cancelPath: successPath,
        checkoutRequestId: crypto.randomUUID(),
      });
      window.location.assign(checkoutUrl);
      return;
    } catch (error) {
      setPurchaseCreditsErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not open Stripe Checkout."
      );
      throw error;
    } finally {
      setPurchaseCreditsPending(false);
    }
  }, [appMode]);

  const buildHostedGenerationPayload = useCallback(async () => {
    const inputs: HostedStudioGenerateInputDescriptor[] = [];
    const filesByField = new Map<string, File>();
    let nextUploadIndex = 0;

    const appendInput = (
      slot: HostedStudioGenerateInputDescriptor["slot"],
      reference: DraftReference | null
    ) => {
      if (!reference) {
        return;
      }

      return normalizeTextReferenceForProvider({
        model: selectedModel,
        reference,
      }).then((normalizedReference) => {
        const uploadField =
          normalizedReference.originAssetId === null ? `upload-${nextUploadIndex++}` : null;

        if (uploadField) {
          filesByField.set(uploadField, normalizedReference.file);
        }

        inputs.push({
          slot,
          uploadField,
          originAssetId: normalizedReference.originAssetId,
          title: normalizedReference.title,
          kind: normalizedReference.kind,
          mimeType: normalizedReference.mimeType,
          source: normalizedReference.source,
        });
      });
    };

    for (const reference of currentDraft.references) {
      await appendInput("reference", reference);
    }

    await appendInput("start_frame", currentDraft.startFrame);
    await appendInput("end_frame", currentDraft.endFrame);

    return {
      inputs,
      filesByField,
    };
  }, [
    currentDraft.endFrame,
    currentDraft.references,
    currentDraft.startFrame,
    selectedModel,
  ]);

  const signOutHostedAccount = useCallback(async () => {
    if (appMode !== "hosted" || accountActionPending !== null) {
      return;
    }

    setAccountActionErrorMessage(null);
    setAccountActionPending("sign_out");

    try {
      await signOutHostedSession();
      closeSettingsDialog();
    } catch (error) {
      if (!isAbortRequestError(error)) {
        setAccountActionErrorMessage(
          error instanceof Error ? error.message : "Could not sign out right now."
        );
      }
    } finally {
      setAccountActionPending(null);
    }
  }, [accountActionPending, appMode, closeSettingsDialog]);

  const deleteHostedAccount = useCallback(async () => {
    if (appMode !== "hosted" || accountActionPending !== null) {
      return;
    }

    setAccountActionErrorMessage(null);
    setAccountActionPending("delete");
    const request = beginHostedRequest();

    try {
      await deleteHostedAccountRequest(request.controller.signal);
      await signOutHostedSession().catch(() => undefined);
      closeSettingsDialog();
    } catch (error) {
      if (!isAbortRequestError(error)) {
        setAccountActionErrorMessage(
          error instanceof Error ? error.message : "Could not delete your account."
        );
      }
    } finally {
      finishHostedRequest(request.controller);
      setAccountActionPending(null);
    }
  }, [accountActionPending, appMode, beginHostedRequest, closeSettingsDialog, finishHostedRequest]);

  const setGallerySizeLevel = useCallback((value: number) => {
    const nextValue = Math.min(Math.max(Math.round(value), 0), 6);
    setGallerySizeLevelState(nextValue);
  }, []);

  const setSelectedModelId = useCallback((modelId: string) => {
    const nextVisibleModelId = getVisibleModelId(modelId);
    if (nextVisibleModelId === selectedModel.id) {
      return;
    }

    const nextModel = getStudioModelById(nextVisibleModelId);
    const transferredState = buildTransferredStudioDraftState({
      sourceModel: selectedModel,
      targetModel: nextModel,
      sourceDraft: currentDraft,
      targetPersistedDraft: draftsByModelId[nextVisibleModelId],
      targetReferences: draftReferencesByModelId[nextVisibleModelId],
      targetFrames: draftFramesByModelId[nextVisibleModelId],
    });

    setDraftsByModelId((current) => ({
      ...current,
      [nextVisibleModelId]: transferredState.persistedDraft,
    }));
    setDraftReferencesByModelId((current) => {
      const existingReferences = current[nextVisibleModelId] ?? [];
      releaseRemovedDraftReferencePreviews(
        existingReferences,
        transferredState.references
      );

      return {
        ...current,
        [nextVisibleModelId]: transferredState.references,
      };
    });
    setDraftFramesByModelId((current) => {
      const existingFrames =
        current[nextVisibleModelId] ??
        ({ startFrame: null, endFrame: null } satisfies DraftFrameInputs);

      if (
        existingFrames.startFrame &&
        existingFrames.startFrame.id !== transferredState.frames.startFrame?.id
      ) {
        releaseDraftReferencePreview(existingFrames.startFrame);
      }
      if (
        existingFrames.endFrame &&
        existingFrames.endFrame.id !== transferredState.frames.endFrame?.id
      ) {
        releaseDraftReferencePreview(existingFrames.endFrame);
      }

      return {
        ...current,
        [nextVisibleModelId]: transferredState.frames,
      };
    });
    setSelectedModelIdState(nextVisibleModelId);
  }, [
    currentDraft,
    draftFramesByModelId,
    draftReferencesByModelId,
    draftsByModelId,
    getVisibleModelId,
    selectedModel,
  ]);

  const closeGenerationErrorDialog = useCallback(() => {
    setGenerationErrorDialogOpen(false);
    setGenerationErrorMessage("");
  }, []);

  const generate = useCallback(() => {
    setGenerationErrorDialogOpen(false);
    setGenerationErrorMessage("");

    if (!canGenerateWithDraft(selectedModel, currentDraft)) {
      return;
    }

    const missingLocalProviderKey =
      appMode === "local"
        ? getLocalProviderKeyForModel({
            provider: selectedModel.provider,
            providerSettings,
          })
          ? null
          : getProviderKeyIdForModelProvider(selectedModel.provider)
        : null;

    if (appMode === "local" && missingLocalProviderKey) {
      openSettingsDialog(missingLocalProviderKey);
      return;
    }

    if (appMode === "hosted" && !hostedUserSignedIn) {
      setHostedAuthDialogOpen(true);
      return;
    }

    const clientRequestId = crypto.randomUUID();
    insertOptimisticRun(
      clientRequestId,
      createOptimisticQueuedRun({
        appMode,
        modelId: selectedModel.id,
        userId: profile.id,
        workspaceId:
          folders[0]?.workspaceId ??
          (appMode === "hosted" ? "workspace-hosted" : "workspace-local"),
        draft: currentDraft,
      })
    );

    if (appMode === "hosted") {
      setGeneratePending(true);
      const request = beginHostedRequest();

      void buildHostedGenerationPayload()
        .then((hostedGenerationPayload) =>
          queueHostedGeneration({
            clientRequestId,
            modelId: selectedModel.id,
            folderId: null,
            draft: createDraftSnapshot(currentDraft),
            inputs: hostedGenerationPayload.inputs,
            filesByField: hostedGenerationPayload.filesByField,
            signal: request.controller.signal,
          })
        )
        .then((response) => {
          finishHostedRequest(request.controller);
          setGeneratePending(false);
          applyHostedQueuedRunResponse(response, {
            requestId: request.requestId,
            sessionId: request.sessionId,
          });
        })
        .catch((error) => {
          finishHostedRequest(request.controller);
          setGeneratePending(false);
          removeOptimisticRun(clientRequestId);
          if (isAbortRequestError(error)) {
            return;
          }

          if (
            error instanceof Error &&
            error.message ===
              "limit of 100 concurrent queues/ generations reached, please wait for your generations to finish before continuing."
          ) {
            setQueueLimitDialogOpen(true);
            return;
          }

          if (error instanceof Error) {
            if (
              error.message === "Sign in with Google to use hosted mode." ||
              error.message === "Your hosted session expired. Sign in with Google again."
            ) {
              setHostedAuthDialogOpen(true);
            }
            if (error.message === "Not enough credits to queue this generation.") {
              openSettingsDialog();
            }
            surfaceGenerationError(error.message);
            return;
          }

          surfaceGenerationError("Hosted generation could not be queued.");
        });
      return;
    }

    setGeneratePending(true);
    const request = beginLocalRequest();

    void buildHostedGenerationPayload()
      .then((localGenerationPayload) =>
        queueLocalGenerationRequest({
          clientRequestId,
          modelId: selectedModel.id,
          folderId: null,
          draft: createDraftSnapshot(currentDraft),
          inputs: localGenerationPayload.inputs as LocalStudioGenerateInputDescriptor[],
          filesByField: localGenerationPayload.filesByField,
          signal: request.controller.signal,
        })
      )
      .then((response) => {
        finishLocalRequest(request.controller);
        setGeneratePending(false);
        applyLocalQueuedRunResponse(response, {
          requestId: request.requestId,
          sessionId: request.sessionId,
        });
      })
      .catch((error) => {
        finishLocalRequest(request.controller);
        setGeneratePending(false);
        removeOptimisticRun(clientRequestId);
        if (isAbortRequestError(error)) {
          return;
        }

        if (
          error instanceof Error &&
          error.message ===
            "limit of 100 concurrent queues/ generations reached, please wait for your generations to finish before continuing."
        ) {
          setQueueLimitDialogOpen(true);
          return;
        }

        if (error instanceof Error && error.message.toLowerCase().includes("api key")) {
          openSettingsDialog(
            getProviderKeyIdForModelProvider(selectedModel.provider)
          );
        }

        surfaceGenerationError(
          error instanceof Error ? error.message : "Local generation failed."
        );
        refreshLocalState();
      });
  }, [
    appMode,
    applyLocalQueuedRunResponse,
    applyHostedQueuedRunResponse,
    beginHostedRequest,
    beginLocalRequest,
    buildHostedGenerationPayload,
    currentDraft,
    finishLocalRequest,
    finishHostedRequest,
    folders,
    hostedUserSignedIn,
    insertOptimisticRun,
    openSettingsDialog,
    profile.id,
    providerSettings,
    removeOptimisticRun,
    refreshLocalState,
    selectedModel,
    surfaceGenerationError,
  ]);

  return {
    accountButtonLabel,
    addReferences,
    cancelRun,
    clearSelection,
    closeCreateTextComposer,
    closeFeedbackDialog,
    closeFolderEditor,
    closeGenerationErrorDialog,
    closeHostedAuthDialog,
    closeQueueLimitDialog: () => setQueueLimitDialogOpen(false),
    closeUploadDialog,
    createTextAsset,
    createTextBody,
    createTextDialogOpen,
    createTextErrorMessage,
    createTextSaving,
    createTextTitle,
    currentDraft,
    accountActionErrorMessage,
    accountActionPending,
    deleteFolder,
    deleteItem,
    deleteRun,
    deleteSelectedItems,
    dropLibraryItemsIntoPromptBar,
    feedbackDialogOpen,
    feedbackErrorMessage,
    feedbackMessage,
    feedbackPending,
    feedbackSuccessMessage,
    folderCounts,
    folderEditorError,
    folderEditorMode,
    folderEditorOpen,
    folderEditorSaving,
    folderEditorValue,
    folders,
    gallerySizeLevel,
    generate,
    generatePending,
    generationErrorDialogOpen,
    generationErrorMessage,
    getItemsForFolder: (folderId: string) =>
      items.filter((item) => item.folderId === folderId),
    getPromptBarDropHint,
    hasFalKey,
    highlightedProviderKey,
    hostedAccount,
    hostedAuthDialogOpen,
    hostedAuthErrorMessage,
    hostedAuthPending,
    hostedUserSignedIn,
    items,
    modelConfiguration,
    modelConfigurationErrorMessage,
    modelConfigurationPending,
    modelSections: STUDIO_MODEL_SECTIONS,
    models,
    moveItemsToFolder,
    openCreateFolder,
    openCreateTextComposer,
    openFeedbackDialog,
    openRenameFolder,
    openUploadDialog,
    providerSettings,
    purchaseCreditsErrorMessage,
    purchaseCreditsPending,
    purchaseHostedCredits,
    queueLimitDialogOpen,
    removeReference,
    reorderFolders,
    reuseItem,
    reuseRun,
    saveFolder,
    saveCurrentPromptAsTextItem,
    saveProviderSettings,
    savePromptPending,
    selectedFolder,
    selectedFolderId,
    selectedFolderItems,
    selectedFolderRunCards,
    selectedItemCount,
    selectedItemIdSet,
    selectedModel,
    selectedModelId: visibleSelectedModelId,
    selectionModeEnabled,
    runs,
    settingsDialogOpen,
    setEndFrame: (file: File) => setFrameInput("end", file),
    setGallerySizeLevel,
    setSettingsDialogOpen: (open: boolean) =>
      open ? openSettingsDialog() : closeSettingsDialog(),
    setSelectedFolderId,
    setSelectedModelId,
    setStartFrame: (file: File) => setFrameInput("start", file),
    setUploadDialogFolder,
    setVideoInputMode,
    clearEndFrame: () => clearFrameInput("end"),
    clearStartFrame: () => clearFrameInput("start"),
    dropLibraryItemsIntoEndFrame: (itemIds: string[]) =>
      setFrameFromLibraryItems(itemIds, "end"),
    dropLibraryItemsIntoStartFrame: (itemIds: string[]) =>
      setFrameFromLibraryItems(itemIds, "start"),
    toggleItemSelection,
    toggleModelEnabled,
    toggleSelectionMode,
    ungroupedItems,
    ungroupedRunCards,
    submitFeedback,
    updateCreateTextBody,
    updateCreateTextTitle,
    updateDraft,
    updateFeedbackMessage,
    updateFolderEditorValue,
    updateModelConfiguration,
    updateTextItem,
    uploadAssetsLoading,
    uploadDialogFolderId,
    uploadDialogOpen,
    uploadErrorMessage,
    uploadFiles,
    deleteHostedAccount,
    signOutHostedAccount,
    openHostedAuthDialog,
    signInWithGoogleHostedAccount,
  };
}
