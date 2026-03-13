"use client";

import type { ReactNode } from "react";
import { FileText, SquareMousePointer, Trash2, Upload } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/cn";
import type { StudioAppMode } from "../studio-app-mode";
import { StudioAccountButton } from "./studio-account-button";

interface StudioTopBarProps {
  appMode: StudioAppMode;
  hasFalKey: boolean;
  onDeleteSelected: () => void;
  onOpenCreateText: () => void;
  onOpenAccount: () => void;
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
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium tracking-tight transition-all duration-150 active:scale-[0.98]",
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
  appMode,
  hasFalKey,
  onDeleteSelected,
  onOpenCreateText,
  onOpenAccount,
  onOpenUpload,
  onToggleSelectionMode,
  selectedItemCount,
  selectionModeEnabled,
  sizeLevel,
  onSizeLevelChange,
}: StudioTopBarProps) {
  const selectionLabel =
    selectedItemCount > 0 ? `Delete ${selectedItemCount}` : "Selection Mode";

  return (
    <header className="flex h-full items-center gap-3 border-b border-white/8 bg-black px-3">
      <div className="min-w-0 flex-1" />

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <ActionPillButton
          active={selectedItemCount === 0 && selectionModeEnabled}
          ariaLabel={selectedItemCount > 0 ? "Delete selected" : "Selection mode"}
          onClick={selectedItemCount > 0 ? onDeleteSelected : onToggleSelectionMode}
        >
          {selectedItemCount > 0 ? (
            <Trash2 className="size-3.5 text-red-300" />
          ) : (
            <SquareMousePointer className="size-3.5" />
          )}
          <span className={selectedItemCount > 0 ? "text-red-200" : undefined}>
            {selectionLabel}
          </span>
        </ActionPillButton>

        <ActionPillButton ariaLabel="Add prompt" onClick={onOpenCreateText}>
          <FileText className="size-3.5" />
          <span>Add Prompt</span>
        </ActionPillButton>

        <ActionPillButton ariaLabel="Upload files" onClick={onOpenUpload}>
          <Upload className="size-3.5" />
          <span>Upload Files</span>
        </ActionPillButton>
        <Slider
          min={0}
          max={6}
          step={1}
          value={[sizeLevel]}
          onValueChange={(value) => onSizeLevelChange(value[0] ?? sizeLevel)}
          aria-label="Gallery size"
          className="w-[158px] cursor-grab [&_[data-slot=slider-range]]:bg-primary/80 [&_[data-slot=slider-thumb]]:size-[18px] [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-thumb]]:hover:ring-0 [&_[data-slot=slider-thumb]]:shadow-[0_1px_8px_rgba(0,0,0,0.45)] [&_[data-slot=slider-track]]:bg-white/10"
        />
        <StudioAccountButton
          appMode={appMode}
          hasFalKey={hasFalKey}
          onClick={onOpenAccount}
        />
      </div>
    </header>
  );
}
