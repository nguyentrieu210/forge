import type { Doc } from "@metaforge/core";
import { FrappeAdapterImpl as BaseFrappeAdapterImpl } from "./frappe-adapter.js";

/**
 * Compatibility boundary for stock forms that still speak the public ERPNext field names.
 * The kernel stays strict on its canonical fields; translation happens before the request
 * leaves the client adapter so stale mobile forms cannot silently create non-posting docs.
 */
export class FrappeAdapterImpl extends BaseFrappeAdapterImpl {
  override async createDoc(dt: string, doc: Partial<Doc>): Promise<Doc> {
    if (dt === "Stock Entry") {
      return super.createDoc(dt, await this.normalizeStockEntry(doc));
    }
    if (dt === "Stock Reconciliation") {
      return super.createDoc(dt, await this.normalizeStockReconciliation(doc));
    }
    return super.createDoc(dt, doc);
  }

  private async normalizeStockEntry(doc: Partial<Doc>): Promise<Partial<Doc>> {
    const input = doc as Record<string, unknown>;
    const rawItems = Array.isArray(input.items) ? input.items : [];
    const hasLegacyRows = rawItems.some((row) => isRecord(row) && ("s_warehouse" in row || "t_warehouse" in row));
    const needsTranslation = input.posting_at === undefined
      && (input.posting_date !== undefined || hasLegacyRows || input.stock_entry_type !== undefined);
    if (!needsTranslation) return doc;

    const items = rawItems.map((row) => {
      if (!isRecord(row)) return row;
      const output = { ...row };
      if (output.source_warehouse === undefined && typeof output.s_warehouse === "string") {
        output.source_warehouse = output.s_warehouse;
      }
      if (output.target_warehouse === undefined && typeof output.t_warehouse === "string") {
        output.target_warehouse = output.t_warehouse;
      }
      delete output.s_warehouse;
      delete output.t_warehouse;
      return output;
    });

    const first = items.find(isRecord);
    const warehouse = first && typeof first.source_warehouse === "string"
      ? first.source_warehouse
      : first && typeof first.target_warehouse === "string"
        ? first.target_warehouse
        : "";
    const company = typeof input.company === "string" && input.company.trim()
      ? input.company.trim()
      : await this.companyForWarehouse(warehouse);
    const postingDate = typeof input.posting_date === "string" ? input.posting_date.trim() : "";
    const purpose = typeof input.purpose === "string" && input.purpose.trim()
      ? input.purpose.trim()
      : typeof input.stock_entry_type === "string"
        ? input.stock_entry_type.trim()
        : "";

    const output: Record<string, unknown> = {
      ...input,
      company,
      purpose,
      posting_at: postingDate ? `${postingDate} 12:00:00` : input.posting_at,
      items,
    };
    if (output.note === undefined && typeof input.remarks === "string") output.note = input.remarks;
    delete output.posting_date;
    delete output.stock_entry_type;
    delete output.remarks;
    return output as Partial<Doc>;
  }

  private async normalizeStockReconciliation(doc: Partial<Doc>): Promise<Partial<Doc>> {
    const input = doc as Record<string, unknown>;
    const rawItems = Array.isArray(input.items) ? input.items : [];
    const firstInput = rawItems.find(isRecord);
    const needsTranslation = input.snapshot_at === undefined
      && (input.posting_date !== undefined || (firstInput !== undefined && firstInput.counted_qty === undefined && firstInput.qty !== undefined));
    if (!needsTranslation) return doc;

    const warehouse = typeof input.warehouse === "string" && input.warehouse.trim()
      ? input.warehouse.trim()
      : firstInput && typeof firstInput.warehouse === "string"
        ? firstInput.warehouse.trim()
        : "";
    const itemCode = typeof input.item_code === "string" && input.item_code.trim()
      ? input.item_code.trim()
      : firstInput && typeof firstInput.item_code === "string"
        ? firstInput.item_code.trim()
        : "";
    const postingDate = typeof input.posting_date === "string" ? input.posting_date.trim() : "";
    const boot = await this.getBoot();
    const fallbackNote = typeof input.remarks === "string" && input.remarks.trim()
      ? input.remarks.trim()
      : "Kiểm kho từ app Alumdoor Kho";

    const items = rawItems.map((row) => {
      if (!isRecord(row)) return row;
      const output = { ...row };
      if (output.counted_qty === undefined && output.qty !== undefined) output.counted_qty = output.qty;
      if (output.variance_reason === undefined) output.variance_reason = "Khác";
      if (output.variance_note === undefined) output.variance_note = fallbackNote;
      delete output.qty;
      delete output.warehouse;
      return output;
    });

    const output: Record<string, unknown> = {
      ...input,
      warehouse,
      scope: typeof input.scope === "string" && input.scope.trim() ? input.scope : "Một mặt hàng",
      item_code: itemCode,
      snapshot_at: postingDate ? `${postingDate} 12:00:00` : input.snapshot_at,
      counted_by: typeof input.counted_by === "string" && input.counted_by.trim() ? input.counted_by : boot.user,
      items,
    };
    if (output.note === undefined) output.note = fallbackNote;
    delete output.posting_date;
    delete output.purpose;
    delete output.remarks;
    return output as Partial<Doc>;
  }

  private async companyForWarehouse(warehouse: string): Promise<string> {
    if (!warehouse) throw new Error("Warehouse is required to resolve Stock Entry company");
    const { doc } = await this.getDoc("Warehouse", warehouse);
    const company = typeof doc.company === "string" ? doc.company.trim() : "";
    if (company) return company;

    const companies = await this.getList("Company", { fields: ["name"], pageLength: 2 });
    if (companies.length === 1 && typeof companies[0]?.name === "string") return companies[0].name;
    throw new Error(`Warehouse ${warehouse} must define company`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
