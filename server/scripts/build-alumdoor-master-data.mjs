import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const [catalogArg, cleanupAuditArg, sqlArg, auditArg] = process.argv.slice(2);
if (!catalogArg || !cleanupAuditArg || !sqlArg || !auditArg) {
  throw new Error(
    "Usage: node build-alumdoor-master-data.mjs <catalog.tsv> <cleanup-audit.json> <output.sql> <audit.json>",
  );
}

const catalogPath = resolve(catalogArg);
const cleanupAuditPath = resolve(cleanupAuditArg);
const sqlPath = resolve(sqlArg);
const auditPath = resolve(auditArg);
const importedAt = "2026-07-28T14:30:00.000Z";

function parseDelimited(text, delimiter = "\t") {
  const records = [];
  let record = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      record.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      record.push(value);
      records.push(record);
      record = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value || record.length) {
    record.push(value);
    records.push(record);
  }
  return records;
}

function rowsFromTsv(text) {
  const records = parseDelimited(text.replace(/^\uFEFF/, ""));
  const headers = records.shift().map((header) => header.trim());
  return records.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? "").trim()])));
}

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const chunks = (values, size = 20) => {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
};
const inList = (values) => values.map(quote).join(", ");

const catalogRows = rowsFromTsv(await readFile(catalogPath, "utf8")).filter((row) => row["Mã SP"]);
const cleanupAudit = JSON.parse(await readFile(cleanupAuditPath, "utf8"));
const protectedNames = new Map([
  ["Customer", new Set(["CTY SÁU HỒNG"])],
  ["Supplier", new Set()],
  ["Price List", new Set(["Giá niêm yết", "Giá có ray"])],
]);
const cleanupMatchers = {
  Customer: (name) =>
    name === "C01140" ||
    /^KH tồn \d+$/.test(name) ||
    /^Khách thử \d+$/.test(name) ||
    /^Khách thử mua \d+$/.test(name),
  Supplier: (name) => /^(Hoàng Lai|Lạ mặt|Tiến Đạt) \d+$/.test(name),
  "Price List": (name) => /^Giá đại lý \d+$/.test(name),
};

const cleanupByDoctype = new Map();
for (const doctype of ["Customer", "Supplier", "Price List"]) {
  const names = cleanupAudit.masters
    .filter((row) => row.doctype === doctype)
    .map((row) => row.name)
    .filter((name) => cleanupMatchers[doctype](name) && !protectedNames.get(doctype).has(name));
  cleanupByDoctype.set(doctype, names);
}

const cleanupNames = new Set([...cleanupByDoctype.values()].flat());
const allowedDependentDocuments = cleanupAudit.document_references
  .filter(
    (row) =>
      cleanupNames.has(row.master_name) &&
      row.master_doctype === "Customer" &&
      row.referring_doctype === "Payment Entry",
  )
  .map((row) => row.referring_name);
const unexpectedReferences = cleanupAudit.document_references.filter(
  (row) =>
    cleanupNames.has(row.master_name) &&
    !(
      row.master_doctype === "Customer" &&
      row.referring_doctype === "Payment Entry" &&
      allowedDependentDocuments.includes(row.referring_name)
    ),
);
const relationalBlockers = cleanupAudit.relational_references.filter((row) =>
  cleanupNames.has(String(row.value)));
if (unexpectedReferences.length || relationalBlockers.length) {
  throw new Error(
    `Cleanup blocked by references: ${JSON.stringify({ unexpectedReferences, relationalBlockers })}`,
  );
}

const colors = [
  { code: "THÔ", name: "Thô", finish: "Thô", count: 911 },
  { code: "GS", name: "GS", finish: "Khác", count: 286 },
  { code: "VK", name: "VK", finish: "Khác", count: 68 },
  { code: "CF", name: "CF", finish: "Khác", count: 1 },
  { code: "XF", name: "XF", finish: "Khác", count: 1 },
  { code: "4004", name: "4004", finish: "Khác", count: 1 },
];

const brandRules = [
  { brand: "ALUMAX", pattern: /\bALUMAX\b/i },
  { brand: "TANKER", pattern: /\bTANKER\b/i },
  { brand: "YH TAIWAN", pattern: /\bYHTAIWAN\b|\bYH TAIWAN\b/i },
  { brand: "YHLD", pattern: /\bYHLD\b/i },
  { brand: "JG", pattern: /\bJG\b/i },
  { brand: "BOSTEC", pattern: /\bBOSTEC\b/i },
  { brand: "CH TAIWAN", pattern: /\bCHTAIWAN\b|\bCH TAIWAN\b/i },
  { brand: "MULLER", pattern: /\bMULLER\b/i },
];

