import { createHash } from "node:crypto";

const EXPECTED_METADATA_VERSION = "2.0.34";
const ITEM_NATURES = new Set(["Hàng tồn kho", "Dịch vụ", "Tài sản"]);
const MATERIAL_STAGES = new Set(["Nguyên vật liệu", "Vật tư tiêu hao", "Bán thành phẩm", "Thành phẩm", "Hàng hoá"]);
const SUPPLY_TYPES = new Set(["Mua ngoài", "Tự sản xuất", "Mua hoặc sản xuất"]);
const QTY_BASES = new Set(["Cố định", "Theo chiều cao", "Theo chiều rộng", "Theo diện tích", "Theo số lá"]);
const REQUIRED_WAREHOUSE_ROLES = ["RAW_MATERIAL", "WIP", "FINISHED_GOODS", "QUARANTINE", "SCRAP_OFFCUT"];

export function planAlumdoorCatalogAudit({
  metadataVersion = EXPECTED_METADATA_VERSION,
  records = [],
  redacted = false,
} = {}) {
  const normalized = normalizeRecords(records);
  const byType = groupByType(normalized);
  const items = mapByName(byType.get("Item") ?? []);
  const itemGroups = mapByName(byType.get("Item Group") ?? []);
  const uoms = mapByName(byType.get("UOM") ?? []);
  const profiles = mapByName(byType.get("Measurement Profile") ?? []);
  const warehouses = mapByName(byType.get("Warehouse") ?? []);
  const boms = [...(byType.get("Bill of Materials") ?? []), ...(byType.get("Production Standard") ?? [])]
    .filter((record) => !isDisabled(record.data));

  const findings = [];
  const add = (severity, code, record, field, detail) => {
    const identity = redacted
      ? { row_hash: hashText(`${record.doctype}:${record.name}`).slice(0, 16) }
      : { name: record.name };
    findings.push({
      severity,
      code,
      doctype: record.doctype,
      ...identity,
      field,
      detail: redacted ? `${code}: details redacted; run an external --include-names report for row-level remediation.` : detail,
    });
  };

  if (metadataVersion !== EXPECTED_METADATA_VERSION) {
    add("High", "METADATA_VERSION_UNEXPECTED", {
      doctype: "Alumdoor Brief", name: String(metadataVersion), data: {},
    }, "version", `Expected authoritative Alumdoor metadata ${EXPECTED_METADATA_VERSION}, received ${metadataVersion}.`);
  }

  if (items.size === 0) {
    add("High", "SOURCE_ITEM_RECORDS_MISSING", {
      doctype: "Catalog Source", name: "Item", data: {},
    }, "records", "Audit source contains no Item records, so Item readiness cannot be assessed.");
  }
  if (boms.length === 0) {
    add("High", "SOURCE_BOM_RECORDS_MISSING", {
      doctype: "Catalog Source", name: "BOM", data: {},
    }, "records", "Audit source contains no active Bill of Materials or Production Standard records, so manufacturing readiness cannot be assessed.");
  }

  const activeBomsByItem = new Map();
  for (const bom of boms) {
    const finishedItem = text(bom.data.item ?? bom.data.production_item ?? bom.data.finished_item);
    if (!finishedItem) {
      add("High", "BOM_FINISHED_ITEM_MISSING", bom, "item", "Active BOM/Production Standard requires a finished Item.");
      continue;
    }
    const list = activeBomsByItem.get(finishedItem) ?? [];
    list.push(bom);
    activeBomsByItem.set(finishedItem, list);
    validateBom(bom, { items, uoms, add });
  }

  for (const [itemCode, list] of activeBomsByItem) {
    if (list.length > 1) {
      for (const bom of list) add("High", "BOM_DUPLICATE_ACTIVE", bom, "status", `More than one active BOM/Production Standard targets ${itemCode}.`);
    }
  }

  for (const item of items.values()) {
    validateItem(item, {
      itemGroups, uoms, profiles, warehouses, activeBomsByItem, add,
    });
  }

  detectCircularBoms(activeBomsByItem, add);

  const observedWarehouseRoles = new Set();
  for (const warehouse of warehouses.values()) {
    if (isDisabled(warehouse.data) || checked(warehouse.data.is_group)) continue;
    const declaredRole = text(warehouse.data.warehouse_role ?? warehouse.data.stock_role);
    const role = normalizeWarehouseRole(declaredRole);
    if (!declaredRole) {
      add("Medium", "WAREHOUSE_ROLE_MISSING", warehouse, "stock_role", "Operational warehouse requires an explicit role before production rollout.");
      continue;
    }
    if (!role) {
      add("Medium", "WAREHOUSE_ROLE_UNKNOWN", warehouse, "stock_role", `Warehouse role ${declaredRole} is not mapped to a supported production role.`);
      continue;
    }
    observedWarehouseRoles.add(role);
  }
  for (const role of REQUIRED_WAREHOUSE_ROLES) {
    if (!observedWarehouseRoles.has(role)) {
      add("Medium", "WAREHOUSE_ROLE_COVERAGE_MISSING", {
        doctype: "Warehouse Role", name: role, data: {},
      }, "role", `No active operational warehouse is assigned role ${role}.`);
    }
  }

  findings.sort(compareFinding);
  const counts = {
    records: normalized.length,
    by_doctype: Object.fromEntries([...byType.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([type, rows]) => [type, rows.length])),
    active_items: [...items.values()].filter((item) => !isDisabled(item.data)).length,
    disabled_items: [...items.values()].filter((item) => isDisabled(item.data)).length,
    active_boms: boms.length,
    warehouse_roles: Object.fromEntries([...observedWarehouseRoles].sort().map((role) => [role, [...warehouses.values()].filter((warehouse) => {
      if (isDisabled(warehouse.data) || checked(warehouse.data.is_group)) return false;
      return normalizeWarehouseRole(text(warehouse.data.warehouse_role ?? warehouse.data.stock_role)) === role;
    }).length])),
    findings: findings.length,
    critical: findings.filter((finding) => finding.severity === "Critical").length,
    high: findings.filter((finding) => finding.severity === "High").length,
    medium: findings.filter((finding) => finding.severity === "Medium").length,
    low: findings.filter((finding) => finding.severity === "Low").length,
  };
  const categoryCounts = {};
  for (const item of items.values()) {
    if (isDisabled(item.data)) continue;
    const key = text(item.data.item_nature) || "Unclassified";
    categoryCounts[key] = (categoryCounts[key] ?? 0) + 1;
  }
  counts.item_categories = Object.fromEntries(Object.entries(categoryCounts).sort(([a], [b]) => a.localeCompare(b)));

  const checksumPayload = canonicalize({
    metadata_version: metadataVersion,
    counts,
    findings,
  });
  return {
    schema_version: 1,
    metadata_version: metadataVersion,
    expected_metadata_version: EXPECTED_METADATA_VERSION,
    redacted,
    counts,
    findings,
    checksum: createHash("sha256").update(checksumPayload).digest("hex"),
  };
}

