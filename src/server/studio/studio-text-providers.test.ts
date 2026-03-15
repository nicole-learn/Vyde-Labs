import { afterEach, describe, expect, it, vi } from "vitest";
import { STUDIO_MODEL_CATALOG } from "@/features/studio/studio-model-catalog";
import { generateStudioTextProviderPayload } from "./studio-text-providers";

function createJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("generateStudioTextProviderPayload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends OpenAI image references through Responses API image input blocks", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      createJsonResponse({
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "ok" }],
          },
        ],
        usage: {},
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await generateStudioTextProviderPayload({
      modelId: "gpt-5.2",
      prompt: "Summarize this image",
      providerApiKey: "openai-key",
      inputs: [
        {
          slot: "reference",
          kind: "image",
          title: "Boardwalk still",
          file: new File(["image"], "boardwalk.jpg", { type: "image/jpeg" }),
          fileName: "boardwalk.jpg",
          mimeType: "image/jpeg",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    if (!firstCall) {
      throw new Error("Expected fetch to be called.");
    }

    const [, request] = firstCall;
    if (!request) {
      throw new Error("Expected fetch request init.");
    }
    const body = JSON.parse(String(request.body)) as {
      input: Array<{ content: Array<Record<string, unknown>> }>;
    };

    expect(body.input[0]?.content.some((entry) => entry.type === "input_image")).toBe(true);
  });

  it("extracts OpenAI text output from the raw Responses API output array", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      createJsonResponse({
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: "First paragraph" },
              { type: "output_text", text: "Second paragraph" },
            ],
          },
        ],
        usage: {},
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateStudioTextProviderPayload({
      modelId: "gpt-5.2",
      prompt: "Summarize this image",
      providerApiKey: "openai-key",
      inputs: [],
    });

    expect(result.payload.output).toBe("First paragraph\n\nSecond paragraph");
  });

  it("sends Anthropic image references as vision content blocks", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      createJsonResponse({
        content: [{ type: "text", text: "ok" }],
        usage: {},
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await generateStudioTextProviderPayload({
      modelId: "claude-sonnet-4.6",
      prompt: "Summarize this image",
      providerApiKey: "anthropic-key",
      inputs: [
        {
          slot: "reference",
          kind: "image",
          title: "Forest still",
          file: new File(["image"], "forest.jpg", { type: "image/jpeg" }),
          fileName: "forest.jpg",
          mimeType: "image/jpeg",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    if (!firstCall) {
      throw new Error("Expected fetch to be called.");
    }

    const [, request] = firstCall;
    if (!request) {
      throw new Error("Expected fetch request init.");
    }
    const body = JSON.parse(String(request.body)) as {
      messages: Array<{ content: Array<Record<string, unknown>> }>;
    };

    expect(body.messages[0]?.content.some((entry) => entry.type === "image")).toBe(true);
  });

  it("sends Gemini video references as inline multimodal parts", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      createJsonResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
        usageMetadata: {},
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await generateStudioTextProviderPayload({
      modelId: "gemini-3-flash-preview",
      prompt: "Describe this clip",
      providerApiKey: "gemini-key",
      inputs: [
        {
          slot: "reference",
          kind: "video",
          title: "River shot",
          file: new File(["video"], "river.mp4", { type: "video/mp4" }),
          fileName: "river.mp4",
          mimeType: "video/mp4",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    if (!firstCall) {
      throw new Error("Expected fetch to be called.");
    }

    const [urlValue, request] = firstCall;
    if (!request) {
      throw new Error("Expected fetch request init.");
    }
    const url = String(urlValue);
    const body = JSON.parse(String(request.body)) as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
    };

    expect(url).toContain("gemini-3-flash-preview:generateContent");
    expect(
      body.contents[0]?.parts.some((entry) =>
        Boolean(
          entry.inlineData &&
            typeof entry.inlineData === "object" &&
            (entry.inlineData as { mimeType?: string }).mimeType === "video/mp4"
        )
      )
    ).toBe(true);
  });

  it("uses the correct provider endpoint and model id for every text model", async () => {
    const textModels = STUDIO_MODEL_CATALOG.filter((model) => model.kind === "text");

    for (const model of textModels) {
      const fetchMock = vi.fn<typeof fetch>(async (url) => {
        if (String(url).includes("openai.com")) {
          return createJsonResponse({
            output: [
              {
                type: "message",
                content: [{ type: "output_text", text: `${model.name} ok` }],
              },
            ],
            usage: {},
          });
        }

        if (String(url).includes("anthropic.com")) {
          return createJsonResponse({
            content: [{ type: "text", text: `${model.name} ok` }],
            usage: {},
          });
        }

        return createJsonResponse({
          candidates: [{ content: { parts: [{ text: `${model.name} ok` }] } }],
          usageMetadata: {},
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await generateStudioTextProviderPayload({
        modelId: model.id,
        prompt: `Prompt for ${model.name}`,
        providerApiKey: `${model.provider}-key`,
        inputs: [],
      });

      expect(result.payload.output).toContain("ok");
      const firstCall = fetchMock.mock.calls[0];
      if (!firstCall) {
        throw new Error(`Expected fetch to be called for ${model.id}.`);
      }

      const [urlValue, request] = firstCall;
      const url = String(urlValue);
      const body = JSON.parse(String(request?.body ?? "{}")) as Record<string, unknown>;

      switch (model.provider) {
        case "openai":
          expect(url).toBe("https://api.openai.com/v1/responses");
          expect(body.model).toBe(model.apiModelId);
          expect(body.max_output_tokens).toBe(model.maxOutputTokens);
          break;
        case "anthropic":
          expect(url).toBe("https://api.anthropic.com/v1/messages");
          expect(body.model).toBe(model.apiModelId);
          expect(body.max_tokens).toBe(model.maxOutputTokens);
          break;
        case "google":
          expect(url).toContain(`${model.apiModelId}:generateContent`);
          expect(
            (body.generationConfig as { maxOutputTokens?: number } | undefined)
              ?.maxOutputTokens
          ).toBe(model.maxOutputTokens);
          break;
        default:
          throw new Error(`Unexpected provider ${model.provider}`);
      }

      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
});