const brandAssignmentsByItem = new Map();
for (const row of catalogRows) {
  if (row["Mã SP"].startsWith("TRU-")) continue;
  const haystack = `${row["Mã SP"]} ${row["TÊN SP"]}`;
  const match = brandRules.find((rule) => rule.pattern.test(haystack));
  if (match) brandAssignmentsByItem.set(row["Mã SP"], { itemCode: row["Mã SP"], brand: match.brand });
}
const brandAssignments = [...brandAssignmentsByItem.values()];

const specifications = [];
for (const row of catalogRows) {
  if (row["Mã SP"].startsWith("TRU-")) continue;
  const detail = row["Thông số"];
  const match = detail.match(/^Dày\s+([\d.,]+)-([\d.,]+)mm\s*\|\s*Bản lá\s+([\d.,]+)$/i);
  if (!match) continue;
  const specCode = `QC-${row["Mã SP"]}`;
  specifications.push({
    itemCode: row["Mã SP"],
    name: specCode,
    payload: {
      spec_code: specCode,
      spec_name: `Quy cách ${row["TÊN SP"]}`,
      profile_system: row["Nhóm SP"],
      section_code: row["Mã SP"],
      width_mm: Number(match[3].replace(",", ".")),
      note: `Độ dày ${match[1]}-${match[2]} mm; bản lá ${match[3]} mm. Nguồn: ${basename(catalogPath)}`,
      disabled: false,
    },
  });
}

const measurementProfiles = [
  { name: "Hàng thường", payload: { profile_name: "Hàng thường", inventory_mode: "Hàng thường", stock_uom: "Cái" } },
  {
    name: "Nhôm cây/lá",
    payload: {
      profile_name: "Nhôm cây/lá",
      inventory_mode: "Nhôm cây/lá",
      stock_uom: "Kg",
      track_dimension_lot: true,
      require_color: true,
      require_condition: true,
      require_length: true,
      require_piece_qty: true,
    },
  },
  {
    name: "Tấm/Kính",
    payload: {
      profile_name: "Tấm/Kính",
      inventory_mode: "Tấm/Kính",
      stock_uom: "Tấm",
      track_dimension_lot: true,
      require_length: true,
      require_width: true,
      require_piece_qty: true,
    },
  },
  {
    name: "Cuộn",
    payload: {
      profile_name: "Cuộn",
      inventory_mode: "Cuộn",
      stock_uom: "Kg",
      track_dimension_lot: true,
      require_width: true,
    },
  },
  { name: "Lô/Serial", payload: { profile_name: "Lô/Serial", inventory_mode: "Lô/Serial", stock_uom: "Cái" } },
  {
    name: "Thành phẩm theo m2",
    payload: {
      profile_name: "Thành phẩm theo m2",
      inventory_mode: "Thành phẩm theo m2",
      stock_uom: "Bộ",
      require_length: true,
      require_width: true,
    },
  },
];

const sql = [
  `-- Alumdoor master cleanup and verified catalogue-derived master data.`,
  `-- Generated ${importedAt}; cleanup targets come from ${basename(cleanupAuditPath)}.`,
  `-- Re-runnable: exact deletes plus idempotent upserts.`,
];

function appendSideTableDeletes(doctype, names) {
  if (!names.length) return;
  const namesSql = inList(names);
  sql.push(`DELETE FROM versions
WHERE tenant_id='alu' AND doc_key IN (
  SELECT doc_key FROM documents
  WHERE tenant_id='alu' AND doctype=${quote(doctype)} AND name IN (${namesSql})
);`);
  for (const table of ["document_comments", "document_shares", "document_tags", "assignments"]) {
    sql.push(`DELETE FROM ${table}
WHERE tenant_id='alu' AND doctype=${quote(doctype)} AND name IN (${namesSql});`);
  }
  sql.push(`DELETE FROM files
WHERE tenant_id='alu' AND attached_to_doctype=${quote(doctype)} AND attached_to_name IN (${namesSql});`);
  sql.push(`DELETE FROM document_search
WHERE tenant_id='alu' AND doctype=${quote(doctype)} AND name IN (${namesSql});`);
  sql.push(`DELETE FROM documents
WHERE tenant_id='alu' AND doctype=${quote(doctype)} AND name IN (${namesSql});`);
}

appendSideTableDeletes("Payment Entry", allowedDependentDocuments);
for (const [doctype, names] of cleanupByDoctype) appendSideTableDeletes(doctype, names);

