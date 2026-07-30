import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const MIGRATION_AT = "2026-07-30T16:30:00.000Z";
export const MIGRATION_SOURCE = "alumdoor-item-standardization-2026-07-30";
export const SUPPLIER = "TIẾN ĐẠT";

const SOURCE_ITEM_METADATA = {
  "TP-TD325": {
    itemName: "LÁ ĐÁY LỚN",
    itemGroup: "Nan/lá cửa",
    inventoryMode: "Nhôm cây/lá",
    isSalesItem: true,
  },
  "TP-TD326": {
    itemName: "LÁ TRUNG GIAN",
    itemGroup: "Nan/lá cửa",
    inventoryMode: "Nhôm cây/lá",
    isSalesItem: true,
  },
  "TP-TD327": {
    itemName: "LÁ YẾM",
    itemGroup: "Nan/lá cửa",
    inventoryMode: "Nhôm cây/lá",
    isSalesItem: true,
  },
  "TP-A282": {
    itemName: "LÁ ĐẦU",
    itemGroup: "Nan/lá cửa",
    inventoryMode: "Nhôm cây/lá",
    isSalesItem: true,
  },
  "TD-TG-ALD": {
    itemName: "LÁ TRUNG GIAN ALUM",
    itemGroup: "Nan/lá cửa",
    inventoryMode: "Nhôm cây/lá",
    isSalesItem: false,
    create: true,
  },
  "TP-RAYHOP": {
    itemName: "RAY HỘP TD U76",
    itemGroup: "Ray và trục",
    inventoryMode: "Nhôm cây/lá",
    isSalesItem: true,
  },
  "TP-RAY HỘP TD U100": {
    itemName: "RAY HỘP TD U100",
    itemGroup: "Ray và trục",
    inventoryMode: "Nhôm cây/lá",
    isSalesItem: true,
  },
  "TP-TD87A1 GS": {
    itemName: "RAY ĐƠN TD U76",
    itemGroup: "Ray và trục",
    inventoryMode: "Nhôm cây/lá",
    isSalesItem: true,
  },
  "RHM8(2.4MM)": {
    itemName: "RAY HỘP U76 2.4MM",
    itemGroup: "Ray và trục",
    inventoryMode: "Nhôm cây/lá",
    isSalesItem: false,
    create: true,
  },
  "CQ-VM111": {
    itemName: "THANH ĐÁY ÚC MÓC CONG",
    itemGroup: "Nan/lá cửa",
    inventoryMode: "Nhôm cây/lá",
    isSalesItem: false,
    create: true,
  },
  TDU26: {
    itemName: "THANH ĐÁY U76 TỰ DỪNG ALUM",
    itemGroup: "Nan/lá cửa",
    inventoryMode: "Nhôm cây/lá",
    isSalesItem: false,
    create: true,
  },
  "AL-YST": {
    itemName: "THANH ĐÁY LƯ ĐÀI LOAN SIÊU TRƯỜNG",
    itemGroup: "Nan/lá cửa",
    inventoryMode: "Nhôm cây/lá",
    isSalesItem: false,
    create: true,
  },
};

const SUPPLEMENTAL_KG_ITEMS = [
  {
    itemCode: "RON-DD",
    itemName: "RON ĐÁY ĐỨC",
    itemGroup: "Phụ kiện",
    inventoryMode: "Hàng thường",
    isSalesItem: true,
    kgPerM: 0.117,
    evidence: "alumdoor-uom-correction-2026-07-28.sql",
  },
  {
    itemCode: "RNHUA-DR",
    itemName: "RON NHỰA",
    itemGroup: "Phụ kiện",
    inventoryMode: "Hàng thường",
    isSalesItem: true,
    kgPerM: 0.263,
    evidence: "BRD Q8: chốt định mức ron nhựa 0,263 kg/m",
  },
  {
    itemCode: "RNINOX-DR",
    itemName: "RON INOX",
    itemGroup: "Phụ kiện",
    inventoryMode: "Hàng thường",
    isSalesItem: true,
    kgPerM: 0.124,
    evidence: "BRD: chốt định mức ron inox 0,124 kg/m",
  },
  {
    itemCode: "TRỤC 114_1.8LY",
    itemName: "TRỤC 114_1.8LY",
    itemGroup: "Ray và trục",
    inventoryMode: "Nhôm cây/lá",
    isSalesItem: true,
    kgPerM: 4.4,
    evidence: "alumdoor-uom-correction-2026-07-28.sql",
  },
  {
    itemCode: "TRỤC 114_2.1LY",
    itemName: "TRỤC 114_2.1LY",
    itemGroup: "Ray và trục",
    inventoryMode: "Nhôm cây/lá",
    isSalesItem: true,
    kgPerM: 4.7,
    evidence: "alumdoor-uom-correction-2026-07-28.sql",
  },
];

