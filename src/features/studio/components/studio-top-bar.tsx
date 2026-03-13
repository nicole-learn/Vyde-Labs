"use client";

import type { ReactNode } from "react";
import { Download, FileText, SquareMousePointer, Trash2, Upload, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/cn";
import type { StudioAppMode } from "../studio-app-mode";
import { StudioAccountButton } from "./studio-account-button";

interface StudioTopBarProps {
  appMode: StudioAppMode;
  accountLabel?: string;
  hasFalKey: boolean;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  onDownloadSelected: () => void;
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
        "inline-flex h-[34px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[12.5px] font-medium tracking-tight transition-all duration-150 active:scale-[0.98]",
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
  accountLabel,
  hasFalKey,
  onClearSelection,
  onDeleteSelected,
  onDownloadSelected,
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
    <header className="relative flex h-full items-center gap-2.5 border-b border-white/8 bg-black px-2.5">
      <div className="flex min-w-0 flex-1 items-center">
        <div className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-dark.svg"
            alt="TryPlayground"
            className="h-6 w-auto shrink-0"
            draggable={false}
          />
          <div className="min-w-0 text-[22px] font-extrabold tracking-[-0.04em] leading-none">
            <span className="text-foreground">try</span>
            <span className="text-primary">playground</span>
          </div>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {selectedItemCount > 0 ? (
          <div className="hidden items-center gap-2 xl:flex">
            <button
              type="button"
              onClick={onClearSelection}
              aria-label="Clear selected assets"
              title="Clear selected assets"
              className="inline-flex size-[38px] items-center justify-center rounded-full border border-white/12 bg-white/[0.03] text-foreground transition-all duration-150 hover:bg-white/[0.06] active:scale-[0.98]"
            >
              <X className="size-[18px]" />
            </button>

            <span className="text-[12.5px] font-medium text-foreground">
              {selectedItemCount === 1
                ? "1 selected"
                : `${selectedItemCount} selected`}
            </span>

            <ActionPillButton
              ariaLabel="Download selected"
              className="min-w-[108px] border-primary/45 bg-primary/10 text-primary hover:bg-primary/14"
              onClick={onDownloadSelected}
            >
              <Download className="size-[13px]" />
              <span>Download</span>
            </ActionPillButton>

            <ActionPillButton
              ariaLabel="Delete selected"
              className="min-w-[96px] border-destructive/45 bg-destructive/10 text-destructive hover:bg-destructive/14"
              onClick={onDeleteSelected}
            >
              <Trash2 className="size-[13px]" />
              <span>Delete</span>
            </ActionPillButton>
          </div>
        ) : null}

        <ActionPillButton
          active={selectionModeEnabled}
          ariaLabel="Selection mode"
          className="min-w-[142px]"
          onClick={onToggleSelectionMode}
        >
          <SquareMousePointer className="size-[13px]" />
          <span>Selection Mode</span>
        </ActionPillButton>

        <ActionPillButton
          ariaLabel="Add prompt"
          className="min-w-[124px]"
          onClick={onOpenCreateText}
        >
          <FileText className="size-[13px]" />
          <span>Add Prompt</span>
        </ActionPillButton>

        <ActionPillButton
          ariaLabel="Upload files"
          className="min-w-[128px]"
          onClick={onOpenUpload}
        >
          <Upload className="size-[13px]" />
          <span>Upload Files</span>
        </ActionPillButton>
        <div className="flex h-[34px] w-[166px] shrink-0 items-center rounded-full bg-white/[0.03] px-3">
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
          hostedLabel={accountLabel}
          onClick={onOpenAccount}
        />
      </div>
    </header>
  );
}
