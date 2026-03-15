"use client";

import type { DraftReference, StudioModelDefinition } from "./types";

function sanitizeReferenceImageFileName(title: string) {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "reference-frame";
}

async function extractVideoFrameFile(reference: DraftReference) {
  const videoUrl = URL.createObjectURL(reference.file);

  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    await new Promise<void>((resolve, reject) => {
      const handleLoadedData = () => resolve();
      const handleError = () => reject(new Error("The video reference could not be decoded."));

      video.addEventListener("loadeddata", handleLoadedData, { once: true });
      video.addEventListener("error", handleError, { once: true });
    });

    if (video.duration && Number.isFinite(video.duration) && video.duration > 0.2) {
      await new Promise<void>((resolve, reject) => {
        const handleSeeked = () => resolve();
        const handleError = () => reject(new Error("The video reference frame could not be read."));

        video.addEventListener("seeked", handleSeeked, { once: true });
        video.addEventListener("error", handleError, { once: true });
        video.currentTime = Math.min(0.15, Math.max(video.duration * 0.05, 0.01));
      });
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, video.videoWidth || 1);
    canvas.height = Math.max(1, video.videoHeight || 1);

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("The browser could not prepare a video reference frame.");
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (!value) {
            reject(new Error("The video reference frame could not be encoded."));
            return;
          }
          resolve(value);
        },
        "image/jpeg",
        0.92
      );
    });

    return new File(
      [blob],
      `${sanitizeReferenceImageFileName(reference.title)}-frame.jpg`,
      {
        type: "image/jpeg",
        lastModified: Date.now(),
      }
    );
  } finally {
    URL.revokeObjectURL(videoUrl);
  }
}

export async function normalizeTextReferenceForProvider(params: {
  model: Pick<StudioModelDefinition, "kind" | "provider">;
  reference: DraftReference;
}) {
  if (params.model.kind !== "text" || params.reference.kind !== "video") {
    return {
      file: params.reference.file,
      kind: params.reference.kind,
      title: params.reference.title,
      mimeType: params.reference.mimeType,
      originAssetId: params.reference.originAssetId,
      source: params.reference.source,
    };
  }

  if (params.model.provider === "google") {
    return {
      file: params.reference.file,
      kind: params.reference.kind,
      title: params.reference.title,
      mimeType: params.reference.mimeType,
      originAssetId: params.reference.originAssetId,
      source: params.reference.source,
    };
  }

  const imageFile = await extractVideoFrameFile(params.reference);

  return {
    file: imageFile,
    kind: "image" as const,
    title: `Frame from ${params.reference.title}`,
    mimeType: imageFile.type,
    originAssetId: null,
    source: "upload" as const,
  };
}
