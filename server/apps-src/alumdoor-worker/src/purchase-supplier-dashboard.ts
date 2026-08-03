import type { PurchaseFifoEnv } from "./purchase-fifo-receipt.js";

type Json = Record<string, unknown>;
type PlatformCall = (path: string, init?: RequestInit) => Promise<Response>;
type WindowStatus = "Open" | "Settled" | "Reversed";

interface PurchaseDoc extends Json {
  name: string;
  supplier?: string;
  company?: string;
  currency?: string;
  transaction_date?: string;
  schedule_date?: string;
  posting_at?: string;
  supplier_invoice_no?: string;
  driver?: string;
  docstatus?: number;
  received_percentage?: number | string;
  billed_percentage?: number | string;
  grand_total?: number | string;
  total?: number | string;
  outstanding_amount?: number | string;
  items?: Json[];
}

interface DebtRow extends Json {
  queue_key?: string;
  window_id?: string;
  window_sequence?: number;
  window_status?: WindowStatus;
  supplier?: string;
  company?: string;
  item_code?: string;
  material?: string;
  measurement_profile?: string;
  allocation_uom?: string;
  length_m?: string | number | null;
  theoretical_kg_per_m?: string | number | null;
  ordered_qty?: string;
  received_qty?: string;
  allocated_qty?: string;
  nominal_remaining_qty?: string;
  unapplied_receipt_qty?: string;
  ordered_meters?: string | number | null;
  received_meters?: string | number | null;
  nominal_remaining_meters?: string | number | null;
  ordered_barem_weight_kg?: string | number | null;
  received_barem_weight_kg?: string | number | null;
  nominal_remaining_barem_weight_kg?: string | number | null;
  tolerance?: string;
  oldest_open_po_date?: string | null;
  oldest_open_po_age_days?: number | null;
  barem_weight_kg?: string;
  actual_weight_kg?: string | null;
}

interface Timeline extends Json {
  name?: string;
  rows?: Json[];
  windows?: Json[];
  supplier_debt_reports?: Array<{ rows?: DebtRow[] }>;
}

const PAGE_SIZE = 200;
const MAX_DOCS = 5_000;
const EPSILON = 1e-6;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["có", "co", "yes", "true"].includes(text(value).toLocaleLowerCase("vi"));
}

function ageDays(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000));
}

function platformCaller(request: Request, env: PurchaseFifoEnv): PlatformCall {
  const declared = request.headers.get("x-cloudforge-callback");
  if (!declared) throw new Error("Nền tảng không cấp địa chỉ gọi ngược.");
  const base = declared.replace(/\/$/, "");
  const forwarded = {
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
  };
  return (path: string, init: RequestInit = {}) => env.PLATFORM
    ? env.PLATFORM.fetch(new Request(`${base}/${path.replace(/^\//, "")}`, {
        ...init,
        headers: { "content-type": "application/json", ...forwarded, ...(init.headers as Record<string, string> | undefined) },
      }))
    : fetch(new Request(`${base}/${path.replace(/^\//, "")}`, {
        ...init,
        headers: { "content-type": "application/json", ...forwarded, ...(init.headers as Record<string, string> | undefined) },
      }));
}

async function readDoc<T extends Json>(call: PlatformCall, doctype: string, name: string): Promise<T> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return (((await response.json()) as { data?: T }).data ?? {}) as T;
}

async function listSubmitted(call: PlatformCall, doctype: string, supplier: string): Promise<PurchaseDoc[]> {
  const names: string[] = [];
  for (let start = 0; start < MAX_DOCS; start += PAGE_SIZE) {
    const query = new URLSearchParams({
      fields: JSON.stringify(["name"]),
      filters: JSON.stringify([["supplier", "=", supplier], ["docstatus", "=", 1]]),
      limit_start: String(start),
      limit_page_length: String(PAGE_SIZE),
      order_by: "name asc",
    });
    const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
    if (!response.ok) throw new Error(`Không đọc được ${doctype} đã ghi sổ của ${supplier}.`);
    const page = (((await response.json()) as { data?: Array<{ name?: string }> }).data ?? [])
      .map((row) => text(row.name))
      .filter(Boolean);
    names.push(...page);
    if (page.length < PAGE_SIZE) break;
    if (start + PAGE_SIZE >= MAX_DOCS) {
      throw new Error(`${doctype} của ${supplier} vượt ${MAX_DOCS} chứng từ; từ chối cắt cụt số liệu công nợ.`);
    }
  }
  const output: PurchaseDoc[] = [];
  for (let index = 0; index < names.length; index += 24) {
    output.push(...await Promise.all(names.slice(index, index + 24).map((name) => readDoc<PurchaseDoc>(call, doctype, name))));
  }
  return output;
}

