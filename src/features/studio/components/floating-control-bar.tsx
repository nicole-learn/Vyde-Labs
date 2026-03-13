"use client";

import { Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { cn } from "@/lib/cn";
import { readDraggedLibraryItems } from "../studio-drag-data";
import { canGenerateWithDraft } from "../studio-generation-rules";
import type {
  DraftReference,
  StudioDraft,
  StudioModelDefinition,
  StudioModelSection,
} from "../types";
import {
  ControlPillConfig,
  ModelSelectPill,
  SettingPillButton,
} from "./floating-control-bar/control-pills";
import {
  DragHintToast,
  DropErrorToast,
} from "./floating-control-bar/drag-feedback";
import {
  AddReferenceButton,
  getSupportedReferenceAcceptTypes,
  isReferenceFileSupported,
  ReferenceFileThumbnail,
  ReferencePreviewDialog,
} from "./floating-control-bar/reference-controls";
import { FrameSlot } from "./floating-control-bar/frame-controls";

interface FloatingControlBarProps {
  draft: StudioDraft;
  getDropHint: (itemIds: string[]) => string;
  model: StudioModelDefinition;
  models: StudioModelDefinition[];
  sections: ReadonlyArray<{
    id: StudioModelSection;
    title: string;
  }>;
  selectedModelId: string;
  onAddReferences: (files: File[]) => void;
  onDropLibraryItems: (itemIds: string[]) => Promise<string | null> | string | null;
  onGenerate: () => void;
  onRemoveReference: (referenceId: string) => void;
  onClearStartFrame: () => void;
  onClearEndFrame: () => void;
  onSelectModel: (modelId: string) => void;
  onSetStartFrame: (file: File) => void;
  onSetEndFrame: (file: File) => void;
  onSetVideoInputMode: (mode: "frames" | "references") => void;
  onUpdateDraft: (patch: Partial<StudioDraft>) => void;
  onDropLibraryItemsToStartFrame: (itemIds: string[]) => Promise<string | null> | string | null;
  onDropLibraryItemsToEndFrame: (itemIds: string[]) => Promise<string | null> | string | null;
}

export function FloatingControlBar({
  draft,
  getDropHint,
  model,
  models,
  sections,
  selectedModelId,
  onAddReferences,
  onDropLibraryItems,
  onGenerate,
  onRemoveReference,
  onClearStartFrame,
  onClearEndFrame,
  onSelectModel,
  onSetStartFrame,
  onSetEndFrame,
  onSetVideoInputMode,
  onUpdateDraft,
  onDropLibraryItemsToStartFrame,
  onDropLibraryItemsToEndFrame,
}: FloatingControlBarProps) {
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [previewReference, setPreviewReference] = useState<DraftReference | null>(
    null
  );
  const [dragOver, setDragOver] = useState(false);
  const [dragHint, setDragHint] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const dragDepthRef = useRef(0);
  const dropErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canGenerate = canGenerateWithDraft(model, draft);
  const maxReferenceFiles = model.maxReferenceFiles ?? 6;
  const supportsFrameInputs = model.kind === "video" && model.supportsFrameInputs;
  const showFrameControls = supportsFrameInputs && draft.videoInputMode === "frames";
  const showReferenceControls = model.supportsReferences && !showFrameControls;
  const canAddReferences =
    showReferenceControls && draft.references.length < maxReferenceFiles;
  const hasReferences = showReferenceControls && draft.references.length > 0;
  const referenceAcceptTypes = getSupportedReferenceAcceptTypes(model);

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

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setDragOver(false);
    setDragHint(null);
  }, []);

  useEffect(() => {
    if (!dragOver) {
      return;
    }

    const handleDocumentDragOver = (event: globalThis.DragEvent) => {
      const container = containerRef.current;
      if (!container) {
        resetDragState();
        return;
      }

      const rect = container.getBoundingClientRect();
      const isInside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!isInside) {
        resetDragState();
      }
    };

    const handleDocumentDragEnd = () => {
      resetDragState();
    };

    document.addEventListener("dragover", handleDocumentDragOver);
    document.addEventListener("dragend", handleDocumentDragEnd);
    document.addEventListener("drop", handleDocumentDragEnd);

    return () => {
      document.removeEventListener("dragover", handleDocumentDragOver);
      document.removeEventListener("dragend", handleDocumentDragEnd);
      document.removeEventListener("drop", handleDocumentDragEnd);
    };
  }, [dragOver, resetDragState]);

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

      const remaining = Math.max(0, maxReferenceFiles - draft.references.length);
      if (remaining <= 0) {
        showDropError(`Maximum ${maxReferenceFiles} reference files reached`);
        return;
      }

      const compatibleFiles = files.filter((file) =>
        isReferenceFileSupported(model, file)
      );

      if (compatibleFiles.length === 0 && files.length > 0) {
        showDropError("Those files are not supported as references for this model");
        return;
      }

      const filesToAdd = compatibleFiles.slice(0, remaining);
      if (filesToAdd.length < compatibleFiles.length) {
        showDropError(`Maximum ${maxReferenceFiles} reference files reached`);
      }

      if (filesToAdd.length > 0) {
        onAddReferences(filesToAdd);
      }
    },
    [
      draft.references.length,
      maxReferenceFiles,
      model,
      onAddReferences,
      showDropError,
    ]
  );

  const handleDragEnter = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const internalItemPayload = readDraggedLibraryItems(event.dataTransfer);
      if (internalItemPayload) {
        setDragHint(getDropHint(internalItemPayload.itemIds));
      } else if (event.dataTransfer.files.length > 0) {
        setDragHint(
          showReferenceControls
            ? "Drop files to add as references"
            : showFrameControls
              ? "Drop image files onto Start or End frame"
            : "This model doesn't support references yet"
        );
      } else {
        setDragHint(null);
      }

      dragDepthRef.current += 1;
      if (dragDepthRef.current === 1) {
        setDragOver(true);
      }
    },
    [getDropHint, showFrameControls, showReferenceControls]
  );

  const handleDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const internalItemPayload = readDraggedLibraryItems(event.dataTransfer);
      if (internalItemPayload) {
        event.dataTransfer.dropEffect = "copy";
        setDragHint(getDropHint(internalItemPayload.itemIds));
        return;
      }

      event.dataTransfer.dropEffect = "copy";
      setDragHint(
        event.dataTransfer.files.length > 0
          ? showReferenceControls
            ? "Drop files to add as references"
            : showFrameControls
              ? "Drop image files onto Start or End frame"
            : "This model doesn't support references yet"
          : null
      );
    },
    [getDropHint, showFrameControls, showReferenceControls]
  );

  const handleDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }

    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      resetDragState();
    }
  }, [resetDragState]);

  const handleDrop = useCallback(
    async (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();
      resetDragState();

      const internalItemPayload = readDraggedLibraryItems(event.dataTransfer);
      if (internalItemPayload) {
        const dropMessage = await onDropLibraryItems(internalItemPayload.itemIds);
        if (dropMessage) {
          showDropError(dropMessage);
        }
        return;
      }

      const droppedFiles = Array.from(event.dataTransfer.files ?? []);
      if (droppedFiles.length > 0) {
        if (showReferenceControls) {
          addDroppedReferenceFiles(droppedFiles);
        } else if (showFrameControls) {
          showDropError("Drop image files onto Start or End frame.");
        }
        return;
      }

      const plainText = event.dataTransfer.getData("text/plain").trim();
      if (plainText) {
        onUpdateDraft({
          prompt: draft.prompt.trim()
            ? `${draft.prompt.trim()}\n\n${plainText}`
            : plainText,
        });
      }
    },
    [
      addDroppedReferenceFiles,
      draft.prompt,
      onDropLibraryItems,
      onUpdateDraft,
      resetDragState,
      showFrameControls,
      showReferenceControls,
      showDropError,
    ]
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

    if (model.outputFormatOptions) {
      pills.push({
        id: "output-format",
        label: "Format",
        value: draft.outputFormat,
        options: model.outputFormatOptions.map((option) => ({
          value: option,
          label: option.toUpperCase(),
        })),
        onValueChange: (value) => onUpdateDraft({ outputFormat: value }),
      });
    }

    if (model.voiceOptions) {
      pills.push({
        id: "voice",
        label: "Voice",
        value: draft.voice,
        options: model.voiceOptions.map((option) => ({
          value: option,
          label: option
            .split(/[-_]/g)
            .map((segment) =>
              segment.length > 0
                ? `${segment[0].toUpperCase()}${segment.slice(1)}`
                : segment
            )
            .join(" "),
        })),
        onValueChange: (value) => onUpdateDraft({ voice: value }),
      });
    }

    if (model.languageOptions) {
      pills.push({
        id: "language",
        label: "Language",
        value: draft.language,
        options: model.languageOptions.map((option) => ({
          value: option,
          label: option,
        })),
        onValueChange: (value) => onUpdateDraft({ language: value }),
      });
    }

    if (model.speakingRateOptions) {
      pills.push({
        id: "speaking-rate",
        label: "Speed",
        value: draft.speakingRate,
        options: model.speakingRateOptions.map((option) => ({
          value: option,
          label: option,
        })),
        onValueChange: (value) => onUpdateDraft({ speakingRate: value }),
      });
    }

    if (model.maxTokenOptions) {
      pills.push({
        id: "max-tokens",
        label: "Max Tokens",
        value: `${draft.maxTokens}`,
        options: model.maxTokenOptions.map((option) => ({
          value: `${option}`,
          label: option.toLocaleString(),
        })),
        onValueChange: (value) =>
          onUpdateDraft({ maxTokens: Number(value) }),
      });
    }

    if (model.kind === "video" && model.durationOptions) {
      if (model.supportsFrameInputs && model.supportsReferences) {
        pills.push({
          id: "video-input-mode",
          label: "Input",
          value: draft.videoInputMode,
          options: [
            { value: "frames", label: "Frames" },
            { value: "references", label: "References" },
          ],
          onValueChange: (value) =>
            onSetVideoInputMode(value as "frames" | "references"),
        });
      }

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

    return pills;
  }, [
    draft.aspectRatio,
    draft.durationSeconds,
    draft.includeAudio,
    draft.language,
    draft.maxTokens,
    draft.outputFormat,
    draft.resolution,
    draft.speakingRate,
    draft.videoInputMode,
    draft.voice,
    model,
    onSetVideoInputMode,
    onUpdateDraft,
  ]);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-40 flex justify-center px-6">
        <div className="relative w-full max-w-6xl">
          <div className="pointer-events-auto">
            <div
              ref={containerRef}
              style={{
                backgroundImage:
                  "linear-gradient(165deg, color-mix(in oklch, var(--primary) 18%, black) 0%, color-mix(in oklch, var(--primary) 10%, black) 54%, color-mix(in oklch, var(--primary) 26%, black) 100%)",
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
              onDrop={(event) => {
                void handleDrop(event);
              }}
            >
              {dropError ? <DropErrorToast message={dropError} /> : null}
              {!dropError && dragOver && dragHint ? (
                <DragHintToast message={dragHint} />
              ) : null}

              <div className="flex items-stretch">
                <div className="flex min-w-0 flex-1 flex-col">
                  {hasReferences ? (
                    <div className="flex items-center gap-2 px-4 pb-1 pt-3">
                      {draft.references.map((reference) => (
                        <ReferenceFileThumbnail
                          key={reference.id}
                          reference={reference}
                          onPreviewReference={setPreviewReference}
                          onRemove={() => {
                            if (previewReference?.id === reference.id) {
                              setPreviewReference(null);
                            }
                            onRemoveReference(reference.id);
                          }}
                        />
                      ))}
                      <AddReferenceButton
                        acceptTypes={referenceAcceptTypes}
                        canAdd={canAddReferences}
                        onAdd={onAddReferences}
                        variant="thumbnail"
                      />
                    </div>
                  ) : null}

                  <div className="flex items-start">
                    {showReferenceControls && !hasReferences ? (
                      <div className="flex shrink-0 items-center pl-4 pt-3.5">
                        <AddReferenceButton
                          acceptTypes={referenceAcceptTypes}
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
                  {showFrameControls ? (
                    <div className="flex items-stretch gap-1.5">
                      <FrameSlot
                        frame={draft.startFrame}
                        label="Start"
                        onAddFile={onSetStartFrame}
                        onDropLibraryItems={onDropLibraryItemsToStartFrame}
                        onPreview={setPreviewReference}
                        onRemove={onClearStartFrame}
                        onShowError={showDropError}
                      />
                      {model.supportsEndFrame ? (
                        <FrameSlot
                          frame={draft.endFrame}
                          label="End"
                          onAddFile={onSetEndFrame}
                          onDropLibraryItems={onDropLibraryItemsToEndFrame}
                          onPreview={setPreviewReference}
                          onRemove={onClearEndFrame}
                          onShowError={showDropError}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={!canGenerate}
                    onClick={onGenerate}
                    style={{
                      background:
                        "linear-gradient(180deg, color-mix(in oklch, var(--primary) 78%, white) 0%, color-mix(in oklch, var(--primary) 88%, black) 100%)",
                    }}
                    className="flex h-[70px] items-center gap-2 rounded-xl px-5 text-base font-semibold tracking-tight text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_26px_color-mix(in_oklch,var(--primary)_18%,transparent)] transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
                  >
                    <span>Generate</span>
                    <Sparkles className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ReferencePreviewDialog
        reference={previewReference}
        onClose={() => setPreviewReference(null)}
      />
    </>
  );
}
