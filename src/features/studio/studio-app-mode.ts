"use client";

import { useSyncExternalStore } from "react";

export type StudioAppMode = "local" | "hosted";

const APP_MODE_STORAGE_KEY = "vydelabs.dev.appMode";
const DEFAULT_APP_MODE: StudioAppMode =
  process.env.NEXT_PUBLIC_VYDE_APP_MODE === "hosted" ? "hosted" : "local";
const appModeListeners = new Set<() => void>();

function loadStoredAppMode(): StudioAppMode | null {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(APP_MODE_STORAGE_KEY);
    return storedValue === "hosted" || storedValue === "local"
      ? storedValue
      : null;
  } catch {
    return null;
  }
}

function emitAppModeChange() {
  for (const listener of appModeListeners) {
    listener();
  }
}

function saveStoredAppMode(appMode: StudioAppMode) {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
    return;
  }

  try {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, appMode);
    emitAppModeChange();
  } catch {
    // Ignore storage failures so local development still works in restricted browsers.
  }
}

function subscribeToAppMode(listener: () => void) {
  appModeListeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== APP_MODE_STORAGE_KEY) {
      return;
    }

    listener();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    appModeListeners.delete(listener);

    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

function getAppModeSnapshot() {
  return loadStoredAppMode() ?? DEFAULT_APP_MODE;
}

export function useStudioAppMode() {
  const appMode = useSyncExternalStore(
    subscribeToAppMode,
    getAppModeSnapshot,
    () => DEFAULT_APP_MODE
  );
  const canSwitchModes = process.env.NODE_ENV !== "production";

  const setAppMode = (nextMode: StudioAppMode) => {
    saveStoredAppMode(nextMode);
  };

  return {
    appMode,
    canSwitchModes,
    setAppMode,
  };
}
