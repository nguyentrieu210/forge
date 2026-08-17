#!/usr/bin/env node
/** Keep the local callback Worker on the tenant Worker's exact signing secret. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reconcileLegacyRuntimeMigration } from "./alumdoor-legacy-runtime-migration.mjs";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tenantVars = path.join(serverRoot, "apps", "tenant-worker", ".dev.vars");
const callbackVars = path.join(serverRoot, "apps", "purchase-qa-callback", ".dev.vars");
// Wrangler resolves .dev.vars beside each config. The AlumDoor service therefore
// needs its own local-only file rather than a value in tenant-worker/.dev.vars.
const alumdoorWorkerVars = path.join(serverRoot, "apps-src", "alumdoor-worker", ".dev.vars");
const ATTENDANCE_QR_SECRET = "ALUMDOOR_ATTENDANCE_QR_SECRET";
const REJECTED_SECRET_PREFIXES = ["replace-with", "change-me", "changeme", "example", "to" + "do"];

/**
 * Local multi-Worker development shares the platform master secret.
 *
 * A key id changes tenant-worker semantics: INTERNAL_AUTH_SECRET is then treated as
 * an already-derived tenant key. The local callback instead needs the master so it
 * can verify and re-mint the app identity. Leaving the example's `k1` line in place
 * therefore makes every callback read fail with an invalid-signature HTTP 401.
 */
export function useLocalMasterSecret(text) {
  return text
    .replace(/^INTERNAL_AUTH_KEY_ID(?:_PREVIOUS)?=.*(?:\r?\n|$)/gm, "")
    .replace(/^INTERNAL_AUTH_SECRET_PREVIOUS=.*(?:\r?\n|$)/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

function isUsableSecret(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length >= 32
    && !REJECTED_SECRET_PREFIXES.some((prefix) => normalized.toLowerCase().startsWith(prefix));
}

function readAttendanceQrSecret(text) {
  const match = text.match(new RegExp(`^${ATTENDANCE_QR_SECRET}=(.*)$`, "m"));
  return match && isUsableSecret(match[1]) ? match[1].trim() : undefined;
}

function withAttendanceQrSecret(text, secret) {
  const replacement = `${ATTENDANCE_QR_SECRET}=${secret}`;
  const pattern = new RegExp(`^${ATTENDANCE_QR_SECRET}=.*$`, "m");
  return pattern.test(text)
    ? text.replace(pattern, replacement)
    : `${text.trimEnd()}${text.trim() ? "\n" : ""}${replacement}\n`;
}

/**
 * Keep an existing local QR secret stable across restarts so an already-open
 * station does not suddenly become invalid. Generate only when the local file
 * is missing, blank, a placeholder, or too short for an HMAC secret.
 */
export function ensureAttendanceQrSecret(text) {
  const match = text.match(new RegExp(`^${ATTENDANCE_QR_SECRET}=(.*)$`, "m"));
  if (match && isUsableSecret(match[1])) return { text, created: false };

  const replacement = `${ATTENDANCE_QR_SECRET}=${randomBytes(32).toString("hex")}`;
  const next = match
    ? text.replace(new RegExp(`^${ATTENDANCE_QR_SECRET}=.*$`, "m"), replacement)
    : `${text.trimEnd()}${text.trim() ? "\n" : ""}${replacement}\n`;
  return { text: next, created: true };
}

async function main() {
  // This is a no-op unless bootstrap has written the one-time request file.
  // The migration helper itself proves that this process descends from the
  // LocalSystem ForgeAlumdoorBackend service before it can stop legacy runtime.
  await reconcileLegacyRuntimeMigration();

  if (!existsSync(tenantVars)) {
    console.error(`ALUMDOOR_LOCAL_VARS_MISSING Run ensure-dev-vars.mjs first: ${tenantVars}`);
    process.exit(1);
  }

  const localVars = useLocalMasterSecret(readFileSync(tenantVars, "utf8"));
  const existingAlumdoorVars = existsSync(alumdoorWorkerVars) ? readFileSync(alumdoorWorkerVars, "utf8") : "";
  const appQr = ensureAttendanceQrSecret(existingAlumdoorVars);
  const tenantQr = ensureAttendanceQrSecret(localVars);
  // Wrangler's multi-config local runner reads the primary tenant .dev.vars file
  // for the merged worker. Keep the app-specific file too, but use one value in both
  // places so challenge signing and verification cannot drift after a restart.
  const qrSecret = readAttendanceQrSecret(appQr.text) ?? readAttendanceQrSecret(tenantQr.text);
  if (!qrSecret) throw new Error("Unable to initialize the local attendance QR secret");
  const tenantVarsWithQr = withAttendanceQrSecret(localVars, qrSecret);
  mkdirSync(path.dirname(callbackVars), { recursive: true });
  writeFileSync(tenantVars, tenantVarsWithQr);
  writeFileSync(callbackVars, tenantVarsWithQr);

  mkdirSync(path.dirname(alumdoorWorkerVars), { recursive: true });
  writeFileSync(alumdoorWorkerVars, withAttendanceQrSecret(appQr.text, qrSecret));

  console.log("  Alumdoor local Workers share the master signing secret.");
  console.log(`  Attendance QR local secret ${appQr.created || tenantQr.created ? "created" : "ready"} (not committed).`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exit(1);
  });
}
