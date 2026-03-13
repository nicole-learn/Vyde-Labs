import { NextResponse } from "next/server";
import type { HostedStudioMutation } from "@/features/studio/studio-hosted-mock-api";
import {
  getHostedMockSnapshot,
  mutateHostedMockSnapshot,
} from "@/server/studio/hosted-mock-store";

export async function GET() {
  return NextResponse.json({
    snapshot: getHostedMockSnapshot(),
  });
}

export async function POST(request: Request) {
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
