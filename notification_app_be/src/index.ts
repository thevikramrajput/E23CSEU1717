import { initLogger, Log } from "logging-middleware";
import { authCredentials, apiBase } from "./config";
import { NotificationResponse } from "./types";
import { getTopN, logPriorityResults } from "./services/priority.service";

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < tokenExpiry - 120) {
    return cachedToken;
  }

  const res = await fetch(`${apiBase}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authCredentials),
  });

  if (!res.ok) {
    throw new Error(`Auth failed: ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiry = data.expires_in;
  return cachedToken as string;
}

async function fetchNotifications(): Promise<NotificationResponse> {
  const token = await getToken();

  const res = await fetch(`${apiBase}/notifications`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch notifications: ${res.status}`);
  }

  return (await res.json()) as NotificationResponse;
}

function formatTable(results: ReturnType<typeof getTopN>): void {
  const divider = "-".repeat(110);
  process.stdout.write("\n" + divider + "\n");
  process.stdout.write(
    padRight("Rank", 6) +
      padRight("Type", 12) +
      padRight("Message", 40) +
      padRight("Timestamp", 25) +
      padRight("Score", 12) +
      "\n"
  );
  process.stdout.write(divider + "\n");

  for (let i = 0; i < results.length; i++) {
    const n = results[i];
    process.stdout.write(
      padRight(`#${i + 1}`, 6) +
        padRight(n.Type, 12) +
        padRight(n.Message, 40) +
        padRight(n.Timestamp, 25) +
        padRight(n.priorityScore.toFixed(1), 12) +
        "\n"
    );
  }

  process.stdout.write(divider + "\n\n");
}

function padRight(str: string, len: number): string {
  if (str.length >= len) return str.substring(0, len);
  return str + " ".repeat(len - str.length);
}

async function main(): Promise<void> {
  initLogger(authCredentials);

  await Log("backend", "info", "config", "Priority inbox service starting");

  const data = await fetchNotifications();
  await Log(
    "backend",
    "info",
    "service",
    `Fetched ${data.notifications.length} notifications from API`
  );

  const topTen = getTopN(data.notifications, 10);

  await logPriorityResults(topTen);

  process.stdout.write(`\nPriority Inbox - Top 10 Notifications\n`);
  process.stdout.write(`Total notifications fetched: ${data.notifications.length}\n`);
  process.stdout.write(`Scoring: Placement(3x) > Result(2x) > Event(1x) + recency\n`);
  formatTable(topTen);

  await Log("backend", "info", "config", "Priority inbox service completed successfully");
}

main().catch(async (err) => {
  await Log(
    "backend",
    "fatal",
    "config",
    `Priority inbox crashed: ${err instanceof Error ? err.message : String(err)}`
  );
  process.exit(1);
});
