import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileBrief } from "./lib/compile-brief.mjs";

const [tenantId, outputArg] = process.argv.slice(2);
if (!tenantId || !outputArg) {
  throw new Error("usage: node build-alumdoor-install-address-metadata-local.mjs <tenant> <output.sql>");
}

const brief = JSON.parse(await readFile(resolve("briefs/alumdoor-v2.json"), "utf8"));
const app = compileBrief(brief);
const selected = new Set(["Tỉnh Thành", "Phường Xã", "Địa chỉ giao lắp", "Tài khoản ngân hàng", "Price List", "Customer", "Sales Order"]);
const doctypes = app.doctypes.filter((doctype) => selected.has(doctype.name));
if (doctypes.length !== selected.size) throw new Error("installation address DocTypes are incomplete");

const sql = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const now = "2026-08-13T00:00:00.000Z";
const rows = doctypes.map((doctype) => "  (" + [
  tenantId,
  doctype.name,
  doctype.module ?? "Alumdoor",
  doctype.custom ? 1 : 0,
  doctype.is_submittable ? 1 : 0,
  doctype.is_child ? 1 : 0,
  doctype.revision ?? 1,
  JSON.stringify(doctype),
  0,
  "admin",
  now,
].map(sql).join(",") + ")").join(",\n");

const output = [
  "-- Installation address metadata for Alumdoor. Safe to re-run.",
  "INSERT INTO doctype_definitions",
  "  (tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at)",
  "VALUES",
  rows,
  "ON CONFLICT(tenant_id,doctype) DO UPDATE SET",
  "  module=excluded.module, is_custom=excluded.is_custom, is_submittable=excluded.is_submittable,",
  "  is_child=excluded.is_child, revision=doctype_definitions.revision+1, metadata_json=excluded.metadata_json,",
  "  disabled=excluded.disabled, modified_by=excluded.modified_by, modified_at=excluded.modified_at;",
  "",
].join("\n");

await writeFile(resolve(outputArg), output, "utf8");
console.log("Wrote " + doctypes.length + " DocType definitions to " + resolve(outputArg));
