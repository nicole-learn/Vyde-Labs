import { createHash, timingSafeEqual } from "node:crypto";
import { createFalClient } from "@fal-ai/client";
import sodium from "libsodium-wrappers";
import {
  createMediaMetadataFromAspectRatioLabel,
  formatAspectRatioLabel,
} from "@/features/studio/studio-asset-metadata";
import {
  getStudioModelById,
  requireStudioModelById,
} from "@/features/studio/studio-model-catalog";
import {
  LOCAL_PROVIDER_KEY_COOKIE_NAMES,
} from "@/features/studio/studio-provider-constants";
import { getFalServerEnv } from "@/lib/supabase/env";
import type {
  PersistedStudioDraft,
  StudioGenerationRequestMode,
  StudioModelKind,
  StudioProviderSettings,
  StudioReferenceInputKind,
} from "@/features/studio/types";
const FAL_JWKS_URL = "https://rest.alpha.fal.ai/.well-known/jwks.json";
const FAL_WEBHOOK_TIMESTAMP_LEEWAY_SECONDS = 300;
const FAL_WEBHOOK_JWKS_CACHE_MS = 24 * 60 * 60 * 1000;

type FalWebhookJwk = {
  x?: string;
};

type FalWebhookJwksResponse = {
  keys?: FalWebhookJwk[];
};

type FalWebhookHeaders = {
  requestId: string;
  userId: string;
  timestamp: string;
  signatureHex: string;
};

type FalWebhookCache = {
  expiresAt: number;
  keys: Uint8Array[];
};

let falWebhookKeyCache: FalWebhookCache | null = null;

export interface StudioFalInputFile {
  slot: "reference" | "start_frame" | "end_frame";
  kind: StudioReferenceInputKind;
  title: string;
  file: Blob;
  fileName: string | null;
  mimeType: string | null;
}

export interface StudioFalQueuedRequest {
  endpointId: string;
  requestId: string;
}

export interface StudioFalCompletedPayload {
  outputKind: StudioModelKind;
  outputText: string | null;
  outputFile:
    | {
        url: string;
        fileName: string | null;
        mimeType: string | null;
        mediaWidth: number | null;
        mediaHeight: number | null;
        mediaDurationSeconds: number | null;
        aspectRatioLabel: string | null;
        hasAlpha: boolean;
      }
    | null;
  providerPayload: Record<string, unknown>;
  usageSnapshot: Record<string, unknown>;
}

const IMAGE_SIZE_BY_ASPECT_RATIO: Record<string, string> = {
  "1:1": "square_hd",
  "4:3": "landscape_4_3",
  "3:4": "portrait_4_3",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
};

function createClient(falKey: string) {
  return createFalClient({
    credentials: falKey,
  });
}

async function getFalWebhookPublicKeys() {
  const now = Date.now();
  if (falWebhookKeyCache && falWebhookKeyCache.expiresAt > now) {
    return falWebhookKeyCache.keys;
  }

  const response = await fetch(FAL_JWKS_URL, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Could not load Fal webhook verification keys.");
  }

  const payload = (await response.json()) as FalWebhookJwksResponse;
  await sodium.ready;

  const keys = (payload.keys ?? [])
    .map((entry) => entry.x?.trim() ?? "")
    .filter((value) => value.length > 0)
    .map((value) =>
      sodium.from_base64(value, sodium.base64_variants.URLSAFE_NO_PADDING)
    );

  if (keys.length === 0) {
    throw new Error("Fal webhook verification keys were empty.");
  }

  falWebhookKeyCache = {
    keys,
    expiresAt: now + FAL_WEBHOOK_JWKS_CACHE_MS,
  };

  return keys;
}

function getFalWebhookHeaders(headers: Headers): FalWebhookHeaders {
  const requestId = headers.get("x-fal-webhook-request-id")?.trim() ?? "";
  const userId = headers.get("x-fal-webhook-user-id")?.trim() ?? "";
  const timestamp = headers.get("x-fal-webhook-timestamp")?.trim() ?? "";
  const signatureHex = headers.get("x-fal-webhook-signature")?.trim() ?? "";

  if (!requestId || !userId || !timestamp || !signatureHex) {
    throw new Error("Fal webhook verification headers were incomplete.");
  }

  return {
    requestId,
    userId,
    timestamp,
    signatureHex,
  };
}

