import {
  APPROVED_PURCHASE_ITEM_UOMS,
  APPROVED_PURCHASE_SUPPLIERS,
  foldPurchaseValue,
  purchaseDocumentKey,
  purchaseFingerprint,
} from "./alumdoor-real-purchase-source.mjs";

const clean = (v) => String(v ?? "").normalize("NFC").trim();
const unique = (values) => [...new Set(values)];

function manifestMap(input, field) {
  if (!input) return null;
  const rows = Array.isArray(input) ? input : Array.isArray(input.items) ? input.items : Array.isArray(input.records) ? input.records : null;
  if (!rows) return null;
  const out = new Map();
  for (const row of rows) {
    const key = clean(row?.[field] ?? row?.name);
    if (key) out.set(key, row);
  }
  return out;
}

function lineBlockers(row, previousDate, itemManifest, supplierManifest) {
  const blockers = [];
  if (!row.date) blockers.push("INVALID_OR_MISSING_DATE");
  if (row.date && previousDate && row.date < previousDate) blockers.push("SOURCE_DATE_SEQUENCE_REGRESSION");
  if (!row.source_voucher) blockers.push("MISSING_SOURCE_VOUCHER");
  if (!row.supplier) blockers.push("MISSING_SUPPLIER");
  if (!APPROVED_PURCHASE_SUPPLIERS[row.supplier]) blockers.push("SUPPLIER_IDENTITY_UNAPPROVED");
  if (!supplierManifest) blockers.push("LIVE_SUPPLIER_MANIFEST_NOT_PROVIDED");
  else if (row.supplier && !supplierManifest.has(row.supplier)) blockers.push("SUPPLIER_NOT_IN_LIVE_MANIFEST");

  if (!row.item_code) blockers.push("MISSING_ITEM_CODE");
  if (!row.uom) blockers.push("MISSING_UOM");
  if (row.quantity === null || row.quantity <= 0) blockers.push("MISSING_OR_NONPOSITIVE_QUANTITY");
  if (row.quantity !== null && row.quantity >= 1_000_000) blockers.push("QUANTITY_OUTLIER_REQUIRES_SOURCE_DISPOSITION");
  if (row.uom === "M" && row.length_or_height && row.quantity) blockers.push("LENGTH_VS_QUANTITY_AXIS_AMBIGUOUS");

  const expectedUom = APPROVED_PURCHASE_ITEM_UOMS[row.item_code];
  if (row.item_code && !expectedUom) blockers.push("ITEM_IDENTITY_NOT_IN_APPROVED_PURCHASE_SET");
  if (expectedUom && row.uom && foldPurchaseValue(expectedUom) !== foldPurchaseValue(row.uom)) blockers.push("SOURCE_UOM_CONFLICT");

  if (!itemManifest) blockers.push("LIVE_ITEM_MANIFEST_NOT_PROVIDED");
  else if (row.item_code) {
    const item = itemManifest.get(row.item_code);
    if (!item) blockers.push("ITEM_NOT_IN_LIVE_MANIFEST");
    else {
      const stockUom = clean(item.stock_uom);
      const purchaseUom = clean(item.default_purchase_uom ?? item.purchase_uom ?? stockUom);
      const conversions = Array.isArray(item.uom_conversions) ? item.uom_conversions : [];
      const accepted = !row.uom || !purchaseUom
        || foldPurchaseValue(row.uom) === foldPurchaseValue(purchaseUom)
        || foldPurchaseValue(row.uom) === foldPurchaseValue(stockUom)
        || conversions.some((entry) => foldPurchaseValue(entry?.uom) === foldPurchaseValue(row.uom) && Number(entry?.conversion_factor) > 0);
      if (!accepted) blockers.push("LIVE_ITEM_UOM_NOT_ACCEPTED");
      if ([true, 1, "1"].includes(item.disabled)) blockers.push("ITEM_DISABLED");
      if ([false, 0, "0"].includes(item.is_purchase_item)) blockers.push("ITEM_NOT_PURCHASABLE");
    }
  }
  return unique(blockers);
}

export function preflightRealPurchaseRows(rows, options = {}) {
  const itemManifest = manifestMap(options.item_manifest, "item_code");
  const supplierManifest = manifestMap(options.supplier_manifest, "supplier_name");
  const globals = [];
  if (!clean(options.company)) globals.push("COMPANY_NOT_RESOLVED");
  if (!clean(options.warehouse)) globals.push("WAREHOUSE_NOT_RESOLVED");
  if (options.stock_cutoff_frozen !== true) globals.push("STOCK_CUTOFF_NOT_FROZEN_DOUBLE_COUNT_RISK");

  let previousDate = null;
  const audited = rows.map((row) => {
    const blockers = lineBlockers(row, previousDate, itemManifest, supplierManifest);
    if (row.date) previousDate = row.date;
    return { ...row, group_key: purchaseDocumentKey(row), blockers };
  });

  const groups = new Map();
  for (const row of audited) {
    const list = groups.get(row.group_key) ?? [];
    list.push(row);
    groups.set(row.group_key, list);
  }

  const documents = [...groups.entries()].map(([key, lines]) => {
    const identity = {
      source_group_key: key,
      supplier: lines[0]?.supplier ?? "",
      source_voucher: lines[0]?.source_voucher ?? "",
      posting_date: lines[0]?.date ?? null,
      source_rows: lines.map((line) => line.source_row),
      line_fingerprints: lines.map((line) => line.source_fingerprint),
    };
    const blockers = unique([...globals, ...lines.flatMap((line) => line.blockers)]);
    return {
      ...identity,
      import_fingerprint: purchaseFingerprint(identity),
      line_count: lines.length,
      status: blockers.length ? "BLOCKED" : "READY",
      blockers,
      lines,
    };
  });

  const suppliers = unique(rows.map((row) => row.supplier).filter(Boolean));
  const codedLines = rows.filter((row) => row.item_code);
  const sourceResolvedLines = codedLines.filter((row) => APPROVED_PURCHASE_ITEM_UOMS[row.item_code]);
  const blockerCodes = unique([...globals, ...audited.flatMap((row) => row.blockers)]);
  const ready = documents.filter((doc) => doc.status === "READY").length;

  return {
    format: "alumdoor-real-purchase-preflight/v1",
    source_purchase_row_count: rows.length,
    classification_counts: { PURCHASE_ORDER: 0, PURCHASE_RECEIPT: rows.length },
    supplier: {
      total: suppliers.length,
      approved_identity: suppliers.filter((s) => APPROVED_PURCHASE_SUPPLIERS[s]).length,
      live_manifest_provided: Boolean(supplierManifest),
    },
    item_uom: {
      total_lines: rows.length,
      lines_with_item_code: codedLines.length,
      approved_source_identity_uom: sourceResolvedLines.length,
      missing_item_code: rows.length - codedLines.length,
      live_manifest_provided: Boolean(itemManifest),
    },
    purchase_order: { candidate_documents: 0, persisted: 0, blocked: 0 },
    purchase_receipt: { candidate_documents: documents.length, persisted: 0, ready, blocked: documents.length - ready },
    global_blockers: globals,
    blocker_codes: blockerCodes,
    documents,
    mutation_authorized: blockerCodes.length === 0,
    verdict: blockerCodes.length === 0 ? "PURCHASE_IMPORT_PREFLIGHT_PASS" : "PURCHASE_IMPORT_BLOCKED",
  };
}