export function normalizeCatalogFixture(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Catalog audit input must be an object.");
  if (Array.isArray(input.records)) {
    return {
      metadataVersion: text(input.metadata_version ?? input.metadataVersion) || EXPECTED_METADATA_VERSION,
      records: input.records,
    };
  }
  const mapping = [
    ["items", "Item"],
    ["item_groups", "Item Group"],
    ["uoms", "UOM"],
    ["measurement_profiles", "Measurement Profile"],
    ["warehouses", "Warehouse"],
    ["boms", "Bill of Materials"],
    ["production_standards", "Production Standard"],
  ];
  const records = [];
  for (const [field, doctype] of mapping) {
    const rows = Array.isArray(input[field]) ? input[field] : [];
    for (const row of rows) {
      const data = row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : row;
      const name = text(row?.name ?? data?.name ?? data?.item_code ?? data?.item_group_name ?? data?.uom_name
        ?? data?.profile_name ?? data?.warehouse_name ?? data?.bom_name ?? data?.standard_name);
      records.push({ doctype, name, data });
    }
  }
  return {
    metadataVersion: text(input.metadata_version ?? input.metadataVersion) || EXPECTED_METADATA_VERSION,
    records,
  };
}

function validateItem(item, context) {
  const { itemGroups, uoms, profiles, warehouses, activeBomsByItem, add } = context;
  const data = item.data;
  const code = text(data.item_code) || item.name;
  if (!code) add("High", "ITEM_CODE_MISSING", item, "item_code", "Item requires a stable item_code.");
  if (isDisabled(data)) return;

  const nature = text(data.item_nature);
  const stage = text(data.material_stage);
  const supply = text(data.supply_type);
  const stockUom = text(data.stock_uom);
  const mode = text(data.inventory_mode) || "Hàng thường";
  const profileName = text(data.measurement_profile);

  if (!ITEM_NATURES.has(nature)) add("High", "ITEM_NATURE_INVALID", item, "item_nature", `Unsupported item_nature: ${nature || "<empty>"}.`);
  if (nature !== "Dịch vụ" && !MATERIAL_STAGES.has(stage)) add("High", "ITEM_MATERIAL_STAGE_INVALID", item, "material_stage", `Unsupported or missing material_stage: ${stage || "<empty>"}.`);
  if (nature !== "Dịch vụ" && !SUPPLY_TYPES.has(supply)) add("High", "ITEM_SUPPLY_TYPE_INVALID", item, "supply_type", `Unsupported or missing supply_type: ${supply || "<empty>"}.`);

  if (nature === "Dịch vụ") {
    if (checked(data.is_stock_item)) add("High", "ITEM_SERVICE_STOCK_ENABLED", item, "is_stock_item", "Service Item cannot manage stock.");
    if (checked(data.include_item_in_manufacturing)) add("High", "ITEM_SERVICE_MANUFACTURING_ENABLED", item, "include_item_in_manufacturing", "Service Item cannot be used as a manufacturing material/output.");
    if (stockUom || text(data.default_warehouse) || checked(data.has_batch_no) || checked(data.has_serial_no)
      || (Array.isArray(data.reorder_levels) && data.reorder_levels.length > 0)) {
      add("High", "ITEM_SERVICE_HAS_STOCK_CONFIG", item, "stock_uom", "Service Item cannot carry warehouse, stock UOM, batch/serial or reorder configuration.");
    }
    return;
  }

  if (!checked(data.is_stock_item)) add("High", "ITEM_STOCK_DISABLED", item, "is_stock_item", "Inventory Item must enable stock management.");
  if (!stockUom) add("High", "ITEM_STOCK_UOM_MISSING", item, "stock_uom", "Inventory Item requires stock_uom.");
  else if (!uoms.has(stockUom)) add("High", "ITEM_STOCK_UOM_UNKNOWN", item, "stock_uom", `UOM ${stockUom} does not exist.`);

  const groupName = text(data.item_group);
  if (!groupName) add("High", "ITEM_GROUP_MISSING", item, "item_group", "Item requires item_group.");
  else if (!itemGroups.has(groupName)) add("High", "ITEM_GROUP_UNKNOWN", item, "item_group", `Item Group ${groupName} does not exist.`);

  const defaultWarehouse = text(data.default_warehouse);
  if (defaultWarehouse && !warehouses.has(defaultWarehouse)) add("High", "ITEM_DEFAULT_WAREHOUSE_UNKNOWN", item, "default_warehouse", `Warehouse ${defaultWarehouse} does not exist.`);

  if (mode !== "Hàng thường") {
    if (!profileName) add("High", "ITEM_MEASUREMENT_PROFILE_MISSING", item, "measurement_profile", `Inventory mode ${mode} requires a Measurement Profile.`);
    else {
      const profile = profiles.get(profileName);
      if (!profile) add("High", "ITEM_MEASUREMENT_PROFILE_UNKNOWN", item, "measurement_profile", `Measurement Profile ${profileName} does not exist.`);
      else if (text(profile.data.inventory_mode) !== mode) add("High", "ITEM_MEASUREMENT_PROFILE_MODE_MISMATCH", item, "measurement_profile", `Profile ${profileName} belongs to ${text(profile.data.inventory_mode) || "<empty>"}, not ${mode}.`);
    }
  }

  validateTransactionUom(item, "default_purchase_uom", checked(data.is_purchase_item), stockUom, mode, uoms, add);
  validateTransactionUom(item, "default_sales_uom", checked(data.is_sales_item), stockUom, mode, uoms, add);

  if ((supply === "Mua ngoài" || supply === "Mua hoặc sản xuất") && !checked(data.is_purchase_item)) {
    add("High", "ITEM_PURCHASE_FLAG_MISSING", item, "is_purchase_item", `Supply type ${supply} requires purchase eligibility.`);
  }

  const manufacturedStage = stage === "Bán thành phẩm" || stage === "Thành phẩm";
  const manufacturedSupply = supply === "Tự sản xuất" || supply === "Mua hoặc sản xuất";
  if (manufacturedStage || manufacturedSupply) {
    if (!checked(data.include_item_in_manufacturing)) add("High", "ITEM_MANUFACTURING_FLAG_MISSING", item, "include_item_in_manufacturing", "Manufactured/semi-finished Item must be enabled for manufacturing.");
    if (!activeBomsByItem.has(code)) add("High", "ITEM_ACTIVE_BOM_MISSING", item, "supply_type", "Manufactured/semi-finished Item requires an active BOM or Production Standard.");
  }
}