function verifyFalWebhookToken(request: Request) {
  const { webhookSecret } = getFalServerEnv();
  if (!webhookSecret) {
    throw new Error("FAL_WEBHOOK_SECRET is not configured.");
  }

  const requestToken = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!requestToken) {
    throw new Error("Fal webhook token was missing.");
  }

  const expected = Buffer.from(webhookSecret, "utf8");
  const actual = Buffer.from(requestToken, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Fal webhook token verification failed.");
  }
}

async function verifyFalWebhookSignature(params: {
  headers: FalWebhookHeaders;
  rawBody: Uint8Array;
}) {
  await sodium.ready;

  const timestampInt = Number.parseInt(params.headers.timestamp, 10);
  const currentTime = Math.floor(Date.now() / 1000);
  if (
    !Number.isFinite(timestampInt) ||
    Math.abs(currentTime - timestampInt) > FAL_WEBHOOK_TIMESTAMP_LEEWAY_SECONDS
  ) {
    return false;
  }

  const bodyHashHex = createHash("sha256")
    .update(Buffer.from(params.rawBody))
    .digest("hex");
  const message = Buffer.from(
    [
      params.headers.requestId,
      params.headers.userId,
      params.headers.timestamp,
      bodyHashHex,
    ].join("\n"),
    "utf8"
  );
  const signature = sodium.from_hex(params.headers.signatureHex);
  const publicKeys = await getFalWebhookPublicKeys();

  return publicKeys.some((publicKey) =>
    sodium.crypto_sign_verify_detached(signature, message, publicKey)
  );
}

function sanitizeAspectRatio(aspectRatio: string, fallback: string) {
  return aspectRatio.trim() || fallback;
}

function sanitizeDurationSeconds(durationSeconds: number, fallback: number) {
  const normalized = Math.max(0, Math.round(durationSeconds));
  return normalized > 0 ? normalized : fallback;
}

function toProviderDuration(durationSeconds: number) {
  return `${sanitizeDurationSeconds(durationSeconds, 4)}s`;
}

function getImageSizeFromAspectRatio(aspectRatio: string) {
  return IMAGE_SIZE_BY_ASPECT_RATIO[aspectRatio] ?? "square_hd";
}

async function uploadInputFilesToFal(
  falKey: string,
  inputs: StudioFalInputFile[]
) {
  const client = createClient(falKey);
  return Promise.all(
    inputs.map(async (input) => ({
      ...input,
      url: await client.storage.upload(input.file, {
        lifecycle: { expiresIn: "1d" },
      }),
    }))
  );
}

function groupInputUrls(
  uploadedInputs: Array<StudioFalInputFile & { url: string }>
) {
  return {
    references: uploadedInputs
      .filter((input) => input.slot === "reference")
      .map((input) => input.url),
    startFrame:
      uploadedInputs.find((input) => input.slot === "start_frame")?.url ?? null,
    endFrame:
      uploadedInputs.find((input) => input.slot === "end_frame")?.url ?? null,
  };
}