export const COMPOSITE_ITEMS = [
  {
    itemCode: "RONNHUA_INOX",
    children: ["RNHUA-DR", "RNINOX-DR"],
    reason: "Ron nhựa và ron inox là hai vật tư nhập kho riêng.",
    deleteWhenUnreferenced: true,
  },
  {
    itemCode: "TP-BO3LADAY",
    children: ["TP-TD325", "TP-TD326", "TP-TD327"],
    reason: "Bộ ba lá đáy đã tách thành lá đáy lớn, lá trung gian và lá yếm.",
    deleteWhenUnreferenced: true,
  },
  {
    itemCode: "BỘ BA LÁ ĐÁY + LÁ ĐẦU",
    children: ["TP-TD325", "TP-TD326", "TP-TD327", "TP-A282"],
    reason: "Bộ ghép không phải một mặt hàng tồn kho nguyên tử.",
    deleteWhenUnreferenced: true,
    splitHistoricalLots: [
      { itemCode: "TP-TD325", suffix: "TD325" },
      { itemCode: "TP-TD326", suffix: "TD326" },
      { itemCode: "TP-TD327", suffix: "TD327" },
      { itemCode: "TP-A282", suffix: "A282" },
    ],
  },
];

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

function itemDescription(target) {
  const source = target.supplierCode
    ? `Mã NCC ${target.supplierCode}; nguồn data/trong-luong-nhom.json.`
    : `Nguồn ${target.evidence}.`;
  return `Vật tư nguyên tử; mua và tồn theo Kg. ${source} Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.`;
}

function specCode(target) {
  return `ĐM-${target.supplierCode ?? target.itemCode}`;
}

function itemPatch(target) {
  return {
    item_code: target.itemCode,
    item_name: target.itemName,
    item_group: target.itemGroup,
    item_nature: "Hàng tồn kho",
    material_stage: "Nguyên vật liệu",
    supply_type: "Mua ngoài",
    is_stock_item: true,
    is_purchase_item: true,
    is_sales_item: target.isSalesItem,
    include_item_in_manufacturing: true,
    inventory_mode: target.inventoryMode,
    ...(target.inventoryMode === "Nhôm cây/lá" ? { measurement_profile: "Nhôm cây/lá" } : {}),
    stock_uom: "Kg",
    default_purchase_uom: "Kg",
    ...(target.isSalesItem
      ? {
          default_sales_uom: "Mét",
          uom_conversions: [{
            row_id: "UOM-MÉT",
            uom: "Mét",
            conversion_factor: target.kgPerM,
          }],
        }
      : {}),
    material_specification: specCode(target),
    valuation_method: "FIFO",
    has_batch_no: false,
    has_serial_no: false,
    allow_negative_stock: false,
    description: itemDescription(target),
    disabled: false,
    _migration_source: MIGRATION_SOURCE,
  };
}

function appendSearchUpsert(sql, doctype, name, title, content) {
  sql.push(`INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu',${quote(doctype)},${quote(name)},${quote(title)},${quote(content)},${quote(MIGRATION_AT)})
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;`);
}

function appendPatchUpsert(sql, doctype, name, payload) {
  const payloadJson = JSON.stringify(payload);
  sql.push(`INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu',${quote(`${doctype}:${name}`)},${quote(doctype)},${quote(name)},'admin',0,'Draft',1,${quote(MIGRATION_AT)},${quote(MIGRATION_AT)},'admin',${quote(payloadJson)})
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);`);
}

