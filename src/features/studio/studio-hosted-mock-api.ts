import type {
  GenerationRun,
  LibraryItemKind,
  PersistedStudioDraft,
  StudioCreditPurchaseAmount,
  StudioWorkspaceSnapshot,
} from "./types";

export interface HostedStudioSnapshotResponse {
  snapshot: StudioWorkspaceSnapshot;
}

export interface HostedStudioUploadManifestEntry {
  kind: Extract<LibraryItemKind, "image" | "video" | "audio">;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaDurationSeconds: number | null;
  aspectRatioLabel: string | null;
  hasAlpha: boolean;
}

export type HostedStudioMutation =
  | {
      action: "purchase_credits";
      credits: StudioCreditPurchaseAmount;
    }
  | {
      action: "set_enabled_models";
      enabledModelIds: string[];
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