export function buildStudioFalQueuedRequest(params: {
  modelId: string;
  requestMode: StudioGenerationRequestMode;
  draft: PersistedStudioDraft;
  inputUrls: ReturnType<typeof groupInputUrls>;
}) {
  const { draft, inputUrls, modelId, requestMode } = params;

  switch (modelId) {
    case "nano-banana-2": {
      if (inputUrls.references.length > 0) {
        return {
          endpointId: "fal-ai/nano-banana-2/edit",
          input: {
            prompt: draft.prompt,
            image_urls: inputUrls.references,
            aspect_ratio: sanitizeAspectRatio(draft.aspectRatio, "auto"),
            resolution: draft.resolution || "1K",
            output_format: draft.outputFormat || "png",
            num_images: 1,
            limit_generations: true,
          },
        };
      }

      return {
        endpointId: "fal-ai/nano-banana-2",
        input: {
          prompt: draft.prompt,
          aspect_ratio: sanitizeAspectRatio(draft.aspectRatio, "auto"),
          resolution: draft.resolution || "1K",
          output_format: draft.outputFormat || "png",
          num_images: 1,
          limit_generations: true,
        },
      };
    }
    case "flux-kontext-pro": {
      if (inputUrls.references.length > 0) {
        return {
          endpointId: "fal-ai/flux-pro/kontext",
          input: {
            prompt: draft.prompt,
            image_url: inputUrls.references[0],
            aspect_ratio: sanitizeAspectRatio(draft.aspectRatio, "1:1"),
            output_format: draft.outputFormat || "png",
          },
        };
      }

      return {
        endpointId: "fal-ai/flux-pro/kontext/text-to-image",
        input: {
          prompt: draft.prompt,
          aspect_ratio: sanitizeAspectRatio(draft.aspectRatio, "1:1"),
          output_format: draft.outputFormat || "png",
        },
      };
    }
    case "qwen-image-2-pro":
      return {
        endpointId: "fal-ai/qwen-image-2/pro/text-to-image",
        input: {
          prompt: draft.prompt,
          negative_prompt: draft.negativePrompt || undefined,
          image_size: getImageSizeFromAspectRatio(draft.aspectRatio),
          output_format: draft.outputFormat || "png",
          num_images: 1,
        },
      };
    case "recraft-v4-pro":
      return {
        endpointId: "fal-ai/recraft/v4/pro/text-to-image",
        input: {
          prompt: draft.prompt,
          image_size: getImageSizeFromAspectRatio(draft.aspectRatio),
        },
      };
    case "bria-rmbg-2":
      if (inputUrls.references.length === 0) {
        throw new Error("Background removal requires an image.");
      }

      return {
        endpointId: "fal-ai/bria/background/remove",
        input: {
          image_url: inputUrls.references[0],
        },
      };
    case "pixelcut-background-removal":
      if (inputUrls.references.length === 0) {
        throw new Error("Background removal requires an image.");
      }

      return {
        endpointId: "pixelcut/background-removal",
        input: {
          image_url: inputUrls.references[0],
          output_format: "rgba",
        },
      };
    case "veo-3.1":
    case "veo-3.1-fast": {
      const baseEndpoint =
        modelId === "veo-3.1-fast" ? "fal-ai/veo3.1/fast" : "fal-ai/veo3.1";

      if (requestMode === "first-last-frame-to-video") {
        return {
          endpointId: `${baseEndpoint}/first-last-frame-to-video`,
          input: {
            prompt: draft.prompt,
            first_frame_url: inputUrls.startFrame,
            last_frame_url: inputUrls.endFrame,
            aspect_ratio: sanitizeAspectRatio(draft.aspectRatio, "16:9"),
            duration: toProviderDuration(draft.durationSeconds),
            resolution: draft.resolution === "4K" ? "4k" : draft.resolution || "1080p",
            generate_audio: draft.includeAudio,
            negative_prompt: draft.negativePrompt || undefined,
          },
        };
      }

      if (requestMode === "image-to-video") {
        const imageUrl = inputUrls.startFrame ?? inputUrls.references[0] ?? null;
        if (!imageUrl) {
          throw new Error("Image-to-video generation requires an image input.");
        }

        return {
          endpointId: `${baseEndpoint}/image-to-video`,
          input: {
            prompt: draft.prompt,
            image_url: imageUrl,
            aspect_ratio: sanitizeAspectRatio(draft.aspectRatio, "16:9"),
            duration: toProviderDuration(draft.durationSeconds),
            resolution: draft.resolution === "4K" ? "4k" : draft.resolution || "1080p",
            generate_audio: draft.includeAudio,
            negative_prompt: draft.negativePrompt || undefined,
          },
        };
      }

      if (requestMode === "reference-to-video") {
        if (modelId === "veo-3.1-fast") {
          throw new Error("Veo 3.1 Fast does not support multi-reference video generation.");
        }

        return {
          endpointId: `${baseEndpoint}/reference-to-video`,
          input: {
            prompt: draft.prompt,
            image_urls: inputUrls.references,
            aspect_ratio: sanitizeAspectRatio(draft.aspectRatio, "16:9"),
            resolution: draft.resolution === "4K" ? "4k" : draft.resolution || "1080p",
            generate_audio: draft.includeAudio,
          },
        };
      }

      return {
        endpointId: baseEndpoint,
        input: {
          prompt: draft.prompt,
          aspect_ratio: sanitizeAspectRatio(draft.aspectRatio, "16:9"),
          duration: toProviderDuration(draft.durationSeconds),
          resolution: draft.resolution === "4K" ? "4k" : draft.resolution || "1080p",
          generate_audio: draft.includeAudio,
          negative_prompt: draft.negativePrompt || undefined,
        },
      };
    }
    case "kling-o3-pro":
    case "kling-video-v3-pro": {
      const baseEndpoint =
        modelId === "kling-o3-pro"
          ? "fal-ai/kling-video/o3/pro"
          : "fal-ai/kling-video/v3/pro";

      if (requestMode === "reference-to-video") {
        return {
          endpointId: `${baseEndpoint}/reference-to-video`,
          input: {
            prompt: draft.prompt,
            image_urls: inputUrls.references,
            duration: sanitizeDurationSeconds(draft.durationSeconds, 5),
            aspect_ratio: sanitizeAspectRatio(draft.aspectRatio, "16:9"),
            generate_audio: draft.includeAudio,
          },
        };
      }

      if (requestMode === "image-to-video") {
        const imageUrl = inputUrls.references[0] ?? null;
        if (!imageUrl) {
          throw new Error("Image-to-video generation requires an image input.");
        }

        return {
          endpointId: `${baseEndpoint}/image-to-video`,
          input: {
            prompt: draft.prompt,
            image_url: imageUrl,
            duration: sanitizeDurationSeconds(draft.durationSeconds, 5),
            aspect_ratio: sanitizeAspectRatio(draft.aspectRatio, "16:9"),
            generate_audio: draft.includeAudio,
          },
        };
      }

      return {
        endpointId: `${baseEndpoint}/text-to-video`,
        input: {
          prompt: draft.prompt,
          duration: sanitizeDurationSeconds(draft.durationSeconds, 5),
          aspect_ratio: sanitizeAspectRatio(draft.aspectRatio, "16:9"),
          generate_audio: draft.includeAudio,
        },
      };
    }
    case "minimax-speech-2.8-hd":
      return {
        endpointId: "fal-ai/minimax/speech-2.8-hd",
        input: {
          prompt: draft.prompt,
          language_boost: draft.language || "English",
          output_format: "url",
          audio_setting: {
            format:
              draft.outputFormat === "flac" || draft.outputFormat === "mp3"
                ? draft.outputFormat
                : "mp3",
          },
          voice_setting: {
            voice_id: (draft.voice || "Wise Woman").replaceAll(" ", "_"),
            speed: Number.parseFloat(draft.speakingRate) || 1,
            vol: 1,
            pitch: 0,
            english_normalization: false,
          },
        },
      };
    case "orpheus-tts":
      return {
        endpointId: "fal-ai/orpheus-tts",
        input: {
          text: draft.prompt,
          voice: (draft.voice || "tara").toLowerCase(),
          temperature: draft.temperature || 0.7,
        },
      };
    case "chatterbox-tts":
      return {
        endpointId: "fal-ai/chatterbox/text-to-speech",
        input: {
          text: draft.prompt,
          temperature: draft.temperature || 0.7,
        },
      };
    case "dia-tts":
      return {
        endpointId: "fal-ai/dia-tts",
        input: {
          text: draft.prompt,
        },
      };
    default:
      throw new Error(`${getStudioModelById(modelId).name} is not ready for provider execution yet.`);
  }
}

