import { requireStudioModelById } from "@/features/studio/studio-model-catalog";
import type { StudioFalInputFile } from "@/server/fal/studio-fal";
import type {
  StudioModelDefinition,
  StudioProviderKeyId,
  StudioProviderSettings,
} from "@/features/studio/types";
import { getTextProviderServerEnv } from "@/lib/supabase/env";

function getTextModel(modelId: string) {
  const model = requireStudioModelById(modelId);
  if (model.kind !== "text" || !model.apiModelId) {
    throw new Error("This model is not configured as a direct text provider.");
  }

  return model;
}

function getLocalProviderKeyForModel(params: {
  modelId: string;
  providerSettings: Pick<
    StudioProviderSettings,
    "openaiApiKey" | "anthropicApiKey" | "geminiApiKey"
  >;
}) {
  const model = getTextModel(params.modelId);

  switch (model.provider) {
    case "openai":
      return params.providerSettings.openaiApiKey.trim();
    case "anthropic":
      return params.providerSettings.anthropicApiKey.trim();
    case "google":
      return params.providerSettings.geminiApiKey.trim();
    default:
      return "";
  }
}

function getHostedProviderKeyForModel(modelId: string) {
  const model = getTextModel(modelId);
  const env = getTextProviderServerEnv();

  switch (model.provider) {
    case "openai":
      return env.openaiApiKey;
    case "anthropic":
      return env.anthropicApiKey;
    case "google":
      return env.geminiApiKey;
    default:
      return "";
  }
}

async function parseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
      message?: string;
      errorMessage?: string;
    };
    return (
      payload.error?.message?.trim() ||
      payload.message?.trim() ||
      payload.errorMessage?.trim() ||
      `Provider request failed with ${response.status}.`
    );
  } catch {
    return `Provider request failed with ${response.status}.`;
  }
}

async function blobToBase64(blob: Blob) {
  return Buffer.from(await blob.arrayBuffer()).toString("base64");
}

function ensureNonEmptyTextOutput(output: string, providerLabel: string) {
  const trimmed = output.trim();
  if (!trimmed) {
    throw new Error(`${providerLabel} returned no text output.`);
  }

  return trimmed;
}

function extractOpenAiOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string" && payload.output_text.trim().length > 0) {
    return payload.output_text.trim();
  }

  const output = payload.output;
  if (!Array.isArray(output)) {
    return "";
  }

  const textParts: string[] = [];
  for (const entry of output) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const record = entry as Record<string, unknown>;
    if (record.type === "output_text" && typeof record.text === "string") {
      const value = record.text.trim();
      if (value) {
        textParts.push(value);
      }
    }

    const content = record.content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentEntry of content) {
      if (!contentEntry || typeof contentEntry !== "object") {
        continue;
      }

      const contentRecord = contentEntry as Record<string, unknown>;
      if (
        (contentRecord.type === "output_text" || contentRecord.type === "text") &&
        typeof contentRecord.text === "string"
      ) {
        const value = contentRecord.text.trim();
        if (value) {
          textParts.push(value);
        }
      }
    }
  }

  return textParts.join("\n\n");
}

async function buildOpenAiInputContent(
  prompt: string,
  inputs: StudioFalInputFile[]
) {
  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: prompt,
    },
  ];

  for (const input of inputs) {
    if (input.kind === "image") {
      const mimeType = input.mimeType?.trim() || "image/jpeg";
      const base64 = await blobToBase64(input.file);
      content.push({
        type: "input_text",
        text: `Reference image: ${input.title}`,
      });
      content.push({
        type: "input_image",
        image_url: `data:${mimeType};base64,${base64}`,
      });
      continue;
    }

    if (input.kind === "video") {
      content.push({
        type: "input_text",
        text: `Reference video: ${input.title}. Use the representative frame attached with this request as the video context.`,
      });
    }
  }

  return content;
}

async function buildAnthropicMessageContent(
  prompt: string,
  inputs: StudioFalInputFile[]
) {
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: prompt,
    },
  ];

  for (const input of inputs) {
    if (input.kind === "image") {
      const mediaType = input.mimeType?.trim() || "image/jpeg";
      const base64 = await blobToBase64(input.file);
      content.push({
        type: "text",
        text: `Reference image: ${input.title}`,
      });
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: base64,
        },
      });
      continue;
    }

    if (input.kind === "video") {
      content.push({
        type: "text",
        text: `Reference video: ${input.title}. Use the representative frame attached with this request as the video context.`,
      });
    }
  }

  return content;
}

async function buildGeminiContentParts(
  prompt: string,
  inputs: StudioFalInputFile[]
) {
  const parts: Array<Record<string, unknown>> = [
    {
      text: prompt,
    },
  ];

  for (const input of inputs) {
    const mimeType =
      input.mimeType?.trim() ||
      (input.kind === "video"
        ? "video/mp4"
        : input.kind === "image"
          ? "image/jpeg"
          : "application/octet-stream");

    parts.push({
      text: `Reference ${input.kind}: ${input.title}`,
    });
    parts.push({
      inlineData: {
        mimeType,
        data: await blobToBase64(input.file),
      },
    });
  }

  return parts;
}

