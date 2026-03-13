import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { HostedStudioMutation } from "@/features/studio/studio-hosted-mock-api";
import {
  getHostedMockSnapshot,
  mutateHostedMockSnapshot,
} from "@/server/studio/hosted-mock-store";
import {
  createHostedMockSessionToken,
  HOSTED_MOCK_SESSION_COOKIE,
  isValidHostedMockSessionToken,
} from "@/server/studio/hosted-mock-session";
import {
  HOSTED_MOCK_CLIENT_HEADER,
  HOSTED_MOCK_CLIENT_VALUE,
} from "@/server/studio/hosted-mock-constants";

export async function GET(request: Request) {
  if (request.headers.get(HOSTED_MOCK_CLIENT_HEADER) !== HOSTED_MOCK_CLIENT_VALUE) {
    return NextResponse.json(
      {
        error: "Hosted mock endpoint is only available to the TryPlayground mock client.",
      },
      { status: 403 }
    );
  }

  const cookieStore = await cookies();
  const existingSessionToken =
    cookieStore.get(HOSTED_MOCK_SESSION_COOKIE)?.value ?? null;
  const sessionToken =
    existingSessionToken && isValidHostedMockSessionToken(existingSessionToken)
      ? existingSessionToken
      : createHostedMockSessionToken();

  const response = NextResponse.json({
    snapshot: getHostedMockSnapshot(),
  });
  response.cookies.set(HOSTED_MOCK_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}

export async function POST(request: Request) {
  if (request.headers.get(HOSTED_MOCK_CLIENT_HEADER) !== HOSTED_MOCK_CLIENT_VALUE) {
    return NextResponse.json(
      {
        error: "Hosted mock endpoint is only available to the TryPlayground mock client.",
      },
      { status: 403 }
    );
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(HOSTED_MOCK_SESSION_COOKIE)?.value ?? null;
  if (!isValidHostedMockSessionToken(sessionToken)) {
    return NextResponse.json(
      {
        error: "Hosted mock session expired. Refresh the page and try again.",
      },
      { status: 401 }
    );
  }

  try {
    const mutation = (await request.json()) as HostedStudioMutation;
    const snapshot = await mutateHostedMockSnapshot(mutation);
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Hosted mock mutation failed.",
      },
      { status: 400 }
    );
  }
}
