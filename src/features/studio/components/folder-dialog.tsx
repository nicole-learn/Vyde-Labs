"use client";

import { ModalShell } from "./modal-shell";

interface FolderDialogProps {
  errorMessage?: string | null;
  open: boolean;
  mode: "create" | "rename";
  value: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export function FolderDialog({
  errorMessage,
  open,
  mode,
  value,
  onValueChange,
  onClose,
  onSave,
}: FolderDialogProps) {
  const title = mode === "create" ? "Create Folder" : "Rename Folder";
  const description =
    mode === "create"
      ? "Create a new folder to keep generations, uploads, and references organized."
      : "Update the folder name without changing the items inside it.";

  return (
    <ModalShell open={open} title={title} description={description} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-white">
            Folder name
          </span>
          <input
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder="Campaign concepts"
            className="w-full rounded-full border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
          />
        </label>

        {errorMessage ? (
          <p className="text-sm text-red-300">{errorMessage}</p>
        ) : null}

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
            {mode === "create" ? "Create Folder" : "Save Changes"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
