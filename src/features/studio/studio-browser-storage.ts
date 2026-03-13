"use client";

import type { StudioProviderSettings, StudioWorkspaceSnapshot } from "./types";

const STORAGE_KEYS = {
  gridDensity: "tryplayground.studio.gridDensity",
  providerSettings: "tryplayground.studio.providerSettings",
  localWorkspaceSnapshot: "tryplayground.studio.local.workspaceSnapshot",
  hostedWorkspaceSnapshot: "tryplayground.studio.hosted.workspaceSnapshot",
} as const;

const LEGACY_STORAGE_KEYS = {
  providerSettings: "tryplayground.studio.settings",
} as const;

const UPLOADS_DATABASE_NAME = "tryplayground.studio.uploads";
const UPLOADS_STORE_NAME = "uploadedAssets";
const UPLOADS_DATABASE_VERSION = 1;

function getLocalStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

function getSessionStorage() {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

function readJson<T>(storage: Storage | null, key: string): T | null {
  if (typeof window === "undefined" || !storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(key);
    if (!rawValue) return null;
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage | null, key: string, value: unknown) {
  if (typeof window === "undefined" || !storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures so the studio remains usable in restricted browsers.
  }
}

function removeValue(storage: Storage | null, key: string) {
  if (typeof window === "undefined" || !storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage failures so the studio remains usable in restricted browsers.
  }
}

function getSnapshotStorageKey(mode: "local" | "hosted") {
  return mode === "hosted"
    ? STORAGE_KEYS.hostedWorkspaceSnapshot
    : STORAGE_KEYS.localWorkspaceSnapshot;
}

function sanitizeSnapshot(snapshot: StudioWorkspaceSnapshot): StudioWorkspaceSnapshot {
  return {
    ...snapshot,
    providerSettings: {
      falApiKey: "",
      lastValidatedAt: snapshot.providerSettings.lastValidatedAt,
    },
  };
}

export function loadStoredGridDensity() {
  const value = readJson<number>(getLocalStorage(), STORAGE_KEYS.gridDensity);
  return typeof value === "number" && value >= 0 && value <= 6 ? value : null;
}

export function saveStoredGridDensity(value: number) {
  writeJson(getLocalStorage(), STORAGE_KEYS.gridDensity, value);
}

function removeLegacyProviderSettings() {
  removeValue(getLocalStorage(), LEGACY_STORAGE_KEYS.providerSettings);
}

export function loadStoredProviderSettings(): StudioProviderSettings | null {
  removeLegacyProviderSettings();

  const value = readJson<Partial<StudioProviderSettings>>(
    getSessionStorage(),
    STORAGE_KEYS.providerSettings
  );
  if (!value || typeof value.falApiKey !== "string") {
    return null;
  }

  return {
    falApiKey: value.falApiKey.trim(),
    lastValidatedAt:
      typeof value.lastValidatedAt === "string" ? value.lastValidatedAt : null,
  };
}

export function saveStoredProviderSettings(value: StudioProviderSettings) {
  removeLegacyProviderSettings();

  const falApiKey = value.falApiKey.trim();
  if (!falApiKey) {
    removeValue(getSessionStorage(), STORAGE_KEYS.providerSettings);
    return;
  }

  writeJson(getSessionStorage(), STORAGE_KEYS.providerSettings, {
    falApiKey,
    lastValidatedAt: value.lastValidatedAt,
  });
}

export function loadStoredWorkspaceSnapshot(mode: "local" | "hosted") {
  return readJson<StudioWorkspaceSnapshot>(
    getLocalStorage(),
    getSnapshotStorageKey(mode)
  );
}

export function saveStoredWorkspaceSnapshot(
  mode: "local" | "hosted",
  snapshot: StudioWorkspaceSnapshot
) {
  writeJson(
    getLocalStorage(),
    getSnapshotStorageKey(mode),
    sanitizeSnapshot(snapshot)
  );
}

function openUploadsDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || typeof window.indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = window.indexedDB.open(
      UPLOADS_DATABASE_NAME,
      UPLOADS_DATABASE_VERSION
    );

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(UPLOADS_STORE_NAME)) {
        database.createObjectStore(UPLOADS_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function saveUploadedAssetFile(storagePath: string, file: File | Blob) {
  const database = await openUploadsDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(UPLOADS_STORE_NAME, "readwrite");
    transaction.objectStore(UPLOADS_STORE_NAME).put(file, storagePath);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      resolve();
    };
  });
}

export async function loadUploadedAssetFile(storagePath: string) {
  const database = await openUploadsDatabase();
  if (!database) {
    return null;
  }

  return new Promise<Blob | null>((resolve) => {
    const transaction = database.transaction(UPLOADS_STORE_NAME, "readonly");
    const request = transaction.objectStore(UPLOADS_STORE_NAME).get(storagePath);

    request.onsuccess = () => {
      database.close();
      resolve(request.result instanceof Blob ? request.result : null);
    };

    request.onerror = () => {
      database.close();
      resolve(null);
    };
  });
}

export async function deleteUploadedAssetFile(storagePath: string) {
  const database = await openUploadsDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(UPLOADS_STORE_NAME, "readwrite");
    transaction.objectStore(UPLOADS_STORE_NAME).delete(storagePath);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      resolve();
    };
  });
}
