"use client";

import {
  AudioLines,
  ChevronsUpDown,
  FileText,
  Image as ImageIcon,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  getPreferredStudioTextModelIdForFamily,
  getStudioTextFamilyLabel,
} from "../../studio-model-catalog";
import type {
  StudioModelDefinition,
  StudioModelSection,
  StudioTextModelFamilyId,
} from "../../types";

export interface ControlPillOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface ControlPillConfig {
  id: string;
  label: string;
  value: string;
  icon?: ReactNode;
  options: ControlPillOption[];
  onValueChange: (value: string) => void;
}

const ASPECT_RATIO_DIMENSIONS: Record<string, [number, number]> = {
  "1:1": [12, 12],
  "16:9": [14, 8],
  "9:16": [8, 14],
  "4:5": [10, 12],
  "5:4": [12, 10],
  "4:3": [13, 10],
  "3:4": [10, 13],
  "3:2": [13, 9],
  "2:3": [9, 13],
  "21:9": [15, 6],
  "9:21": [6, 15],
};

export function ModelKindIcon({
  kind,
  className,
}: {
  kind: StudioModelDefinition["kind"];
  className?: string;
}) {
  if (kind === "video") {
    return <Video className={className} />;
  }

  if (kind === "text") {
    return <FileText className={className} />;
  }

  if (kind === "audio") {
    return <AudioLines className={className} />;
  }

  return <ImageIcon className={className} />;
}

function AspectRatioIcon({
  ratio,
  className,
}: {
  ratio: string;
  className?: string;
}) {
  const dimensions = ASPECT_RATIO_DIMENSIONS[ratio];
  if (!dimensions) return null;

  const [width, height] = dimensions;

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className={className}>
      <rect
        x={(16 - width) / 2}
        y={(16 - height) / 2}
        width={width}
        height={height}
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function useDismissiblePopover(
  open: boolean,
  onClose: () => void
): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  return containerRef;
}

function PillMenu({
  align = "center",
  children,
  open,
  onClose,
  trigger,
}: {
  align?: "center" | "start";
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
}) {
  const containerRef = useDismissiblePopover(open, onClose);

  return (
    <div ref={containerRef} className="relative">
      {open ? (
        <div
          className={cn(
            "absolute bottom-full z-30 mb-2 w-fit min-w-36 rounded-xl border border-white/10 bg-background/98 p-2 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl",
            align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"
          )}
        >
          <div className="space-y-0.5">{children}</div>
        </div>
      ) : null}
      {trigger}
    </div>
  );
}

export function controlPillTriggerClassName() {
  return "flex h-7 w-fit items-center gap-1.5 whitespace-nowrap rounded-md border-0 bg-muted/60 px-2.5 py-1 text-xs font-medium shadow-sm transition-all hover:bg-muted/90 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.10),rgba(255,255,255,0.05))] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.16),rgba(255,255,255,0.09))] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
}

function PillOptionButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm whitespace-nowrap transition-colors",
        active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/60"
      )}
    >
      {children}
    </button>
  );
}

export function SettingPillButton({ pill }: { pill: ControlPillConfig }) {
  const [open, setOpen] = useState(false);
  const selectedLabel =
    pill.options.find((option) => option.value === pill.value)?.label ?? pill.value;

  return (
    <PillMenu
      open={open}
      onClose={() => setOpen(false)}
      trigger={
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={pill.label}
          className={controlPillTriggerClassName()}
        >
          {pill.icon ? (
            <span className="flex shrink-0 items-center">{pill.icon}</span>
          ) : null}
          <span>{selectedLabel}</span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
      }
    >
      {pill.options.map((option) => (
        <PillOptionButton
          key={option.value}
          active={option.value === pill.value}
          onClick={() => {
            pill.onValueChange(option.value);
            setOpen(false);
          }}
        >
          {option.icon ? (
            <span className="flex shrink-0 items-center">{option.icon}</span>
          ) : null}
          <span className="flex-1">{option.label}</span>
          {ASPECT_RATIO_DIMENSIONS[option.value] ? (
            <AspectRatioIcon ratio={option.value} className="shrink-0 opacity-70" />
          ) : null}
        </PillOptionButton>
      ))}
    </PillMenu>
  );
}

export function ModelSelectPill({
  models,
  sections,
  selectedModelId,
  onSelectModel,
}: {
  models: StudioModelDefinition[];
  sections: ReadonlyArray<{ id: StudioModelSection; title: string }>;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedModel =
    models.find((entry) => entry.id === selectedModelId) ?? models[0];
  const textFamilyOptions = Array.from(
    new Set(
      models
        .map((entry) => entry.familyId)
        .filter((familyId): familyId is StudioTextModelFamilyId => Boolean(familyId))
    )
  )
    .sort((left, right) =>
      getStudioTextFamilyLabel(left).localeCompare(getStudioTextFamilyLabel(right))
    )
    .map((familyId) => {
      const familyModels = models.filter((entry) => entry.familyId === familyId);
      return {
        familyId,
        label: getStudioTextFamilyLabel(familyId),
        modelIds: familyModels.map((entry) => entry.id),
      };
    });
  const selectedTextFamilyId =
    selectedModel.kind === "text" ? selectedModel.familyId ?? null : null;
  const selectedTextFamilyLabel =
    selectedTextFamilyId ? getStudioTextFamilyLabel(selectedTextFamilyId) : null;

  return (
    <PillMenu
      align="start"
      open={open}
      onClose={() => setOpen(false)}
      trigger={
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label="Select model"
          className={controlPillTriggerClassName()}
        >
          <ModelKindIcon
            kind={selectedModel.kind}
            className="size-3 shrink-0 opacity-50"
          />
          <span className="truncate">
            {selectedTextFamilyLabel ?? selectedModel.name}
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
      }
    >
      {sections.flatMap((section) =>
        section.id === "text"
          ? textFamilyOptions.map((entry) => {
              const active = entry.familyId === selectedTextFamilyId;
              const nextModelId =
                models.find((model) => model.id === selectedModelId && model.familyId === entry.familyId)
                  ?.id ??
                getPreferredStudioTextModelIdForFamily(entry.familyId, models) ??
                entry.modelIds[0];

              return (
                <PillOptionButton
                  key={entry.familyId}
                  active={active}
                  onClick={() => {
                    onSelectModel(nextModelId);
                    setOpen(false);
                  }}
                >
                  <ModelKindIcon kind="text" className="size-3.5 shrink-0" />
                  <span className="truncate">{entry.label}</span>
                </PillOptionButton>
              );
            })
          : models
              .filter((entry) => entry.section === section.id)
              .map((entry) => {
                const active = entry.id === selectedModelId;
                return (
                  <PillOptionButton
                    key={entry.id}
                    active={active}
                    onClick={() => {
                      onSelectModel(entry.id);
                      setOpen(false);
                    }}
                  >
                    <ModelKindIcon kind={entry.kind} className="size-3.5 shrink-0" />
                    <span className="truncate">{entry.name}</span>
                  </PillOptionButton>
                );
              })
      )}
    </PillMenu>
  );
}
