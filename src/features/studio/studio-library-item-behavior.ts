import type { GenerationRun, LibraryItem, StudioModelDefinition } from "./types";

export function isGeneratedTextLibraryItem(
  item: Pick<LibraryItem, "kind" | "role">
) {
  return item.kind === "text" && item.role === "generated_output";
}

export function isTextNoteLibraryItem(
  item: Pick<LibraryItem, "kind" | "role">
) {
  return item.kind === "text" && item.role === "text_note";
}

export function getLibraryItemReuseActionLabel(
  item: Pick<LibraryItem, "kind" | "role">
) {
  if (isTextNoteLibraryItem(item)) {
    return "Copy note to prompt bar";
  }

  if (item.role === "generated_output") {
    return "Restore run context";
  }

  return "Load settings to controls";
}

export function getLibraryItemReuseButtonLabel(
  item: Pick<LibraryItem, "kind" | "role">
) {
  if (isTextNoteLibraryItem(item)) {
    return "Use in Prompt Bar";
  }

  if (item.role === "generated_output") {
    return "Reuse Run";
  }

  return "Reuse";
}

export function getTextNotePromptBarValue(
  item: Pick<LibraryItem, "contentText" | "prompt" | "title">
) {
  const contentText = item.contentText?.trim();
  if (contentText) {
    return contentText;
  }

  const prompt = item.prompt.trim();
  if (prompt) {
    return prompt;
  }

  const title = item.title.trim();
  return title || null;
}

export function findReusableRunIdForLibraryItem(
  item: Pick<LibraryItem, "id" | "runId" | "sourceRunId">,
  runs: Array<Pick<GenerationRun, "id" | "outputAssetId">>
) {
  const directMatch = runs.find((run) => run.outputAssetId === item.id);
  if (directMatch) {
    return directMatch.id;
  }

  if (item.sourceRunId) {
    const sourceMatch = runs.find((run) => run.id === item.sourceRunId);
    if (sourceMatch) {
      return sourceMatch.id;
    }
  }

  if (item.runId) {
    const runMatch = runs.find((run) => run.id === item.runId);
    if (runMatch) {
      return runMatch.id;
    }
  }

  return null;
}

export function resolvePromptBarReuseModelId(params: {
  currentModelId: string;
  models: Array<Pick<StudioModelDefinition, "id" | "kind" | "section" | "requiresPrompt">>;
}) {
  const currentModel =
    params.models.find((model) => model.id === params.currentModelId) ?? null;
  const promptCapableModels = params.models.filter(
    (model) => model.requiresPrompt !== false
  );

  if (currentModel && currentModel.requiresPrompt !== false) {
    return currentModel.id;
  }

  const sameSectionMatch = promptCapableModels.find(
    (model) =>
      model.section === currentModel?.section &&
      model.kind === currentModel?.kind
  );
  if (sameSectionMatch) {
    return sameSectionMatch.id;
  }

  return promptCapableModels[0]?.id ?? params.currentModelId;
}
