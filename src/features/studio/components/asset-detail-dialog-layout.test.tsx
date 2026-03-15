import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MediaAssetDialog } from "./asset-detail-dialog/media-asset-dialog";
import { GeneratedTextDialog } from "./asset-detail-dialog/generated-text-dialog";
import { UploadedTextDialog } from "./asset-detail-dialog/uploaded-text-dialog";
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

  it("closes an image popup when clicking stage padding but not when clicking the image", () => {
    const onClose = vi.fn();
    const item = createLibraryItem({
      title: "Landscape sample",
      kind: "image",
      source: "uploaded",
      role: "uploaded_source",
      previewUrl: "/mock-media/sample.png",
    });

    const { container } = render(
      <MediaAssetDialog
        item={item}
        onClose={onClose}
        onDelete={vi.fn()}
        onDownload={vi.fn()}
        onReuse={vi.fn()}
      />
    );

    const stageSurface = container.querySelector("[data-asset-stage-surface]");
    const image = screen.getByAltText("Landscape sample");

    Object.defineProperty(image, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 100,
        top: 100,
        right: 300,
        bottom: 250,
        width: 200,
        height: 150,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(stageSurface as HTMLElement, { clientX: 60, clientY: 60 });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(image, { clientX: 160, clientY: 160 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes an image popup when clicking the padding between the popup and screen edge", () => {
    const onClose = vi.fn();
    const item = createLibraryItem({
      title: "Landscape sample",
      kind: "image",
      source: "uploaded",
      role: "uploaded_source",
      previewUrl: "/mock-media/sample.png",
    });

    const { container } = render(
      <MediaAssetDialog
        item={item}
        onClose={onClose}
        onDelete={vi.fn()}
        onDownload={vi.fn()}
        onReuse={vi.fn()}
      />
    );

    const stageSurface = container.querySelector("[data-asset-stage-surface]");
    const image = screen.getByAltText("Landscape sample");

    Object.defineProperty(image, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 120,
        top: 100,
        right: 320,
        bottom: 250,
        width: 200,
        height: 150,
        x: 120,
        y: 100,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(stageSurface as HTMLElement, { clientX: 8, clientY: 8 });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes an image popup when clicking empty layout space below the info panel", () => {
    const onClose = vi.fn();
    const item = createLibraryItem({
      title: "Landscape sample",
      kind: "image",
      source: "uploaded",
      role: "uploaded_source",
      previewUrl: "/mock-media/sample.png",
    });

    const { container } = render(
      <MediaAssetDialog
        item={item}
        onClose={onClose}
        onDelete={vi.fn()}
        onDownload={vi.fn()}
        onReuse={vi.fn()}
      />
    );

    const layout = container.querySelector("[data-asset-dialog-layout]");

    fireEvent.click(layout as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(1);
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
        createdLabel="Mar 14, 10:00 AM"
        item={item}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onDownload={vi.fn()}
        onReuse={vi.fn()}
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

  it("removes the filename input from text asset dialogs", () => {
    const generatedItem = createLibraryItem({
      id: "asset-3",
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

    const { container, rerender } = render(
      <GeneratedTextDialog
        createdLabel="Mar 14, 10:00 AM"
        item={generatedItem}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onDownload={vi.fn()}
        onReuse={vi.fn()}
      />
    );

    expect(container.querySelector('input[type="text"]')).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Reuse Run" })).not.toHaveLength(0);

    const uploadedItem = createLibraryItem({
      id: "asset-4",
      title: "Uploaded note",
      kind: "text",
      source: "uploaded",
      role: "text_note",
      contentText: "Uploaded body",
      prompt: "Uploaded body",
      mimeType: "text/plain",
      fileName: "uploaded.txt",
      meta: "Text note",
    });

    rerender(
      <UploadedTextDialog
        body="Uploaded body"
        createdLabel="Mar 14, 10:00 AM"
        dirty={false}
        item={uploadedItem}
        onBodyChange={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onDownload={vi.fn()}
        onReuse={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(container.querySelector('input[type="text"]')).toBeNull();
    expect(container.querySelector("textarea")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Use in Prompt Bar" })).toBeInTheDocument();
  });
});
