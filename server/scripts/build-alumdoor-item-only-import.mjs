import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COMPOSITE_ITEMS, loadKgItems } from "./lib/alumdoor-item-standardization.mjs";

const [catalogArg, oldItemsArg, sqlArg, auditArg, tenantArg = "demo"] = process.argv.slice(2);
if (!catalogArg || !oldItemsArg || !sqlArg || !auditArg) {
  throw new Error(
    "Usage: node build-alumdoor-item-only-import.mjs <catalog.tsv> <old-items.tsv> <output.sql> <audit.json> [tenant]",
  );
}

const catalogPath = resolve(catalogArg);
const oldItemsPath = resolve(oldItemsArg);
const sqlPath = resolve(sqlArg);
const auditPath = resolve(auditArg);
const tenant = tenantArg.trim();
const importedAt = "2026-08-11T16:30:00.000Z";
const migrationSource = "alumdoor-item-only-2026-08-11";
const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

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
  return records
    .filter((values) => values.some((value) => String(value ?? "").trim()))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()])),
    );
}

function normalizeUom(value) {
  const normalized = String(value ?? "").trim().toLocaleUpperCase("vi");
  const map = new Map([
    ["M²", "m2"],
    ["M2", "m2"],
    ["M", "Mét"],
    ["MÉT", "Mét"],
    ["KG", "Kg"],
    ["CON", "Con"],
    ["BỘ", "Bộ"],
    ["CÁI", "Cái"],
    ["CẶP", "Cặp"],
    ["CÂY", "Cây"],
    ["TẤM", "Tấm"],
  ]);
  const result = map.get(normalized);
  if (!result) throw new Error(`Unsupported UOM: ${value}`);
  return result;
}

function normalizeWarehouse(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  if (normalized === "K12" || normalized === "Kho K12") return "Kho K12";
  if (normalized === "K36") return "K36";
  throw new Error(`Unsupported warehouse: ${value}`);
}

const codeOverrides = new Map([
  ["NVL-V5_KEM_STD", ["NVL-V5_KEM_STD", "NVL-V5_KEM_STD-02"]],
  ["RNHUA/LONG-CR", ["RNHUA/LONG-CR", "RNHUA/LONG-CR-02"]],
  ["TP-BUOMSAT", ["TP-BUOMSAT", "TP-BUOMSAT-02"]],
  ["TP-CUAST1LY_MM", ["TP-CUAST1LY_MM", "TP-CUAST1.2LY_MM", "TP-CUAST1.3LY_MM"]],
  ["TP-CUAST1.2LY_MM", ["TP-CUAST1.4LY_MM", "TP-CUAST1.5LY_MM"]],
  ["TP-CUAST8-9D_MM", ["TP-CUAST1.1LY_MM"]],
  ["TP-CUAST1.3LY_MM", ["TP-CUAST1.6LY_MM"]],
  ["TP-YHLD_TayDK", ["TP-YHLD_TayDK", null]],
  ["NVL_Longden", ["NVL_Longden", null]],
  ["NVL_Hoakhe", ["NVL_Hoakhe", null]],
]);

const missingCodeOverrides = new Map([
  ["LONG ĐỀN", { code: "NVL_Longden", name: "LÔNG ĐỀN" }],
  ["LÔNG ĐỀN", { code: "NVL_Longden", name: "LÔNG ĐỀN" }],
  ["HOA KHẾ", { code: "NVL_Hoakhe", name: "HOA KHẾ (3 CHẤU)" }],
  ["CỐT TRỤC 140", { code: "NVL_Cottruc140", name: "CỐT TRỤC 140" }],
]);

const compositeCodes = new Set(COMPOSITE_ITEMS.map((item) => item.itemCode));
const catalogRowsRaw = rowsFromTsv(await readFile(catalogPath, "utf8"));
const oldRows = rowsFromTsv(await readFile(oldItemsPath, "utf8"));
const oldByCode = new Map(oldRows.map((row) => [row["Mã hàng"], row]));
const kgTargets = await loadKgItems(repoRoot);
const kgByCode = new Map(kgTargets.map((target) => [target.itemCode, target]));

