import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";
import { createSupabaseAdminClient } from "./admin";
import { createStudioRouteError } from "@/server/studio/studio-route-errors";

export function getRequestBearerToken(request: Request) {
  const authorizationHeader = request.headers.get("authorization")?.trim() ?? "";
  if (!authorizationHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const accessToken = authorizationHeader.slice("bearer ".length).trim();
  return accessToken || null;
}

export function createSupabaseUserServerClient(accessToken: string) {
  const { publishableKey, url } = getSupabaseEnv();

  return createClient<Database>(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export { createSupabaseAdminClient };

export async function createSupabaseRouteHandlerClient(options?: {
  writeCookies?: boolean;
}) {
  const { publishableKey, url } = getSupabaseEnv();
  const cookieStore = await cookies();
  const writeCookies = options?.writeCookies ?? false;

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      encode: "tokens-only",
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (!writeCookies) {
          return;
        }

        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Route handlers can write cookies. Ignore cases where Next disallows it.
        }
      },
    },
  });
}

export async function requireSupabaseUser(request: Request) {
  const accessToken = getRequestBearerToken(request);
  const supabase = accessToken
    ? createSupabaseUserServerClient(accessToken)
    : await createSupabaseRouteHandlerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    createStudioRouteError(401, "Hosted session is invalid or expired.");
  }

  return {
    accessToken: accessToken ?? null,
    supabase,
    user: data.user satisfies User,
  };
}
