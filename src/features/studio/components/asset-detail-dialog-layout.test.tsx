import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MediaAssetDialog } from "./asset-detail-dialog/media-asset-dialog";
import { GeneratedTextDialog } from "./asset-detail-dialog/generated-text-dialog";
import type { LibraryItem } from "../types";

function createLibraryItem(overrides: Partial<LibraryItem>): LibraryItem {
  return {
    id: "asset-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    runFileId: null,
    sourceRunId: null,
    title: "Asset sample",
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
    meta: "PNG • Uploaded",
    mediaWidth: 1024,
    mediaHeight: 768,
    mediaDurationSeconds: null,
    aspectRatioLabel: "4:3",
    hasAlpha: false,
    folderId: null,
    storageBucket: "local-fs",
    storagePath: null,
    thumbnailPath: null,
    fileName: "asset.png",
    mimeType: "image/png",
    byteSize: 1024,
    metadata: {},
    errorMessage: null,
    ...overrides,
  };
}

describe("asset detail dialog layout", () => {
  it("keeps the media info rail content-sized and caps it with internal scrolling", () => {
    const item = createLibraryItem({
      title: "Landscape sample",
      kind: "image",
      source: "uploaded",
      role: "uploaded_source",
    });

    const { container } = render(
      <MediaAssetDialog
        item={item}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onDownload={vi.fn()}
        onReuse={vi.fn()}
      />
    );

    expect(container.firstElementChild).toHaveClass("z-[10000]");

    const infoPanel = screen
      .getByRole("heading", { name: "Landscape sample" })
      .closest("aside");

    expect(infoPanel).toHaveClass(
      "rounded-2xl",
      "overflow-hidden",
      "lg:max-h-[calc(100vh-1.5rem)]",
      "lg:self-start"
    );
  });

  it("uses the same high layer and content-sized info rail for generated text assets", () => {
    const item = createLibraryItem({
      id: "asset-2",
      title: "Generated note",
      kind: "text",
      source: "generated",
      role: "generated_output",
      contentText: "Generated body",
      prompt: "Write a short summary.",
      mimeType: "text/plain",
      fileName: "generated.txt",
      meta: "Text • Generated",
    });

    const { container } = render(
      <GeneratedTextDialog
        body="Generated body"
        createdLabel="Mar 14, 10:00 AM"
        dirty={false}
        item={item}
        onBodyChange={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onDownload={vi.fn()}
        onReuse={vi.fn()}
        onSave={vi.fn()}
        onTitleChange={vi.fn()}
        title="Generated note"
      />
    );

    expect(container.firstElementChild).toHaveClass("z-[10000]");

    const infoPanel = container.querySelector(".w-\\[360px\\]");

    expect(infoPanel).toHaveClass(
      "rounded-2xl",
      "overflow-hidden",
      "lg:max-h-[calc(100vh-1.5rem)]",
      "lg:self-start"
    );
    expect(infoPanel).not.toHaveClass("h-[85vh]");
  });
});
