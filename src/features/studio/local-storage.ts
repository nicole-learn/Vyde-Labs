"use client";

import type { LocalProviderSettings } from "./types";

const STORAGE_KEYS = {
  gridDensity: "vydelabs.studio.gridDensity",
  settings: "vydelabs.studio.settings",
} as const;

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) return null;
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures so the studio remains usable in restricted browsers.
  }
}

export function loadStoredGridDensity() {
  const value = readJson<number>(STORAGE_KEYS.gridDensity);
  return typeof value === "number" && value >= 0 && value <= 6 ? value : null;
}

export function saveStoredGridDensity(value: number) {
  writeJson(STORAGE_KEYS.gridDensity, value);
}

export function loadStoredSettings(): LocalProviderSettings | null {
  const value = readJson<Partial<LocalProviderSettings>>(STORAGE_KEYS.settings);
  if (!value || typeof value.falApiKey !== "string") {
    return null;
  }

  return {
    falApiKey: value.falApiKey,
  };
}

export function saveStoredSettings(value: LocalProviderSettings) {
  writeJson(STORAGE_KEYS.settings, value);
}
