"use client";

import { cn } from "@/lib/cn";
import type { StudioAppMode } from "../studio-app-mode";

interface StudioDevModeSwitcherProps {
  appMode: StudioAppMode;
  onChange: (appMode: StudioAppMode) => void;
}

const APP_MODE_OPTIONS: Array<{ label: string; value: StudioAppMode }> = [
  { label: "Local", value: "local" },
  { label: "Hosted", value: "hosted" },
];

export function StudioDevModeSwitcher({
  appMode,
  onChange,
}: StudioDevModeSwitcherProps) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/36">
        Dev Mode
      </span>

      <div className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] p-1">
        {APP_MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-medium tracking-tight transition-all duration-150",
              appMode === option.value
                ? "bg-[color-mix(in_oklch,var(--primary)_18%,black)] text-primary shadow-[0_8px_18px_rgba(0,0,0,0.3)]"
                : "text-white/54 hover:text-white/82"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
