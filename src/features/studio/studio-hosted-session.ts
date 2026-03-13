"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

export interface HostedBrowserSessionState {
  accessToken: string | null;
  user: User | null;
}

function mapHostedSession(session: Session | null): HostedBrowserSessionState {
  return {
    accessToken: session?.access_token ?? null,
    user: session?.user ?? null,
  };
}

export async function getHostedSessionState(): Promise<HostedBrowserSessionState> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  if (!session?.access_token) {
    return mapHostedSession(null);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  return {
    accessToken: session.access_token,
    user: user ?? null,
  };
}

export async function getHostedAccessToken() {
  const sessionState = await getHostedSessionState();
  return sessionState.accessToken;
}

export function subscribeToHostedAuthChanges(
  callback: (sessionState: HostedBrowserSessionState, event: AuthChangeEvent) => void
) {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    callback(mapHostedSession(session), event);
  });

  return () => {
    subscription.unsubscribe();
  };
}

export async function signInWithGoogleHostedSession(options?: {
  nextPath?: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const currentPath =
    options?.nextPath ??
    (typeof window === "undefined"
      ? "/"
      : `${window.location.pathname}${window.location.search}${window.location.hash}`);
  const redirectUrl = new URL("/auth/callback", window.location.origin);
  redirectUrl.searchParams.set("next", currentPath.startsWith("/") ? currentPath : "/");

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl.toString(),
      queryParams: {
        prompt: "select_account",
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function signOutHostedSession() {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
}
