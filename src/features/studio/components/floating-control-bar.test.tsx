import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDraft } from "../studio-local-runtime-data";
import {
  STUDIO_MODEL_CATALOG,
  STUDIO_MODEL_SECTIONS,
} from "../studio-model-catalog";
import { FloatingControlBar } from "./floating-control-bar";

function getTextModel() {
  const textModel = STUDIO_MODEL_CATALOG.find((entry) => entry.id === "gpt-5.2");
  if (!textModel) {
    throw new Error("Expected at least one text model.");
  }

  return textModel;
}

function renderFloatingControlBar(
  prompt = "",
  overrides?: {
    generatePending?: boolean;
    onSavePrompt?: () => void;
    models?: typeof STUDIO_MODEL_CATALOG;
  }
) {
  const model = getTextModel();
  const draft = {
    ...createDraft(model),
    prompt,
  };
  const models =
    overrides?.models ??
    STUDIO_MODEL_CATALOG.filter(
      (entry) =>
        entry.familyId === model.familyId ||
        entry.id === "nano-banana-2" ||
        entry.id === "veo-3.1"
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
});
