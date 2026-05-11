import { getAccessToken } from "./auth";
import { LogPayload, LogResult } from "./types";

const LOG_ENDPOINT = "http://4.224.186.213/evaluation-service/logs";

export async function sendLog(payload: LogPayload): Promise<LogResult> {
  const token = await getAccessToken();

  const res = await fetch(LOG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Log submission failed (${res.status}): ${body}`);
  }

  return (await res.json()) as LogResult;
}
