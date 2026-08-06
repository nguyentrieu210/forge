#!/usr/bin/env node
/**
 * Idempotently restores Alumdoor Cutting Policy fixtures from the canonical brief.
 *
 * Dry-run is the default. Production mutation requires --execute and is intentionally
 * limited to tenant `alu` plus the seven known policy fixtures (five active standards
 * and two legacy-disabled records). No other master record is touched.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { d1Query, fail, quote, serverRoot, wrangler } from "./wrangler-cli.mjs";
import { findTenantDatabaseId, removeTenantConfig, writeTenantConfig } from "./tenant-wrangler.mjs";

const args = process.argv.slice(2);
const argOf = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const tenant = argOf("tenant") ?? "alu";
const execute = args.includes("--execute");
const outputPath = argOf("output") ? path.resolve(argOf("output")) : null;
if (tenant !== "alu") fail("This repair is intentionally scoped to --tenant alu only");

const activeNames = [
  "Cửa Đức — công thức chuẩn",
  "Cửa Úc — công thức chuẩn",
  "Cửa Lưới — công thức chuẩn",
  "Cửa Đài Loan — công thức chuẩn",
  "Cửa Siêu Trường — công thức chuẩn",
];
const legacyDisabledNames = [
  "Cửa Đức — đại lý",
  "Cửa Đức — khách lẻ",
];
const allowedNames = new Set([...activeNames, ...legacyDisabledNames]);

const briefPath = path.join(serverRoot, "briefs", "alumdoor-v2.json");
const brief = JSON.parse(readFileSync(briefPath, "utf8"));
const fixtures = (brief.fixtures ?? [])
  .filter((fixture) => fixture?.type === "Cutting Policy" && allowedNames.has(fixture.name))
  .sort((left, right) => left.name.localeCompare(right.name, "vi"));

if (fixtures.length !== allowedNames.size) {
  const found = new Set(fixtures.map((fixture) => fixture.name));
  const missing = [...allowedNames].filter((name) => !found.has(name));
  fail(`Canonical brief is missing Cutting Policy fixtures: ${missing.join(", ")}`);
}
for (const name of activeNames) {
  const fixture = fixtures.find((entry) => entry.name === name);
  if (!fixture || fixture.data?.disabled === true || fixture.data?.disabled === 1 || fixture.data?.disabled === "1") {
    fail(`Active fixture is unexpectedly disabled: ${name}`);
  }
}
for (const name of legacyDisabledNames) {
  const fixture = fixtures.find((entry) => entry.name === name);
  if (!fixture || !(fixture.data?.disabled === true || fixture.data?.disabled === 1 || fixture.data?.disabled === "1")) {
    fail(`Legacy fixture must remain disabled: ${name}`);
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function samePayload(raw, expected) {
  try {
    return JSON.stringify(stable(JSON.parse(raw))) === JSON.stringify(stable(expected));
  } catch {
    return false;
  }
}

const databaseId = findTenantDatabaseId(tenant, wrangler);
if (!databaseId) fail(`No D1 database named cloudforge-${tenant}`);
const { configPath, relativeConfig } = writeTenantConfig({
  tenant,
  databaseId,
  databaseName: `cloudforge-${tenant}`,
  publicOrigin: "https://alu.kairo.vn",
});
const database = { name: `cloudforge-${tenant}`, id: databaseId, configArg: relativeConfig };
const namesSql = [...allowedNames].map((name) => `'${quote(name)}'`).join(",");
const readTarget = () => d1Query(
  database,
  `SELECT name, disabled, data_json, modified_at
   FROM master_records
   WHERE tenant_id='${tenant}'
     AND record_type='Cutting Policy'
     AND name IN (${namesSql})
   ORDER BY name`,
);

let report;
try {
  const before = readTarget();
  const beforeByName = new Map(before.map((row) => [row.name, row]));
  const plan = fixtures.map((fixture) => {
    const current = beforeByName.get(fixture.name);
    return {
      name: fixture.name,
      intended_state: activeNames.includes(fixture.name) ? "active" : "legacy-disabled",
      status: !current ? "missing" : samePayload(current.data_json, fixture.data) && Number(current.disabled ?? 0) === 0 ? "already-canonical" : "drifted",
    };
  });

  if (execute) {
    const now = new Date().toISOString();
    const values = fixtures.map((fixture) =>
      `('${tenant}','Cutting Policy','${quote(fixture.name)}',0,'${quote(JSON.stringify(fixture.data))}','${quote(now)}')`,
    ).join(",\n");
    const sql = `INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)\nVALUES\n${values}\nON CONFLICT(tenant_id,record_type,name) DO UPDATE SET\n  disabled=excluded.disabled,\n  data_json=excluded.data_json,\n  modified_at=excluded.modified_at;`;
    wrangler([
      "d1", "execute", database.name,
      "--config", database.configArg,
      "--remote", "--command", sql,
    ], { capture: false });
  }

  const after = execute ? readTarget() : before;
  const afterByName = new Map(after.map((row) => [row.name, row]));
  const verification = fixtures.map((fixture) => {
    const row = afterByName.get(fixture.name);
    const payloadMatches = Boolean(row) && samePayload(row.data_json, fixture.data);
    const storageEnabled = Boolean(row) && Number(row.disabled ?? 0) === 0;
    return {
      name: fixture.name,
      present: Boolean(row),
      payload_matches: payloadMatches,
      storage_enabled: storageEnabled,
      logical_disabled: Boolean(fixture.data?.disabled),
      pass: Boolean(row) && payloadMatches && storageEnabled,
    };
  });
  const passed = verification.every((entry) => entry.pass);
  report = {
    format: "forge-alumdoor-cutting-policy-sync/v1",
    generated_at: new Date().toISOString(),
    tenant,
    database_name: database.name,
    mode: execute ? "EXECUTE" : "DRY_RUN",
    canonical_source: "server/briefs/alumdoor-v2.json#fixtures",
    active_policy_names: activeNames,
    legacy_disabled_policy_names: legacyDisabledNames,
    plan,
    verification,
    pass: execute ? passed : true,
  };
  const rendered = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) writeFileSync(outputPath, rendered, "utf8");
  process.stdout.write(rendered);
  if (execute && !passed) fail("Cutting Policy post-write verification failed");
} finally {
  removeTenantConfig(configPath);
}
