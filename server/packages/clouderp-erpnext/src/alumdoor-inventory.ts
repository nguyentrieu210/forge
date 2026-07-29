import type {
  CanonicalDocument, ChildRow, JsonObject, MutationPlan, StockBundleUsageEntry, StockLedgerEntry,
} from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { reverseStock } from "../../ledger/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import { buildTrackedStockLines, normalizeBundleRows } from "../../clouderp-stock/src/index.js";
import type { SerialBatchBundleData } from "../../clouderp-stock/src/index.js";

interface AlumdoorLedgers {
  stock?: StockLedgerEntry[];
  bundleUsages?: StockBundleUsageEntry[];
}

interface CutOrderItem extends JsonObject {
  row_id?: string;
  serial_and_batch_bundle: string;
  offcut_bundle?: string;
  item_code: string;
  source_warehouse?: string;
  source_length_m: string | number;
  cut_width_m: string | number;
  sheets_cut: string | number;
  cuts_count?: number;
  kerf_total_m?: string;
  kg_consumed?: string;
  kg_consumed_micros?: number;
  kg_weighed?: string | number;
  offcut_length_m?: string;
  scrap_m?: string;
  stock_value_consumed_minor?: number;
  offcut_stock_value_minor?: number;
  cut_product_value_minor?: number;
  offcut_weight_micros?: number;
  cut_product_weight_micros?: number;
}

interface CutOrderData extends JsonObject {
  cut_on: string;
  cutting_policy: string;
  items: CutOrderItem[];
  company?: string;
  currency?: string;
  currency_scale?: number;
  cut_state?: string;
  cancel_reason?: string;
}

interface StockReservationData extends JsonObject {
  item_code: string;
  color?: string;
  condition?: string;
  min_length_m: string | number;
  warehouse?: string;
  qty_reserved: string | number;
  source_doctype: string;
  source_name: string;
  reserved_at?: string;
  expires_at?: string;
  state?: string;
  released_reason?: string;
}

interface ReconciliationItem extends JsonObject {
  row_id?: string;
  item_code: string;
  batch_no?: string;
  serial_and_batch_bundle?: string;
  book_qty?: string | number;
  book_qty_micros?: number;
  book_weight_kg?: string | number;
  book_weight_micros?: number | null;
  book_stock_value_minor?: number;
  counted_qty: string | number;
  counted_weight_kg?: string | number;
  variance_qty?: string;
  variance_qty_micros?: number;
  variance_weight_kg?: string;
  variance_weight_micros?: number | null;
  variance_reason?: string;
  variance_note?: string;
  valuation_rate?: string | number;
  valuation_rate_minor?: number;
}

interface StockReconciliationData extends JsonObject {
  warehouse: string;
  scope: string;
  item_group?: string;
  item_code?: string;
  snapshot_at: string;
  counted_by: string;
  witnessed_by?: string;
  items: ReconciliationItem[];
  recon_state?: string;
  cancel_reason?: string;
  company?: string;
  currency?: string;
  currency_scale?: number;
}

abstract class AlumdoorController<T extends JsonObject> implements DocumentController<T> {
  abstract readonly doctype: string;
  abstract normalize(context: ControllerContext<T>): Promise<T>;
  abstract ledger(context: ControllerContext<T>, data: T): Promise<AlumdoorLedgers>;

  protected docstatus(context: ControllerContext<T>): 0 | 1 | 2 {
    return nextDocStatus(context.command.action);
  }

  protected status(context: ControllerContext<T>, _data: T): string {
    const docstatus = this.docstatus(context);
    return docstatus === 0 ? "Draft" : docstatus === 1 ? "Submitted" : "Cancelled";
  }

  async buildPlan(context: ControllerContext<T>): Promise<MutationPlan<T>> {
    const data = context.command.action === "cancel"
      ? {
          ...structuredClone(requireExisting(context).data),
          ...(typeof context.command.document.cancel_reason === "string"
            ? { cancel_reason: context.command.document.cancel_reason }
            : {}),
          ...(typeof context.command.document.note === "string" ? { note: context.command.document.note } : {}),
        } as T
      : await this.normalize(context);
    const ledgers = await this.ledger(context, data);
    const docstatus = this.docstatus(context);
    const status = this.status(context, data);
    const document: CanonicalDocument<T> = {
      tenant_id: context.command.tenant_id,
      doctype: this.doctype,
      name: context.command.aggregate.name,
      owner: context.existing?.owner ?? context.command.actor.user_id,
      docstatus,
      status,
      version: context.nextVersion,
      created_at: context.existing?.created_at ?? context.now,
      modified_at: context.now,
      data,
      children: extractChildren(this.doctype, data),
    };
    return {
      command: context.command,
      document,
      gl_entries: [],
      stock_entries: ledgers.stock ?? [],
      payment_entries: [],
      fulfillment_entries: [],
      stock_bundle_usages: ledgers.bundleUsages ?? [],
      events: [domainEvent({
        type: `alumdoor.${slug(this.doctype)}.${context.command.action}`,
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: { status },
      })],
      result: { doctype: this.doctype, name: document.name, version: document.version, docstatus, status },
    };
  }
}

export class CutOrderController extends AlumdoorController<CutOrderData> {
  readonly doctype = "Cut Order";

