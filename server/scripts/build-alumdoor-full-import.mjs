import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const [sourceArg, sqlArg, auditArg] = process.argv.slice(2);
if (!sourceArg || !sqlArg || !auditArg) {
  throw new Error("Usage: node build-alumdoor-full-import.mjs <source.tsv> <output.sql> <audit.json>");
}

const sourcePath = resolve(sourceArg);
const sqlPath = resolve(sqlArg);
const auditPath = resolve(auditArg);
const importedAt = "2026-07-28T11:15:00.000Z";

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

function parseMoney(value) {
  if (!value) return null;
  const normalized = value.replace(/[^\d-]/g, "");
  return normalized ? Number(normalized) : null;
}

const uomMap = new Map([
  ["M²", "m2"],
  ["M", "Mét"],
  ["KG", "Kg"],
  ["CON", "Con"],
  ["Bộ", "Bộ"],
  ["Cái", "Cái"],
  ["Cặp", "Cặp"],
  ["Cây", "Cây"],
]);

const codeOverrides = new Map([
  ["NVL-V5_KEM_STD", ["NVL-V5_KEM_STD", "NVL-V5_KEM_STD-02"]],
  ["RNHUA/LONG-CR", ["RNHUA/LONG-CR", "RNHUA/LONG-CR-02"]],
  ["TP-BUOMSAT", ["TP-BUOMSAT", "TP-BUOMSAT-02"]],
  ["TP-CUAST1LY_MM", ["TP-CUAST1LY_MM", "TP-CUAST1.2LY_MM", "TP-CUAST1.3LY_MM"]],
  ["TP-CUAST1.2LY_MM", ["TP-CUAST1.4LY_MM", "TP-CUAST1.5LY_MM"]],
  ["TP-CUAST8-9D_MM", ["TP-CUAST1.1LY_MM"]],
  ["TP-CUAST1.3LY_MM", ["TP-CUAST1.6LY_MM"]],
  ["TP-YHLD_TayDK", ["TP-YHLD_TayDK", null]],
]);

/**
 * ĐVT trong file danh mục là ĐVT BÁN. Với vật tư cân khi nhập nhưng bán theo mét,
 * không được chép nó sang ĐVT mua/tồn. conversion_factor có nghĩa:
 *   1 ĐVT bán = bao nhiêu ĐVT tồn
 */
const itemUomOverrides = new Map([
  ["TRỤC 114_1.8LY", { stock_uom: "Kg", purchase_uom: "Kg", sales_uom: "Mét", sales_factor: 4.4 }],
  ["TRỤC 114_2.1LY", { stock_uom: "Kg", purchase_uom: "Kg", sales_uom: "Mét", sales_factor: 4.7 }],
  ["RON-DD", { stock_uom: "Kg", purchase_uom: "Kg", sales_uom: "Mét", sales_factor: 0.117 }],
  ["RNHUA-DR", { stock_uom: "Kg", purchase_uom: "Kg", sales_uom: "Mét", sales_factor: 0.1 }],
  ["RNINOX-DR", { stock_uom: "Kg", purchase_uom: "Kg", sales_uom: "Mét", sales_factor: 0.12 }],
  ["TP-RAYHOP", { stock_uom: "Kg", purchase_uom: "Kg", sales_uom: "Mét", sales_factor: 1.08 }],
  ["TP-TD87A1 GS", { stock_uom: "Kg", purchase_uom: "Kg", sales_uom: "Mét", sales_factor: 0.6 }],
  ["TP-RAY HỘP TD U100", { stock_uom: "Kg", purchase_uom: "Kg", sales_uom: "Mét", sales_factor: 1.42 }],
]);

const sourceRows = rowsFromTsv(await readFile(sourcePath, "utf8"));
const populated = sourceRows.filter((row) => row["Mã SP"]);
const adjustments = populated.filter((row) => row["Mã SP"].startsWith("TRU-"));
const candidates = populated.filter((row) => !row["Mã SP"].startsWith("TRU-"));
const occurrences = new Map();
const items = [];
const remapped = [];
const merged = [];

