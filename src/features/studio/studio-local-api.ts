import type {
  GenerationRun,
  PersistedStudioDraft,
  StudioReferenceInputKind,
  StudioWorkspaceSnapshot,
  DraftReferenceSource,
} from "./types";

export interface LocalStudioSnapshotResponse {
  revision: number;
  snapshot: StudioWorkspaceSnapshot;
}

export interface LocalStudioGenerateResponse {
  kind: "queued";
  clientRequestId: string | null;
  revision: number;
  run: GenerationRun;
}

export type LocalStudioSyncResponse =
  | (LocalStudioSnapshotResponse & {
      kind: "bootstrap" | "refresh";
      syncIntervalMs: number;
    })
  | {
      kind: "noop";
      revision: number;
      syncIntervalMs: number;
    };

export interface LocalStudioUploadManifestEntry {
  kind: "image" | "video" | "audio";
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaDurationSeconds: number | null;
  aspectRatioLabel: string | null;
  hasAlpha: boolean;
}

export interface LocalStudioGenerateInputDescriptor {
  slot: "reference" | "start_frame" | "end_frame";
  uploadField: string | null;
  originAssetId: string | null;
  title: string;
  kind: StudioReferenceInputKind;
  mimeType: string | null;
  source: DraftReferenceSource;
}

export type LocalStudioMutation =
  | {
      action: "save_ui_state";
      draftsByModelId: Record<string, PersistedStudioDraft>;
      selectedModelId: string;
      gallerySizeLevel: number;
      lastValidatedAt: string | null;
    }
  | {
      action: "set_enabled_models";
      enabledModelIds: string[];
    }
  | {
      action: "create_folder";
      name: string;
    }
  | {
      action: "rename_folder";
      folderId: string;
      name: string;
    }
  | {
      action: "delete_folder";
      folderId: string;
    }
  | {
      action: "reorder_folders";
      orderedFolderIds: string[];
    }
  | {
      action: "move_items";
      itemIds: string[];
      folderId: string | null;
    }
  | {
      action: "delete_items";
      itemIds: string[];
    }
  | {
      action: "delete_runs";
      runIds: string[];
    }
  | {
      action: "update_text_item";
      itemId: string;
      title?: string;
      contentText?: string;
    }
  | {
      action: "create_text_item";
      title: string;
      body: string;
      folderId: string | null;
    }
  | {
      action: "generate";
      modelId: string;
      folderId: string | null;
      draft: PersistedStudioDraft;
      referenceCount: number;
      startFrameCount: number;
      endFrameCount: number;
    }
  | {
      action: "cancel_run";
      runId: string;
    };
