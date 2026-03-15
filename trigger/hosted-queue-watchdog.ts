import { logger, schedules } from "@trigger.dev/sdk";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";
import { syncHostedQueuesForActiveUsers } from "../src/server/studio/hosted-store";

function resolveAppUrl() {
  const rawUrl =
    process.env.TRYPLAYGROUND_APP_URL?.trim() || "https://tryplayground.ai";

  return rawUrl.replace(/\/+$/, "");
}

export const hostedQueueWatchdog = schedules.task({
  id: "hosted-queue-watchdog",
  cron: "* * * * *",
  queue: {
    concurrencyLimit: 1,
  },
  run: async () => {
    const result = await syncHostedQueuesForActiveUsers({
      supabase: createSupabaseAdminClient(),
      webhookBaseUrl: resolveAppUrl(),
    });

    if (result.failedUserCount > 0) {
      logger.error("Hosted queue watchdog hit user sync failures", result);
    } else {
      logger.info("Hosted queue watchdog finished", result);
    }

    return result;
  },
});
