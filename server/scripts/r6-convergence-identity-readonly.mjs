#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { d1Query, quote, wrangler } from "./wrangler-cli.mjs";
import { findTenantDatabaseId, removeTenantConfig, writeTenantConfig } from "./tenant-wrangler.mjs";

const args = process.argv.slice(2);
const argOf = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const tenant = argOf("tenant")?.trim();
const origin = argOf("origin")?.trim()?.replace(/\/$/, "");
const expectedReleaseSha = argOf("expected-release-sha")?.trim();
const output = argOf("output")?.trim();
if (!tenant || !/^[a-z][a-z0-9-]*$/.test(tenant)) throw new Error("--tenant <id> is required");
if (!origin) throw new Error("--origin <https://host> is required");
if (!/^[0-9a-f]{40}$/i.test(expectedReleaseSha ?? "")) throw new Error("--expected-release-sha <40-hex> is required");

const observedAt = new Date().toISOString();
const releaseResponse = await fetch(`${origin}/release.json`, { redirect: "error" });
const releaseBody = releaseResponse.ok ? await releaseResponse.json() : {};
const releaseSha = String(releaseBody?.releaseSha ?? releaseBody?.deployedSha ?? "");
const bundleHash = String(releaseBody?.bundleHash ?? "");

const databaseId = findTenantDatabaseId(tenant, wrangler);
if (!databaseId) throw new Error(`no D1 database named cloudforge-${tenant}`);
const { configPath, relativeConfig } = writeTenantConfig({ tenant, databaseId, publicOrigin: origin });

let packages = [];
let profile = null;
let schema = { installed_apps: false, capability_profile_active: false, capability_profile_revisions: false };
try {
  const database = { name: `cloudforge-${tenant}`, id: databaseId, configArg: relativeConfig };
  const tableRows = d1Query(database, `SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('installed_apps','capability_profile_active','capability_profile_revisions') ORDER BY name`);
  const tables = new Set(tableRows.map((row) => String(row.name)));
  schema = {
    installed_apps: tables.has("installed_apps"),
    capability_profile_active: tables.has("capability_profile_active"),
    capability_profile_revisions: tables.has("capability_profile_revisions"),
  };

  if (schema.installed_apps) {
    packages = d1Query(database, `SELECT app_id, app_name, version, content_hash FROM installed_apps WHERE tenant_id='${quote(tenant)}' ORDER BY app_id`)
      .map((row) => ({
        app_id: String(row.app_id),
        app_name: String(row.app_name),
        version: String(row.version),
        content_hash: String(row.content_hash),
      }));
  }

  if (schema.capability_profile_active && schema.capability_profile_revisions) {
    const rows = d1Query(database, `SELECT a.profile_id, a.version, r.content_hash, r.resolution_json FROM capability_profile_active a JOIN capability_profile_revisions r ON r.tenant_id=a.tenant_id AND r.profile_id=a.profile_id AND r.version=a.version WHERE a.tenant_id='${quote(tenant)}' LIMIT 1`);
    if (rows[0]) {
      let resolution = null;
      try { resolution = JSON.parse(String(rows[0].resolution_json)); } catch { /* preserve raw identity only */ }
      profile = {
        profile_id: String(rows[0].profile_id),
        version: Number(rows[0].version),
        content_hash: String(rows[0].content_hash),
        valid: resolution?.valid ?? null,
        blocked_capabilities: Array.isArray(resolution?.blocked_capabilities) ? resolution.blocked_capabilities : [],
      };
    }
  }
} finally {
  removeTenantConfig(configPath);
}

const alumdoor = packages.find((entry) => entry.app_id === "alumdoor") ?? null;
const blockers = [];
if (releaseResponse.status !== 200) blockers.push("release_marker_unavailable");
if (releaseSha !== expectedReleaseSha) blockers.push("exact_release_sha_not_observed");
if (!bundleHash) blockers.push("bundle_hash_missing");
if (!schema.installed_apps) blockers.push("installed_apps_schema_missing");
if (!alumdoor) blockers.push("alumdoor_package_not_observed");
else if (alumdoor.version !== "2.2.3") blockers.push(`alumdoor_version_${alumdoor.version}_not_2.2.3`);
if (!schema.capability_profile_active || !schema.capability_profile_revisions) blockers.push("capability_profile_schema_pending");
else if (!profile) blockers.push("active_capability_profile_not_observed");
else if (profile.valid === false || profile.blocked_capabilities.length > 0) blockers.push("active_capability_profile_not_valid");

const evidence = {
  schema: "forge-r6-convergence-identity/v1",
  evidence_id: "R6-E18",
  observed_at: observedAt,
  environment_class: "PILOT_TARGET_OBSERVED",
  mutation: "NONE",
  target: { tenant, origin, database_name: `cloudforge-${tenant}` },
  expected_source_sha: expectedReleaseSha,
  release: {
    http_status: releaseResponse.status,
    release_sha: releaseSha || null,
    bundle_hash: bundleHash || null,
    matches_candidate: releaseSha === expectedReleaseSha,
  },
  schema_state: schema,
  packages,
  capability_profile: profile,
  status: blockers.length === 0 ? "PASS" : "BLOCKED",
  blockers,
};

const rendered = `${JSON.stringify(evidence, null, 2)}\n`;
if (output) writeFileSync(path.resolve(output), rendered, { encoding: "utf8", flag: "wx" });
process.stdout.write(rendered);
if (blockers.length > 0) process.exitCode = 2;
