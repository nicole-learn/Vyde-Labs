"use client";

import { Settings2 } from "lucide-react";
import { cn } from "@/lib/cn";

interface StudioAccountButtonProps {
  hasFalKey: boolean;
  onClick: () => void;
}

export function StudioAccountButton({
  hasFalKey,
  onClick,
}: StudioAccountButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Local settings"
      title="Local settings"
      className="relative flex size-[46px] shrink-0 items-center justify-center rounded-full transition-all duration-150 hover:opacity-85 active:scale-[0.95]"
    >
      <svg
        className="pointer-events-none absolute inset-0"
        width={46}
        height={46}
        viewBox="0 0 46 46"
        aria-hidden
      >
        <circle
          cx={23}
          cy={23}
          r={21}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="opacity-10"
        />
        <circle
          cx={23}
          cy={23}
          r={21}
          fill="none"
          stroke={hasFalKey ? "var(--primary)" : "oklch(0.8 0.18 85)"}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={131.95}
          strokeDashoffset={hasFalKey ? 16 : 58}
          className="transition-[stroke-dashoffset,stroke] duration-500 ease-out"
          style={{ transform: "rotate(-90deg) scaleY(-1)", transformOrigin: "center" }}
        />
      </svg>

      <span
        className={cn(
          "relative flex size-[38px] items-center justify-center rounded-full border text-foreground",
          hasFalKey
            ? "border-white/8 bg-muted"
            : "border-amber-300/30 bg-amber-400/10"
        )}
      >
        <Settings2 className="size-4" />
      </span>
    </button>
  );
}
