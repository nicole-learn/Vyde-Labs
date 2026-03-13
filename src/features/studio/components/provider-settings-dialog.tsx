"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { ModalShell } from "./modal-shell";
import type {
  StudioProviderSaveResult,
  StudioProviderSettings,
} from "../types";

interface ProviderSettingsDialogProps {
  open: boolean;
  initialValues: StudioProviderSettings;
  onClose: () => void;
  onSave: (
    settings: StudioProviderSettings
  ) => Promise<StudioProviderSaveResult> | StudioProviderSaveResult;
}

function ProviderSettingsForm({
  initialValues,
  onSave,
  onClose,
}: Omit<ProviderSettingsDialogProps, "open">) {
  const [falApiKey, setFalApiKey] = useState(initialValues.falApiKey);
  const [revealKey, setRevealKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        const result = await onSave({
          falApiKey,
          lastValidatedAt: initialValues.lastValidatedAt,
        });

        if (!result.ok) {
          setSaving(false);
          setErrorMessage(result.errorMessage ?? "Could not save your Fal API key.");
          return;
        }

        setSaving(false);
        setSuccessMessage("Fal API key connected for this browser session.");
      }}
    >
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-white">
          Fal API key
        </span>
        <div className="flex items-center overflow-hidden rounded-2xl border border-white/10 bg-black/20 transition focus-within:border-primary/55">
          <input
            name="falApiKey"
            type={revealKey ? "text" : "password"}
            value={falApiKey}
            onChange={(event) => {
              setFalApiKey(event.target.value);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Paste your Fal key here"
            className="h-12 min-w-0 flex-1 bg-transparent px-4 text-sm text-white outline-none"
          />
          <button
            type="button"
            onClick={() => setRevealKey((current) => !current)}
            className="mr-2 inline-flex size-9 items-center justify-center rounded-full text-white/56 transition hover:bg-white/5 hover:text-white"
            aria-label={revealKey ? "Hide API key" : "Show API key"}
          >
            {revealKey ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
      </label>

      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/62">
        For now, Vyde Labs only supports Fal AI API keys and models, and stores
        your key only for the current browser session instead of saving it
        permanently. I hope to be able to add other providers and models soon -
        Nicole
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100/90">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary-foreground">
          {successMessage}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </form>
  );
}

export function ProviderSettingsDialog({
  open,
  initialValues,
  onClose,
  onSave,
}: ProviderSettingsDialogProps) {
  return (
    <ModalShell
      open={open}
      title="Provider Settings"
      description="Connect your AI API key so this workspace can generate text, images, video, speech, and background removal."
      onClose={onClose}
    >
      <ProviderSettingsForm
        initialValues={initialValues}
        onClose={onClose}
        onSave={onSave}
      />
    </ModalShell>
  );
}