  async normalize(context: ControllerContext<CutOrderData>): Promise<CutOrderData> {
    const input = context.command.document;
    if (!input.cut_on || !input.cutting_policy || !Array.isArray(input.items) || input.items.length === 0) {
      throw errors.validation("Thời điểm cắt, công thức cửa và ít nhất một dòng cắt là bắt buộc");
    }
    if (input.cut_on > context.now) throw errors.validation("Thời điểm cắt không được ở tương lai");
    if (!await context.reader.hasMasterRecord(context.command.tenant_id, "Cutting Policy", input.cutting_policy)) {
      throw errors.reference(`Công thức cửa ${input.cutting_policy} không tồn tại hoặc đã ngừng dùng`);
    }

    let company = "";
    let currency = "";
    let currencyScale = 2;
    const items: CutOrderItem[] = [];
    for (const [index, source] of input.items.entries()) {
      const row = await normalizeCutRow(context, source, index);
      const rowCompany = await companyForWarehouse(context, row.source_warehouse!);
      if (company && company !== rowCompany.company) {
        throw errors.validation("Một phiếu cắt không được lấy hàng từ kho thuộc nhiều công ty");
      }
      if (currency && currency !== rowCompany.currency) {
        throw errors.validation("Một phiếu cắt không được trộn nhiều tiền tệ công ty");
      }
      company = rowCompany.company;
      currency = rowCompany.currency;
      currencyScale = rowCompany.currencyScale;
      items.push(row);
    }
    if (context.command.action === "submit") {
      await assertCutDoesNotConsumeOtherReservations(context, input, items);
    }
    await assertUnlocked(context, company, input.cut_on);
    return {
      ...input,
      company,
      currency,
      currency_scale: currencyScale,
      items,
      cut_state: context.command.action === "submit" ? "Đã cắt" : String(input.cut_state ?? "Nháp"),
    };
  }

  async ledger(context: ControllerContext<CutOrderData>, data: CutOrderData): Promise<AlumdoorLedgers> {
    if (context.command.action === "cancel") {
      if (!data.cancel_reason) throw errors.validation("Phải chọn lý do hoàn cắt");
      data.cut_state = "Đã hoàn cắt";
      const original = await context.reader.getVoucherStockEntries(
        context.command.tenant_id, this.doctype, context.command.aggregate.name, context.existing!.version,
      );
      return {
        stock: reverseStock(original),
        bundleUsages: await reverseBundleUsages(context, data.items, data.cut_on),
      };
    }
    if (context.command.action !== "submit") return {};
    const stock: StockLedgerEntry[] = [];
    const bundleUsages: StockBundleUsageEntry[] = [];
    for (const [index, item] of data.items.entries()) {
      const qty = toScaledInt(item.sheets_cut, 6, `items[${index}].sheets_cut`);
      const consumedWeight = item.kg_consumed_micros;
      const outward = await buildTrackedStockLines(context as unknown as ControllerContext<JsonObject>, {
        itemCode: item.item_code,
        warehouse: item.source_warehouse!,
        qtyMicros: qty,
        ...(consumedWeight == null ? {} : { weightMicros: consumedWeight }),
        direction: "Outward",
        postingAt: data.cut_on,
        currency: data.currency!,
        currencyScale: data.currency_scale ?? 2,
        valuationRateMinor: 0,
        stockValueMinor: 0,
        lineKey: `CUT-${item.row_id ?? index + 1}`,
        bundleName: item.serial_and_batch_bundle,
      });
      stock.push(...outward.stock);
      bundleUsages.push(...outward.usages);
      item.stock_value_consumed_minor = outward.stockValueMinor;

      const sourceLength = toScaledInt(item.source_length_m, 6);
      const offcutLength = toScaledInt(item.offcut_length_m ?? "0", 6);
      const offcutValue = offcutLength > 0 ? mulDiv(outward.stockValueMinor, offcutLength, sourceLength) : 0;
      const offcutWeight = consumedWeight == null || offcutLength <= 0
        ? 0
        : mulDiv(consumedWeight, offcutLength, sourceLength);
      item.offcut_stock_value_minor = offcutValue;
      item.cut_product_value_minor = outward.stockValueMinor - offcutValue;
      item.offcut_weight_micros = offcutWeight;
      item.cut_product_weight_micros = consumedWeight == null ? 0 : consumedWeight - offcutWeight;

      if (item.offcut_bundle) {
        const bundle = await requireSubmittedBundle(context, item.offcut_bundle);
        const incoming = await buildTrackedStockLines(context as unknown as ControllerContext<JsonObject>, {
          itemCode: item.item_code,
          warehouse: bundle.warehouse,
          qtyMicros: qty,
          ...(consumedWeight == null ? {} : { weightMicros: offcutWeight }),
          direction: "Inward",
          postingAt: data.cut_on,
          currency: data.currency!,
          currencyScale: data.currency_scale ?? 2,
          valuationRateMinor: qty ? mulDiv(offcutValue, 1_000_000, qty) : 0,
          stockValueMinor: offcutValue,
          lineKey: `OFFCUT-${item.row_id ?? index + 1}`,
          bundleName: item.offcut_bundle,
        });
        stock.push(...incoming.stock);
        bundleUsages.push(...incoming.usages);
      }
    }
    return { stock, bundleUsages };
  }

  protected status(context: ControllerContext<CutOrderData>, data: CutOrderData): string {
    return context.command.action === "cancel"
      ? "Đã hoàn cắt"
      : nextDocStatus(context.command.action) === 1 ? "Đã cắt" : String(data.cut_state ?? "Nháp");
  }
}

export class StockReservationController extends AlumdoorController<StockReservationData> {
  readonly doctype = "Stock Reservation";

  protected docstatus(_context: ControllerContext<StockReservationData>): 0 {
    return 0;
  }

