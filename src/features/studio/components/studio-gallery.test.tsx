import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioGallery } from "./studio-gallery";
import type { GenerationRun, LibraryItem } from "../types";

function createImageItem(): LibraryItem {
  return {
    id: "item-image",
    userId: "user-1",
    workspaceId: "workspace-1",
    runFileId: null,
    sourceRunId: null,
    title: "Boardwalk still",
    kind: "image",
    source: "uploaded",
    role: "uploaded_source",
    previewUrl: null,
    thumbnailUrl: null,
    contentText: null,
    createdAt: "2026-03-14T10:00:00.000Z",
    updatedAt: "2026-03-14T10:00:00.000Z",
    modelId: null,
    runId: null,
    provider: "fal",
    status: "ready",
    prompt: "",
    meta: "16:9",
    mediaWidth: 1600,
    mediaHeight: 900,
    mediaDurationSeconds: null,
    aspectRatioLabel: "16:9",
    hasAlpha: false,
    folderId: null,
    storageBucket: "local-fs",
    storagePath: null,
    thumbnailPath: null,
    fileName: "boardwalk.jpg",
    mimeType: "image/jpeg",
    byteSize: 420,
    metadata: {},
    errorMessage: null,
  };
}

function createTextItem(
  source: "uploaded" | "generated",
  overrides?: Partial<LibraryItem>
): LibraryItem {
  return {
    id: `item-${source}`,
    userId: "user-1",
    workspaceId: "workspace-1",
    runFileId: null,
    sourceRunId: null,
    title: "Alpha note",
    kind: "text",
    source,
    role: source === "generated" ? "generated_output" : "uploaded_source",
    previewUrl: null,
    thumbnailUrl: null,
    contentText: "This is a plain text card in the gallery.",
    createdAt: "2026-03-14T10:00:00.000Z",
    updatedAt: "2026-03-14T10:00:00.000Z",
    modelId: null,
    runId: null,
    provider: "fal",
    status: "ready",
    prompt: "",
    meta: "Helpful note",
    mediaWidth: null,
    mediaHeight: null,
    mediaDurationSeconds: null,
    aspectRatioLabel: null,
    hasAlpha: false,
    folderId: null,
    storageBucket: "local-fs",
    storagePath: null,
    thumbnailPath: null,
    fileName: "alpha-note.txt",
    mimeType: "text/plain",
    byteSize: 42,
    metadata: {},
    errorMessage: null,
    ...overrides,
  };
}

function createRun(
  status: GenerationRun["status"],
  overrides?: Partial<GenerationRun>
): GenerationRun {
  return {
    id: `run-${status}`,
    userId: "user-1",
    workspaceId: "workspace-1",
    folderId: null,
    deletedAt: null,
    modelId: "veo-3.1",
    modelName: "Veo 3.1",
    kind: "video",
    provider: "fal",
    requestMode: "text-to-video",
    status,
    prompt: "Cinematic waterfall at golden hour",
    createdAt: "2026-03-14T10:00:00.000Z",
    queueEnteredAt: "2026-03-14T10:00:00.000Z",
    startedAt: status === "processing" ? "2026-03-14T10:00:05.000Z" : null,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    updatedAt: "2026-03-14T10:00:05.000Z",
    summary: "Video generation",
    outputAssetId: null,
    previewUrl: null,
    errorMessage: null,
    inputPayload: {},
    inputSettings: {},
    providerRequestId: "req_123",
    providerStatus: status === "processing" ? "running" : "queued",
    estimatedCostUsd: 0.12,
    actualCostUsd: null,
    estimatedCredits: 1.4,
    actualCredits: null,
    usageSnapshot: {},
    outputText: null,
    pricingSnapshot: {},
    dispatchAttemptCount: 1,
    dispatchLeaseExpiresAt: null,
    canCancel: status === "queued" || status === "pending",
    draftSnapshot: {
      prompt: "Cinematic waterfall at golden hour",
      negativePrompt: "",
      videoInputMode: "references",
      aspectRatio: "16:9",
      resolution: "1080p",
      outputFormat: "mp4",
      imageCount: 1,
      durationSeconds: 6,
      includeAudio: false,
      tone: "",
      maxTokens: 0,
      temperature: 1,
      voice: "",
      language: "",
      speakingRate: "1x",
      referenceCount: 0,
      startFrameCount: 0,
      endFrameCount: 0,
    },
    ...overrides,
  };
}