function pickFilesFromPayload(value: unknown): Array<Record<string, unknown>> {
  const files: Array<Record<string, unknown>> = [];
  const stack: unknown[] = [value];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (!Array.isArray(current)) {
      const record = current as Record<string, unknown>;
      if (typeof record.url === "string") {
        files.push(record);
      }
      for (const nested of Object.values(record)) {
        stack.push(nested);
      }
      continue;
    }

    for (const nested of current) {
      stack.push(nested);
    }
  }

  return files;
}

function inferMimeType(file: Record<string, unknown>, fallbackKind: StudioModelKind) {
  const explicitContentType =
    typeof file.content_type === "string"
      ? file.content_type
      : typeof file.mime_type === "string"
        ? file.mime_type
        : null;

  if (explicitContentType) {
    return explicitContentType;
  }

  const url = typeof file.url === "string" ? file.url : "";
  const normalizedUrl = url.toLowerCase();
  if (normalizedUrl.endsWith(".png")) return "image/png";
  if (normalizedUrl.endsWith(".jpg") || normalizedUrl.endsWith(".jpeg")) return "image/jpeg";
  if (normalizedUrl.endsWith(".webp")) return "image/webp";
  if (normalizedUrl.endsWith(".mp4")) return "video/mp4";
  if (normalizedUrl.endsWith(".webm")) return "video/webm";
  if (normalizedUrl.endsWith(".mp3")) return "audio/mpeg";
  if (normalizedUrl.endsWith(".wav")) return "audio/wav";
  if (normalizedUrl.endsWith(".flac")) return "audio/flac";

  if (fallbackKind === "video") return "video/mp4";
  if (fallbackKind === "audio") return "audio/mpeg";
  return "image/png";
}

