import { NextResponse } from "next/server";
import { getHostedMockFile } from "@/server/studio/hosted-mock-store";

interface HostedMockFileRouteContext {
  params: Promise<{
    fileId: string;
  }>;
}

export async function GET(
  _request: Request,
  context: HostedMockFileRouteContext
) {
  const { fileId } = await context.params;
  const file = getHostedMockFile(fileId);

  if (!file) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Copy into a fresh ArrayBuffer so the response body is always a valid BodyInit.
  const body = file.bytes.slice().buffer;

  return new NextResponse(body, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${file.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
