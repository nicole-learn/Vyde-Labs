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
  className,
  children,
  onClick,
}: {
  active?: boolean;
  ariaLabel: string;
  className?: string;
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
        "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[13px] font-medium tracking-tight transition-all duration-150 active:scale-[0.98]",
        active
          ? "border-primary/40 bg-primary/16 text-primary"
          : "border-white/10 bg-white/[0.03] text-foreground/92 hover:bg-white/[0.06]",
        className
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
  return (
    <header className="flex h-full items-center gap-3 border-b border-white/8 bg-black px-3">
      <div className="flex min-w-0 flex-1 items-center">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-dark.svg"
            alt="Vyde Labs"
            className="h-7 w-auto shrink-0"
            draggable={false}
          />
          <div className="min-w-0 text-[18px] font-semibold tracking-tight">
            <span className="text-primary">Vyde</span>
            <span className="text-foreground"> Labs</span>
          </div>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {selectedItemCount > 0 ? (
          <ActionPillButton
            ariaLabel="Delete selected"
            className="min-w-[112px] border-red-500/28 bg-red-500/14 text-red-100 hover:bg-red-500/22"
            onClick={onDeleteSelected}
          >
            <Trash2 className="size-3.5 text-red-300" />
            <span>{`Delete ${selectedItemCount}`}</span>
          </ActionPillButton>
        ) : null}

        <ActionPillButton
          active={selectionModeEnabled}
          ariaLabel="Selection mode"
          className="min-w-[142px]"
          onClick={onToggleSelectionMode}
        >
          <SquareMousePointer className="size-3.5" />
          <span>Selection Mode</span>
        </ActionPillButton>

        <ActionPillButton
          ariaLabel="Add prompt"
          className="min-w-[124px]"
          onClick={onOpenCreateText}
        >
          <FileText className="size-3.5" />
          <span>Add Prompt</span>
        </ActionPillButton>

        <ActionPillButton
          ariaLabel="Upload files"
          className="min-w-[128px]"
          onClick={onOpenUpload}
        >
          <Upload className="size-3.5" />
          <span>Upload Files</span>
        </ActionPillButton>
        <div className="flex h-9 w-[166px] shrink-0 items-center rounded-full bg-white/[0.03] px-3">
          <Slider
            min={0}
            max={6}
            step={1}
            value={[sizeLevel]}
            onValueChange={(value) => onSizeLevelChange(value[0] ?? sizeLevel)}
            aria-label="Gallery size"
            className="w-full cursor-grab [&_[data-slot=slider-range]]:bg-primary/90 [&_[data-slot=slider-thumb]]:size-[18px] [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-thumb]]:hover:ring-0 [&_[data-slot=slider-thumb]]:shadow-[0_1px_8px_rgba(0,0,0,0.45)] [&_[data-slot=slider-track]]:h-1.5 [&_[data-slot=slider-track]]:bg-white/12"
          />
        </div>
        <StudioAccountButton
          appMode={appMode}
          hasFalKey={hasFalKey}
          onClick={onOpenAccount}
        />
      </div>
    </header>
  );
}
