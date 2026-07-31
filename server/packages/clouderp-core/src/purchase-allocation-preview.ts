import type { Actor, CanonicalDocument, JsonObject, MutationCommand } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import {
  activePurchaseAllocationReader,
  type DomainReader,
} from "../../document-kernel/src/index.js";
import { fromScaledInt } from "../../money/src/index.js";
import { AllocatingPurchaseReceiptController } from "./purchase-allocation-controllers.js";
import type { PurchaseItem, PurchaseReceiptData } from "./types.js";

export interface SubmitPreviewColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

export interface SubmitPreviewSummary {
  label: string;
  value: string;
}

export interface PurchaseReceiptSubmitPreviewRow {
  receipt_row: string;
  item_code: string;
  destination: string;
  destination_row: string | null;
  allocation_kind: "FIFO" | "Chưa phân bổ";
  qty: string;
  barem_weight_kg: string;
  actual_weight_kg: string | null;
}

export interface PurchaseReceiptSubmitPreview {
  kind: "purchase_receipt_fifo";
  title: string;
  description: string;
  confirmation_label: string;
  warnings: string[];
  columns: SubmitPreviewColumn[];
  rows: PurchaseReceiptSubmitPreviewRow[];
  summary: SubmitPreviewSummary[];
}

export interface PurchaseReceiptSubmitPreviewInput {
  tenantId: string;
  actor: Actor;
  document: CanonicalDocument<JsonObject>;
  reader: DomainReader;
  now: string;
}

/**
 * Builds the exact submit plan without executing it, then projects only the rows an
 * operator needs to review. The real submit runs the same controller again under the
 * supplier Durable Object and re-checks revisions, so this preview can never become a
 * second source of allocation truth.
 */
export async function previewPurchaseReceiptSubmission(
  input: PurchaseReceiptSubmitPreviewInput,
): Promise<PurchaseReceiptSubmitPreview | null> {
  if (input.document.doctype !== "Purchase Receipt") return null;
  if (input.document.docstatus !== 0) {
    throw errors.lifecycle("Only a draft Purchase Receipt can be previewed for submission");
  }
  const reader = await activePurchaseAllocationReader(input.reader, input.tenantId);
  if (!reader) return null;

  const existing = input.document as CanonicalDocument<PurchaseReceiptData>;
  const command: MutationCommand<PurchaseReceiptData> = {
    schema_version: 1,
    command_id: `preview:${input.tenantId}:${existing.name}:${existing.version}`,
    tenant_id: input.tenantId,
    aggregate: { doctype: "Purchase Receipt", name: existing.name },
    action: "submit",
    expected_version: existing.version,
    payload_hash: "0".repeat(64),
    actor: input.actor,
    document: existing.data,
  };
  const plan = await new AllocatingPurchaseReceiptController().buildPlan({
    command,
    existing,
    now: input.now,
    nextVersion: existing.version + 1,
    reader,
  });

  const itemByRow = new Map<string, PurchaseItem>();
  for (const [index, item] of plan.document.data.items.entries()) {
    itemByRow.set(String(item.row_id ?? `ROW-${index + 1}`), item);
  }

  const rows: PurchaseReceiptSubmitPreviewRow[] = [];
  let allocatedQty = 0;
  let unappliedQty = 0;
  let baremWeight = 0;
  let actualWeight = 0;
  let hasActualWeight = false;

  for (const entry of plan.purchase_allocation_entries ?? []) {
    if (entry.qty_micros <= 0 || entry.entry_kind === "reverse") continue;
    const rowId = String(entry.receipt_item_row_id);
    const item = itemByRow.get(rowId);
    rows.push({
      receipt_row: rowId,
      item_code: String(item?.item_code ?? ""),
      destination: entry.purchase_order,
      destination_row: entry.purchase_order_item_row_id ?? null,
      allocation_kind: "FIFO",
      qty: micros(entry.qty_micros),
      barem_weight_kg: micros(entry.barem_weight_micros),
      actual_weight_kg: optionalMicros(entry.projected_actual_weight_micros),
    });
    allocatedQty += entry.qty_micros;
    baremWeight += entry.barem_weight_micros;
    if (entry.projected_actual_weight_micros !== undefined) {
      actualWeight += entry.projected_actual_weight_micros;
      hasActualWeight = true;
    }
  }

  for (const entry of plan.purchase_unapplied_entries ?? []) {
    if (entry.qty_micros <= 0 || entry.entry_kind !== "receive") continue;
    const rowId = String(entry.receipt_item_row_id);
    const item = itemByRow.get(rowId);
    rows.push({
      receipt_row: rowId,
      item_code: String(item?.item_code ?? ""),
      destination: "Chờ PO tiếp theo trong cửa sổ",
      destination_row: null,
      allocation_kind: "Chưa phân bổ",
      qty: micros(entry.qty_micros),
      barem_weight_kg: micros(entry.barem_weight_micros ?? 0),
      actual_weight_kg: optionalMicros(entry.projected_actual_weight_micros),
    });
    unappliedQty += entry.qty_micros;
    baremWeight += entry.barem_weight_micros ?? 0;
    if (entry.projected_actual_weight_micros !== undefined) {
      actualWeight += entry.projected_actual_weight_micros;
      hasActualWeight = true;
    }
  }

  const warnings: string[] = [];
  const postingDate = String(plan.document.data.posting_at ?? "").slice(0, 10);
  const previewDate = input.now.slice(0, 10);
  if (postingDate && postingDate < previewDate) {
    warnings.push(
      `Ngày hạch toán ${postingDate} lùi trước ngày hiện tại ${previewDate}; FIFO vẫn theo thứ tự commit, không xếp lại lịch sử.`,
    );
  }
  if (unappliedQty > 0) {
    warnings.push(
      `${micros(unappliedQty)} đơn vị chưa có nghĩa vụ PO và sẽ được giữ trong cửa sổ để tự áp khi PO phù hợp mở sau.`,
    );
  }

  return {
    kind: "purchase_receipt_fifo",
    title: `Xem phân bổ FIFO trước khi gửi ${existing.name}`,
    description: "Bản xem trước dùng đúng controller submit. Khi xác nhận, server vẫn khóa theo nhà cung cấp và kiểm tra lại revision trước khi ghi.",
    confirmation_label: "Gửi phiếu nhập",
    warnings,
    columns: [
      { key: "receipt_row", label: "Dòng phiếu" },
      { key: "item_code", label: "Mặt hàng" },
      { key: "destination", label: "Đích phân bổ" },
      { key: "allocation_kind", label: "Trạng thái" },
      { key: "qty", label: "Số lượng", align: "right" },
      { key: "barem_weight_kg", label: "Kg barem", align: "right" },
      { key: "actual_weight_kg", label: "Kg thực tế", align: "right" },
    ],
    rows,
    summary: [
      { label: "Tổng nhận", value: micros(allocatedQty + unappliedQty) },
      { label: "Đã phân bổ", value: micros(allocatedQty) },
      { label: "Chưa phân bổ", value: micros(unappliedQty) },
      { label: "Kg barem", value: micros(baremWeight) },
      ...(hasActualWeight ? [{ label: "Kg thực tế", value: micros(actualWeight) }] : []),
    ],
  };
}

function micros(value: number): string {
  const formatted = fromScaledInt(Math.round(value), 6);
  const separator = formatted.indexOf(".");
  if (separator < 0) return formatted;
  const whole = formatted.slice(0, separator);
  const fraction = formatted.slice(separator + 1);
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function optionalMicros(value: number | undefined): string | null {
  return value === undefined ? null : micros(value);
}
