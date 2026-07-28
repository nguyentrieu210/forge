#!/usr/bin/env node
/**
 * Read-only audit for Alumdoor customer, supplier and price-list masters.
 *
 * It deliberately discovers relational columns from the live schema instead of
 * assuming that every reference is stored inside documents.payload_json.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { removeTenantConfig, findTenantDatabaseId, writeTenantConfig } from "./tenant-wrangler.mjs";
import { d1Query, quote, wrangler } from "./wrangler-cli.mjs";

const tenant = "alu";
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
const outputPath = outputIndex >= 0 ? path.resolve(args[outputIndex + 1]) : null;
const auditedDoctypes = ["Customer", "Supplier", "Price List"];
const referenceColumns = new Set([
  "customer",
  "customer_id",
  "supplier",
  "supplier_id",
  "party",
  "price_list",
  "selling_price_list",
  "buying_price_list",
]);

const databaseId = findTenantDatabaseId(tenant, wrangler);
if (!databaseId) throw new Error(`Không tìm thấy D1 cloudforge-${tenant}`);

const { configPath, relativeConfig } = writeTenantConfig({
  tenant,
  databaseId,
  databaseName: `cloudforge-${tenant}`,
  publicOrigin: "https://alu.kairo.vn",
});

const database = {
  name: `cloudforge-${tenant}`,
  id: databaseId,
  configArg: relativeConfig,
};

try {
  const masters = d1Query(
    database,
    `SELECT doctype, name, payload_json, created_at, modified_at
     FROM documents
     WHERE tenant_id = '${tenant}'
       AND doctype IN (${auditedDoctypes.map((value) => `'${quote(value)}'`).join(", ")})
     ORDER BY doctype, name`,
  );

  const documentReferences = d1Query(
    database,
    `WITH masters AS (
       SELECT doctype, name
       FROM documents
       WHERE tenant_id = '${tenant}'
         AND doctype IN (${auditedDoctypes.map((value) => `'${quote(value)}'`).join(", ")})
     )
     SELECT
       masters.doctype AS master_doctype,
       masters.name AS master_name,
       documents.doctype AS referring_doctype,
       documents.name AS referring_name,
       json_tree.fullkey AS referring_path
     FROM masters
     JOIN documents
       ON documents.tenant_id = '${tenant}'
     JOIN json_tree(documents.payload_json)
       ON json_tree.type = 'text'
      AND json_tree.value = masters.name
     WHERE NOT (
       documents.doctype = masters.doctype
       AND documents.name = masters.name
     )
     ORDER BY masters.doctype, masters.name, documents.doctype, documents.name`,
  );

  const tables = d1Query(
    database,
    `SELECT name, sql
     FROM sqlite_schema
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
       AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
     ORDER BY name`,
  );
  const masterNames = masters.map((row) => `'${quote(row.name)}'`).join(", ");
  const relationalReferences = [];
  for (const { name: table, sql } of tables) {
    const declaredSql = String(sql ?? "").toLowerCase();
    if (![...referenceColumns].some((column) => new RegExp(`\\b${column}\\b`).test(declaredSql))) {
      continue;
    }
    const safeTable = String(table).replace(/"/g, '""');
    const columns = d1Query(database, `PRAGMA table_info("${safeTable}")`);
    for (const column of columns) {
      if (!referenceColumns.has(column.name)) continue;
      const safeColumn = String(column.name).replace(/"/g, '""');
      const partyFilter =
        column.name === "party" && columns.some((entry) => entry.name === "party_type")
          ? ` AND "party_type" IN (${auditedDoctypes.map((value) => `'${quote(value)}'`).join(", ")})`
          : "";
      const rows = d1Query(
        database,
        `SELECT "${safeColumn}" AS value, COUNT(*) AS reference_count
         FROM "${safeTable}"
         WHERE "${safeColumn}" IS NOT NULL
           AND TRIM(CAST("${safeColumn}" AS TEXT)) <> ''${partyFilter}
           AND CAST("${safeColumn}" AS TEXT) IN (${masterNames})
         GROUP BY "${safeColumn}"
         ORDER BY "${safeColumn}"`,
      );
      for (const row of rows) {
        relationalReferences.push({
          table,
          column: column.name,
          value: row.value,
          reference_count: row.reference_count,
        });
      }
    }
  }

  const documentCounts = new Map();
  for (const row of documentReferences) {
    const key = `${row.master_doctype}\u0000${row.master_name}`;
    documentCounts.set(key, (documentCounts.get(key) ?? 0) + 1);
  }
  const relationalCounts = new Map();
  for (const row of relationalReferences) {
    relationalCounts.set(
      String(row.value),
      (relationalCounts.get(String(row.value)) ?? 0) + Number(row.reference_count),
    );
  }

  const summary = masters.map((row) => {
    let payload = {};
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      payload = { _invalid_payload_json: true };
    }
    return {
      doctype: row.doctype,
      name: row.name,
      label:
        payload.customer_name ??
        payload.supplier_name ??
        payload.price_list_name ??
        payload.title ??
        row.name,
      disabled: payload.disabled ?? false,
      created_at: row.created_at,
      modified_at: row.modified_at,
      document_reference_count:
        documentCounts.get(`${row.doctype}\u0000${row.name}`) ?? 0,
      relational_reference_count: relationalCounts.get(row.name) ?? 0,
    };
  });
  const protectedPriceLists = new Set(["Giá niêm yết", "Giá có ray"]);
  const compactDocumentReferences = documentReferences.filter(
    (row) =>
      row.master_doctype !== "Price List" ||
      !protectedPriceLists.has(row.master_name),
  );
  const protectedReferenceCounts = Object.fromEntries(
    [...protectedPriceLists].map((name) => [
      `Price List:${name}`,
      documentReferences.filter(
        (row) => row.master_doctype === "Price List" && row.master_name === name,
      ).length,
    ]),
  );

  const report = `${JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      tenant,
      database_name: database.name,
      masters: summary,
      document_references: compactDocumentReferences,
      protected_reference_counts: protectedReferenceCounts,
      relational_references: relationalReferences,
    },
    null,
    2,
  )}\n`;
  if (outputPath) writeFileSync(outputPath, report, "utf8");
  process.stdout.write(report);
} finally {
  removeTenantConfig(configPath);
}
