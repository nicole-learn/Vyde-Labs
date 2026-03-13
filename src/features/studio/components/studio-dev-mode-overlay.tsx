"use client";

import { Check, ChevronUp, SquareTerminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { StudioAppMode } from "../studio-app-mode";

interface StudioDevModeOverlayProps {
  appMode: StudioAppMode;
  onChange: (appMode: StudioAppMode) => void;
}

const APP_MODE_OPTIONS: Array<{
  value: StudioAppMode;
  label: string;
  description: string;
}> = [
  {
    value: "local",
    label: "Local",
    description: "Use personal Fal settings and local-only behavior.",
  },
  {
    value: "hosted",
    label: "Hosted",
    description: "Preview account, credits, and platform-managed generation.",
  },
];

export function StudioDevModeOverlay({
  appMode,
  onChange,
}: StudioDevModeOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const expanded = hovered || focused || open;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[150]">
      <div
        ref={containerRef}
        className="pointer-events-auto relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setFocused(false);
          }
        }}
      >
        {open ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 absolute bottom-full left-0 mb-2 w-[280px] overflow-hidden rounded-2xl border border-white/10 bg-black/88 p-2 shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
            <div className="px-2 pb-2 pt-1">
              <div className="text-[12px] font-medium text-white/92">Dev Mode</div>
              <div className="mt-1 text-[12px] leading-5 text-white/52">
                Switch between local and hosted product behavior while developing.
              </div>
            </div>

            <div className="space-y-1">
              {APP_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                    appMode === option.value
                      ? "bg-[color-mix(in_oklch,var(--primary)_16%,black)] text-white"
                      : "text-white/80 hover:bg-white/[0.05]"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                      appMode === option.value
                        ? "border-primary/60 bg-primary text-primary-foreground"
                        : "border-white/12 bg-white/[0.03] text-white/38"
                    )}
                  >
                    {appMode === option.value ? (
                      <Check className="size-3.5" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-current" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium tracking-tight">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-[12px] leading-5 text-white/50">
                      {option.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label="Toggle dev mode switcher"
          aria-expanded={open}
          title="Dev mode"
          className={cn(
            "flex h-11 items-center overflow-hidden rounded-full border border-white/10 bg-black/88 text-white shadow-[0_12px_36px_rgba(0,0,0,0.34)] backdrop-blur-2xl transition-[width,background-color,border-color,box-shadow,transform] duration-200 hover:bg-black/92 active:scale-[0.98]",
            expanded ? "w-[176px]" : "w-11"
          )}
        >
          <span className="flex size-11 shrink-0 items-center justify-center">
            <SquareTerminal className="size-[17px] text-white/92" />
          </span>

          <span
            className={cn(
              "min-w-0 whitespace-nowrap text-[13px] font-medium tracking-tight transition-[opacity,transform] duration-200",
              expanded ? "opacity-100 translate-x-0" : "opacity-0 translate-x-1"
            )}
          >
            Dev Mode
          </span>

          <span
            className={cn(
              "ml-auto flex items-center gap-1 pr-3 text-[12px] text-white/56 transition-[opacity,transform] duration-200",
              expanded ? "opacity-100 translate-x-0" : "opacity-0 translate-x-1"
            )}
          >
            <span>{appMode === "hosted" ? "Hosted" : "Local"}</span>
            <ChevronUp
              className={cn(
                "size-3.5 transition-transform duration-200",
                open ? "rotate-0" : "rotate-180"
              )}
            />
          </span>
        </button>
      </div>
    </div>
  );
}
