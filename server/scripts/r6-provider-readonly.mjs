#!/usr/bin/env node
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const argOf = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const sourceSha = String(argOf("source-sha", "")).trim();
const output = String(argOf("output", "")).trim();
const token = String(process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
const accountHint = String(process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
const baseApi = "https://api.cloudflare.com/client/v4";

if (!/^[0-9a-f]{40}$/i.test(sourceSha)) {
  throw new Error("--source-sha must be the exact 40-character certification candidate SHA");
}

const evidence = {
  format: "forge-r6-provider-readonly/v1",
  evidence_ids: ["R6-E02", "R6-E05"],
  producer: "R6-01",
  source_sha: sourceSha,
  environment_class: "PILOT_TARGET_OBSERVED",
  target: {
    tenant: "alu",
    base_url: "https://alu.kairo.vn",
    gateway_worker: "cloudforge-gateway",
    control_worker: "cloudforge-control-plane",
    dispatch_namespace: "cloudforge-production",
    tenant_worker: "cloudforge-tenant-alu",
    app_worker: "cloudforge-app-alumdoor",
  },
  observed_at: new Date().toISOString(),
  mutation: "NONE",
  provider_account: null,
  checks: [],
  result: { ok: false, blockers: [] },
};

if (!token) {
  block("provider-auth", "CLOUDFLARE_API_TOKEN is unavailable to the read-only evidence job");
  finish();
}

let accountIds = [];
if (accountHint) {
  accountIds = [accountHint];
} else {
  const accounts = await api("/accounts?per_page=50", { allowFailure: true });
  if (!accounts.ok || !Array.isArray(accounts.result)) {
    block("provider-account-discovery", `unable to enumerate token-visible accounts: ${accounts.message}`);
    finish();
  }
  accountIds = accounts.result.map((entry) => String(entry?.id ?? "").trim()).filter(Boolean);
}

if (accountIds.length === 0) {
  block("provider-account-discovery", "token exposes no account identity");
  finish();
}

const candidates = [];
for (const accountId of accountIds) {
  const probe = await api(`/accounts/${encodeURIComponent(accountId)}/workers/scripts/cloudforge-gateway/settings`, { allowFailure: true });
  if (probe.ok) candidates.push({ accountId, gatewaySettings: probe.result });
}

if (candidates.length !== 1) {
  block(
    "provider-account-selection",
    candidates.length === 0
      ? "cloudforge-gateway was not readable in any token-visible account"
      : `cloudforge-gateway resolved in ${candidates.length} accounts; refusing ambiguous evidence`,
  );
  finish();
}

const { accountId, gatewaySettings } = candidates[0];
evidence.provider_account = {
  identity_hash: createHash("sha256").update(accountId).digest("hex").slice(0, 12),
  selection: accountHint ? "CLOUDFLARE_ACCOUNT_ID" : "token-visible account containing cloudforge-gateway",
};

const gatewayBindings = sanitizeBindings(gatewaySettings?.bindings);
checkBindingSet("gateway-bindings", gatewayBindings, ["ASSETS", "ROUTES", "DISPATCHER", "CONTROL"]);

const gatewayDeployments = await api(`/accounts/${accountId}/workers/scripts/cloudforge-gateway/deployments`, { allowFailure: true });
const deploymentList = deploymentItems(gatewayDeployments.result);
record(
  "gateway-deployment",
  gatewayDeployments.ok && deploymentList.length > 0,
  gatewayDeployments.ok
    ? { deployment_count_observed: deploymentList.length, latest_deployment_present: deploymentList.length > 0 }
    : gatewayDeployments.message,
);

const gatewayScriptSettings = await api(`/accounts/${accountId}/workers/scripts/cloudforge-gateway/script-settings`, { allowFailure: true });
record(
  "gateway-observability",
  gatewayScriptSettings.ok && observabilityEnabled(gatewayScriptSettings.result),
  gatewayScriptSettings.ok ? sanitizeObservability(gatewayScriptSettings.result) : gatewayScriptSettings.message,
);

const control = await api(`/accounts/${accountId}/workers/scripts/cloudforge-control-plane/settings`, { allowFailure: true });
record("control-service-worker", control.ok, control.ok ? { readable: true } : control.message);

const namespace = await api(`/accounts/${accountId}/workers/dispatch/namespaces/cloudforge-production`, { allowFailure: true });
record("dispatch-namespace", namespace.ok, namespace.ok ? { readable: true } : namespace.message);

const tenantDetails = await api(`/accounts/${accountId}/workers/dispatch/namespaces/cloudforge-production/scripts/cloudforge-tenant-alu`, { allowFailure: true });
record(
  "tenant-worker",
  tenantDetails.ok,
  tenantDetails.ok ? sanitizeDispatchDetails(tenantDetails.result) : tenantDetails.message,
);

const tenantBindingsResponse = await api(`/accounts/${accountId}/workers/dispatch/namespaces/cloudforge-production/scripts/cloudforge-tenant-alu/bindings`, { allowFailure: true });
const tenantBindings = sanitizeBindings(tenantBindingsResponse.result);
if (!tenantBindingsResponse.ok) {
  record("tenant-bindings", false, tenantBindingsResponse.message);
} else {
  checkBindingSet("tenant-bindings", tenantBindings, ["DB", "FILES", "BROWSER", "AGGREGATES", "OUTBOX_QUEUE", "SOCIAL_INGRESS", "DISPATCHER", "AI"]);
}

const tenantSettings = await api(`/accounts/${accountId}/workers/dispatch/namespaces/cloudforge-production/scripts/cloudforge-tenant-alu/settings`, { allowFailure: true });
record(
  "tenant-observability",
  tenantSettings.ok && observabilityEnabled(tenantSettings.result),
  tenantSettings.ok ? sanitizeObservability(tenantSettings.result) : tenantSettings.message,
);

const appDetails = await api(`/accounts/${accountId}/workers/dispatch/namespaces/cloudforge-production/scripts/cloudforge-app-alumdoor`, { allowFailure: true });
record(
  "alumdoor-app-worker",
  appDetails.ok,
  appDetails.ok ? sanitizeDispatchDetails(appDetails.result) : appDetails.message,
);

const appBindingsResponse = await api(`/accounts/${accountId}/workers/dispatch/namespaces/cloudforge-production/scripts/cloudforge-app-alumdoor/bindings`, { allowFailure: true });
const appBindings = sanitizeBindings(appBindingsResponse.result);
if (!appBindingsResponse.ok) {
  record("alumdoor-app-bindings", false, appBindingsResponse.message);
} else {
  checkBindingSet("alumdoor-app-bindings", appBindings, ["PLATFORM", "AI"]);
}

const appSettings = await api(`/accounts/${accountId}/workers/dispatch/namespaces/cloudforge-production/scripts/cloudforge-app-alumdoor/settings`, { allowFailure: true });
record(
  "alumdoor-app-observability",
  appSettings.ok && observabilityEnabled(appSettings.result),
  appSettings.ok ? sanitizeObservability(appSettings.result) : appSettings.message,
);

const failed = evidence.checks.filter((entry) => entry.ok !== true);
for (const entry of failed) {
  block(entry.name, typeof entry.detail === "string" ? entry.detail : "read-only provider check did not meet acceptance");
}

evidence.result.ok = evidence.result.blockers.length === 0;
finish();

function record(name, ok, detail) {
  evidence.checks.push({ name, ok: Boolean(ok), detail });
}

function block(name, reason) {
  if (!evidence.result.blockers.some((entry) => entry.name === name)) {
    evidence.result.blockers.push({ name, reason });
  }
}

function checkBindingSet(name, actual, expectedNames) {
  const names = new Set(actual.map((entry) => entry.name));
  const missing = expectedNames.filter((expected) => !names.has(expected));
  record(name, missing.length === 0, { bindings: actual, missing });
}

function deploymentItems(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.deployments)) return value.deployments;
  return [];
}

