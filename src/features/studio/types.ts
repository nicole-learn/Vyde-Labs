export type StudioModelKind = "image" | "video" | "text" | "audio";
export type StudioModelSection = "images" | "videos" | "text" | "audio";
export type StudioCreditPurchaseAmount = 10 | 100;
export type StudioRunStatus =
  | "pending"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";
export type LibraryItemSource = "generated" | "uploaded";
export type LibraryItemKind = StudioModelKind;
export type StudioWorkspaceProvider = "fal";
export type StudioAssetStatus = "ready" | "processing" | "failed";
export type StudioGenerationRequestMode =
  | "text-to-image"
  | "text-to-video"
  | "image-to-video"
  | "first-last-frame-to-video"
  | "reference-to-video"
  | "text-to-speech"
  | "background-removal"
  | "chat";
export type StudioReferenceInputKind =
  | "image"
  | "video"
  | "audio"
  | "document";
export type LibraryItemRole =
  | "generated_output"
  | "uploaded_source"
  | "text_note";
export type DraftReferenceSource = "upload" | "library-item";
export type DraftReferencePreviewSource = "owned" | "asset" | "none";
export type StudioFolderEditorMode = "create" | "rename";
export type StudioVideoInputMode = "frames" | "references";
export type StudioProviderConnectionStatus =
  | "idle"
  | "connected"
  | "invalid";

export interface StudioVideoRateCard {
  withoutAudio: number;
  withAudio: number;
}

export type StudioModelPricing =
  | {
      type: "fixed";
      apiCostUsd: number;
    }
  | {
      type: "resolution";
      baseCostUsd: number;
      resolutionMultipliers: Record<string, number>;
    }
  | {
      type: "video";
      resolutionRates: Record<string, StudioVideoRateCard>;
      defaultResolution: string;
    }
  | {
      type: "tts";
      apiCostUsdPerThousandCharacters: number;
    }
  | {
      type: "llm";
      apiCostUsdPerMillionInputTokens: number;
      apiCostUsdPerMillionOutputTokens: number;
    };

export interface StudioModelDefinition {
  id: string;
  name: string;
  providerLabel: string;
  kind: StudioModelKind;
  section: StudioModelSection;
  description: string;
  heroGradient: string;
  tags: string[];
  requestMode: StudioGenerationRequestMode;
  requiresPrompt?: boolean;
  promptPlaceholder: string;
  supportsNegativePrompt: boolean;
  supportsReferences: boolean;
  supportsFrameInputs?: boolean;
  supportsEndFrame?: boolean;
  minimumReferenceFiles?: number;
  maxReferenceFiles?: number;
  acceptedReferenceKinds?: StudioReferenceInputKind[];
  aspectRatioOptions?: string[];
  resolutionOptions?: string[];
  outputFormatOptions?: string[];
  voiceOptions?: string[];
  languageOptions?: string[];
  speakingRateOptions?: string[];
  imageCountOptions?: number[];
  durationOptions?: number[];
  toneOptions?: string[];
  maxTokenOptions?: number[];
  pricing: StudioModelPricing;
  defaultDraft: Omit<StudioDraft, "references" | "startFrame" | "endFrame">;
}

export interface DraftReference {
  id: string;
  file: File;
  source: DraftReferenceSource;
  originAssetId: string | null;
  title: string;
  kind: StudioReferenceInputKind;
  mimeType: string | null;
  previewUrl: string | null;
  previewSource: DraftReferencePreviewSource;
}

export interface StudioDraft {
  prompt: string;
  negativePrompt: string;
  videoInputMode: StudioVideoInputMode;
  aspectRatio: string;
  resolution: string;
  outputFormat: string;
  imageCount: number;
  durationSeconds: number;
  includeAudio: boolean;
  tone: string;
  maxTokens: number;
  temperature: number;
  voice: string;
  language: string;
  speakingRate: string;
  references: DraftReference[];
  startFrame: DraftReference | null;
  endFrame: DraftReference | null;
}

export type PersistedStudioDraft = Omit<
  StudioDraft,
  "references" | "startFrame" | "endFrame"
>;

export interface StudioFolder {
  id: string;
  userId: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sortOrder: number;
}

export interface StudioFolderItem {
  folderId: string;
  libraryItemId: string;
  createdAt: string;
}

