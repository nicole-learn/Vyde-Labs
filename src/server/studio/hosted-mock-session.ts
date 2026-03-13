import { randomUUID } from "node:crypto";

export const HOSTED_MOCK_SESSION_COOKIE = "vydelabs_hosted_mock_session";

const STORE_KEY = "__VYDELABS_HOSTED_MOCK_SESSIONS__";

function getSessionStore() {
  const globalStore = globalThis as typeof globalThis & {
    [STORE_KEY]?: Set<string>;
  };

  if (!globalStore[STORE_KEY]) {
    globalStore[STORE_KEY] = new Set<string>();
  }

  return globalStore[STORE_KEY]!;
}

export function createHostedMockSessionToken() {
  const sessionToken = randomUUID();
  getSessionStore().add(sessionToken);
  return sessionToken;
}

export function isValidHostedMockSessionToken(sessionToken: string | null | undefined) {
  if (!sessionToken) {
    return false;
  }

  return getSessionStore().has(sessionToken);
}
