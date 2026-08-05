const API = "https://api.cloudflare.com/client/v4";

async function requestJson(pathname, { token, fetchImpl = fetch } = {}) {
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required");
  const response = await fetchImpl(`${API}${pathname}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "user-agent": "forge-demo-provider-credentials/1",
    },
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  const ok = response.ok && payload?.success !== false;
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

export async function resolveCloudflareAccountId({ token, accountHint = "", gatewayScript = "cloudforge-gateway", fetchImpl = fetch } = {}) {
  const hint = String(accountHint ?? "").trim();
  if (hint) return { accountId: hint, selection: "explicit" };

  const accounts = await requestJson("/accounts?per_page=50", { token, fetchImpl });
  if (!accounts.ok || !Array.isArray(accounts.result)) {
    throw new Error(`unable to enumerate token-visible Cloudflare accounts: ${accounts.message}`);
  }
  const ids = accounts.result.map((entry) => String(entry?.id ?? "").trim()).filter(Boolean);
  if (!ids.length) throw new Error("Cloudflare API token exposes no account identity");

  const matches = [];
  for (const accountId of ids) {
    const probe = await requestJson(`/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(gatewayScript)}/settings`, {
      token,
      fetchImpl,
    });
    if (probe.ok) matches.push(accountId);
  }
  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? `${gatewayScript} was not readable in any token-visible Cloudflare account`
      : `${gatewayScript} resolved in ${matches.length} Cloudflare accounts; refusing ambiguous account selection`);
  }
  return { accountId: matches[0], selection: `token-visible account containing ${gatewayScript}` };
}

async function secretText(pathname, { token, fetchImpl = fetch } = {}) {
  const response = await requestJson(pathname, { token, fetchImpl });
  if (!response.ok) return { readable: false, value: null, reason: response.message };
  // Cloudflare secret GET endpoints normally omit plaintext by design. If the provider
  // ever exposes a value to this credential, keep it in memory only and never print it.
  const value = typeof response.result?.text === "string" && response.result.text.length > 0
    ? response.result.text
    : null;
  return { readable: true, value, reason: value ? "provider returned transient text" : "provider returned metadata only" };
}

export async function resolveDemoPlatformSecrets({
  token,
  accountId,
  namespace = "cloudforge-production",
  referenceTenantScript = "cloudforge-tenant-alu",
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  if (!accountId) throw new Error("accountId is required for secret resolution");
  const resolved = {
    FORGE_INTERNAL_AUTH_SECRET: String(env.FORGE_INTERNAL_AUTH_SECRET ?? env.INTERNAL_AUTH_SECRET ?? "").trim(),
    FORGE_INTERNAL_SERVICE_TOKEN: String(env.FORGE_INTERNAL_SERVICE_TOKEN ?? env.INTERNAL_SERVICE_TOKEN ?? "").trim(),
    FORGE_CONTROL_TOKEN: String(env.FORGE_CONTROL_TOKEN ?? env.CONTROL_TOKEN ?? "").trim(),
  };
  const source = {};
  for (const [name, value] of Object.entries(resolved)) if (value) source[name] = "environment";

  const missing = () => Object.entries(resolved).filter(([, value]) => !value).map(([name]) => name);
  if (!missing().length) return { values: resolved, source };

  const dispatchBase = `/accounts/${encodeURIComponent(accountId)}/workers/dispatch/namespaces/${encodeURIComponent(namespace)}/scripts/${encodeURIComponent(referenceTenantScript)}/secrets`;
  const probes = {
    FORGE_INTERNAL_AUTH_SECRET: `${dispatchBase}/INTERNAL_AUTH_SECRET`,
    FORGE_INTERNAL_SERVICE_TOKEN: `${dispatchBase}/INTERNAL_SERVICE_TOKEN`,
    FORGE_CONTROL_TOKEN: `/accounts/${encodeURIComponent(accountId)}/workers/scripts/cloudforge-control-plane/secrets/CONTROL_TOKEN`,
  };

  const unavailable = [];
  for (const name of missing()) {
    const probe = await secretText(probes[name], { token, fetchImpl });
    if (probe.value) {
      resolved[name] = probe.value;
      source[name] = "cloudflare-existing-binding";
    } else {
      unavailable.push({ name, reason: probe.reason });
    }
  }
  if (unavailable.length) {
    const detail = unavailable.map(({ name, reason }) => `${name}: ${reason}`).join("; ");
    throw new Error(`platform shared secrets are unavailable for safe tenant provisioning (${detail}). Existing Cloudflare secret values were not exposed; do not generate mismatched replacements.`);
  }
  return { values: resolved, source };
}
