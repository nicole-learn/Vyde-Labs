import { z } from "zod";
import { requireStudioModelById } from "@/features/studio/studio-model-catalog";
import type {
  HostedStudioGenerateInputDescriptor,
  HostedStudioMutation,
  HostedStudioUploadManifestEntry,
} from "@/features/studio/studio-hosted-api";
import type {
  LocalStudioGenerateInputDescriptor,
  LocalStudioMutation,
  LocalStudioUploadManifestEntry,
} from "@/features/studio/studio-local-api";
import type {
  LibraryItemKind,
  PersistedStudioDraft,
} from "@/features/studio/types";
import { createStudioRouteError } from "./studio-route-errors";

const MAX_ID_LENGTH = 160;
const MAX_TEXT_LENGTH = 50_000;
const MAX_FILES_PER_REQUEST = 32;
const MAX_FILE_SIZE_BYTES = 512 * 1024 * 1024;

const idSchema = z.string().trim().min(1).max(MAX_ID_LENGTH);
const nullableIdSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value ?? null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  },
  z.string().min(1).max(MAX_ID_LENGTH).nullable()
);

const isoDateStringSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime())
  .nullable();

const persistedDraftSchema = z.object({
  prompt: z.string().max(MAX_TEXT_LENGTH),
  negativePrompt: z.string().max(MAX_TEXT_LENGTH),
  videoInputMode: z.enum(["frames", "references"]),
  aspectRatio: z.string().max(32),
  resolution: z.string().max(32),
  outputFormat: z.string().max(32),
  imageCount: z.number().int().min(1).max(1),
  durationSeconds: z.number().int().min(0).max(60),
  includeAudio: z.boolean(),
  tone: z.string().max(64),
  maxTokens: z.number().int().min(1).max(128_000),
  temperature: z.number().min(0).max(2),
  voice: z.string().max(128),
  language: z.string().max(64),
  speakingRate: z.string().max(32),
});

const uploadManifestEntrySchema = z.object({
  kind: z.enum(["image", "video", "audio"]),
  mediaWidth: z.number().int().positive().nullable(),
  mediaHeight: z.number().int().positive().nullable(),
  mediaDurationSeconds: z.number().positive().nullable(),
  aspectRatioLabel: z.string().max(16).nullable(),
  hasAlpha: z.boolean(),
});

const generateInputDescriptorSchema = z
  .object({
    slot: z.enum(["reference", "start_frame", "end_frame"]),
    uploadField: nullableIdSchema,
    originAssetId: nullableIdSchema,
    title: z.string().trim().min(1).max(256),
    kind: z.enum(["image", "video", "audio", "document"]),
    mimeType: z.string().trim().max(255).nullable(),
    source: z.enum(["upload", "library-item"]),
  })
  .superRefine((value, ctx) => {
    const hasUploadField = Boolean(value.uploadField);
    const hasOriginAssetId = Boolean(value.originAssetId);

    if (hasUploadField === hasOriginAssetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each generation input must provide exactly one source.",
      });
    }

    if (value.source === "upload" && !hasUploadField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Uploaded generation inputs must provide an upload field id.",
      });
    }

    if (value.source === "library-item" && !hasOriginAssetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Library generation inputs must provide an origin asset id.",
      });
    }
  });

const localMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save_ui_state"),
    draftsByModelId: z.record(z.string(), persistedDraftSchema),
    selectedModelId: idSchema,
    gallerySizeLevel: z.number().int().min(0).max(6),
    lastValidatedAt: isoDateStringSchema,
  }),
  z.object({
    action: z.literal("set_enabled_models"),
    enabledModelIds: z.array(idSchema).max(128),
  }),
  z.object({
    action: z.literal("create_folder"),
    name: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal("rename_folder"),
    folderId: idSchema,
    name: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal("delete_folder"),
    folderId: idSchema,
  }),
  z.object({
    action: z.literal("reorder_folders"),
    orderedFolderIds: z.array(idSchema).max(256),
  }),
  z.object({
    action: z.literal("move_items"),
    itemIds: z.array(idSchema).min(1).max(512),
    folderId: nullableIdSchema,
  }),
  z.object({
    action: z.literal("delete_items"),
    itemIds: z.array(idSchema).min(1).max(512),
  }),
  z.object({
    action: z.literal("delete_runs"),
    runIds: z.array(idSchema).min(1).max(512),
  }),
  z.object({
    action: z.literal("update_text_item"),
    itemId: idSchema,
    title: z.string().max(256).optional(),
    contentText: z.string().max(MAX_TEXT_LENGTH).optional(),
  }),
  z.object({
    action: z.literal("create_text_item"),
    title: z.string().max(256),
    body: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
    folderId: nullableIdSchema,
  }),
  z.object({
    action: z.literal("generate"),
    modelId: idSchema,
    folderId: nullableIdSchema,
    draft: persistedDraftSchema,
    referenceCount: z.number().int().min(0).max(64),
    startFrameCount: z.number().int().min(0).max(1),
    endFrameCount: z.number().int().min(0).max(1),
  }),
  z.object({
    action: z.literal("cancel_run"),
    runId: idSchema,
  }),
]);

const hostedMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_enabled_models"),
    enabledModelIds: z.array(idSchema).max(128),
  }),
  z.object({
    action: z.literal("save_ui_state"),
    selectedModelId: idSchema,
    gallerySizeLevel: z.number().int().min(0).max(6),
  }),
  z.object({
    action: z.literal("sign_out"),
  }),
  z.object({
    action: z.literal("delete_account"),
  }),
  z.object({
    action: z.literal("create_folder"),
    name: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal("rename_folder"),
    folderId: idSchema,
    name: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal("delete_folder"),
    folderId: idSchema,
  }),
  z.object({
    action: z.literal("reorder_folders"),
    orderedFolderIds: z.array(idSchema).max(256),
  }),
  z.object({
    action: z.literal("move_items"),
    itemIds: z.array(idSchema).min(1).max(512),
    folderId: nullableIdSchema,
  }),
  z.object({
    action: z.literal("delete_items"),
    itemIds: z.array(idSchema).min(1).max(512),
  }),
  z.object({
    action: z.literal("delete_runs"),
    runIds: z.array(idSchema).min(1).max(512),
  }),
  z.object({
    action: z.literal("update_text_item"),
    itemId: idSchema,
    title: z.string().max(256).optional(),
    contentText: z.string().max(MAX_TEXT_LENGTH).optional(),
  }),
  z.object({
    action: z.literal("create_text_item"),
    title: z.string().max(256),
    body: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
    folderId: nullableIdSchema,
  }),
  z.object({
    action: z.literal("generate"),
    modelId: idSchema,
    folderId: nullableIdSchema,
    draft: persistedDraftSchema,
  }),
  z.object({
    action: z.literal("cancel_run"),
    runId: idSchema,
  }),
]);

const checkoutPayloadSchema = z.object({
  successPath: z.string().trim().max(1024).optional(),
  cancelPath: z.string().trim().max(1024).optional(),
  checkoutRequestId: z.string().trim().min(1).max(255).optional(),
});

const checkoutCompletePayloadSchema = z.object({
  checkoutSessionId: z.string().trim().min(1).max(255),
});

function parseJsonStringField<T>(value: FormDataEntryValue | null, schema: z.ZodSchema<T>) {
  if (typeof value !== "string" || value.trim().length === 0) {
    createStudioRouteError(400, "The request payload was incomplete.");
  }

  try {
    return schema.parse(JSON.parse(value));
  } catch (error) {
    if (error instanceof SyntaxError) {
      createStudioRouteError(400, "The request payload included invalid JSON.");
    }

    throw error;
  }
}

export function parseOptionalFolderId(value: FormDataEntryValue | null) {
  return nullableIdSchema.parse(typeof value === "string" ? value : null);
}

export function parseRequiredModelId(value: FormDataEntryValue | null) {
  return idSchema.parse(typeof value === "string" ? value : "");
}

export function parseOptionalClientRequestId(value: FormDataEntryValue | null) {
  return nullableIdSchema.parse(typeof value === "string" ? value : null);
}

export function parseHostedMutationPayload(value: unknown): HostedStudioMutation {
  return hostedMutationSchema.parse(value);
}

export function parseLocalMutationPayload(value: unknown): LocalStudioMutation {
  return localMutationSchema.parse(value);
}

export function parseHostedCheckoutPayload(value: unknown) {
  return checkoutPayloadSchema.parse(value);
}

export function parseHostedCheckoutCompletePayload(value: unknown) {
  return checkoutCompletePayloadSchema.parse(value);
}

export function parseHostedGenerateDraft(
  value: FormDataEntryValue | null
): PersistedStudioDraft {
  return parseJsonStringField(value, persistedDraftSchema);
}