  async normalize(context: ControllerContext<StockReservationData>): Promise<StockReservationData> {
    const input = context.command.document;
    if (!input.item_code || !input.source_doctype || !input.source_name) {
      throw errors.validation("Mã nhôm và chứng từ nguồn là bắt buộc");
    }
    if (!["Sales Order", "Work Order", "Production Order", "Cut Order"].includes(input.source_doctype)) {
      throw errors.validation("Loại chứng từ nguồn giữ chỗ không hợp lệ");
    }
    const item = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", input.item_code);
    if (!item) throw errors.reference(`Mặt hàng ${input.item_code} không tồn tại hoặc đã ngừng dùng`);
    if (!(item.has_batch_no === true || item.has_batch_no === 1)) {
      throw errors.validation("Giữ chỗ theo khổ chỉ áp dụng cho mặt hàng theo lô");
    }
    const minLength = toScaledInt(input.min_length_m, 6, "min_length_m");
    const qty = toScaledInt(input.qty_reserved, 6, "qty_reserved");
    if (minLength <= 0 || qty <= 0) throw errors.validation("Khổ tối thiểu và số lượng giữ phải lớn hơn 0");
    const source = await context.reader.getDocument(context.command.tenant_id, input.source_doctype, input.source_name);
    if (!source) throw errors.reference(`${input.source_doctype} ${input.source_name} không tồn tại`);
    if (input.warehouse) await requireMainWarehouse(context, input.warehouse);

    const reservedAt = input.reserved_at || context.now;
    if (input.expires_at && input.expires_at <= reservedAt) {
      throw errors.validation("Thời hạn giữ phải sau thời điểm bắt đầu giữ");
    }
    const existing = context.existing;
    if (existing && ["Đã dùng", "Đã nhả", "Hết hạn"].includes(String(existing.data.state))) {
      throw errors.lifecycle("Phiếu giữ chỗ đã kết thúc và không thể sửa");
    }
    const desiredState = input.state ?? existing?.data.state ?? "Đang giữ";
    if (desiredState === "Đã nhả") {
      if (!input.released_reason) throw errors.validation("Phải nhập lý do nhả giữ chỗ");
      return { ...existing?.data, ...input, state: "Đã nhả", reserved_at: reservedAt };
    }
    if (desiredState === "Hết hạn") {
      const isScheduler = context.command.actor.user_id === "Administrator"
        || context.command.actor.roles.includes("System Manager");
      if (!isScheduler || !input.expires_at || input.expires_at > context.now) {
        throw errors.permission("Chỉ tác vụ hệ thống được chuyển phiếu giữ chỗ đã quá hạn");
      }
      return { ...existing?.data, ...input, state: "Hết hạn", reserved_at: reservedAt };
    }
    if (!["Đang giữ", "Đã dùng"].includes(desiredState)) {
      throw errors.validation("Trạng thái giữ chỗ không hợp lệ");
    }
    if (desiredState === "Đang giữ") {
      const availability = await reservationAvailability(context, {
        ...input,
        min_length_m: fromScaledInt(minLength, 6),
        qty_reserved: fromScaledInt(qty, 6),
      }, context.command.aggregate.name);
      if (qty > availability.availableMicros) {
        throw errors.reference(
          `Chỉ còn ${fromScaledInt(availability.availableMicros, 6)} lá khổ ≥ ${fromScaledInt(minLength, 6)} m khả dụng (tổng ${fromScaledInt(availability.totalMicros, 6)}, đã giữ ${fromScaledInt(availability.reservedMicros, 6)}) — không giữ được ${fromScaledInt(qty, 6)}`,
          {
            total_qty_micros: availability.totalMicros,
            reserved_qty_micros: availability.reservedMicros,
            available_qty_micros: availability.availableMicros,
            requested_qty_micros: qty,
          },
        );
      }
    }
    return {
      ...input,
      min_length_m: fromScaledInt(minLength, 6),
      qty_reserved: fromScaledInt(qty, 6),
      reserved_at: reservedAt,
      state: desiredState,
    };
  }

  async ledger(): Promise<AlumdoorLedgers> {
    return {};
  }

  protected status(_context: ControllerContext<StockReservationData>, data: StockReservationData): string {
    return String(data.state ?? "Đang giữ");
  }
}

export class StockReconciliationController extends AlumdoorController<StockReconciliationData> {
  readonly doctype = "Stock Reconciliation";

