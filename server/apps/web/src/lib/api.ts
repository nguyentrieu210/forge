import { CloudForgeClient } from "./cloudforge";

const TOKEN_KEY = "cloudforge_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token.trim());
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// In dev these default to "" so calls hit same-origin /api/* and Vite proxies them
// (gateway for commands/docs/whoami, query-worker for reports) — no CORS/preflight.
// In production set VITE_GATEWAY_URL / VITE_REPORT_URL to the real origins (which
// then need CORS or a same-origin/BFF deployment).
const GATEWAY = import.meta.env.VITE_GATEWAY_URL ?? "";
const REPORTS = import.meta.env.VITE_REPORT_URL ?? "";
export const TENANT_ID = import.meta.env.VITE_TENANT_ID ?? "demo";

export const ENVIRONMENT_LABEL = GATEWAY === "" ? "dev (Vite proxy)" : GATEWAY;

export const api = new CloudForgeClient({
  baseUrl: GATEWAY,
  reportBaseUrl: REPORTS,
  tenantId: TENANT_ID,
  getToken,
});

/** Collision-resistant client-generated id (Phase 1: no server naming series). */
export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
