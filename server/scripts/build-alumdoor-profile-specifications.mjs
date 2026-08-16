import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMaterialSpecificationSeed } from "./seed-alumdoor-material-specifications-local.mjs";

const [tenantArg = "demo", sqlArg, auditArg] = process.argv.slice(2);
if (!sqlArg || !auditArg) {
  throw new Error("Usage: node build-alumdoor-profile-specifications.mjs [tenant] <output.sql> <audit.json>");
}
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { sql, catalog } = await buildMaterialSpecificationSeed(repoRoot, tenantArg);
const audit = {
  generated_at: "2026-08-16T15:15:00.000Z",
  authority: "server/scripts/lib/alumdoor-material-specification-catalog.mjs",
  canonical_specs: catalog.length,
  item_links: catalog.map((row) => ({ item_code: row.itemCode, material_specification: row.specCode })),
  retired_legacy_profile_map: true,
};
await writeFile(resolve(sqlArg), sql, "utf8");
await writeFile(resolve(auditArg), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ sql: resolve(sqlArg), audit: resolve(auditArg), canonical_specs: catalog.length }, null, 2));