async function listSubmittedOptional(call: PlatformCall, doctype: string, supplier: string): Promise<PurchaseDoc[]> {
  try { return await listSubmitted(call, doctype, supplier); }
  catch { return []; }
}

async function loadTimeline(call: PlatformCall, orderName: string): Promise<Timeline | null> {
  const query = new URLSearchParams({ doctype: "Purchase Order", name: orderName });
  const response = await call(`method/metaforge.api.get_purchase_allocation_timeline?${query}`);
  if (!response.ok) return null;
  const payload = await response.json() as { message?: Timeline | null };
  return payload.message ?? null;
}

async function loadTimelines(call: PlatformCall, orders: PurchaseDoc[]): Promise<Timeline[]> {
  const output: Timeline[] = [];
  for (let index = 0; index < orders.length; index += 16) {
    const batch = await Promise.all(orders.slice(index, index + 16).map((order) => loadTimeline(call, order.name)));
    output.push(...batch.filter((value): value is Timeline => Boolean(value)));
  }
  return output;
}

function materialKey(row: Json): string {
  return [
    text(row.item_code),
    round(numeric(row.length_m)),
    round(numeric(row.theoretical_kg_per_m)),
    text(row.color),
    checked(row.is_stamped) ? "1" : "0",
    text(row.measurement_profile),
    text(row.stock_uom ?? row.uom),
  ].join("\u001f");
}

function materialLabel(row: Json): string {
  const parts = [text(row.item_code) || "Không rõ mã"];
  const length = numeric(row.length_m);
  const kgPerM = numeric(row.theoretical_kg_per_m);
  if (length > 0) parts.push(`${round(length)} m`);
  if (kgPerM > 0) parts.push(`${round(kgPerM)} kg/m`);
  const color = text(row.color);
  if (color) parts.push(color);
  parts.push(checked(row.is_stamped) ? "Dập" : "Không dập");
  return parts.join(" · ");
}

function fallbackDebtRows(orders: PurchaseDoc[], receipts: PurchaseDoc[]): DebtRow[] {
  const received = new Map<string, { bars: number; barem: number; actual: number }>();
  for (const receipt of receipts) {
    for (const item of receipt.items ?? []) {
      const key = materialKey(item);
      const current = received.get(key) ?? { bars: 0, barem: 0, actual: 0 };
      current.bars += numeric(item.qty_bar);
      current.barem += numeric(item.theoretical_kg);
      current.actual += numeric(item.actual_weight_kg ?? item.qty);
      received.set(key, current);
    }
  }

  const ordered = new Map<string, { source: Json; bars: number; barem: number; oldest: string | null }>();
  for (const order of orders) {
    for (const item of order.items ?? []) {
      const key = materialKey(item);
      const current = ordered.get(key) ?? { source: item, bars: 0, barem: 0, oldest: null };
      current.bars += numeric(item.qty_bar);
      current.barem += numeric(item.theoretical_kg);
      const date = text(order.transaction_date);
      if (date && (!current.oldest || date < current.oldest)) current.oldest = date;
      ordered.set(key, current);
    }
  }

  return [...ordered.entries()].map(([key, row], index) => {
    const delivered = received.get(key) ?? { bars: 0, barem: 0, actual: 0 };
    const remaining = Math.max(0, row.bars - delivered.bars);
    const length = numeric(row.source.length_m);
    const kgPerM = numeric(row.source.theoretical_kg_per_m);
    return {
      queue_key: `fallback:${index}:${key}`,
      window_id: `fallback:${index}`,
      window_sequence: 1,
      window_status: "Open",
      supplier: text(orders[0]?.supplier),
      company: text(orders[0]?.company),
      item_code: text(row.source.item_code),
      material: materialLabel(row.source),
      measurement_profile: text(row.source.measurement_profile),
      allocation_uom: "Cây",
      length_m: length || null,
      theoretical_kg_per_m: kgPerM || null,
      ordered_qty: String(round(row.bars)),
      received_qty: String(round(delivered.bars)),
      allocated_qty: String(round(Math.min(row.bars, delivered.bars))),
      nominal_remaining_qty: String(round(remaining)),
      unapplied_receipt_qty: String(round(Math.max(0, delivered.bars - row.bars))),
      ordered_meters: length > 0 ? round(row.bars * length) : null,
      received_meters: length > 0 ? round(delivered.bars * length) : null,
      nominal_remaining_meters: length > 0 ? round(remaining * length) : null,
      ordered_barem_weight_kg: length > 0 && kgPerM > 0 ? round(row.bars * length * kgPerM) : null,
      received_barem_weight_kg: round(delivered.barem),
      nominal_remaining_barem_weight_kg: length > 0 && kgPerM > 0 ? round(remaining * length * kgPerM) : null,
      tolerance: "—",
      oldest_open_po_date: remaining > EPSILON ? row.oldest : null,
      oldest_open_po_age_days: remaining > EPSILON ? ageDays(row.oldest) : null,
      barem_weight_kg: String(round(delivered.barem)),
      actual_weight_kg: delivered.actual > 0 ? String(round(delivered.actual)) : null,
    };
  });
}

