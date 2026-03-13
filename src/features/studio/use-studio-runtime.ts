"use client";

import type { StudioAppMode } from "./studio-app-mode";
import { useStudioLocalRuntime } from "./use-studio-local-runtime";

export function useStudioRuntime(appMode: StudioAppMode) {
  return useStudioLocalRuntime({ appMode });
}
