#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { normalizeCatalogFixture, planAlumdoorCatalogAudit } from "./alumdoor-catalog-audit-planner.mjs";

const FORBIDDEN_WRITE_FLAGS = new Set(["--execute", "--apply", "--fix", "--write-back"]);
const AUDITED_DOCTYPES = [
  "Item", "Item Group", "UOM", "Measurement Profile", "Warehouse",
  "Bill of Materials", "Production Standard",
];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(scriptDir, "..");

await main();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const forbidden = process.argv.slice(2).find((value) => FORBIDDEN_WRITE_FLAGS.has(value));
  if (forbidden) fail(`${forbidden} is not supported; this command is read-only.`);
  if (Boolean(args.input) === Boolean(args.tenant)) {
    fail("usage: node scripts/audit-alumdoor-catalog.mjs (--input fixture.json | --tenant <id>) [--output report.json] [--redacted|--include-names]");
  }

  let cleanup = null;
  try {
    const source = args.input ? readFixture(args.input) : await readRemote(args.tenant);
    cleanup = source.cleanup ?? null;
    const redacted = args.redacted || (Boolean(args.tenant) && !args.includeNames);
    const report = planAlumdoorCatalogAudit({
      metadataVersion: source.metadataVersion,
      records: source.records,
      redacted,
    });
    const output = resolveOutput(args, redacted);
    writeFileSync(output, `${JSON.stringify({
      generated_at: new Date().toISOString(),
      source: args.input
        ? { kind: "fixture", file: path.basename(path.resolve(args.input)) }
        : { kind: "tenant", tenant_hash: sha(args.tenant).slice(0, 16) },
      ...report,
    }, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      mode: "read-only",
      redacted,
      output,
      checksum: report.checksum,
      counts: report.counts,
    }, null, 2));
    if (report.counts.critical > 0 || report.counts.high > 0) process.exitCode = 2;
  } finally {
    cleanup?.();
  }
}

function readFixture(file) {
  const fixture = JSON.parse(readFileSync(path.resolve(process.cwd(), file), "utf8"));
  const normalized = normalizeCatalogFixture(fixture);
  return { metadataVersion: normalized.metadataVersion, records: normalized.records };
}

async function readRemote(tenant) {
  const [{ findTenantDatabaseId, findTenantOrigin, removeTenantConfig, writeTenantConfig }, cli] = await Promise.all([
    import("./tenant-wrangler.mjs"),
    import("./wrangler-cli.mjs"),
  ]);
  const databaseId = findTenantDatabaseId(tenant, cli.wrangler);
  if (!databaseId) cli.fail(`tenant database cloudforge-${tenant} was not found`);
  const publicOrigin = findTenantOrigin(tenant, cli.wrangler) ?? undefined;
  const generated = writeTenantConfig({ tenant, databaseId, publicOrigin });
  const database = { name: `cloudforge-${tenant}`, id: databaseId, configArg: generated.relativeConfig };
  const types = AUDITED_DOCTYPES.map((value) => `'${cli.quote(value)}'`).join(",");
  const tenantLiteral = cli.quote(tenant);
  const rows = cli.d1Query(database, `
    SELECT record_type, name, data_json, source_rank FROM (
      SELECT record_type, name, data_json, 0 AS source_rank
      FROM master_records
      WHERE tenant_id='${tenantLiteral}' AND disabled=0 AND record_type IN (${types})
      UNION ALL
      SELECT doctype AS record_type, name, payload_json AS data_json, 1 AS source_rank
      FROM documents
      WHERE tenant_id='${tenantLiteral}' AND docstatus<>2 AND doctype IN (${types})
    )
    ORDER BY record_type, name, source_rank
  `);
  return {
    metadataVersion: "2.0.34",
    records: rows.map((row) => ({
      doctype: row.record_type,
      name: row.name,
      data_json: row.data_json,
      source_rank: row.source_rank,
    })),
    cleanup: () => removeTenantConfig(generated.configPath),
  };
}

function resolveOutput(args, redacted) {
  const output = path.resolve(process.cwd(), args.output ?? `alumdoor-catalog-audit-${args.tenant ? sha(args.tenant).slice(0, 12) : "fixture"}.json`);
  const repoRoot = path.resolve(serverRoot, "..");
  const relative = path.relative(repoRoot, output);
  const insideRepo = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (insideRepo && !redacted) fail("unredacted audit output cannot be written inside the repository; use --redacted or choose an external path");
  return output;
}

function parseArgs(argv) {
  const result = { input: "", tenant: "", output: "", redacted: false, includeNames: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--redacted") result.redacted = true;
    else if (token === "--include-names") result.includeNames = true;
    else if (["--input", "--tenant", "--output"].includes(token)) {
      const value = argv[++index];
      if (!value) fail(`${token} requires a value`);
      if (token === "--input") result.input = value;
      else if (token === "--tenant") result.tenant = value;
      else result.output = value;
    } else if (!FORBIDDEN_WRITE_FLAGS.has(token)) fail(`unknown argument: ${token}`);
  }
  if (result.redacted && result.includeNames) fail("choose either --redacted or --include-names, not both");
  return result;
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}
function sha(value) { return createHash("sha256").update(String(value)).digest("hex"); }