export async function loadKgItems(repoRoot) {
  const sourcePath = resolve(repoRoot, "data", "trong-luong-nhom.json");
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  const mapped = source.weights
    .filter((row) => row.item_code)
    .map((row) => {
      const metadata = SOURCE_ITEM_METADATA[row.item_code];
      if (!metadata) return null;
      return {
        itemCode: row.item_code,
        supplierCode: row.supplier_code,
        kgPerM: row.kg_per_m,
        evidence: "data/trong-luong-nhom.json",
        ...metadata,
      };
    })
    .filter(Boolean);
  return [...mapped, ...SUPPLEMENTAL_KG_ITEMS];
}

export async function buildStandardization(repoRoot) {
  const targets = await loadKgItems(repoRoot);
  const duplicateCodes = targets
    .map((row) => row.itemCode)
    .filter((code, index, values) => values.indexOf(code) !== index);
  if (duplicateCodes.length) throw new Error(`Mã mặt hàng bị lặp: ${duplicateCodes.join(", ")}`);

  const sql = [
    "-- Chuẩn hóa mặt hàng Alumdoor theo xác nhận ngày 2026-07-30.",
    "-- Phạm vi: mặt hàng mua/tồn theo Kg, mặt hàng con nguyên tử và vô hiệu hóa mã ghép.",
    "-- KHÔNG chứa công thức đặt hàng, tự tính kg, FIFO phân bổ hàng về hoặc công nợ.",
    "-- Trước khi chạy phải xác nhận stock_ledger_entries = 0 cho toàn bộ mã đổi đơn vị.",
  ];

  appendPatchUpsert(sql, "Measurement Profile", "Nhôm cây/lá", {
    profile_name: "Nhôm cây/lá",
    inventory_mode: "Nhôm cây/lá",
    stock_uom: "Kg",
    track_dimension_lot: true,
    require_color: true,
    require_condition: true,
    require_length: true,
    require_piece_qty: true,
    disabled: false,
    _migration_source: MIGRATION_SOURCE,
  });
  appendSearchUpsert(
    sql,
    "Measurement Profile",
    "Nhôm cây/lá",
    "Nhôm cây/lá",
    "Nhôm cây lá Kg chiều dài số cây màu tình trạng",
  );

  for (const target of targets) {
    const spec = specCode(target);
    appendPatchUpsert(sql, "Material Specification", spec, {
      spec_code: spec,
      spec_name: `Định mức ${target.itemName}`,
      profile_system: target.supplierCode ? SUPPLIER : "Alumdoor",
      section_code: target.supplierCode ?? target.itemCode,
      theoretical_kg_per_m: target.kgPerM,
      note: `Định mức xác nhận: ${target.kgPerM} kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.`,
      disabled: false,
      _migration_source: MIGRATION_SOURCE,
    });
    appendSearchUpsert(
      sql,
      "Material Specification",
      spec,
      `Định mức ${target.itemName}`,
      `${spec} ${target.itemCode} ${target.supplierCode ?? ""} ${target.kgPerM} kg/m`,
    );

    appendPatchUpsert(sql, "Item", target.itemCode, itemPatch(target));
    appendSearchUpsert(
      sql,
      "Item",
      target.itemCode,
      target.itemName,
      `${target.itemCode} ${target.itemName} ${target.itemGroup} Kg ${target.supplierCode ?? ""}`,
    );

    if (target.supplierCode) {
      const supplierItemName = `${SUPPLIER}:${target.itemCode}`;
      appendPatchUpsert(sql, "Supplier Item", supplierItemName, {
        supplier: SUPPLIER,
        item_code: target.itemCode,
        supplier_item_code: target.supplierCode,
        preferred: true,
        note: "Mã Tiến Đạt đối chiếu từ dữ liệu nhập thực tế; không kèm công thức đặt hàng.",
        disabled: false,
        _migration_source: MIGRATION_SOURCE,
      });
      appendSearchUpsert(
        sql,
        "Supplier Item",
        supplierItemName,
        target.supplierCode,
        `${SUPPLIER} ${target.supplierCode} ${target.itemCode} ${target.itemName}`,
      );
    }
  }

  const pricedItemCodes = targets.filter((target) => target.isSalesItem).map((target) => target.itemCode);
  sql.push(`UPDATE documents
SET payload_json=json_set(payload_json,'$.uom','Mét'),
    modified_at=${quote(MIGRATION_AT)},
    modified_by='admin',
    version=version+1
WHERE tenant_id='alu'
  AND doctype='Item Price'
  AND json_extract(payload_json,'$.item_code') IN (${pricedItemCodes.map(quote).join(", ")})
  AND COALESCE(json_extract(payload_json,'$.uom'),'')<>'Mét';`);

  for (const composite of COMPOSITE_ITEMS) {
    const replacement = composite.children.join(", ");
    if (composite.splitHistoricalLots) {
      for (const child of composite.splitHistoricalLots) {
        const lotNote = `Tách từ lô bộ cũ; 1 bộ = 1 cái ${child.itemCode}. ĐVT nhập/tồn của mặt hàng vẫn là Kg.`;
        sql.push(`INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
SELECT
  tenant_id,
  'Aluminium Lot:' || name || ${quote(`-${child.suffix}`)},
  'Aluminium Lot',
  name || ${quote(`-${child.suffix}`)},
  owner,
  docstatus,
  status,
  1,
  created_at,
  ${quote(MIGRATION_AT)},
  'admin',
  json_set(
    payload_json,
    '$.profile',${quote(child.itemCode)},
    '$.legacy_parent_lot',name,
    '$.legacy_component_split',json('true'),
    '$.note',${quote(lotNote)},
    '$._migration_source',${quote(MIGRATION_SOURCE)}
  )
FROM documents
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$.profile')=${quote(composite.itemCode)}
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>excluded.payload_json;`);
        sql.push(`INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
SELECT
  tenant_id,
  'Aluminium Lot',
  name || ${quote(`-${child.suffix}`)},
  ${quote(child.itemCode)} || ' · ' || COALESCE(json_extract(payload_json,'$.colour'),'') || ' · ' || COALESCE(json_extract(payload_json,'$.width_m'),'') || ' m',
  ${quote(child.itemCode)} || ' ' || COALESCE(json_extract(payload_json,'$.colour'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.generation'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.width_m'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.warehouse'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.quality_status'),''),
  ${quote(MIGRATION_AT)}
FROM documents
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$.profile')=${quote(composite.itemCode)}
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;`);
      }
      sql.push(`DELETE FROM versions
WHERE tenant_id='alu'
  AND doc_key IN (
    SELECT doc_key FROM documents
    WHERE tenant_id='alu'
      AND doctype='Aluminium Lot'
      AND json_extract(payload_json,'$.profile')=${quote(composite.itemCode)}
  );`);
      for (const table of ["document_comments", "document_shares", "document_tags", "assignments"]) {
        sql.push(`DELETE FROM ${table}
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND name IN (
    SELECT name FROM documents
    WHERE tenant_id='alu'
      AND doctype='Aluminium Lot'
      AND json_extract(payload_json,'$.profile')=${quote(composite.itemCode)}
  );`);
      }
      sql.push(`DELETE FROM files
WHERE tenant_id='alu'
  AND attached_to_doctype='Aluminium Lot'
  AND attached_to_name IN (
    SELECT name FROM documents
    WHERE tenant_id='alu'
      AND doctype='Aluminium Lot'
      AND json_extract(payload_json,'$.profile')=${quote(composite.itemCode)}
  );`);
      sql.push(`DELETE FROM document_search
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND name IN (
    SELECT name FROM documents
    WHERE tenant_id='alu'
      AND doctype='Aluminium Lot'
      AND json_extract(payload_json,'$.profile')=${quote(composite.itemCode)}
  );`);
      sql.push(`DELETE FROM documents
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$.profile')=${quote(composite.itemCode)};`);
    }
    if (composite.deleteWhenUnreferenced) {
      sql.push(`DELETE FROM versions
WHERE tenant_id='alu'
  AND doc_key IN (
    SELECT doc_key FROM documents
    WHERE tenant_id='alu'
      AND (
        (doctype='Item' AND name=${quote(composite.itemCode)})
        OR (doctype='Item Price' AND json_extract(payload_json,'$.item_code')=${quote(composite.itemCode)})
      )
  );`);
      for (const table of ["document_comments", "document_shares", "document_tags", "assignments"]) {
        sql.push(`DELETE FROM ${table}
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name=${quote(composite.itemCode)})
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')=${quote(composite.itemCode)}
    ))
  );`);
      }
      sql.push(`DELETE FROM files
WHERE tenant_id='alu'
  AND (
    (attached_to_doctype='Item' AND attached_to_name=${quote(composite.itemCode)})
    OR (attached_to_doctype='Item Price' AND attached_to_name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')=${quote(composite.itemCode)}
    ))
  );`);
      sql.push(`DELETE FROM document_search
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name=${quote(composite.itemCode)})
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')=${quote(composite.itemCode)}
    ))
  );`);
      sql.push(`DELETE FROM documents
WHERE tenant_id='alu'
  AND doctype='Item Price'
  AND json_extract(payload_json,'$.item_code')=${quote(composite.itemCode)};`);
      sql.push(`DELETE FROM documents
WHERE tenant_id='alu'
  AND doctype='Item'
  AND name=${quote(composite.itemCode)};`);
      continue;
    }
    const patch = {
      is_purchase_item: false,
      is_sales_item: false,
      disabled: true,
      description: `${composite.reason} Dùng các mã con: ${replacement}.`,
      _replacement_items: composite.children,
      _migration_source: MIGRATION_SOURCE,
    };
    sql.push(`UPDATE documents
SET payload_json=json_patch(payload_json,${quote(JSON.stringify(patch))}),
    modified_at=${quote(MIGRATION_AT)},
    modified_by='admin',
    version=version+1
WHERE tenant_id='alu'
  AND doctype='Item'
  AND name=${quote(composite.itemCode)}
  AND payload_json<>json_patch(payload_json,${quote(JSON.stringify(patch))});`);
    sql.push(`UPDATE documents
SET payload_json=json_set(payload_json,'$.disabled',json('true')),
    modified_at=${quote(MIGRATION_AT)},
    modified_by='admin',
    version=version+1
WHERE tenant_id='alu'
  AND doctype='Item Price'
  AND json_extract(payload_json,'$.item_code')=${quote(composite.itemCode)}
  AND COALESCE(json_extract(payload_json,'$.disabled'),0)<>1;`);
  }

  const audit = {
    generated_at: MIGRATION_AT,
    migration_source: MIGRATION_SOURCE,
    scope: {
      purchase_and_stock_uom: "Kg",
      physical_piece_or_set_count_is_auxiliary: true,
      split_atomic_items: true,
      remove_composite_items: true,
      purchase_order_formula: false,
      automatic_kg_calculation: false,
      fifo_receipt_allocation: false,
      payable_logic: false,
    },
    counts: {
      kg_items: targets.length,
      source_supplier_items: targets.filter((row) => row.supplierCode).length,
      newly_created_items: targets.filter((row) => row.create).length,
      processed_composites: COMPOSITE_ITEMS.length,
      deleted_composites: COMPOSITE_ITEMS.filter((row) => row.deleteWhenUnreferenced).length,
      retained_historical_composites: COMPOSITE_ITEMS.filter((row) => !row.deleteWhenUnreferenced).length,
      split_historical_lots_from: 6,
      split_historical_lots_to: 24,
    },
    preflight: {
      required_stock_ledger_rows: 0,
      item_codes: targets.map((row) => row.itemCode),
    },
    kg_items: targets.map((row) => ({
      item_code: row.itemCode,
      supplier_code: row.supplierCode ?? null,
      item_name: row.itemName,
      item_group: row.itemGroup,
      stock_uom: "Kg",
      purchase_uom: "Kg",
      sales_uom: row.isSalesItem ? "Mét" : null,
      kg_per_m_reference: row.kgPerM,
      creates_new_item: Boolean(row.create),
      evidence: row.evidence,
    })),
    composites: COMPOSITE_ITEMS,
  };

  return { sql: `${sql.join("\n\n")}\n`, audit, targets };
}
