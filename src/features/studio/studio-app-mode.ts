"use client";

import { useState } from "react";

export type StudioAppMode = "local" | "hosted";

const APP_MODE_STORAGE_KEY = "vydelabs.dev.appMode";
const DEFAULT_APP_MODE: StudioAppMode =
  process.env.NEXT_PUBLIC_VYDE_APP_MODE === "hosted" ? "hosted" : "local";

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

function saveStoredAppMode(appMode: StudioAppMode) {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
    return;
  }

  try {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, appMode);
  } catch {
    // Ignore storage failures so local development still works in restricted browsers.
  }
}

export function useStudioAppMode() {
  const [appMode, setAppModeState] = useState<StudioAppMode>(
    () => loadStoredAppMode() ?? DEFAULT_APP_MODE
  );
  const canSwitchModes = process.env.NODE_ENV !== "production";

  const setAppMode = (nextMode: StudioAppMode) => {
    setAppModeState(nextMode);
    saveStoredAppMode(nextMode);
  };

  return {
    appMode,
    canSwitchModes,
    setAppMode,
  };
}