  async normalize(context: ControllerContext<StockReconciliationData>): Promise<StockReconciliationData> {
    const input = context.command.document;
    if (!input.warehouse || !input.scope || !input.snapshot_at || !input.counted_by || !Array.isArray(input.items)) {
      throw errors.validation("Kho, phạm vi, thời điểm chốt, người đếm và dòng kiểm kê là bắt buộc");
    }
    if (input.snapshot_at > context.now) throw errors.validation("Thời điểm chốt sổ không được ở tương lai");
    if (input.witnessed_by && input.witnessed_by === input.counted_by) {
      throw errors.validation("Người chứng kiến phải khác người đếm");
    }
    if (input.scope === "Theo nhóm hàng" && !input.item_group) throw errors.validation("Phải chọn nhóm hàng cần kiểm kê");
    if (["Theo mã hàng", "Một mặt hàng"].includes(input.scope) && !input.item_code) {
      throw errors.validation("Phải chọn mặt hàng cần kiểm kê");
    }
    const companyInfo = await companyForWarehouse(context, input.warehouse);
    await assertUnlocked(context, companyInfo.company, input.snapshot_at);
    if (context.command.action === "submit") {
      assertReconciliationApprover(context, input.counted_by);
      if (!context.existing || context.existing.docstatus !== 0) throw errors.lifecycle("Chỉ phiếu kiểm kê nháp mới được ghi sổ");
    }

    const normalized: ReconciliationItem[] = [];
    for (const [index, source] of input.items.entries()) {
      if (!source.item_code) throw errors.validation(`Dòng ${index + 1} thiếu mã hàng`);
      const item = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", source.item_code);
      if (!item) throw errors.reference(`Mặt hàng ${source.item_code} không tồn tại`);
      const countedQty = toScaledInt(source.counted_qty, 6, `items[${index}].counted_qty`);
      if (countedQty < 0) throw errors.validation(`Số đếm không được âm ở dòng ${index + 1}`);
      const isCatchWeight = item.has_catch_weight === true || item.has_catch_weight === 1;
      const countedWeight = source.counted_weight_kg == null
        ? null
        : toScaledInt(source.counted_weight_kg, 6, `items[${index}].counted_weight_kg`);
      if (isCatchWeight && countedWeight == null) throw errors.validation(`Dòng ${source.item_code} phải nhập kg cân thực tế`);
      if (countedWeight != null && countedWeight < 0) throw errors.validation(`Kg đếm không được âm ở dòng ${index + 1}`);

      const snapshot = await context.reader.getTrackedStockState(
        context.command.tenant_id, source.item_code, input.warehouse, source.batch_no, input.snapshot_at,
      );
      const original = context.existing?.data.items[index];
      const bookQty = original?.book_qty_micros ?? snapshot.qty_micros;
      const bookWeight = original?.book_weight_micros ?? snapshot.weight_micros;
      const bookValue = original?.book_stock_value_minor ?? snapshot.stock_value_minor;
      if (context.command.action === "submit" && original) {
        if (source.book_qty_micros != null && source.book_qty_micros !== original.book_qty_micros) {
          throw errors.validation("Số sổ đã chụp không được sửa");
        }
        if (source.book_weight_micros !== undefined && source.book_weight_micros !== original.book_weight_micros) {
          throw errors.validation("Kg theo sổ đã chụp không được sửa");
        }
      }
      const varianceQty = countedQty - bookQty;
      const varianceWeight = countedWeight == null || bookWeight == null ? null : countedWeight - bookWeight;
      if ((varianceQty !== 0 || (varianceWeight != null && varianceWeight !== 0)) && !source.variance_reason) {
        throw errors.validation(`Dòng ${source.item_code} có chênh lệch — phải chọn nguyên nhân trước khi ghi sổ`);
      }
      if (source.variance_reason === "Khác" && !source.variance_note) {
        throw errors.validation(`Dòng ${source.item_code} chọn nguyên nhân Khác — phải nhập diễn giải`);
      }
      normalized.push({
        ...source,
        row_id: source.row_id || `ROW-${index + 1}`,
        book_qty: fromScaledInt(bookQty, 6),
        book_qty_micros: bookQty,
        ...(bookWeight == null ? {} : { book_weight_kg: fromScaledInt(bookWeight, 6) }),
        book_weight_micros: bookWeight,
        book_stock_value_minor: bookValue,
        counted_qty: fromScaledInt(countedQty, 6),
        ...(countedWeight == null ? {} : { counted_weight_kg: fromScaledInt(countedWeight, 6) }),
        variance_qty: fromScaledInt(varianceQty, 6),
        variance_qty_micros: varianceQty,
        ...(varianceWeight == null ? {} : { variance_weight_kg: fromScaledInt(varianceWeight, 6) }),
        variance_weight_micros: varianceWeight,
      });
    }
    return {
      ...input,
      company: companyInfo.company,
      currency: companyInfo.currency,
      currency_scale: companyInfo.currencyScale,
      items: normalized,
      recon_state: context.command.action === "submit" ? "Đã ghi sổ" : String(input.recon_state ?? "Đang đếm"),
    };
  }

  async ledger(context: ControllerContext<StockReconciliationData>, data: StockReconciliationData): Promise<AlumdoorLedgers> {
    if (context.command.action === "cancel") {
      throw errors.lifecycle("Phiếu kiểm kê đã ghi sổ là bất biến; sai thì phải lập phiếu kiểm kê mới");
    }
    if (context.command.action !== "submit") return {};
    const stock: StockLedgerEntry[] = [];
    const bundleUsages: StockBundleUsageEntry[] = [];
    for (const [index, item] of data.items.entries()) {
      const varianceQty = item.variance_qty_micros ?? 0;
      const varianceWeight = item.variance_weight_micros;
      if (varianceQty === 0 && (varianceWeight == null || varianceWeight === 0)) continue;
      if (varianceQty === 0) {
        if (!item.batch_no) {
          throw errors.validation(`Dòng ${item.item_code} chỉ lệch kg thì phải chỉ rõ lô cần điều chỉnh`);
        }
        if (item.serial_and_batch_bundle) {
          throw errors.validation(`Dòng ${item.item_code} chỉ lệch kg không dùng bundle vì số cây không thay đổi`);
        }
        stock.push({
          line_key: `RECON-WEIGHT-${item.row_id ?? index + 1}`,
          item_code: item.item_code,
          warehouse: data.warehouse,
          batch_no: item.batch_no,
          actual_qty_micros: 0,
          actual_weight_micros: varianceWeight!,
          valuation_rate_minor: 0,
          stock_value_difference_minor: 0,
          qty_scale: 6,
          currency_scale: data.currency_scale ?? 2,
          currency: data.currency!,
          posting_at: data.snapshot_at,
          allow_negative_stock: false,
        });
        continue;
      }
      const absoluteQty = Math.abs(varianceQty);
      const absoluteWeight = varianceWeight == null ? undefined : Math.abs(varianceWeight);
      const bookQty = item.book_qty_micros ?? 0;
      const bookValue = item.book_stock_value_minor ?? 0;
      const suppliedRate = item.valuation_rate_minor
        ?? (item.valuation_rate == null ? 0 : toScaledInt(item.valuation_rate, data.currency_scale ?? 2));
      const rate = bookQty > 0 ? mulDiv(Math.abs(bookValue), 1_000_000, bookQty) : suppliedRate;
      if (varianceQty > 0 && rate <= 0) {
        throw errors.validation(`Dòng ${item.item_code} thừa tồn nhưng chưa có giá vốn; phải nhập đơn giá điều chỉnh`);
      }
      const value = mulDiv(rate, absoluteQty, 1_000_000);
      if (item.batch_no && item.serial_and_batch_bundle) {
        const bundle = await requireSubmittedBundle(context, item.serial_and_batch_bundle);
        const batches = normalizeBundleRows(bundle.entries).map((row) => row.batch_no);
        if (batches.some((batch) => batch !== item.batch_no)) {
          throw errors.validation(`Bundle dòng ${item.item_code} phải chỉ chứa đúng lô ${item.batch_no}`);
        }
      }
      const tracked = await buildTrackedStockLines(context as unknown as ControllerContext<JsonObject>, {
        itemCode: item.item_code,
        warehouse: data.warehouse,
        qtyMicros: absoluteQty,
        ...(absoluteWeight == null ? {} : { weightMicros: absoluteWeight }),
        direction: varianceQty > 0 ? "Inward" : "Outward",
        postingAt: data.snapshot_at,
        currency: data.currency!,
        currencyScale: data.currency_scale ?? 2,
        valuationRateMinor: rate,
        stockValueMinor: value,
        lineKey: `RECON-${item.row_id ?? index + 1}`,
        ...(item.serial_and_batch_bundle ? { bundleName: item.serial_and_batch_bundle } : {}),
      });
      stock.push(...tracked.stock);
      bundleUsages.push(...tracked.usages);
    }
    return { stock, bundleUsages };
  }