export interface StudioRunFile {
  id: string;
  runId: string | null;
  userId: string;
  fileRole: "input" | "output" | "thumbnail";
  sourceType: "generated" | "uploaded";
  storageBucket: string;
  storagePath: string;
  mimeType: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaDurationSeconds: number | null;
  aspectRatioLabel: string | null;
  hasAlpha: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface LibraryItem {
  id: string;
  userId: string;
  workspaceId: string;
  runFileId: string | null;
  sourceRunId: string | null;
  title: string;
  kind: LibraryItemKind;
  source: LibraryItemSource;
  role: LibraryItemRole;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  contentText: string | null;
  createdAt: string;
  updatedAt: string;
  modelId: string | null;
  runId: string | null;
  provider: StudioWorkspaceProvider;
  status: StudioAssetStatus;
  prompt: string;
  meta: string;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaDurationSeconds: number | null;
  aspectRatioLabel: string | null;
  hasAlpha: boolean;
  folderId: string | null;
  folderIds: string[];
  storageBucket: string;
  storagePath: string | null;
  thumbnailPath: string | null;
  fileName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  metadata: Record<string, unknown>;
  errorMessage: string | null;
}

export interface GenerationRun {
  id: string;
  userId: string;
  workspaceId: string;
  folderId: string | null;
  modelId: string;
  modelName: string;
  kind: StudioModelKind;
  provider: StudioWorkspaceProvider;
  requestMode: StudioGenerationRequestMode;
  status: StudioRunStatus;
  prompt: string;
  createdAt: string;
  queueEnteredAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  summary: string;
  outputAssetId: string | null;
  previewUrl: string | null;
  errorMessage: string | null;
  inputPayload: Record<string, unknown>;
  inputSettings: Record<string, unknown>;
  providerRequestId: string | null;
  providerStatus: string | null;
  estimatedCostUsd: number | null;
  actualCostUsd: number | null;
  estimatedCredits: number | null;
  actualCredits: number | null;
  usageSnapshot: Record<string, unknown>;
  outputText: string | null;
  pricingSnapshot: Record<string, unknown>;
  dispatchAttemptCount: number;
  dispatchLeaseExpiresAt: string | null;
  canCancel: boolean;
  draftSnapshot: PersistedStudioDraft & {
    referenceCount: number;
    startFrameCount: number;
    endFrameCount: number;
  };
}

export interface StudioProfile {
  id: string;
  email: string;
  displayName: string;
  avatarLabel: string;
  avatarUrl: string | null;
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StudioCreditBalance {
  userId: string;
  balanceCredits: number;
  updatedAt: string;
}

export interface StudioCreditPack {
  id: string;
  credits: number;
  priceCents: number;
  currency: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudioQueueSettings {
  maxActiveJobsPerUser: number;
  providerSlotLimit: number;
  localConcurrencyLimit: number;
  activeHostedUserCount: number;
}

export interface StudioHostedAccount {
  profile: StudioProfile;
  creditBalance: StudioCreditBalance;
  activeCreditPack: StudioCreditPack | null;
  queuedCount: number;
  generatingCount: number;
  completedCount: number;
  pricingSummary: string;
  environmentLabel: string;
}

export interface StudioModelConfiguration {
  enabledModelIds: string[];
  updatedAt: string;
}

export interface StudioProviderSettings {
  falApiKey: string;
  lastValidatedAt: string | null;
}

export interface StudioProviderSaveResult {
  ok: boolean;
  errorMessage?: string;
  successMessage?: string;
}

export interface StudioWorkspaceDomainState {
  profile: StudioProfile;
  creditBalance: StudioCreditBalance | null;
  activeCreditPack: StudioCreditPack | null;
  modelConfiguration: StudioModelConfiguration;
  queueSettings: StudioQueueSettings;
  folders: StudioFolder[];
  folderItems: StudioFolderItem[];
  runFiles: StudioRunFile[];
  libraryItems: LibraryItem[];
  generationRuns: GenerationRun[];
}

export interface StudioWorkspaceUiState {
  providerSettings: StudioProviderSettings;
  draftsByModelId: Record<string, PersistedStudioDraft>;
  selectedModelId: string;
  gallerySizeLevel: number;
}

export interface StudioWorkspaceSnapshot
  extends StudioWorkspaceDomainState,
    StudioWorkspaceUiState {
  schemaVersion: number;
  mode: "local" | "hosted";
}
