import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/server";
import { getHostedSyncPayload } from "@/server/studio/hosted-store";
import { createStudioRouteError, toStudioErrorResponse } from "@/server/studio/studio-route-errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireSupabaseUser(request);
    const url = new URL(request.url);
    const rawSinceRevision = url.searchParams.get("sinceRevision");
    const sinceRevision =
      rawSinceRevision && rawSinceRevision.trim().length > 0
        ? Number.parseInt(rawSinceRevision, 10)
        : null;

    if (
      rawSinceRevision &&
      rawSinceRevision.trim().length > 0 &&
      (sinceRevision === null || !Number.isFinite(sinceRevision) || sinceRevision < 0)
    ) {
      createStudioRouteError(400, "The hosted sync revision was invalid.");
    }

    const response = NextResponse.json(
      await getHostedSyncPayload({
        supabase,
        user,
        sinceRevision:
          typeof sinceRevision === "number" && Number.isFinite(sinceRevision)
            ? sinceRevision
            : null,
      })
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return toStudioErrorResponse(error, "Could not sync hosted workspace.", 401);
  }
}