function validateTransactionUom(item, field, enabled, stockUom, mode, uoms, add) {
  if (!enabled) return;
  const data = item.data;
  const uom = text(data[field]);
  if (!uom || uom === stockUom) return;
  if (!uoms.has(uom)) add("High", "ITEM_TRANSACTION_UOM_UNKNOWN", item, field, `UOM ${uom} does not exist.`);
  if (dynamicSquareMetreToSet(mode, uom, stockUom)) return;
  const conversions = Array.isArray(data.uom_conversions) ? data.uom_conversions : [];
  const row = conversions.find((conversion) => text(conversion?.uom) === uom);
  if (!row) add("High", "ITEM_UOM_CONVERSION_MISSING", item, field, `${uom} differs from stock UOM ${stockUom || "<empty>"} but has no conversion.`);
  else if (!positive(row.conversion_factor)) add("High", "ITEM_UOM_CONVERSION_INVALID", item, field, `Conversion ${uom} -> ${stockUom || "<empty>"} must be positive.`);
}

function validateBom(bom, { items, uoms, add }) {
  const data = bom.data;
  const finishedItem = text(data.item ?? data.production_item ?? data.finished_item);
  const finished = items.get(finishedItem);
  if (finishedItem && !finished) add("High", "BOM_FINISHED_ITEM_UNKNOWN", bom, "item", `Finished Item ${finishedItem} does not exist.`);
  if (finished && !checked(finished.data.include_item_in_manufacturing)) add("High", "BOM_FINISHED_ITEM_NOT_MANUFACTURABLE", bom, "item", `Finished Item ${finishedItem} is not enabled for manufacturing.`);
  if (!positive(data.quantity ?? data.output_qty ?? 1)) add("High", "BOM_OUTPUT_QUANTITY_INVALID", bom, "quantity", "BOM output quantity must be positive.");
  if (!Number.isSafeInteger(Number(data.revision)) || Number(data.revision) <= 0) add("Medium", "BOM_REVISION_MISSING", bom, "revision", "Active BOM should define a positive immutable revision.");

  const rows = Array.isArray(data.items) ? data.items : [];
  if (rows.length === 0) add("High", "BOM_ITEMS_MISSING", bom, "items", "BOM requires at least one material row.");
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? {};
    const itemCode = text(row.item_code);
    const field = `items[${index}]`;
    if (!itemCode) {
      add("High", "BOM_ROW_ITEM_MISSING", bom, `${field}.item_code`, "BOM row requires item_code.");
      continue;
    }
    const raw = items.get(itemCode);
    if (!raw) add("High", "BOM_ROW_ITEM_UNKNOWN", bom, `${field}.item_code`, `Raw Item ${itemCode} does not exist.`);
    else {
      if (!checked(raw.data.is_stock_item)) add("High", "BOM_ROW_ITEM_NOT_STOCK", bom, `${field}.item_code`, `Raw Item ${itemCode} is not a stock Item.`);
      if (!checked(raw.data.include_item_in_manufacturing)) add("High", "BOM_ROW_ITEM_NOT_MANUFACTURABLE", bom, `${field}.item_code`, `Raw Item ${itemCode} is not enabled for manufacturing.`);
    }
    if (!positive(row.qty)) add("High", "BOM_ROW_QUANTITY_INVALID", bom, `${field}.qty`, "BOM material quantity must be positive.");
    const basis = text(row.qty_basis) || "Cố định";
    if (!QTY_BASES.has(basis)) add("High", "BOM_ROW_QTY_BASIS_INVALID", bom, `${field}.qty_basis`, `Unsupported qty_basis: ${basis}.`);
    const uom = text(row.uom);
    if (!uom) add("High", "BOM_ROW_UOM_MISSING", bom, `${field}.uom`, "BOM row requires a validated UOM.");
    else if (!uoms.has(uom)) add("High", "BOM_ROW_UOM_UNKNOWN", bom, `${field}.uom`, `UOM ${uom} does not exist.`);
  }
}

