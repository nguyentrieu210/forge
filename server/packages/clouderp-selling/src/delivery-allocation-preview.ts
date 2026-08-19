import type { Actor, CanonicalDocument, JsonObject, MutationCommand, StockLedgerEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { DomainReader } from "../../document-kernel/src/index.js";
import { fromScaledInt } from "../../money/src/index.js";
import { DeliveryNoteController } from "./controllers.js";
import type { DeliveryNoteData, SalesItem } from "./types.js";

export interface DeliveryNoteSubmitPreview {
  kind: "delivery_note_fifo";
  title: string;
  description: string;
  confirmation_label: string;
  warnings: string[];
  columns: Array<{ key: string; label: string; align?: "left" | "right" }>;
  rows: Array<Record<string, unknown>>;
  summary: Array<{ label: string; value: string }>;
}

export async function previewDeliveryNoteSubmission(input: {
  tenantId: string;
  actor: Actor;
  document: CanonicalDocument<JsonObject>;
  reader: DomainReader;
  now: string;
}): Promise<DeliveryNoteSubmitPreview | null> {
  if (input.document.doctype !== "Delivery Note") return null;
  if (input.document.docstatus !== 0) throw errors.lifecycle("Only a draft Delivery Note can be previewed for submission");

  const existing = input.document as CanonicalDocument<DeliveryNoteData>;
  const command: MutationCommand<DeliveryNoteData> = {
    schema_version: 1,
    command_id: `preview:${input.tenantId}:${existing.name}:${existing.version}`,
    tenant_id: input.tenantId,
    aggregate: { doctype: "Delivery Note", name: existing.name },
    action: "submit",
    expected_version: existing.version,
    payload_hash: "0".repeat(64),
    actor: input.actor,
    document: existing.data,
  };
  const plan = await new DeliveryNoteController().buildPlan({
    command,
    existing,
    now: input.now,
    nextVersion: existing.version + 1,
    reader: input.reader,
  });

  const rows: Array<Record<string, unknown>> = [];
  let totalQty = 0;
  let totalCost = 0;
  for (const [index, item] of plan.document.data.items.entries()) {
    const rowId = String(item.row_id || index + 1);
    const source = String(item.sales_order ?? plan.document.data.against_sales_order ?? "");
    const allocations = Array.isArray(item.fifo_allocations) ? item.fifo_allocations : [];
    if (allocations.length) {
      for (const allocation of allocations) {
        rows.push({
          sales_order: source || "—",
          sales_order_row: item.sales_order_row_id ?? "—",
          item_code: item.item_code,
          warehouse: item.warehouse ?? "—",
          inventory_layer: allocation.batch_no ?? allocation.serial_no
            ?? [allocation.source_voucher_type, allocation.source_voucher_no, allocation.source_line_key].filter(Boolean).join(" · "),
          received_at: allocation.posting_at,
          qty: micros(allocation.qty_micros),
          unit_cost: money(allocation.valuation_rate_minor, plan.document.data.currency_scale ?? 2),
          cost: money(allocation.value_minor, plan.document.data.currency_scale ?? 2),
        });
        totalQty += allocation.qty_micros;
        totalCost += allocation.value_minor;
      }
      continue;
    }

    const stockRows = plan.stock_entries.filter((entry) => entry.actual_qty_micros < 0
      && (entry.line_key === `ITEM-${rowId}` || entry.line_key.startsWith(`ITEM-${rowId}-`)));
    for (const entry of stockRows) {
      rows.push(stockPreviewRow(plan.document.data, item, source, entry));
      totalQty += -entry.actual_qty_micros;
      totalCost += -entry.stock_value_difference_minor;
    }
  }

  const sources = new Set(plan.document.data.items.map((item) => item.sales_order ?? plan.document.data.against_sales_order).filter(Boolean));
  const warnings = [
    "Bản xem trước không giữ chỗ tồn. Khi xác nhận, máy chủ tính lại FIFO và chốt tồn + tiến độ từng dòng Đơn bán trong cùng giao dịch.",
  ];
  const postingDate = String(plan.document.data.posting_at ?? "").slice(0, 10);
  if (postingDate && postingDate < input.now.slice(0, 10)) warnings.push("Phiếu có ngày hạch toán lùi; FIFO được phát lại đến đúng ngày phiếu.");

  return {
    kind: "delivery_note_fifo",
    title: `Xem nguồn bán và lớp FIFO trước khi gửi ${existing.name}`,
    description: "Giá bán giữ theo từng Đơn bán nguồn; giá vốn lấy riêng từ sổ kho FIFO.",
    confirmation_label: "Gửi phiếu giao",
    warnings,
    columns: [
      { key: "sales_order", label: "Đơn bán" },
      { key: "sales_order_row", label: "Dòng đơn" },
      { key: "item_code", label: "Mặt hàng" },
      { key: "warehouse", label: "Kho" },
      { key: "inventory_layer", label: "Lớp tồn / lô" },
      { key: "received_at", label: "Ngày lớp" },
      { key: "qty", label: "Số xuất", align: "right" },
      { key: "unit_cost", label: "Giá vốn/đv", align: "right" },
      { key: "cost", label: "Giá vốn", align: "right" },
    ],
    rows,
    summary: [
      { label: "Đơn bán nguồn", value: String(sources.size) },
      { label: "Dòng giao", value: String(plan.document.data.items.length) },
      { label: "Lớp FIFO", value: String(rows.length) },
      { label: "Tổng số xuất", value: micros(totalQty) },
      { label: "Tổng giá vốn", value: money(totalCost, plan.document.data.currency_scale ?? 2) },
    ],
  };
}

function stockPreviewRow(data: DeliveryNoteData, item: SalesItem, source: string, entry: StockLedgerEntry): Record<string, unknown> {
  return {
    sales_order: source || "—",
    sales_order_row: item.sales_order_row_id ?? "—",
    item_code: item.item_code,
    warehouse: item.warehouse ?? "—",
    inventory_layer: entry.batch_no ?? "Bình quân di động",
    received_at: "—",
    qty: micros(-entry.actual_qty_micros),
    unit_cost: money(entry.valuation_rate_minor, data.currency_scale ?? 2),
    cost: money(-entry.stock_value_difference_minor, data.currency_scale ?? 2),
  };
}

function micros(value: number): string {
  const formatted = fromScaledInt(Math.round(value), 6);
  return formatted.includes(".") ? formatted.replace(/\.?0+$/, "") : formatted;
}

function money(value: number, scale: number): string {
  return fromScaledInt(Math.round(value), scale);
}