function dedupeDebtRows(timelines: Timeline[], fallback: DebtRow[]): DebtRow[] {
  const rows = new Map<string, DebtRow>();
  for (const timeline of timelines) {
    for (const report of timeline.supplier_debt_reports ?? []) {
      for (const row of report.rows ?? []) {
        const key = `${text(row.queue_key)}:${text(row.window_id)}`;
        if (key !== ":") rows.set(key, row);
      }
    }
  }
  return rows.size ? [...rows.values()] : fallback;
}

function aggregateMaterialRows(rows: DebtRow[]): Json[] {
  interface Aggregate {
    queue_key: string;
    item_code: string;
    material: string;
    allocation_uom: string;
    ordered: number;
    received: number;
    allocated: number;
    remainingOpen: number;
    unappliedOpen: number;
    orderedMeters: number;
    receivedMeters: number;
    remainingMetersOpen: number;
    orderedBarem: number;
    receivedBarem: number;
    remainingBaremOpen: number;
    actual: number;
    hasActual: boolean;
    oldestOpen: string | null;
    oldestAge: number | null;
    latestSequence: number;
    latestStatus: WindowStatus;
    latestTolerance: string;
    hasOpen: boolean;
  }
  const grouped = new Map<string, Aggregate>();
  for (const row of rows) {
    const key = text(row.queue_key) || `${text(row.item_code)}:${text(row.material)}`;
    const status = (row.window_status ?? "Open") as WindowStatus;
    const sequence = numeric(row.window_sequence);
    const current = grouped.get(key) ?? {
      queue_key: key,
      item_code: text(row.item_code),
      material: text(row.material) || text(row.item_code),
      allocation_uom: text(row.allocation_uom) || "Cây",
      ordered: 0, received: 0, allocated: 0, remainingOpen: 0, unappliedOpen: 0,
      orderedMeters: 0, receivedMeters: 0, remainingMetersOpen: 0,
      orderedBarem: 0, receivedBarem: 0, remainingBaremOpen: 0,
      actual: 0, hasActual: false, oldestOpen: null, oldestAge: null,
      latestSequence: Number.NEGATIVE_INFINITY, latestStatus: status, latestTolerance: text(row.tolerance), hasOpen: false,
    };
    current.ordered += numeric(row.ordered_qty);
    current.received += numeric(row.received_qty);
    current.allocated += numeric(row.allocated_qty);
    current.orderedMeters += numeric(row.ordered_meters);
    current.receivedMeters += numeric(row.received_meters);
    current.orderedBarem += numeric(row.ordered_barem_weight_kg);
    current.receivedBarem += numeric(row.received_barem_weight_kg ?? row.barem_weight_kg);
    if (row.actual_weight_kg != null) {
      current.actual += numeric(row.actual_weight_kg);
      current.hasActual = true;
    }
    if (status === "Open") {
      current.hasOpen = true;
      current.remainingOpen += numeric(row.nominal_remaining_qty);
      current.unappliedOpen += numeric(row.unapplied_receipt_qty);
      current.remainingMetersOpen += numeric(row.nominal_remaining_meters);
      current.remainingBaremOpen += numeric(row.nominal_remaining_barem_weight_kg);
      const date = row.oldest_open_po_date ?? null;
      if (date && (!current.oldestOpen || date < current.oldestOpen)) {
        current.oldestOpen = date;
        current.oldestAge = row.oldest_open_po_age_days ?? ageDays(date);
      }
    }
    if (sequence >= current.latestSequence) {
      current.latestSequence = sequence;
      current.latestStatus = status;
      current.latestTolerance = text(row.tolerance);
    }
    grouped.set(key, current);
  }

  return [...grouped.values()].map((row) => {
    const remaining = Math.max(0, row.remainingOpen);
    const status = row.hasOpen
      ? remaining <= EPSILON ? "Đã giao đủ" : "Còn phải giao"
      : row.latestStatus === "Reversed" ? "Đã đảo đối soát" : "Đã đối soát";
    return {
      queue_key: row.queue_key,
      status,
      item_code: row.item_code,
      material: row.material,
      allocation_uom: row.allocation_uom,
      ordered_bars: round(row.ordered),
      received_bars: round(row.received),
      allocated_bars: round(row.allocated),
      remaining_bars: round(remaining),
      unapplied_bars: round(row.unappliedOpen),
      ordered_meters: round(row.orderedMeters),
      received_meters: round(row.receivedMeters),
      remaining_meters: round(row.remainingMetersOpen),
      ordered_barem_weight_kg: round(row.orderedBarem),
      received_barem_weight_kg: round(row.receivedBarem),
      remaining_barem_weight_kg: round(row.remainingBaremOpen),
      tolerance: row.latestTolerance,
      oldest_open_po_date: row.oldestOpen,
      overdue_days: row.oldestAge,
      barem_weight_kg: round(row.receivedBarem),
      actual_weight_kg: row.hasActual ? round(row.actual) : null,
      weight_variance_kg: row.hasActual ? round(row.actual - row.receivedBarem) : null,
      weight_variance_pct: row.hasActual && row.receivedBarem > 0 ? round((row.actual - row.receivedBarem) * 100 / row.receivedBarem, 2) : null,
    };
  }).sort((left, right) => numeric(right.remaining_bars) - numeric(left.remaining_bars) || String(left.material).localeCompare(String(right.material), "vi"));
}

