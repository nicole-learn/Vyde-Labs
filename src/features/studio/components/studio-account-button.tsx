"use client";

import type { StudioAppMode } from "../studio-app-mode";

interface StudioAccountButtonProps {
  appMode: StudioAppMode;
  hasFalKey: boolean;
  hostedLabel?: string;
  onClick: () => void;
}

export function StudioAccountButton({
  appMode,
  hasFalKey,
  hostedLabel = "N",
  onClick,
}: StudioAccountButtonProps) {
  const isHostedMode = appMode === "hosted";
  const buttonLabel = isHostedMode ? hostedLabel : "T";
  const buttonTitle = isHostedMode ? "Account" : "Provider settings";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={buttonTitle}
      title={buttonTitle}
      className="relative flex size-[34px] shrink-0 items-center justify-center rounded-full border border-white/10 bg-[color-mix(in_oklch,var(--primary)_25%,black)] text-[12.5px] font-semibold text-primary-foreground transition-all duration-150 hover:brightness-110 active:scale-[0.97]"
    >
      <span>{buttonLabel}</span>
      {isHostedMode ? null : (
        <span
          className="absolute bottom-[3px] right-[3px] size-[7px] rounded-full border border-black/60"
          style={{
            background: hasFalKey ? "var(--primary)" : "oklch(0.8 0.18 85)",
          }}
        />
      )}
    </button>
  );
}
