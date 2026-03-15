"use client";

import type { StudioProviderSettings } from "./types";

const STORAGE_KEYS = {
  providerSettings: "tryplayground.studio.providerSettings",
} as const;

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

export function loadStoredProviderSettings(): StudioProviderSettings | null {
  const value = readJson<Partial<StudioProviderSettings>>(
    getSessionStorage(),
    STORAGE_KEYS.providerSettings
  );
  if (!value || typeof value !== "object") {
    return null;
  }

  const falApiKey = typeof value.falApiKey === "string" ? value.falApiKey.trim() : "";
  const openaiApiKey = typeof value.openaiApiKey === "string" ? value.openaiApiKey.trim() : "";
  const anthropicApiKey =
    typeof value.anthropicApiKey === "string" ? value.anthropicApiKey.trim() : "";
  const geminiApiKey = typeof value.geminiApiKey === "string" ? value.geminiApiKey.trim() : "";

  if (!falApiKey && !openaiApiKey && !anthropicApiKey && !geminiApiKey) {
    return null;
  }

  return {
    falApiKey,
    falLastValidatedAt:
      typeof value.falLastValidatedAt === "string"
        ? value.falLastValidatedAt
        : null,
    openaiApiKey,
    openaiLastValidatedAt:
      typeof value.openaiLastValidatedAt === "string"
        ? value.openaiLastValidatedAt
        : null,
    anthropicApiKey,
    anthropicLastValidatedAt:
      typeof value.anthropicLastValidatedAt === "string"
        ? value.anthropicLastValidatedAt
        : null,
    geminiApiKey,
    geminiLastValidatedAt:
      typeof value.geminiLastValidatedAt === "string"
        ? value.geminiLastValidatedAt
        : null,
  };
}

export function saveStoredProviderSettings(value: StudioProviderSettings) {
  const falApiKey = (value.falApiKey ?? "").trim();
  const openaiApiKey = (value.openaiApiKey ?? "").trim();
  const anthropicApiKey = (value.anthropicApiKey ?? "").trim();
  const geminiApiKey = (value.geminiApiKey ?? "").trim();

  if (!falApiKey && !openaiApiKey && !anthropicApiKey && !geminiApiKey) {
    removeValue(getSessionStorage(), STORAGE_KEYS.providerSettings);
    return;
  }

  writeJson(getSessionStorage(), STORAGE_KEYS.providerSettings, {
    falApiKey,
    falLastValidatedAt: value.falLastValidatedAt,
    openaiApiKey,
    openaiLastValidatedAt: value.openaiLastValidatedAt,
    anthropicApiKey,
    anthropicLastValidatedAt: value.anthropicLastValidatedAt,
    geminiApiKey,
    geminiLastValidatedAt: value.geminiLastValidatedAt,
  });
}
