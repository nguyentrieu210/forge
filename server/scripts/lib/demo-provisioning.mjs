const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

export function normalizeDemoSlug(value) {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!slug || !/^[a-z][a-z0-9-]*$/.test(slug)) {
    throw new Error("demo slug must start with a letter and contain only lowercase letters, digits and hyphens");
  }
  if (slug.length > 48) throw new Error("demo slug must be 48 characters or fewer");
  return slug;
}

export function normalizeBaseDomain(value) {
  const domain = String(value ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!domain || domain.includes("*") || !/^[a-z0-9.-]+$/.test(domain) || !domain.includes(".")) {
    throw new Error("base domain must be a plain DNS name such as kairo.vn");
  }
  return domain;
}

export function demoHostname(slug, baseDomain) {
  return `${normalizeDemoSlug(slug)}.${normalizeBaseDomain(baseDomain)}`;
}

export function demoDatabaseName(slug) {
  return `cloudforge-${normalizeDemoSlug(slug)}`;
}

async function cloudflareJson(pathOrUrl, { token, method = "GET", body, fetchImpl = fetch } = {}) {
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required");
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${CLOUDFLARE_API}${pathOrUrl}`;
  const response = await fetchImpl(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Cloudflare API returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok || payload.success !== true) {
    const details = (payload.errors ?? []).map((entry) => `${entry.code ?? "?"}: ${entry.message ?? "unknown error"}`).join("; ");
    throw new Error(`Cloudflare API ${method} ${new URL(url).pathname} failed HTTP ${response.status}${details ? ` — ${details}` : ""}`);
  }
  return payload.result;
}

export async function ensureDemoDatabase({ accountId, token, databaseName, fetchImpl = fetch }) {
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID is required");
  if (!databaseName) throw new Error("databaseName is required");

  const listUrl = new URL(`${CLOUDFLARE_API}/accounts/${encodeURIComponent(accountId)}/d1/database`);
  listUrl.searchParams.set("name", databaseName);
  listUrl.searchParams.set("per_page", "100");
  const listed = await cloudflareJson(listUrl.toString(), { token, fetchImpl });
  const exact = (Array.isArray(listed) ? listed : []).filter((entry) => entry?.name === databaseName);
  if (exact.length > 1) throw new Error(`Cloudflare returned multiple D1 databases named ${databaseName}`);
  if (exact.length === 1) {
    const uuid = exact[0].uuid;
    if (!uuid) throw new Error(`existing D1 ${databaseName} has no uuid in provider response`);
    return { id: uuid, name: databaseName, created: false };
  }

  const created = await cloudflareJson(`/accounts/${encodeURIComponent(accountId)}/d1/database`, {
    token,
    method: "POST",
    body: { name: databaseName },
    fetchImpl,
  });
  if (!created?.uuid) throw new Error(`created D1 ${databaseName} has no uuid in provider response`);
  return { id: created.uuid, name: databaseName, created: true };
}

export async function resolveWorkersDevOrigin({ accountId, token, scriptName, fetchImpl = fetch }) {
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID is required");
  if (!scriptName || !/^[a-z0-9][a-z0-9-]*$/.test(scriptName)) throw new Error("valid Worker scriptName is required");

  const accountSubdomain = await cloudflareJson(`/accounts/${encodeURIComponent(accountId)}/workers/subdomain`, {
    token,
    fetchImpl,
  });
  const scriptSubdomain = await cloudflareJson(`/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/subdomain`, {
    token,
    fetchImpl,
  });
  if (!accountSubdomain?.subdomain) throw new Error("Cloudflare account has no workers.dev subdomain");
  if (scriptSubdomain?.enabled !== true) throw new Error(`${scriptName} is not enabled on workers.dev; set FORGE_CONTROL_URL explicitly`);
  return `https://${scriptName}.${accountSubdomain.subdomain}.workers.dev`;
}

export async function waitForTenantShell(origin, { attempts = 20, delayMs = 3000, fetchImpl = fetch } = {}) {
  const base = String(origin ?? "").replace(/\/$/, "");
  if (!/^https:\/\//.test(base)) throw new Error("tenant origin must be https://");
  let last = "no response";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(`${base}/login`, { method: "GET", redirect: "manual" });
      last = `HTTP ${response.status}`;
      if (response.status >= 200 && response.status < 300) return { attempt, status: response.status };
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`tenant shell did not become ready after ${attempts} attempts (${last})`);
}