function allocationByOrder(timelines: Timeline[]): Map<string, { bars: number; receipts: Set<string>; byRow: Map<string, number> }> {
  const map = new Map<string, { bars: number; receipts: Set<string>; byRow: Map<string, number> }>();
  for (const timeline of timelines) {
    const orderName = text(timeline.name);
    if (!orderName) continue;
    const current = map.get(orderName) ?? { bars: 0, receipts: new Set<string>(), byRow: new Map<string, number>() };
    for (const row of timeline.rows ?? []) {
      const receipt = text(row.purchase_receipt);
      if (!receipt) continue;
      const qty = numeric(row.qty);
      current.bars += qty;
      current.receipts.add(receipt);
      const rowId = text(row.purchase_order_row);
      if (rowId) current.byRow.set(rowId, (current.byRow.get(rowId) ?? 0) + qty);
    }
    map.set(orderName, current);
  }
  return map;
}

function receiptByOrder(receipts: PurchaseDoc[]): Map<string, { bars: number; receipts: Set<string>; byMaterial: Map<string, number> }> {
  const map = new Map<string, { bars: number; receipts: Set<string>; byMaterial: Map<string, number> }>();
  for (const receipt of receipts) {
    for (const item of receipt.items ?? []) {
      const order = text(item.purchase_order ?? receipt.against_purchase_order);
      if (!order) continue;
      const current = map.get(order) ?? { bars: 0, receipts: new Set<string>(), byMaterial: new Map<string, number>() };
      const bars = numeric(item.qty_bar);
      current.bars += bars;
      current.receipts.add(receipt.name);
      const key = materialKey(item);
      current.byMaterial.set(key, (current.byMaterial.get(key) ?? 0) + bars);
      map.set(order, current);
    }
  }
  return map;
}