  protected status(context: ControllerContext<StockReconciliationData>, data: StockReconciliationData): string {
    return nextDocStatus(context.command.action) === 1 ? "Đã ghi sổ" : String(data.recon_state ?? "Nháp");
  }
}

async function assertCutDoesNotConsumeOtherReservations(
  context: ControllerContext<CutOrderData>,
  input: CutOrderData,
  items: CutOrderItem[],
): Promise<void> {
  const reservations = await context.reader.listDocumentsByDoctype<StockReservationData>(
    context.command.tenant_id, "Stock Reservation",
  );
  const ownSources = new Set([
    context.command.aggregate.name,
    typeof input.so_reference === "string" ? input.so_reference : "",
  ].filter(Boolean));
  const active = reservations.filter((document) =>
    document.data.state === "Đang giữ"
    && (!document.data.expires_at || document.data.expires_at > context.now)
    && !ownSources.has(document.data.source_name));
  if (!active.length) return;

  interface CutReservationGroup {
    itemCode: string;
    warehouse: string;
    color: string;
    condition: string;
    cuts: Array<{ qtyMicros: number; sourceLengthMicros: number }>;
  }
  const groups = new Map<string, CutReservationGroup>();
  for (const [index, item] of items.entries()) {
    const warehouse = item.source_warehouse!;
    const warehouseData = await context.reader.getMasterRecordData(context.command.tenant_id, "Warehouse", warehouse);
    if (warehouseData?.stock_role !== "Kho chính") continue;
    const bundle = await requireSubmittedBundle(context, item.serial_and_batch_bundle);
    const firstBatch = normalizeBundleRows(bundle.entries)[0]?.batch_no;
    if (!firstBatch) throw errors.validation(`Dòng cắt ${index + 1} thiếu lô nguồn`);
    const batch = await context.reader.getMasterRecordData(context.command.tenant_id, "Batch", firstBatch);
    if (!batch) throw errors.reference(`Lô ${firstBatch} không tồn tại`);
    const color = String(batch.color ?? "");
    const condition = String(batch.condition ?? "");
    const key = `${item.item_code}\u0000${warehouse}\u0000${color}\u0000${condition}`;
    const group = groups.get(key) ?? {
      itemCode: item.item_code,
      warehouse,
      color,
      condition,
      cuts: [],
    };
    group.cuts.push({
      qtyMicros: toScaledInt(item.sheets_cut, 6),
      sourceLengthMicros: toScaledInt(item.source_length_m, 6),
    });
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const compatible = active.filter((document) => {
      const reservation = document.data;
      return reservation.item_code === group.itemCode
        && (!reservation.warehouse || reservation.warehouse === group.warehouse)
        && (!reservation.color || reservation.color === group.color)
        && (!reservation.condition || reservation.condition === group.condition);
    });
    if (!compatible.length) continue;
    const positions = await context.reader.listTrackedStockPositions(context.command.tenant_id, group.itemCode);
    const matchingPositions: Array<{ qtyMicros: number; lengthMicros: number }> = [];
    for (const position of positions) {
      if (position.warehouse !== group.warehouse || position.qty_micros <= 0) continue;
      const batch = await context.reader.getMasterRecordData(
        context.command.tenant_id, "Batch", position.batch_no,
      );
      if (!batch || String(batch.color ?? "") !== group.color || String(batch.condition ?? "") !== group.condition) continue;
      matchingPositions.push({
        qtyMicros: position.qty_micros,
        lengthMicros: toScaledInt(decimal(batch.length_m, `Batch ${position.batch_no}.length_m`), 6),
      });
    }
    const thresholds = [...new Set(compatible.map((document) => toScaledInt(document.data.min_length_m, 6)))];
    for (const threshold of thresholds) {
      const totalMicros = matchingPositions
        .filter((position) => position.lengthMicros >= threshold)
        .reduce((total, position) => total + position.qtyMicros, 0);
      const cutMicros = group.cuts
        .filter((cut) => cut.sourceLengthMicros >= threshold)
        .reduce((total, cut) => total + cut.qtyMicros, 0);
      const reservedMicros = compatible
        .filter((document) => toScaledInt(document.data.min_length_m, 6) >= threshold)
        .reduce((total, document) => total + toScaledInt(document.data.qty_reserved, 6), 0);
      if (totalMicros - cutMicros < reservedMicros) {
        throw errors.reference(
          `Không thể cắt ${fromScaledInt(cutMicros, 6)} lá ${group.itemCode} tại ${group.warehouse}: `
          + `phải chừa ${fromScaledInt(reservedMicros, 6)} lá khổ ≥ ${fromScaledInt(threshold, 6)} m cho lệnh khác`,
          {
            total_qty_micros: totalMicros,
            cut_qty_micros: cutMicros,
            reserved_for_other_sources_micros: reservedMicros,
            min_length_micros: threshold,
          },
        );
      }
    }
  }
}

