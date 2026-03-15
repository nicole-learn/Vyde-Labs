import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDraft } from "../studio-local-runtime-data";
import {
  STUDIO_MODEL_CATALOG,
  STUDIO_MODEL_SECTIONS,
} from "../studio-model-catalog";
import type { DraftReference, StudioDraft } from "../types";
import { FloatingControlBar } from "./floating-control-bar";

function getTextModel() {
  const textModel = STUDIO_MODEL_CATALOG.find((entry) => entry.id === "gpt-5.2");
  if (!textModel) {
    throw new Error("Expected at least one text model.");
  }

  return textModel;
}

function getModelById(modelId: string) {
  const model = STUDIO_MODEL_CATALOG.find((entry) => entry.id === modelId);
  if (!model) {
    throw new Error(`Expected model ${modelId}`);
  }
  return model;
}

function createImageReference(title: string): DraftReference {
  const file = new File(["image"], title, { type: "image/png" });

  return {
    id: `reference-${title}`,
    file,
    source: "upload",
    originAssetId: null,
    title,
    kind: "image",
    mimeType: file.type,
    previewUrl:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Crect width='128' height='128' fill='%232b7fff'/%3E%3C/svg%3E",
    previewSource: "owned",
  };
}

function renderFloatingControlBar(
  prompt = "",
  overrides?: {
    generatePending?: boolean;
    onSavePrompt?: () => void;
    models?: typeof STUDIO_MODEL_CATALOG;
    modelId?: string;
    draftPatch?: Partial<StudioDraft>;
  }
) {
  const model = overrides?.modelId
    ? getModelById(overrides.modelId)
    : getTextModel();
  const draft = {
    ...createDraft(model),
    prompt,
    ...(overrides?.draftPatch ?? {}),
  };
  const models =
    overrides?.models ??
    STUDIO_MODEL_CATALOG.filter((entry) =>
      model.familyId
        ? entry.familyId === model.familyId ||
          entry.id === "nano-banana-2" ||
          entry.id === "veo-3.1"
        : entry.id === model.id || entry.id === "nano-banana-2" || entry.id === "veo-3.1"
    );

  return render(
    <FloatingControlBar
      draft={draft}
      getDropHint={() => ""}
      model={model}
      models={models}
      sections={STUDIO_MODEL_SECTIONS}
      selectedModelId={model.id}
      onAddReferences={vi.fn()}
      onDropLibraryItems={vi.fn(() => null)}
      onGenerate={vi.fn()}
      generatePending={overrides?.generatePending ?? false}
      onRemoveReference={vi.fn()}
      onSavePrompt={overrides?.onSavePrompt ?? vi.fn()}
      savePromptPending={false}
      onClearStartFrame={vi.fn()}
      onClearEndFrame={vi.fn()}
      onSelectModel={vi.fn()}
      onSetStartFrame={vi.fn()}
      onSetEndFrame={vi.fn()}
      onSetVideoInputMode={vi.fn()}
      onUpdateDraft={vi.fn()}
      onDropLibraryItemsToStartFrame={vi.fn(() => null)}
      onDropLibraryItemsToEndFrame={vi.fn(() => null)}
    />
  );
}