function buildOrderRows(orders: PurchaseDoc[], receipts: PurchaseDoc[], timelines: Timeline[]): Json[] {
  const fallback = receiptByOrder(receipts);
  const canonical = allocationByOrder(timelines);
  const timelineByOrder = new Map(timelines.map((timeline) => [text(timeline.name), timeline]));
  return orders.map((order) => {
    const orderedBars = (order.items ?? []).reduce((sum, item) => sum + numeric(item.qty_bar), 0);
    const canonicalRow = canonical.get(order.name);
    const fallbackRow = fallback.get(order.name);
    const receivedBars = canonicalRow ? canonicalRow.bars : fallbackRow?.bars ?? 0;
    const receiptCount = canonicalRow ? canonicalRow.receipts.size : fallbackRow?.receipts.size ?? 0;
    const nominalRemaining = Math.max(0, orderedBars - receivedBars);
    const scheduleDate = text(order.schedule_date);
    const windows = timelineByOrder.get(order.name)?.windows ?? [];
    const settled = windows.length > 0 && windows.every((window) => text(window.status) === "Settled");
    const remainingBars = settled ? 0 : nominalRemaining;
    const dueAge = remainingBars > EPSILON && scheduleDate ? ageDays(scheduleDate) : null;
    let status = settled ? "Đã đối soát" : remainingBars <= EPSILON ? "Đã giao đủ" : receivedBars > EPSILON ? "Đang giao" : "Chưa giao";
    if (!settled && remainingBars > EPSILON && dueAge != null && dueAge > 0) status = "Quá hạn";
    const shortageVariance = settled
      ? windows.reduce((sum, window) => sum + numeric(window.shortage_variance), 0)
      : 0;
    const poValue = numeric(order.grand_total ?? order.total) || (order.items ?? []).reduce((sum, item) => sum + numeric(item.amount), 0);
    return {
      purchase_order: order.name,
      transaction_date: text(order.transaction_date),
      schedule_date: scheduleDate,
      status,
      ordered_bars: round(orderedBars),
      received_bars: round(receivedBars),
      nominal_remaining_bars: round(nominalRemaining),
      remaining_bars: round(remainingBars),
      shortage_variance_bars: round(shortageVariance),
      receipt_count: receiptCount,
      received_percentage: orderedBars > 0 ? round(Math.min(receivedBars, orderedBars) * 100 / orderedBars, 2) : 0,
      billed_percentage: numeric(order.billed_percentage),
      overdue_days: status === "Quá hạn" ? dueAge : 0,
      purchase_value: round(poValue, 2),
    };
  }).sort((left, right) => String(left.transaction_date).localeCompare(String(right.transaction_date)) || String(left.purchase_order).localeCompare(String(right.purchase_order)));
}

function buildOrderLineRows(orders: PurchaseDoc[], receipts: PurchaseDoc[], timelines: Timeline[]): Json[] {
  const canonical = allocationByOrder(timelines);
  const fallback = receiptByOrder(receipts);
  const timelineByOrder = new Map(timelines.map((timeline) => [text(timeline.name), timeline]));
  const rows: Json[] = [];
  for (const order of orders) {
    const settled = (timelineByOrder.get(order.name)?.windows ?? []).length > 0
      && (timelineByOrder.get(order.name)?.windows ?? []).every((window) => text(window.status) === "Settled");
    for (const [index, item] of (order.items ?? []).entries()) {
      const rowId = text(item.row_id) || `ROW-${index + 1}`;
      const orderedBars = numeric(item.qty_bar);
      const byRow = canonical.get(order.name)?.byRow;
      const receivedBars = byRow?.has(rowId)
        ? byRow.get(rowId) ?? 0
        : fallback.get(order.name)?.byMaterial.get(materialKey(item)) ?? 0;
      const nominalRemaining = Math.max(0, orderedBars - receivedBars);
      const remaining = settled ? 0 : nominalRemaining;
      const length = numeric(item.length_m);
      const kgPerM = numeric(item.theoretical_kg_per_m);
      rows.push({
        purchase_order: order.name,
        purchase_order_row: rowId,
        transaction_date: text(order.transaction_date),
        schedule_date: text(order.schedule_date),
        item_code: text(item.item_code),
        material: materialLabel(item),
        ordered_bars: round(orderedBars),
        received_bars: round(receivedBars),
        nominal_remaining_bars: round(nominalRemaining),
        remaining_bars: round(remaining),
        ordered_meters: round(orderedBars * length),
        received_meters: round(receivedBars * length),
        remaining_meters: round(remaining * length),
        ordered_barem_weight_kg: round(orderedBars * length * kgPerM),
        received_barem_weight_kg: round(receivedBars * length * kgPerM),
        remaining_barem_weight_kg: round(remaining * length * kgPerM),
        rate: round(numeric(item.rate), 2),
        amount: round(numeric(item.amount), 2),
        status: settled ? "Đã đối soát" : remaining <= EPSILON ? "Đã giao đủ" : receivedBars > EPSILON ? "Đang giao" : "Chưa giao",
      });
    }
  }
  return rows.sort((left, right) => String(left.transaction_date).localeCompare(String(right.transaction_date)) || String(left.purchase_order).localeCompare(String(right.purchase_order)) || String(left.purchase_order_row).localeCompare(String(right.purchase_order_row)));
}