async function normalizeCutRow(
  context: ControllerContext<CutOrderData>,
  source: CutOrderItem,
  index: number,
): Promise<CutOrderItem> {
  if (!source.item_code || !source.serial_and_batch_bundle) {
    throw errors.validation(`Dòng cắt ${index + 1} thiếu mã nhôm hoặc bundle lô đem cắt`);
  }
  const bundle = await requireSubmittedBundle(context, source.serial_and_batch_bundle);
  if (bundle.type !== "Outward" || bundle.item_code !== source.item_code) {
    throw errors.reference(`Bundle ${source.serial_and_batch_bundle} phải là bundle xuất của đúng mặt hàng ${source.item_code}`);
  }
  const rows = normalizeBundleRows(bundle.entries);
  const qty = toScaledInt(source.sheets_cut, 6, `items[${index}].sheets_cut`);
  const bundleQty = rows.reduce((total, row) => total + (row.qty_micros ?? 0), 0);
  if (qty <= 0 || qty % 1_000_000 !== 0 || bundleQty !== qty) {
    throw errors.validation(`Số lá cắt dòng ${index + 1} phải là số nguyên dương và bằng tổng bundle`);
  }
  const item = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", source.item_code);
  if (!item) throw errors.reference(`Mặt hàng ${source.item_code} không tồn tại`);
  const profileName = typeof item.measurement_profile === "string" ? item.measurement_profile : "";
  const profile = profileName
    ? await context.reader.getMasterRecordData(context.command.tenant_id, "Measurement Profile", profileName)
    : null;
  if (!profile) throw errors.reference(`Mặt hàng ${source.item_code} chưa có bộ quy cách hợp lệ`);
  const kerfMicros = toScaledInt(Number(profile.kerf_mm ?? 0) / 1000, 6, "kerf_mm");
  if (kerfMicros < 0 || kerfMicros > 10_000) throw errors.validation("Bề rộng lưỡi cắt phải trong khoảng 0–10 mm");
  const threshold = toScaledInt(decimal(profile.scrap_threshold_m, "scrap_threshold_m"), 6);
  if (threshold < 0) throw errors.validation("Ngưỡng phế liệu không được âm");

  let sourceLength = -1;
  let estimatedWeight = 0;
  for (const bundleRow of rows) {
    if (!bundleRow.batch_no) throw errors.validation("Phiếu cắt nhôm bắt buộc chọn lô");
    const batch = await context.reader.getMasterRecordData(context.command.tenant_id, "Batch", bundleRow.batch_no);
    if (!batch) throw errors.reference(`Lô ${bundleRow.batch_no} không tồn tại`);
    if (batch.item_code && batch.item_code !== source.item_code) {
      throw errors.reference(`Lô ${bundleRow.batch_no} không thuộc mặt hàng ${source.item_code}`);
    }
    const length = toScaledInt(decimal(batch.length_m, `Batch ${bundleRow.batch_no}.length_m`), 6);
    if (sourceLength >= 0 && length !== sourceLength) {
      throw errors.validation("Một dòng cắt chỉ được gom các lô có cùng khổ");
    }
    sourceLength = length;
    const state = await context.reader.getTrackedStockState(
      context.command.tenant_id, source.item_code, bundle.warehouse, bundleRow.batch_no,
    );
    const rowQty = bundleRow.qty_micros ?? 0;
    if (state.qty_micros < rowQty) {
      throw errors.reference(`Lô ${bundleRow.batch_no} không đủ tồn để cắt`);
    }
    if (item.has_catch_weight === true || item.has_catch_weight === 1) {
      if (state.weight_micros == null || state.qty_micros <= 0) {
        throw errors.validation(`Lô ${bundleRow.batch_no} chưa có số cân thực tế`);
      }
      estimatedWeight += mulDiv(state.weight_micros, rowQty, state.qty_micros);
    }
  }
  const declaredSourceLength = toScaledInt(source.source_length_m, 6, `items[${index}].source_length_m`);
  if (declaredSourceLength !== sourceLength) throw errors.validation(`Khổ cây dòng ${index + 1} không khớp lô đã chọn`);
  const cutWidth = toScaledInt(source.cut_width_m, 6, `items[${index}].cut_width_m`);
  if (cutWidth <= 0 || cutWidth > sourceLength) throw errors.validation(`Rộng cắt dòng ${index + 1} không hợp lệ`);
  const cutsCount = qty / 1_000_000;
  const kerfTotal = kerfMicros * cutsCount;
  const offcut = sourceLength - cutWidth - kerfTotal;
  if (offcut < 0) throw errors.validation(`Dòng ${index + 1} không đủ chiều dài sau khi trừ kerf`);
  const consumedWeight = source.kg_weighed == null
    ? estimatedWeight
    : toScaledInt(source.kg_weighed, 6, `items[${index}].kg_weighed`);
  if ((item.has_catch_weight === true || item.has_catch_weight === 1) && consumedWeight <= 0) {
    throw errors.validation(`Dòng ${source.item_code} phải có kg cân thực tế khi xuất cắt`);
  }

  if (offcut >= threshold && offcut > 0) {
    if (!source.offcut_bundle) throw errors.validation(`Dòng ${index + 1} phải có bundle nhập đầu thừa`);
    await validateOffcutBundle(context, source, source.offcut_bundle, rows.map((row) => row.batch_no!), offcut, qty);
  } else if (source.offcut_bundle) {
    throw errors.validation(`Dòng ${index + 1} dưới ngưỡng đầu thừa nên không được nhập bundle đầu thừa`);
  }
  return {
    ...source,
    row_id: source.row_id || `ROW-${index + 1}`,
    source_warehouse: bundle.warehouse,
    source_length_m: fromScaledInt(sourceLength, 6),
    cut_width_m: fromScaledInt(cutWidth, 6),
    sheets_cut: fromScaledInt(qty, 6),
    cuts_count: cutsCount,
    kerf_total_m: fromScaledInt(kerfTotal, 6),
    kg_consumed: fromScaledInt(consumedWeight, 6),
    kg_consumed_micros: consumedWeight,
    offcut_length_m: fromScaledInt(offcut, 6),
    scrap_m: fromScaledInt(offcut >= threshold ? 0 : offcut, 6),
  };
}

