"use client";

import type { ReactNode } from "react";
import {
  FileText,
  SquareMousePointer,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { StudioAccountButton } from "./studio-account-button";

interface StudioTopBarProps {
  hasFalKey: boolean;
  onDeleteSelected: () => void;
  onOpenCreateText: () => void;
  onOpenSettings: () => void;
  onOpenUpload: () => void;
  onToggleSelectionMode: () => void;
  selectedItemCount: number;
  selectionModeEnabled: boolean;
  sizeLevel: number;
  onSizeLevelChange: (value: number) => void;
}

function IconActionButton({
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
        "flex size-[42px] shrink-0 items-center justify-center rounded-md transition-all duration-150 active:scale-[0.95]",
        active
          ? "bg-primary text-primary-foreground"
          : "text-[oklch(0.85_0.08_190)] hover:bg-primary/10"
      )}
    >
      {children}
    </button>
  );
}

export function StudioTopBar({
  hasFalKey,
  onDeleteSelected,
  onOpenCreateText,
  onOpenSettings,
  onOpenUpload,
  onToggleSelectionMode,
  selectedItemCount,
  selectionModeEnabled,
  sizeLevel,
  onSizeLevelChange,
}: StudioTopBarProps) {
  return (
    <header className="flex h-full items-center gap-3 border-b border-border/50 bg-background/95 px-4 backdrop-blur-sm">
      <StudioAccountButton hasFalKey={hasFalKey} onClick={onOpenSettings} />

      <div className="h-8 w-px shrink-0 bg-border/50" aria-hidden />

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Grid
        </span>
        <input
          type="range"
          min={0}
          max={6}
          step={1}
          value={sizeLevel}
          onChange={(event) => onSizeLevelChange(Number(event.target.value))}
          className="w-full max-w-[220px] cursor-grab accent-primary"
          aria-label="Gallery size"
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {selectedItemCount > 0 ? (
          <button
            type="button"
            onClick={onDeleteSelected}
            className="flex h-[36px] shrink-0 items-center gap-2 rounded-md bg-red-500/15 px-3 text-sm font-medium text-red-400 transition-all duration-150 hover:bg-red-500/25 active:scale-[0.97]"
          >
            <Trash2 className="size-4" />
            Delete {selectedItemCount}
          </button>
        ) : null}

        <IconActionButton
          active={selectionModeEnabled}
          ariaLabel="Selection mode"
          onClick={onToggleSelectionMode}
        >
          <SquareMousePointer className="size-5" />
        </IconActionButton>

        <IconActionButton ariaLabel="Add text" onClick={onOpenCreateText}>
          <FileText className="size-5" />
        </IconActionButton>

        <IconActionButton ariaLabel="Upload files" onClick={onOpenUpload}>
          <Upload className="size-5" />
        </IconActionButton>
      </div>
    </header>
  );
}
