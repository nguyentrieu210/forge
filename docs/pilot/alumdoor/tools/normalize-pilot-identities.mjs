#!/usr/bin/env node

function present(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function canonicalCustomerName(value) {
  if (!present(value)) throw new Error("customer_name is required");
  return String(value)
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("vi-VN");
}

function requireSourceKey(row, dataset, index) {
  if (!present(row?.source_key)) throw new Error(`${dataset}[${index}].source_key is required`);
  return String(row.source_key).trim();
}

function requireItemCode(row, index) {
  if (!present(row?.item_code)) throw new Error(`items[${index}].item_code is required`);
  return String(row.item_code).trim();
}

export function normalizeDuplicateItemCodes(items = []) {
  const used = new Set();
  const counters = new Map();
  const collisions = [];
  const normalized = items.map((row, index) => {
    requireSourceKey(row, "items", index);
    const original = requireItemCode(row, index);
    if (!used.has(original)) {
      used.add(original);
      return { ...row, item_code: original };
    }

    let ordinal = counters.get(original) ?? 1;
    let candidate;
    do {
      candidate = `${original}${String(ordinal).padStart(2, "0")}`;
      ordinal += 1;
    } while (used.has(candidate));
    counters.set(original, ordinal);
    used.add(candidate);
    collisions.push({
      source_index: index,
      source_key: String(row.source_key),
      source_code_original: original,
      normalized_item_code: candidate,
    });
    return {
      ...row,
      item_code: candidate,
      source_code_original: original,
      identity_disposition: "duplicate-item-code-suffixed",
    };
  });
  return { rows: normalized, collisions };
}

export function dedupeCustomersByExactName(customers = []) {
  const retainedByName = new Map();
  const aliasBySourceKey = new Map();
  const duplicates = [];
  const retained = [];

  for (const [index, row] of customers.entries()) {
    const sourceKey = requireSourceKey(row, "customers", index);
    const nameKey = canonicalCustomerName(row.customer_name);
    const existing = retainedByName.get(nameKey);
    if (!existing) {
      const canonical = { ...row, source_key: sourceKey };
      retainedByName.set(nameKey, { row: canonical, source_index: index });
      retained.push(canonical);
      aliasBySourceKey.set(sourceKey, sourceKey);
      continue;
    }
    aliasBySourceKey.set(sourceKey, existing.row.source_key);
    duplicates.push({
      source_index: index,
      duplicate_source_key: sourceKey,
      retained_source_key: existing.row.source_key,
      customer_name: existing.row.customer_name,
      disposition: "drop-duplicate-map-references-to-retained-customer",
    });
  }

  return { rows: retained, aliasBySourceKey, duplicates };
}

function remapCustomerReference(rows, field, aliasBySourceKey) {
  return rows.map((row) => {
    if (!present(row?.[field])) return { ...row };
    const source = String(row[field]).trim();
    const target = aliasBySourceKey.get(source) ?? source;
    return target === source ? { ...row, [field]: source } : {
      ...row,
      [field]: target,
      customer_source_key_original: source,
      identity_disposition: "customer-reference-remapped-to-retained-customer",
    };
  });
}

export function normalizePilotIdentities({ items = [], customers = [], contacts = [], opening_ar = [] } = {}) {
  const itemResult = normalizeDuplicateItemCodes(items);
  const customerResult = dedupeCustomersByExactName(customers);
  return {
    items: itemResult.rows,
    customers: customerResult.rows,
    contacts: remapCustomerReference(contacts, "customer_source_key", customerResult.aliasBySourceKey),
    opening_ar: remapCustomerReference(opening_ar, "customer_source_key", customerResult.aliasBySourceKey),
    evidence: {
      policy: "forge-alumdoor-pilot-01-identity-disposition/v1",
      item_code_collisions: itemResult.collisions,
      customer_duplicates: customerResult.duplicates,
      production_data_mutated: false,
    },
  };
}