async function validateOffcutBundle(
  context: ControllerContext<CutOrderData>,
  source: CutOrderItem,
  bundleName: string,
  sourceBatches: string[],
  offcutLength: number,
  qty: number,
): Promise<void> {
  const bundle = await requireSubmittedBundle(context, bundleName);
  if (bundle.type !== "Inward" || bundle.item_code !== source.item_code) {
    throw errors.reference(`Bundle đầu thừa ${bundleName} phải là bundle nhập của đúng mặt hàng`);
  }
  await requireWarehouseRole(context, bundle.warehouse, "Kho đầu thừa");
  const rows = normalizeBundleRows(bundle.entries);
  if (rows.reduce((sum, row) => sum + (row.qty_micros ?? 0), 0) !== qty) {
    throw errors.reference(`Bundle đầu thừa ${bundleName} không khớp số lá cắt`);
  }
  for (const row of rows) {
    if (!row.batch_no) throw errors.validation("Đầu thừa bắt buộc có số lô");
    const batch = await context.reader.getMasterRecordData(context.command.tenant_id, "Batch", row.batch_no);
    if (!batch) throw errors.reference(`Lô đầu thừa ${row.batch_no} không tồn tại`);
    if (!(batch.is_offcut === true || batch.is_offcut === 1)) throw errors.validation(`Lô ${row.batch_no} chưa được đánh dấu là đầu thừa`);
    if (!sourceBatches.includes(String(batch.parent_batch ?? ""))) {
      throw errors.validation(`Lô đầu thừa ${row.batch_no} không trỏ về lô mẹ đã cắt`);
    }
    if (toScaledInt(decimal(batch.length_m, `Batch ${row.batch_no}.length_m`), 6) !== offcutLength) {
      throw errors.validation(`Khổ lô đầu thừa ${row.batch_no} không khớp phần dư thực tế`);
    }
  }
}

async function reservationAvailability(
  context: ControllerContext<StockReservationData>,
  request: StockReservationData,
  excludeName: string,
): Promise<{ totalMicros: number; reservedMicros: number; availableMicros: number }> {
  const threshold = toScaledInt(request.min_length_m, 6);
  const positions = await context.reader.listTrackedStockPositions(context.command.tenant_id, request.item_code);
  let totalMicros = 0;
  for (const position of positions) {
    if (position.qty_micros <= 0 || (request.warehouse && position.warehouse !== request.warehouse)) continue;
    const batch = await context.reader.getMasterRecordData(
      context.command.tenant_id, "Batch", position.batch_no,
    );
    if (!batch || (batch.item_code && batch.item_code !== request.item_code)) continue;
    if (request.color && batch.color !== request.color) continue;
    if (request.condition && batch.condition !== request.condition) continue;
    const warehouseData = await context.reader.getMasterRecordData(
      context.command.tenant_id, "Warehouse", position.warehouse,
    );
    if (warehouseData?.stock_role !== "Kho chính") continue;
    const length = toScaledInt(decimal(batch.length_m, `Batch ${position.batch_no}.length_m`), 6);
    if (length < threshold) continue;
    totalMicros += position.qty_micros;
  }
  const reservations = await context.reader.listDocumentsByDoctype<StockReservationData>(
    context.command.tenant_id, "Stock Reservation",
  );
  let reservedMicros = 0;
  for (const document of reservations) {
    if (document.name === excludeName || document.data.state !== "Đang giữ") continue;
    if (document.data.expires_at && document.data.expires_at <= context.now) continue;
    if (document.data.item_code !== request.item_code) continue;
    if (request.color && document.data.color && document.data.color !== request.color) continue;
    if (request.condition && document.data.condition && document.data.condition !== request.condition) continue;
    if (request.warehouse && document.data.warehouse && document.data.warehouse !== request.warehouse) continue;
    if (toScaledInt(document.data.min_length_m, 6) < threshold) continue;
    reservedMicros += toScaledInt(document.data.qty_reserved, 6);
  }
  return { totalMicros, reservedMicros, availableMicros: Math.max(0, totalMicros - reservedMicros) };
}