function buildReceiptRows(receipts: PurchaseDoc[]): Json[] {
  return receipts.map((receipt) => {
    const orders = new Set<string>();
    let bars = 0; let actualKg = 0; let baremKg = 0; let value = 0; let meters = 0;
    for (const item of receipt.items ?? []) {
      const order = text(item.purchase_order ?? receipt.against_purchase_order);
      if (order) orders.add(order);
      bars += numeric(item.qty_bar);
      meters += numeric(item.total_length_m) || numeric(item.length_m) * numeric(item.qty_bar);
      actualKg += numeric(item.actual_weight_kg ?? item.qty);
      baremKg += numeric(item.theoretical_kg);
      value += numeric(item.amount);
    }
    return {
      purchase_receipt: receipt.name,
      posting_at: text(receipt.posting_at),
      supplier_invoice_no: text(receipt.supplier_invoice_no),
      driver: text(receipt.driver),
      purchase_orders: [...orders],
      line_count: (receipt.items ?? []).length,
      qty_bar: round(bars),
      total_length_m: round(meters),
      barem_weight_kg: round(baremKg),
      actual_weight_kg: round(actualKg),
      weight_variance_kg: round(actualKg - baremKg),
      weight_variance_pct: baremKg > 0 ? round((actualKg - baremKg) * 100 / baremKg, 2) : null,
      value: round(value, 2),
    };
  }).sort((left, right) => String(right.posting_at).localeCompare(String(left.posting_at)) || String(right.purchase_receipt).localeCompare(String(left.purchase_receipt)));
}

function buildPriceHistory(orders: PurchaseDoc[]): Json[] {
  const rows: Json[] = [];
  for (const order of orders) {
    for (const item of order.items ?? []) {
      const rate = numeric(item.rate);
      if (rate <= 0) continue;
      rows.push({
        purchase_order: order.name,
        transaction_date: text(order.transaction_date),
        item_code: text(item.item_code),
        material: materialLabel(item),
        rate: round(rate, 2),
        qty_bar: round(numeric(item.qty_bar)),
        theoretical_kg: round(numeric(item.theoretical_kg)),
        amount: round(numeric(item.amount), 2),
      });
    }
  }
  rows.sort((left, right) => String(left.transaction_date).localeCompare(String(right.transaction_date)) || String(left.purchase_order).localeCompare(String(right.purchase_order)));
  const previous = new Map<string, number>();
  for (const row of rows) {
    const key = text(row.material);
    const prior = previous.get(key);
    const rate = numeric(row.rate);
    row.previous_rate = prior ?? null;
    row.change_pct = prior && prior > 0 ? round((rate - prior) * 100 / prior, 2) : null;
    previous.set(key, rate);
  }
  return rows.reverse().slice(0, 500);
}

