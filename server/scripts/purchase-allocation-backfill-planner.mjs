import { createHash } from "node:crypto";

const MICROS = 1_000_000;

export function planPurchaseAllocationBackfill({
  tenantId,
  documents,
  children,
  progressEntries,
  committedAt,
}) {
  const tenant = requiredText(tenantId, "tenantId");
  const now = requiredText(committedAt, "committedAt");
  const childMap = new Map();
  for (const row of children) {
    const key = String(row.parent_key);
    const list = childMap.get(key) ?? [];
    list.push({
      row_id: String(row.row_id),
      idx: Number(row.idx),
      data: parseJson(row.payload_json, `child ${key}:${row.row_id}`),
    });
    childMap.set(key, list);
  }
  for (const list of childMap.values()) list.sort((a, b) => a.idx - b.idx || a.row_id.localeCompare(b.row_id));

  const purchaseOrders = new Map();
  const purchaseReceipts = new Map();
  for (const row of documents) {
    const doctype = String(row.doctype);
    if (doctype !== "Purchase Order" && doctype !== "Purchase Receipt") continue;
    const name = String(row.name);
    const data = parseJson(row.payload_json, `${doctype} ${name}`);
    const record = {
      name,
      version: Number(row.version),
      created_at: String(row.created_at),
      data,
      rows: (childMap.get(`${doctype}:${name}`) ?? []).map((child) => enrichLine(child, doctype)),
    };
    if (doctype === "Purchase Order") purchaseOrders.set(name, record);
    else purchaseReceipts.set(name, record);
  }

  const queueMap = new Map();
  const queues = [];
  const windows = [];
  const obligations = [];
  const allocations = [];
  const unapplied = [];
  const unresolved = [];
  const poAllocated = new Map();
  const receiptConsumed = new Map();
  const receiptWeightState = new Map();

  for (const po of purchaseOrders.values()) {
    const company = requiredText(po.data.company, `Purchase Order ${po.name}.company`);
    const supplier = requiredText(po.data.supplier, `Purchase Order ${po.name}.supplier`);
    const transactionDate = requiredText(
      po.data.transaction_date ?? String(po.created_at).slice(0, 10),
      `Purchase Order ${po.name}.transaction_date`,
    );
    const toleranceBps = toleranceOf(po.data);
    for (const row of po.rows) {
      if (row.qty_micros <= 0) {
        unresolved.push(problem("po_row_quantity", "Purchase Order row has no positive stock quantity", {
          purchase_order: po.name,
          row_id: row.row_id,
        }));
        continue;
      }
      const queue = ensureQueue({
        tenant,
        company,
        supplier,
        material: row.material,
        toleranceBps,
        now,
        queueMap,
        queues,
        windows,
      });
      obligations.push({
        entry_id: deterministicId("LEGACY-OBL", tenant, po.name, po.version, row.row_id),
        queue_key: queue.queue_key,
        window_id: queue.window_id,
        line_key: `LEGACY-OBL-${safe(row.row_id)}`,
        voucher_no: po.name,
        voucher_revision: po.version,
        purchase_order: po.name,
        purchase_order_item_row_id: row.row_id,
        entry_kind: "legacy",
        qty_micros: row.qty_micros,
        transaction_date: transactionDate,
        purchase_order_created_at: po.created_at,
        item_idx: row.idx,
        committed_at: now,
        source: "legacy",
        resolution: "resolved",
      });
    }
  }

  const sortedProgress = [...progressEntries].sort((a, b) =>
    String(a.posting_at).localeCompare(String(b.posting_at))
      || String(a.voucher_no).localeCompare(String(b.voucher_no))
      || String(a.line_key).localeCompare(String(b.line_key)));

  for (const progress of sortedProgress) {
    if (String(progress.kind) !== "Receipt" || Number(progress.qty_micros) <= 0) continue;
    const receiptName = String(progress.voucher_no);
    const poName = String(progress.purchase_order);
    const qty = safeInteger(progress.qty_micros, `progress ${receiptName}.qty_micros`);
    const receipt = purchaseReceipts.get(receiptName);
    const po = purchaseOrders.get(poName);
    if (!receipt || !po) {
      unresolved.push(problem("missing_document", "Legacy progress references a missing submitted document", {
        purchase_receipt: receiptName,
        purchase_order: poName,
      }));
      continue;
    }
    const receiptCandidates = receipt.rows.filter((row) =>
      row.item_code === String(progress.item_code)
      && remaining(receiptConsumed, receiptName, row.row_id, row.qty_micros) >= qty);
    const poCandidates = po.rows.filter((row) =>
      row.item_code === String(progress.item_code)
      && remaining(poAllocated, poName, row.row_id, row.qty_micros) >= qty);
    const compatiblePairs = [];
    for (const receiptRow of receiptCandidates) {
      for (const poRow of poCandidates) {
        if (receiptRow.material.material_match_key === poRow.material.material_match_key) {
          compatiblePairs.push({ receiptRow, poRow });
        }
      }
    }
    if (compatiblePairs.length !== 1) {
      unresolved.push(problem("ambiguous_progress", "Legacy Receipt progress does not resolve to exactly one Receipt/PO row pair", {
        purchase_receipt: receiptName,
        purchase_order: poName,
        item_code: String(progress.item_code),
        qty_micros: qty,
        receipt_candidates: receiptCandidates.map((row) => row.row_id),
        po_candidates: poCandidates.map((row) => row.row_id),
        compatible_pair_count: compatiblePairs.length,
      }));
      continue;
    }
    const { receiptRow, poRow } = compatiblePairs[0];
    const queue = queueForReceiptRow(receipt, receiptRow, queueMap);
    if (!queue || queue.queue_key !== queueForPoRow(po, poRow, queueMap)?.queue_key) {
      unresolved.push(problem("queue_mismatch", "Resolved rows do not share one supplier/material queue", {
        purchase_receipt: receiptName,
        receipt_row_id: receiptRow.row_id,
        purchase_order: poName,
        purchase_order_row_id: poRow.row_id,
      }));
      continue;
    }

    const weight = takeReceiptWeight({
      receiptName,
      row: receiptRow,
      qty,
      receiptWeightState,
    });
    increment(receiptConsumed, receiptName, receiptRow.row_id, qty);
    increment(poAllocated, poName, poRow.row_id, qty);
    const sequence = allocations.filter((entry) => entry.voucher_no === receiptName).length + 1;
    allocations.push({
      entry_id: deterministicId("LEGACY-ALLOC", tenant, receiptName, progress.voucher_revision, progress.line_key),
      queue_key: queue.queue_key,
      window_id: queue.window_id,
      line_key: `LEGACY-${safe(progress.line_key)}`,
      voucher_no: receiptName,
      voucher_revision: Number(progress.voucher_revision),
      receipt_item_row_id: receiptRow.row_id,
      purchase_order: poName,
      purchase_order_item_row_id: poRow.row_id,
      entry_kind: "legacy",
      qty_micros: qty,
      barem_weight_micros: weight.barem_weight_micros,
      ...(weight.projected_actual_weight_micros === undefined ? {} : {
        projected_actual_weight_micros: weight.projected_actual_weight_micros,
        projection_version: 1,
      }),
      allocation_sequence: sequence,
      posting_at: String(progress.posting_at),
      committed_at: now,
      source: "legacy",
      resolution: "resolved",
    });
  }

  for (const receipt of purchaseReceipts.values()) {
    for (const row of receipt.rows) {
      const consumed = valueOf(receiptConsumed, receipt.name, row.row_id);
      const remainingQty = row.qty_micros - consumed;
      if (remainingQty <= 0) continue;
      const queue = queueForReceiptRow(receipt, row, queueMap);
      if (!queue) {
        unresolved.push(problem("receipt_without_queue", "Receipt remainder has no unique PO obligation queue", {
          purchase_receipt: receipt.name,
          receipt_row_id: row.row_id,
          item_code: row.item_code,
          remaining_qty_micros: remainingQty,
        }));
        continue;
      }
      const weight = takeReceiptWeight({
        receiptName: receipt.name,
        row,
        qty: remainingQty,
        receiptWeightState,
      });
      unapplied.push({
        entry_id: deterministicId("LEGACY-UNAPPLIED", tenant, receipt.name, receipt.version, row.row_id),
        queue_key: queue.queue_key,
        window_id: queue.window_id,
        line_key: `LEGACY-UNAPPLIED-${safe(row.row_id)}`,
        voucher_no: receipt.name,
        voucher_revision: receipt.version,
        receipt_item_row_id: row.row_id,
        entry_kind: "receive",
        qty_micros: remainingQty,
        barem_weight_micros: weight.barem_weight_micros,
        ...(weight.projected_actual_weight_micros === undefined ? {} : {
          projected_actual_weight_micros: weight.projected_actual_weight_micros,
          projection_version: 1,
        }),
        posting_at: requiredText(receipt.data.posting_at, `Purchase Receipt ${receipt.name}.posting_at`),
        committed_at: now,
      });
    }
  }

  const poChecksumRows = obligations.map((obligation) => {
    const allocated = allocations
      .filter((entry) => entry.purchase_order === obligation.purchase_order
        && entry.purchase_order_item_row_id === obligation.purchase_order_item_row_id)
      .reduce((sum, entry) => sum + entry.qty_micros, 0);
    return {
      purchase_order: obligation.purchase_order,
      purchase_order_item_row_id: obligation.purchase_order_item_row_id,
      nominal_qty_micros: obligation.qty_micros,
      allocated_qty_micros: allocated,
      remaining_qty_micros: obligation.qty_micros - allocated,
    };
  }).sort((a, b) => a.purchase_order.localeCompare(b.purchase_order)
    || a.purchase_order_item_row_id.localeCompare(b.purchase_order_item_row_id));
  const checksum = sha256(stableJson(poChecksumRows));

  return {
    schema_version: 1,
    tenant_id: tenant,
    generated_at: now,
    counts: {
      queues: queues.length,
      windows: windows.length,
      obligations: obligations.length,
      allocations: allocations.length,
      unapplied: unapplied.length,
      unresolved: unresolved.length,
    },
    checksum,
    po_checksum_rows: poChecksumRows,
    queues,
    windows,
    obligations,
    allocations,
    unapplied,
    unresolved,
  };
}

