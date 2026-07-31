#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  const sources = [args.input, args.brief, args.tenant].filter(Boolean);
  if (sources.length !== 1) {
    fail("usage: node scripts/audit-alumdoor-catalog.mjs (--input fixture.json | --brief briefs/alumdoor-v2.json | --tenant <id>) [--output report.json] [--redacted|--include-names]");
  }

  let cleanup = null;
  try {
    const source = args.input
      ? readFixture(args.input)
      : args.brief
        ? readBrief(args.brief)
        : await readRemote(args.tenant);
    cleanup = source.cleanup ?? null;
    const redacted = args.redacted || (Boolean(args.tenant) && !args.includeNames);
    const report = planAlumdoorCatalogAudit({
      metadataVersion: source.metadataVersion,
      records: source.records,
      redacted,
    });
    const output = resolveOutput(args);
    writeFileSync(output, `${JSON.stringify({
      generated_at: new Date().toISOString(),
      source: sourceDescriptor(args),
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

function readBrief(file) {
  const absolute = path.resolve(process.cwd(), file);
  const brief = JSON.parse(readFileSync(absolute, "utf8"));
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) fail("Alumdoor brief must be a JSON object.");
  if (!Array.isArray(brief.fixtures)) fail("Alumdoor brief does not contain a fixtures array.");
  const records = brief.fixtures
    .filter((row) => row && typeof row === "object" && AUDITED_DOCTYPES.includes(String(row.type ?? "")))
    .map((row) => ({
      doctype: String(row.type),
      name: String(row.name ?? ""),
      data: row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {},
    }));
  return {
    metadataVersion: String(brief.version ?? ""),
    records,
  };
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
    SELECT
      record_type,
      name,
      CASE
        WHEN source_rank=0 THEN json_set(
          CASE WHEN json_valid(data_json) THEN data_json ELSE '{}' END,
          '$.disabled',
          COALESCE(disabled_state, 0)
        )
        ELSE data_json
      END AS data_json,
      source_rank
    FROM (
      SELECT record_type, name, data_json, disabled AS disabled_state, 0 AS source_rank
      FROM master_records
      WHERE tenant_id='${tenantLiteral}' AND record_type IN (${types})
      UNION ALL
      SELECT doctype AS record_type, name, payload_json AS data_json, NULL AS disabled_state, 1 AS source_rank
      FROM documents
      WHERE tenant_id='${tenantLiteral}' AND docstatus<>2 AND doctype IN (${types})
    )
    ORDER BY record_type, name, source_rank
  `);
  return {
    metadataVersion: "2.0.35",
    records: rows.map((row) => ({
      doctype: row.record_type,
      name: row.name,
      data_json: row.data_json,
      source_rank: row.source_rank,
    })),
    cleanup: () => removeTenantConfig(generated.configPath),
  };
}

function sourceDescriptor(args) {
  if (args.input) return { kind: "fixture", file: path.basename(path.resolve(args.input)) };
  if (args.brief) return { kind: "brief", file: path.basename(path.resolve(args.brief)) };
  return { kind: "tenant", tenant_hash: sha(args.tenant).slice(0, 16) };
}

function resolveOutput(args) {
  const label = args.tenant ? sha(args.tenant).slice(0, 12) : args.brief ? "brief" : "fixture";
  const output = args.output
    ? path.resolve(process.cwd(), args.output)
    : path.join(tmpdir(), `alumdoor-catalog-audit-${label}.json`);
  const repoRoot = path.resolve(serverRoot, "..");
  const relative = path.relative(repoRoot, output);
  const insideRepo = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (insideRepo) fail("audit output must stay outside the repository; choose an external --output path");
  return output;
}

function parseArgs(argv) {
  const result = { input: "", brief: "", tenant: "", output: "", redacted: false, includeNames: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--redacted") result.redacted = true;
    else if (token === "--include-names") result.includeNames = true;
    else if (["--input", "--brief", "--tenant", "--output"].includes(token)) {
      const value = argv[++index];
      if (!value) fail(`${token} requires a value`);
      if (token === "--input") result.input = value;
      else if (token === "--brief") result.brief = value;
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
