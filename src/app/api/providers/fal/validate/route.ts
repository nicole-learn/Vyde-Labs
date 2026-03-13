import { NextResponse } from "next/server";

interface ValidateFalKeyRequestBody {
  falApiKey?: string;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ValidateFalKeyRequestBody;
    const falApiKey = payload.falApiKey?.trim() ?? "";

    if (!falApiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "Enter your Fal API key.",
        },
        { status: 400 }
      );
    }

    if (falApiKey.length < 16 || /\s/.test(falApiKey)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Enter a valid Fal API key.",
        },
        { status: 400 }
      );
    }

    const response = await fetch("https://api.fal.ai/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Key ${falApiKey}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });

    if (response.ok) {
      return NextResponse.json({
        ok: true,
        validatedAt: new Date().toISOString(),
      });
    }

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        {
          ok: false,
          error: "Fal rejected that API key.",
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Fal could not be reached right now. Please try again.",
      },
      { status: 502 }
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Fal could not be reached right now. Please try again.",
      },
      { status: 502 }
    );
  }
}
