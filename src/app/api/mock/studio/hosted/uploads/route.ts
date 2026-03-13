import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { HostedStudioUploadManifestEntry } from "@/features/studio/studio-hosted-mock-api";
import { uploadHostedMockFiles } from "@/server/studio/hosted-mock-store";
import {
  HOSTED_MOCK_SESSION_COOKIE,
  isValidHostedMockSessionToken,
} from "@/server/studio/hosted-mock-session";
import {
  HOSTED_MOCK_CLIENT_HEADER,
  HOSTED_MOCK_CLIENT_VALUE,
} from "@/server/studio/hosted-mock-constants";

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
    const formData = await request.formData();
    const folderIdValue = formData.get("folderId");
    const manifestValue = formData.get("manifest");
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);
    const manifest =
      typeof manifestValue === "string"
        ? (JSON.parse(manifestValue) as HostedStudioUploadManifestEntry[])
        : null;

    if (files.length === 0 || !manifest) {
      return NextResponse.json(
        {
          error: "Hosted mock upload payload was incomplete.",
        },
        { status: 400 }
      );
    }

    const snapshot = await uploadHostedMockFiles({
      files,
      manifest,
      folderId:
        typeof folderIdValue === "string" && folderIdValue.trim().length > 0
          ? folderIdValue
          : null,
    });

    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Hosted mock upload failed.",
      },
      { status: 400 }
    );
  }
}
