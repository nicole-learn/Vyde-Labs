"use client";

import { ModalShell } from "./modal-shell";
import type { StudioProviderSettings } from "../types";

interface ProviderSettingsDialogProps {
  open: boolean;
  initialValues: StudioProviderSettings;
  onClose: () => void;
  onSave: (settings: StudioProviderSettings) => void;
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
      description="Connect your AI API key so this workspace can generate text, images, and video."
      onClose={onClose}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          onSave({
            falApiKey: String(formData.get("falApiKey") ?? ""),
          });
        }}
      >
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-white">
            Fal API key
          </span>
          <textarea
            name="falApiKey"
            defaultValue={initialValues.falApiKey}
            placeholder="Paste your Fal key here"
            className="min-h-32 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
          />
        </label>

        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/62">
          For now, Vyde Labs only supports Fal AI API keys and models, and stores
          your key only for the current browser session instead of saving it
          permanently. I hope to be able to add other providers and models soon -
          Nicole
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110"
          >
            Save Settings
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
