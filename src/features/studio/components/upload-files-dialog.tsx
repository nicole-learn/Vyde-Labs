"use client";

import { Check } from "lucide-react";
import { useRef } from "react";
import type { StudioFolder } from "../types";
import { STUDIO_MEDIA_UPLOAD_ACCEPT } from "../studio-local-runtime-helpers";
import { ModalShell } from "./modal-shell";

interface UploadFilesDialogProps {
  errorMessage?: string | null;
  folders: StudioFolder[];
  loading: boolean;
  open: boolean;
  selectedFolderId: string | null;
  onChooseFiles: (files: File[]) => void | Promise<void>;
  onClose: () => void;
  onSelectFolder: (folderId: string | null) => void;
}

export function UploadFilesDialog({
  errorMessage = null,
  folders,
  loading,
  open,
  selectedFolderId,
  onChooseFiles,
  onClose,
  onSelectFolder,
}: UploadFilesDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) {
    return null;
  }

  return (
    <ModalShell
      open={open}
      title="Upload Files"
      onClose={loading ? () => {} : onClose}
      hideHeader
      panelClassName="w-full max-w-[18rem] overflow-hidden rounded-2xl border border-white/10 bg-background/90 shadow-2xl backdrop-blur-2xl"
      contentClassName="px-0 py-0"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={STUDIO_MEDIA_UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length === 0) {
            return;
          }

          void onChooseFiles(files);
        }}
      />

      <div className="px-5 pb-4 pt-5">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Uploading..." : "Choose Files"}
        </button>
      </div>

      {folders.length > 0 ? (
        <div className="border-t border-white/10 px-5 py-3">
          <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Add to folder
          </p>
          <div className="stable-scrollbar flex max-h-48 flex-col gap-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => onSelectFolder(null)}
              disabled={loading}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-foreground/80 transition hover:bg-white/[0.04]"
            >
              <span>No folder</span>
              {selectedFolderId === null ? (
                <Check className="size-4 text-primary" />
              ) : null}
            </button>

            {folders.map((folder) => {
              const isSelected = selectedFolderId === folder.id;

              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => onSelectFolder(folder.id)}
                  disabled={loading}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-foreground/80 transition hover:bg-white/[0.04]"
                >
                  <span className="truncate">{folder.name}</span>
                  {isSelected ? <Check className="size-4 text-primary" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="border-t border-white/10 px-5 py-3">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100/92">
            {errorMessage}
          </div>
        </div>
      ) : null}

      <div className="border-t border-white/10">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="flex w-full items-center justify-center py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </ModalShell>
  );
}
