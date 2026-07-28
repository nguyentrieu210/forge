#!/usr/bin/env node
/**
 * Read-only audit of Alumdoor Item UOM setup.
 *
 * Stock, purchase and sales UOM are separate business facts. This report finds
 * records where purchase UOM is missing, is a derived rate (KG/M...), or differs
 * from stock UOM without a declared conversion.
 */
import { removeTenantConfig, findTenantDatabaseId, writeTenantConfig } from "./tenant-wrangler.mjs";
import { d1Query, wrangler } from "./wrangler-cli.mjs";

const tenant = "alu";
const databaseId = findTenantDatabaseId(tenant, wrangler);
if (!databaseId) throw new Error(`Không tìm thấy D1 cloudforge-${tenant}`);

const { configPath, relativeConfig } = writeTenantConfig({
  tenant,
  databaseId,
  databaseName: `cloudforge-${tenant}`,
  publicOrigin: "https://alu.kairo.vn",
});
const database = { name: `cloudforge-${tenant}`, id: databaseId, configArg: relativeConfig };

try {
  const rows = d1Query(database, `
    SELECT
      name,
      json_extract(payload_json, '$.item_name') AS item_name,
      json_extract(payload_json, '$.item_group') AS item_group,
      json_extract(payload_json, '$.material_stage') AS material_stage,
      json_extract(payload_json, '$.is_stock_item') AS is_stock_item,
      json_extract(payload_json, '$.is_purchase_item') AS is_purchase_item,
      json_extract(payload_json, '$.is_sales_item') AS is_sales_item,
      json_extract(payload_json, '$.inventory_mode') AS inventory_mode,
      json_extract(payload_json, '$.stock_uom') AS stock_uom,
      json_extract(payload_json, '$.default_purchase_uom') AS purchase_uom,
      json_extract(payload_json, '$.default_sales_uom') AS sales_uom,
      json_extract(payload_json, '$.uom_conversions') AS conversions,
      modified_at
    FROM documents
    WHERE tenant_id='alu' AND doctype='Item'
    ORDER BY item_group, name
  `);

  // "KG/M", "KG/CON"... là định mức/tỷ lệ, không phải một đơn vị đo độc lập.
  // m2 là UOM hợp lệ nên không được gom nhầm vào nhóm này.
  const derivedRate = /\//;
  const issues = [];
  for (const row of rows) {
    let conversions = [];
    try { conversions = JSON.parse(row.conversions ?? "[]"); } catch { /* reported below */ }
    const conversionUoms = new Set(conversions.map((entry) => String(entry?.uom ?? "").trim()).filter(Boolean));
    const purchase = String(row.purchase_uom ?? "").trim();
    const stock = String(row.stock_uom ?? "").trim();
    if (Number(row.is_purchase_item) === 1 && !purchase) {
      issues.push({ severity: "error", issue: "missing_purchase_uom", ...row });
    }
    if (derivedRate.test(purchase) || derivedRate.test(stock)) {
      issues.push({ severity: "error", issue: "derived_rate_used_as_uom", ...row });
    }
    if (purchase && stock && purchase !== stock && !conversionUoms.has(purchase)) {
      issues.push({ severity: "error", issue: "missing_purchase_conversion", ...row });
    }
  }

  const byUom = Object.values(rows.reduce((acc, row) => {
    const key = `${row.stock_uom ?? ""}\u0000${row.purchase_uom ?? ""}\u0000${row.sales_uom ?? ""}`;
    acc[key] ??= {
      stock_uom: row.stock_uom,
      purchase_uom: row.purchase_uom,
      sales_uom: row.sales_uom,
      count: 0,
    };
    acc[key].count += 1;
    return acc;
  }, {})).sort((a, b) => b.count - a.count);

  const itemPrices = d1Query(database, `
    SELECT
      p.name,
      json_extract(p.payload_json, '$.price_list') AS price_list,
      json_extract(p.payload_json, '$.item_code') AS item_code,
      json_extract(p.payload_json, '$.uom') AS uom,
      json_extract(i.payload_json, '$.default_sales_uom') AS default_sales_uom,
      json_extract(i.payload_json, '$.stock_uom') AS stock_uom
    FROM documents p
    LEFT JOIN documents i
      ON i.tenant_id=p.tenant_id
     AND i.doctype='Item'
     AND i.name=json_extract(p.payload_json, '$.item_code')
    WHERE p.tenant_id='alu' AND p.doctype='Item Price'
    ORDER BY p.name
  `);
  const itemPriceIssues = itemPrices
    .filter((row) => !String(row.uom ?? "").trim())
    .map((row) => ({ severity: "error", issue: "missing_price_uom", ...row }));

  // Before changing a base stock UOM, expose every relational table that already
  // carries quantities for the Item. Historical stock must be migrated, never
  // silently re-labelled from Mét to Kg.
  const relationalUsage = [];
  const tables = d1Query(database, `
    SELECT name FROM sqlite_schema
    WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
    ORDER BY name
  `);
  for (const { name: table } of tables) {
    const safeTable = String(table).replaceAll('"', '""');
    const columns = d1Query(database, `PRAGMA table_info("${safeTable}")`);
    const itemColumn = columns.find((column) => column.name === "item_code");
    if (!itemColumn) continue;
    const usage = d1Query(database, `
      SELECT item_code, COUNT(*) AS row_count
      FROM "${safeTable}"
      WHERE item_code IS NOT NULL AND TRIM(CAST(item_code AS TEXT)) <> ''
      GROUP BY item_code
      ORDER BY item_code
    `);
    for (const entry of usage) relationalUsage.push({ table, ...entry });
  }

  process.stdout.write(`${JSON.stringify({
    generated_at: new Date().toISOString(),
    database_name: database.name,
    item_count: rows.length,
    uom_combinations: byUom,
    issue_count: issues.length,
    issues,
    item_price_count: itemPrices.length,
    item_price_issue_count: itemPriceIssues.length,
    item_price_issues: itemPriceIssues,
    relational_usage: relationalUsage,
    items: rows,
  }, null, 2)}\n`);
} finally {
  removeTenantConfig(configPath);
}