const filledMissingCodes = [];
const catalogRows = catalogRowsRaw.map((row, index) => {
  if (row["Mã SP"]) return row;
  const override = missingCodeOverrides.get(row["TÊN SP"].toLocaleUpperCase("vi"));
  if (!override) throw new Error(`Missing item code at catalog row ${index + 2}: ${row["TÊN SP"]}`);
  filledMissingCodes.push({
    excel_row: index + 2,
    item_name: row["TÊN SP"],
    assigned_code: override.code,
  });
  return {
    ...row,
    "Mã SP": override.code,
    "TÊN SP": override.name,
    "Nhóm SP": "Motor & Bình điện",
    "Nhóm logic": "Phụ kiện",
    "ĐVT": "Cái",
    "KHO \n(K36-K12)": "K12",
  };
});

function leafItemGroup(row) {
  const sourceGroup = row["Nhóm SP"];
  const name = row["TÊN SP"].toLocaleUpperCase("vi");
  const logic = row["Nhóm logic"].toLocaleUpperCase("vi");
  if (sourceGroup === "Phụ kiện") return "Phụ kiện chung";
  if (sourceGroup === "Phụ kiện CN Đức") return "Phụ kiện CN Đức";
  if (sourceGroup === "Motor & Bình điện") {
    if (name.includes("BÌNH LƯU ĐIỆN")) return "Bình lưu điện";
    if (/^MOTOR\b/.test(name)) return "Motor";
    if (
      /ĐIỀU KHIỂN|BỘ ĐK|HỘP ĐK|TAY ĐK|PHÍM ÂM TƯỜNG|DÂY ĐIỆN PHÍM/.test(name) ||
      logic.includes("ĐIỀU KHIỂN")
    ) {
      return "Điều khiển & phụ kiện điện";
    }
    return "Linh kiện motor";
  }
  const doorGroups = new Set([
    "Cửa CN Đức",
    "Cửa Lưới",
    "Cửa kéo Đài Loan",
    "Cửa siêu trường",
    "Cửa tấm liền Úc",
    "Cửa Đài Loan",
    "Cửa Đài Loan Inox",
  ]);
  if (doorGroups.has(sourceGroup)) return sourceGroup;
  throw new Error(`Unsupported item group '${sourceGroup}' for ${row["Mã SP"]}`);
}

const occurrences = new Map();
const remapped = [];
const merged = [];
const excludedAdjustments = [];
const excludedComposites = [];
const normalized = [];

for (const row of catalogRows) {
  const sourceCode = row["Mã SP"];
  if (sourceCode.startsWith("TRU-")) {
    excludedAdjustments.push({ source_code: sourceCode, source_name: row["TÊN SP"] });
    continue;
  }
  if (compositeCodes.has(sourceCode)) {
    excludedComposites.push({
      source_code: sourceCode,
      source_name: row["TÊN SP"],
      children: COMPOSITE_ITEMS.find((item) => item.itemCode === sourceCode)?.children ?? [],
    });
    continue;
  }

  const occurrence = occurrences.get(sourceCode) ?? 0;
  occurrences.set(sourceCode, occurrence + 1);
  const override = codeOverrides.get(sourceCode)?.[occurrence];
  const code = override === undefined ? sourceCode : override;
  if (code === null) {
    merged.push({ source_code: sourceCode, source_name: row["TÊN SP"], occurrence: occurrence + 1 });
    continue;
  }
  if (code !== sourceCode) {
    remapped.push({ source_code: sourceCode, imported_code: code, source_name: row["TÊN SP"] });
  }
  normalized.push({ row, sourceCode, code });
}

const duplicateCodes = normalized
  .map((item) => item.code)
  .filter((code, index, all) => all.indexOf(code) !== index);
if (duplicateCodes.length) throw new Error(`Duplicate imported codes: ${[...new Set(duplicateCodes)].join(", ")}`);

