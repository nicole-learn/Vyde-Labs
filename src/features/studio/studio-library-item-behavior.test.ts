import { describe, expect, it } from "vitest";
import {
  findReusableRunIdForLibraryItem,
  getLibraryItemReuseActionLabel,
  getLibraryItemReuseButtonLabel,
  getTextNotePromptBarValue,
  isGeneratedTextLibraryItem,
  isTextNoteLibraryItem,
  resolvePromptBarReuseModelId,
} from "./studio-library-item-behavior";
import type { GenerationRun, LibraryItem, StudioModelDefinition } from "./types";

function createItem(overrides?: Partial<LibraryItem>): LibraryItem {
  return {
    id: "asset-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    runFileId: null,
    sourceRunId: null,
    title: "Saved note",
    kind: "text",
    source: "uploaded",
    role: "text_note",
    previewUrl: null,
    thumbnailUrl: null,
    contentText: "Prompt note body",
    createdAt: "2026-03-14T10:00:00.000Z",
    updatedAt: "2026-03-14T10:00:00.000Z",
    modelId: null,
    runId: null,
    provider: "fal",
    status: "ready",
    prompt: "Prompt note body",
    meta: "Text note",
    mediaWidth: null,
    mediaHeight: null,
    mediaDurationSeconds: null,
    aspectRatioLabel: null,
    hasAlpha: false,
    folderId: null,
    storageBucket: "inline-text",
    storagePath: null,
    thumbnailPath: null,
    fileName: "saved-note.txt",
    mimeType: "text/plain",
    byteSize: 16,
    metadata: {},
    errorMessage: null,
    ...overrides,
  };
}

function createRun(
  overrides?: Partial<GenerationRun>
): Pick<GenerationRun, "id" | "outputAssetId"> {
  return {
    id: "run-1",
    outputAssetId: "asset-1",
    ...overrides,
  };
}

function createModel(
  overrides: Partial<Pick<StudioModelDefinition, "id" | "kind" | "section" | "requiresPrompt">>
): Pick<StudioModelDefinition, "id" | "kind" | "section" | "requiresPrompt"> {
  return {
    id: "nano-banana-2",
    kind: "image",
    section: "images",
    requiresPrompt: true,
    ...overrides,
  };
}

describe("studio-library-item-behavior", () => {
  it("distinguishes generated text from prompt notes", () => {
    expect(
      isGeneratedTextLibraryItem(
        createItem({ role: "generated_output", source: "generated" })
      )
    ).toBe(true);
    expect(
      isTextNoteLibraryItem(createItem({ role: "text_note", source: "uploaded" }))
    ).toBe(true);
  });

  it("returns the prompt-note text for prompt bar reuse", () => {
    expect(
      getTextNotePromptBarValue(createItem({ contentText: "  Prompt note body  " }))
    ).toBe("Prompt note body");
    expect(
      getTextNotePromptBarValue(createItem({ contentText: "", prompt: "  Fallback prompt  " }))
    ).toBe("Fallback prompt");
    expect(
      getTextNotePromptBarValue(createItem({ contentText: "", prompt: "", title: "  Title only  " }))
    ).toBe("Title only");
  });

  it("prefers the output asset link when resolving a reusable run", () => {
    const item = createItem({
      id: "asset-generated",
      source: "generated",
      role: "generated_output",
      runId: "run-secondary",
      sourceRunId: "run-primary",
    });

    expect(
      findReusableRunIdForLibraryItem(item, [
        createRun({ id: "run-primary" }),
        createRun({ id: "run-linked", outputAssetId: "asset-generated" }),
        createRun({ id: "run-secondary" }),
      ])
    ).toBe("run-linked");
  });

  it("falls back to stored run ids when the output asset link is missing", () => {
    const item = createItem({
      id: "asset-generated",
      source: "generated",
      role: "generated_output",
      runId: "run-secondary",
      sourceRunId: "run-primary",
    });

    expect(
      findReusableRunIdForLibraryItem(item, [createRun({ id: "run-primary" })])
    ).toBe("run-primary");
    expect(
      findReusableRunIdForLibraryItem(
        createItem({
          id: "asset-generated",
          source: "generated",
          role: "generated_output",
          runId: "run-secondary",
          sourceRunId: null,
        }),
        [createRun({ id: "run-secondary" })]
      )
    ).toBe("run-secondary");
  });

  it("moves prompt-note reuse off non-prompt models", () => {
    expect(
      resolvePromptBarReuseModelId({
        currentModelId: "bria-rmbg-2",
        models: [
          createModel({
            id: "bria-rmbg-2",
            kind: "image",
            section: "images",
            requiresPrompt: false,
          }),
          createModel({
            id: "nano-banana-2",
            kind: "image",
            section: "images",
            requiresPrompt: true,
          }),
          createModel({
            id: "gpt-5.4",
            kind: "text",
            section: "text",
            requiresPrompt: true,
          }),
        ],
      })
    ).toBe("nano-banana-2");
  });

  it("returns the role-specific reuse labels", () => {
    expect(getLibraryItemReuseActionLabel(createItem())).toBe("Copy note to prompt bar");
    expect(getLibraryItemReuseButtonLabel(createItem())).toBe("Use in Prompt Bar");
    expect(
      getLibraryItemReuseActionLabel(
        createItem({ source: "generated", role: "generated_output" })
      )
    ).toBe("Restore run context");
    expect(
      getLibraryItemReuseButtonLabel(
        createItem({ source: "generated", role: "generated_output" })
      )
    ).toBe("Reuse Run");
  });
});
