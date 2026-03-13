"use client";

import {
  AudioLines,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Plus,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { StudioDraft, StudioModelDefinition, StudioModelSection } from "../types";

interface FloatingControlBarProps {
  draft: StudioDraft;
  hasFalKey: boolean;
  model: StudioModelDefinition;
  models: StudioModelDefinition[];
  sections: ReadonlyArray<{
    id: StudioModelSection;
    title: string;
  }>;
  selectedModelId: string;
  onAddReferences: (files: File[]) => void;
  onGenerate: () => void;
  onRemoveReference: (referenceId: string) => void;
  onSelectModel: (modelId: string) => void;
  onUpdateDraft: (patch: Partial<StudioDraft>) => void;
}

function ModelKindIcon({
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

  return <ImageIcon className={className} />;
}

function SelectPill({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const selectedOptionLabel =
    options.find((option) => option.value === value)?.label ?? value;

  return (
    <label className="relative flex h-7 w-fit items-center gap-1.5 overflow-hidden rounded-md bg-muted/60 px-2.5 text-xs font-medium shadow-sm transition-all hover:bg-muted/90 dark:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.10),rgba(255,255,255,0.05))] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.16),rgba(255,255,255,0.09))]">
      <span className="text-white/88">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="text-white/62">{selectedOptionLabel}</span>
    </label>
  );
}

function ModelSelectPill({
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
  const selectedModel = models.find((entry) => entry.id === selectedModelId) ?? models[0];

  return (
    <label className="relative flex h-7 w-fit items-center gap-1.5 overflow-hidden rounded-md bg-muted/60 px-2.5 text-xs font-medium shadow-sm transition-all hover:bg-muted/90 dark:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.10),rgba(255,255,255,0.05))] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.16),rgba(255,255,255,0.09))]">
      <ModelKindIcon kind={selectedModel.kind} className="size-3 shrink-0 opacity-60" />
      <span className="max-w-40 truncate text-white/88">{selectedModel.name}</span>
      <select
        value={selectedModelId}
        onChange={(event) => onSelectModel(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Select model"
      >
        {sections.map((section) => (
          <optgroup key={section.id} label={section.title}>
            {models
              .filter((model) => model.section === section.id)
              .map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function ReferenceThumbnail({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const previewUrl = useMemo(() => {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      return null;
    }

    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const icon = file.type.startsWith("video/") ? (
    <Video className="size-4 text-white/70" />
  ) : file.type.startsWith("image/") ? (
    <ImageIcon className="size-4 text-white/70" />
  ) : (
    <FileText className="size-4 text-white/70" />
  );

  return (
    <div
      className="group relative size-14 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-muted/70 transition-transform duration-200 hover:scale-105"
      title={file.name}
    >
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt={file.name} className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center bg-muted/80">
          {icon}
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-0 top-0 z-20 flex size-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-black/85 group-hover:opacity-100 group-focus-within:opacity-100"
        aria-label={`Remove ${file.name}`}
      >
        <X className="size-3 text-white" />
      </button>
    </div>
  );
}

function AddReferenceButton({
  large = false,
  onAdd,
}: {
  large?: boolean;
  onAdd: (files: File[]) => void;
}) {
  return (
    <label
      className={cn(
        "flex shrink-0 cursor-pointer items-center justify-center border border-dashed border-border/70 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
        large ? "size-14 rounded-lg" : "size-7 rounded-md"
      )}
      aria-label="Add reference files"
      title="Add reference files"
    >
      <input
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(event) => {
          onAdd(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <Plus className={large ? "size-5" : "size-3.5"} />
    </label>
  );
}

export function FloatingControlBar({
  draft,
  hasFalKey,
  model,
  models,
  sections,
  selectedModelId,
  onAddReferences,
  onGenerate,
  onRemoveReference,
  onSelectModel,
  onUpdateDraft,
}: FloatingControlBarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const canGenerate = draft.prompt.trim().length > 0 && hasFalKey;

  useEffect(() => {
    const textarea = promptRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 320)}px`;
  }, [draft.prompt]);

  const settingPills = useMemo(() => {
    const pills: ReactNode[] = [
      <ModelSelectPill
        key="model"
        models={models}
        sections={sections}
        selectedModelId={selectedModelId}
        onSelectModel={onSelectModel}
      />,
    ];

    if (model.aspectRatioOptions) {
      pills.push(
        <SelectPill
          key="aspectRatio"
          label="Aspect"
          options={model.aspectRatioOptions.map((option) => ({
            label: option,
            value: option,
          }))}
          value={draft.aspectRatio}
          onChange={(value) => onUpdateDraft({ aspectRatio: value })}
        />
      );
    }

    if (model.resolutionOptions) {
      pills.push(
        <SelectPill
          key="resolution"
          label="Resolution"
          options={model.resolutionOptions.map((option) => ({
            label: option,
            value: option,
          }))}
          value={draft.resolution}
          onChange={(value) => onUpdateDraft({ resolution: value })}
        />
      );
    }

    if (model.kind === "image" && model.imageCountOptions) {
      pills.push(
        <SelectPill
          key="outputs"
          label="Outputs"
          options={model.imageCountOptions.map((option) => ({
            label: `${option}`,
            value: `${option}`,
          }))}
          value={`${draft.imageCount}`}
          onChange={(value) => onUpdateDraft({ imageCount: Number(value) })}
        />
      );
    }

    if (model.kind === "video" && model.durationOptions) {
      pills.push(
        <SelectPill
          key="duration"
          label="Duration"
          options={model.durationOptions.map((option) => ({
            label: `${option}s`,
            value: `${option}`,
          }))}
          value={`${draft.durationSeconds}`}
          onChange={(value) => onUpdateDraft({ durationSeconds: Number(value) })}
        />
      );
    }

    if (model.kind === "text" && model.toneOptions) {
      pills.push(
        <SelectPill
          key="tone"
          label="Tone"
          options={model.toneOptions.map((option) => ({
            label: option,
            value: option,
          }))}
          value={draft.tone}
          onChange={(value) => onUpdateDraft({ tone: value })}
        />
      );
    }

    if (model.kind === "text" && model.maxTokenOptions) {
      pills.push(
        <SelectPill
          key="maxTokens"
          label="Tokens"
          options={model.maxTokenOptions.map((option) => ({
            label: `${option}`,
            value: `${option}`,
          }))}
          value={`${draft.maxTokens}`}
          onChange={(value) => onUpdateDraft({ maxTokens: Number(value) })}
        />
      );
    }

    if (model.kind === "video") {
      pills.push(
        <button
          key="audio"
          type="button"
          onClick={() => onUpdateDraft({ includeAudio: !draft.includeAudio })}
          className={cn(
            "flex h-7 w-fit items-center gap-1.5 whitespace-nowrap rounded-md py-1 px-2.5 text-xs font-medium shadow-sm transition-all",
            draft.includeAudio
              ? "bg-primary text-primary-foreground"
              : "bg-muted/60 text-white/88 hover:bg-muted/90 dark:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.10),rgba(255,255,255,0.05))] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)]"
          )}
        >
          <AudioLines className="size-3.5" />
          Audio
        </button>
      );
    }

    return pills;
  }, [
    draft.aspectRatio,
    draft.durationSeconds,
    draft.imageCount,
    draft.includeAudio,
    draft.maxTokens,
    draft.resolution,
    draft.tone,
    model,
    models,
    onSelectModel,
    onUpdateDraft,
    sections,
    selectedModelId,
  ]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-40 flex justify-center px-6">
      <div className="relative w-full max-w-6xl">
        {!collapsed ? (
          <div className="pointer-events-auto">
            <div
              style={{
                backgroundImage:
                  "linear-gradient(170deg, oklch(0.14 0.006 200 / 0.5) 0%, oklch(0.23 0.004 220 / 0.5) 70%, oklch(0.29 0.012 195 / 0.5) 100%)",
              }}
              className="relative flex min-w-0 flex-1 flex-col rounded-2xl border border-white/[0.08] bg-card/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-2xl"
            >
              <div className="flex items-stretch">
                <div className="flex min-w-0 flex-1 flex-col">
                  {draft.references.length > 0 ? (
                    <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                      {draft.references.map((reference) => (
                        <ReferenceThumbnail
                          key={reference.id}
                          file={reference.file}
                          onRemove={() => onRemoveReference(reference.id)}
                        />
                      ))}
                      <AddReferenceButton large onAdd={onAddReferences} />
                    </div>
                  ) : null}

                  <div className="flex items-start">
                    {model.supportsReferences && draft.references.length === 0 ? (
                      <div className="flex shrink-0 items-center pl-4 pt-3.5">
                        <AddReferenceButton onAdd={onAddReferences} />
                      </div>
                    ) : null}

                    <div className="min-w-0 flex-1 px-3 py-3">
                      <textarea
                        ref={promptRef}
                        value={draft.prompt}
                        onChange={(event) => onUpdateDraft({ prompt: event.target.value })}
                        placeholder={model.promptPlaceholder}
                        className="min-h-[1.5rem] max-h-80 w-full resize-none overflow-y-auto border-0 bg-transparent px-2 py-1 text-sm leading-5 text-foreground shadow-none outline-none"
                        rows={1}
                      />
                    </div>
                  </div>

                  {settingPills.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
                      {settingPills}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-end gap-2 p-3">
                  {!hasFalKey ? (
                    <div className="max-w-44 self-center text-right text-xs text-amber-300/90">
                      Add your Fal key to generate.
                    </div>
                  ) : null}

                  <button
                    type="button"
                    disabled={!canGenerate}
                    onClick={onGenerate}
                    style={{
                      background:
                        "linear-gradient(to bottom, oklch(0.82 0.10 190), oklch(0.65 0.11 190))",
                    }}
                    className="flex h-[70px] items-center gap-2 rounded-xl px-5 text-base font-semibold tracking-tight text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
                  >
                    <span>Generate</span>
                    <span className="inline-flex items-center gap-1 text-base">
                      <Sparkles className="size-4" />
                      <span>Fal</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className={cn(
            "pointer-events-auto absolute bottom-4 z-10 flex items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-[width,height,right,box-shadow,transform,filter,background-color] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:scale-105 hover:brightness-110 hover:shadow-[0_0_12px_3px_color-mix(in_oklch,var(--secondary)_20%,transparent),0_4px_14px_rgba(0,0,0,0.25)] active:scale-95 active:bg-[oklch(0.55_0.18_258)]",
            collapsed ? "right-[-5.5rem] size-20 shadow-lg" : "right-[-5rem] size-14"
          )}
          aria-label={collapsed ? "Expand prompt bar" : "Minimize prompt bar"}
          title={collapsed ? "Expand prompt bar" : "Minimize prompt bar"}
        >
          {collapsed ? (
            <Sparkles className="size-8" />
          ) : (
            <ChevronRight className="size-7" />
          )}
        </button>
      </div>
    </div>
  );
}