async function loadAuthoritativePayable(call: PlatformCall, supplier: string, generatedAt: string): Promise<Json | null> {
  try {
    const filters = {
      as_of_date: generatedAt.slice(0, 10),
      party: supplier,
      account_type: "Payable",
    };
    const query = new URLSearchParams({
      report_name: "Debt Summary",
      filters: JSON.stringify(filters),
      ignore_prepared_report: "1",
    });
    const response = await call(`method/frappe.desk.query_report.run?${query}`);
    if (!response.ok) return null;
    const payload = await response.json() as { message?: Json } & Json;
    const report = (payload.message ?? payload) as Json;
    const rows = Array.isArray(report.result) ? report.result.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : [];
    if (!rows.length) {
      return {
        authoritative: true,
        source: "Payment Ledger / Debt Summary",
        total_outstanding: 0,
        due_amount: 0,
        overdue_amount: 0,
        advance_balance: 0,
        net_exposure: 0,
        oldest_due_date: null,
        currencies: [],
        rows: [],
      };
    }
    const dates = rows.map((row) => text(row.oldest_due_date)).filter(Boolean).sort();
    return {
      authoritative: true,
      source: "Payment Ledger / Debt Summary",
      total_outstanding: round(rows.reduce((sum, row) => sum + numeric(row.total_outstanding), 0), 2),
      due_amount: round(rows.reduce((sum, row) => sum + numeric(row.due_amount), 0), 2),
      overdue_amount: round(rows.reduce((sum, row) => sum + numeric(row.overdue_amount), 0), 2),
      advance_balance: round(rows.reduce((sum, row) => sum + numeric(row.advance_balance), 0), 2),
      net_exposure: round(rows.reduce((sum, row) => sum + numeric(row.net_exposure), 0), 2),
      oldest_due_date: dates[0] ?? null,
      currencies: [...new Set(rows.map((row) => text(row.currency)).filter(Boolean))],
      rows,
    };
  } catch {
    return null;
  }
}

function billingSummary(invoices: PurchaseDoc[], receiptRows: Json[], payable: Json | null): Json {
  const invoiceTotal = invoices.reduce((sum, invoice) => sum + numeric(invoice.grand_total ?? invoice.total), 0);
  const invoiceOutstandingHint = invoices.reduce((sum, invoice) => sum + numeric(invoice.outstanding_amount), 0);
  const receivedValue = receiptRows.reduce((sum, row) => sum + numeric(row.value), 0);
  return {
    invoice_count: invoices.length,
    invoice_total: round(invoiceTotal, 2),
    received_value: round(receivedValue, 2),
    received_not_invoiced_hint: round(Math.max(0, receivedValue - invoiceTotal), 2),
    invoice_outstanding_hint: round(invoiceOutstandingHint, 2),
    ...(payable ?? {
      authoritative: false,
      source: "Purchase Invoice fallback",
      total_outstanding: round(invoiceOutstandingHint, 2),
      due_amount: null,
      overdue_amount: null,
      advance_balance: null,
      net_exposure: round(invoiceOutstandingHint, 2),
      oldest_due_date: null,
      currencies: [...new Set(invoices.map((invoice) => text(invoice.currency)).filter(Boolean))],
      rows: [],
    }),
    note: payable
      ? "Công nợ phải trả lấy trực tiếp Payment Ledger qua Debt Summary. Giá trị hàng nhận/chưa hóa đơn chỉ là chỉ báo vận hành."
      : "Không đọc được Payment Ledger; số outstanding trên Purchase Invoice chỉ là fallback, không được coi là công nợ authoritative.",
  };
}

