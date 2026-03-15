import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { createAudioThumbnailUrl } from "@/features/studio/studio-asset-thumbnails";
import {
  canGenerateWithDraft,
  getStudioConcurrencyLimitForMode,
  resolveStudioGenerationRequestMode,
} from "@/features/studio/studio-generation-rules";
import type {
  LocalStudioGenerateResponse,
  LocalStudioGenerateInputDescriptor,
  LocalStudioMutation,
  LocalStudioUploadManifestEntry,
} from "@/features/studio/studio-local-api";
import {
  buildStudioWorkspaceSnapshot,
} from "@/features/studio/studio-runtime-snapshot";
import {
  createDraft,
  createGenerationRunPreviewUrl,
  createGenerationRunSummary,
  createStudioId,
  createStudioSeedSnapshot,
  hydrateDraft,
  STUDIO_STATE_SCHEMA_VERSION,
  toPersistedDraft,
} from "@/features/studio/studio-local-runtime-data";
import {
  normalizeStudioEnabledModelIds,
  resolveConfiguredStudioModelId,
} from "@/features/studio/studio-model-configuration";
import {
  findStudioModelById,
  getStudioModelById,
  requireStudioModelById,
} from "@/features/studio/studio-model-catalog";
import { quoteStudioDraftPricing } from "@/features/studio/studio-model-pricing";
import {
  getStudioUploadedMediaKind,
  studioUploadSupportsAlpha,
} from "@/features/studio/studio-upload-files";
import type {
  GenerationRun,
  LibraryItem,
  PersistedStudioDraft,
  StudioFolder,
  StudioProviderSettings,
  StudioRunFile,
  StudioWorkspaceSnapshot,
} from "@/features/studio/types";
import {
  getStudioFalQueueStatus,
  getStudioFalQueuedResult,
  resolveStudioFalCompletedPayload,
  submitStudioFalRequest,
  type StudioFalInputFile,
} from "@/server/fal/studio-fal";
import {
  generateStudioTextProviderPayload,
  getLocalTextProviderKey,
} from "@/server/studio/studio-text-providers";
import {
  createStudioRouteError,
} from "@/server/studio/studio-route-errors";
import {
  validateStudioGenerationRequest,
} from "@/server/studio/studio-request-validation";
import {
  ensureLocalDataDirectories,
  getLocalDatabasePath,
  getLocalItemSourceDirectory,
  getLocalItemThumbnailDirectory,
  getLocalRunInputDirectory,
  getLocalRunOutputDirectory,
  getLocalStorageRoot,
} from "./local-paths";

type LocalStore = {
  db: Database.Database;
  revision: number;
  snapshot: StudioWorkspaceSnapshot;
};

type LocalFileRecord = {
  absolutePath: string;
  fileName: string | null;
  mimeType: string | null;
};

type LocalStoreBootstrap = {
  revision: number;
  snapshot: StudioWorkspaceSnapshot;
};

const STORE_KEY = "__TRYPLAYGROUND_LOCAL_STORE__";
const LOCAL_QUEUE_WORKER_KEY = "__TRYPLAYGROUND_LOCAL_QUEUE_WORKER__";
const LOCAL_SYNC_INTERVAL_MS = 1200;

