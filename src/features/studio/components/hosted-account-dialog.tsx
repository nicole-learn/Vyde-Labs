"use client";

import { CreditCard, Gauge, Loader2, Wallet } from "lucide-react";
import { ModalShell } from "./modal-shell";
import type { StudioHostedAccount } from "../types";

interface HostedAccountDialogProps {
  account: StudioHostedAccount | null;
  open: boolean;
  purchasePending: boolean;
  onClose: () => void;
  onPurchaseCredits: () => void | Promise<void>;
}

export function HostedAccountDialog({
  account,
  open,
  purchasePending,
  onClose,
  onPurchaseCredits,
}: HostedAccountDialogProps) {
  if (!account) {
    return null;
  }

  return (
    <ModalShell
      open={open}
      title="Account"
      description="Hosted TryPlayground uses platform credits and account controls instead of personal API keys."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="grid gap-3">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/42">
              Account
            </div>
            <div className="mt-2 text-base font-semibold text-white">
              {account.profile.displayName}
            </div>
            <div className="mt-1 text-sm text-white/58">{account.profile.email}</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-white/58">
                <Wallet className="size-4 text-primary" />
                Credits
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {account.creditBalance.balanceCredits}
              </div>
              <div className="mt-1 text-sm text-white/52">available now</div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-white/58">
                <Gauge className="size-4 text-primary" />
                Queue
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {account.queuedCount + account.generatingCount}
              </div>
              <div className="mt-1 text-sm text-white/52">
                {account.generatingCount} generating, {account.queuedCount} queued
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-white/58">
              <CreditCard className="size-4 text-primary" />
              Billing
            </div>
            <div className="mt-2 text-sm font-medium text-white">
              {account.activeCreditPack.credits} credits for $
              {(account.activeCreditPack.priceCents / 100).toFixed(2)}
            </div>
            <div className="mt-1 text-sm text-white/52">{account.pricingSummary}</div>
          </div>

          <div className="rounded-2xl border border-primary/15 bg-[color-mix(in_oklch,var(--primary)_9%,black)] px-4 py-3 text-sm leading-6 text-white/72">
            This hosted preview uses the same shared studio UI as local mode, but
            generations are platform-managed and billed through credits instead of
            your own API key.
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void onPurchaseCredits()}
            disabled={purchasePending}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
          >
            {purchasePending ? <Loader2 className="size-4 animate-spin" /> : null}
            <span>Buy 100 Credits</span>
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