export function parseLocalGenerateDraft(
  value: FormDataEntryValue | null
): PersistedStudioDraft {
  return parseHostedGenerateDraft(value);
}

export function parseHostedGenerateInputs(
  value: FormDataEntryValue | null
): HostedStudioGenerateInputDescriptor[] {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  return z.array(generateInputDescriptorSchema).max(64).parse(JSON.parse(value));
}

export function parseLocalGenerateInputs(
  value: FormDataEntryValue | null
): LocalStudioGenerateInputDescriptor[] {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  return z.array(generateInputDescriptorSchema).max(64).parse(JSON.parse(value));
}

export function parseHostedUploadManifest(
  value: FormDataEntryValue | null
): HostedStudioUploadManifestEntry[] {
  return parseJsonStringField(value, z.array(uploadManifestEntrySchema).min(1).max(MAX_FILES_PER_REQUEST));
}

export function parseLocalUploadManifest(
  value: FormDataEntryValue | null
): LocalStudioUploadManifestEntry[] {
  return parseJsonStringField(value, z.array(uploadManifestEntrySchema).min(1).max(MAX_FILES_PER_REQUEST));
}

export function validateStudioFileBatch(files: File[], contextLabel: string) {
  if (files.length === 0) {
    createStudioRouteError(400, `No files were provided for ${contextLabel}.`);
  }

  if (files.length > MAX_FILES_PER_REQUEST) {
    createStudioRouteError(
      400,
      `Too many files were provided for ${contextLabel}.`
    );
  }

  for (const file of files) {
    if (!(file instanceof File)) {
      createStudioRouteError(400, `A non-file entry was included in ${contextLabel}.`);
    }

    if (file.size <= 0) {
      createStudioRouteError(400, `One of the ${contextLabel} files was empty.`);
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      createStudioRouteError(
        400,
        `${file.name || "A file"} exceeded the maximum allowed upload size.`
      );
    }
  }
}

export function validateUploadedInputFiles(
  inputs: Array<HostedStudioGenerateInputDescriptor | LocalStudioGenerateInputDescriptor>,
  uploadedFiles: Map<string, File>
) {
  const requiredUploadFields = Array.from(
    new Set(
      inputs
        .map((input) => input.uploadField?.trim() || null)
        .filter((value): value is string => Boolean(value))
    )
  );

  if (requiredUploadFields.length !== uploadedFiles.size) {
    createStudioRouteError(
      400,
      "The generation request did not include the expected input files."
    );
  }

  for (const uploadField of requiredUploadFields) {
    const file = uploadedFiles.get(uploadField);
    if (!file) {
      createStudioRouteError(
        400,
        "A generation input file was missing from the request."
      );
    }

    validateStudioFileBatch([file], "generation");
  }
}

function validateSelectedStringOption(params: {
  label: string;
  value: string;
  options?: string[];
}) {
  if (!params.options || params.options.length === 0) {
    return;
  }

  if (!params.options.includes(params.value)) {
    createStudioRouteError(400, `${params.label} is not supported for that model.`);
  }
}

function validateSelectedNumberOption(params: {
  label: string;
  value: number;
  options?: number[];
}) {
  if (!params.options || params.options.length === 0) {
    return;
  }

  if (!params.options.includes(params.value)) {
    createStudioRouteError(400, `${params.label} is not supported for that model.`);
  }
}