export async function handlePurchaseSupplierDashboard(request: Request, env: PurchaseFifoEnv): Promise<Response> {
  const answer = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  try {
    if (!request.headers.get("x-cloudforge-tenant")) return answer({ message: "not a platform call" }, 403);
    const body = await request.json().catch(() => ({})) as { args?: Json };
    const supplier = text(body.args?.supplier);
    if (!supplier) throw new Error("Cần chọn Nhà cung cấp.");
    const call = platformCaller(request, env);
    const generatedAt = new Date().toISOString();
    const [orders, receipts, invoices, payable] = await Promise.all([
      listSubmitted(call, "Purchase Order", supplier),
      listSubmitted(call, "Purchase Receipt", supplier),
      listSubmittedOptional(call, "Purchase Invoice", supplier),
      loadAuthoritativePayable(call, supplier, generatedAt),
    ]);
    const timelines = await loadTimelines(call, orders);
    const materials = aggregateMaterialRows(dedupeDebtRows(timelines, fallbackDebtRows(orders, receipts)));
    const purchaseOrders = buildOrderRows(orders, receipts, timelines);
    const purchaseOrderLines = buildOrderLineRows(orders, receipts, timelines);
    const receiptRows = buildReceiptRows(receipts);
    const orderedBars = materials.reduce((sum, row) => sum + numeric(row.ordered_bars), 0);
    const receivedBars = materials.reduce((sum, row) => sum + numeric(row.received_bars), 0);
    const remainingBars = materials.reduce((sum, row) => sum + numeric(row.remaining_bars), 0);
    const unappliedBars = materials.reduce((sum, row) => sum + numeric(row.unapplied_bars), 0);
    const orderedMeters = materials.reduce((sum, row) => sum + numeric(row.ordered_meters), 0);
    const receivedMeters = materials.reduce((sum, row) => sum + numeric(row.received_meters), 0);
    const remainingMeters = materials.reduce((sum, row) => sum + numeric(row.remaining_meters), 0);
    const orderedBarem = materials.reduce((sum, row) => sum + numeric(row.ordered_barem_weight_kg), 0);
    const receivedBarem = materials.reduce((sum, row) => sum + numeric(row.received_barem_weight_kg), 0);
    const remainingBarem = materials.reduce((sum, row) => sum + numeric(row.remaining_barem_weight_kg), 0);
    const actualKg = materials.reduce((sum, row) => sum + numeric(row.actual_weight_kg), 0);
    const purchaseValue = purchaseOrders.reduce((sum, row) => sum + numeric(row.purchase_value), 0);
    const openOrders = purchaseOrders.filter((row) => !["Đã giao đủ", "Đã đối soát"].includes(text(row.status)));
    const overdueOrders = purchaseOrders.filter((row) => text(row.status) === "Quá hạn");
    const completedMaterials = materials.filter((row) => ["Đã giao đủ", "Đã đối soát"].includes(text(row.status)));
    const unsettledMaterials = materials.filter((row) => !["Đã đối soát"].includes(text(row.status)));
    const billing = billingSummary(invoices, receiptRows, payable);

    return answer({
      supplier,
      generated_at: generatedAt,
      source: timelines.length ? "purchase_allocation_ledger" : "submitted_documents_fallback",
      summary: {
        purchase_order_count: orders.length,
        open_purchase_order_count: openOrders.length,
        overdue_purchase_order_count: overdueOrders.length,
        material_count: materials.length,
        completed_material_count: completedMaterials.length,
        unsettled_material_count: unsettledMaterials.length,
        ordered_bars: round(orderedBars),
        received_bars: round(receivedBars),
        remaining_bars: round(remainingBars),
        unapplied_bars: round(unappliedBars),
        ordered_meters: round(orderedMeters),
        received_meters: round(receivedMeters),
        remaining_meters: round(remainingMeters),
        ordered_barem_weight_kg: round(orderedBarem),
        received_barem_weight_kg: round(receivedBarem),
        remaining_barem_weight_kg: round(remainingBarem),
        actual_received_weight_kg: round(actualKg),
        purchase_value: round(purchaseValue, 2),
        receipt_count: receipts.length,
        payable_outstanding: numeric(billing.total_outstanding),
        payable_overdue: numeric(billing.overdue_amount),
        supplier_advance: numeric(billing.advance_balance),
        payable_net_exposure: numeric(billing.net_exposure),
      },
      materials,
      purchase_orders: purchaseOrders,
      purchase_order_lines: purchaseOrderLines,
      receipts: receiptRows,
      price_history: buildPriceHistory(orders),
      billing,
      payable: billing,
      capabilities: {
        delivery_obligation: true,
        allocation_timeline: timelines.length > 0,
        settlement: timelines.some((timeline) => (timeline.windows ?? []).length > 0),
        receipt_history: true,
        price_history: true,
        physical_debt: true,
        payable_source_of_truth: billing.authoritative ? "Payment Ledger / Debt Summary" : "Purchase Invoice fallback",
        pagination: true,
      },
    });
  } catch (error) {
    return answer({ message: error instanceof Error ? error.message : "Không tải được theo dõi giao hàng nhà cung cấp." }, 422);
  }
}