function appendDocumentUpserts(doctype, records, metadataRevision, chunkSize = 20) {
  for (const group of chunks(records, chunkSize)) {
    const rows = group.map(({ name, payload }) => {
      const normalized = { ...payload, disabled: payload.disabled ?? false, _metadata_revision: metadataRevision };
      return `('alu',${quote(`${doctype}:${name}`)},${quote(doctype)},${quote(name)},'admin',0,'Draft',1,${quote(importedAt)},${quote(importedAt)},'admin',${quote(JSON.stringify(normalized))})`;
    });
    sql.push(`INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ${rows.join(",\n  ")}
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1;`);
  }
}

function appendSearchUpserts(doctype, records, chunkSize = 30) {
  for (const group of chunks(records, chunkSize)) {
    const rows = group.map(({ name, title, content }) =>
      `('alu',${quote(doctype)},${quote(name)},${quote(title)},${quote(content)},${quote(importedAt)})`);
    sql.push(`INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES
  ${rows.join(",\n  ")}
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;`);
  }
}

appendDocumentUpserts(
  "Item Color",
  colors.map((color) => ({
    name: color.code,
    payload: {
      color_code: color.code,
      color_name: color.name,
      finish: color.finish,
      note: `Mã màu gốc từ lịch sử tồn nhôm; xuất hiện ${color.count} dòng. Chưa tự diễn giải mã viết tắt.`,
    },
  })),
  1,
);
appendSearchUpserts(
  "Item Color",
  colors.map((color) => ({
    name: color.code,
    title: color.name,
    content: `${color.code} ${color.name} ${color.finish}`,
  })),
);

appendDocumentUpserts(
  "Brand",
  brandRules.map(({ brand }) => ({
    name: brand,
    payload: { brand_name: brand, note: "Tên xuất hiện trực tiếp trong mã/tên mặt hàng Alumdoor." },
  })),
  1,
);
appendSearchUpserts(
  "Brand",
  brandRules.map(({ brand }) => ({ name: brand, title: brand, content: brand })),
);

appendDocumentUpserts(
  "Material Specification",
  specifications.map(({ name, payload }) => ({ name, payload })),
  1,
);
appendSearchUpserts(
  "Material Specification",
  specifications.map(({ name, payload }) => ({
    name,
    title: payload.spec_name,
    content: `${name} ${payload.spec_name} ${payload.note}`,
  })),
);

appendDocumentUpserts("Measurement Profile", measurementProfiles, 2);
appendSearchUpserts(
  "Measurement Profile",
  measurementProfiles.map(({ name, payload }) => ({
    name,
    title: payload.profile_name,
    content: `${payload.profile_name} ${payload.inventory_mode} ${payload.stock_uom}`,
  })),
);

for (const group of chunks(brandAssignments, 40)) {
  sql.push(`UPDATE documents
SET payload_json=json_set(payload_json,'$.brand',CASE name
${group.map(({ itemCode, brand }) => `  WHEN ${quote(itemCode)} THEN ${quote(brand)}`).join("\n")}
END),
    modified_at=${quote(importedAt)},
    modified_by='admin',
    version=version+1
WHERE tenant_id='alu' AND doctype='Item' AND name IN (${inList(group.map((row) => row.itemCode))});`);
}

for (const group of chunks(specifications, 30)) {
  sql.push(`UPDATE documents
SET payload_json=json_set(payload_json,'$.material_specification',CASE name
${group.map(({ itemCode, name }) => `  WHEN ${quote(itemCode)} THEN ${quote(name)}`).join("\n")}
END),
    modified_at=${quote(importedAt)},
    modified_by='admin',
    version=version+1
WHERE tenant_id='alu' AND doctype='Item' AND name IN (${inList(group.map((row) => row.itemCode))});`);
}

const audit = {
  generated_at: importedAt,
  source_catalog: basename(catalogPath),
  cleanup_audit: basename(cleanupAuditPath),
  deleted: {
    customers: cleanupByDoctype.get("Customer").length,
    suppliers: cleanupByDoctype.get("Supplier").length,
    price_lists: cleanupByDoctype.get("Price List").length,
    dependent_draft_payment_entries: allowedDependentDocuments.length,
  },
  protected: Object.fromEntries([...protectedNames].map(([doctype, names]) => [doctype, [...names]])),
  inserted_or_updated: {
    item_colors: colors.length,
    brands: brandRules.length,
    material_specifications: specifications.length,
    measurement_profiles: measurementProfiles.length,
  },
  item_links_updated: {
    brand: brandAssignments.length,
    material_specification: specifications.length,
  },
  intentionally_empty_until_verified_source_exists: [
    "Manufacturer",
    "Material Grade",
    "Item Attribute",
    "Supplier Item",
    "Pricing Rule",
  ],
};

await writeFile(sqlPath, `${sql.join("\n\n")}\n`, "utf8");
await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ sql: sqlPath, audit: auditPath, ...audit }, null, 2));