function sanitizeBindings(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((entry) => ({
      name: String(entry?.name ?? entry?.binding ?? "").trim(),
      type: String(entry?.type ?? entry?.kind ?? "unknown").trim(),
    }))
    .filter((entry) => entry.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function sanitizeDispatchDetails(value) {
  const script = value?.script ?? value ?? {};
  return {
    readable: true,
    compatibility_date: script?.compatibility_date ?? null,
    compatibility_flags: Array.isArray(script?.compatibility_flags) ? script.compatibility_flags : [],
  };
}

function observabilityEnabled(value) {
  const candidate = value?.observability ?? value?.settings?.observability ?? null;
  if (!candidate || typeof candidate !== "object") return false;
  const logs = candidate.logs ?? {};
  const traces = candidate.traces ?? {};
  return candidate.enabled === true && logs.enabled === true && traces.enabled === true;
}

function sanitizeObservability(value) {
  const candidate = value?.observability ?? value?.settings?.observability ?? null;
  if (!candidate || typeof candidate !== "object") return { observed: false };
  return {
    observed: true,
    enabled: candidate.enabled === true,
    logs_enabled: candidate.logs?.enabled === true,
    traces_enabled: candidate.traces?.enabled === true,
    logpush: typeof value?.logpush === "boolean" ? value.logpush : null,
  };
}

async function api(apiPath, { allowFailure = false } = {}) {
  const response = await fetch(`${baseApi}${apiPath}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "user-agent": "forge-r6-provider-readonly/1",
    },
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const ok = response.ok && payload?.success !== false;
  if (!ok && !allowFailure) {
    throw new Error(`Cloudflare read failed ${response.status}: ${firstMessage(payload)}`);
  }
  return {
    ok,
    status: response.status,
    result: payload?.result ?? null,
    message: firstMessage(payload) || `HTTP ${response.status}`,
  };
}

function firstMessage(payload) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  return String(errors[0]?.message ?? messages[0]?.message ?? "").trim();
}

function finish() {
  evidence.result.ok = evidence.result.blockers.length === 0;
  const text = `${JSON.stringify(evidence, null, 2)}\n`;
  process.stdout.write(text);
  if (output) writeFileSync(path.resolve(output), text, { encoding: "utf8", flag: "w" });
  process.exitCode = evidence.result.ok ? 0 : 2;
}
