#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const policyPath = path.resolve(here, "../PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json");
const uomPolicyPath = path.resolve(here, "../PILOT_01_UOM_RECONCILIATION_V1.json");
export const POLICY = Object.freeze(JSON.parse(readFileSync(policyPath, "utf8")));
export const UOM_POLICY = Object.freeze(JSON.parse(readFileSync(uomPolicyPath, "utf8")));

function present(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function key(value) {
  if (!present(value)) throw new Error("identity value is required");
  return String(value).normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase("vi-VN");
}

export function assertAliasSupplierPolicy() {
  const aliases = Object.keys(POLICY.items.aliases);
  const supplemental = Object.keys(POLICY.items.supplemental);
  const explode = Object.keys(POLICY.items.explode);
  const all = [...aliases, ...supplemental, ...explode];
  if (new Set(all.map(key)).size !== all.length) throw new Error("item identity policy has duplicate source identities");
  if (all.length !== POLICY.items.unmatched_journal_codes_before) {
    throw new Error(`item identity policy expected ${POLICY.items.unmatched_journal_codes_before} dispositions, got ${all.length}`);
  }
  if (!POLICY.items.all_60_identity_dispositioned) throw new Error("item identity policy is not locked complete");
  if (POLICY.items.fuzzy_matching_used) throw new Error("fuzzy matching must remain disabled");
  if (POLICY.suppliers.role_gaps_after !== 0) throw new Error("supplier role reconciliation must leave zero identity-role gaps");
  if (POLICY.production_write_authorized || POLICY.production_data_mutated) {
    throw new Error("Pilot-01 identity reconciliation must remain preview-only");
  }
  if (UOM_POLICY.production_write_authorized || UOM_POLICY.production_data_mutated) {
    throw new Error("Pilot-01 UOM reconciliation must remain preview-only");
  }
  return true;
}

function overloadedIdentity(source, businessContext) {
  const override = UOM_POLICY.supersedes_identity_resolution_for?.[source];
  if (!override) return null;
  if (businessContext === "stock" || businessContext === "opening_stock" || businessContext === "purchase") {
    return {
      source_item_code: source,
      disposition: "context_stock_identity",
      item_code: override.stock_context.item_code,
      stock_uom: override.stock_context.stock_uom,
      identity_only: false,
      quantity_axis_requires_reconciliation: false,
      production_create_authorized: false,
    };
  }
  if (businessContext === "sales") {
    return {
      source_item_code: source,
      disposition: "context_commercial_alias",
      item_code: override.sales_context.commercial_item_code,
      commercial_uom: override.sales_context.commercial_uom,
      identity_only: false,
      quantity_axis_requires_reconciliation: false,
    };
  }
  return {
    source_item_code: source,
    disposition: "context_split_required",
    stock_item_code: override.stock_context.item_code,
    stock_uom: override.stock_context.stock_uom,
    commercial_item_code: override.sales_context.commercial_item_code,
    commercial_uom: override.sales_context.commercial_uom,
    identity_only: false,
    quantity_axis_requires_reconciliation: true,
  };
}

export function resolveJournalItemIdentity(sourceCode, { business_context: businessContext } = {}) {
  const source = String(sourceCode ?? "").trim();
  if (!source) throw new Error("sourceCode is required");

  const override = overloadedIdentity(source, businessContext);
  if (override) return override;

  if (Object.hasOwn(POLICY.items.aliases, source)) {
    return {
      source_item_code: source,
      disposition: "canonical_alias",
      item_code: POLICY.items.aliases[source],
      identity_only: true,
      quantity_axis_requires_reconciliation: POLICY.items.axis_semantics_pending.includes(source),
    };
  }

  if (Object.hasOwn(POLICY.items.supplemental, source)) {
    const detail = POLICY.items.supplemental[source];
    return {
      source_item_code: source,
      disposition: "supplemental_source_identity",
      item_code: source,
      ...detail,
      production_create_authorized: false,
    };
  }

  if (Object.hasOwn(POLICY.items.explode, source)) {
    return {
      source_item_code: source,
      disposition: "explode_composite",
      item_codes: [...POLICY.items.explode[source]],
      production_create_authorized: false,
    };
  }

  throw new Error(`unrecognized Pilot-01 journal item identity: ${source}`);
}

function sourceKeyForSupplier(name) {
  return `supplier:${key(name).replace(/[^0-9A-ZÀ-Ỹ]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}`;
}

export function reconcileSupplierRoles(sourceSuppliers = []) {
  const byName = new Map();
  for (const [index, row] of sourceSuppliers.entries()) {
    if (!row || !present(row.supplier_name)) throw new Error(`sourceSuppliers[${index}].supplier_name is required`);
    const normalized = key(row.supplier_name);
    if (!byName.has(normalized)) byName.set(normalized, { ...row, supplier_name: String(row.supplier_name).trim() });
  }

  const created = [];
  const bound = [];
  for (const [party, disposition] of Object.entries(POLICY.suppliers.dispositions)) {
    const normalized = key(party);
    if (byName.has(normalized)) {
      bound.push({ supplier_name: byName.get(normalized).supplier_name, disposition: "keep_source_ncc" });
      continue;
    }
    const row = {
      source_key: sourceKeyForSupplier(party),
      supplier_name: party,
      active: true,
      identity_disposition: disposition,
      source_evidence: "MS LIÊN BS.xlsx:CNO NCC",
      production_create_authorized: false,
    };
    byName.set(normalized, row);
    created.push(row);
  }

  return {
    suppliers: [...byName.values()],
    created,
    bound,
    role_gaps_after: 0,
    production_data_mutated: false,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  assertAliasSupplierPolicy();
  process.stdout.write(`${JSON.stringify({
    status: POLICY.status,
    item_dispositions: POLICY.items.unmatched_journal_codes_before,
    context_overrides: Object.keys(UOM_POLICY.supersedes_identity_resolution_for ?? {}).length,
    supplier_role_gaps_after: POLICY.suppliers.role_gaps_after,
    production_write_authorized: false,
  })}\n`);
}
