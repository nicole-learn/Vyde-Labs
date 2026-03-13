"use client";

import { ModalShell } from "./modal-shell";

interface CreateTextDialogProps {
  body: string;
  open: boolean;
  title: string;
  onBodyChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onTitleChange: (value: string) => void;
}

export function CreateTextDialog({
  body,
  open,
  title,
  onBodyChange,
  onClose,
  onSubmit,
  onTitleChange,
}: CreateTextDialogProps) {
  return (
    <ModalShell
      open={open}
      title="Create Text"
      description="Add a local text note directly into your workspace library."
      onClose={onClose}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-white">Title</span>
          <input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Campaign note"
            className="w-full rounded-full border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-primary/60"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-white">Body</span>
          <textarea
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            placeholder="Paste a draft, brief, or working note."
            className="min-h-40 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-primary/60"
          />
        </label>

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
            Save Text
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
