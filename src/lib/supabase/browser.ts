"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { CookieOptionsWithName } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

let browserClient: SupabaseClient<Database> | null = null;

function getBrowserCookies() {
  if (typeof document === "undefined" || !document.cookie) {
    return [];
  }

  return document.cookie
    .split(/;\s*/)
    .filter(Boolean)
    .map((cookie) => {
      const separatorIndex = cookie.indexOf("=");
      const name = separatorIndex === -1 ? cookie : cookie.slice(0, separatorIndex);
      const value = separatorIndex === -1 ? "" : cookie.slice(separatorIndex + 1);

      return {
        name: decodeURIComponent(name),
        value,
      };
    });
}

function serializeBrowserCookie(
  name: string,
  value: string,
  options: CookieOptionsWithName = {}
) {
  const segments = [`${encodeURIComponent(name)}=${value}`];

  if (options.maxAge !== undefined) {
    segments.push(`Max-Age=${options.maxAge}`);
  }

  if (options.domain) {
    segments.push(`Domain=${options.domain}`);
  }

  segments.push(`Path=${options.path ?? "/"}`);

  if (options.expires) {
    segments.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.httpOnly) {
    segments.push("HttpOnly");
  }

  if (options.secure) {
    segments.push("Secure");
  }

  if (options.sameSite) {
    const sameSite =
      typeof options.sameSite === "string"
        ? options.sameSite
        : options.sameSite === true
          ? "Strict"
          : undefined;

    if (sameSite) {
      segments.push(`SameSite=${sameSite}`);
    }
  }

  return segments.join("; ");
}

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const { publishableKey, url } = getSupabaseEnv();
  browserClient = createBrowserClient<Database>(url, publishableKey, {
    cookies: {
      encode: "tokens-only",
      getAll() {
        return getBrowserCookies();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, options, value }) => {
          document.cookie = serializeBrowserCookie(name, value, options);
        });
      },
    },
  });
  return browserClient;
}