for (const row of candidates) {
  const sourceCode = row["Mã SP"];
  const occurrence = occurrences.get(sourceCode) ?? 0;
  occurrences.set(sourceCode, occurrence + 1);
  const override = codeOverrides.get(sourceCode)?.[occurrence];
  const code = override === undefined ? sourceCode : override;
  if (code === null) {
    merged.push({ source_code: sourceCode, source_name: row["TÊN SP"], occurrence: occurrence + 1 });
    continue;
  }
  if (code !== sourceCode) {
    remapped.push({ source_code: sourceCode, imported_code: code, source_name: row["TÊN SP"], occurrence: occurrence + 1 });
  }

  const uom = uomMap.get(row["ĐVT"]);
  if (!uom) throw new Error(`Unsupported UOM "${row["ĐVT"]}" for ${sourceCode}`);
  const group = row["Nhóm SP"];
  if (!group) throw new Error(`Missing item group for ${sourceCode}`);
  const isDoor = group.startsWith("Cửa") && uom === "m2";
  const isMotorCombo = /^MOTOR\b/i.test(row["TÊN SP"]) && uom === "Bộ";
  const isService = sourceCode === "TP-BUOMSAT" || code === "TP-BUOMSAT-02" || sourceCode === "TP-BUOMSAT-ST";
  const virtualSaleItem = isMotorCombo || isService;
  const materialStage = sourceCode.startsWith("NVL-")
    ? "Nguyên vật liệu"
    : isDoor
      ? "Thành phẩm"
      : "Hàng hoá";
  const descriptionParts = [];
  if (row["Thông số"]) descriptionParts.push(`Thông số: ${row["Thông số"]}`);
  if (row["Ghi chú"]) descriptionParts.push(`Ghi chú: ${row["Ghi chú"]}`);
  if (row["Nhóm logic"]) descriptionParts.push(`Nhóm logic: ${row["Nhóm logic"]}`);
  if (row["PT siêu nhỏ (đ/bộ)"]) descriptionParts.push(`Phụ thu siêu nhỏ: ${row["PT siêu nhỏ (đ/bộ)"]}`);
  if (row["Có ray tặng"].toUpperCase() === "TRUE") descriptionParts.push("Có ray tặng");
  if (row["NHẬP HIỂN THỊ"]) descriptionParts.push(`Cách nhập: ${row["NHẬP HIỂN THỊ"]}`);
  if (isMotorCombo) descriptionParts.push("Mặt hàng bán theo combo; không trừ tồn trực tiếp");
  if (code !== sourceCode) descriptionParts.push(`Mã nguồn: ${sourceCode}`);

  const uomOverride = itemUomOverrides.get(code);
  const payload = {
    item_code: code,
    item_name: row["TÊN SP"],
    item_group: group,
    item_nature: virtualSaleItem ? "Dịch vụ" : "Hàng tồn kho",
    ...(virtualSaleItem ? {} : { material_stage: materialStage, supply_type: isDoor ? "Tự sản xuất" : "Mua ngoài" }),
    is_stock_item: !virtualSaleItem,
    is_purchase_item: !virtualSaleItem && !isDoor,
    is_sales_item: true,
    include_item_in_manufacturing: false,
    inventory_mode: isDoor ? "Thành phẩm theo m2" : "Hàng thường",
    ...(isDoor ? { measurement_profile: "Thành phẩm theo m2" } : {}),
    stock_uom: uomOverride?.stock_uom ?? uom,
    ...(!virtualSaleItem && !isDoor
      ? { default_purchase_uom: uomOverride?.purchase_uom ?? uom }
      : {}),
    default_sales_uom: uomOverride?.sales_uom ?? uom,
    ...(uomOverride ? {
      uom_conversions: [{
        row_id: `UOM-${uomOverride.sales_uom.toUpperCase()}`,
        uom: uomOverride.sales_uom,
        conversion_factor: uomOverride.sales_factor,
      }],
    } : {}),
    ...(row["KHO \n(K36-K12)"] ? { default_warehouse: row["KHO \n(K36-K12)"] } : {}),
    valuation_method: "FIFO",
    has_batch_no: false,
    has_serial_no: false,
    allow_negative_stock: false,
    description: descriptionParts.join(" | "),
    disabled: false,
    _metadata_revision: 24,
  };
  items.push({
    source_code: sourceCode,
    code,
    payload,
    list_price: parseMoney(row["Giá niêm yết"]),
    rail_price: parseMoney(row["Giá có ray"]),
    micro_surcharge: parseMoney(row["PT siêu nhỏ (đ/bộ)"]),
    rail_gift: row["Có ray tặng"].toUpperCase() === "TRUE",
    virtual_combo: isMotorCombo,
  });
}

