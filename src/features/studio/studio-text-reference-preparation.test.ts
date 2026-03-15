import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeTextReferenceForProvider } from "./studio-text-reference-preparation";
import type { DraftReference } from "./types";

function createVideoReference(title = "clip.mp4"): DraftReference {
  const file = new File(["video"], title, { type: "video/mp4" });

  return {
    id: `reference-${title}`,
    file,
    source: "upload",
    originAssetId: "asset-video",
    title,
    kind: "video",
    mimeType: file.type,
    previewUrl: "blob:video-preview",
    previewSource: "owned",
  };
}

function installFrameExtractionDomMocks() {
  const originalCreateElement = document.createElement.bind(document);

  const createElementSpy = vi
    .spyOn(document, "createElement")
    .mockImplementation(((tagName: string) => {
      if (tagName === "video") {
        const listeners = new Map<string, Array<() => void>>();
        return {
          preload: "",
          muted: false,
          playsInline: false,
          src: "",
          duration: 2,
          videoWidth: 1280,
          videoHeight: 720,
          addEventListener: (event: string, callback: () => void) => {
            listeners.set(event, [...(listeners.get(event) ?? []), callback]);
            if (event === "loadeddata") {
              queueMicrotask(callback);
            }
          },
          removeEventListener: vi.fn(),
          set currentTime(_value: number) {
            for (const callback of listeners.get("seeked") ?? []) {
              queueMicrotask(callback);
            }
          },
        } as unknown as HTMLVideoElement;
      }

      if (tagName === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: vi.fn(),
          }),
          toBlob: (callback: BlobCallback) => {
            callback(new Blob(["frame"], { type: "image/jpeg" }));
          },
        } as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement);

  return createElementSpy;
}

describe("normalizeTextReferenceForProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps Gemini video references as video inputs", async () => {
    const reference = createVideoReference();

    const normalized = await normalizeTextReferenceForProvider({
      model: {
        kind: "text",
        provider: "google",
      },
      reference,
    });

    expect(normalized.kind).toBe("video");
    expect(normalized.file).toBe(reference.file);
    expect(normalized.originAssetId).toBe("asset-video");
  });

  it("converts OpenAI and Anthropic video references into representative frame images", async () => {
    installFrameExtractionDomMocks();

    for (const provider of ["openai", "anthropic"] as const) {
      const reference = createVideoReference(`${provider}.mp4`);
      const normalized = await normalizeTextReferenceForProvider({
        model: {
          kind: "text",
          provider,
        },
        reference,
      });

      expect(normalized.kind).toBe("image");
      expect(normalized.file.type).toBe("image/jpeg");
      expect(normalized.title).toBe(`Frame from ${reference.title}`);
      expect(normalized.originAssetId).toBeNull();
      expect(normalized.source).toBe("upload");
    }
  });
});
