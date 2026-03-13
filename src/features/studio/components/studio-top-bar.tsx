"use client";

import type { ReactNode } from "react";
import { FileText, SquareMousePointer, Trash2, Upload } from "lucide-react";
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

function ActionPillButton({
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
        "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-medium tracking-tight transition-all duration-150 active:scale-[0.98]",
        active
          ? "border-primary/40 bg-primary/16 text-primary"
          : "border-white/10 bg-white/[0.03] text-foreground/92 hover:bg-white/[0.06]"
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
  const sliderProgressPct = (sizeLevel / 6) * 100;

  return (
    <header className="flex h-full items-center gap-3 border-b border-white/8 bg-black px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {selectedItemCount > 0 ? (
          <ActionPillButton ariaLabel="Delete selected" onClick={onDeleteSelected}>
            <Trash2 className="size-4 text-red-300" />
            <span className="text-red-200">Delete {selectedItemCount}</span>
          </ActionPillButton>
        ) : null}

        <ActionPillButton
          active={selectionModeEnabled}
          ariaLabel="Selection mode"
          onClick={onToggleSelectionMode}
        >
          <SquareMousePointer className="size-4" />
          <span>Selection Mode</span>
        </ActionPillButton>

        <ActionPillButton ariaLabel="Add prompt" onClick={onOpenCreateText}>
          <FileText className="size-4" />
          <span>Add Prompt</span>
        </ActionPillButton>

        <ActionPillButton ariaLabel="Upload files" onClick={onOpenUpload}>
          <Upload className="size-4" />
          <span>Upload Files</span>
        </ActionPillButton>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <input
          type="range"
          min={0}
          max={6}
          step={1}
          value={sizeLevel}
          onChange={(event) => onSizeLevelChange(Number(event.target.value))}
          className="studio-range w-[160px]"
          aria-label="Gallery size"
          style={{
            background: `linear-gradient(90deg, color-mix(in srgb, var(--primary) 90%, white 10%) 0%, color-mix(in srgb, var(--primary) 90%, white 10%) ${sliderProgressPct}%, rgba(255,255,255,0.12) ${sliderProgressPct}%, rgba(255,255,255,0.12) 100%)`,
          }}
        />
        <StudioAccountButton hasFalKey={hasFalKey} onClick={onOpenSettings} />
      </div>
    </header>
  );
}
