import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

const TRIGGER_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "FAL_KEY",
  "FAL_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "TRYPLAYGROUND_APP_URL",
];

export default defineConfig({
  project:
    process.env.TRIGGER_PROJECT_ID?.trim() || "proj_drtjuilkyveyflzywzzb",
  runtime: "node",
  dirs: ["./trigger"],
  maxDuration: 300,
  logLevel: "info",
  build: {
    extensions: [
      syncEnvVars(async () =>
        TRIGGER_ENV_NAMES.map((name) => ({
          name,
          value: process.env[name]?.trim() ?? "",
        })).filter((entry) => entry.value.length > 0)
      ),
    ],
  },
});
