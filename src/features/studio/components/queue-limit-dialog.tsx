"use client";

import { ModalShell } from "./modal-shell";

interface QueueLimitDialogProps {
  open: boolean;
  onClose: () => void;
}

export function QueueLimitDialog({
  open,
  onClose,
}: QueueLimitDialogProps) {
  return (
    <ModalShell open={open} title="Queue Limit" onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm leading-6 text-white/72">
          You&apos;ve reached the limit of 100 queued or generating items. Wait
          for some generations to finish before starting more.
        </p>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110"
          >
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