function buildPayload(entry) {
  const { row, sourceCode, code } = entry;
  const old = oldByCode.get(code) ?? oldByCode.get(sourceCode);
  const kgTarget = kgByCode.get(code);
  const group = kgTarget?.itemGroup ?? leafItemGroup(row);
  const salesUom = normalizeUom(row["ĐVT"]);
  const isDoor = group.startsWith("Cửa") && salesUom === "m2";
  const inferredMotorCombo = /^MOTOR\b/i.test(row["TÊN SP"]) && salesUom === "Bộ";
  const oldNature = old?.["Bản chất mặt hàng"];
  const virtualSaleItem = oldNature === "Dịch vụ" || inferredMotorCombo;
  const oldInventoryMode = old?.["Kiểu quản lý tồn"];
  const inventoryMode = kgTarget
    ? "Nhôm cây/lá"
    : oldInventoryMode || (isDoor ? "Thành phẩm theo m2" : "Hàng thường");
  const doorType = new Map([
    ["Cửa CN Đức", "Cửa Đức"],
    ["Cửa Lưới", "Cửa Lưới"],
    ["Cửa kéo Đài Loan", "Cửa Đài Loan"],
    ["Cửa Đài Loan", "Cửa Đài Loan"],
    ["Cửa Đài Loan Inox", "Cửa Đài Loan"],
    ["Cửa siêu trường", "Cửa Siêu Trường"],
    ["Cửa tấm liền Úc", "Cửa tấm liền Úc"],
  ]).get(group);
  const leafWidthMatch = row["Thông số"].match(/Bản lá\s+([\d.,]+)/i);
  const leafDivisorM = leafWidthMatch ? Number(leafWidthMatch[1].replace(",", ".")) / 1000 : 0;
  const stockUom = kgTarget
    ? "Kg"
    : old?.["Đơn vị TỒN KHO"]
      ? normalizeUom(old["Đơn vị TỒN KHO"])
      : salesUom;
  const materialStage =
    (kgTarget ? "Nguyên vật liệu" : old?.["Giai đoạn vật tư"]) ||
    (code.startsWith("NVL-") || code.startsWith("NVL_")
      ? "Nguyên vật liệu"
      : isDoor
        ? "Thành phẩm"
        : "Hàng hoá");
  const description = [
    row["Thông số"] ? `Thông số: ${row["Thông số"]}` : "",
    kgTarget?.sectionCode ? `Tiết diện: ${kgTarget.sectionCode}` : "",
    kgTarget?.thicknessMm ? `Độ dày: ${kgTarget.thicknessMm} mm` : "",
    kgTarget?.kgPerM ? `Barem: ${kgTarget.kgPerM} kg/m` : "",
    row["Ghi chú"] ? `Ghi chú: ${row["Ghi chú"]}` : "",
    row["Nhóm logic"] ? `Nhóm logic nguồn: ${row["Nhóm logic"]}` : "",
    old ? "Đã đối chiếu bản xuất Hàng hóa/Vật tư 2026-07-28" : "Mặt hàng mới so với bản xuất 2026-07-28",
    code !== sourceCode ? `Mã nguồn: ${sourceCode}` : "",
  ].filter(Boolean).join(" | ");

  return {
    item_code: code,
    item_name: row["TÊN SP"],
    item_group: group,
    item_nature: virtualSaleItem ? "Dịch vụ" : oldNature || "Hàng tồn kho",
    ...(virtualSaleItem ? {} : {
      material_stage: materialStage,
      supply_type: isDoor ? "Tự sản xuất" : "Mua ngoài",
    }),
    is_stock_item: !virtualSaleItem,
    is_purchase_item: !virtualSaleItem && !isDoor,
    is_sales_item: true,
    include_item_in_manufacturing: Boolean(kgTarget),
    inventory_mode: inventoryMode,
    ...(doorType ? { door_type: doorType } : {}),
    ...(leafDivisorM > 0 ? { leaf_divisor_m: leafDivisorM } : {}),
    ...(virtualSaleItem ? {} : {
      measurement_profile: kgTarget?.measurementProfile ?? inventoryMode,
      stock_uom: stockUom,
      default_purchase_uom: stockUom,
    }),
    ...(kgTarget ? { material_specification: `ĐM-${kgTarget.supplierCode ?? kgTarget.itemCode}` } : {}),
    default_sales_uom: salesUom,
    ...(kgTarget && salesUom === "Mét"
      ? {
        uom_conversions: [{
          row_id: "UOM-MÉT",
          uom: "Mét",
          conversion_factor: kgTarget.kgPerM,
        }],
      }
      : {}),
    ...(!virtualSaleItem && row["KHO \n(K36-K12)"]
      ? { default_warehouse: normalizeWarehouse(row["KHO \n(K36-K12)"]) }
      : {}),
    valuation_method: "FIFO",
    has_batch_no: false,
    has_serial_no: false,
    allow_negative_stock: false,
    description,
    disabled: old?.["Ngừng kinh doanh"] === "1",
    _migration_source: migrationSource,
    _metadata_revision: 24,
  };
}

