import type { Doc, DocTypeMeta, ListOpts } from "@metaforge/core";
import { buildServerQuery, type ListState } from "../filters.js";
import type { ListColumn } from "../columns.js";
import type { ListRuntimePolicy } from "./contract.js";

const INITIAL_WIDTHS: Record<string, number> = {
  name: 132, customer: 132, transaction_date: 104, delivery_date: 108, delivered_percentage: 98, grand_total: 124,
};

function pendingApproval(row: Doc): boolean {
  const flagged = row.discount_requires_approval === true || row.discount_requires_approval === 1 || row.discount_requires_approval === "1";
  return Number(row.docstatus ?? 0) === 0 && flagged;
}

function columns(_meta: DocTypeMeta, derived: ListColumn[]): ListColumn[] {
  const customer = derived.find((column) => column.fieldname === "customer");
  const order: ListColumn = {
    fieldname: "name", label: "Mã đơn hàng", fieldtype: "Data", align: "left",
    isStatus: false, isTitle: true, isImage: false, defaultWidth: 132, minWidth: 112,
  };
  const base = [order, ...(customer ? [{ ...customer, isTitle: false, isImage: false }] : []), ...derived.filter((c) => c.fieldname !== "name" && c.fieldname !== "customer")]
    .map((column) => {
      const width = INITIAL_WIDTHS[column.fieldname];
      return width === undefined ? column : { ...column, defaultWidth: width, minWidth: Math.min(column.minWidth, width) };
    });
  const deliveryStatus: ListColumn = {
    fieldname: "_delivery_status", label: "Trạng thái giao", fieldtype: "Select", align: "center",
    isStatus: true, isTitle: false, isImage: false, defaultWidth: 126, minWidth: 116,
  };
  const approvalStatus: ListColumn = {
    fieldname: "_approval_status", label: "Trạng thái duyệt", fieldtype: "Select", align: "center",
    isStatus: true, isTitle: false, isImage: false, defaultWidth: 132, minWidth: 120,
  };
  const progress = base.find((column) => column.fieldname === "delivered_percentage");
  if (!progress) return [...base, deliveryStatus, approvalStatus];
  const remaining = base.filter((column) => column.fieldname !== "delivered_percentage");
  const deliveryDateIndex = remaining.findIndex((column) => column.fieldname === "delivery_date");
  const at = deliveryDateIndex < 0 ? remaining.length : deliveryDateIndex;
  return [...remaining.slice(0, at), deliveryStatus, approvalStatus, progress, ...remaining.slice(at)];
}

function rows(source: Doc[]): Doc[] {
  return source.map((row) => {
    const delivered = Number(row.delivered_percentage ?? 0);
    const flagged = row.discount_requires_approval === true || row.discount_requires_approval === 1 || row.discount_requires_approval === "1";
    return {
      ...row,
      _delivery_status: delivered >= 100 ? "Hoàn thành" : delivered > 0 ? "Đang giao" : "Chưa giao",
      _approval_status: flagged ? (Number(row.docstatus ?? 0) === 0 ? "Cần duyệt" : "Đã duyệt") : "Không cần duyệt",
    };
  });
}

function query(meta: DocTypeMeta, state: ListState, baseColumns: ListColumn[]): ListOpts {
  const approval = state.filters._approval_status;
  const filters = Object.fromEntries(Object.entries(state.filters).filter(([field]) => field !== "_approval_status"));
  const sort = state.sort.replace(/^_delivery_status(?=:|$)/, "delivered_percentage").replace(/^_approval_status(?=:|$)/, "docstatus");
  const result = buildServerQuery(meta, { ...state, sort, filters }, baseColumns);
  const hasFlag = meta.fields.some((field) => field.fieldname === "discount_requires_approval");
  if (hasFlag && approval) {
    const extra: Array<[string, "=", unknown]> = approval === "Cần duyệt"
      ? [["discount_requires_approval", "=", 1], ["docstatus", "=", 0]]
      : approval === "Đã duyệt" ? [["discount_requires_approval", "=", 1], ["docstatus", "=", 1]]
      : [["discount_requires_approval", "=", 0]];
    result.filters = Array.isArray(result.filters)
      ? [...result.filters, ...extra]
      : { ...(result.filters ?? {}), ...Object.fromEntries(extra.map(([field, , value]) => [field, value])) };
  }
  return hasFlag ? { ...result, fields: [...new Set([...(result.fields ?? []), "discount_requires_approval"])] } : result;
}

export const salesOrderListPolicy: ListRuntimePolicy = {
  extraFilterFields: ["_approval_status"],
  centerContent: true,
  preferenceScopeSuffix: "sales-order-code-first-v1",
  columns,
  rows,
  buildQuery: (meta, state, baseColumns) => query(meta, state, baseColumns),
  canApprove: pendingApproval,
  warningRow: pendingApproval,
  approve: async (adapter, doctype, name) => {
    const { doc } = await adapter.getDoc(doctype, name);
    await adapter.submit(doc);
  },
};
