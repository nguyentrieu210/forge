#!/usr/bin/env node
/**
 * R6-04 read-only Alumdoor identity observer.
 *
 * Collects only release/package/capability-profile identity needed to bind Golden Flow
 * evidence to the locked R6 candidate. It does not create/update/submit/cancel/delete
 * business documents and it runs only SELECT statements against D1.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readBriefSource } from "./lib/read-brief-source.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const TENANT = String(argOf("tenant", "alu") ?? "alu").trim();
const ORIGIN = String(argOf("origin", process.env.FORGE_ORIGIN ?? "https://alu.kairo.vn")).replace(/\/$/, "");
const EXPECTED_SHA = String(argOf("expected-release-sha", process.env.FORGE_EXPECTED_RELEASE_SHA ?? "")).trim();
const USER = String(argOf("admin", process.env.FORGE_ADMIN_USER ?? "admin")).trim();
const PASSWORD = process.env.FORGE_ADMIN_PASSWORD;
const OUTPUT = String(argOf("output", "") ?? "").trim();
const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_NAME = `cloudforge-${TENANT}`;

if (!EXPECTED_SHA) throw new Error("--expected-release-sha or FORGE_EXPECTED_RELEASE_SHA is required");
if (!/^[0-9a-f]{40}$/i.test(EXPECTED_SHA)) throw new Error("expected release SHA must be 40 hex characters");
if (!ORIGIN.startsWith("https://")) throw new Error("R6-04 remote observation requires https origin");

const expectedPackages = {
  alumdoor: (await readBriefSource(new URL("../briefs/alumdoor-v2.json", import.meta.url))).version,
  hrm: JSON.parse(await readFile(new URL("../apps-src/hrm/app.json", import.meta.url), "utf8")).version,
  "vn-accounting": JSON.parse(await readFile(new URL("../apps-src/vn-accounting/app.json", import.meta.url), "utf8")).version,
  "manufacturing-qms": JSON.parse(await readFile(new URL("../apps-src/manufacturing-qms/app.json", import.meta.url), "utf8")).version,
  maintenance: JSON.parse(await readFile(new URL("../apps-src/maintenance/app.json", import.meta.url), "utf8")).version,
};

let cookie = "";
let csrf = "";
async function raw(method, pathname, payload) {
  const response = await fetch(`${ORIGIN}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-frappe-csrf-token": csrf } : {}),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const jar = new Map(cookie
    ? cookie.split("; ").map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)])
    : []);
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const at = pair.indexOf("=");
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
  cookie = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  csrf = response.headers.get("x-frappe-csrf-token") ?? csrf;
  return response;
}

async function jsonGet(pathname) {
  const response = await raw("GET", pathname);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return {
    ok: response.ok,
    status: response.status,
    value: body && Object.hasOwn(body, "message") ? body.message : body,
  };
}

function wranglerJson(args) {
  if (args.some((entry) => /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|UPSERT)\b/i.test(entry))) {
    throw new Error("R6-04 observer refuses mutating Wrangler arguments");
  }
  const result = spawnSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: SERVER_ROOT,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) return { ok: false, reason: "wrangler_command_failed" };
  const stdout = result.stdout ?? "";
  const start = stdout.indexOf("[");
  if (start < 0) return { ok: false, reason: "wrangler_json_missing" };
  try { return { ok: true, value: JSON.parse(stdout.slice(start)) }; }
  catch { return { ok: false, reason: "wrangler_json_invalid" }; }
}

const releaseResult = await jsonGet("/release.json");
const releaseMarker = releaseResult.ok && releaseResult.value && typeof releaseResult.value === "object"
  ? releaseResult.value
  : null;
const observedReleaseSha = String(releaseMarker?.releaseSha ?? releaseMarker?.deployedSha ?? "").trim();
const bundleHash = String(releaseMarker?.bundleHash ?? "").trim();

let loginStatus = 0;
let packageObservations = {};
let profileApi = { ok: false, status: 0, profile_id: null, version: null, valid: null, blocked_capabilities: [] };
if (PASSWORD) {
  const login = await raw("POST", "/api/method/login", { usr: USER, pwd: PASSWORD });
  loginStatus = login.status;
  if (login.ok) {
    for (const [appId, expectedVersion] of Object.entries(expectedPackages)) {
      const result = await jsonGet(`/api/method/metaforge.api.get_app_manifest?app=${encodeURIComponent(appId)}`);
      const live = result.ok && result.value && typeof result.value === "object" ? result.value : null;
      packageObservations[appId] = {
        expected_version: expectedVersion,
        observed_version: live?.version ?? null,
        http_status: result.status,
        matches: result.ok && live?.version === expectedVersion,
      };
    }

    const result = await jsonGet("/api/method/metaforge.api.get_capability_profile");
    const profile = result.ok && result.value && typeof result.value === "object" ? result.value : null;
    const capabilities = Array.isArray(profile?.resolution?.capabilities) ? profile.resolution.capabilities : [];
    profileApi = {
      ok: result.ok,
      status: result.status,
      profile_id: profile?.profile_id ?? null,
      version: Number.isInteger(profile?.version) ? profile.version : null,
      valid: typeof profile?.resolution?.valid === "boolean" ? profile.resolution.valid : null,
      capability_count: capabilities.length,
      active_capability_count: capabilities.filter((entry) => entry?.state === "enabled" || entry?.state === "required").length,
      blocked_capabilities: capabilities.filter((entry) => entry?.state === "blocked").map((entry) => entry.capability_id).sort(),
    };
  }
}

let profileDb = { ok: false, profile_id: null, version: null, content_hash: null, reason: "cloudflare_token_missing" };
if (process.env.CLOUDFLARE_API_TOKEN) {
  const sql = [
    "SELECT a.profile_id, a.version, r.content_hash",
    "FROM capability_profile_active a",
    "JOIN capability_profile_revisions r",
    "  ON r.tenant_id = a.tenant_id AND r.profile_id = a.profile_id AND r.version = a.version",
    `WHERE a.tenant_id = '${TENANT.replace(/'/g, "''")}'`,
    "LIMIT 2;",
  ].join(" ");
  const query = wranglerJson(["d1", "execute", DB_NAME, "--remote", "--json", "--command", sql]);
  if (query.ok) {
    const rows = Array.isArray(query.value?.[0]?.results) ? query.value[0].results : [];
    if (rows.length === 1) {
      profileDb = {
        ok: true,
        profile_id: rows[0].profile_id ?? null,
        version: Number.isInteger(rows[0].version) ? rows[0].version : Number(rows[0].version),
        content_hash: rows[0].content_hash ?? null,
        reason: null,
      };
    } else {
      profileDb = { ok: false, profile_id: null, version: null, content_hash: null, reason: `active_profile_rows_${rows.length}` };
    }
  } else {
    profileDb = { ok: false, profile_id: null, version: null, content_hash: null, reason: query.reason };
  }
}

const packageMatch = Object.keys(expectedPackages).length > 0
  && Object.values(packageObservations).length === Object.keys(expectedPackages).length
  && Object.values(packageObservations).every((entry) => entry.matches === true);
const profileMatch = profileApi.ok
  && profileApi.valid === true
  && profileApi.blocked_capabilities.length === 0
  && profileDb.ok
  && profileApi.profile_id === profileDb.profile_id
  && profileApi.version === profileDb.version
  && typeof profileDb.content_hash === "string"
  && /^[0-9a-f]{64}$/i.test(profileDb.content_hash);
const releaseMatch = releaseResult.ok
  && observedReleaseSha === EXPECTED_SHA
  && bundleHash.length > 0;

const observation = {
  schema: "forge-r6-04-identity-observation/v1",
  evidence_id: "R6-E18",
  producer: "R6-04",
  observed_at: new Date().toISOString(),
  environment_class: "PILOT_TARGET_OBSERVED",
  target: { tenant: TENANT, origin: ORIGIN, database: DB_NAME },
  mutation: "NONE",
  expected_source_sha: EXPECTED_SHA,
  release: {
    http_status: releaseResult.status,
    release_sha: observedReleaseSha || null,
    bundle_hash: bundleHash || null,
    matches_locked_candidate: releaseMatch,
  },
  authentication: { attempted: Boolean(PASSWORD), http_status: loginStatus || null, succeeded: loginStatus >= 200 && loginStatus < 300 },
  packages: packageObservations,
  capability_profile: {
    api: profileApi,
    database: profileDb,
    identity_matches: profileMatch,
  },
  status: releaseMatch && packageMatch && profileMatch ? "PASS" : "BLOCKED",
  blockers: [
    ...(releaseMatch ? [] : ["locked_candidate_release_not_observed"]),
    ...(packageMatch ? [] : ["locked_package_versions_not_observed"]),
    ...(profileMatch ? [] : ["active_capability_profile_identity_not_proven"]),
  ],
};

const rendered = `${JSON.stringify(observation, null, 2)}\n`;
if (OUTPUT) {
  await mkdir(path.dirname(path.resolve(OUTPUT)), { recursive: true });
  await writeFile(OUTPUT, rendered, "utf8");
}
process.stdout.write(rendered);
