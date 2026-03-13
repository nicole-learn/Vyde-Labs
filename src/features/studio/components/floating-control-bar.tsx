"use client";

import {
  ChevronsUpDown,
  FileText,
  Image as ImageIcon,
  Play,
  Plus,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import type { StudioDraft, StudioModelDefinition, StudioModelSection } from "../types";

interface FloatingControlBarProps {
  draft: StudioDraft;
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

type ReferencePreviewKind = "image" | "video" | "file";

interface ControlPillOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface ControlPillConfig {
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

function pillTriggerClassName() {
  return "flex h-7 w-fit items-center gap-1.5 whitespace-nowrap rounded-md border-0 bg-muted/60 px-2.5 py-1 text-xs font-medium shadow-sm transition-all hover:bg-muted/90 dark:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.10),rgba(255,255,255,0.05))] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.16),rgba(255,255,255,0.09))] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
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

function SettingPillButton({ pill }: { pill: ControlPillConfig }) {
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
          className={pillTriggerClassName()}
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
  const [open, setOpen] = useState(false);
  const selectedModel =
    models.find((entry) => entry.id === selectedModelId) ?? models[0];

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
          className={pillTriggerClassName()}
        >
          <ModelKindIcon
            kind={selectedModel.kind}
            className="size-3 shrink-0 opacity-50"
          />
          <span className="truncate">{selectedModel.name}</span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
      }
    >
      {sections.flatMap((section) =>
        models
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

function AddReferenceButton({
  canAdd,
  onAdd,
  variant = "small",
}: {
  canAdd: boolean;
  onAdd: (files: File[]) => void;
  variant?: "small" | "thumbnail";
}) {
  return (
    <label
      className={cn(
        "flex shrink-0 items-center justify-center border border-dashed border-border/70 text-muted-foreground transition-colors",
        canAdd
          ? "cursor-pointer hover:bg-muted/50 hover:text-foreground"
          : "cursor-not-allowed opacity-50",
        variant === "thumbnail" ? "size-14 rounded-lg" : "size-7 rounded-md"
      )}
      aria-label="Add reference file"
      title="Add reference file"
    >
      <input
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        disabled={!canAdd}
        onChange={(event) => {
          onAdd(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <Plus className={variant === "thumbnail" ? "size-5" : "size-3.5"} />
    </label>
  );
}

function getReferencePreviewKind(file: File): ReferencePreviewKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

function ReferenceFileThumbnail({
  file,
  onPreview,
  onRemove,
}: {
  file: File;
  onPreview: (file: File) => void;
  onRemove: () => void;
}) {
  const previewKind = getReferencePreviewKind(file);
  const previewUrl = useMemo(() => {
    if (previewKind === "file") return null;
    return URL.createObjectURL(file);
  }, [file, previewKind]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div
      className="group relative size-14 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-muted/70 transition-transform duration-200 hover:scale-105"
      title={file.name}
    >
      <button
        type="button"
        onClick={() => onPreview(file)}
        className="absolute inset-0 z-10 cursor-zoom-in rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-primary/60"
        aria-label={`Preview ${file.name}`}
      />

      {previewKind === "video" && previewUrl ? (
        <div className="relative size-full">
          <video
            src={previewUrl}
            muted
            playsInline
            preload="metadata"
            className="size-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/45 p-1.5 backdrop-blur-sm">
              <Play className="size-4 text-white" />
            </span>
          </div>
        </div>
      ) : previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt={file.name} className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center bg-muted/80">
          <FileText className="size-4 text-muted-foreground/60" />
        </div>
      )}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        className="absolute right-0 top-0 z-20 flex size-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-black/85 group-hover:opacity-100 group-focus-within:opacity-100"
        aria-label={`Remove ${file.name}`}
      >
        <X className="size-3 text-white" />
      </button>
    </div>
  );
}

function ReferencePreviewDialog({
  file,
  onClose,
}: {
  file: File | null;
  onClose: () => void;
}) {
  const previewKind = useMemo(
    () => (file ? getReferencePreviewKind(file) : null),
    [file]
  );
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  if (!file || !previewUrl) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative flex max-h-[80vh] w-full max-w-4xl items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white transition hover:bg-black/70"
          aria-label="Close preview"
        >
          <X className="size-4" />
        </button>

        {previewKind === "video" ? (
          <video
            src={previewUrl}
            controls
            autoPlay
            playsInline
            className="max-h-[80vh] w-full bg-black object-contain"
          />
        ) : previewKind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={file.name}
            className="max-h-[80vh] w-full object-contain"
          />
        ) : (
          <div className="flex min-h-[18rem] w-full flex-col items-center justify-center gap-4 px-8 py-10 text-center text-white">
            <FileText className="size-8 text-white/70" />
            <div className="space-y-1">
              <div className="text-sm font-medium">{file.name}</div>
              <div className="text-xs text-white/60">
                Preview is not available for this file type.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DropErrorToast({ message }: { message: string }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 absolute inset-x-0 -top-10 flex justify-center">
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive shadow-lg backdrop-blur-sm">
        {message}
      </div>
    </div>
  );
}

export function FloatingControlBar({
  draft,
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
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const dragDepthRef = useRef(0);
  const dropErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canGenerate = draft.prompt.trim().length > 0;
  const canAddReferences = draft.references.length < 6;
  const hasReferences = draft.references.length > 0;
  const acceptsDrop = true;

  useEffect(() => {
    const textarea = promptRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 320)}px`;
  }, [draft.prompt]);

  useEffect(() => {
    return () => {
      if (dropErrorTimerRef.current) {
        clearTimeout(dropErrorTimerRef.current);
      }
    };
  }, []);

  const showDropError = useCallback((message: string) => {
    if (dropErrorTimerRef.current) {
      clearTimeout(dropErrorTimerRef.current);
    }

    setDropError(message);
    dropErrorTimerRef.current = setTimeout(() => setDropError(null), 3500);
  }, []);

  const addDroppedReferenceFiles = useCallback(
    (files: File[]) => {
      if (!model.supportsReferences) {
        return;
      }

      const remaining = Math.max(0, 6 - draft.references.length);
      if (remaining <= 0) {
        showDropError("Maximum 6 reference files reached");
        return;
      }

      const compatibleFiles = files.filter(
        (file) => file.type.startsWith("image/") || file.type.startsWith("video/")
      );

      if (compatibleFiles.length === 0 && files.length > 0) {
        showDropError("Only image and video files can be added as references");
        return;
      }

      const filesToAdd = compatibleFiles.slice(0, remaining);
      if (filesToAdd.length < compatibleFiles.length) {
        showDropError("Maximum 6 reference files reached");
      }

      if (filesToAdd.length > 0) {
        onAddReferences(filesToAdd);
      }
    },
    [draft.references.length, model.supportsReferences, onAddReferences, showDropError]
  );

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!acceptsDrop) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      if (dragDepthRef.current === 1) {
        setDragOver(true);
      }
    },
    [acceptsDrop]
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!acceptsDrop) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = model.supportsReferences ? "copy" : "move";
    },
    [acceptsDrop, model.supportsReferences]
  );

  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!acceptsDrop) return;
      event.preventDefault();
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && event.currentTarget.contains(nextTarget)) {
        return;
      }

      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setDragOver(false);
      }
    },
    [acceptsDrop]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!acceptsDrop) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setDragOver(false);

      const droppedFiles = Array.from(event.dataTransfer.files ?? []);
      if (droppedFiles.length > 0) {
        addDroppedReferenceFiles(droppedFiles);
        return;
      }

      const plainText = event.dataTransfer.getData("text/plain");
      if (plainText) {
        onUpdateDraft({ prompt: plainText });
      }
    },
    [acceptsDrop, addDroppedReferenceFiles, onUpdateDraft]
  );

  const settingPills = useMemo<ControlPillConfig[]>(() => {
    const pills: ControlPillConfig[] = [];

    if (model.aspectRatioOptions) {
      pills.push({
        id: "aspect-ratio",
        label: "Aspect Ratio",
        value: draft.aspectRatio,
        options: model.aspectRatioOptions.map((option) => ({
          value: option,
          label: option,
        })),
        onValueChange: (value) => onUpdateDraft({ aspectRatio: value }),
      });
    }

    if (model.resolutionOptions) {
      pills.push({
        id: "resolution",
        label: "Resolution",
        value: draft.resolution,
        options: model.resolutionOptions.map((option) => ({
          value: option,
          label: option,
        })),
        onValueChange: (value) => onUpdateDraft({ resolution: value }),
      });
    }

    if (model.kind === "image" && model.imageCountOptions) {
      pills.push({
        id: "outputs",
        label: "Outputs",
        value: `${draft.imageCount}`,
        options: model.imageCountOptions.map((option) => ({
          value: `${option}`,
          label: `${option}`,
        })),
        onValueChange: (value) => onUpdateDraft({ imageCount: Number(value) }),
      });
    }

    if (model.kind === "video" && model.durationOptions) {
      pills.push({
        id: "duration",
        label: "Duration",
        value: `${draft.durationSeconds}`,
        options: model.durationOptions.map((option) => ({
          value: `${option}`,
          label: `${option}s`,
        })),
        onValueChange: (value) =>
          onUpdateDraft({ durationSeconds: Number(value) }),
      });
    }

    if (model.kind === "video") {
      pills.push({
        id: "audio",
        label: "Audio",
        value: draft.includeAudio ? "on" : "off",
        options: [
          { value: "on", label: "On" },
          { value: "off", label: "Off" },
        ],
        onValueChange: (value) =>
          onUpdateDraft({ includeAudio: value === "on" }),
      });
    }

    if (model.kind === "text" && model.toneOptions) {
      pills.push({
        id: "tone",
        label: "Tone",
        value: draft.tone,
        options: model.toneOptions.map((option) => ({
          value: option,
          label: option,
        })),
        onValueChange: (value) => onUpdateDraft({ tone: value }),
      });
    }

    if (model.kind === "text" && model.maxTokenOptions) {
      pills.push({
        id: "max-tokens",
        label: "Tokens",
        value: `${draft.maxTokens}`,
        options: model.maxTokenOptions.map((option) => ({
          value: `${option}`,
          label: `${option}`,
        })),
        onValueChange: (value) => onUpdateDraft({ maxTokens: Number(value) }),
      });
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
    onUpdateDraft,
  ]);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-40 flex justify-center px-6">
        <div className="relative w-full max-w-6xl">
          <div className="pointer-events-auto">
            <div
              style={{
                backgroundImage:
                  "linear-gradient(170deg, oklch(0.14 0.006 200 / 0.5) 0%, oklch(0.23 0.004 220 / 0.5) 70%, oklch(0.29 0.012 195 / 0.5) 100%)",
              }}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col rounded-2xl border bg-card/90 backdrop-blur-2xl transition-[border-color,box-shadow] duration-300",
                dragOver
                  ? "border-2 border-primary shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_0_1px_color-mix(in_oklch,var(--primary)_35%,transparent)]"
                  : "border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
              )}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {dropError ? <DropErrorToast message={dropError} /> : null}

              <div className="flex items-stretch">
                <div className="flex min-w-0 flex-1 flex-col">
                  {hasReferences ? (
                    <div className="flex items-center gap-2 px-4 pb-1 pt-3">
                      {draft.references.map((reference) => (
                        <ReferenceFileThumbnail
                          key={reference.id}
                          file={reference.file}
                          onPreview={setPreviewFile}
                          onRemove={() => {
                            if (previewFile === reference.file) {
                              setPreviewFile(null);
                            }
                            onRemoveReference(reference.id);
                          }}
                        />
                      ))}
                      <AddReferenceButton
                        canAdd={canAddReferences}
                        onAdd={onAddReferences}
                        variant="thumbnail"
                      />
                    </div>
                  ) : null}

                  <div className="flex items-start">
                    {model.supportsReferences && !hasReferences ? (
                      <div className="flex shrink-0 items-center pl-4 pt-3.5">
                        <AddReferenceButton
                          canAdd={canAddReferences}
                          onAdd={onAddReferences}
                        />
                      </div>
                    ) : null}

                    <div className="min-w-0 flex-1 px-3 py-3">
                      <textarea
                        ref={promptRef}
                        value={draft.prompt}
                        onChange={(event) =>
                          onUpdateDraft({ prompt: event.target.value })
                        }
                        placeholder={model.promptPlaceholder ?? "Write your prompt here"}
                        className="field-sizing-content min-h-[1.5rem] max-h-80 w-full resize-none overflow-y-auto border-0 bg-transparent px-2 py-1 text-sm leading-5 text-foreground shadow-none outline-none focus-visible:ring-0 dark:bg-transparent"
                        rows={1}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
                    <ModelSelectPill
                      models={models}
                      sections={sections}
                      selectedModelId={selectedModelId}
                      onSelectModel={onSelectModel}
                    />
                    {settingPills.map((pill) => (
                      <SettingPillButton key={pill.id} pill={pill} />
                    ))}
                  </div>
                </div>

                <div className="flex shrink-0 items-end gap-2 p-3">
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
        </div>
      </div>

      <ReferencePreviewDialog file={previewFile} onClose={() => setPreviewFile(null)} />
    </>
  );
}