function pickPreferredOutputFile(
  payload: Record<string, unknown>,
  kind: Exclude<StudioModelKind, "text">
) {
  const preferredKeys =
    kind === "video"
      ? ["video", "videos"]
      : kind === "audio"
        ? ["audio"]
        : ["images", "image", "output"];

  for (const key of preferredKeys) {
    const value = payload[key];
    if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === "object") {
      return value[0] as Record<string, unknown>;
    }
    if (value && typeof value === "object") {
      return value as Record<string, unknown>;
    }
  }

  const files = pickFilesFromPayload(payload);
  return files[0] ?? null;
}

function createOutputMetadata(params: {
  kind: Exclude<StudioModelKind, "text">;
  file: Record<string, unknown>;
  draft: PersistedStudioDraft;
  requestMode: StudioGenerationRequestMode;
}) {
  const url = typeof params.file.url === "string" ? params.file.url : null;
  if (!url) {
    throw new Error("Provider result did not include an output URL.");
  }

  const providerWidth =
    typeof params.file.width === "number" ? params.file.width : null;
  const providerHeight =
    typeof params.file.height === "number" ? params.file.height : null;
  const providerDuration =
    typeof params.file.duration === "number"
      ? params.file.duration
      : typeof params.file.duration_seconds === "number"
        ? params.file.duration_seconds
        : null;
  const inferredAspectMetadata = createMediaMetadataFromAspectRatioLabel(
    params.kind,
    params.kind === "audio" ? null : params.draft.aspectRatio
  );

  const mediaWidth = providerWidth ?? inferredAspectMetadata.mediaWidth;
  const mediaHeight = providerHeight ?? inferredAspectMetadata.mediaHeight;
  const aspectRatioLabel =
    params.kind === "audio"
      ? null
      : formatAspectRatioLabel({
          mediaWidth,
          mediaHeight,
        }) ?? params.draft.aspectRatio;

  return {
    url,
    fileName:
      typeof params.file.file_name === "string" ? params.file.file_name : null,
    mimeType: inferMimeType(params.file, params.kind),
    mediaWidth,
    mediaHeight,
    mediaDurationSeconds:
      params.kind === "video"
        ? providerDuration ?? sanitizeDurationSeconds(params.draft.durationSeconds, 4)
        : params.kind === "audio"
          ? providerDuration
          : null,
    aspectRatioLabel,
    hasAlpha:
      params.requestMode === "background-removal" ||
      params.draft.outputFormat === "png",
  };
}

function normalizeUsage(payload: Record<string, unknown>) {
  const usage =
    payload.usage && typeof payload.usage === "object" && !Array.isArray(payload.usage)
      ? (payload.usage as Record<string, unknown>)
      : {};

  return usage;
}

export async function submitStudioFalRequest(params: {
  falKey: string;
  modelId: string;
  requestMode: StudioGenerationRequestMode;
  draft: PersistedStudioDraft;
  inputs: StudioFalInputFile[];
  webhookUrl?: string;
}) {
  const uploadedInputs = await uploadInputFilesToFal(params.falKey, params.inputs);
  const inputUrls = groupInputUrls(uploadedInputs);
  const request = buildStudioFalQueuedRequest({
    modelId: params.modelId,
    requestMode: params.requestMode,
    draft: params.draft,
    inputUrls,
  });
  const client = createClient(params.falKey);
  const queueStatus = await client.queue.submit(request.endpointId, {
    input: request.input,
    webhookUrl: params.webhookUrl,
    storageSettings: { expiresIn: "1d" },
  });

  return {
    endpointId: request.endpointId,
    requestId: queueStatus.request_id,
  } satisfies StudioFalQueuedRequest;
}

export async function getStudioFalQueuedResult(params: {
  falKey: string;
  endpointId: string;
  requestId: string;
}) {
  const client = createClient(params.falKey);
  return client.queue.result(params.endpointId, {
    requestId: params.requestId,
  });
}

export async function getStudioFalQueueStatus(params: {
  falKey: string;
  endpointId: string;
  requestId: string;
}) {
  const client = createClient(params.falKey);
  return client.queue.status(params.endpointId, {
    requestId: params.requestId,
    logs: true,
  });
}

