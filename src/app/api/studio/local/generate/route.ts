import { NextResponse } from "next/server";
import type {
  LocalStudioGenerateInputDescriptor,
} from "@/features/studio/studio-local-api";
import type { PersistedStudioDraft } from "@/features/studio/types";
import { getLocalProviderKeysFromRequest } from "@/server/fal/studio-fal";
import { queueLocalGeneration } from "@/server/local/local-store";
import { getProviderKeyLabel, getRequiredProviderKeyForModel } from "@/server/studio/studio-text-providers";
import {
  parseOptionalClientRequestId,
  parseLocalGenerateDraft,
  parseLocalGenerateInputs,
  parseOptionalFolderId,
  parseRequiredModelId,
  validateUploadedInputFiles,
} from "@/server/studio/studio-request-validation";
import { createStudioRouteError, toStudioErrorResponse } from "@/server/studio/studio-route-errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const modelId = parseRequiredModelId(formData.get("modelId"));
    const folderId = parseOptionalFolderId(formData.get("folderId"));
    const clientRequestId = parseOptionalClientRequestId(
      formData.get("clientRequestId")
    );
    const draft: PersistedStudioDraft =
      parseLocalGenerateDraft(formData.get("draft"));
    const inputs: LocalStudioGenerateInputDescriptor[] =
      parseLocalGenerateInputs(formData.get("inputs"));

    const uploadedFiles = new Map<string, File>();
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("input-file:") || !(value instanceof File)) {
        continue;
      }

      uploadedFiles.set(key.slice("input-file:".length), value);
    }
    validateUploadedInputFiles(inputs, uploadedFiles);
    const providerSettings = getLocalProviderKeysFromRequest(request);
    const missingProvider = getRequiredProviderKeyForModel({
      modelId,
      providerSettings,
    });

    if (missingProvider) {
      createStudioRouteError(
        400,
        `Add your ${getProviderKeyLabel(missingProvider)} before generating locally.`
      );
    }

    const response = NextResponse.json(
      await queueLocalGeneration({
        providerSettings,
        modelId,
        folderId,
        draft,
        inputs,
        uploadedFiles,
        clientRequestId,
      })
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return toStudioErrorResponse(error, "Local generation failed.");
  }
}
