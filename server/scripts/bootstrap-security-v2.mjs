#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { d1BindingOf, d1Query, fail, serverRoot } from "./wrangler-cli.mjs";
import { resolveWorkersDevOrigin } from "./lib/demo-provisioning.mjs";

const API_BASE = "https://api.cloudflare.com/client/v4";
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const phase = argOf("phase", "prepare");
const accountId = String(argOf("account", process.env.CLOUDFLARE_ACCOUNT_ID ?? "")).trim().toLowerCase();
const sourceSha = String(argOf("source-sha", process.env.FORGE_SOURCE_SHA ?? "")).trim().toLowerCase();
const token = String(process.env.CLOUDFLARE_API_TOKEN ?? "").trim();

if (!/^(prepare|finalize)$/.test(phase)) fail("--phase must be prepare or finalize");
if (!/^[a-f0-9]{32}$/.test(accountId)) fail("--account <32-char Cloudflare account id> is required");
if (!/^[a-f0-9]{40}$/.test(sourceSha)) fail("--source-sha <40-char merged commit SHA> is required");
if (!token) fail("CLOUDFLARE_API_TOKEN is required");

if (phase === "prepare") await prepare();
else await finalize();

async function prepare() {
  const controlConfig = path.join(serverRoot, "apps", "control-plane-worker", "wrangler.jsonc");
  const controlDb = d1BindingOf(controlConfig);
  const rows = d1Query(controlDb, "SELECT COUNT(*) AS total FROM tenant_security_profiles");
  const profileCount = Number(rows?.[0]?.total ?? 0);
  if (!Number.isInteger(profileCount) || profileCount < 0) fail("could not determine V2 security profile count");

  const required = [
    ["cloudforge-gateway", "INTERNAL_AUTH_SECRET_V2"],
    ["cloudforge-control-plane", "INTERNAL_AUTH_SECRET_V2"],
    ["cloudforge-jobs", "INTERNAL_SERVICE_TOKEN_V2"],
    ["cloudforge-control-plane", "INTERNAL_SERVICE_TOKEN_V2"],
  ];
  const present = new Map();
  for (const [script] of required) {
    if (present.has(script)) continue;
    present.set(script, await listWorkerSecrets(script));
  }

  if (profileCount > 0) {
    const missing = required.filter(([script, name]) => !present.get(script)?.has(name));
    if (missing.length) {
      fail(`V2 tenants already exist; refusing master rotation because bindings are missing: ${missing.map(([s, n]) => `${s}:${n}`).join(", ")}`);
    }
    console.log(`SECURITY_V2_PREPARE_NOOP profiles=${profileCount} masters=present`);
    return;
  }

  // With no committed V2 tenant profile, replacing BOTH copies of each master is safe
  // and makes a retry after a partial provider failure converge instead of getting stuck
  // with one unreadable half of a write-only secret pair.
  const authMaster = randomBytes(32).toString("base64url");
  const serviceMaster = randomBytes(32).toString("base64url");
  await putWorkerSecret("cloudforge-gateway", "INTERNAL_AUTH_SECRET_V2", authMaster);
  await putWorkerSecret("cloudforge-control-plane", "INTERNAL_AUTH_SECRET_V2", authMaster);
  await putWorkerSecret("cloudforge-jobs", "INTERNAL_SERVICE_TOKEN_V2", serviceMaster);
  await putWorkerSecret("cloudforge-control-plane", "INTERNAL_SERVICE_TOKEN_V2", serviceMaster);
  console.log("SECURITY_V2_PREPARE_PASS profiles=0 masters=coordinated");
}

async function finalize() {
  const controlUrl = await resolveWorkersDevOrigin({
    accountId,
    token,
    scriptName: "cloudforge-control-plane",
  });
  const response = await fetch(`${controlUrl}/v1/provider/bootstrap`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ account_id: accountId, source_sha: sourceSha }),
  });
  const text = await response.text();
  if (!response.ok) fail(`Control Plane V2 bootstrap failed (${response.status}): ${text}`);
  console.log(`SECURITY_V2_FINALIZE_PASS control=${controlUrl}`);
}

async function listWorkerSecrets(scriptName) {
  const result = await api(`/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/secrets`, { method: "GET" });
  const rows = Array.isArray(result) ? result : [];
  return new Set(rows.map((row) => typeof row?.name === "string" ? row.name : "").filter(Boolean));
}

async function putWorkerSecret(scriptName, name, text) {
  await api(`/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/secrets`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, text, type: "secret_text" }),
  });
  console.log(`${scriptName} ${name} ok`);
}

async function api(apiPath, init) {
  const headers = new Headers(init.headers ?? {});
  headers.set("authorization", `Bearer ${token}`);
  headers.set("accept", "application/json");
  const response = await fetch(`${API_BASE}${apiPath}`, { ...init, headers });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || payload?.success === false) {
    const message = Array.isArray(payload?.errors) ? payload.errors.map((entry) => entry?.message).filter(Boolean).join("; ") : "";
    fail(`Cloudflare API request failed (${response.status})${message ? `: ${message}` : ""}`);
  }
  return payload?.result ?? null;
}