function detectCircularBoms(activeBomsByItem, add) {
  const graph = new Map();
  for (const [finishedItem, boms] of activeBomsByItem) {
    const dependencies = new Set();
    for (const bom of boms) {
      for (const row of Array.isArray(bom.data.items) ? bom.data.items : []) {
        const itemCode = text(row?.item_code);
        if (itemCode && activeBomsByItem.has(itemCode)) dependencies.add(itemCode);
      }
    }
    graph.set(finishedItem, dependencies);
  }
  const visiting = new Set();
  const visited = new Set();
  const reported = new Set();
  const stack = [];
  function visit(node) {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      const cycle = [...stack.slice(start), node];
      const signature = [...new Set(cycle)].sort().join("|");
      if (!reported.has(signature)) {
        reported.add(signature);
        for (const itemCode of new Set(cycle)) {
          for (const bom of activeBomsByItem.get(itemCode) ?? []) add("High", "BOM_CIRCULAR_DEPENDENCY", bom, "items", `Circular BOM dependency: ${cycle.join(" -> ")}.`);
        }
      }
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) ?? []) visit(next);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of graph.keys()) visit(node);
}

function normalizeRecords(records) {
  const map = new Map();
  for (const raw of records) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const doctype = text(raw.doctype ?? raw.record_type ?? raw.type);
    const parsed = parseData(raw.data ?? raw.payload ?? raw.data_json ?? raw.payload_json ?? raw);
    const name = text(raw.name ?? parsed.name ?? parsed.item_code ?? parsed.item_group_name ?? parsed.uom_name
      ?? parsed.profile_name ?? parsed.warehouse_name ?? parsed.bom_name ?? parsed.standard_name);
    if (!doctype || !name) continue;
    const sourceRank = Number(raw.source_rank ?? raw.sourceRank ?? 0);
    const key = `${doctype}:${name}`;
    const existing = map.get(key);
    if (!existing || sourceRank >= existing.sourceRank) map.set(key, { doctype, name, data: parsed, sourceRank });
  }
  return [...map.values()].sort((a, b) => a.doctype.localeCompare(b.doctype) || a.name.localeCompare(b.name));
}

