import { afterEach, describe, expect, it, vi } from "vitest";
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
        output_text: "ok",
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

  it("sends Anthropic image references as vision content blocks", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      createJsonResponse({
        content: [{ type: "text", text: "ok" }],
        usage: {},
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await generateStudioTextProviderPayload({
      modelId: "claude-sonnet-4",
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
      modelId: "gemini-3-flash",
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

    expect(url).toContain("gemini-3-flash:generateContent");
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
});