async function reverseBundleUsages(
  context: ControllerContext<CutOrderData>,
  items: CutOrderItem[],
  postingAt: string,
): Promise<StockBundleUsageEntry[]> {
  const result: StockBundleUsageEntry[] = [];
  for (const [index, item] of items.entries()) {
    result.push({
      line_key: `REV-BUNDLE-CUT-${item.row_id ?? index + 1}`,
      bundle_name: item.serial_and_batch_bundle,
      item_code: item.item_code,
      warehouse: item.source_warehouse!,
      direction: "Outward",
      usage_delta: -1,
      posting_at: postingAt,
    });
    if (item.offcut_bundle) {
      const bundle = await requireSubmittedBundle(context, item.offcut_bundle);
      result.push({
        line_key: `REV-BUNDLE-OFFCUT-${item.row_id ?? index + 1}`,
        bundle_name: item.offcut_bundle,
        item_code: item.item_code,
        warehouse: bundle.warehouse,
        direction: "Inward",
        usage_delta: -1,
        posting_at: postingAt,
      });
    }
  }
  return result;
}

async function requireSubmittedBundle<T extends JsonObject>(
  context: ControllerContext<T>,
  name: string,
): Promise<SerialBatchBundleData> {
  const document = await context.reader.getDocument<SerialBatchBundleData>(
    context.command.tenant_id, "Serial and Batch Bundle", name,
  );
  if (!document || document.docstatus !== 1) throw errors.reference(`Bundle ${name} phải tồn tại và đã ghi sổ`);
  return document.data;
}

async function companyForWarehouse<T extends JsonObject>(
  context: ControllerContext<T>,
  warehouse: string,
): Promise<{ company: string; currency: string; currencyScale: number }> {
  const warehouseData = await context.reader.getMasterRecordData(context.command.tenant_id, "Warehouse", warehouse);
  if (!warehouseData) throw errors.reference(`Kho ${warehouse} không tồn tại hoặc đã ngừng dùng`);
  let company = typeof warehouseData.company === "string" ? warehouseData.company : "";
  if (!company) {
    const companies = await context.reader.listMasterRecordData(context.command.tenant_id, "Company");
    if (companies.length !== 1) throw errors.validation(`Kho ${warehouse} phải khai công ty`);
    company = companies[0]!.name;
  }
  const companyData = await context.reader.getMasterRecordData(context.command.tenant_id, "Company", company);
  const currency = typeof companyData?.default_currency === "string" ? companyData.default_currency : "";
  if (!currency) throw errors.validation(`Công ty ${company} phải khai tiền tệ mặc định`);
  const currencyData = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
  if (!currencyData) throw errors.reference(`Tiền tệ ${currency} không tồn tại`);
  return {
    company,
    currency,
    currencyScale: typeof currencyData.currency_scale === "number" ? currencyData.currency_scale : 2,
  };
}

async function requireWarehouseRole<T extends JsonObject>(
  context: ControllerContext<T>,
  warehouse: string,
  role: string,
): Promise<void> {
  const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Warehouse", warehouse);
  if (!data || data.stock_role !== role || data.is_group === true || data.is_group === 1) {
    throw errors.validation(`Kho ${warehouse} phải là kho lá có vai trò ${role}`);
  }
}

async function requireMainWarehouse<T extends JsonObject>(context: ControllerContext<T>, warehouse: string): Promise<void> {
  return requireWarehouseRole(context, warehouse, "Kho chính");
}

async function assertUnlocked<T extends JsonObject>(
  context: ControllerContext<T>,
  company: string,
  postingAt: string,
): Promise<void> {
  if (context.command.actor.roles.includes("System Manager") || context.command.actor.user_id === "Administrator") return;
  const lock = await context.reader.getPeriodLockDate(context.command.tenant_id, company);
  if (lock && postingAt.slice(0, 10) <= lock) {
    throw errors.validation(`Ngày ${postingAt.slice(0, 10)} thuộc kỳ đã khoá`, { lock_date: lock });
  }
}

function assertReconciliationApprover(context: ControllerContext<StockReconciliationData>, countedBy: string): void {
  if (!context.command.actor.roles.includes("Chủ xưởng")
    && !context.command.actor.roles.includes("System Manager")
    && context.command.actor.user_id !== "Administrator") {
    throw errors.permission("Chỉ Chủ xưởng được duyệt và ghi sổ kiểm kê");
  }
  if (context.command.actor.user_id === countedBy) {
    throw errors.permission("Người đếm không được tự duyệt phiếu kiểm kê của mình");
  }
}

function requireExisting<T extends JsonObject>(context: ControllerContext<T>): CanonicalDocument<T> {
  if (!context.existing) throw errors.notFound();
  return context.existing;
}

function extractChildren(doctype: string, data: JsonObject): ChildRow[] {
  const children: ChildRow[] = [];
  for (const [fieldname, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    for (const [index, raw] of value.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const row = raw as JsonObject;
      children.push({
        fieldname,
        child_doctype: `${doctype} ${fieldname}`,
        row_id: String(row.row_id ?? `${fieldname}-${index + 1}`),
        idx: index + 1,
        data: structuredClone(row),
      });
    }
  }
  return children;
}

function decimal(value: unknown, field: string): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  throw errors.validation(`${field} là bắt buộc và phải là số`);
}

function mulDiv(value: number, numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw errors.validation("Phép tính kho vượt giới hạn an toàn");
  }
  const product = BigInt(value) * BigInt(numerator);
  const divisor = BigInt(denominator);
  const quotient = product / divisor;
  const remainder = product % divisor;
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw errors.validation("Phép tính kho vượt giới hạn an toàn");
  return result;
}

function slug(value: string): string {
  return value.toLowerCase().replaceAll(" ", "_");
}