async function generateOpenAiText(params: {
  model: StudioModelDefinition;
  apiKey: string;
  prompt: string;
  inputs: StudioFalInputFile[];
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model.apiModelId,
      input: [
        {
          role: "user",
          content: await buildOpenAiInputContent(params.prompt, params.inputs),
        },
      ],
      max_output_tokens: params.model.maxOutputTokens,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as {
    output_text?: string;
    usage?: Record<string, unknown>;
  } & Record<string, unknown>;
  const output = ensureNonEmptyTextOutput(
    extractOpenAiOutputText(payload),
    "OpenAI"
  );

  return {
    payload: {
      ...payload,
      output,
    },
    usageSnapshot: payload.usage ?? {},
  };
}

async function generateAnthropicText(params: {
  model: StudioModelDefinition;
  apiKey: string;
  prompt: string;
  inputs: StudioFalInputFile[];
}) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
    },
    body: JSON.stringify({
      model: params.model.apiModelId,
      max_tokens: params.model.maxOutputTokens,
      messages: [
        {
          role: "user",
          content: await buildAnthropicMessageContent(params.prompt, params.inputs),
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: Record<string, unknown>;
  } & Record<string, unknown>;
  const output = (payload.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text?.trim() ?? "")
    .filter((text) => text.length > 0)
    .join("\n\n");

  return {
    payload: {
      ...payload,
      output: ensureNonEmptyTextOutput(output, "Claude"),
    },
    usageSnapshot: payload.usage ?? {},
  };
}

async function generateGeminiText(params: {
  model: StudioModelDefinition;
  apiKey: string;
  prompt: string;
  inputs: StudioFalInputFile[];
}) {
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model.apiModelId}:generateContent`
  );
  url.searchParams.set("key", params.apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: await buildGeminiContentParts(params.prompt, params.inputs),
        },
      ],
      generationConfig: {
        maxOutputTokens: params.model.maxOutputTokens,
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
    usageMetadata?: Record<string, unknown>;
  } & Record<string, unknown>;
  const output =
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text?.trim() ?? "")
      .filter((text) => text.length > 0)
      .join("\n\n") ?? "";

  return {
    payload: {
      ...payload,
      output: ensureNonEmptyTextOutput(output, "Gemini"),
    },
    usageSnapshot: payload.usageMetadata ?? {},
  };
}

export async function generateStudioTextProviderPayload(params: {
  modelId: string;
  prompt: string;
  providerApiKey: string;
  inputs?: StudioFalInputFile[];
}) {
  const model = getTextModel(params.modelId);
  const inputs = params.inputs ?? [];

  switch (model.provider) {
    case "openai":
      return generateOpenAiText({
        model,
        apiKey: params.providerApiKey,
        prompt: params.prompt,
        inputs,
      });
    case "anthropic":
      return generateAnthropicText({
        model,
        apiKey: params.providerApiKey,
        prompt: params.prompt,
        inputs,
      });
    case "google":
      return generateGeminiText({
        model,
        apiKey: params.providerApiKey,
        prompt: params.prompt,
        inputs,
      });
    default:
      throw new Error("This text model is not configured for a direct provider.");
  }
}

export function getRequiredProviderKeyForModel(params: {
  modelId: string;
  providerSettings: Pick<
    StudioProviderSettings,
    "falApiKey" | "openaiApiKey" | "anthropicApiKey" | "geminiApiKey"
  >;
}) {
  const model = requireStudioModelById(params.modelId);

  switch (model.provider) {
    case "fal":
      return params.providerSettings.falApiKey.trim() ? null : ("fal" as const);
    case "openai":
      return params.providerSettings.openaiApiKey.trim()
        ? null
        : ("openai" as const);
    case "anthropic":
      return params.providerSettings.anthropicApiKey.trim()
        ? null
        : ("anthropic" as const);
    case "google":
      return params.providerSettings.geminiApiKey.trim()
        ? null
        : ("gemini" as const);
    default:
      return null;
  }
}

export function getLocalTextProviderKey(params: {
  modelId: string;
  providerSettings: Pick<
    StudioProviderSettings,
    "openaiApiKey" | "anthropicApiKey" | "geminiApiKey"
  >;
}) {
  return getLocalProviderKeyForModel(params);
}

export function getHostedTextProviderKey(modelId: string) {
  return getHostedProviderKeyForModel(modelId);
}

export function getProviderKeyLabel(provider: StudioProviderKeyId) {
  switch (provider) {
    case "fal":
      return "Fal API key";
    case "openai":
      return "OpenAI API key";
    case "anthropic":
      return "Claude API key";
    case "gemini":
      return "Gemini API key";
    default:
      return "API key";
  }
}
