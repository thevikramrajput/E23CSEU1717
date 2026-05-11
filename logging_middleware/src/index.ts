import { configure } from "./auth";
import { sendLog } from "./client";
import { AuthCredentials, Stack, Level, PackageName, LogResult } from "./types";

export type { AuthCredentials, Stack, Level, PackageName, LogResult };

const BACKEND_PACKAGES = [
  "cache", "controller", "cron_job", "db", "domain",
  "handler", "repository", "route", "service",
];

const FRONTEND_PACKAGES = [
  "api", "component", "hook", "page", "state", "style",
];

const SHARED_PACKAGES = ["auth", "config", "middleware", "utils"];

function isValidPackage(stack: Stack, pkg: string): boolean {
  const allowed =
    stack === "backend"
      ? [...BACKEND_PACKAGES, ...SHARED_PACKAGES]
      : [...FRONTEND_PACKAGES, ...SHARED_PACKAGES];
  return allowed.includes(pkg);
}

export function initLogger(credentials: AuthCredentials): void {
  configure(credentials);
}

export async function Log(
  stack: Stack,
  level: Level,
  pkg: PackageName,
  message: string
): Promise<LogResult | null> {
  if (!isValidPackage(stack, pkg)) {
    return null;
  }

  try {
    return await sendLog({ stack, level, package: pkg, message });
  } catch {
    return null;
  }
}
