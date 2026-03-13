import type { LibraryItem, LibraryItemKind } from "./types";

export interface StudioAssetMediaMetadata {
  mediaWidth: number | null;
  mediaHeight: number | null;
  aspectRatioLabel: string | null;
}

const FALLBACK_ASPECT_RATIOS: Record<LibraryItemKind, number> = {
  image: 1,
  video: 16 / 9,
  text: 0.82,
};

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(Math.round(a));
  let right = Math.abs(Math.round(b));

  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }

  return left || 1;
}

export function parseAspectRatioLabel(label: string | null | undefined) {
  if (!label) {
    return null;
  }

  const [widthPart, heightPart] = label.split(":");
  const width = Number(widthPart);
  const height = Number(heightPart);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

export function formatAspectRatioLabel(params: {
  mediaWidth: number | null | undefined;
  mediaHeight: number | null | undefined;
}) {
  const mediaWidth = params.mediaWidth ?? null;
  const mediaHeight = params.mediaHeight ?? null;

  if (
    !mediaWidth ||
    !mediaHeight ||
    !Number.isFinite(mediaWidth) ||
    !Number.isFinite(mediaHeight) ||
    mediaWidth <= 0 ||
    mediaHeight <= 0
  ) {
    return null;
  }

  const divisor = greatestCommonDivisor(mediaWidth, mediaHeight);
  return `${Math.round(mediaWidth / divisor)}:${Math.round(mediaHeight / divisor)}`;
}

export function createMediaMetadataFromAspectRatioLabel(
  kind: LibraryItemKind,
  aspectRatioLabel: string | null | undefined
): StudioAssetMediaMetadata {
  if (kind === "text") {
    return {
      mediaWidth: null,
      mediaHeight: null,
      aspectRatioLabel: null,
    };
  }

  const parsedRatio = parseAspectRatioLabel(aspectRatioLabel);
  if (!parsedRatio) {
    return {
      mediaWidth: null,
      mediaHeight: null,
      aspectRatioLabel: aspectRatioLabel?.trim() || null,
    };
  }

  return {
    mediaWidth: parsedRatio.width * 100,
    mediaHeight: parsedRatio.height * 100,
    aspectRatioLabel: `${parsedRatio.width}:${parsedRatio.height}`,
  };
}

export function getDisplayAspectRatioFromMediaMetadata(params: {
  kind: LibraryItemKind;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  aspectRatioLabel?: string | null;
}) {
  const mediaWidth = params.mediaWidth ?? null;
  const mediaHeight = params.mediaHeight ?? null;

  if (
    mediaWidth &&
    mediaHeight &&
    Number.isFinite(mediaWidth) &&
    Number.isFinite(mediaHeight) &&
    mediaWidth > 0 &&
    mediaHeight > 0
  ) {
    return mediaWidth / mediaHeight;
  }

  const parsedRatio = parseAspectRatioLabel(params.aspectRatioLabel);
  if (parsedRatio) {
    return parsedRatio.width / parsedRatio.height;
  }

  return FALLBACK_ASPECT_RATIOS[params.kind];
}

export function getLibraryItemDisplayAspectRatio(
  item: Pick<LibraryItem, "kind" | "mediaWidth" | "mediaHeight" | "aspectRatioLabel">
) {
  return getDisplayAspectRatioFromMediaMetadata({
    kind: item.kind,
    mediaWidth: item.mediaWidth,
    mediaHeight: item.mediaHeight,
    aspectRatioLabel: item.aspectRatioLabel,
  });
}

async function readImageDimensions(previewUrl: string) {
  return new Promise<{ mediaWidth: number | null; mediaHeight: number | null }>((resolve) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        mediaWidth: image.naturalWidth || null,
        mediaHeight: image.naturalHeight || null,
      });
    };

    image.onerror = () => {
      resolve({
        mediaWidth: null,
        mediaHeight: null,
      });
    };

    image.src = previewUrl;
  });
}

async function readVideoDimensions(previewUrl: string) {
  return new Promise<{ mediaWidth: number | null; mediaHeight: number | null }>((resolve) => {
    const video = document.createElement("video");

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const mediaWidth = video.videoWidth || null;
      const mediaHeight = video.videoHeight || null;
      cleanup();
      resolve({ mediaWidth, mediaHeight });
    };

    video.onerror = () => {
      cleanup();
      resolve({
        mediaWidth: null,
        mediaHeight: null,
      });
    };

    video.src = previewUrl;
  });
}

export async function readUploadedAssetMediaMetadata(params: {
  kind: Extract<LibraryItemKind, "image" | "video">;
  previewUrl: string;
}) {
  const dimensions =
    params.kind === "video"
      ? await readVideoDimensions(params.previewUrl)
      : await readImageDimensions(params.previewUrl);

  return {
    ...dimensions,
    aspectRatioLabel: formatAspectRatioLabel(dimensions),
  } satisfies StudioAssetMediaMetadata;
}
