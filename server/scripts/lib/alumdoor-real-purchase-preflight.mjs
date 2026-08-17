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
    const key = clean(row?.[field] ?? row?.item_code ?? row?.supplier_name ?? row?.name);
    if (key) out.set(key, row);
  }
  return out;
}

function lineBlockers(row, itemManifest, supplierManifest) {
  if (row.excluded) return [];
  const blockers = [];
  if (!row.date) blockers.push("INVALID_OR_MISSING_DATE");
  if (!row.source_voucher) blockers.push("MISSING_SOURCE_VOUCHER");
  if (!row.supplier) blockers.push("MISSING_SUPPLIER");
  if (!APPROVED_PURCHASE_SUPPLIERS[row.supplier]) blockers.push("SUPPLIER_IDENTITY_UNAPPROVED");
  if (!supplierManifest) blockers.push("LIVE_SUPPLIER_MANIFEST_NOT_PROVIDED");
  else if (row.supplier && !supplierManifest.has(row.supplier)) blockers.push("SUPPLIER_NOT_IN_LIVE_MANIFEST");

  const itemCode = clean(row.canonical_item_code);
  const uom = clean(row.canonical_uom);
  const qty = Number(row.canonical_quantity);
  if (!itemCode) blockers.push("MISSING_CANONICAL_ITEM_CODE");
  if (!uom) blockers.push("MISSING_CANONICAL_UOM");
  if (!Number.isFinite(qty) || qty <= 0) blockers.push("MISSING_OR_NONPOSITIVE_CANONICAL_QUANTITY");

  const expectedUom = APPROVED_PURCHASE_ITEM_UOMS[itemCode];
  if (itemCode && !expectedUom) blockers.push("ITEM_IDENTITY_NOT_IN_APPROVED_PURCHASE_SET");
  if (expectedUom && uom && foldPurchaseValue(expectedUom) !== foldPurchaseValue(uom)) blockers.push("SOURCE_UOM_CONFLICT");

  if (!itemManifest) blockers.push("LIVE_ITEM_MANIFEST_NOT_PROVIDED");
  else if (itemCode) {
    const item = itemManifest.get(itemCode);
    if (!item) blockers.push("ITEM_NOT_IN_LIVE_MANIFEST");
    else {
      const stockUom = clean(item.stock_uom);
      const purchaseUom = clean(item.default_purchase_uom ?? item.purchase_uom ?? stockUom);
      const conversions = Array.isArray(item.uom_conversions) ? item.uom_conversions : [];
      const accepted = !uom || !purchaseUom
        || foldPurchaseValue(uom) === foldPurchaseValue(purchaseUom)
        || foldPurchaseValue(uom) === foldPurchaseValue(stockUom)
        || conversions.some((entry) => foldPurchaseValue(entry?.uom) === foldPurchaseValue(uom) && Number(entry?.conversion_factor) > 0);
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
  const historicalDraft = options.historical_draft === true;
  const globals = [];
  if (!clean(options.company)) globals.push("COMPANY_NOT_RESOLVED");
  if (!historicalDraft && !clean(options.warehouse)) globals.push("WAREHOUSE_NOT_RESOLVED");

  const audited = rows.map((row) => ({
    ...row,
    group_key: purchaseDocumentKey(row),
    blockers: lineBlockers(row, itemManifest, supplierManifest),
  }));
  const importable = audited.filter((row) => !row.excluded);
  const excluded = audited.filter((row) => row.excluded);

  const groups = new Map();
  for (const row of importable) {
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
      line_fingerprints: lines.map((line) => line.canonical_fingerprint),
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

  const excludedGroups = new Map();
  for (const row of excluded) {
    const list = excludedGroups.get(row.group_key) ?? [];
    list.push(row);
    excludedGroups.set(row.group_key, list);
  }
  const excludedDocuments = [...excludedGroups.entries()].map(([key, lines]) => ({
    source_group_key: key,
    supplier: lines[0]?.supplier ?? "",
    source_voucher: lines[0]?.source_voucher ?? "",
    posting_date: lines[0]?.date ?? null,
    source_rows: lines.map((line) => line.source_row),
    reasons: unique(lines.map((line) => line.exclusion_reason).filter(Boolean)),
    line_count: lines.length,
    status: "SOURCE_DEFECT_EXCLUDED",
  }));

  const suppliers = unique(importable.map((row) => row.supplier).filter(Boolean));
  const codedLines = importable.filter((row) => row.canonical_item_code);
  const sourceResolvedLines = codedLines.filter((row) => APPROVED_PURCHASE_ITEM_UOMS[row.canonical_item_code]);
  const blockerCodes = unique([...globals, ...importable.flatMap((row) => row.blockers)]);
  const ready = documents.filter((doc) => doc.status === "READY").length;
  const draftAuthorized = blockerCodes.length === 0;
  const submitBlockers = [
    ...(options.stock_cutoff_frozen === true ? [] : ["STOCK_CUTOFF_NOT_FROZEN_DOUBLE_COUNT_RISK"]),
    ...(historicalDraft ? ["HISTORICAL_DRAFT_SUBMIT_FORBIDDEN"] : []),
  ];

  return {
    format: "alumdoor-real-purchase-preflight/v3",
    mode: historicalDraft ? "historical_draft" : "operational",
    source_purchase_row_count: rows.length,
    classification_counts: {
      PURCHASE_ORDER: 0,
      PURCHASE_RECEIPT: importable.length,
      SOURCE_DEFECT_EXCLUDED: excluded.length,
    },
    supplier: {
      total: suppliers.length,
      approved_identity: suppliers.filter((s) => APPROVED_PURCHASE_SUPPLIERS[s]).length,
      live_manifest_provided: Boolean(supplierManifest),
    },
    item_uom: {
      total_lines: importable.length,
      lines_with_item_code: codedLines.length,
      approved_source_identity_uom: sourceResolvedLines.length,
      missing_item_code: importable.length - codedLines.length,
      live_manifest_provided: Boolean(itemManifest),
    },
    source_exclusions: {
      row_count: excluded.length,
      document_count: excludedDocuments.length,
      rows: excluded.map((row) => ({ source_row: row.source_row, supplier: row.supplier, item_code: row.canonical_item_code || row.source_item_code, reason: row.exclusion_reason })),
      documents: excludedDocuments,
    },
    purchase_order: { candidate_documents: 0, persisted: 0, blocked: 0 },
    purchase_receipt: { candidate_documents: documents.length, persisted: 0, ready, blocked: documents.length - ready },
    global_blockers: globals,
    blocker_codes: blockerCodes,
    submit_blockers: submitBlockers,
    documents,
    mutation_authorized: draftAuthorized,
    draft_mutation_authorized: draftAuthorized,
    submit_authorized: !historicalDraft && draftAuthorized && submitBlockers.length === 0,
    verdict: draftAuthorized ? "PURCHASE_IMPORT_DRAFT_PREFLIGHT_PASS" : "PURCHASE_IMPORT_BLOCKED",
  };
}