export function validateStudioGenerationRequest(params: {
  modelId: string;
  draft: PersistedStudioDraft;
  inputs: Array<HostedStudioGenerateInputDescriptor | LocalStudioGenerateInputDescriptor>;
  referencedAssetKinds?: Map<string, LibraryItemKind>;
}) {
  const model = requireStudioModelById(params.modelId);
  const referenceInputs = params.inputs.filter((input) => input.slot === "reference");
  const startFrameInputs = params.inputs.filter((input) => input.slot === "start_frame");
  const endFrameInputs = params.inputs.filter((input) => input.slot === "end_frame");
  const requiresPrompt = model.requiresPrompt ?? true;
  if (requiresPrompt && params.draft.prompt.trim().length === 0) {
    createStudioRouteError(400, "This draft is missing the required prompt.");
  }

  if (
    model.minimumReferenceFiles !== undefined &&
    referenceInputs.length < model.minimumReferenceFiles
  ) {
    createStudioRouteError(
      400,
      `That model requires at least ${model.minimumReferenceFiles} reference inputs.`
    );
  }

  if (params.draft.imageCount !== 1) {
    createStudioRouteError(
      400,
      "TryPlayground only supports generating one output per request."
    );
  }

  validateSelectedStringOption({
    label: "Aspect ratio",
    value: params.draft.aspectRatio,
    options: model.aspectRatioOptions,
  });
  validateSelectedStringOption({
    label: "Resolution",
    value: params.draft.resolution,
    options: model.resolutionOptions,
  });
  validateSelectedStringOption({
    label: "Output format",
    value: params.draft.outputFormat,
    options: model.outputFormatOptions,
  });
  validateSelectedStringOption({
    label: "Voice",
    value: params.draft.voice,
    options: model.voiceOptions,
  });
  validateSelectedStringOption({
    label: "Language",
    value: params.draft.language,
    options: model.languageOptions,
  });
  validateSelectedStringOption({
    label: "Speaking rate",
    value: params.draft.speakingRate,
    options: model.speakingRateOptions,
  });
  validateSelectedStringOption({
    label: "Tone",
    value: params.draft.tone,
    options: model.toneOptions,
  });
  validateSelectedNumberOption({
    label: "Duration",
    value: params.draft.durationSeconds,
    options: model.durationOptions,
  });
  validateSelectedNumberOption({
    label: "Max tokens",
    value: params.draft.maxTokens,
    options: model.maxTokenOptions,
  });

  if (model.kind === "text" && model.maxOutputTokens) {
    if (params.draft.maxTokens > model.maxOutputTokens) {
      createStudioRouteError(
        400,
        `That model supports at most ${model.maxOutputTokens.toLocaleString()} output tokens.`
      );
    }
  }

  if (!model.supportsNegativePrompt && params.draft.negativePrompt.trim().length > 0) {
    createStudioRouteError(400, "That model does not support negative prompts.");
  }

  if (!model.supportsReferences && referenceInputs.length > 0) {
    createStudioRouteError(400, "That model does not support reference inputs.");
  }

  if (
    model.maxReferenceFiles !== undefined &&
    referenceInputs.length > model.maxReferenceFiles
  ) {
    createStudioRouteError(
      400,
      `That model accepts at most ${model.maxReferenceFiles} reference inputs.`
    );
  }

  if (
    model.acceptedReferenceKinds &&
    referenceInputs.some((input) => !model.acceptedReferenceKinds?.includes(input.kind))
  ) {
    createStudioRouteError(
      400,
      "One of the provided reference inputs is not supported for that model."
    );
  }

  if (startFrameInputs.length > 1 || endFrameInputs.length > 1) {
    createStudioRouteError(400, "Video frame inputs can only include one start and one end frame.");
  }

  if (startFrameInputs.some((input) => input.kind !== "image")) {
    createStudioRouteError(400, "Start frames must be image assets.");
  }

  if (endFrameInputs.some((input) => input.kind !== "image")) {
    createStudioRouteError(400, "End frames must be image assets.");
  }

  if (!model.supportsFrameInputs && (startFrameInputs.length > 0 || endFrameInputs.length > 0)) {
    createStudioRouteError(400, "That model does not support frame inputs.");
  }

  if (!model.supportsEndFrame && endFrameInputs.length > 0) {
    createStudioRouteError(400, "That model does not support end frames.");
  }

  if (model.supportsFrameInputs && params.draft.videoInputMode === "frames") {
    if (referenceInputs.length > 0) {
      createStudioRouteError(
        400,
        "Switch the video input mode back to references before attaching reference assets."
      );
    }
  }

  if (model.supportsFrameInputs && params.draft.videoInputMode === "references") {
    if (startFrameInputs.length > 0 || endFrameInputs.length > 0) {
      createStudioRouteError(
        400,
        "Switch the video input mode to frames before attaching start or end frames."
      );
    }
  }

  if (params.referencedAssetKinds) {
    for (const input of params.inputs) {
      if (!input.originAssetId) {
        continue;
      }

      const assetKind = params.referencedAssetKinds.get(input.originAssetId);
      if (!assetKind) {
        createStudioRouteError(404, "One of the referenced assets could not be found.");
      }

      if (assetKind !== input.kind) {
        createStudioRouteError(
          400,
          "One of the referenced assets no longer matches the requested input type."
        );
      }
    }
  }

  return model;
}