const duplicateImportedCodes = [...new Set(items.map((item) => item.code).filter((code, index, all) => all.indexOf(code) !== index))];
if (duplicateImportedCodes.length) throw new Error(`Duplicate imported codes: ${duplicateImportedCodes.join(", ")}`);

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const chunks = (values, size = 20) => {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
};

const sql = [];
sql.push(`-- Full Alumdoor catalogue import generated from ${basename(sourcePath)}`);
sql.push(`-- Generated ${importedAt}; idempotent upsert by (tenant_id, doc_key).`);
sql.push("");
sql.push(`INSERT OR IGNORE INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
SELECT tenant_id,record_type||':'||name,record_type,name,'admin',0,'Draft',1,
       ${sqlText(importedAt)},${sqlText(importedAt)},'admin',data_json
FROM master_records
WHERE tenant_id='alu' AND record_type IN ('Item Group','UOM');`);
sql.push(`INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
SELECT tenant_id,record_type,name,name,data_json,${sqlText(importedAt)}
FROM master_records
WHERE tenant_id='alu' AND record_type IN ('Item Group','UOM')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;`);

const groups = [...new Set(items.map((item) => item.payload.item_group))].sort((a, b) => a.localeCompare(b, "vi"));
const groupParents = new Map(groups.map((group) => [
  group,
  group.startsWith("Cửa") ? "Thành phẩm" : "Linh kiện & thiết bị",
]));
groupParents.set("Phụ kiện", "Linh kiện & thiết bị");

function appendDocumentUpserts(doctype, records, chunkSize = 20) {
  for (const group of chunks(records, chunkSize)) {
    const rows = group.map(({ name, payload }) =>
      `('alu',${sqlText(`${doctype}:${name}`)},${sqlText(doctype)},${sqlText(name)},'admin',0,'Draft',1,${sqlText(importedAt)},${sqlText(importedAt)},'admin',${sqlText(JSON.stringify(payload))})`);
    sql.push(`INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ${rows.join(",\n  ")}
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,modified_at=excluded.modified_at,modified_by=excluded.modified_by,
  version=documents.version+1;`);
  }
}

function appendSearchUpserts(doctype, records, chunkSize = 30) {
  for (const group of chunks(records, chunkSize)) {
    const rows = group.map(({ name, title, content }) =>
      `('alu',${sqlText(doctype)},${sqlText(name)},${sqlText(title)},${sqlText(content)},${sqlText(importedAt)})`);
    sql.push(`INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES
  ${rows.join(",\n  ")}
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;`);
  }
}

appendDocumentUpserts("UOM", [...new Set(items.map((item) => item.payload.stock_uom))].sort().map((name) => ({
  name,
  payload: { uom_name: name, ...(["Bộ", "Cái", "Cặp", "Cây", "Con"].includes(name) ? { must_be_whole_number: true } : {}), _metadata_revision: 1 },
})));
appendSearchUpserts("UOM", [...new Set(items.map((item) => item.payload.stock_uom))].sort().map((name) => ({
  name, title: name, content: name,
})));

appendDocumentUpserts("Item Group", groups.map((name) => ({
  name,
  payload: { item_group_name: name, parent_item_group: groupParents.get(name), is_group: false, disabled: false, _metadata_revision: 1 },
})));
appendSearchUpserts("Item Group", groups.map((name) => ({
  name, title: name, content: `${name} ${groupParents.get(name)}`,
})));

appendDocumentUpserts("Warehouse", [
  { name: "Kho Alumdoor", payload: { warehouse_name: "Kho Alumdoor", is_group: true, disabled: false, _metadata_revision: 25 } },
  { name: "K12", payload: { warehouse_name: "K12", parent_warehouse: "Kho Alumdoor", is_group: false, address: "Kho vật lý K12", disabled: false, _metadata_revision: 25 } },
  { name: "K36", payload: { warehouse_name: "K36", parent_warehouse: "Kho Alumdoor", is_group: false, address: "Kho vật lý K36", disabled: false, _metadata_revision: 25 } },
]);
appendSearchUpserts("Warehouse", [
  { name: "Kho Alumdoor", title: "Kho Alumdoor", content: "Kho Alumdoor nhóm gốc" },
  { name: "K12", title: "K12", content: "K12 Kho vật lý K12 Kho Alumdoor" },
  { name: "K36", title: "K36", content: "K36 Kho vật lý K36 Kho Alumdoor" },
]);

