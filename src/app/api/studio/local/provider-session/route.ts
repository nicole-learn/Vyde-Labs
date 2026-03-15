import { NextResponse } from "next/server";
import { LOCAL_PROVIDER_KEY_COOKIE_NAMES } from "@/features/studio/studio-provider-constants";
import { ensureLocalQueueWorker } from "@/server/local/local-store";
import { toStudioErrorResponse } from "@/server/studio/studio-route-errors";

export const runtime = "nodejs";

function buildCookieOptions() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      falApiKey?: string;
      openaiApiKey?: string;
      anthropicApiKey?: string;
      geminiApiKey?: string;
    };
    const response = NextResponse.json({ ok: true });
    const keyMap = {
      fal: payload.falApiKey?.trim() ?? "",
      openai: payload.openaiApiKey?.trim() ?? "",
      anthropic: payload.anthropicApiKey?.trim() ?? "",
      gemini: payload.geminiApiKey?.trim() ?? "",
    } as const;

    for (const [provider, cookieName] of Object.entries(LOCAL_PROVIDER_KEY_COOKIE_NAMES)) {
      const apiKey = keyMap[provider as keyof typeof keyMap];
      if (apiKey) {
        response.cookies.set(cookieName, apiKey, buildCookieOptions());
      } else {
        response.cookies.delete(cookieName);
      }
    }

    ensureLocalQueueWorker({
      falApiKey: keyMap.fal,
      falLastValidatedAt: null,
      openaiApiKey: keyMap.openai,
      openaiLastValidatedAt: null,
      anthropicApiKey: keyMap.anthropic,
      anthropicLastValidatedAt: null,
      geminiApiKey: keyMap.gemini,
      geminiLastValidatedAt: null,
    });

    return response;
  } catch (error) {
    return toStudioErrorResponse(error, "Could not update the local provider session.", 400);
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  for (const cookieName of Object.values(LOCAL_PROVIDER_KEY_COOKIE_NAMES)) {
    response.cookies.delete(cookieName);
  }
  return response;
}
