import { after, NextResponse } from "next/server";
import type {
  HostedStudioGenerateInputDescriptor,
} from "@/features/studio/studio-hosted-api";
import type { GenerationRun, PersistedStudioDraft } from "@/features/studio/types";
import { createSupabaseAdminClient, requireSupabaseUser } from "@/lib/supabase/server";
import {
  dispatchHostedQueueForUserId,
  queueHostedGeneration,
} from "@/server/studio/hosted-store";
import {
  parseOptionalClientRequestId,
  parseHostedGenerateDraft,
  parseHostedGenerateInputs,
  parseOptionalFolderId,
  parseRequiredModelId,
  validateUploadedInputFiles,
} from "@/server/studio/studio-request-validation";
import { toStudioErrorResponse } from "@/server/studio/studio-route-errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireSupabaseUser(request);
    const formData = await request.formData();
    const modelId = parseRequiredModelId(formData.get("modelId"));
    const folderId = parseOptionalFolderId(formData.get("folderId"));
    const clientRequestId = parseOptionalClientRequestId(
      formData.get("clientRequestId")
    );
    const draft: GenerationRun["draftSnapshot"] | PersistedStudioDraft =
      parseHostedGenerateDraft(formData.get("draft"));
    const inputs: HostedStudioGenerateInputDescriptor[] =
      parseHostedGenerateInputs(formData.get("inputs"));

    const uploadedFiles = new Map<string, File>();
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("input-file:") || !(value instanceof File)) {
        continue;
      }

      uploadedFiles.set(key.slice("input-file:".length), value);
    }
    validateUploadedInputFiles(inputs, uploadedFiles);

    const response = NextResponse.json(
      await queueHostedGeneration({
        supabase,
        user,
        modelId,
        folderId,
        draft,
        inputs,
        uploadedFiles,
        clientRequestId,
      })
    );
    after(async () => {
      await dispatchHostedQueueForUserId({
        supabase: createSupabaseAdminClient(),
        userId: user.id,
        webhookBaseUrl: new URL(request.url).origin,
      }).catch(() => undefined);
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return toStudioErrorResponse(error, "Could not queue hosted generation.");
  }
}