type LocalQueueWorkerState = {
  latestProviderSettings: StudioProviderSettings;
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

type WorkspaceRow = {
  id: string;
  mode: "local";
  profile_json: string;
  credit_balance_json: string | null;
  active_credit_pack_json: string | null;
  model_configuration_json: string;
  queue_settings_json: string;
  created_at: string;
  updated_at: string;
};

type PreferencesRow = {
  workspace_id: string;
  drafts_by_model_id_json: string;
  selected_model_id: string;
  gallery_size_level: number;
  provider_last_validated_at: string | null;
  updated_at: string;
};

type InstallationRow = {
  installation_id: string;
  workspace_id: string;
  current_revision: number;
  created_at: string;
  updated_at: string;
};

type GenerationRunInputRow = {
  id: string;
  run_id: string;
  input_role: "reference" | "start_frame" | "end_frame";
  position: number;
  library_item_id: string | null;
  run_file_id: string | null;
  created_at: string;
};

function cloneSnapshot(snapshot: StudioWorkspaceSnapshot) {
  return structuredClone(snapshot);
}

function parseJson<T>(value: string | null, fallback: T) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function serializeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function ensureColumnExists(
  db: Database.Database,
  tableName: string,
  columnName: string,
  columnDefinition: string
) {
  const columns = db
    .prepare(`pragma table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(
    `alter table ${tableName} add column ${columnName} ${columnDefinition}`
  );
}

function buildLocalFileUrl(fileId: string) {
  return `/api/studio/local/files/${encodeURIComponent(fileId)}`;
}

function cloneClientSnapshot(snapshot: StudioWorkspaceSnapshot) {
  const nextSnapshot = cloneSnapshot(snapshot);
  nextSnapshot.generationRuns = nextSnapshot.generationRuns.filter(
    (run) => !run.deletedAt
  );
  return nextSnapshot;
}

function getLocalQueueWorkerState(): LocalQueueWorkerState {
  const globalState = globalThis as typeof globalThis & {
    [LOCAL_QUEUE_WORKER_KEY]?: LocalQueueWorkerState;
  };

  if (!globalState[LOCAL_QUEUE_WORKER_KEY]) {
    globalState[LOCAL_QUEUE_WORKER_KEY] = {
      latestProviderSettings: {
        falApiKey: "",
        falLastValidatedAt: null,
        openaiApiKey: "",
        openaiLastValidatedAt: null,
        anthropicApiKey: "",
        anthropicLastValidatedAt: null,
        geminiApiKey: "",
        geminiLastValidatedAt: null,
      },
      running: false,
      timer: null,
    };
  }

  return globalState[LOCAL_QUEUE_WORKER_KEY]!;
}

function hasPendingLocalQueueWork(store: LocalStore) {
  return store.snapshot.generationRuns.some(
    (run) =>
      run.status === "queued" ||
      run.status === "pending" ||
      run.status === "processing"
  );
}

function getFileExtension(fileName: string) {
  const extension = path.extname(fileName).trim().toLowerCase();
  return extension || "";
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;charset=[^;,]+)?(;base64)?,(.*)$/);
  if (!match) {
    throw new Error("Invalid data URL.");
  }

  const content = match[4] ?? "";
  const isBase64 = Boolean(match[3]);
  return isBase64
    ? Buffer.from(content, "base64")
    : Buffer.from(decodeURIComponent(content), "utf8");
}

function ensureParentDirectory(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function createAudioThumbnailFile(params: {
  itemId: string;
  title: string;
  subtitle: string;
  accentSeed: string;
  thumbnailRunFileId: string;
}) {
  const dataUrl = createAudioThumbnailUrl({
    title: params.title,
    subtitle: params.subtitle,
    accentSeed: params.accentSeed,
  });
  const buffer = decodeDataUrl(dataUrl);
  const relativePath = path
    .join("items", params.itemId, "thumbnail", `${params.thumbnailRunFileId}.svg`)
    .replaceAll(path.sep, "/");
  const absolutePath = path.join(getLocalStorageRoot(), relativePath);

  ensureParentDirectory(absolutePath);
  fs.writeFileSync(absolutePath, buffer);

  return {
    absolutePath,
    relativePath,
  };
}

function getLocalFileAbsolutePath(storagePath: string) {
  return path.join(getLocalStorageRoot(), storagePath);
}

function getBundledPublicAssetAbsolutePath(storagePath: string) {
  const normalizedPath = storagePath.replace(/^\/+/, "");
  return path.join(process.cwd(), "public", normalizedPath);
}

function assertLocalFolderExists(
  snapshot: Pick<StudioWorkspaceSnapshot, "folders">,
  folderId: string | null
) {
  if (!folderId) {
    return;
  }

  const folderExists = snapshot.folders.some((folder) => folder.id === folderId);
  if (!folderExists) {
    createStudioRouteError(404, "The selected folder could not be found.");
  }
}

function sanitizeStorageFileName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "file.bin";
}

async function writeBlobToLocalStorageFile(params: {
  relativePath: string;
  blob: Blob;
}) {
  const absolutePath = getLocalFileAbsolutePath(params.relativePath);
  ensureParentDirectory(absolutePath);
  await fsPromises.writeFile(
    absolutePath,
    Buffer.from(await params.blob.arrayBuffer())
  );
}

async function listLocalRunInputs(db: Database.Database, runId: string) {
  return db
    .prepare(
      `
        select id, run_id, input_role, position, library_item_id, run_file_id, created_at
        from generation_run_inputs
        where run_id = ?
        order by position asc
      `
    )
    .all(runId) as GenerationRunInputRow[];
}

function createTables(db: Database.Database) {
  db.exec(`
    create table if not exists installation_state (
      installation_id text primary key,
      workspace_id text not null,
      current_revision integer not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists workspaces (
      id text primary key,
      mode text not null,
      profile_json text not null,
      credit_balance_json text,
      active_credit_pack_json text,
      model_configuration_json text not null,
      queue_settings_json text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists local_preferences (
      workspace_id text primary key,
      drafts_by_model_id_json text not null,
      selected_model_id text not null,
      gallery_size_level integer not null,
      provider_last_validated_at text,
      updated_at text not null
    );

    create table if not exists folders (
      id text primary key,
      user_id text not null,
      workspace_id text not null,
      name text not null,
      created_at text not null,
      updated_at text not null,
      sort_order integer not null
    );

    create table if not exists run_files (
      id text primary key,
      run_id text,
      user_id text not null,
      file_role text not null,
      source_type text not null,
      storage_bucket text not null,
      storage_path text not null,
      mime_type text,
      file_name text,
      file_size_bytes integer,
      media_width integer,
      media_height integer,
      media_duration_seconds real,
      aspect_ratio_label text,
      has_alpha integer not null,
      metadata_json text not null,
      created_at text not null
    );

    create table if not exists library_items (
      id text primary key,
      user_id text not null,
      workspace_id text not null,
      run_file_id text,
      source_run_id text,
      title text not null,
      kind text not null,
      source text not null,
      role text not null,
      content_text text,
      created_at text not null,
      updated_at text not null,
      model_id text,
      run_id text,
      provider text not null,
      status text not null,
      prompt text not null,
      meta text not null,
      media_width integer,
      media_height integer,
      media_duration_seconds real,
      aspect_ratio_label text,
      has_alpha integer not null,
      folder_id text,
      storage_bucket text not null,
      storage_path text,
      thumbnail_path text,
      file_name text,
      mime_type text,
      byte_size integer,
      metadata_json text not null,
      error_message text
    );

    create table if not exists generation_runs (
      id text primary key,
      user_id text not null,
      workspace_id text not null,
      folder_id text,
      deleted_at text,
      model_id text not null,
      model_name text not null,
      kind text not null,
      provider text not null,
      request_mode text not null,
      status text not null,
      prompt text not null,
      created_at text not null,
      queue_entered_at text not null,
      started_at text,
      completed_at text,
      failed_at text,
      cancelled_at text,
      updated_at text not null,
      summary text not null,
      output_asset_id text,
      preview_url text,
      error_message text,
      input_payload_json text not null,
      input_settings_json text not null,
      provider_request_id text,
      provider_status text,
      estimated_cost_usd real,
      actual_cost_usd real,
      estimated_credits real,
      actual_credits real,
      usage_snapshot_json text not null,
      output_text text,
      pricing_snapshot_json text not null,
      dispatch_attempt_count integer not null,
      dispatch_lease_expires_at text,
      can_cancel integer not null,
      draft_snapshot_json text not null
    );

    create table if not exists generation_run_inputs (
      id text primary key,
      run_id text not null,
      input_role text not null,
      position integer not null,
      library_item_id text,
      run_file_id text,
      created_at text not null
    );

    create index if not exists folders_workspace_sort_idx on folders (workspace_id, sort_order);
    create index if not exists library_items_workspace_folder_created_idx on library_items (workspace_id, folder_id, created_at desc);
    create index if not exists generation_runs_workspace_status_queue_idx on generation_runs (workspace_id, status, queue_entered_at asc);
    create index if not exists generation_run_inputs_run_position_idx on generation_run_inputs (run_id, position asc);
  `);

  ensureColumnExists(db, "generation_runs", "deleted_at", "text");
}

function persistSnapshot(db: Database.Database, revision: number, snapshot: StudioWorkspaceSnapshot) {
  const tx = db.transaction(() => {
    db.prepare("delete from installation_state").run();
    db.prepare("delete from workspaces").run();
    db.prepare("delete from local_preferences").run();
    db.prepare("delete from folders").run();
    db.prepare("delete from run_files").run();
    db.prepare("delete from library_items").run();
    db.prepare("delete from generation_runs").run();
    db.prepare("delete from generation_run_inputs").run();

    db.prepare(
      `
        insert into installation_state (
          installation_id, workspace_id, current_revision, created_at, updated_at
        ) values (?, ?, ?, ?, ?)
      `
    ).run(
      "local-installation",
      snapshot.profile.preferences.workspaceId as string | undefined ?? snapshot.folders[0]?.workspaceId ?? "workspace-local",
      revision,
      snapshot.profile.createdAt,
      new Date().toISOString()
    );

    db.prepare(
      `
        insert into workspaces (
          id, mode, profile_json, credit_balance_json, active_credit_pack_json,
          model_configuration_json, queue_settings_json, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      snapshot.folders[0]?.workspaceId ?? "workspace-local",
      "local",
      serializeJson(snapshot.profile),
      serializeJson(snapshot.creditBalance),
      serializeJson(snapshot.activeCreditPack),
      serializeJson(snapshot.modelConfiguration),
      serializeJson(snapshot.queueSettings),
      snapshot.profile.createdAt,
      new Date().toISOString()
    );

    db.prepare(
      `
        insert into local_preferences (
          workspace_id, drafts_by_model_id_json, selected_model_id, gallery_size_level,
          provider_last_validated_at, updated_at
        ) values (?, ?, ?, ?, ?, ?)
      `
    ).run(
      snapshot.folders[0]?.workspaceId ?? "workspace-local",
      serializeJson(snapshot.draftsByModelId),
      snapshot.selectedModelId,
      snapshot.gallerySizeLevel,
      snapshot.providerSettings.falLastValidatedAt,
      new Date().toISOString()
    );

    const insertFolder = db.prepare(
      `
        insert into folders (
          id, user_id, workspace_id, name, created_at, updated_at, sort_order
        ) values (?, ?, ?, ?, ?, ?, ?)
      `
    );
    for (const folder of snapshot.folders) {
      insertFolder.run(
        folder.id,
        folder.userId,
        folder.workspaceId,
        folder.name,
        folder.createdAt,
        folder.updatedAt,
        folder.sortOrder
      );
    }

    const insertRunFile = db.prepare(
      `
        insert into run_files (
          id, run_id, user_id, file_role, source_type, storage_bucket, storage_path,
          mime_type, file_name, file_size_bytes, media_width, media_height,
          media_duration_seconds, aspect_ratio_label, has_alpha, metadata_json, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    );
    for (const runFile of snapshot.runFiles) {
      insertRunFile.run(
        runFile.id,
        runFile.runId,
        runFile.userId,
        runFile.fileRole,
        runFile.sourceType,
        runFile.storageBucket,
        runFile.storagePath,
        runFile.mimeType,
        runFile.fileName,
        runFile.fileSizeBytes,
        runFile.mediaWidth,
        runFile.mediaHeight,
        runFile.mediaDurationSeconds,
        runFile.aspectRatioLabel,
        runFile.hasAlpha ? 1 : 0,
        serializeJson(runFile.metadata),
        runFile.createdAt
      );
    }

    const insertItem = db.prepare(
      `
        insert into library_items (
          id, user_id, workspace_id, run_file_id, source_run_id, title, kind, source,
          role, content_text, created_at, updated_at, model_id, run_id, provider,
          status, prompt, meta, media_width, media_height, media_duration_seconds,
          aspect_ratio_label, has_alpha, folder_id, storage_bucket, storage_path,
          thumbnail_path, file_name, mime_type, byte_size, metadata_json, error_message
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    );
    for (const item of snapshot.libraryItems) {
      insertItem.run(
        item.id,
        item.userId,
        item.workspaceId,
        item.runFileId,
        item.sourceRunId,
        item.title,
        item.kind,
        item.source,
        item.role,
        item.contentText,
        item.createdAt,
        item.updatedAt,
        item.modelId,
        item.runId,
        item.provider,
        item.status,
        item.prompt,
        item.meta,
        item.mediaWidth,
        item.mediaHeight,
        item.mediaDurationSeconds,
        item.aspectRatioLabel,
        item.hasAlpha ? 1 : 0,
        item.folderId,
        item.storageBucket,
        item.storagePath,
        item.thumbnailPath,
        item.fileName,
        item.mimeType,
        item.byteSize,
        serializeJson(item.metadata),
        item.errorMessage
      );
    }

    const insertRun = db.prepare(
      `
        insert into generation_runs (
          id, user_id, workspace_id, folder_id, deleted_at, model_id, model_name, kind, provider,
          request_mode, status, prompt, created_at, queue_entered_at, started_at,
          completed_at, failed_at, cancelled_at, updated_at, summary, output_asset_id,
          preview_url, error_message, input_payload_json, input_settings_json,
          provider_request_id, provider_status, estimated_cost_usd, actual_cost_usd,
          estimated_credits, actual_credits, usage_snapshot_json, output_text,
          pricing_snapshot_json, dispatch_attempt_count, dispatch_lease_expires_at,
          can_cancel, draft_snapshot_json
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    );
    for (const run of snapshot.generationRuns) {
      insertRun.run(
        run.id,
        run.userId,
        run.workspaceId,
        run.folderId,
        run.deletedAt ?? null,
        run.modelId,
        run.modelName,
        run.kind,
        run.provider,
        run.requestMode,
        run.status,
        run.prompt,
        run.createdAt,
        run.queueEnteredAt,
        run.startedAt,
        run.completedAt,
        run.failedAt,
        run.cancelledAt,
        run.updatedAt,
        run.summary,
        run.outputAssetId,
        run.previewUrl,
        run.errorMessage,
        serializeJson(run.inputPayload),
        serializeJson(run.inputSettings),
        run.providerRequestId,
        run.providerStatus,
        run.estimatedCostUsd,
        run.actualCostUsd,
        run.estimatedCredits,
        run.actualCredits,
        serializeJson(run.usageSnapshot),
        run.outputText,
        serializeJson(run.pricingSnapshot),
        run.dispatchAttemptCount,
        run.dispatchLeaseExpiresAt,
        run.canCancel ? 1 : 0,
        serializeJson(run.draftSnapshot)
      );
    }
  });

  tx();
}

function readSnapshotFromDb(db: Database.Database): LocalStoreBootstrap | null {
  const installation = db
    .prepare("select * from installation_state limit 1")
    .get() as InstallationRow | undefined;
  if (!installation) {
    return null;
  }

  const workspace = db
    .prepare("select * from workspaces limit 1")
    .get() as WorkspaceRow | undefined;
  const preferences = db
    .prepare("select * from local_preferences limit 1")
    .get() as PreferencesRow | undefined;

  if (!workspace || !preferences) {
    return null;
  }

  const folders = db
    .prepare("select * from folders order by sort_order asc, created_at asc")
    .all() as Array<{
    id: string;
    user_id: string;
    workspace_id: string;
    name: string;
    created_at: string;
    updated_at: string;
    sort_order: number;
  }>;

  const runFiles = db
    .prepare("select * from run_files order by created_at desc")
    .all() as Array<{
    id: string;
    run_id: string | null;
    user_id: string;
    file_role: StudioRunFile["fileRole"];
    source_type: StudioRunFile["sourceType"];
    storage_bucket: string;
    storage_path: string;
    mime_type: string | null;
    file_name: string | null;
    file_size_bytes: number | null;
    media_width: number | null;
    media_height: number | null;
    media_duration_seconds: number | null;
    aspect_ratio_label: string | null;
    has_alpha: number;
    metadata_json: string;
    created_at: string;
  }>;

  const items = db
    .prepare("select * from library_items order by created_at desc")
    .all() as Array<{
    id: string;
    user_id: string;
    workspace_id: string;
    run_file_id: string | null;
    source_run_id: string | null;
    title: string;
    kind: LibraryItem["kind"];
    source: LibraryItem["source"];
    role: LibraryItem["role"];
    content_text: string | null;
    created_at: string;
    updated_at: string;
    model_id: string | null;
    run_id: string | null;
    provider: LibraryItem["provider"];
    status: LibraryItem["status"];
    prompt: string;
    meta: string;
    media_width: number | null;
    media_height: number | null;
    media_duration_seconds: number | null;
    aspect_ratio_label: string | null;
    has_alpha: number;
    folder_id: string | null;
    storage_bucket: string;
    storage_path: string | null;
    thumbnail_path: string | null;
    file_name: string | null;
    mime_type: string | null;
    byte_size: number | null;
    metadata_json: string;
    error_message: string | null;
  }>;

  const runs = db
    .prepare("select * from generation_runs order by created_at desc")
    .all() as Array<{
    id: string;
    user_id: string;
    workspace_id: string;
    folder_id: string | null;
    deleted_at: string | null;
    model_id: string;
    model_name: string;
    kind: GenerationRun["kind"];
    provider: GenerationRun["provider"];
    request_mode: GenerationRun["requestMode"];
    status: GenerationRun["status"];
    prompt: string;
    created_at: string;
    queue_entered_at: string;
    started_at: string | null;
    completed_at: string | null;
    failed_at: string | null;
    cancelled_at: string | null;
    updated_at: string;
    summary: string;
    output_asset_id: string | null;
    preview_url: string | null;
    error_message: string | null;
    input_payload_json: string;
    input_settings_json: string;
    provider_request_id: string | null;
    provider_status: string | null;
    estimated_cost_usd: number | null;
    actual_cost_usd: number | null;
    estimated_credits: number | null;
    actual_credits: number | null;
    usage_snapshot_json: string;
    output_text: string | null;
    pricing_snapshot_json: string;
    dispatch_attempt_count: number;
    dispatch_lease_expires_at: string | null;
    can_cancel: number;
    draft_snapshot_json: string;
  }>;

  const snapshot = buildStudioWorkspaceSnapshot({
    activeCreditPack: parseJson(workspace.active_credit_pack_json, null),
    appMode: "local",
    creditBalance: parseJson(workspace.credit_balance_json, null),
    draftsByModelId: parseJson(preferences.drafts_by_model_id_json, {}),
    folders: folders.map((folder) => ({
      id: folder.id,
      userId: folder.user_id,
      workspaceId: folder.workspace_id,
      name: folder.name,
      createdAt: folder.created_at,
      updatedAt: folder.updated_at,
      sortOrder: folder.sort_order,
    })),
    gallerySizeLevel: preferences.gallery_size_level,
    items: items.map((item) => {
      const previewUrl =
        item.kind === "text"
          ? null
          : item.run_file_id
            ? buildLocalFileUrl(item.run_file_id)
            : item.storage_bucket === "mock-public" && item.storage_path
              ? item.storage_path.startsWith("/")
                ? item.storage_path
                : `/${item.storage_path}`
              : null;
      const thumbnailUrl =
        item.kind === "audio"
          ? item.thumbnail_path
            ? buildLocalFileUrl(item.thumbnail_path)
            : createAudioThumbnailUrl({
                title: item.title,
                subtitle: item.meta || "Audio asset",
                accentSeed: item.id,
              })
          : item.thumbnail_path
            ? buildLocalFileUrl(item.thumbnail_path)
            : previewUrl;

      return {
        id: item.id,
        userId: item.user_id,
        workspaceId: item.workspace_id,
        runFileId: item.run_file_id,
        sourceRunId: item.source_run_id,
        title: item.title,
        kind: item.kind,
        source: item.source,
        role: item.role,
        previewUrl,
        thumbnailUrl,
        contentText: item.content_text,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        modelId: item.model_id,
        runId: item.run_id,
        provider: item.provider,
        status: item.status,
        prompt: item.prompt,
        meta: item.meta,
        mediaWidth: item.media_width,
        mediaHeight: item.media_height,
        mediaDurationSeconds: item.media_duration_seconds,
        aspectRatioLabel: item.aspect_ratio_label,
        hasAlpha: item.has_alpha === 1,
        folderId: item.folder_id,
        storageBucket: item.storage_bucket,
        storagePath: item.storage_path,
        thumbnailPath: item.thumbnail_path,
        fileName: item.file_name,
        mimeType: item.mime_type,
        byteSize: item.byte_size,
        metadata: parseJson(item.metadata_json, {}),
        errorMessage: item.error_message,
      } satisfies LibraryItem;
    }),
    modelConfiguration: parseJson(workspace.model_configuration_json, {
      enabledModelIds: [],
      updatedAt: workspace.updated_at,
    }),
    profile: parseJson(workspace.profile_json, {
      id: "user-local",
      email: "local@tryplayground.ai",
      displayName: "Local Workspace",
      avatarLabel: "T",
      avatarUrl: null,
      preferences: {},
      createdAt: workspace.created_at,
      updatedAt: workspace.updated_at,
    }),
    providerSettings: {
      falApiKey: "",
      falLastValidatedAt: preferences.provider_last_validated_at,
      openaiApiKey: "",
      openaiLastValidatedAt: null,
      anthropicApiKey: "",
      anthropicLastValidatedAt: null,
      geminiApiKey: "",
      geminiLastValidatedAt: null,
    },
    queueSettings: parseJson(workspace.queue_settings_json, {
      maxActiveJobsPerUser: 100,
      providerSlotLimit: 30,
      localConcurrencyLimit: 3,
      activeHostedUserCount: 0,
    }),
    runFiles: runFiles.map((runFile) => ({
      id: runFile.id,
      runId: runFile.run_id,
      userId: runFile.user_id,
      fileRole: runFile.file_role,
      sourceType: runFile.source_type,
      storageBucket: runFile.storage_bucket,
      storagePath: runFile.storage_path,
      mimeType: runFile.mime_type,
      fileName: runFile.file_name,
      fileSizeBytes: runFile.file_size_bytes,
      mediaWidth: runFile.media_width,
      mediaHeight: runFile.media_height,
      mediaDurationSeconds: runFile.media_duration_seconds,
      aspectRatioLabel: runFile.aspect_ratio_label,
      hasAlpha: runFile.has_alpha === 1,
      metadata: parseJson(runFile.metadata_json, {}),
      createdAt: runFile.created_at,
    })),
    runs: runs.map((run) => ({
      id: run.id,
      userId: run.user_id,
      workspaceId: run.workspace_id,
      folderId: run.folder_id,
      deletedAt: run.deleted_at,
      modelId: run.model_id,
      modelName: run.model_name,
      kind: run.kind,
      provider: run.provider,
      requestMode: run.request_mode,
      status: run.status,
      prompt: run.prompt,
      createdAt: run.created_at,
      queueEnteredAt: run.queue_entered_at,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      failedAt: run.failed_at,
      cancelledAt: run.cancelled_at,
      updatedAt: run.updated_at,
      summary: run.summary,
      outputAssetId: run.output_asset_id,
      previewUrl: run.preview_url,
      errorMessage: run.error_message,
      inputPayload: parseJson(run.input_payload_json, {}),
      inputSettings: parseJson(run.input_settings_json, {}),
      providerRequestId: run.provider_request_id,
      providerStatus: run.provider_status,
      estimatedCostUsd: run.estimated_cost_usd,
      actualCostUsd: run.actual_cost_usd,
      estimatedCredits: run.estimated_credits,
      actualCredits: run.actual_credits,
      usageSnapshot: parseJson(run.usage_snapshot_json, {}),
      outputText: run.output_text,
      pricingSnapshot: parseJson(run.pricing_snapshot_json, {}),
      dispatchAttemptCount: run.dispatch_attempt_count,
      dispatchLeaseExpiresAt: run.dispatch_lease_expires_at,
      canCancel: run.can_cancel === 1,
      draftSnapshot: parseJson(run.draft_snapshot_json, {
        ...createDraft(getStudioModelById(run.model_id)),
        referenceCount: 0,
        startFrameCount: 0,
        endFrameCount: 0,
      }),
    })),
    selectedModelId: preferences.selected_model_id,
  });

  return {
    revision: installation.current_revision,
    snapshot,
  };
}

function createSeedState() {
  return {
    revision: 1,
    snapshot: createStudioSeedSnapshot("local"),
  };
}

function commitSnapshot(store: LocalStore, snapshot: StudioWorkspaceSnapshot, changedAt = new Date().toISOString()) {
  store.revision += 1;
  store.snapshot = {
    ...snapshot,
    schemaVersion: STUDIO_STATE_SCHEMA_VERSION,
    mode: "local",
    providerSettings: {
      falApiKey: "",
      falLastValidatedAt: snapshot.providerSettings.falLastValidatedAt,
      openaiApiKey: "",
      openaiLastValidatedAt: snapshot.providerSettings.openaiLastValidatedAt,
      anthropicApiKey: "",
      anthropicLastValidatedAt: snapshot.providerSettings.anthropicLastValidatedAt,
      geminiApiKey: "",
      geminiLastValidatedAt: snapshot.providerSettings.geminiLastValidatedAt,
    },
    profile: {
      ...snapshot.profile,
      updatedAt: changedAt,
    },
  };
  persistSnapshot(store.db, store.revision, store.snapshot);
}

async function loadLocalRunInputFiles(store: LocalStore, run: GenerationRun) {
  const inputRows = await listLocalRunInputs(store.db, run.id);
  if (inputRows.length === 0) {
    return [] satisfies StudioFalInputFile[];
  }

  const inputs: StudioFalInputFile[] = [];

  for (const row of inputRows) {
    const directRunFile = row.run_file_id
      ? store.snapshot.runFiles.find((entry) => entry.id === row.run_file_id) ?? null
      : null;
    const libraryItem = row.library_item_id
      ? store.snapshot.libraryItems.find((entry) => entry.id === row.library_item_id) ?? null
      : null;
    const libraryRunFile =
      libraryItem?.runFileId
        ? store.snapshot.runFiles.find((entry) => entry.id === libraryItem.runFileId) ?? null
        : null;
    const sourceRunFile = directRunFile ?? libraryRunFile;

    if (!sourceRunFile?.storagePath) {
      continue;
    }

    let blob: Blob;
    if (sourceRunFile.storageBucket === "local-fs") {
      blob = new Blob([await fsPromises.readFile(getLocalFileAbsolutePath(sourceRunFile.storagePath))], {
        type: sourceRunFile.mimeType ?? undefined,
      });
    } else if (sourceRunFile.storageBucket === "mock-public") {
      blob = new Blob(
        [await fsPromises.readFile(getBundledPublicAssetAbsolutePath(sourceRunFile.storagePath))],
        {
          type: sourceRunFile.mimeType ?? undefined,
        }
      );
    } else if (sourceRunFile.storagePath.startsWith("data:")) {
      blob = new Blob([decodeDataUrl(sourceRunFile.storagePath)], {
        type: sourceRunFile.mimeType ?? undefined,
      });
    } else {
      const sourceUrl = sourceRunFile.storagePath.startsWith("http")
        ? sourceRunFile.storagePath
        : sourceRunFile.storagePath.startsWith("/")
          ? sourceRunFile.storagePath
          : `/${sourceRunFile.storagePath}`;
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error("Could not load a local generation input file.");
      }
      blob = await response.blob();
    }

    inputs.push({
      slot: row.input_role,
      kind:
        (libraryItem?.kind as StudioFalInputFile["kind"] | undefined) ??
        (sourceRunFile.mimeType?.startsWith("video/")
          ? "video"
          : sourceRunFile.mimeType?.startsWith("audio/")
            ? "audio"
            : "image"),
      title: libraryItem?.title ?? sourceRunFile.fileName ?? "Input asset",
      file: blob,
      fileName: sourceRunFile.fileName,
      mimeType: sourceRunFile.mimeType,
    });
  }

  return inputs;
}

async function completeLocalRunFromProviderPayload(params: {
  store: LocalStore;
  run: GenerationRun;
  payload: Record<string, unknown>;
}) {
  const currentRun = getLocalRunById(params.store, params.run.id);
  if (!currentRun) {
    return;
  }

  if (currentRun.deletedAt) {
    params.store.snapshot = await purgeRunsFromLocalSnapshot({
      snapshot: params.store.snapshot,
      runIds: [currentRun.id],
    });
    commitSnapshot(params.store, params.store.snapshot, new Date().toISOString());
    return;
  }

  const model = getStudioModelById(currentRun.modelId);
  const draft = hydrateDraft(currentRun.draftSnapshot, model);
  const resolved = resolveStudioFalCompletedPayload({
    modelId: currentRun.modelId,
    requestMode: currentRun.requestMode,
    draft: toPersistedDraft(draft),
    payload: params.payload,
  });
  const finishedAt = new Date().toISOString();
  const existingItem = findLocalGeneratedItemByRunId(
    params.store.snapshot,
    currentRun.id,
    currentRun.outputAssetId
  );

  if (existingItem) {
    if (currentRun.status === "completed" && currentRun.outputAssetId === existingItem.id) {
      return;
    }

    markLocalRunCompleted({
      store: params.store,
      runId: currentRun.id,
      outputAssetId: existingItem.id,
      finishedAt,
      outputText: resolved.outputText,
      usageSnapshot: resolved.usageSnapshot,
    });
    commitSnapshot(params.store, params.store.snapshot, finishedAt);
    return;
  }

  const outputTitle =
    currentRun.prompt.trim().slice(0, 72) || `${currentRun.modelName} output`;
  const nextItemId = createStudioId("asset");
  let outputRunFile: StudioRunFile | null = null;
  let thumbnailRunFile: StudioRunFile | null = null;

  if (resolved.outputFile) {
    const response = await fetch(resolved.outputFile.url);
    if (!response.ok) {
      throw new Error("Could not download the generated output from Fal.");
    }

    const blob = await response.blob();
    const outputRunFileId = createStudioId("run-file");
    const fileName =
      resolved.outputFile.fileName ??
      `${currentRun.modelId}-${currentRun.id}.${blob.type.split("/").pop() ?? "bin"}`;
    const relativePath = path
      .join(
        "runs",
        currentRun.id,
        "outputs",
        `${outputRunFileId}-${sanitizeStorageFileName(fileName)}`
      )
      .replaceAll(path.sep, "/");
    await fsPromises.mkdir(getLocalRunOutputDirectory(currentRun.id), {
      recursive: true,
    });
    await writeBlobToLocalStorageFile({
      relativePath,
      blob,
    });

    outputRunFile = {
      id: outputRunFileId,
      runId: currentRun.id,
      userId: currentRun.userId,
      fileRole: "output",
      sourceType: "generated",
      storageBucket: "local-fs",
      storagePath: relativePath,
      mimeType:
        resolved.outputFile.mimeType ?? blob.type ?? "application/octet-stream",
      fileName,
      fileSizeBytes: blob.size,
      mediaWidth: resolved.outputFile.mediaWidth,
      mediaHeight: resolved.outputFile.mediaHeight,
      mediaDurationSeconds: resolved.outputFile.mediaDurationSeconds,
      aspectRatioLabel: resolved.outputFile.aspectRatioLabel,
      hasAlpha: resolved.outputFile.hasAlpha,
      metadata: {},
      createdAt: finishedAt,
    };

    if (resolved.outputKind === "audio") {
      const thumbnailRunFileId = createStudioId("run-file");
      const thumbnail = createAudioThumbnailFile({
        itemId: nextItemId,
        title: outputTitle,
        subtitle: currentRun.summary,
        accentSeed: currentRun.id,
        thumbnailRunFileId,
      });

      thumbnailRunFile = {
        id: thumbnailRunFileId,
        runId: currentRun.id,
        userId: currentRun.userId,
        fileRole: "thumbnail",
        sourceType: "generated",
        storageBucket: "local-fs",
        storagePath: thumbnail.relativePath,
        mimeType: "image/svg+xml",
        fileName: `${thumbnailRunFileId}.svg`,
        fileSizeBytes: fs.statSync(thumbnail.absolutePath).size,
        mediaWidth: 1200,
        mediaHeight: 900,
        mediaDurationSeconds: null,
        aspectRatioLabel: "4:3",
        hasAlpha: false,
        metadata: {},
        createdAt: finishedAt,
      };
    }
  }

  const latestRun = getLocalRunById(params.store, currentRun.id);
  if (!latestRun) {
    await removeLocalStoredRunFiles(
      [thumbnailRunFile, outputRunFile].filter(
        (entry): entry is StudioRunFile => Boolean(entry)
      )
    );
    return;
  }

  if (latestRun.deletedAt) {
    await removeLocalStoredRunFiles(
      [thumbnailRunFile, outputRunFile].filter(
        (entry): entry is StudioRunFile => Boolean(entry)
      )
    );
    params.store.snapshot = await purgeRunsFromLocalSnapshot({
      snapshot: params.store.snapshot,
      runIds: [latestRun.id],
    });
    commitSnapshot(params.store, params.store.snapshot, finishedAt);
    return;
  }

  const latestExistingItem = findLocalGeneratedItemByRunId(
    params.store.snapshot,
    latestRun.id,
    latestRun.outputAssetId
  );

  if (latestExistingItem) {
    await removeLocalStoredRunFiles(
      [thumbnailRunFile, outputRunFile].filter(
        (entry): entry is StudioRunFile => Boolean(entry)
      )
    );

    if (latestRun.status === "completed" && latestRun.outputAssetId === latestExistingItem.id) {
      return;
    }

    markLocalRunCompleted({
      store: params.store,
      runId: latestRun.id,
      outputAssetId: latestExistingItem.id,
      finishedAt,
      outputText: resolved.outputText,
      usageSnapshot: resolved.usageSnapshot,
    });
    commitSnapshot(params.store, params.store.snapshot, finishedAt);
    return;
  }

  const nextItem: LibraryItem = {
    id: nextItemId,
    userId: latestRun.userId,
    workspaceId: latestRun.workspaceId,
    runFileId: outputRunFile?.id ?? null,
    sourceRunId: latestRun.id,
    title: outputTitle,
    kind: resolved.outputKind,
    source: "generated",
    role: "generated_output",
    previewUrl: outputRunFile ? buildLocalFileUrl(outputRunFile.id) : null,
    thumbnailUrl: thumbnailRunFile
      ? buildLocalFileUrl(thumbnailRunFile.id)
      : outputRunFile
        ? buildLocalFileUrl(outputRunFile.id)
        : null,
    contentText: resolved.outputText,
    createdAt: finishedAt,
    updatedAt: finishedAt,
    modelId: latestRun.modelId,
    runId: latestRun.id,
    provider: latestRun.provider,
    status: "ready",
    prompt: latestRun.prompt,
    meta: `${latestRun.modelName} • ${latestRun.summary}`,
    mediaWidth: outputRunFile?.mediaWidth ?? null,
    mediaHeight: outputRunFile?.mediaHeight ?? null,
    mediaDurationSeconds: outputRunFile?.mediaDurationSeconds ?? null,
    aspectRatioLabel: outputRunFile?.aspectRatioLabel ?? null,
    hasAlpha: outputRunFile?.hasAlpha ?? false,
    folderId: params.run.folderId,
    storageBucket: outputRunFile?.storageBucket ?? "inline-text",
    storagePath: outputRunFile?.storagePath ?? null,
    thumbnailPath: thumbnailRunFile?.storagePath ?? null,
    fileName: outputRunFile?.fileName ?? (resolved.outputKind === "text" ? `${latestRun.id}.txt` : null),
    mimeType: outputRunFile?.mimeType ?? (resolved.outputKind === "text" ? "text/plain" : null),
    byteSize:
      outputRunFile?.fileSizeBytes ??
      (resolved.outputText ? Buffer.byteLength(resolved.outputText, "utf8") : null),
    metadata: resolved.providerPayload,
    errorMessage: null,
  };

  markLocalRunCompleted({
    store: params.store,
    runId: latestRun.id,
    outputAssetId: nextItem.id,
    finishedAt,
    outputText: resolved.outputText,
    usageSnapshot: resolved.usageSnapshot,
  });

  params.store.snapshot = {
    ...params.store.snapshot,
    libraryItems: [nextItem, ...params.store.snapshot.libraryItems],
    runFiles: [
      ...[thumbnailRunFile, outputRunFile].filter(
        (entry): entry is StudioRunFile => Boolean(entry)
      ),
      ...params.store.snapshot.runFiles,
    ],
  };
  commitSnapshot(params.store, params.store.snapshot, finishedAt);
}

async function failLocalRun(params: {
  store: LocalStore;
  runId: string;
  errorMessage: string;
}) {
  const currentRun = getLocalRunById(params.store, params.runId);
  if (!currentRun) {
    return;
  }

  if (currentRun.deletedAt) {
    params.store.snapshot = await purgeRunsFromLocalSnapshot({
      snapshot: params.store.snapshot,
      runIds: [currentRun.id],
    });
    commitSnapshot(params.store, params.store.snapshot, new Date().toISOString());
    return;
  }

  const finishedAt = new Date().toISOString();
  params.store.snapshot = {
    ...params.store.snapshot,
    generationRuns: params.store.snapshot.generationRuns.map((entry) =>
      entry.id === currentRun.id
        ? {
            ...entry,
            status: "failed",
            providerStatus: "failed",
            completedAt: finishedAt,
            failedAt: finishedAt,
            updatedAt: finishedAt,
            canCancel: false,
            errorMessage: params.errorMessage,
          }
        : entry
    ),
  };
  commitSnapshot(params.store, params.store.snapshot, finishedAt);
}

async function dispatchLocalRun(params: {
  store: LocalStore;
  run: GenerationRun;
  providerSettings: StudioProviderSettings;
}) {
  const model = requireStudioModelById(params.run.modelId);
  const draft = hydrateDraft(params.run.draftSnapshot, model);
  const startedAt = new Date().toISOString();

  params.store.snapshot = {
    ...params.store.snapshot,
    generationRuns: params.store.snapshot.generationRuns.map((entry) =>
      entry.id === params.run.id
        ? {
            ...entry,
            status: "processing",
            startedAt,
            updatedAt: startedAt,
            providerStatus: model.kind === "text" ? "running" : "in_queue",
            dispatchAttemptCount: entry.dispatchAttemptCount + 1,
            canCancel: false,
          }
        : entry
    ),
  };
  commitSnapshot(params.store, params.store.snapshot, startedAt);

  if (model.kind === "text") {
    const providerApiKey = getLocalTextProviderKey({
      modelId: params.run.modelId,
      providerSettings: params.providerSettings,
    });

    if (!providerApiKey) {
      throw new Error(`Add your ${model.providerLabel} API key before generating locally.`);
    }

    const inputs = await loadLocalRunInputFiles(params.store, params.run);
    const result = await generateStudioTextProviderPayload({
      modelId: params.run.modelId,
      prompt: draft.prompt,
      providerApiKey,
      inputs,
    });
    await completeLocalRunFromProviderPayload({
      store: params.store,
      run: {
        ...params.run,
        status: "processing",
        startedAt,
        updatedAt: startedAt,
        providerStatus: "running",
      },
      payload: result.payload,
    });
    return;
  }

  const inputs = await loadLocalRunInputFiles(params.store, params.run);
  const queuedRequest = await submitStudioFalRequest({
    falKey: params.providerSettings.falApiKey,
    modelId: params.run.modelId,
    requestMode: params.run.requestMode,
    draft: toPersistedDraft(draft),
    inputs,
  });

  params.store.snapshot = {
    ...params.store.snapshot,
    generationRuns: params.store.snapshot.generationRuns.map((entry) =>
      entry.id === params.run.id
        ? {
            ...entry,
            providerRequestId: queuedRequest.requestId,
            inputPayload: {
              ...entry.inputPayload,
              provider_endpoint_id: queuedRequest.endpointId,
            },
          }
        : entry
    ),
  };
  commitSnapshot(params.store, params.store.snapshot, new Date().toISOString());
}

async function syncLocalQueue(store: LocalStore, providerSettings: StudioProviderSettings) {
  const falKey = providerSettings.falApiKey.trim();

  if (falKey) {
    const processingRuns = store.snapshot.generationRuns.filter(
      (run) => run.status === "processing"
    );

    for (const run of processingRuns) {
      const model = findStudioModelById(run.modelId);
      if (!model) {
        await failLocalRun({
          store,
          runId: run.id,
          errorMessage: "This model is no longer available and the run was reset.",
        });
        continue;
      }

      if (model.kind === "text" && model.provider !== "fal") {
        const startedAt = run.startedAt ? Date.parse(run.startedAt) : Date.now();
        if (Date.now() - startedAt > 120_000) {
          await failLocalRun({
            store,
            runId: run.id,
            errorMessage:
              "The direct text generation did not finish and had to be reset.",
          });
        }
        continue;
      }

      const providerRequestId = run.providerRequestId?.trim() || null;
      const providerEndpointId = String(
        run.inputPayload.provider_endpoint_id ?? ""
      ).trim();

      if (!providerRequestId || !providerEndpointId) {
        await failLocalRun({
          store,
          runId: run.id,
          errorMessage:
            "The queued provider request could not be recovered for this local generation.",
        });
        continue;
      }

      try {
        const queueStatus = await getStudioFalQueueStatus({
          falKey,
          endpointId: providerEndpointId,
          requestId: providerRequestId,
        });
        const normalizedStatus = String(queueStatus.status ?? "").toLowerCase();

        if (normalizedStatus === "completed") {
          const result = await getStudioFalQueuedResult({
            falKey,
            endpointId: providerEndpointId,
            requestId: providerRequestId,
          });
          await completeLocalRunFromProviderPayload({
            store,
            run,
            payload:
              result && typeof result.data === "object" && result.data !== null
                ? (result.data as Record<string, unknown>)
                : {},
          });
          continue;
        }

        const nextProviderStatus =
          normalizedStatus === "in_progress" ? "running" : "in_queue";
        if (run.providerStatus !== nextProviderStatus) {
          store.snapshot = {
            ...store.snapshot,
            generationRuns: store.snapshot.generationRuns.map((entry) =>
              entry.id === run.id
                ? {
                    ...entry,
                    providerStatus: nextProviderStatus,
                    updatedAt: new Date().toISOString(),
                  }
                : entry
            ),
          };
          commitSnapshot(store, store.snapshot);
        }
      } catch {
        // Leave the run in processing; polling can recover on a later request.
      }
    }
  }

  const concurrencyLimit = getStudioConcurrencyLimitForMode(
    "local",
    store.snapshot.queueSettings
  );
  const processingCount = store.snapshot.generationRuns.filter(
    (run) => run.status === "processing"
  ).length;
  const availableDispatchSlots = Math.max(0, concurrencyLimit - processingCount);

  if (availableDispatchSlots <= 0) {
    return;
  }

  const queuedRuns = store.snapshot.generationRuns
    .filter((run) => run.status === "queued" || run.status === "pending")
    .sort((left, right) => Date.parse(left.queueEnteredAt) - Date.parse(right.queueEnteredAt));

  for (const run of queuedRuns.slice(0, availableDispatchSlots)) {
    try {
      await dispatchLocalRun({
        store,
        run,
        providerSettings,
      });
    } catch (error) {
      await failLocalRun({
        store,
        runId: run.id,
        errorMessage:
          error instanceof Error
            ? error.message
            : "The local generation could not be submitted.",
      });
    }
  }
}

export function ensureLocalQueueWorker(
  providerSettings: StudioProviderSettings,
  delayMs = 0
) {
  const worker = getLocalQueueWorkerState();
  worker.latestProviderSettings = {
    ...providerSettings,
  };

  const store = getStore();
  if (!hasPendingLocalQueueWork(store)) {
    if (worker.timer) {
      clearTimeout(worker.timer);
      worker.timer = null;
    }
    return;
  }

  if (worker.running || worker.timer) {
    return;
  }

  worker.timer = setTimeout(async () => {
    worker.timer = null;
    if (worker.running) {
      return;
    }

    worker.running = true;
    try {
      await syncLocalQueue(getStore(), worker.latestProviderSettings);
    } catch {
      // Keep the worker alive; a later pass can recover.
    } finally {
      worker.running = false;
    }

    if (hasPendingLocalQueueWork(getStore())) {
      ensureLocalQueueWorker(worker.latestProviderSettings, LOCAL_SYNC_INTERVAL_MS);
    }
  }, Math.max(0, delayMs));
}

function recoverLocalQueue(
  snapshot: StudioWorkspaceSnapshot
): StudioWorkspaceSnapshot {
  return {
    ...snapshot,
    generationRuns: snapshot.generationRuns.map((run) =>
      run.status === "processing"
        ? {
            ...run,
            status: "queued",
            startedAt: null,
            providerStatus: "queued",
            canCancel: true,
          }
        : run
    ),
  };
}

function initializeStore(): LocalStore {
  ensureLocalDataDirectories();
  const db = new Database(getLocalDatabasePath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.pragma("temp_store = MEMORY");
  db.pragma("busy_timeout = 5000");
  createTables(db);

  const fromDisk = readSnapshotFromDb(db);
  const boot = fromDisk ?? createSeedState();
  const recoveredSnapshot = recoverLocalQueue(boot.snapshot);

  persistSnapshot(db, boot.revision, recoveredSnapshot);

  const store: LocalStore = {
    db,
    revision: boot.revision,
    snapshot: recoveredSnapshot,
  };
  return store;
}

function getStore() {
  const globalStore = globalThis as typeof globalThis & {
    [STORE_KEY]?: LocalStore;
  };

  if (!globalStore[STORE_KEY]) {
    globalStore[STORE_KEY] = initializeStore();
  }

  return globalStore[STORE_KEY]!;
}

function cloneLocalResponse(store: LocalStore) {
  return {
    revision: store.revision,
    snapshot: cloneClientSnapshot(store.snapshot),
  };
}

function validateUploadManifest(files: File[], manifest: LocalStudioUploadManifestEntry[]) {
  if (files.length === 0 || files.length !== manifest.length) {
    throw new Error("Upload metadata did not match the provided files.");
  }

  return files.map((file, index) => {
    const metadata = manifest[index];
    const inferredKind = getStudioUploadedMediaKind({
      fileName: file.name,
      mimeType: file.type,
    });

    if (!metadata || !inferredKind || inferredKind !== metadata.kind) {
      throw new Error(`Unsupported upload: ${file.name}`);
    }

    return {
      file,
      metadata: {
        ...metadata,
        hasAlpha:
          metadata.kind === "image"
            ? metadata.hasAlpha || studioUploadSupportsAlpha(file.type)
            : false,
      },
    };
  });
}

export async function getLocalBootstrapPayload(providerSettings: StudioProviderSettings) {
  const store = getStore();
  ensureLocalQueueWorker(providerSettings);
  return {
    kind: "bootstrap" as const,
    revision: store.revision,
    syncIntervalMs: LOCAL_SYNC_INTERVAL_MS,
    snapshot: cloneClientSnapshot(store.snapshot),
  };
}

export async function getLocalSyncPayload(
  sinceRevision: number | null,
  providerSettings: StudioProviderSettings
) {
  const store = getStore();
  ensureLocalQueueWorker(providerSettings);
  if (sinceRevision !== null && sinceRevision >= store.revision) {
    return {
      kind: "noop" as const,
      revision: store.revision,
      syncIntervalMs: LOCAL_SYNC_INTERVAL_MS,
    };
  }

  return {
    kind: sinceRevision === null ? ("bootstrap" as const) : ("refresh" as const),
    revision: store.revision,
    syncIntervalMs: LOCAL_SYNC_INTERVAL_MS,
    snapshot: cloneClientSnapshot(store.snapshot),
  };
}

function collectLocalRunFilesForRemovedItems(params: {
  snapshot: StudioWorkspaceSnapshot;
  items: LibraryItem[];
  runIds?: string[];
}) {
  const runIdSet = new Set(params.runIds ?? []);
  const runFileIdSet = new Set(
    params.items
      .map((item) => item.runFileId)
      .filter((value): value is string => Boolean(value))
  );
  const thumbnailPathSet = new Set(
    params.items
      .map((item) => item.thumbnailPath)
      .filter((value): value is string => Boolean(value))
  );

  return params.snapshot.runFiles.filter((runFile) => {
    if (runFile.runId && runIdSet.has(runFile.runId)) {
      return true;
    }

    if (runFileIdSet.has(runFile.id)) {
      return true;
    }

    return thumbnailPathSet.has(runFile.storagePath);
  });
}

async function removeLocalStoredRunFiles(runFiles: StudioRunFile[]) {
  await Promise.all(
    runFiles.map(async (runFile) => {
      if (runFile.storageBucket !== "local-fs") {
        return;
      }

      await fsPromises
        .unlink(getLocalFileAbsolutePath(runFile.storagePath))
        .catch(() => undefined);
    })
  );
}

function getLocalRunById(store: LocalStore, runId: string) {
  return store.snapshot.generationRuns.find((run) => run.id === runId) ?? null;
}

function findLocalGeneratedItemByRunId(
  snapshot: StudioWorkspaceSnapshot,
  runId: string,
  preferredItemId: string | null
) {
  if (preferredItemId) {
    const preferredItem =
      snapshot.libraryItems.find((item) => item.id === preferredItemId) ?? null;

    if (preferredItem?.source === "generated") {
      return preferredItem;
    }
  }

  return (
    snapshot.libraryItems.find(
      (item) =>
        item.source === "generated" &&
        (item.sourceRunId === runId || item.runId === runId)
    ) ?? null
  );
}

function markLocalRunCompleted(params: {
  store: LocalStore;
  runId: string;
  outputAssetId: string;
  finishedAt: string;
  outputText: string | null;
  usageSnapshot: Record<string, unknown>;
}) {
  const usageCost =
    typeof params.usageSnapshot.cost === "number" ? params.usageSnapshot.cost : null;

  params.store.snapshot = {
    ...params.store.snapshot,
    generationRuns: params.store.snapshot.generationRuns.map((entry) =>
      entry.id === params.runId
        ? ({
            ...entry,
            status: "completed",
            providerStatus: "completed",
            outputAssetId: params.outputAssetId,
            actualCostUsd: usageCost ?? entry.estimatedCostUsd,
            actualCredits: entry.estimatedCredits,
            completedAt: params.finishedAt,
            updatedAt: params.finishedAt,
            canCancel: false,
            outputText: params.outputText,
            usageSnapshot: params.usageSnapshot,
          } satisfies GenerationRun)
        : entry
    ),
  };
}

async function purgeRunsFromLocalSnapshot(params: {
  snapshot: StudioWorkspaceSnapshot;
  runIds: string[];
}) {
  const runIdSet = new Set(params.runIds);
  const targetRuns = params.snapshot.generationRuns.filter((run) => runIdSet.has(run.id));

  if (targetRuns.length === 0) {
    return params.snapshot;
  }

  const outputAssetIdSet = new Set(
    targetRuns
      .map((run) => run.outputAssetId)
      .filter((value): value is string => Boolean(value))
  );
  const generatedItems = params.snapshot.libraryItems.filter(
    (item) =>
      outputAssetIdSet.has(item.id) ||
      (item.sourceRunId ? runIdSet.has(item.sourceRunId) : false) ||
      (item.runId ? runIdSet.has(item.runId) : false)
  );
  const deletedRunFiles = collectLocalRunFilesForRemovedItems({
    snapshot: params.snapshot,
    items: generatedItems,
    runIds: params.runIds,
  });
  const deletedItemIdSet = new Set(generatedItems.map((item) => item.id));
  const deletedRunFileIdSet = new Set(deletedRunFiles.map((runFile) => runFile.id));

  const nextSnapshot = {
    ...params.snapshot,
    generationRuns: params.snapshot.generationRuns.filter((run) => !runIdSet.has(run.id)),
    libraryItems: params.snapshot.libraryItems.filter(
      (item) => !deletedItemIdSet.has(item.id)
    ),
    runFiles: params.snapshot.runFiles.filter(
      (runFile) => !deletedRunFileIdSet.has(runFile.id)
    ),
  };

  await removeLocalStoredRunFiles(deletedRunFiles);
  return nextSnapshot;
}

export async function mutateLocalSnapshot(
  mutation: LocalStudioMutation,
  providerSettings: StudioProviderSettings
) {
  const store = getStore();
  const snapshot = cloneSnapshot(store.snapshot);

  switch (mutation.action) {
    case "save_ui_state": {
      snapshot.draftsByModelId = mutation.draftsByModelId;
      snapshot.selectedModelId = resolveConfiguredStudioModelId({
        currentModelId: mutation.selectedModelId,
        enabledModelIds: snapshot.modelConfiguration.enabledModelIds,
      });
      snapshot.gallerySizeLevel = mutation.gallerySizeLevel;
      snapshot.providerSettings = {
        falApiKey: "",
        falLastValidatedAt: mutation.lastValidatedAt,
        openaiApiKey: "",
        openaiLastValidatedAt: null,
        anthropicApiKey: "",
        anthropicLastValidatedAt: null,
        geminiApiKey: "",
        geminiLastValidatedAt: null,
      };
      commitSnapshot(store, snapshot);
      return cloneLocalResponse(store);
    }
    case "set_enabled_models": {
      snapshot.modelConfiguration = {
        enabledModelIds: normalizeStudioEnabledModelIds(mutation.enabledModelIds),
        updatedAt: new Date().toISOString(),
      };
      break;
    }
    case "create_folder": {
      const createdAt = new Date().toISOString();
      const workspaceId = snapshot.folders[0]?.workspaceId ?? "workspace-local";
      const nextFolder: StudioFolder = {
        id: createStudioId("folder"),
        userId: snapshot.profile.id,
        workspaceId,
        name: mutation.name.trim(),
        createdAt,
        updatedAt: createdAt,
        sortOrder: 0,
      };
      snapshot.folders = [
        nextFolder,
        ...snapshot.folders.map((folder, index) => ({
          ...folder,
          sortOrder: index + 1,
        })),
      ];
      break;
    }
    case "rename_folder": {
      const updatedAt = new Date().toISOString();
      snapshot.folders = snapshot.folders.map((folder) =>
        folder.id === mutation.folderId
          ? { ...folder, name: mutation.name.trim(), updatedAt }
          : folder
      );
      break;
    }
    case "delete_folder": {
      const updatedAt = new Date().toISOString();
      snapshot.folders = snapshot.folders
        .filter((folder) => folder.id !== mutation.folderId)
        .map((folder, index) => ({ ...folder, sortOrder: index }));
      snapshot.libraryItems = snapshot.libraryItems.map((item) =>
        item.folderId === mutation.folderId
          ? { ...item, folderId: null, updatedAt }
          : item
      );
      snapshot.generationRuns = snapshot.generationRuns.map((run) =>
        run.folderId === mutation.folderId ? { ...run, folderId: null } : run
      );
      break;
    }
    case "reorder_folders": {
      const updatedAt = new Date().toISOString();
      const folderMap = new Map(snapshot.folders.map((folder) => [folder.id, folder]));
      const ordered = mutation.orderedFolderIds
        .map((folderId) => folderMap.get(folderId))
        .filter((folder): folder is StudioFolder => Boolean(folder));
      const remaining = snapshot.folders.filter(
        (folder) => !mutation.orderedFolderIds.includes(folder.id)
      );
      snapshot.folders = [...ordered, ...remaining].map((folder, index) => ({
        ...folder,
        sortOrder: index,
        updatedAt,
      }));
      break;
    }
    case "move_items": {
      const updatedAt = new Date().toISOString();
      const itemIdSet = new Set(mutation.itemIds);
      snapshot.libraryItems = snapshot.libraryItems.map((item) =>
        itemIdSet.has(item.id)
          ? {
              ...item,
              folderId: mutation.folderId,
              updatedAt,
            }
          : item
      );
      break;
    }
    case "delete_items": {
      const itemIdSet = new Set(mutation.itemIds);
      const deletedItems = snapshot.libraryItems.filter((item) => itemIdSet.has(item.id));
      const deletedRunFiles = collectLocalRunFilesForRemovedItems({
        snapshot,
        items: deletedItems,
      });
      const deletedRunFileIdSet = new Set(deletedRunFiles.map((runFile) => runFile.id));

      snapshot.libraryItems = snapshot.libraryItems.filter((item) => !itemIdSet.has(item.id));
      snapshot.runFiles = snapshot.runFiles.filter(
        (runFile) => !deletedRunFileIdSet.has(runFile.id)
      );
      snapshot.generationRuns = snapshot.generationRuns.map((run) =>
        run.outputAssetId && itemIdSet.has(run.outputAssetId)
          ? { ...run, outputAssetId: null }
          : run
      );

      await removeLocalStoredRunFiles(deletedRunFiles);
      break;
    }
    case "delete_runs": {
      const runIdSet = new Set(mutation.runIds);
      const targetRuns = snapshot.generationRuns.filter((run) => runIdSet.has(run.id));
      const deletedAt = new Date().toISOString();
      const processingRunIds = targetRuns
        .filter((run) => run.status === "processing")
        .map((run) => run.id);
      const hardDeleteRunIds = targetRuns
        .filter((run) => run.status !== "processing")
        .map((run) => run.id);

      if (processingRunIds.length > 0) {
        const processingRunIdSet = new Set(processingRunIds);
        snapshot.generationRuns = snapshot.generationRuns.map((run) =>
          processingRunIdSet.has(run.id)
            ? {
                ...run,
                deletedAt,
                updatedAt: deletedAt,
                canCancel: false,
              }
            : run
        );
      }

      if (hardDeleteRunIds.length > 0) {
        Object.assign(
          snapshot,
          await purgeRunsFromLocalSnapshot({
            snapshot,
            runIds: hardDeleteRunIds,
          })
        );
      }
      break;
    }
    case "update_text_item": {
      const updatedAt = new Date().toISOString();
      snapshot.libraryItems = snapshot.libraryItems.map((item) => {
        if (item.id !== mutation.itemId || item.kind !== "text") {
          return item;
        }
        const nextContentText = mutation.contentText?.trim() ?? item.contentText ?? "";
        return {
          ...item,
          title: mutation.title?.trim() || item.title,
          contentText: nextContentText,
          prompt: item.role === "text_note" ? nextContentText : item.prompt,
          updatedAt,
        };
      });
      break;
    }
    case "create_text_item": {
      assertLocalFolderExists(snapshot, mutation.folderId);
      const createdAt = new Date().toISOString();
      const body = mutation.body.trim();
      snapshot.libraryItems = [
        {
          id: createStudioId("asset"),
          userId: snapshot.profile.id,
          workspaceId: snapshot.folders[0]?.workspaceId ?? "workspace-local",
          runFileId: null,
          sourceRunId: null,
          title: mutation.title.trim() || body.slice(0, 36) || "Text note",
          kind: "text",
          source: "uploaded",
          role: "text_note",
          previewUrl: null,
          thumbnailUrl: null,
          contentText: body,
          createdAt,
          updatedAt: createdAt,
          modelId: null,
          runId: null,
          provider: "fal",
          status: "ready",
          prompt: body,
          meta: "Text note",
          mediaWidth: null,
          mediaHeight: null,
          mediaDurationSeconds: null,
          aspectRatioLabel: null,
          hasAlpha: false,
          folderId: mutation.folderId,
          storageBucket: "inline-text",
          storagePath: null,
          thumbnailPath: null,
          fileName: `${createStudioId("text")}.txt`,
          mimeType: "text/plain",
          byteSize: body.length,
          metadata: {},
          errorMessage: null,
        },
        ...snapshot.libraryItems,
      ];
      break;
    }
    case "generate": {
      throw new Error(
        "Local generation must use the dedicated local generate endpoint."
      );
    }
    case "cancel_run": {
      const cancelledAt = new Date().toISOString();
      snapshot.generationRuns = snapshot.generationRuns.map((run) =>
        run.id === mutation.runId &&
        (run.status === "queued" || run.status === "pending")
          ? {
              ...run,
              status: "cancelled",
              cancelledAt,
              completedAt: cancelledAt,
              updatedAt: cancelledAt,
              providerStatus: "cancelled",
              canCancel: false,
            }
          : run
      );
      break;
    }
  }

  commitSnapshot(store, snapshot);
  ensureLocalQueueWorker(providerSettings);
  return cloneLocalResponse(store);
}

export async function queueLocalGeneration(params: {
  providerSettings: StudioProviderSettings;
  modelId: string;
  folderId: string | null;
  draft: PersistedStudioDraft;
  inputs: LocalStudioGenerateInputDescriptor[];
  uploadedFiles: Map<string, File>;
  clientRequestId?: string | null;
}) {
  const store = getStore();
  const snapshot = cloneSnapshot(store.snapshot);
  const model = requireStudioModelById(params.modelId);
  const enabledModelIds = normalizeStudioEnabledModelIds(
    snapshot.modelConfiguration.enabledModelIds
  );

  if (!enabledModelIds.includes(model.id)) {
    throw new Error("That model is disabled for this workspace.");
  }

  const activeJobCount = snapshot.generationRuns.filter(
    (run) => run.status === "queued" || run.status === "pending" || run.status === "processing"
  ).length;
  if (activeJobCount >= snapshot.queueSettings.maxActiveJobsPerUser) {
    throw new Error(
      "limit of 100 concurrent queues/ generations reached, please wait for your generations to finish before continuing."
    );
  }

  const persistedDraft = {
    ...toPersistedDraft(createDraft(model)),
    ...params.draft,
  };
  const referencedAssetKinds = new Map(
    snapshot.libraryItems
      .filter((item) =>
        params.inputs.some((input) => input.originAssetId === item.id)
      )
      .map((item) => [item.id, item.kind] as const)
  );
  validateStudioGenerationRequest({
    modelId: model.id,
    draft: persistedDraft,
    inputs: params.inputs,
    referencedAssetKinds,
  });
  const hydratedDraft = hydrateDraft(persistedDraft, model);
  if (!canGenerateWithDraft(model, hydratedDraft)) {
    throw new Error("This draft is missing required inputs.");
  }

  const pricingQuote = quoteStudioDraftPricing(model, persistedDraft);
  const createdAt = new Date().toISOString();
  const runId = createStudioId("run");
  const referenceCount = params.inputs.filter((entry) => entry.slot === "reference").length;
  const startFrameCount = params.inputs.filter((entry) => entry.slot === "start_frame").length;
  const endFrameCount = params.inputs.filter((entry) => entry.slot === "end_frame").length;
  const nextRun: GenerationRun = {
    id: runId,
    userId: snapshot.profile.id,
    workspaceId: snapshot.folders[0]?.workspaceId ?? "workspace-local",
    folderId: null,
    modelId: model.id,
    modelName: model.name,
    kind: model.kind,
    provider: model.provider,
    requestMode: resolveStudioGenerationRequestMode(model, hydratedDraft),
    status: "queued",
    prompt: persistedDraft.prompt,
    createdAt,
    queueEnteredAt: createdAt,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    updatedAt: createdAt,
    summary: createGenerationRunSummary(model, hydratedDraft),
    outputAssetId: null,
    previewUrl: createGenerationRunPreviewUrl(model, hydratedDraft),
    errorMessage: null,
    inputPayload: {
      prompt: persistedDraft.prompt,
      negative_prompt: persistedDraft.negativePrompt,
      reference_count: referenceCount,
      start_frame_count: startFrameCount,
      end_frame_count: endFrameCount,
      video_input_mode: persistedDraft.videoInputMode,
      request_mode: resolveStudioGenerationRequestMode(model, hydratedDraft),
    },
    inputSettings: {
      video_input_mode: persistedDraft.videoInputMode,
      aspect_ratio: persistedDraft.aspectRatio,
      resolution: persistedDraft.resolution,
      output_format: persistedDraft.outputFormat,
      duration_seconds: persistedDraft.durationSeconds,
      include_audio: persistedDraft.includeAudio,
      image_count: persistedDraft.imageCount,
      tone: persistedDraft.tone,
      max_tokens: persistedDraft.maxTokens,
      temperature: persistedDraft.temperature,
      voice: persistedDraft.voice,
      language: persistedDraft.language,
      speaking_rate: persistedDraft.speakingRate,
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
  };

  const nextRunFiles: StudioRunFile[] = [];
  const inputRows: GenerationRunInputRow[] = [];
  const createdInputStoragePaths: string[] = [];

  try {
    for (const [position, input] of params.inputs.entries()) {
      let runFileId: string | null = null;

      if (!input.originAssetId && input.uploadField) {
        const uploadedFile = params.uploadedFiles.get(input.uploadField);
        if (!uploadedFile) {
          throw new Error("A local generation input file was missing.");
        }

        runFileId = createStudioId("run-file");
        const extension = getFileExtension(uploadedFile.name) || ".bin";
        const relativePath = path
          .join("runs", runId, "inputs", `${runFileId}${extension}`)
          .replaceAll(path.sep, "/");
        await fsPromises.mkdir(getLocalRunInputDirectory(runId), { recursive: true });
        await fsPromises.writeFile(
          getLocalFileAbsolutePath(relativePath),
          Buffer.from(await uploadedFile.arrayBuffer())
        );
        createdInputStoragePaths.push(relativePath);

        nextRunFiles.push({
          id: runFileId,
          runId,
          userId: snapshot.profile.id,
          fileRole: "input",
          sourceType: "uploaded",
          storageBucket: "local-fs",
          storagePath: relativePath,
          mimeType: uploadedFile.type || input.mimeType || "application/octet-stream",
          fileName: uploadedFile.name,
          fileSizeBytes: uploadedFile.size,
          mediaWidth: null,
          mediaHeight: null,
          mediaDurationSeconds: null,
          aspectRatioLabel: null,
          hasAlpha: false,
          metadata: {
            input_slot: input.slot,
            source: input.source,
          },
          createdAt,
        });
      }

      inputRows.push({
        id: createStudioId("run-input"),
        run_id: runId,
        input_role: input.slot,
        position,
        library_item_id: input.originAssetId,
        run_file_id: runFileId,
        created_at: createdAt,
      });
    }

    const insertInputRow = store.db.prepare(
      `
        insert into generation_run_inputs (
          id, run_id, input_role, position, library_item_id, run_file_id, created_at
        ) values (
          @id, @run_id, @input_role, @position, @library_item_id, @run_file_id, @created_at
        )
      `
    );
    const transaction = store.db.transaction((rows: GenerationRunInputRow[]) => {
      for (const row of rows) {
        insertInputRow.run(row);
      }
    });
    transaction(inputRows);

    snapshot.generationRuns = [nextRun, ...snapshot.generationRuns];
    snapshot.runFiles = [...nextRunFiles, ...snapshot.runFiles];
    commitSnapshot(store, snapshot, createdAt);
  } catch (error) {
    await Promise.all(
      createdInputStoragePaths.map((relativePath) =>
        fsPromises.unlink(getLocalFileAbsolutePath(relativePath)).catch(() => undefined)
      )
    );
    throw error;
  }

  ensureLocalQueueWorker(params.providerSettings);
  return {
    kind: "queued",
    clientRequestId: params.clientRequestId?.trim() || null,
    revision: store.revision,
    run: nextRun,
  } satisfies LocalStudioGenerateResponse;
}

export async function uploadLocalFiles(params: {
  files: File[];
  folderId: string | null;
  manifest: LocalStudioUploadManifestEntry[];
}) {
  const store = getStore();
  const entries = validateUploadManifest(params.files, params.manifest);
  const snapshot = cloneSnapshot(store.snapshot);
  assertLocalFolderExists(snapshot, params.folderId);
  const createdAt = new Date().toISOString();

  for (const entry of entries) {
    const { file, metadata } = entry;
    const itemId = createStudioId("asset");
    const sourceRunFileId = createStudioId("run-file");
    const fileExtension = getFileExtension(file.name) || ".bin";
    const sourceRelativePath = path
      .join("items", itemId, "source", `${sourceRunFileId}${fileExtension}`)
      .replaceAll(path.sep, "/");
    const sourceAbsolutePath = path.join(getLocalStorageRoot(), sourceRelativePath);
    ensureParentDirectory(sourceAbsolutePath);
    await fsPromises.mkdir(getLocalItemSourceDirectory(itemId), { recursive: true });
    await fsPromises.writeFile(sourceAbsolutePath, Buffer.from(await file.arrayBuffer()));

    let thumbnailRunFile: StudioRunFile | null = null;
    let thumbnailPath: string | null = null;
    let thumbnailUrl: string | null = null;

    if (metadata.kind === "audio") {
      const thumbnailRunFileId = createStudioId("run-file");
      await fsPromises.mkdir(getLocalItemThumbnailDirectory(itemId), { recursive: true });
      const thumbnailFile = createAudioThumbnailFile({
        itemId,
        title: file.name,
        subtitle: `${(file.size / 1024 / 1024).toFixed(1)} MB audio upload`,
        accentSeed: file.name,
        thumbnailRunFileId,
      });

      thumbnailRunFile = {
        id: thumbnailRunFileId,
        runId: null,
        userId: snapshot.profile.id,
        fileRole: "thumbnail",
        sourceType: "uploaded",
        storageBucket: "local-fs",
        storagePath: thumbnailFile.relativePath,
        mimeType: "image/svg+xml",
        fileName: `${thumbnailRunFileId}.svg`,
        fileSizeBytes: fs.statSync(thumbnailFile.absolutePath).size,
        mediaWidth: 1200,
        mediaHeight: 900,
        mediaDurationSeconds: null,
        aspectRatioLabel: "4:3",
        hasAlpha: false,
        metadata: {},
        createdAt,
      };
      thumbnailPath = thumbnailRunFile.id;
      thumbnailUrl = buildLocalFileUrl(thumbnailRunFile.id);
    }

    const sourceRunFile: StudioRunFile = {
      id: sourceRunFileId,
      runId: null,
      userId: snapshot.profile.id,
      fileRole: "input",
      sourceType: "uploaded",
      storageBucket: "local-fs",
      storagePath: sourceRelativePath,
      mimeType: file.type || "application/octet-stream",
      fileName: file.name,
      fileSizeBytes: file.size,
      mediaWidth: metadata.mediaWidth,
      mediaHeight: metadata.mediaHeight,
      mediaDurationSeconds: metadata.mediaDurationSeconds,
      aspectRatioLabel: metadata.aspectRatioLabel,
      hasAlpha: metadata.hasAlpha,
      metadata: {},
      createdAt,
    };

    const previewUrl = buildLocalFileUrl(sourceRunFile.id);
    const item: LibraryItem = {
      id: itemId,
      userId: snapshot.profile.id,
      workspaceId: snapshot.folders[0]?.workspaceId ?? "workspace-local",
      runFileId: sourceRunFile.id,
      sourceRunId: null,
      title: file.name,
      kind: metadata.kind,
      source: "uploaded",
      role: "uploaded_source",
      previewUrl,
      thumbnailUrl: thumbnailUrl ?? previewUrl,
      contentText: null,
      createdAt,
      updatedAt: createdAt,
      modelId: null,
      runId: null,
      provider: "fal",
      status: "ready",
      prompt: "",
      meta:
        metadata.kind === "audio"
          ? `${file.type || "Audio"} • ${(file.size / 1024 / 1024).toFixed(1)} MB`
          : `${file.type || "File"} • ${(file.size / 1024 / 1024).toFixed(1)} MB`,
      mediaWidth: metadata.mediaWidth,
      mediaHeight: metadata.mediaHeight,
      mediaDurationSeconds: metadata.mediaDurationSeconds,
      aspectRatioLabel: metadata.aspectRatioLabel,
      hasAlpha: metadata.hasAlpha,
      folderId: params.folderId,
      storageBucket: "local-fs",
      storagePath: sourceRelativePath,
      thumbnailPath,
      fileName: file.name,
      mimeType: file.type || null,
      byteSize: file.size,
      metadata: {},
      errorMessage: null,
    };

    snapshot.runFiles.unshift(sourceRunFile);
    if (thumbnailRunFile) {
      snapshot.runFiles.unshift(thumbnailRunFile);
    }
    snapshot.libraryItems.unshift(item);
  }

  commitSnapshot(store, snapshot, createdAt);
  return cloneLocalResponse(store);
}

export function getLocalFile(fileId: string): LocalFileRecord | null {
  const store = getStore();
  const runFile = store.snapshot.runFiles.find((entry) => entry.id === fileId);
  if (!runFile || runFile.storageBucket !== "local-fs") {
    return null;
  }

  return {
    absolutePath: getLocalFileAbsolutePath(runFile.storagePath),
    fileName: runFile.fileName,
    mimeType: runFile.mimeType,
  };
}