function enrichLine(child, doctype) {
  const itemCode = requiredText(child.data.item_code, `${doctype} row ${child.row_id}.item_code`);
  const qtyMicros = stockQtyMicros(child.data);
  const baremWeightMicros = theoreticalWeightMicros(child.data, qtyMicros);
  const actualWeightMicros = actualWeightOf(child.data);
  const snapshot = {
    schema_version: 1,
    item_code: itemCode,
    length_m_micros: decimalMicros(child.data.length_m ?? 0),
    theoretical_kg_per_m_micros: decimalMicros(child.data.theoretical_kg_per_m ?? 0),
    color: optionalText(child.data.color),
    is_stamped: stamped(child.data.is_stamped),
    measurement_profile: optionalText(child.data.measurement_profile),
    stock_uom: requiredText(child.data.stock_uom ?? child.data.uom, `${doctype} row ${child.row_id}.stock_uom`),
  };
  return {
    ...child,
    item_code: itemCode,
    qty_micros: qtyMicros,
    barem_weight_micros: baremWeightMicros,
    ...(actualWeightMicros === undefined ? {} : { actual_weight_micros: actualWeightMicros }),
    material: {
      snapshot,
      material_match_key: sha256(stableJson(snapshot)),
    },
  };
}

function ensureQueue({ tenant, company, supplier, material, toleranceBps, now, queueMap, queues, windows }) {
  const identity = `${company}\u0000${supplier}\u0000${material.material_match_key}`;
  const existing = queueMap.get(identity);
  if (existing) return existing;
  const queueKey = sha256(stableJson({
    schema_version: 1,
    tenant_id: tenant,
    company,
    supplier,
    material_match_key: material.material_match_key,
  }));
  const windowId = `PW-${queueKey.slice(0, 24)}-000001`;
  const queue = { queue_key: queueKey, window_id: windowId, company, supplier, material_match_key: material.material_match_key };
  queueMap.set(identity, queue);
  queues.push({
    queue_key: queueKey,
    company,
    supplier,
    material_match_key: material.material_match_key,
    material_schema_version: 1,
    material_snapshot: material.snapshot,
    revision: 0,
    created_at: now,
    modified_at: now,
  });
  windows.push({
    window_id: windowId,
    queue_key: queueKey,
    window_sequence: 1,
    status: "Open",
    tolerance_bps: toleranceBps,
    revision: 0,
    opened_at: now,
  });
  return queue;
}

