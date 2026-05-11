import { AuthCredentials, TokenResponse } from "./types";

const AUTH_ENDPOINT = "http://4.224.186.213/evaluation-service/auth";

let tokenCache: TokenResponse | null = null;
let storedCredentials: AuthCredentials | null = null;

export function configure(credentials: AuthCredentials): void {
  storedCredentials = credentials;
  tokenCache = null;
}

function isExpired(): boolean {
  if (!tokenCache) return true;
  const now = Math.floor(Date.now() / 1000);
  return now >= tokenCache.expires_in - 120;
}

export async function getAccessToken(): Promise<string> {
  if (tokenCache && !isExpired()) {
    return tokenCache.access_token;
  }

  if (!storedCredentials) {
    throw new Error("Logger not initialized - call initLogger() with valid credentials");
  }

  const res = await fetch(AUTH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(storedCredentials),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth failed (${res.status}): ${body}`);
  }

  tokenCache = (await res.json()) as TokenResponse;
  return tokenCache.access_token;
}
