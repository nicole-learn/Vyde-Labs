export type StudioModelKind = "image" | "video" | "text";
export type StudioModelSection = "images" | "videos" | "text";
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

export interface StudioModelDefinition {
  id: string;
  name: string;
  providerLabel: string;
  kind: StudioModelKind;
  section: StudioModelSection;
  description: string;
  heroGradient: string;
  tags: string[];
  promptPlaceholder: string;
  supportsNegativePrompt: boolean;
  supportsReferences: boolean;
  maxReferenceFiles?: number;
  acceptedReferenceKinds?: StudioReferenceInputKind[];
  aspectRatioOptions?: string[];
  resolutionOptions?: string[];
  outputFormatOptions?: string[];
  imageCountOptions?: number[];
  durationOptions?: number[];
  toneOptions?: string[];
  maxTokenOptions?: number[];
  defaultDraft: Omit<StudioDraft, "references">;
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
  aspectRatio: string;
  resolution: string;
  outputFormat: string;
  imageCount: number;
  durationSeconds: number;
  includeAudio: boolean;
  tone: string;
  maxTokens: number;
  temperature: number;
  references: DraftReference[];
}

export interface StudioFolder {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sortOrder: number;
}

export interface LibraryItem {
  id: string;
  workspaceId: string;
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
  aspectRatioLabel: string | null;
  folderId: string | null;
  storagePath: string | null;
  mimeType: string | null;
  byteSize: number | null;
  errorMessage: string | null;
}

export interface GenerationRun {
  id: string;
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
  startedAt: string | null;
  completedAt: string | null;
  summary: string;
  outputAssetId: string | null;
  previewUrl: string | null;
  progressPercent: number | null;
  errorMessage: string | null;
  draftSnapshot: Omit<StudioDraft, "references"> & {
    referenceCount: number;
  };
}

export interface StudioProviderSettings {
  falApiKey: string;
}