appendDocumentUpserts("Price List", [
  { name: "Giá niêm yết", payload: { price_list_name: "Giá niêm yết", currency: "VND", note: "Giá niêm yết từ danh mục Alumdoor", disabled: false, _metadata_revision: 16 } },
  { name: "Giá có ray", payload: { price_list_name: "Giá có ray", currency: "VND", note: "Giá trọn bộ có ray; chỉ có dòng khi nguồn khai giá lớn hơn 0", disabled: false, _metadata_revision: 16 } },
]);
appendSearchUpserts("Price List", [
  { name: "Giá niêm yết", title: "Giá niêm yết", content: "Giá niêm yết Alumdoor VND" },
  { name: "Giá có ray", title: "Giá có ray", content: "Giá trọn bộ có ray Alumdoor VND" },
]);

appendDocumentUpserts("Item", items.map((item) => ({ name: item.code, payload: item.payload })), 15);
appendSearchUpserts("Item", items.map((item) => ({
  name: item.code,
  title: item.payload.item_name,
  content: `${item.code} ${item.payload.item_name} ${item.payload.item_group} ${item.payload.description}`,
})), 20);

const itemPrices = [];
for (const item of items) {
  if (item.list_price !== null) {
    itemPrices.push({
      name: `Giá niêm yết:${item.code}`,
      payload: {
        price_list: "Giá niêm yết",
        item_code: item.code,
        rate: item.list_price,
        currency: "VND",
        note: "Danh mục Alumdoor 2026-07-28",
        disabled: false,
        _metadata_revision: 16,
      },
    });
  }
  if (item.rail_price !== null && item.rail_price > 0) {
    itemPrices.push({
      name: `Giá có ray:${item.code}`,
      payload: {
        price_list: "Giá có ray",
        item_code: item.code,
        rate: item.rail_price,
        currency: "VND",
        note: "Danh mục Alumdoor 2026-07-28",
        disabled: false,
        _metadata_revision: 16,
      },
    });
  }
}
appendDocumentUpserts("Item Price", itemPrices, 18);
appendSearchUpserts("Item Price", itemPrices.map(({ name, payload }) => ({
  name,
  title: payload.item_code,
  content: `${payload.price_list} ${payload.item_code} ${payload.rate}`,
})), 24);

const audit = {
  source_file: basename(sourcePath),
  generated_at: importedAt,
  source_records_total: sourceRows.length,
  source_populated_rows: populated.length,
  imported_items: items.length,
  imported_list_prices: itemPrices.filter((row) => row.payload.price_list === "Giá niêm yết").length,
  imported_rail_prices: itemPrices.filter((row) => row.payload.price_list === "Giá có ray").length,
  missing_list_price_items: items.filter((item) => item.list_price === null).map((item) => item.code),
  virtual_motor_combos: items.filter((item) => item.virtual_combo).map((item) => item.code),
  micro_surcharge_rows_preserved_in_description: items.filter((item) => (item.micro_surcharge ?? 0) > 0).map((item) => ({
    item_code: item.code,
    amount: item.micro_surcharge,
  })),
  rail_gift_rows_preserved_in_description: items.filter((item) => item.rail_gift).map((item) => item.code),
  excluded_price_adjustments: adjustments.map((row) => ({
    source_code: row["Mã SP"],
    source_name: row["TÊN SP"],
    amount: parseMoney(row["Giá niêm yết"]),
    uom: row["ĐVT"],
  })),
  remapped_duplicate_codes: remapped,
  merged_exact_duplicates: merged,
  distinct_groups: groups,
  distinct_uoms: [...new Set(items.map((item) => item.payload.stock_uom))].sort(),
  expected_final_counts: {
    items: items.length,
    item_prices: itemPrices.length,
    excluded_adjustment_rows: adjustments.length,
  },
};

await writeFile(sqlPath, `${sql.join("\n\n")}\n`, "utf8");
await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  sql: sqlPath,
  audit: auditPath,
  items: items.length,
  item_prices: itemPrices.length,
  adjustments: adjustments.length,
  remapped: remapped.length,
  merged: merged.length,
}));