const items = normalized.map((entry) => ({
  ...entry,
  old_match: Boolean(oldByCode.get(entry.code) ?? oldByCode.get(entry.sourceCode)),
  payload: buildPayload(entry),
}));

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const chunks = (values, size) => {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
};

const sql = [
  `-- Item-only Alumdoor import generated from ${basename(catalogPath)}.`,
  `-- Compared with ${basename(oldItemsPath)}.`,
  "-- Scope lock: only documents/document_search rows whose doctype is Item.",
];

for (const composite of COMPOSITE_ITEMS) {
  sql.push(`DELETE FROM document_search WHERE tenant_id=${sqlText(tenant)} AND doctype='Item' AND name=${sqlText(composite.itemCode)};`);
  sql.push(`DELETE FROM documents WHERE tenant_id=${sqlText(tenant)} AND doctype='Item' AND name=${sqlText(composite.itemCode)};`);
}

for (const batch of chunks(items, 15)) {
  const values = batch.map(({ code, payload }) =>
    `(${sqlText(tenant)},${sqlText(`Item:${code}`)},'Item',${sqlText(code)},'admin',0,'Draft',1,${sqlText(importedAt)},${sqlText(importedAt)},'admin',${sqlText(JSON.stringify(payload))})`,
  );
  sql.push(`INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ${values.join(",\n  ")}
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);`);
}

for (const batch of chunks(items, 25)) {
  const values = batch.map(({ code, payload }) =>
    `(${sqlText(tenant)},'Item',${sqlText(code)},${sqlText(payload.item_name)},${sqlText(`${code} ${payload.item_name} ${payload.item_group} ${payload.description}`)},${sqlText(importedAt)})`,
  );
  sql.push(`INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES
  ${values.join(",\n  ")}
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at;`);
}
const itemGroups = [...new Set(items.map((item) => item.payload.item_group))].sort((a, b) => a.localeCompare(b, "vi"));
const audit = {
  scope: {
    tenant,
    imported_doctypes: ["Item"],
    explicitly_not_imported: [
      "Item Price",
      "Price List",
      "Material Specification",
      "Supplier",
      "Supplier Item",
      "Stock Ledger Entry",
      "Warehouse",
      "Item Group",
      "UOM",
    ],
  },
  sources: {
    catalog: basename(catalogPath),
    catalog_rows: catalogRowsRaw.length,
    old_items: basename(oldItemsPath),
    old_item_rows: oldRows.length,
  },
  counts: {
    imported_items: items.length,
    matched_old_backup: items.filter((item) => item.old_match).length,
    new_or_renamed_vs_old_backup: items.filter((item) => !item.old_match).length,
    excluded_adjustments: excludedAdjustments.length,
    excluded_composites: excludedComposites.length,
    filled_missing_codes: filledMissingCodes.length,
    merged_duplicate_rows: merged.length,
    remapped_duplicate_codes: remapped.length,
  },
  filled_missing_codes: filledMissingCodes,
  excluded_composites: excludedComposites,
  excluded_adjustments: excludedAdjustments,
  merged_duplicate_rows: merged,
  remapped_duplicate_codes: remapped,
  item_groups: itemGroups,
  new_or_renamed_items: items
    .filter((item) => !item.old_match)
    .map((item) => ({ item_code: item.code, item_name: item.payload.item_name, item_group: item.payload.item_group })),
};

await writeFile(sqlPath, `${sql.join("\n\n")}\n`, "utf8");
await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ sql: sqlPath, audit: auditPath, ...audit.counts }));
