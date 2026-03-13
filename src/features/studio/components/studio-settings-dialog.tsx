"use client";

import {
  Eye,
  EyeOff,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { STUDIO_MODEL_CATALOG_ALPHABETICAL } from "../studio-model-catalog";
import type { StudioAppMode } from "../studio-app-mode";
import { ModalShell } from "./modal-shell";
import type {
  StudioCreditPurchaseAmount,
  StudioHostedAccount,
  StudioModelConfiguration,
  StudioProviderConnectionStatus,
  StudioProviderSaveResult,
  StudioProviderSettings,
} from "../types";

type HostedSettingsTab = "credits" | "models" | "account";
type LocalSettingsTab = "api-key" | "models";

interface StudioSettingsDialogProps {
  appMode: StudioAppMode;
  hostedAccount: StudioHostedAccount | null;
  modelConfiguration: StudioModelConfiguration;
  open: boolean;
  purchaseErrorMessage: string | null;
  providerConnectionStatus: StudioProviderConnectionStatus;
  providerSettings: StudioProviderSettings;
  purchasePending: boolean;
  onClose: () => void;
  onDeleteAccount: () => Promise<void> | void;
  onPurchaseCredits: (credits: StudioCreditPurchaseAmount) => Promise<void> | void;
  onSaveProviderSettings: (
    settings: StudioProviderSettings
  ) => Promise<StudioProviderSaveResult> | StudioProviderSaveResult;
  onSignOut: () => Promise<void> | void;
  onToggleModelEnabled: (modelId: string) => void;
}

function formatCredits(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function SettingsTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-medium transition",
        active
          ? "bg-primary text-primary-foreground shadow-[0_8px_22px_color-mix(in_oklch,var(--primary)_18%,transparent)]"
          : "bg-white/[0.04] text-white/68 hover:bg-white/[0.07] hover:text-white"
      )}
    >
      {label}
    </button>
  );
}