describe("StudioGallery text cards", () => {
  const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth"
  );

  afterEach(() => {
    if (clientWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidthDescriptor);
      return;
    }

    Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  });

  it("does not render uploaded or generated source labels on text cards", async () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 960,
    });

    render(
      <StudioGallery
        emptyStateLabel="No assets"
        items={[createTextItem("uploaded"), createTextItem("generated")]}
        selectedItemIdSet={new Set()}
        selectionModeEnabled={false}
        sizeLevel={2}
        onDeleteItem={vi.fn()}
        onDownloadItem={vi.fn()}
        onOpenItem={vi.fn()}
        onReuseItem={vi.fn()}
        onToggleItemSelection={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText("This is a plain text card in the gallery.")).toHaveLength(2);
    });

    expect(screen.queryByText("uploaded")).not.toBeInTheDocument();
    expect(screen.queryByText("generated")).not.toBeInTheDocument();
  });

  it("uses even padding on text cards", async () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 960,
    });

    render(
      <StudioGallery
        emptyStateLabel="No assets"
        items={[createTextItem("uploaded")]}
        selectedItemIdSet={new Set()}
        selectionModeEnabled={false}
        sizeLevel={2}
        onDeleteItem={vi.fn()}
        onDownloadItem={vi.fn()}
        onOpenItem={vi.fn()}
        onReuseItem={vi.fn()}
        onToggleItemSelection={vi.fn()}
      />
    );

    const textBody = await screen.findByText("This is a plain text card in the gallery.");
    const cardBody = textBody.parentElement;

    expect(cardBody).toHaveClass("p-4");
    expect(cardBody).not.toHaveClass("pt-12");
  });

  it("shows a delete control for processing runs", async () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 960,
    });

    const onDeleteRun = vi.fn();

    render(
      <StudioGallery
        emptyStateLabel="No assets"
        items={[]}
        runCards={[createRun("processing")]}
        selectedItemIdSet={new Set()}
        selectionModeEnabled={false}
        sizeLevel={2}
        onDeleteItem={vi.fn()}
        onDeleteRun={onDeleteRun}
        onDownloadItem={vi.fn()}
        onOpenItem={vi.fn()}
        onReuseItem={vi.fn()}
        onToggleItemSelection={vi.fn()}
      />
    );

    const deleteButton = await screen.findByTitle("Delete generation");
    fireEvent.click(deleteButton);

    expect(onDeleteRun).toHaveBeenCalledWith("run-processing");
  });

  it("keeps generated outputs ordered by their source run chronology", async () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 960,
    });

    render(
      <StudioGallery
        allRuns={[
          createRun("completed", {
            id: "run-generated",
            outputAssetId: "item-generated",
            createdAt: "2026-03-14T10:00:00.000Z",
            queueEnteredAt: "2026-03-14T10:00:00.000Z",
            completedAt: "2026-03-14T10:10:00.000Z",
            updatedAt: "2026-03-14T10:10:00.000Z",
            canCancel: false,
            providerStatus: "completed",
          }),
        ]}
        emptyStateLabel="No assets"
        items={[
          createTextItem("generated", {
            id: "item-generated",
            title: "Generated note",
            sourceRunId: "run-generated",
            runId: "run-generated",
            createdAt: "2026-03-14T10:10:00.000Z",
            updatedAt: "2026-03-14T10:10:00.000Z",
          }),
          createTextItem("uploaded", {
            id: "item-uploaded",
            title: "Uploaded note",
            createdAt: "2026-03-14T10:05:00.000Z",
            updatedAt: "2026-03-14T10:05:00.000Z",
          }),
        ]}
        selectedItemIdSet={new Set()}
        selectionModeEnabled={false}
        sizeLevel={2}
        onDeleteItem={vi.fn()}
        onDownloadItem={vi.fn()}
        onOpenItem={vi.fn()}
        onReuseItem={vi.fn()}
        onToggleItemSelection={vi.fn()}
      />
    );

    const uploadedButton = await screen.findByRole("button", { name: "Uploaded note" });
    const generatedButton = await screen.findByRole("button", { name: "Generated note" });

    expect(
      uploadedButton.compareDocumentPosition(generatedButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
  });

  it("keeps equal-timestamp items in their input order", async () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 960,
    });

    render(
      <StudioGallery
        emptyStateLabel="No assets"
        items={[
          createTextItem("uploaded", {
            id: "item-first",
            title: "First note",
            createdAt: "2026-03-14T10:00:00.000Z",
            updatedAt: "2026-03-14T10:00:00.000Z",
          }),
          createTextItem("generated", {
            id: "item-second",
            title: "Second note",
            createdAt: "2026-03-14T10:00:00.000Z",
            updatedAt: "2026-03-14T10:00:00.000Z",
          }),
        ]}
        selectedItemIdSet={new Set()}
        selectionModeEnabled={false}
        sizeLevel={2}
        onDeleteItem={vi.fn()}
        onDownloadItem={vi.fn()}
        onOpenItem={vi.fn()}
        onReuseItem={vi.fn()}
        onToggleItemSelection={vi.fn()}
      />
    );

    const firstButton = await screen.findByRole("button", { name: "First note" });
    const secondButton = await screen.findByRole("button", { name: "Second note" });

    expect(
      firstButton.compareDocumentPosition(secondButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
  });

  it("makes gallery tiles larger as the size slider level increases", async () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 960,
    });

    const { container, rerender } = render(
      <StudioGallery
        emptyStateLabel="No assets"
        items={[createImageItem()]}
        selectedItemIdSet={new Set()}
        selectionModeEnabled={false}
        sizeLevel={0}
        onDeleteItem={vi.fn()}
        onDownloadItem={vi.fn()}
        onOpenItem={vi.fn()}
        onReuseItem={vi.fn()}
        onToggleItemSelection={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(container.querySelector(".group.shrink-0")).toBeTruthy();
    });

    const smallTile = container.querySelector(".group.shrink-0") as HTMLDivElement;
    const smallHeight = Number.parseFloat(smallTile.style.height);

    rerender(
      <StudioGallery
        emptyStateLabel="No assets"
        items={[createImageItem()]}
        selectedItemIdSet={new Set()}
        selectionModeEnabled={false}
        sizeLevel={6}
        onDeleteItem={vi.fn()}
        onDownloadItem={vi.fn()}
        onOpenItem={vi.fn()}
        onReuseItem={vi.fn()}
        onToggleItemSelection={vi.fn()}
      />
    );

    await waitFor(() => {
      const largeTile = container.querySelector(".group.shrink-0") as HTMLDivElement;
      expect(Number.parseFloat(largeTile.style.height)).toBeGreaterThan(smallHeight);
    });
  });
});
