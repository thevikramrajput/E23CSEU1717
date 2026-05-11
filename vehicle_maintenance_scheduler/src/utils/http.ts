import { authCredentials, serverConfig } from "../config";

let cachedToken: string | null = null;
let tokenExpiry = 0;

interface TokenData {
  token_type: string;
  access_token: string;
  expires_in: number;
}

export async function getAuthToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && now < tokenExpiry - 120) {
    return cachedToken;
  }

  const res = await fetch(`${serverConfig.apiBase}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authCredentials),
  });

  if (!res.ok) {
    throw new Error(`Auth request failed with status ${res.status}`);
  }

  const data = (await res.json()) as TokenData;
  cachedToken = data.access_token;
  tokenExpiry = data.expires_in;
  return cachedToken;
}

export async function fetchFromApi<T>(path: string): Promise<T> {
  const token = await getAuthToken();

  const res = await fetch(`${serverConfig.apiBase}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`API request to ${path} failed with status ${res.status}`);
  }

  return (await res.json()) as T;
}