function queueForReceiptRow(receipt, row, queueMap) {
  const company = optionalText(receipt.data.company);
  const supplier = optionalText(receipt.data.supplier);
  return queueMap.get(`${company}\u0000${supplier}\u0000${row.material.material_match_key}`) ?? null;
}

function queueForPoRow(po, row, queueMap) {
  const company = optionalText(po.data.company);
  const supplier = optionalText(po.data.supplier);
  return queueMap.get(`${company}\u0000${supplier}\u0000${row.material.material_match_key}`) ?? null;
}

function takeReceiptWeight({ receiptName, row, qty, receiptWeightState }) {
  const key = `${receiptName}\u0000${row.row_id}`;
  const state = receiptWeightState.get(key) ?? {
    qty_micros: row.qty_micros,
    barem_weight_micros: row.barem_weight_micros,
    ...(row.actual_weight_micros === undefined ? {} : { actual_weight_micros: row.actual_weight_micros }),
  };
  if (qty > state.qty_micros || state.qty_micros <= 0) throw new Error(`Receipt weight state underflow for ${key}`);
  const all = qty === state.qty_micros;
  const barem = all ? state.barem_weight_micros : proportional(state.barem_weight_micros, qty, state.qty_micros);
  const actual = state.actual_weight_micros === undefined
    ? undefined
    : all ? state.actual_weight_micros : proportional(state.actual_weight_micros, qty, state.qty_micros);
  state.qty_micros -= qty;
  state.barem_weight_micros -= barem;
  if (actual !== undefined) state.actual_weight_micros -= actual;
  receiptWeightState.set(key, state);
  return {
    barem_weight_micros: barem,
    ...(actual === undefined ? {} : { projected_actual_weight_micros: actual }),
  };
}

