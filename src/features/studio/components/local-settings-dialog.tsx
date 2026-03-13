"use client";

import { ModalShell } from "./modal-shell";
import type { LocalProviderSettings } from "../types";

interface LocalSettingsDialogProps {
  open: boolean;
  initialValues: LocalProviderSettings;
  onClose: () => void;
  onSave: (settings: LocalProviderSettings) => void;
}

export function LocalSettingsDialog({
  open,
  initialValues,
  onClose,
  onSave,
}: LocalSettingsDialogProps) {
  return (
    <ModalShell
      open={open}
      title="Local Settings"
      description="Connect your Fal API key so this local workspace can generate text, images, and video."
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
          The local version keeps your key in this browser so you can run Vyde Labs
          with your own Fal account.
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
            className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
          >
            Save Settings
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
