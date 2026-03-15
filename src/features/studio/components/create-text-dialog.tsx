"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { ModalShell } from "./modal-shell";

interface CreateTextDialogProps {
  body: string;
  errorMessage?: string | null;
  open: boolean;
  saving?: boolean;
  title: string;
  onBodyChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  onTitleChange: (value: string) => void;
}

export function CreateTextDialog({
  body,
  errorMessage = null,
  open,
  saving = false,
  title,
  onBodyChange,
  onClose,
  onSubmit,
  onTitleChange,
}: CreateTextDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusTimerId = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimerId);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, saving]);

  if (!open) {
    return null;
  }

  return (
    <ModalShell
      open={open}
      title="Create Prompt File"
      onClose={saving ? () => {} : onClose}
      hideHeader
      panelClassName="h-[85vh] min-h-[30rem] max-h-[50rem] w-[90vw] max-w-[72rem] overflow-hidden rounded-2xl border border-border/60 bg-background p-0 shadow-2xl"
      contentClassName="p-0"
    >
      <div className="sr-only">Create Prompt File</div>
      <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3">
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-border/50 hover:bg-foreground/[0.02] focus:border-border/60 focus:bg-foreground/[0.02]"
              placeholder="Prompt"
              disabled={saving}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void onSubmit();
              }}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {saving ? "Creating..." : "Create File"}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-5 pb-5">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !saving) {
                event.preventDefault();
                void onSubmit();
              }
            }}
            className="min-h-0 flex-1 resize-none rounded-xl border border-border/50 bg-foreground/[0.02] px-3 py-3 font-mono text-[13px] leading-6 text-foreground outline-none"
            placeholder="Write the prompt body here."
            disabled={saving}
          />
          {errorMessage ? (
            <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}