function stockQtyMicros(data) {
  if (Number.isSafeInteger(data.qty_micros) && data.qty_micros > 0) return data.qty_micros;
  if (data.qty_bar !== undefined && data.qty_bar !== null && String(data.qty_bar).trim() !== "") {
    const bars = decimalMicros(data.qty_bar);
    if (bars > 0) return bars;
  }
  const qty = decimalMicros(data.qty ?? 0);
  const factor = data.conversion_factor === undefined ? MICROS : decimalMicros(data.conversion_factor);
  return Number(BigInt(qty) * BigInt(factor) / BigInt(MICROS));
}

function theoreticalWeightMicros(data, stockQty) {
  if (data.theoretical_kg !== undefined && String(data.theoretical_kg).trim() !== "") {
    return decimalMicros(data.theoretical_kg);
  }
  const length = decimalMicros(data.length_m ?? 0);
  const kgPerM = decimalMicros(data.theoretical_kg_per_m ?? 0);
  return Number(BigInt(stockQty) * BigInt(length) * BigInt(kgPerM) / BigInt(MICROS) / BigInt(MICROS));
}

function actualWeightOf(data) {
  if (Number.isSafeInteger(data.actual_weight_micros)) return data.actual_weight_micros;
  if (data.actual_weight_kg === undefined || data.actual_weight_kg === null || String(data.actual_weight_kg).trim() === "") {
    return undefined;
  }
  return decimalMicros(data.actual_weight_kg);
}

function toleranceOf(data) {
  const value = data.receipt_tolerance_pct ?? data.tolerance_pct ?? 0;
  const bps = decimalScaled(value, 2);
  return Math.max(0, Math.min(10_000, bps));
}

function increment(map, document, rowId, qty) {
  const key = `${document}\u0000${rowId}`;
  map.set(key, (map.get(key) ?? 0) + qty);
}

function valueOf(map, document, rowId) {
  return map.get(`${document}\u0000${rowId}`) ?? 0;
}

function remaining(map, document, rowId, total) {
  return total - valueOf(map, document, rowId);
}

function decimalMicros(value) {
  return decimalScaled(value, 6);
}

function decimalScaled(value, scale) {
  const text = String(value ?? 0).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new Error(`Invalid decimal ${text}`);
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  const padded = `${fraction}${"0".repeat(scale)}`.slice(0, scale);
  const nextDigit = fraction[scale] ?? "0";
  let result = BigInt(whole) * 10n ** BigInt(scale) + BigInt(padded || "0");
  if (nextDigit >= "5") result += 1n;
  if (negative) result = -result;
  const number = Number(result);
  if (!Number.isSafeInteger(number)) throw new Error(`Decimal exceeds safe integer range: ${text}`);
  return number;
}

function proportional(total, part, whole) {
  return Number(BigInt(total) * BigInt(part) / BigInt(whole));
}

function parseJson(value, label) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed;
  } catch (error) {
    throw new Error(`${label} payload is invalid JSON: ${error.message}`);
  }
}

function deterministicId(prefix, ...parts) {
  return `${prefix}:${sha256(parts.map(String).join("\u0000")).slice(0, 48)}`;
}

function problem(code, message, details) {
  return { code, message, details };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safe(value) {
  return String(value).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 160);
}

function requiredText(value, field) {
  const text = optionalText(value);
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function optionalText(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function safeInteger(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${field} must be a safe integer`);
  return number;
}

function stamped(value) {
  const text = String(value ?? "").trim().toLocaleLowerCase("vi");
  return ["1", "true", "yes", "y", "có", "co"].includes(text) ? 1 : 0;
}