function parseData(value) {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? structuredClone(value) : {};
}
function groupByType(records) {
  const map = new Map();
  for (const record of records) {
    const list = map.get(record.doctype) ?? [];
    list.push(record);
    map.set(record.doctype, list);
  }
  return map;
}
function mapByName(records) { return new Map(records.map((record) => [record.name, record])); }
function checked(value) {
  if (value === true || value === 1 || value === "1") return true;
  const normalized = String(value ?? "").trim().toLocaleLowerCase("vi");
  return normalized === "có" || normalized === "co" || normalized === "yes" || normalized === "true";
}
function isDisabled(data) { return checked(data?.disabled); }
function positive(value) { const number = Number(value); return Number.isFinite(number) && number > 0; }
function text(value) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function normalizedUom(value) { return text(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("vi"); }
function dynamicSquareMetreToSet(mode, uom, stockUom) {
  return mode === "Thành phẩm theo m2"
    && ["m2", "m²", "sqm"].includes(normalizedUom(uom))
    && ["bo", "set"].includes(normalizedUom(stockUom));
}
function normalizeWarehouseRole(value) {
  const normalized = normalizedUom(value).replace(/[\s_-]+/g, " ");
  const aliases = new Map([
    ["raw material", "RAW_MATERIAL"],
    ["nguyen vat lieu", "RAW_MATERIAL"],
    ["kho nguyen vat lieu", "RAW_MATERIAL"],
    ["wip", "WIP"],
    ["work in progress", "WIP"],
    ["dang san xuat", "WIP"],
    ["kho dang san xuat", "WIP"],
    ["finished goods", "FINISHED_GOODS"],
    ["thanh pham", "FINISHED_GOODS"],
    ["kho thanh pham", "FINISHED_GOODS"],
    ["quarantine", "QUARANTINE"],
    ["cho kiem", "QUARANTINE"],
    ["kho cho kiem", "QUARANTINE"],
    ["scrap offcut", "SCRAP_OFFCUT"],
    ["scrap", "SCRAP_OFFCUT"],
    ["offcut", "SCRAP_OFFCUT"],
    ["kho dau thua", "SCRAP_OFFCUT"],
    ["kho phe", "SCRAP_OFFCUT"],
    ["general", "GENERAL"],
    ["kho chinh", "GENERAL"],
  ]);
  return aliases.get(normalized) ?? "";
}
function compareFinding(a, b) {
  return severityRank(a.severity) - severityRank(b.severity)
    || a.code.localeCompare(b.code)
    || a.doctype.localeCompare(b.doctype)
    || String(a.name ?? a.row_hash).localeCompare(String(b.name ?? b.row_hash))
    || a.field.localeCompare(b.field)
    || a.detail.localeCompare(b.detail);
}
function severityRank(value) { return ({ Critical: 0, High: 1, Medium: 2, Low: 3 })[value] ?? 9; }
function hashText(value) { return createHash("sha256").update(value).digest("hex"); }
function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