export async function cancelStudioFalQueuedRequest(params: {
  falKey: string;
  endpointId: string;
  requestId: string;
}) {
  const client = createClient(params.falKey);
  await client.queue.cancel(params.endpointId, {
    requestId: params.requestId,
  });
}

export function resolveStudioFalCompletedPayload(params: {
  modelId: string;
  requestMode: StudioGenerationRequestMode;
  draft: PersistedStudioDraft;
  payload: Record<string, unknown>;
}): StudioFalCompletedPayload {
  const model = requireStudioModelById(params.modelId);

  if (model.kind === "text") {
    return {
      outputKind: "text",
      outputText:
        typeof params.payload.output === "string" ? params.payload.output : null,
      outputFile: null,
      providerPayload: params.payload,
      usageSnapshot: normalizeUsage(params.payload),
    };
  }

  const outputFile = pickPreferredOutputFile(
    params.payload,
    model.kind as Exclude<StudioModelKind, "text">
  );

  if (!outputFile) {
    throw new Error("Provider result did not include a usable output asset.");
  }

  return {
    outputKind: model.kind,
    outputText: null,
    outputFile: createOutputMetadata({
      kind: model.kind,
      file: outputFile,
      draft: params.draft,
      requestMode: params.requestMode,
    }),
    providerPayload: params.payload,
    usageSnapshot: normalizeUsage(params.payload),
  };
}

export function toStudioFalWebhookUrl(params: {
  baseUrl: string;
  runId: string;
  webhookSecret: string;
}) {
  const url = new URL("/api/webhooks/fal", params.baseUrl);
  url.searchParams.set("runId", params.runId);
  url.searchParams.set("token", params.webhookSecret);
  return url.toString();
}

export function getLocalFalKeyFromRequest(request: Request) {
  return getLocalProviderKeysFromRequest(request).falApiKey;
}

export function getLocalProviderKeysFromRequest(request: Request): StudioProviderSettings {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const parsedCookies = cookieHeader.split(/;\s*/).map((cookie) => {
    const separatorIndex = cookie.indexOf("=");
    return {
      name:
        separatorIndex === -1 ? cookie : cookie.slice(0, separatorIndex).trim(),
      value: separatorIndex === -1 ? "" : cookie.slice(separatorIndex + 1).trim(),
    };
  });
  const getCookieValue = (cookieName: string) =>
    decodeURIComponent(
      parsedCookies.find((cookie) => cookie.name === cookieName)?.value ?? ""
    ).trim();

  return {
    falApiKey: getCookieValue(LOCAL_PROVIDER_KEY_COOKIE_NAMES.fal),
    falLastValidatedAt: null,
    openaiApiKey: getCookieValue(LOCAL_PROVIDER_KEY_COOKIE_NAMES.openai),
    openaiLastValidatedAt: null,
    anthropicApiKey: getCookieValue(LOCAL_PROVIDER_KEY_COOKIE_NAMES.anthropic),
    anthropicLastValidatedAt: null,
    geminiApiKey: getCookieValue(LOCAL_PROVIDER_KEY_COOKIE_NAMES.gemini),
    geminiLastValidatedAt: null,
  };
}

export async function parseVerifiedStudioFalWebhook(request: Request) {
  verifyFalWebhookToken(request);

  const rawBody = new Uint8Array(await request.arrayBuffer());
  const headers = getFalWebhookHeaders(request.headers);
  const isValid = await verifyFalWebhookSignature({
    headers,
    rawBody,
  });

  if (!isValid) {
    throw new Error("Fal webhook signature verification failed.");
  }

  const payload = JSON.parse(Buffer.from(rawBody).toString("utf8")) as {
    request_id?: string;
    status?: "OK" | "ERROR";
    payload?: Record<string, unknown>;
    error?: string;
  };

  const requestId = payload.request_id?.trim() || headers.requestId;
  if (!requestId) {
    throw new Error("Fal webhook request id was missing.");
  }

  return {
    requestId,
    status: (payload.status === "ERROR" ? "ERROR" : "OK") as "OK" | "ERROR",
    payload:
      payload.payload && typeof payload.payload === "object" && !Array.isArray(payload.payload)
        ? payload.payload
        : {},
    errorMessage: typeof payload.error === "string" ? payload.error : null,
    falUserId: headers.userId,
  };
}
