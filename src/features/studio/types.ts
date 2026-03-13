export type StudioModelKind = "image" | "video" | "text";
export type StudioModelSection = "images" | "videos" | "text";
export type StudioRunStatus = "queued" | "running" | "completed";
export type LibraryItemSource = "generated" | "uploaded";
export type LibraryItemKind = StudioModelKind;
export type LibraryItemRole =
  | "generated_output"
  | "uploaded_source"
  | "text_note";
export type DraftReferenceSource = "upload" | "library-item";

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
  aspectRatioOptions?: string[];
  resolutionOptions?: string[];
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
}

export interface StudioDraft {
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  resolution: string;
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
  name: string;
  createdAt: string;
}

export interface LibraryItem {
  id: string;
  title: string;
  kind: LibraryItemKind;
  source: LibraryItemSource;
  role: LibraryItemRole;
  previewUrl: string | null;
  contentText: string | null;
  createdAt: string;
  modelId: string | null;
  prompt: string;
  meta: string;
  aspectRatio: number;
  folderId: string | null;
  mimeType: string | null;
  byteSize: number | null;
}

export interface GenerationRun {
  id: string;
  modelId: string;
  modelName: string;
  kind: StudioModelKind;
  status: StudioRunStatus;
  prompt: string;
  createdAt: string;
  summary: string;
  outputItemId: string | null;
  draftSnapshot: Omit<StudioDraft, "references"> & {
    referenceCount: number;
  };
}

export interface StudioProviderSettings {
  falApiKey: string;
}
