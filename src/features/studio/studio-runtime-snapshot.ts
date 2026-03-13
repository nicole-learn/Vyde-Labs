import { loadUploadedAssetFile } from "./studio-browser-storage";
import { createAudioThumbnailUrl } from "./studio-asset-thumbnails";
import { STUDIO_STATE_SCHEMA_VERSION } from "./studio-local-runtime-data";
import type {
  GenerationRun,
  LibraryItem,
  PersistedStudioDraft,
  StudioCreditBalance,
  StudioCreditPack,
  StudioFolder,
  StudioFolderItem,
  StudioModelConfiguration,
  StudioProfile,
  StudioProviderSettings,
  StudioQueueSettings,
  StudioRunFile,
  StudioWorkspaceSnapshot,
} from "./types";

export function sanitizeItemsForWorkspaceSnapshot(items: LibraryItem[]) {
  return items.map((item) => {
    if (item.storageBucket !== "browser-upload") {
      return item;
    }

    return {
      ...item,
      previewUrl: null,
      thumbnailUrl: null,
    };
  });
}

export async function hydrateUploadedPreviewUrlsForItems(
  items: LibraryItem[],
  previewUrls: Map<string, string>
) {
  const hydratedItems = await Promise.all(
    items.map(async (item) => {
      if (item.storageBucket !== "browser-upload" || !item.storagePath) {
        return item;
      }

      const blob = await loadUploadedAssetFile(item.storagePath);
      if (!blob) {
        return item;
      }

      const previewUrl = URL.createObjectURL(blob);
      previewUrls.set(item.id, previewUrl);
      const thumbnailUrl =
        item.kind === "audio"
          ? createAudioThumbnailUrl({
              title: item.title,
              subtitle: item.meta || "Uploaded audio",
              accentSeed: item.id,
            })
          : previewUrl;

      return {
        ...item,
        previewUrl,
        thumbnailUrl,
      };
    })
  );

  return hydratedItems;
}

interface BuildStudioWorkspaceSnapshotParams {
  activeCreditPack: StudioCreditPack | null;
  appMode: "local" | "hosted";
  creditBalance: StudioCreditBalance | null;
  draftsByModelId: Record<string, PersistedStudioDraft>;
  folders: StudioFolder[];
  folderItems: StudioFolderItem[];
  gallerySizeLevel: number;
  items: LibraryItem[];
  modelConfiguration: StudioModelConfiguration;
  profile: StudioProfile;
  providerSettings: StudioProviderSettings;
  queueSettings: StudioQueueSettings;
  runFiles: StudioRunFile[];
  runs: GenerationRun[];
  selectedModelId: string;
}

export function buildStudioWorkspaceSnapshot(
  params: BuildStudioWorkspaceSnapshotParams
) {
  return {
    schemaVersion: STUDIO_STATE_SCHEMA_VERSION,
    mode: params.appMode,
    profile: params.profile,
    providerSettings: params.providerSettings,
    creditBalance: params.creditBalance,
    activeCreditPack: params.activeCreditPack,
    modelConfiguration: params.modelConfiguration,
    queueSettings: params.queueSettings,
    folders: params.folders,
    folderItems: params.folderItems,
    runFiles: params.runFiles,
    libraryItems: sanitizeItemsForWorkspaceSnapshot(params.items),
    generationRuns: params.runs,
    draftsByModelId: params.draftsByModelId,
    selectedModelId: params.selectedModelId,
    gallerySizeLevel: params.gallerySizeLevel,
  } satisfies StudioWorkspaceSnapshot;
}