function ApiKeyTab({
  initialValues,
  providerConnectionStatus,
  onSave,
}: {
  initialValues: StudioProviderSettings;
  providerConnectionStatus: StudioProviderConnectionStatus;
  onSave: (
    settings: StudioProviderSettings
  ) => Promise<StudioProviderSaveResult> | StudioProviderSaveResult;
}) {
  const [falApiKey, setFalApiKey] = useState(initialValues.falApiKey);
  const [revealKey, setRevealKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  return (
    <form
      className="space-y-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        const result = await onSave({
          falApiKey,
          lastValidatedAt: initialValues.lastValidatedAt,
        });

        setSaving(false);

        if (!result.ok) {
          setErrorMessage(result.errorMessage ?? "Could not save your Fal API key.");
          return;
        }

        setSuccessMessage(
          result.successMessage ?? "Fal API key connected for this browser session."
        );
      }}
    >
      <div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white">Fal API Key</div>
            <div className="mt-1 text-sm text-white/56">
              Connect your Fal key for local generation.
            </div>
          </div>
          <div
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              providerConnectionStatus === "connected"
                ? "bg-primary/15 text-primary"
                : providerConnectionStatus === "invalid"
                  ? "bg-red-500/12 text-red-200"
                  : "bg-white/[0.05] text-white/50"
            )}
          >
            {providerConnectionStatus === "connected"
              ? "Connected"
              : providerConnectionStatus === "invalid"
                ? "Invalid"
                : "Not Connected"}
          </div>
        </div>

        <div className="mt-4 flex items-center overflow-hidden rounded-2xl border border-white/10 bg-black/25 transition focus-within:border-primary/45">
          <input
            name="falApiKey"
            type={revealKey ? "text" : "password"}
            value={falApiKey}
            onChange={(event) => {
              setFalApiKey(event.target.value);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Paste your Fal API key"
            className="h-14 min-w-0 flex-1 bg-transparent px-4 text-sm text-white outline-none"
          />
          <button
            type="button"
            onClick={() => setRevealKey((current) => !current)}
            className="mr-2 inline-flex size-10 items-center justify-center rounded-full text-white/56 transition hover:bg-white/5 hover:text-white"
            aria-label={revealKey ? "Hide API key" : "Show API key"}
          >
            {revealKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-sm leading-6 text-white/62">
          For now, TryPlayground only supports Fal AI API keys and models, and
          stores your key only for the current browser session instead of saving it
          permanently. I hope to be able to add other providers and models soon -
          Nicole
        </div>

        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100/90">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary-foreground">
            {successMessage}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            <span>{saving ? "Checking..." : "Save API Key"}</span>
          </button>
        </div>
      </div>
    </form>
  );
}

function ModelConfigurationTab({
  modelConfiguration,
  onToggleModelEnabled,
}: {
  modelConfiguration: StudioModelConfiguration;
  onToggleModelEnabled: (modelId: string) => void;
}) {
  const [searchValue, setSearchValue] = useState("");
  const enabledIdSet = useMemo(
    () => new Set(modelConfiguration.enabledModelIds),
    [modelConfiguration.enabledModelIds]
  );
  const enabledCount = modelConfiguration.enabledModelIds.length;
  const filteredModels = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) {
      return STUDIO_MODEL_CATALOG_ALPHABETICAL;
    }

    return STUDIO_MODEL_CATALOG_ALPHABETICAL.filter((model) =>
      model.name.toLowerCase().includes(query)
    );
  }, [searchValue]);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/34" />
        <input
          type="search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Search models"
          className="h-14 w-full rounded-2xl border border-white/10 bg-white/[0.035] pl-11 pr-4 text-sm text-white outline-none transition focus:border-primary/45"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredModels.map((model) => {
          const enabled = enabledIdSet.has(model.id);
          const isLastEnabled = enabled && enabledCount === 1;

          return (
            <button
              key={model.id}
              type="button"
              disabled={isLastEnabled}
              onClick={() => onToggleModelEnabled(model.id)}
              className={cn(
                "rounded-2xl border px-4 py-3 text-left text-sm font-medium transition",
                enabled
                  ? "border-primary/45 bg-primary/12 text-primary"
                  : "border-white/10 bg-white/[0.03] text-white/78 hover:border-white/20 hover:bg-white/[0.05] hover:text-white",
                isLastEnabled ? "cursor-not-allowed opacity-60" : ""
              )}
            >
              {model.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CreditsTab({
  account,
  purchaseErrorMessage,
  purchasePending,
  onPurchaseCredits,
}: {
  account: StudioHostedAccount;
  purchaseErrorMessage: string | null;
  purchasePending: boolean;
  onPurchaseCredits: (credits: StudioCreditPurchaseAmount) => Promise<void> | void;
}) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-8">
      <div className="text-center">
        <div className="text-[14px] uppercase tracking-[0.28em] text-white/34">
          Credits
        </div>
        <div className="mt-4 text-6xl font-semibold tracking-tight text-white">
          {formatCredits(account.creditBalance.balanceCredits)}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="min-w-[132px] rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-center text-2xl font-semibold text-white">
          100
        </div>

        <button
          type="button"
          onClick={() => void onPurchaseCredits(100)}
          disabled={purchasePending}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
        >
          {purchasePending ? <Loader2 className="size-4 animate-spin" /> : null}
          <span>Buy</span>
        </button>
      </div>

      {purchaseErrorMessage ? (
        <div className="rounded-2xl border border-red-500/18 bg-red-500/10 px-4 py-3 text-sm text-red-100/90">
          {purchaseErrorMessage}
        </div>
      ) : null}
    </div>
  );
}

function AccountInformationTab({
  account,
  onDeleteAccount,
  onSignOut,
}: {
  account: StudioHostedAccount;
  onDeleteAccount: () => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
        <div className="text-lg font-semibold text-white">
          {account.profile.displayName}
        </div>
        <div className="mt-1 text-sm text-white/58">{account.profile.email}</div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
          <div className="text-sm text-white/56">Queued</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {account.queuedCount}
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
          <div className="text-sm text-white/56">Generating</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {account.generatingCount}
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
          <div className="text-sm text-white/56">Completed</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {account.completedCount}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="rounded-full border border-white/12 px-5 py-2.5 text-sm font-medium text-white/76 transition hover:border-white/20 hover:text-white"
        >
          Sign Out
        </button>
        <button
          type="button"
          onClick={() => void onDeleteAccount()}
          className="rounded-full border border-red-500/28 px-5 py-2.5 text-sm font-medium text-red-200 transition hover:bg-red-500/10"
        >
          Delete Account
        </button>
      </div>
    </div>
  );
}

export function StudioSettingsDialog({
  appMode,
  hostedAccount,
  modelConfiguration,
  open,
  purchaseErrorMessage,
  providerConnectionStatus,
  providerSettings,
  purchasePending,
  onClose,
  onDeleteAccount,
  onPurchaseCredits,
  onSaveProviderSettings,
  onSignOut,
  onToggleModelEnabled,
}: StudioSettingsDialogProps) {
  const [hostedTab, setHostedTab] = useState<HostedSettingsTab>("credits");
  const [localTab, setLocalTab] = useState<LocalSettingsTab>("api-key");

  const currentTab =
    appMode === "hosted" ? hostedTab : localTab;

  return (
    <ModalShell
      open={open}
      title="Settings"
      hideHeader
      panelClassName="max-w-[82rem] rounded-[32px]"
      contentClassName="p-0"
      onClose={onClose}
    >
      <div className="border-b border-white/8 pl-6 pr-4 pt-4 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="text-2xl font-semibold tracking-tight text-white">
              {appMode === "hosted" ? "Account" : "Provider Settings"}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {appMode === "hosted" ? (
                <>
                  <SettingsTabButton
                    active={currentTab === "credits"}
                    label="Credits"
                    onClick={() => setHostedTab("credits")}
                  />
                  <SettingsTabButton
                    active={currentTab === "models"}
                    label="Model Configurations"
                    onClick={() => setHostedTab("models")}
                  />
                  <SettingsTabButton
                    active={currentTab === "account"}
                    label="Account Information"
                    onClick={() => setHostedTab("account")}
                  />
                </>
              ) : (
                <>
                  <SettingsTabButton
                    active={currentTab === "api-key"}
                    label="API Key"
                    onClick={() => setLocalTab("api-key")}
                  />
                  <SettingsTabButton
                    active={currentTab === "models"}
                    label="Model Configuration"
                    onClick={() => setLocalTab("models")}
                  />
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center self-start rounded-full border border-white/10 bg-white/[0.03] text-white/72 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
            aria-label="Close settings"
          >
            <X className="size-[18px]" />
          </button>
        </div>
      </div>

      <div className="px-6 py-6">
        {appMode === "hosted" ? (
          hostedTab === "credits" && hostedAccount ? (
            <CreditsTab
              account={hostedAccount}
              purchaseErrorMessage={purchaseErrorMessage}
              purchasePending={purchasePending}
              onPurchaseCredits={onPurchaseCredits}
            />
          ) : hostedTab === "models" ? (
            <ModelConfigurationTab
              modelConfiguration={modelConfiguration}
              onToggleModelEnabled={onToggleModelEnabled}
            />
          ) : hostedAccount ? (
            <AccountInformationTab
              account={hostedAccount}
              onDeleteAccount={onDeleteAccount}
              onSignOut={onSignOut}
            />
          ) : null
        ) : localTab === "api-key" ? (
          <ApiKeyTab
            key={`${providerSettings.falApiKey}:${providerSettings.lastValidatedAt ?? "none"}`}
            initialValues={providerSettings}
            providerConnectionStatus={providerConnectionStatus}
            onSave={onSaveProviderSettings}
          />
        ) : (
          <ModelConfigurationTab
            modelConfiguration={modelConfiguration}
            onToggleModelEnabled={onToggleModelEnabled}
          />
        )}
      </div>
    </ModalShell>
  );
}
