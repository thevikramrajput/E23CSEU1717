export type Stack = "backend" | "frontend";

export type Level = "debug" | "info" | "warn" | "error" | "fatal";

export type BackendPackage =
  | "cache"
  | "controller"
  | "cron_job"
  | "db"
  | "domain"
  | "handler"
  | "repository"
  | "route"
  | "service";

export type FrontendPackage =
  | "api"
  | "component"
  | "hook"
  | "page"
  | "state"
  | "style";

export type SharedPackage = "auth" | "config" | "middleware" | "utils";

export type PackageName = BackendPackage | FrontendPackage | SharedPackage;

export interface AuthCredentials {
  email: string;
  name: string;
  rollNo: string;
  accessCode: string;
  clientID: string;
  clientSecret: string;
}

export interface TokenResponse {
  token_type: string;
  access_token: string;
  expires_in: number;
}

export interface LogPayload {
  stack: Stack;
  level: Level;
  package: PackageName;
  message: string;
}

export interface LogResult {
  logID: string;
  message: string;
}
