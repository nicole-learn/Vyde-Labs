"use client";

import { FileText, FolderPlus, SquareMousePointer, Trash2, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/cn";
import type { StudioAppMode } from "../studio-app-mode";
import type { StudioFolder } from "../types";
import { StudioAccountButton } from "./studio-account-button";

interface StudioMobileRailProps {
  appMode: StudioAppMode;
  folderCounts: Record<string, number>;
  folders: StudioFolder[];
  hasFalKey: boolean;
  onDeleteSelected: () => void;
  selectedFolderId: string | null;
  selectedItemCount: number;
  selectionModeEnabled: boolean;
  sizeLevel: number;
  onCreateFolder: () => void;
  onOpenCreateText: () => void;
  onOpenAccount: () => void;
  onOpenUpload: () => void;
  onSelectFolder: (folderId: string | null) => void;
  onSizeLevelChange: (value: number) => void;
  onToggleSelectionMode: () => void;
}

function RailButton({
  active = false,
  ariaLabel,
  children,
  onClick,
}: {
  active?: boolean;
  ariaLabel: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        "flex size-[46px] shrink-0 items-center justify-center rounded-md transition-all duration-150 active:scale-[0.95]",
        active
          ? "bg-primary text-primary-foreground"
          : "text-[oklch(0.85_0.08_190)] hover:bg-primary/10"
      )}
    >
      {children}
    </button>
  );
}

export function StudioMobileRail({
  appMode,
  folderCounts,
  folders,
  hasFalKey,
  onDeleteSelected,
  selectedFolderId,
  selectedItemCount,
  selectionModeEnabled,
  sizeLevel,
  onCreateFolder,
  onOpenCreateText,
  onOpenAccount,
  onOpenUpload,
  onSelectFolder,
  onSizeLevelChange,
  onToggleSelectionMode,
}: StudioMobileRailProps) {
  return (
    <aside className="flex h-full min-h-0 w-[54px] shrink-0 flex-col items-center border-l-[2px] border-border/40 bg-background">
      <div className="flex w-full shrink-0 flex-col items-center px-1.5 pb-1 pt-2">
        <StudioAccountButton
          appMode={appMode}
          hasFalKey={hasFalKey}
          onClick={onOpenAccount}
        />
      </div>

      <div className="stable-scrollbar flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-1.5 pb-2 pt-1">
        {folders.map((folder) => {
          const initial = folder.name.charAt(0).toUpperCase() || "F";
          return (
            <button
              key={folder.id}
              type="button"
              onClick={() =>
                onSelectFolder(selectedFolderId === folder.id ? null : folder.id)
              }
              title={`${folder.name} (${folderCounts[folder.id] ?? 0})`}
              className={cn(
                "flex size-[46px] shrink-0 items-center justify-center rounded-md text-xl transition-all duration-150 active:scale-[0.95]",
                selectedFolderId === folder.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-primary/10 text-primary hover:bg-primary/15"
              )}
            >
              {initial}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onCreateFolder}
          title="Add folder"
          className="flex size-[46px] shrink-0 items-center justify-center rounded-md border border-dashed border-muted-foreground/35 text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 hover:text-primary"
        >
          <FolderPlus className="size-5" />
        </button>
      </div>

      <div className="flex w-full shrink-0 flex-col items-center gap-1 px-1.5 py-1.5">
        <div className="flex h-20 items-center justify-center">
          <Slider
            orientation="vertical"
            min={0}
            max={6}
            step={1}
            value={[sizeLevel]}
            onValueChange={(value) => onSizeLevelChange(value[0] ?? sizeLevel)}
            aria-label="Gallery size"
            className="!min-h-20 h-20 cursor-grab [&_[data-slot=slider-range]]:bg-primary/80 [&_[data-slot=slider-thumb]]:size-[18px] [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-thumb]]:hover:ring-0 [&_[data-slot=slider-thumb]]:shadow-[0_1px_8px_rgba(0,0,0,0.45)] [&_[data-slot=slider-track]]:bg-white/10"
          />
        </div>

        {selectedItemCount > 0 ? (
          <button
            type="button"
            onClick={onDeleteSelected}
            aria-label="Delete selected"
            title={`Delete ${selectedItemCount}`}
            className="flex size-[46px] shrink-0 items-center justify-center rounded-md bg-red-500/16 text-red-200 transition-all duration-150 hover:bg-red-500/24 active:scale-[0.95]"
          >
            <Trash2 className="size-5" />
          </button>
        ) : null}

        <RailButton
          active={selectionModeEnabled}
          ariaLabel="Selection mode"
          onClick={onToggleSelectionMode}
        >
          <SquareMousePointer className="size-5" />
        </RailButton>

        <RailButton ariaLabel="Add text" onClick={onOpenCreateText}>
          <FileText className="size-5" />
        </RailButton>

        <RailButton ariaLabel="Upload files" onClick={onOpenUpload}>
          <Upload className="size-5" />
        </RailButton>
      </div>
    </aside>
  );
}