describe("FloatingControlBar", () => {
  it("disables Save Prompt when the prompt is empty", () => {
    renderFloatingControlBar("");

    expect(screen.getByRole("button", { name: "Save Prompt" })).toBeDisabled();
  });

  it("calls onSavePrompt from the bottom pill row", async () => {
    const user = userEvent.setup();
    const onSavePrompt = vi.fn();

    renderFloatingControlBar("A foggy neon street at dawn", {
      onSavePrompt,
    });

    await user.click(screen.getByRole("button", { name: "Save Prompt" }));

    expect(onSavePrompt).toHaveBeenCalledTimes(1);
  });

  it("shows the text family in the main picker and the concrete model in the text pill", () => {
    renderFloatingControlBar("Summarize the attached references");

    expect(screen.getByRole("button", { name: "Select model" })).toHaveTextContent(
      "ChatGPT"
    );
    expect(screen.getByRole("button", { name: "Text Model" })).toHaveTextContent(
      "GPT-5.2"
    );
  });

  it("shows generate plus the quoted number on the generate button in the idle state", () => {
    renderFloatingControlBar("Summarize the attached references");

    const button = screen.getByRole("button", {
      name: /^Generate\s*[0-9]+(?:\.[0-9])?$/,
    });

    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("w-[176px]");
    expect(button).not.toHaveTextContent("•");
    expect(button).not.toHaveTextContent(/credits/i);
  });

  it("shows a loading state on the generate button while queueing", () => {
    renderFloatingControlBar("Summarize the attached references", {
      generatePending: true,
    });

    expect(screen.getByRole("button", { name: /Queuing/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Queuing/i })).toHaveAttribute(
      "aria-busy",
      "true"
    );
  });

  it("replaces the textarea with a background-removal instruction surface", () => {
    renderFloatingControlBar("", {
      modelId: "bria-rmbg-2",
      models: STUDIO_MODEL_CATALOG.filter(
        (entry) => entry.id === "bria-rmbg-2" || entry.id === "nano-banana-2"
      ),
    });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByText("ADD AN IMAGE HERE TO REMOVE THE BACKGROUND FOR IT.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Prompt" })).not.toBeInTheDocument();
  });

  it("replaces the background-removal instruction with the selected image thumbnail", () => {
    renderFloatingControlBar("", {
      modelId: "bria-rmbg-2",
      models: STUDIO_MODEL_CATALOG.filter(
        (entry) => entry.id === "bria-rmbg-2" || entry.id === "nano-banana-2"
      ),
      draftPatch: {
        references: [createImageReference("subject.png")],
      },
    });

    expect(
      screen.queryByText("ADD AN IMAGE HERE TO REMOVE THE BACKGROUND FOR IT.")
    ).not.toBeInTheDocument();
    expect(screen.getByAltText("subject.png")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Prompt" })).not.toBeInTheDocument();
  });

  it("shows the expected controls for every model in the catalog", () => {
    const controlLabels: Array<{
      condition: (model: (typeof STUDIO_MODEL_CATALOG)[number]) => boolean;
      label: string;
    }> = [
      { condition: (model) => Boolean(model.aspectRatioOptions), label: "Aspect Ratio" },
      { condition: (model) => Boolean(model.resolutionOptions), label: "Resolution" },
      { condition: (model) => Boolean(model.outputFormatOptions), label: "Format" },
      { condition: (model) => Boolean(model.voiceOptions), label: "Voice" },
      { condition: (model) => Boolean(model.languageOptions), label: "Language" },
      { condition: (model) => Boolean(model.speakingRateOptions), label: "Speed" },
      { condition: (model) => Boolean(model.durationOptions), label: "Duration" },
      {
        condition: (model) => model.kind === "video" && model.supportsFrameInputs && model.supportsReferences,
        label: "Input",
      },
      { condition: (model) => model.kind === "video", label: "Audio" },
    ];

    for (const model of STUDIO_MODEL_CATALOG) {
      const models =
        model.kind === "text" && model.familyId
          ? STUDIO_MODEL_CATALOG.filter(
              (entry) =>
                entry.familyId === model.familyId ||
                entry.id === "nano-banana-2" ||
                entry.id === "veo-3.1"
            )
          : STUDIO_MODEL_CATALOG.filter(
              (entry) => entry.id === model.id || entry.id === "gpt-5.2"
            );

      const { unmount } = renderFloatingControlBar(
        model.requestMode === "background-removal" ? "" : `Prompt for ${model.name}`,
        {
          modelId: model.id,
          models,
        }
      );

      expect(screen.getByRole("button", { name: "Select model" })).toBeInTheDocument();

      if (model.kind === "text") {
        expect(screen.getByRole("button", { name: "Text Model" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Aspect Ratio" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Duration" })).not.toBeInTheDocument();
      } else if (model.requestMode === "background-removal") {
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      } else {
        expect(screen.getByRole("textbox")).toBeInTheDocument();
      }

      for (const control of controlLabels) {
        const button = screen.queryByRole("button", { name: control.label });
        if (control.condition(model)) {
          expect(button).toBeInTheDocument();
        } else {
          expect(button).not.toBeInTheDocument();
        }
      }

      unmount();
    }
  });
});
