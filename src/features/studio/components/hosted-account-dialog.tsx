"use client";

import { ModalShell } from "./modal-shell";

interface HostedAccountDialogProps {
  open: boolean;
  onClose: () => void;
}

const HOSTED_ACCOUNT_ROWS = [
  {
    label: "Credits",
    value: "1,200 available",
  },
  {
    label: "Billing",
    value: "100-credit packs",
  },
  {
    label: "Model pricing",
    value: "Fal market rate + 25%",
  },
  {
    label: "Environment",
    value: "Development preview",
  },
] as const;

export function HostedAccountDialog({
  open,
  onClose,
}: HostedAccountDialogProps) {
  return (
    <ModalShell
      open={open}
      title="Account"
      description="Hosted Vyde Labs uses platform credits and account controls instead of personal API keys."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="grid gap-3">
          {HOSTED_ACCOUNT_ROWS.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3"
            >
              <span className="text-sm text-white/58">{row.label}</span>
              <span className="text-sm font-medium text-white">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/8 bg-[color-mix(in_oklch,var(--primary)_10%,black)] px-4 py-3 text-sm leading-6 text-white/72">
          This screen currently shows preview account data while hosted billing,
          credits, and profile actions are still being wired into the product.
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110"
          >
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
