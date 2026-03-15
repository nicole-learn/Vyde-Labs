"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { ModalShell } from "./modal-shell";

interface FolderDialogProps {
  errorMessage?: string | null;
  mode: "create" | "rename";
  open: boolean;
  saving?: boolean;
  value: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void | Promise<void>;
  onValueChange: (value: string) => void;
}

export function FolderDialog({
  errorMessage = null,
  mode,
  open,
  saving = false,
  value,
  onOpenChange,
  onSubmit,
  onValueChange,
}: FolderDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const title = mode === "rename" ? "Rename Folder" : "New Folder";
  const submitLabel = mode === "rename" ? "Save" : "Create";

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusTimerId = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimerId);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open, saving]);

  if (!open) {
    return null;
  }

  return (
    <ModalShell
      open={open}
      title={title}
      onClose={saving ? () => {} : () => onOpenChange(false)}
      hideHeader
      panelClassName="w-[min(92vw,21rem)] max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-background/90 p-0 shadow-2xl backdrop-blur-2xl"
      contentClassName="px-0 py-0"
    >
      <div className="flex flex-col items-center px-5 pb-5 pt-6 text-center">
        <div className="text-[17px] font-semibold tracking-tight text-foreground">
          {title}
        </div>

        <div className="mt-4 w-full space-y-3">
          <input
            ref={inputRef}
            placeholder="Folder name"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            disabled={saving}
            className="h-9 w-full rounded-[8px] border-0 bg-foreground/5 px-2.5 text-[14px] font-medium text-foreground shadow-inner outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground/60 focus:bg-foreground/10"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !saving) {
                event.preventDefault();
                void onSubmit();
              }
            }}
          />

          {errorMessage ? (
            <p className="text-left text-[12px] text-destructive">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid h-11 grid-cols-2 border-t border-white/10">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={saving}
          className="flex items-center justify-center border-r border-white/10 text-[15px] text-foreground transition-colors hover:bg-foreground/5 active:bg-foreground/10 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            void onSubmit();
          }}
          disabled={saving}
          className="flex items-center justify-center text-[15px] font-semibold text-primary transition-colors hover:bg-primary/5 active:bg-primary/10 disabled:opacity-50"
        >
          {saving ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
          {saving ? (mode === "rename" ? "Saving..." : "Creating...") : submitLabel}
        </button>
      </div>
    </ModalShell>
  );
}
