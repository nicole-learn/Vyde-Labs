import { after, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { dispatchHostedQueueForUserId } from "@/server/studio/hosted-store";
import { handleHostedFalWebhook } from "@/server/studio/hosted-store";
import { parseVerifiedStudioFalWebhook } from "@/server/fal/studio-fal";
import { toStudioErrorResponse } from "@/server/studio/studio-route-errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const runIdValue = url.searchParams.get("runId");
    const verifiedWebhook = await parseVerifiedStudioFalWebhook(request);
    const supabase = createSupabaseAdminClient();

    const result = await handleHostedFalWebhook({
      supabase,
      requestId: verifiedWebhook.requestId,
      runId: runIdValue?.trim() || null,
      status: verifiedWebhook.status,
      payload: verifiedWebhook.payload,
      errorMessage: verifiedWebhook.errorMessage,
      webhookBaseUrl: url.origin,
    });

    if (result.userId) {
      after(async () => {
        await dispatchHostedQueueForUserId({
          supabase: createSupabaseAdminClient(),
          userId: result.userId!,
          webhookBaseUrl: url.origin,
        }).catch(() => undefined);
      });
    }

    const response = NextResponse.json(result);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return toStudioErrorResponse(error, "Fal webhook processing failed.", 400);
  }
}
