import type {
  DraftReferenceSource,
  GenerationRun,
  StudioCreditBalance,
  LibraryItemKind,
  PersistedStudioDraft,
  StudioReferenceInputKind,
  StudioHostedClientStateDefaults,
  StudioHostedWorkspaceState,
} from "./types";

export type HostedStudioSyncResponse =
  | {
      kind: "bootstrap";
      revision: number;
      syncIntervalMs: number;
      uiStateDefaults: StudioHostedClientStateDefaults;
      state: StudioHostedWorkspaceState;
    }
  | {
      kind: "refresh";
      revision: number;
      syncIntervalMs: number;
      state: StudioHostedWorkspaceState;
    }
  | {
      kind: "noop";
      revision: number;
      syncIntervalMs: number;
    };

export interface HostedStudioMutationResponse {
  revision: number;
  state: StudioHostedWorkspaceState;
}

export interface HostedStudioGenerateResponse {
  kind: "queued";
  clientRequestId: string | null;
  revision: number;
  run: GenerationRun;
  creditBalance: StudioCreditBalance | null;
}

export interface HostedStudioUploadManifestEntry {
  kind: Extract<LibraryItemKind, "image" | "video" | "audio">;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaDurationSeconds: number | null;
  aspectRatioLabel: string | null;
  hasAlpha: boolean;
}

export interface HostedStudioGenerateInputDescriptor {
  slot: "reference" | "start_frame" | "end_frame";
  uploadField: string | null;
  originAssetId: string | null;
  title: string;
  kind: StudioReferenceInputKind;
  mimeType: string | null;
  source: DraftReferenceSource;
}

export type HostedStudioMutation =
  | {
      action: "set_enabled_models";
      enabledModelIds: string[];
    }
  | {
      action: "save_ui_state";
      selectedModelId: string;
      gallerySizeLevel: number;
    }
  | {
      action: "sign_out";
    }
  | {
      action: "delete_account";
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
      draft: GenerationRun["draftSnapshot"] | PersistedStudioDraft;
    }
  | {
      action: "cancel_run";
      runId: string;
    };
