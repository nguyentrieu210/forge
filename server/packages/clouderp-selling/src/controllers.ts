import type {
  CanonicalDocument,
  ChildRow,
  GeneralLedgerEntry,
  FulfillmentEntry,
  JsonObject,
  MutationPlan,
  PaymentLedgerEntry,
  StockLedgerEntry,
  StockBundleUsageEntry,
} from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController, O2CStatusMetrics } from "../../document-kernel/src/index.js";
import { deriveDeliveryNoteStatus, deriveO2CStatus, nextDocStatus } from "../../document-kernel/src/index.js";
import { reverseGl, reversePayment, reverseStock } from "../../ledger/src/index.js";
import { addMinor, assertNonNegativeMinor, fromScaledInt, multiplyScaled, negateMinor, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import { buildTrackedStockLines, deriveOutgoingValuation } from "../../clouderp-stock/src/index.js";
import { areaTierBasisSqm, resolveServerPrice } from "../../clouderp-pricing/src/index.js";
import type { PricingRuleSnapshot } from "../../clouderp-pricing/src/commercial-policy.js";
import { applyUomConversion, pricedQtyMicros, stockQtyMicros } from "../../clouderp-core/src/uom.js";
import { assertCurrencyScale, calculateSalesTotals } from "./totals.js";
import type { DeliveryIssuePurpose, DeliveryNoteData, PaymentEntryData, SalesInvoiceData, SalesItem, SalesOrderData } from "./types.js";
import { assertSalesOrderDeliveryLines, freezeSalesOrderBillingLines, salesOrderFulfillmentEntries } from "./sales-order-downstream.js";

const DELIVERY_ISSUE_PURPOSES = new Set<DeliveryIssuePurpose>([
  "Bán hàng",
  "Xuất mẫu",
  "Đổi bảo hành",
  "Xuất nội bộ",
  "Xuất gia công",
]);

abstract class BaseController<T extends JsonObject> implements DocumentController<T> {
  abstract readonly doctype: string;
  abstract normalize(context: ControllerContext<T>): Promise<T> | T;
  abstract ledger(context: ControllerContext<T>, data: T): Promise<{
    gl?: GeneralLedgerEntry[];
    stock?: StockLedgerEntry[];
    payment?: PaymentLedgerEntry[];
    fulfillment?: FulfillmentEntry[];
    stockBundleUsages?: StockBundleUsageEntry[];
  }> | {
    gl?: GeneralLedgerEntry[];
    stock?: StockLedgerEntry[];
    payment?: PaymentLedgerEntry[];
    fulfillment?: FulfillmentEntry[];
    stockBundleUsages?: StockBundleUsageEntry[];
  };
  abstract eventTypes(context: ControllerContext<T>): string[];

  async buildPlan(context: ControllerContext<T>): Promise<MutationPlan<T>> {
    const data = context.command.action === "cancel"
      ? structuredClone(requireExisting(context).data)
      : await this.normalize(context);
    const command = context.command;
    const docstatus = nextDocStatus(command.action);
    const status = this.status(context, data);
    const createdAt = context.existing?.created_at ?? context.now;
    const children = extractChildren(this.doctype, data);
    const ledger = await this.ledger(context, data);
    const document: CanonicalDocument<T> = {
      tenant_id: command.tenant_id,
      doctype: this.doctype,
      name: command.aggregate.name,
      owner: context.existing?.owner ?? command.actor.user_id,
      docstatus,
      status,
      version: context.nextVersion,
      created_at: createdAt,
      modified_at: context.now,
      data,
      children,
    };
    const events = this.eventTypes(context).map((type) => domainEvent({
      type,
      tenantId: command.tenant_id,
      aggregate: command.aggregate,
      aggregateVersion: context.nextVersion,
      actor: command.actor.user_id,
      commandId: command.command_id,
      occurredAt: context.now,
      payload: { action: command.action, status },
    }));
    return {
      command,
      document,
      gl_entries: ledger.gl ?? [],
      stock_entries: ledger.stock ?? [],
      payment_entries: ledger.payment ?? [],
      fulfillment_entries: ledger.fulfillment ?? [],
      stock_bundle_usages: ledger.stockBundleUsages ?? [],
      events,
      result: { doctype: this.doctype, name: command.aggregate.name, version: context.nextVersion, docstatus, status },
    };
  }

  protected status(context: ControllerContext<T>, data: T): string {
    return deriveO2CStatus(this.doctype, nextDocStatus(context.command.action), statusMetrics(this.doctype, data));
  }
}

/** Server-computed metrics that drive the derived O2C status label (never client input). */
function statusMetrics(doctype: string, data: JsonObject): O2CStatusMetrics {
  if (doctype === "Sales Order") {
    return {
      deliveredPercentage: Number(data.delivered_percentage ?? 0),
      billedPercentage: Number(data.billed_percentage ?? 0),
    };
  }
  if (doctype === "Sales Invoice") {
    const scale = typeof data.currency_scale === "number" ? data.currency_scale : 2;
    const grand = typeof data.grand_total_minor === "number"
      ? data.grand_total_minor : toScaledInt(String(data.grand_total ?? "0"), scale);
    const outstanding = typeof data.outstanding_amount_minor === "number" ? data.outstanding_amount_minor : grand;
    return { outstandingMinor: outstanding, grandTotalMinor: grand };
  }
  return {};
}

/**
 * Đóng khoá dòng ổn định cho từng dòng đơn bán — thứ MỌI chứng từ hạ nguồn khoá theo.
 *
 * Nhân hệ thống có đúc `items-N` cho BẢNG DÒNG CON, nhưng mảng `items` của chính chứng
 * từ cha chỉ giữ đúng những gì client gửi — và không client Alumdoor nào gửi `row_id`.
 * Hệ quả: đơn bán lập từ màn hình lưu xuống với dòng KHÔNG có `row_id`, rồi mọi lần ghi
 * sổ Phiếu xuất và mọi lần lập Hoá đơn từ đơn đó chết ở `sales-order-downstream.ts:214`
 * với "row 1 has no stable row_id". Chín phiếu xuất trong tenant dev nằm ở Nháp đúng vì
 * lý do này — và lỗi báo tên ĐƠN BÁN trong lúc người dùng đang bấm ghi sổ PHIẾU XUẤT,
 * nên nhìn như lỗi kho.
 *
 * Đúc ngay lúc lưu làm mảng cha khớp với bảng dòng con và khớp với `name` mà đường đọc
 * vốn đã trả về — nên sửa rồi lưu lại vẫn ra đúng khoá cũ. Dòng mới chèn vào giữa không
 * bao giờ cướp khoá của một dòng đang có: khoá đã dùng được gom trước rồi mới đúc tiếp.
 */
/**
 * Vai được duyệt giá/chiết khấu ngoài chính sách. Giữ ĐỒNG BỘ với
 * `commercial-sales-order-controller.ts` — hai chốt chặn cùng một câu hỏi thì phải cùng câu
 * trả lời, lệch nhau là đơn qua được đường này mà chết đường kia.
 */
export const PRICING_APPROVER_ROLES: ReadonlySet<string> = new Set([
  "Sales Manager", "System Manager",
  "Chủ xưởng", "Giám đốc", "Director",
]);

export function withStableRowIds<T extends JsonObject>(items: readonly T[]): T[] {
  const taken = new Set<string>();
  for (const item of items) {
    const declared = typeof item.row_id === "string" ? item.row_id.trim() : "";
    if (declared) taken.add(declared);
  }
  let next = 1;
  return items.map((item) => {
    const declared = typeof item.row_id === "string" ? item.row_id.trim() : "";
    if (declared) return declared === item.row_id ? item : { ...item, row_id: declared };
    while (taken.has(`items-${next}`)) next += 1;
    const minted = `items-${next}`;
    taken.add(minted);
    return { ...item, row_id: minted };
  });
}

const ALUMDOOR_PRICE_GROUPS = new Set(["Đại lý", "Lẻ"]);

/**
 * Detect the AlumDoor commercial contract from canonical business data, not from a
 * tenant-wide switch.  A tenant may use its real legal Company name, while shared O2C
 * controllers also serve apps which do not own AlumDoor's price-group authority.
 */
export async function isAlumdoorCommercialContext(
  context: ControllerContext<SalesOrderData>,
  input: SalesOrderData,
): Promise<boolean> {
  if (input.company === "ALUMDOOR") return true;
  if (!input.customer) return false;
  const customer = await context.reader.getMasterRecordData(context.command.tenant_id, "Customer", input.customer);
  const group = typeof customer?.price_group === "string" && customer.price_group.trim()
    ? customer.price_group.trim()
    : typeof customer?.customer_group === "string" ? customer.customer_group.trim() : "";
  return ALUMDOOR_PRICE_GROUPS.has(group);
}

export class SalesOrderController extends BaseController<SalesOrderData> {
  readonly doctype = "Sales Order";

  async normalize(context: ControllerContext<SalesOrderData>): Promise<SalesOrderData> {
    const input = context.command.document;
    if (!input.customer) throw errors.validation("Customer is required");
    if (!input.company) throw errors.validation("Company is required");
    if (!input.currency) throw errors.validation("Currency is required");
    // AlumDoor khóa giá theo danh mục; O2C dùng chung của app khác giữ hợp đồng riêng.
    // Nhận diện bằng Company kỹ thuật cũ hoặc Nhóm giá canonical trên Customer, nên công
    // ty thật không cần mang tên "ALUMDOOR" và social-commerce khác không bị khóa nhầm.
    const locksOrderPricing = await isAlumdoorCommercialContext(context, input);
    if (locksOrderPricing && !input.selling_price_list) throw errors.validation("Bảng giá áp dụng là bắt buộc");
    const orderDiscountPercentage = input.additional_discount_percentage ?? 0;
    const orderDiscountMicros = toScaledInt(orderDiscountPercentage, 6, "additional_discount_percentage");
    const currency = await resolveCurrencyContext(context, input.company, input.currency, input.transaction_date);
    const currencyScale = currency.transactionScale;
    const itemSnapshots = await applyUomConversion(context as unknown as ControllerContext<JsonObject>, withStableRowIds(input.items), { transactionKind: "sales" });
    const pricedItems = await applySellingPricing(context, itemSnapshots, input.selling_price_list, input.currency, input.transaction_date, input.customer, input.customer_group);
    const discountPolicy = locksOrderPricing
      ? await applyAlumdoorDiscountPolicy(context, pricedItems, input.customer_group)
      : { items: pricedItems, requiresApproval: false };
    const pricingRequiresApproval = discountPolicy.requiresApproval
      || orderDiscountMicros !== 0
      || pricedItems.some((item) => item.rate_requires_approval === true);
    if (context.command.action === "submit" && locksOrderPricing && pricingRequiresApproval) {
      // Cùng danh sách vai với `commercial-sales-order-controller.ts` — xem chú thích ở đó về
      // việc chỉ khai vai tiếng Anh làm chốt chặn này chặn quá tay ở tenant Alumdoor.
      const approver = context.command.actor.user_id === "Administrator"
        || context.command.actor.roles.some((role) => PRICING_APPROVER_ROLES.has(role));
      if (!approver) throw errors.permission("Đơn hàng có đơn giá/chiết khấu khác chính sách; chủ xưởng hoặc giám đốc phải duyệt trước khi bán.");
    }
    const totals = calculateSalesTotals(discountPolicy.items, input.taxes ?? [], currencyScale, {
      use_priced_quantity: true,
      apply_discount_on: locksOrderPricing ? "Net Total" : input.apply_discount_on,
      additional_discount_percentage: orderDiscountPercentage,
      // Alumdoor nhập % giảm tại từng dòng. UI cộng thành `discount_amount` ở đầu đơn
      // để controller hạch toán đúng tiền phải trả; không còn ép chiết khấu toàn đơn.
      discount_amount: input.discount_amount,
    });
    /**
     * VAT của Alumdoor là MỘT TỶ LỆ ở đầu đơn (`vat_rate`), không phải dòng trong bảng
     * `taxes` của ERPNext — nên `calculateSalesTotals` không nhìn thấy nó và trả về
     * grand_total chưa có thuế. Controller lại ghi đè mọi con số client gửi lên, nên nếu
     * không cộng ở đây thì "Tiền phải thu" trên chứng từ và trên bản in luôn thiếu VAT,
     * dù màn hình nhập liệu hiển thị đúng.
     *
     * Thứ tự khớp với form: (tiền hàng − chiết khấu) → VAT → phụ thu. `net_total_minor`
     * đã trừ chiết khấu vì đơn Alumdoor luôn chạy `apply_discount_on: "Net Total"`.
     */
    // Phụ thu của Alumdoor là khoản cộng cố định trên đơn, sau VAT. Canonicalize bằng
    // số nguyên theo đơn vị tiền để client không thể ghi tổng phải trả tùy ý.
    const surchargeMinor = Math.max(0, toScaledInt(input.surcharge_amount ?? 0, currencyScale, "surcharge_amount"));
    const { extraMinor, ...alumdoorFields } = alumdoorOrderTotals({
      netTotalMinor: totals.net_total_minor,
      discountAmountMinor: totals.discount_amount_minor,
      vatRate: input.vat_rate,
      surchargeMinor,
      currencyScale,
    });
    // Chỉ phát ra ba trường này cho chứng từ thực sự khai chúng; app khác dùng chung
    // controller vẫn giữ đúng hợp đồng cũ của nó.
    const alumdoorTotals = input.vat_rate === undefined && input.total_amount === undefined ? {} : alumdoorFields;
    const adjustedTotals = extraMinor === 0 ? { ...totals, ...alumdoorTotals } : {
      ...totals,
      ...alumdoorTotals,
      surcharge_amount: fromScaledInt(surchargeMinor, currencyScale),
      surcharge_amount_minor: surchargeMinor,
      grand_total_minor: totals.grand_total_minor + extraMinor,
      grand_total: fromScaledInt(totals.grand_total_minor + extraMinor, currencyScale),
      rounded_total_minor: totals.rounded_total_minor + extraMinor,
      rounded_total: fromScaledInt(totals.rounded_total_minor + extraMinor, currencyScale),
    };
    // Master-data EXISTENCE is deliberately validated at submit, not while a
    // lightweight draft is being edited. The posting gate remains authoritative.
    if (context.command.action === "submit") {
      await assertMasterData(context, [
        ["Company", input.company], ["Customer", input.customer], ["Currency", input.currency],
        ...adjustedTotals.items.map((item): [string, string] => ["Item", item.item_code]),
        ...adjustedTotals.taxes.map((tax): [string, string] => ["Account", tax.account]),
      ]);
    }
    return {
      ...input,
      // Đơn cũ có thể còn giảm giá ở đầu đơn. Từ nay cả kiểu giảm đó cũng phải đi duyệt,
      // vì chính sách Alumdoor chỉ cho phép 15% trên dòng Cửa Đức, 0% ở dòng khác.
      discount_requires_approval: pricingRequiresApproval,
      currency_scale: currencyScale,
      ...adjustedTotals,
      ...baseTotals(adjustedTotals, currency, currencyScale),
      company_currency: currency.companyCurrency,
      company_currency_scale: currency.companyScale,
      conversion_rate: fromScaledInt(currency.rateMicros, 6),
      conversion_rate_micros: currency.rateMicros,
      // Progress is server-derived from fulfillment entries and is rehydrated on read.
      delivered_percentage: "0.00",
      billed_percentage: "0.00",
    };
  }

  async ledger(context: ControllerContext<SalesOrderData>): Promise<Record<string, never>> {
    if (context.command.action === "cancel") {
      const used = await context.reader.getFulfilledQuantityMicros(context.command.tenant_id, context.command.aggregate.name);
      if (used !== 0) throw errors.reference("Sales Order cannot be cancelled while submitted delivery or billing documents exist");
    }
    return {};
  }

  eventTypes(context: ControllerContext<SalesOrderData>): string[] {
    if (context.command.action === "submit") return ["sales_order.submitted", "sales_order.status_changed"];
    if (context.command.action === "cancel") return ["sales_order.cancelled", "sales_order.status_changed"];
    return ["sales_order.updated"];
  }
}

const ALUMDOOR_GERMAN_DOOR_TYPES = new Set(["cửa đức"]);
const ALUMDOOR_GERMAN_DOOR_GROUPS = new Set(["cửa cn đức"]);

const normalizedAlumdoorText = (value: unknown) => String(value ?? "").normalize("NFC").trim().toLocaleLowerCase("vi");

function isAlumdoorLinearItem(item: Record<string, unknown>): boolean {
  const name = normalizedAlumdoorText(item.item_name);
  const code = normalizedAlumdoorText(item.item_code);
  return name.startsWith("ray") || code.includes("ray")
    || name.startsWith("trục") || name.startsWith("truc") || code.includes("trục") || code.includes("truc");
}

/**
 * Phần tổng riêng của Alumdoor, tách khỏi controller để phép tính TIỀN kiểm chứng được mà
 * không phải dựng cả một ControllerContext (tiền tệ, bảng giá, master data).
 *
 * Ba điều bộ máy ERPNext chung không biểu diễn được:
 *  - VAT khai bằng MỘT TỶ LỆ ở đầu đơn (`vat_rate`), không phải dòng trong bảng `taxes`;
 *  - phụ thu cộng SAU VAT;
 *  - "Tổng tiền hàng" trên bản in là số TRƯỚC chiết khấu, còn `net_total` đã trừ rồi.
 *
 * `netTotalMinor` là số ĐÃ trừ chiết khấu (đơn Alumdoor luôn `apply_discount_on: "Net Total"`).
 * Phụ thu KHÔNG chịu chiết khấu nhưng CÓ chịu VAT, nên nó cộng vào gốc tính thuế:
 *
 *     (tiền hàng − chiết khấu + phụ thu) × %VAT = tiền VAT
 *     tiền phải thu = tiền hàng − chiết khấu + phụ thu + tiền VAT
 */
export function alumdoorOrderTotals(input: {
  netTotalMinor: number;
  discountAmountMinor: number;
  vatRate: unknown;
  surchargeMinor: number;
  currencyScale: number;
}): {
  total_amount: string; vat_rate: number; vat_amount: string; vat_amount_minor: number;
  /** Gốc tính thuế = tiền hàng − chiết khấu + phụ thu. In ra để người đọc kiểm được số VAT. */
  vat_base_amount: string;
  extraMinor: number;
} {
  const rawRate = Number(input.vatRate ?? 0);
  const vatRate = Number.isFinite(rawRate) ? Math.min(100, Math.max(0, rawRate)) : 0;
  const vatBaseMinor = input.netTotalMinor + input.surchargeMinor;
  const vatAmountMinor = vatRate === 0 ? 0 : Math.round(vatBaseMinor * vatRate / 100);
  return {
    total_amount: fromScaledInt(input.netTotalMinor + input.discountAmountMinor, input.currencyScale),
    vat_rate: vatRate,
    vat_amount: fromScaledInt(vatAmountMinor, input.currencyScale),
    vat_amount_minor: vatAmountMinor,
    vat_base_amount: fromScaledInt(vatBaseMinor, input.currencyScale),
    extraMinor: vatAmountMinor + input.surchargeMinor,
  };
}

/** Nhóm giá KHÔNG được hưởng chiết khấu đại lý. Giá trị đúng như dữ liệu máy: 251 KH "Đại lý", 5 KH "Lẻ". */
const ALUMDOOR_RETAIL_PRICE_GROUPS = new Set(["lẻ"]);

/**
 * Chỉ mã cửa mặc định 15%; ray/trục và các phụ kiện mặc định 0%.
 *
 * P0-2: hàm này trước đây KHÔNG nhận nhóm giá, nên khách "Lẻ" cũng được giảm 15% —
 * xem trước sống `customer_group: "Lẻ"` ra `net 10.488.150` thay vì giá niêm yết `12.339.000`.
 * Nay nhóm bán lẻ trả về 0. Nhóm để trống vẫn giữ nguyên hành vi cũ (fail-open) vì
 * `authoritativeCustomerGroup()` đã chặn đơn không có nhóm giá ở tầng trên.
 */
export function defaultAlumdoorDiscountPercent(
  item: Record<string, unknown>,
  customerGroup?: unknown,
): number {
  if (ALUMDOOR_RETAIL_PRICE_GROUPS.has(normalizedAlumdoorText(customerGroup))) return 0;
  if (isAlumdoorLinearItem(item)) return 0;
  if (ALUMDOOR_GERMAN_DOOR_TYPES.has(normalizedAlumdoorText(item.door_type))) return 15;
  const measurementMode = normalizedAlumdoorText(item.inventory_mode || item.measurement_profile);
  return measurementMode === "thành phẩm theo m2"
    && ALUMDOOR_GERMAN_DOOR_GROUPS.has(normalizedAlumdoorText(item.item_group))
    ? 15
    : 0;
}

export interface AlumdoorBenefitItem extends JsonObject {
  label: string;
  qty: number;
  uom: string;
  source_rule: string;
}

const ALUMDOOR_GERMAN_DISCOUNT_RULE = "ALUMDOOR-PR:DUC-DISCOUNT-15";
const ALUMDOOR_GERMAN_GIFT_RAIL_RULE = "ALUMDOOR-PR:DUC-GIFT-RAIL-GT8M2";

/**
 * NGƯỠNG TẶNG RAY — đọc từ Item, fallback theo quyết định trực tiếp của chủ xưởng.
 *
 * Quyết định chủ xưởng ngày 22/08/2026: "8m2 chứ ko phải 10". Quyết định trực tiếp này có
 * thẩm quyền cao hơn ô workbook cũ ghi trên 10 m². Toán tử không bị đổi trong quyết định mới,
 * nên giữ `GT`: đúng 8,00 m² chưa tặng; chỉ diện tích một bộ lớn hơn 8 m² mới đủ điều kiện.
 * `gift_rail_min_area_sqm` và `gift_rail_area_operator` vẫn cho phép lưu ảnh chụp chính sách
 * trên Item khi danh mục được hoàn thiện, nhưng dữ liệu cũ đang để trống phải rơi về mốc 8.
 *
 * CÒN THIẾU: một chỗ chứa trong DANH MỤC để chủ xưởng tự sửa mà không cần lập trình viên.
 * Hàm `alumdoorGiftRailThresholdSqm()` dưới đây đã mở sẵn đường đọc từ dữ liệu: nếu bản ghi
 * Mặc định là `GT`: đúng 8,00 m² chưa được tặng. Nếu có quyết định chủ xưởng mới hơn,
 * cập nhật hai field trên Item cùng ngày hiệu lực và bằng chứng, không sửa hằng số rải rác.
 */
const ALUMDOOR_GIFT_RAIL_MIN_AREA_SQM = 8;
const ALUMDOOR_GIFT_RAIL_AREA_OPERATOR = "GT";

/**
 * Ngưỡng diện tích (m²) để một mã cửa được tặng ray. Đọc từ danh mục nếu có, không thì
 * dùng hằng số đã chốt ở trên. Đây là hàm DUY NHẤT được phép trả ra con số ngưỡng —
 * cả đường lưu, đường xem trước và client đều lấy từ đây.
 */
export function alumdoorGiftRailThresholdSqm(item?: Record<string, unknown>): number {
  const declared = Number(item?.gift_rail_min_area_sqm);
  return Number.isFinite(declared) && declared > 0 ? declared : ALUMDOOR_GIFT_RAIL_MIN_AREA_SQM;
}

export function alumdoorGiftRailAreaOperator(item?: Record<string, unknown>): "GT" | "GTE" {
  return normalizedAlumdoorText(item?.gift_rail_area_operator) === "gte" ? "GTE" : ALUMDOOR_GIFT_RAIL_AREA_OPERATOR;
}

export function alumdoorGiftRailEligible(item: Record<string, unknown>, areaSqm: unknown): boolean {
  const area = Number(areaSqm);
  if (!Number.isFinite(area)) return false;
  const threshold = alumdoorGiftRailThresholdSqm(item);
  return alumdoorGiftRailAreaOperator(item) === "GTE" ? area >= threshold : area > threshold;
}

/**
 * Preserve an auditable policy snapshot when the tenant has not received the equivalent rule yet.
 *
 * P0-1: điều kiện cũ chỉ nhìn `DISCOUNT_PERCENT`, nên khi danh mục đã có luật chiết khấu
 * khai dưới dạng ADJUSTMENT rate ÂM (15 luật "Chiết khấu đại lý 15% — …" trên D1), hàm này
 * vẫn dán thêm một snapshot 15% thứ hai. Kết quả là bản kê chính sách của dòng nói "giảm 15%"
 * hai lần cho cùng một chính sách. Nay có bất kỳ khoản giảm nào — phần trăm, số tuyệt đối,
 * hay ADJUSTMENT âm — thì KHÔNG dán thêm.
 */
export function withAlumdoorDefaultDiscountSnapshot(
  snapshots: PricingRuleSnapshot[],
  item: Record<string, unknown>,
  customerGroup?: unknown,
  appliedDiscountPercentage?: unknown,
): PricingRuleSnapshot[] {
  const expected = defaultAlumdoorDiscountPercent(item, customerGroup);
  if (expected <= 0 || snapshots.some(hasAlumdoorDiscountEffect)) return snapshots;
  const applied = appliedDiscountPercentage === undefined ? expected : Number(appliedDiscountPercentage);
  if (!Number.isFinite(applied) || Math.abs(applied - expected) > 1e-9) return snapshots;
  return [...snapshots, {
    rule_name: ALUMDOOR_GERMAN_DISCOUNT_RULE,
    effect_type: "DISCOUNT_PERCENT",
    priority: 100,
    discount_percentage: String(expected),
  }];
}

/** Một dòng chính sách được coi là "đã có khoản giảm" nếu nó giảm phần trăm, giảm số tuyệt đối,
 *  hoặc là ADJUSTMENT mang số tiền ÂM (dạng khai của 15 luật chiết khấu đại lý trên D1). */
export function hasAlumdoorDiscountEffect(snapshot: PricingRuleSnapshot): boolean {
  if (snapshot.effect_type === "DISCOUNT_PERCENT" || snapshot.effect_type === "DISCOUNT_AMOUNT") return true;
  return snapshot.effect_type === "ADJUSTMENT" && Number(snapshot.amount_minor ?? 0) < 0;
}

/**
 * Non-monetary entitlement from the stamped 31/07/2026 price sheet. This is not a
 * BOM component and never participates in the line total. The exact rail SKU and
 * cutting length remain fulfilment data, because the price sheet does not specify them.
 *
 * P0-3: trước đây hàm chỉ xét diện tích, nên bán theo `ĐƠN GIÁ CHỈ LÁ` (rẻ hơn 75.000 đ/m²)
 * vẫn được tặng ray — cho không cả bộ ray. File quy cách của chủ xưởng (mục 4.1, ô `C4`) buộc
 * dòng ray chỉ tự sinh "khi chọn đơn giá tặng ray". Nay chỉ biến thể `TANG_RAY` mới có quyền lợi này.
 */
export function alumdoorCommercialBenefits(
  item: Record<string, unknown>,
  areaSqm: unknown,
  priceVariant?: unknown,
): AlumdoorBenefitItem[] {
  const area = Number(areaSqm);
  const threshold = alumdoorGiftRailThresholdSqm(item);
  if (normalizedAlumdoorText(priceVariant) !== "tang_ray") return [];
  if (defaultAlumdoorDiscountPercent(item) !== 15 || !alumdoorGiftRailEligible(item, area)) return [];
  return [{
    label: `Tặng ray cửa Đức ${alumdoorGiftRailAreaOperator(item) === "GTE" ? "từ" : "trên"} ${threshold} m²`,
    qty: 1,
    uom: "Bộ",
    source_rule: ALUMDOOR_GERMAN_GIFT_RAIL_RULE,
    /**
     * Dòng quà tặng không mang tiền: `benefit_items` là mảng thuần mô tả, không có ô
     * tiền nào, và không nơi nào cộng nó vào `net_amount`/tổng đơn (đã soát toàn bộ tham chiếu
     * `benefit_items` trong `server/` và `client/` ngày 21/08/2026 — chỉ có nơi SINH ra và nơi
     * HIỂN THỊ). Nên đây KHÔNG phải vá lỗi tính tiền, mà là NÓI THÀNH LỜI cái đang ngầm hiểu:
     * người bán và người đọc bản in phải thấy con số 0, không phải một ô trống để tự đoán.
     */
    rate: "0",
    amount: "0",
    is_free: true,
  }];
}

/**
 * Chặn CỨNG: dưới ngưỡng mà chọn `TANG_RAY` thì không bán được.
 *
 * Cửa dưới/ngay biên ngưỡng mà chọn tặng ray phải bị chặn: nếu không, dòng vẫn lấy giá
 * `TANG_RAY` nhưng không sinh quyền lợi. Trước bản vá này, dòng như vậy vẫn lưu được: nó chỉ
 * lặng lẽ không sinh quyền lợi (`alumdoorCommercialBenefits` trả mảng rỗng), trong khi giá
 * đã lấy theo bảng `TANG_RAY` — tức khách trả thêm 75.000 đ/m² cho bộ ray không bao giờ tới.
 *
 * CHẶN CỨNG AN TOÀN — đã đo trên D1 ngày 21/08/2026: 15/15 mã có dòng giá `TANG_RAY` đều
 * có SẴN dòng `CHI_LA` tương ứng; KHÔNG mã nào chỉ có `TANG_RAY`. Nên không mã nào bị khoá
 * khỏi việc bán dưới ngưỡng — người bán chỉ cần bỏ tick, dòng rơi về `CHI_LA`.
 *
 * Chỉ xét những mã THỰC SỰ nằm trong chính sách tặng ray (cửa Đức, mức 15%). Mã ngoài phạm vi
 * mà lỡ mang biến thể `TANG_RAY` thì không phải việc của luật này — không chặn oan.
 */
export function assertAlumdoorGiftRailAllowed(
  item: Record<string, unknown>,
  areaSqm: unknown,
  priceVariant: unknown,
  itemCode?: unknown,
): void {
  if (normalizedAlumdoorText(priceVariant) !== "tang_ray") return;
  if (defaultAlumdoorDiscountPercent(item) !== 15) return;
  const area = Number(areaSqm);
  const threshold = alumdoorGiftRailThresholdSqm(item);
  if (!Number.isFinite(area) || alumdoorGiftRailEligible(item, area)) return;
  const boundary = alumdoorGiftRailAreaOperator(item) === "GTE" ? `từ ${threshold}` : `trên ${threshold}`;
  const code = typeof itemCode === "string" && itemCode.trim() ? ` (${itemCode.trim()})` : "";
  throw errors.validation(
    `Cửa${code} có diện tích tính tiền ${area} m², chưa đạt ngưỡng tặng ray ${boundary} m² `
    + `nên không được chọn đơn giá TẶNG RAY. Bỏ tick "tặng ray" để bán theo đơn giá CHỈ LÁ, `
    + `hoặc tăng kích thước cho đủ ${threshold} m².`,
  );
}

/**
 * Chính sách chiết khấu của Alumdoor được suy từ Item master, không tin `door_type` do client gửi:
 * chỉ mã cửa mặc định 15%, còn ray/trục và mặt hàng khác 0%. Mức khác vẫn được giữ để người có quyền duyệt
 * quyết định, đồng thời cờ trên đầu đơn được máy chủ ghi lại cho danh sách và audit.
 */
async function applyAlumdoorDiscountPolicy(
  context: ControllerContext<SalesOrderData>,
  items: SalesItem[],
  customerGroup?: unknown,
): Promise<{ items: SalesItem[]; requiresApproval: boolean }> {
  let requiresApproval = false;
  const normalized = await Promise.all(items.map(async (item) => {
    const master = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", item.item_code);
    // P0-2: nhóm giá phải đi cùng — khách "Lẻ" không có chiết khấu đại lý.
    const expectedMicros = defaultAlumdoorDiscountPercent({
      ...master,
      item_code: item.item_code,
    }, customerGroup) * 1_000_000;
    const requestedMicros = item.discount_percentage === undefined || item.discount_percentage === null || item.discount_percentage === ""
      ? expectedMicros
      : toScaledInt(item.discount_percentage, 6, "discount_percentage");
    if (requestedMicros < 0 || requestedMicros > 100_000_000) {
      throw errors.validation("discount_percentage must be from 0 to 100");
    }
    if (requestedMicros !== expectedMicros) requiresApproval = true;
    return { ...item, discount_percentage: fromScaledInt(requestedMicros, 6) };
  }));
  return { items: normalized, requiresApproval };
}

export class DeliveryNoteController extends BaseController<DeliveryNoteData> {
  readonly doctype = "Delivery Note";

  protected status(context: ControllerContext<DeliveryNoteData>, data: DeliveryNoteData): string {
    return deriveDeliveryNoteStatus(nextDocStatus(context.command.action), data.issue_purpose);
  }

  async normalize(context: ControllerContext<DeliveryNoteData>): Promise<DeliveryNoteData> {
    const input = context.command.document;
    if (!input.company || !input.currency) throw errors.validation("Company and currency are required");
    const requestedSources = deliverySourceGroups(input);
    const issuePurpose = input.issue_purpose ?? (requestedSources.size > 0 ? "Bán hàng" : undefined);
    if (!issuePurpose || !DELIVERY_ISSUE_PURPOSES.has(issuePurpose)) {
      throw errors.validation("A valid issue purpose is required");
    }
    if (issuePurpose === "Bán hàng" && (!input.customer || requestedSources.size === 0)) {
      throw errors.validation("Customer and Sales Order source are required for a sales delivery");
    }
    if (issuePurpose !== "Bán hàng" && requestedSources.size > 0) {
      throw errors.validation("Sales Order sources are only allowed when issue purpose is Bán hàng");
    }
    let normalizedCustomer = input.customer;
    if (input.items.length === 0) throw errors.validation("At least one delivery item is required");
    const currency = await resolveCurrencyContext(context, input.company, input.currency, input.posting_at);
    const currencyScale = currency.transactionScale;
    const stockItems = await applyUomConversion(
      context as unknown as ControllerContext<JsonObject>,
      normalizeStockItems(input.items, currencyScale),
      { transactionKind: "sales" },
    );
    const items = normalizeDeliveryWeights(stockItems, context.command.action === "submit");
    // Negative stock disables the stock_balance_guard trigger, so it is a
    // server-authoritative decision — never trust the client-supplied flag.
    const allowNegativeStock = resolveAllowNegativeStock(context, input.allow_negative_stock);
    if (context.command.action === "submit") {
      await assertMasterData(context, [
        ["Company", input.company], ["Currency", input.currency],
        ...(input.customer ? [["Customer", input.customer] as [string, string]] : []),
        ...items.map((item): [string, string] => ["Item", item.item_code]),
        ...items.map((item): [string, string] => ["Warehouse", item.warehouse!]),
      ]);
      await assertPostingUnlocked(context, input.company, input.posting_at);
      for (const [salesOrderName, sourceItems] of requestedSources) {
        const salesOrder = await requireSubmittedDocument<SalesOrderData>(context, "Sales Order", salesOrderName);
        normalizedCustomer ??= salesOrder.data.customer;
        assertSameCommercialContext(
          { customer: normalizedCustomer, company: input.company, currency: input.currency },
          salesOrder.data,
          "Delivery Note",
          "Sales Order",
        );
        await assertSalesOrderDeliveryLines(
          context as unknown as ControllerContext<JsonObject>,
          salesOrder,
          sourceItems.map((sourceItem) => items[sourceItem.index]!),
        );
        const orderDate = String(salesOrder.data.transaction_date ?? "").slice(0, 10);
        const postingDate = String(input.posting_at ?? "").slice(0, 10);
        if (orderDate && postingDate && orderDate > postingDate) {
          throw errors.reference(`Sales Order ${salesOrderName} is dated after Delivery Note posting date`);
        }
      }
      if (!allowNegativeStock) {
        for (const item of items) {
          const balance = await context.reader.getStockBalanceMicros(context.command.tenant_id, item.item_code, item.warehouse!);
          const requestedStockQty = stockQtyMicros(item);
          if (balance < requestedStockQty) {
            throw errors.reference(`Insufficient stock for ${item.item_code} in ${item.warehouse}`, {
              available_qty_micros: balance,
              requested_qty_micros: requestedStockQty,
            });
          }
        }
      }
    }
    let valuedItems = items;
    if (context.command.action === "submit") {
      valuedItems = [];
      const priorIssues = new Map<string, StockLedgerEntry[]>();
      for (const [index, item] of items.entries()) {
        const qty = stockQtyMicros(item);
        const stockKey = `${item.item_code}\u0000${item.warehouse!}`;
        const valuation = await deriveOutgoingValuation(context as unknown as ControllerContext<JsonObject>, {
          itemCode: item.item_code,
          warehouse: item.warehouse!,
          qtyMicros: qty,
          postingAt: input.posting_at,
          currencyScale,
          dimensions: {
            ...(item.color ? { color: String(item.color) } : {}),
            ...(typeof item.length_m === "string" || typeof item.length_m === "number" ? { length_m: item.length_m } : {}),
            ...(item.condition ? { condition: String(item.condition) } : {}),
            ...(typeof item.is_stamped === "string" || typeof item.is_stamped === "number" || typeof item.is_stamped === "boolean" ? { is_stamped: item.is_stamped } : {}),
          },
          ...(!item.serial_and_batch_bundle ? { priorIssues: priorIssues.get(stockKey) ?? [] } : {}),
        });
        const valuedItem: SalesItem = {
          ...item,
          valuation_rate_minor: valuation.valuation_rate_minor,
          valuation_rate: fromScaledInt(valuation.valuation_rate_minor, currencyScale),
          stock_value_difference_minor: valuation.stock_value_difference_minor,
          ...(!item.serial_and_batch_bundle && valuation.fifo_allocations?.length
            ? { fifo_allocations: valuation.fifo_allocations }
            : {}),
        };
        valuedItems.push(valuedItem);
        if (!item.serial_and_batch_bundle) {
          const planned: StockLedgerEntry = {
            line_key: `PREVIEW-ITEM-${item.row_id || index + 1}`,
            item_code: item.item_code,
            warehouse: item.warehouse!,
            actual_qty_micros: -qty,
            valuation_rate_minor: valuation.valuation_rate_minor,
            stock_value_difference_minor: valuation.stock_value_difference_minor,
            qty_scale: 6,
            currency_scale: currencyScale,
            currency: input.currency,
            posting_at: input.posting_at,
          };
          priorIssues.set(stockKey, [...(priorIssues.get(stockKey) ?? []), planned]);
        }
      }
    }
    const sourceSalesOrders = [...deliverySourceGroups({ ...input, items: valuedItems }).keys()].sort();
    const { against_sales_order: _legacySource, source_sales_orders: _legacySources, ...rest } = input;
    return {
      ...rest,
      ...(normalizedCustomer ? { customer: normalizedCustomer } : {}),
      ...(sourceSalesOrders.length === 1 ? { against_sales_order: sourceSalesOrders[0] } : {}),
      ...(sourceSalesOrders.length ? { source_sales_orders: sourceSalesOrders } : {}),
      issue_purpose: issuePurpose,
      currency_scale: currencyScale,
      allow_negative_stock: allowNegativeStock,
      items: valuedItems,
    };
  }

  async ledger(context: ControllerContext<DeliveryNoteData>, data: DeliveryNoteData): Promise<{ gl: GeneralLedgerEntry[]; stock: StockLedgerEntry[]; fulfillment: FulfillmentEntry[]; stockBundleUsages: StockBundleUsageEntry[] }> {
    if (context.command.action !== "submit" && context.command.action !== "cancel") return { gl: [], stock: [], fulfillment: [], stockBundleUsages: [] };
    if (context.command.action === "cancel") {
      const originalRevision = requireExisting(context).version;
      const [originalGl, originalStock] = await Promise.all([
        context.reader.getVoucherGlEntries(
          context.command.tenant_id,
          this.doctype,
          context.command.aggregate.name,
          originalRevision,
        ),
        context.reader.getVoucherStockEntries(
          context.command.tenant_id,
          this.doctype,
          context.command.aggregate.name,
          originalRevision,
        ),
      ]);
      if (originalStock.length === 0) {
        throw errors.reference(`Original stock posting for ${this.doctype} ${context.command.aggregate.name} was not found`);
      }
      const fulfillment = deliveryFulfillmentEntries(data, true);
      const stockBundleUsages = data.items.flatMap((item, index): StockBundleUsageEntry[] => (
        item.serial_and_batch_bundle
          ? [{
            line_key: `REV-BUNDLE-ITEM-${item.row_id || index + 1}`,
            bundle_name: item.serial_and_batch_bundle,
            item_code: item.item_code,
            warehouse: item.warehouse!,
            direction: "Outward",
            usage_delta: -1,
            posting_at: data.posting_at,
          }]
          : []
      ));
      return {
        gl: reverseGl(originalGl),
        stock: reverseStock(originalStock),
        fulfillment,
        stockBundleUsages,
      };
    }
    const currencyScale = data.currency_scale ?? 2;
    const normal: StockLedgerEntry[] = []; const usages: StockBundleUsageEntry[] = []; const gl: GeneralLedgerEntry[] = [];
    for (const [index,item] of data.items.entries()) {
      const qty = stockQtyMicros(item);
      const valuationRateMinor = item.valuation_rate_minor ?? toScaledInt(item.valuation_rate ?? item.rate,currencyScale);
      const value = Math.abs(item.stock_value_difference_minor ?? multiplyScaled(fromScaledInt(qty,6),6,item.valuation_rate ?? item.rate,6,currencyScale));
      const tracked = await buildTrackedStockLines(context as unknown as ControllerContext<JsonObject>, { itemCode:item.item_code,warehouse:item.warehouse!,qtyMicros:qty,direction:"Outward",postingAt:data.posting_at,currency:data.currency,currencyScale,valuationRateMinor,stockValueMinor:value,lineKey:`ITEM-${item.row_id||index+1}`,sourceRowId:item.row_id||`ROW-${index+1}`,...(item.weight_micros !== undefined ? { weightMicros:item.weight_micros } : {}),...(item.serial_and_batch_bundle ? { bundleName:item.serial_and_batch_bundle } : {}),...(!item.serial_and_batch_bundle && item.fifo_allocations?.length ? { automaticFifoAllocations:item.fifo_allocations } : {}),allowNegativeStock:Boolean(data.allow_negative_stock) });
      normal.push(...tracked.stock); usages.push(...tracked.usages);
      // Giá vốn ghi sổ cái LẤY TỪ sổ kho, không dùng lại `value` tính trước khi gọi.
      // Định giá theo từng lô làm tổng khác con số tính theo cả dòng; giữ `value` ở đây là
      // để sổ cái kể một câu chuyện khác sổ kho, và không phép kiểm nào đối chiếu hai cái đó.
      const postedValue = tracked.stockValueMinor;
      const itemMaster=await context.reader.getMasterRecordData(context.command.tenant_id,"Item",item.item_code); const company=await context.reader.getMasterRecordData(context.command.tenant_id,"Company",data.company);
      const stockAccount=await itemAccount(context as unknown as ControllerContext<JsonObject>,itemMaster,"inventory_account","default_inventory_account")
        || (typeof company?.default_inventory_account==="string"?company.default_inventory_account:"");
      const cogsAccount=await itemAccount(context as unknown as ControllerContext<JsonObject>,itemMaster,"cogs_account","default_cogs_account")
        || (typeof company?.default_cogs_account==="string"?company.default_cogs_account:"");
      if(stockAccount&&cogsAccount){gl.push({line_key:`COGS-${item.row_id||index+1}`,account:cogsAccount,debit_minor:postedValue,credit_minor:0,currency:data.currency,currency_scale:currencyScale,posting_at:data.posting_at},{line_key:`STOCK-${item.row_id||index+1}`,account:stockAccount,debit_minor:0,credit_minor:postedValue,currency:data.currency,currency_scale:currencyScale,posting_at:data.posting_at});}
    }
    const fulfillment = deliveryFulfillmentEntries(data);
    return { gl,stock:normal,fulfillment,stockBundleUsages:usages };
  }

  eventTypes(context: ControllerContext<DeliveryNoteData>): string[] {
    const data = context.command.action === "cancel" ? context.existing?.data : context.command.document;
    const progressesSalesOrder = data ? deliverySourceGroups(data).size > 0 : false;
    if (context.command.action === "submit") return ["stock.posted", "delivery.updated", ...(progressesSalesOrder ? ["sales_order.progressed"] : [])];
    if (context.command.action === "cancel") return ["stock.reversed", "delivery.cancelled", ...(progressesSalesOrder ? ["sales_order.progressed"] : [])];
    return ["delivery.updated"];
  }
}

function deliverySourceGroups(data: Pick<DeliveryNoteData, "against_sales_order" | "items">): Map<string, Array<{ item: SalesItem; index: number }>> {
  const groups = new Map<string, Array<{ item: SalesItem; index: number }>>();
  for (const [index, item] of data.items.entries()) {
    const source = String(item.sales_order ?? data.against_sales_order ?? "").trim();
    if (!source) continue;
    const rows = groups.get(source) ?? [];
    rows.push({ item, index });
    groups.set(source, rows);
  }
  return groups;
}

function deliveryFulfillmentEntries(data: DeliveryNoteData, reverse = false): FulfillmentEntry[] {
  if (data.issue_purpose !== "Bán hàng") return [];
  return [...deliverySourceGroups(data)].flatMap(([salesOrder, rows]) =>
    salesOrderFulfillmentEntries(salesOrder, "Delivery", rows.map((row) => row.item), data.posting_at, reverse));
}

export class SalesInvoiceController extends BaseController<SalesInvoiceData> {
  readonly doctype = "Sales Invoice";

  async normalize(context: ControllerContext<SalesInvoiceData>): Promise<SalesInvoiceData> {
    const input = context.command.document;
    if (!input.customer || !input.company || !input.currency) throw errors.validation("Customer, company and currency are required");
    if (!input.debit_to || !input.default_income_account) throw errors.validation("Receivable and income accounts are required");
    const currency = await resolveCurrencyContext(context, input.company, input.currency, input.posting_at);
    const currencyScale = currency.transactionScale;
    const itemSnapshots = await applyUomConversion(context as unknown as ControllerContext<JsonObject>, input.items, { transactionKind: "sales" });
    let sourceSalesOrder: CanonicalDocument<SalesOrderData> | null = null;
    let pricedItems: SalesItem[];
    if (input.against_sales_order) {
      if (context.command.action === "submit") {
        sourceSalesOrder = await requireSubmittedDocument<SalesOrderData>(context, "Sales Order", input.against_sales_order);
      } else {
        sourceSalesOrder = await context.reader.getDocument<SalesOrderData>(context.command.tenant_id, "Sales Order", input.against_sales_order);
        if (!sourceSalesOrder || sourceSalesOrder.docstatus === 2) {
          throw errors.reference(`Sales Order ${input.against_sales_order} is required`);
        }
      }
      assertSameCommercialContext(input, sourceSalesOrder.data, "Sales Invoice", "Sales Order");
      pricedItems = await freezeSalesOrderBillingLines(
        context as unknown as ControllerContext<JsonObject>,
        sourceSalesOrder,
        itemSnapshots,
        currencyScale,
        { enforceRemaining: context.command.action === "submit" },
      );
    } else {
      pricedItems = await applySellingPricing(context, itemSnapshots, input.selling_price_list, input.currency, input.posting_at, input.customer, input.customer_group);
    }
    const frozenHeaderDiscount = sourceSalesOrder?.data.additional_discount_percentage ?? input.additional_discount_percentage;
    const totals = calculateSalesTotals(pricedItems, input.taxes ?? [], currencyScale, {
      use_priced_quantity: true,
      use_server_line_money: Boolean(sourceSalesOrder),
      apply_discount_on: sourceSalesOrder?.data.apply_discount_on ?? input.apply_discount_on,
      additional_discount_percentage: frozenHeaderDiscount,
      ...(sourceSalesOrder ? {} : { discount_amount: input.discount_amount }),
    });
    if (totals.rounding_adjustment_minor !== 0 && !input.round_off_account) {
      throw errors.validation("round_off_account is required when rounding adjustment is non-zero");
    }
    if (context.command.action === "submit") {
      const accountRecords: Array<[string, string]> = [
        ["Account", input.debit_to], ["Account", input.default_income_account],
        ...totals.taxes.map((tax): [string, string] => ["Account", tax.account]),
      ];
      if (input.round_off_account) accountRecords.push(["Account", input.round_off_account]);
      await assertMasterData(context, [
        ["Company", input.company], ["Customer", input.customer], ["Currency", input.currency],
        ...accountRecords,
        ...totals.items.map((item): [string, string] => ["Item", item.item_code]),
      ]);
      await assertPostingUnlocked(context, input.company, input.posting_at);
    }
    // SO-derived billing was validated by exact source row before totals. Item-code
    // aggregation is intentionally not used here because configured rows may share an item.
    return {
      ...input,
      ...(sourceSalesOrder?.data.selling_price_list ? { selling_price_list: sourceSalesOrder.data.selling_price_list } : {}),
      ...(sourceSalesOrder?.data.customer_group ? { customer_group: sourceSalesOrder.data.customer_group } : {}),
      ...(sourceSalesOrder?.data.apply_discount_on ? { apply_discount_on: sourceSalesOrder.data.apply_discount_on } : {}),
      ...(frozenHeaderDiscount !== undefined ? { additional_discount_percentage: frozenHeaderDiscount } : {}),
      currency_scale: currencyScale,
      ...totals,
      ...baseTotals(totals, currency, currencyScale),
      company_currency: currency.companyCurrency,
      company_currency_scale: currency.companyScale,
      conversion_rate: fromScaledInt(currency.rateMicros, 6),
      conversion_rate_micros: currency.rateMicros,
      outstanding_amount_minor: totals.grand_total_minor,
      outstanding_amount: totals.grand_total,
    };
  }

  async ledger(context: ControllerContext<SalesInvoiceData>, data: SalesInvoiceData): Promise<{ gl: GeneralLedgerEntry[]; payment: PaymentLedgerEntry[]; fulfillment: FulfillmentEntry[] }> {
    if (context.command.action !== "submit" && context.command.action !== "cancel") return { gl: [], payment: [], fulfillment: [] };
    const transactionScale = data.currency_scale ?? 2;
    const companyScale = data.company_currency_scale ?? transactionScale;
    const companyCurrency = data.company_currency ?? data.currency;
    const rateMicros = data.conversion_rate_micros ?? 1_000_000;
    const grandMinor = data.grand_total_minor ?? toScaledInt(data.grand_total ?? "0", transactionScale);
    // Vá 21/08/2026 (docs/audits/ALUMDOOR-KE-TOAN-SAU-VONG2-20260821.md §1 S1): `assertNonNegativeMinor`
    // trước đây là luật ngủ — export mà 0 nơi gọi. Đây là điểm ghi tiền đúng nghĩa: `grandMinor`/`netMinor`
    // đi thẳng vào `debit_minor`/`credit_minor` của bút toán RECEIVABLE/INCOME bên dưới mà không qua bước
    // lật dấu nào. Một lỗi logic chiết khấu/thuế phía trên tạo ra tổng âm sẽ bị CHẶN Ở ĐÂY thay vì chảy
    // tiếp thành một bút toán ghi ngược mà `assertBalancedGl` (chỉ so debit=credit) không phát hiện được.
    assertNonNegativeMinor(grandMinor, "grand_total_minor");
    if (context.command.action === "cancel") {
      const outstanding = await context.reader.getOutstandingMinor(context.command.tenant_id, "Sales Invoice", context.command.aggregate.name);
      if (outstanding !== grandMinor) {
        throw errors.reference("Sales Invoice cannot be cancelled while active Payment Entries are allocated", {
          outstanding_minor: outstanding,
          invoice_total_minor: grandMinor,
        });
      }
    }
    const netMinor = data.net_total_minor ?? toScaledInt(data.net_total ?? "0", transactionScale);
    assertNonNegativeMinor(netMinor, "net_total_minor");
    const baseGrand = data.base_grand_total_minor ?? convertMinor(grandMinor, transactionScale, rateMicros, companyScale, "base grand total");
    const baseNet = data.base_net_total_minor ?? convertMinor(netMinor, transactionScale, rateMicros, companyScale, "base net total");
    const normal: GeneralLedgerEntry[] = [
      {
        line_key: "RECEIVABLE", account: data.debit_to, party_type: "Customer", party: data.customer,
        debit_minor: baseGrand, credit_minor: 0, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at,
      },
      {
        line_key: "INCOME", account: data.default_income_account,
        debit_minor: 0, credit_minor: baseNet, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at,
      },
    ];
    let componentCredits = baseNet;
    for (const [index, tax] of (data.taxes ?? []).entries()) {
      const transactionTax = tax.tax_amount_minor ?? toScaledInt(tax.tax_amount ?? "0", transactionScale);
      if (transactionTax === 0) continue;
      const baseTax = convertMinor(Math.abs(transactionTax), transactionScale, rateMicros, companyScale, `taxes[${index}].base_tax`);
      componentCredits += transactionTax > 0 ? baseTax : -baseTax;
      normal.push({
        line_key: `TAX-${tax.row_id || index + 1}`, account: tax.account,
        debit_minor: transactionTax < 0 ? baseTax : 0,
        credit_minor: transactionTax > 0 ? baseTax : 0,
        currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at,
      });
    }
    const balanceDifference = baseGrand - componentCredits;
    if (balanceDifference !== 0) {
      if (!data.round_off_account) throw errors.validation("round_off_account is required to balance invoice rounding");
      normal.push({
        line_key: "ROUND-OFF", account: data.round_off_account,
        debit_minor: balanceDifference < 0 ? -balanceDifference : 0,
        credit_minor: balanceDifference > 0 ? balanceDifference : 0,
        currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at,
      });
    }
    const payment: PaymentLedgerEntry[] = [{
      line_key: "RECEIVABLE",
      account_type: "Receivable",
      party_type: "Customer",
      party: data.customer,
      account: data.debit_to,
      amount_minor: grandMinor,
      base_amount_minor: baseGrand,
      currency: data.currency,
      currency_scale: transactionScale,
      against_voucher_type: "Sales Invoice",
      against_voucher_no: context.command.aggregate.name,
      posting_at: data.posting_at,
    }];
    const fulfillment: FulfillmentEntry[] = data.against_sales_order
      ? salesOrderFulfillmentEntries(data.against_sales_order, "Billing", data.items, data.posting_at)
      : [];
    return context.command.action === "cancel"
      ? {
        gl: reverseGl(normal),
        payment: reversePayment(payment),
        fulfillment: fulfillment.map((line) => ({ ...line, line_key: `REV-${line.line_key}`, qty_micros: -line.qty_micros })),
      }
      : { gl: normal, payment, fulfillment };
  }

  eventTypes(context: ControllerContext<SalesInvoiceData>): string[] {
    if (context.command.action === "submit") return ["gl.posted", "receivable.updated", "sales_invoice.submitted", "sales_order.progressed"];
    if (context.command.action === "cancel") return ["gl.reversed", "receivable.updated", "sales_invoice.cancelled", "sales_order.progressed"];
    return ["sales_invoice.updated"];
  }
}

export class PaymentEntryController extends BaseController<PaymentEntryData> {
  readonly doctype = "Payment Entry";

  async normalize(context: ControllerContext<PaymentEntryData>): Promise<PaymentEntryData> {
    const input = context.command.document;
    const receive = input.payment_type === "Receive";
    const pay = input.payment_type === "Pay";
    if (!receive && !pay) throw errors.validation("Payment Entry supports Receive or Pay");
    const expectedPartyType = receive ? "Customer" : "Supplier";
    const referenceDoctype = receive ? "Sales Invoice" : "Purchase Invoice";
    if (input.party_type !== expectedPartyType) throw errors.validation(`${input.payment_type} payment requires ${expectedPartyType} party type`);
    if (!input.party || !input.company || !input.paid_from || !input.paid_to || !input.currency) {
      throw errors.validation("Company, party, accounts and currency are required");
    }
    if (input.references.length === 0) throw errors.validation("At least one payment reference is required");
    const currency = await resolveCurrencyContext(context, input.company, input.currency, input.posting_at);
    const transactionScale = currency.transactionScale;
    const partyAccount = receive ? input.paid_from : input.paid_to;
    const bankAccount = receive ? input.paid_to : input.paid_from;
    if (context.command.action === "submit") {
      const records: Array<[string, string]> = [
        ["Company", input.company], [expectedPartyType, input.party], ["Currency", input.currency],
        ["Account", partyAccount], ["Account", bankAccount],
      ];
      if (input.exchange_gain_loss_account) records.push(["Account", input.exchange_gain_loss_account]);
      await assertMasterData(context, records);
      await assertPostingUnlocked(context, input.company, input.posting_at);
    }
    const paidMinor = toScaledInt(input.paid_amount, transactionScale, "paid_amount");
    if (paidMinor <= 0) throw errors.validation("Payment amount must be positive");
    const basePaidMinor = convertMinor(paidMinor, transactionScale, currency.rateMicros, currency.companyScale, "base paid amount");
    const suppliedBankMinor = toScaledInt(input.received_amount, currency.companyScale, "received_amount");
    if (suppliedBankMinor !== basePaidMinor) {
      throw errors.validation("received_amount must equal the server-converted paid_amount", {
        expected_received_minor: basePaidMinor,
        supplied_received_minor: suppliedBankMinor,
      });
    }
    const bankMinor = basePaidMinor;
    const seen = new Set<string>();
    const references = [];
    let baseAllocatedTotal = 0;
    for (const [index, reference] of input.references.entries()) {
      if (reference.reference_doctype !== referenceDoctype) throw errors.validation(`Only ${referenceDoctype} references are supported for ${input.payment_type}`);
      const key = `${reference.reference_doctype}:${reference.reference_name}`;
      if (seen.has(key)) throw errors.validation(`Duplicate payment reference at row ${index + 1}`);
      seen.add(key);
      const allocatedMinor = toScaledInt(reference.allocated_amount, transactionScale, `references[${index}].allocated_amount`);
      if (allocatedMinor <= 0) throw errors.validation(`Allocated amount must be positive at row ${index + 1}`);
      let baseAllocated = convertMinor(allocatedMinor, transactionScale, currency.rateMicros, currency.companyScale, `references[${index}].base_allocated_amount`);
      if (context.command.action === "submit") {
        const invoice = await requireSubmittedDocument<JsonObject>(context, referenceDoctype, reference.reference_name);
        const invoiceParty = receive ? invoice.data.customer : invoice.data.supplier;
        if (invoiceParty !== input.party) throw errors.reference(`${referenceDoctype} ${reference.reference_name} belongs to another ${expectedPartyType.toLowerCase()}`);
        if (invoice.data.company !== input.company) throw errors.reference(`${referenceDoctype} ${reference.reference_name} belongs to another company`);
        if (invoice.data.currency !== input.currency) throw errors.reference(`${referenceDoctype} ${reference.reference_name} uses another currency`);
        if ((invoice.data.company_currency ?? invoice.data.currency) !== currency.companyCurrency) throw errors.reference(`${referenceDoctype} ${reference.reference_name} uses another company currency`);
        const invoicePartyAccount = receive ? invoice.data.debit_to : invoice.data.credit_to;
        if (invoicePartyAccount !== partyAccount) throw errors.reference(`${referenceDoctype} ${reference.reference_name} uses another ${receive ? "receivable" : "payable"} account`);
        const outstanding = await context.reader.getOutstandingMinor(context.command.tenant_id, referenceDoctype, reference.reference_name);
        const baseOutstanding = await context.reader.getBaseOutstandingMinor(context.command.tenant_id, referenceDoctype, reference.reference_name);
        if (allocatedMinor > outstanding) throw errors.reference(`Allocated amount exceeds outstanding for ${reference.reference_name}`, { outstanding_minor: outstanding, allocated_minor: allocatedMinor });
        const invoiceScale = typeof invoice.data.currency_scale === "number" ? invoice.data.currency_scale : transactionScale;
        const invoiceRate = typeof invoice.data.conversion_rate_micros === "number" ? invoice.data.conversion_rate_micros : 1_000_000;
        const historicalBase = convertMinor(allocatedMinor, invoiceScale, invoiceRate, currency.companyScale, `references[${index}].historical_base_allocated_amount`);
        baseAllocated = allocatedMinor === outstanding ? baseOutstanding : Math.min(historicalBase, baseOutstanding);
      }
      baseAllocatedTotal = addMinor([baseAllocatedTotal, baseAllocated], "base allocated amount");
      references.push({ ...reference, allocated_amount_minor: allocatedMinor, allocated_amount: fromScaledInt(allocatedMinor, transactionScale), base_allocated_amount_minor: baseAllocated, base_allocated_amount: fromScaledInt(baseAllocated, currency.companyScale) });
    }
    const allocatedMinor = addMinor(references.map((reference) => reference.allocated_amount_minor), "allocated amount");
    if (allocatedMinor !== paidMinor) throw errors.validation("Commercial payments require the full paid amount to be allocated", { paid_minor: paidMinor, allocated_minor: allocatedMinor });
    const differenceMinor = receive ? baseAllocatedTotal - bankMinor : bankMinor - baseAllocatedTotal;
    if (differenceMinor !== 0 && !input.exchange_gain_loss_account) throw errors.validation("exchange_gain_loss_account is required when historical liability and bank amount differ");
    return {
      ...input,
      currency_scale: transactionScale,
      company_currency: currency.companyCurrency,
      company_currency_scale: currency.companyScale,
      source_exchange_rate: fromScaledInt(currency.rateMicros, 6), source_exchange_rate_micros: currency.rateMicros,
      paid_amount_minor: paidMinor, paid_amount: fromScaledInt(paidMinor, transactionScale),
      base_paid_amount_minor: basePaidMinor, base_paid_amount: fromScaledInt(basePaidMinor, currency.companyScale),
      base_party_amount_minor: baseAllocatedTotal, base_party_amount: fromScaledInt(baseAllocatedTotal, currency.companyScale),
      ...(receive ? { base_receivable_amount_minor: baseAllocatedTotal, base_receivable_amount: fromScaledInt(baseAllocatedTotal, currency.companyScale) }
        : { base_payable_amount_minor: baseAllocatedTotal, base_payable_amount: fromScaledInt(baseAllocatedTotal, currency.companyScale) }),
      received_amount_minor: bankMinor, received_amount: fromScaledInt(bankMinor, currency.companyScale),
      difference_amount_minor: differenceMinor, difference_amount: fromScaledInt(differenceMinor, currency.companyScale),
      references, unallocated_amount_minor: 0, unallocated_amount: fromScaledInt(0, transactionScale),
    };
  }

  ledger(context: ControllerContext<PaymentEntryData>, data: PaymentEntryData): { gl: GeneralLedgerEntry[]; payment: PaymentLedgerEntry[] } {
    if (context.command.action !== "submit" && context.command.action !== "cancel") return { gl: [], payment: [] };
    const receive = data.payment_type === "Receive";
    const transactionScale = data.currency_scale ?? 2;
    const companyScale = data.company_currency_scale ?? transactionScale;
    const companyCurrency = data.company_currency ?? data.currency;
    const baseParty = data.base_party_amount_minor ?? data.base_receivable_amount_minor ?? data.base_payable_amount_minor
      ?? addMinor(data.references.map((reference) => reference.base_allocated_amount_minor ?? 0), "base party amount");
    const bank = data.received_amount_minor ?? toScaledInt(data.received_amount, companyScale);
    // Vá 21/08/2026 (docs/audits/ALUMDOOR-KE-TOAN-SAU-VONG2-20260821.md §1 S1) — cùng luật ngủ đã nối ở
    // `SalesInvoiceController.ledger()`. `baseParty`/`bank` đi thẳng vào `debit_minor`/`credit_minor`
    // của bút toán BANK/RECEIVABLE-PAYABLE ngay dưới; `difference` KHÔNG bị chặn ở đây vì âm/dương của
    // nó là tín hiệu hợp lệ để chọn nhánh lãi/lỗ tỷ giá, không phải một số tiền ghi thẳng.
    assertNonNegativeMinor(baseParty, "base_party_amount_minor");
    assertNonNegativeMinor(bank, "received_amount_minor");
    const difference = data.difference_amount_minor ?? (receive ? baseParty - bank : bank - baseParty);
    const partyAccount = receive ? data.paid_from : data.paid_to;
    const bankAccount = receive ? data.paid_to : data.paid_from;
    const normal: GeneralLedgerEntry[] = receive ? [
      { line_key: "BANK", account: bankAccount, debit_minor: bank, credit_minor: 0, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at },
      { line_key: data.party_type === "Supplier" ? "PAYABLE" : "RECEIVABLE", account: partyAccount, party_type: data.party_type, party: data.party, debit_minor: 0, credit_minor: baseParty, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at },
    ] : [
      { line_key: data.party_type === "Supplier" ? "PAYABLE" : "RECEIVABLE", account: partyAccount, party_type: data.party_type, party: data.party, debit_minor: baseParty, credit_minor: 0, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at },
      { line_key: "BANK", account: bankAccount, debit_minor: 0, credit_minor: bank, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at },
    ];
    if (difference !== 0) {
      if (!data.exchange_gain_loss_account) throw errors.validation("exchange_gain_loss_account is required for exchange difference");
      normal.push({ line_key: "EXCHANGE-DIFFERENCE", account: data.exchange_gain_loss_account, debit_minor: difference > 0 ? difference : 0, credit_minor: difference < 0 ? -difference : 0, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at });
    }
    const payment = data.references.map((reference): PaymentLedgerEntry => ({
      line_key: `ALLOC-${reference.row_id}`,
      account_type: receive ? "Receivable" : "Payable",
      party_type: data.party_type, party: data.party, account: partyAccount,
      amount_minor: negateMinor(reference.allocated_amount_minor ?? toScaledInt(reference.allocated_amount, transactionScale)),
      base_amount_minor: negateMinor(reference.base_allocated_amount_minor ?? 0), currency: data.currency, currency_scale: transactionScale,
      against_voucher_type: reference.reference_doctype, against_voucher_no: reference.reference_name, posting_at: data.posting_at,
    }));
    return context.command.action === "cancel" ? { gl: reverseGl(normal), payment: reversePayment(payment) } : { gl: normal, payment };
  }

  eventTypes(context: ControllerContext<PaymentEntryData>): string[] {
    if (context.command.action === "submit") return ["gl.posted", "payment_ledger.posted", "outstanding.updated"];
    if (context.command.action === "cancel") return ["gl.reversed", "payment_ledger.reversed", "outstanding.updated"];
    return ["payment_entry.updated"];
  }
}

function normalizeStockItems(items: SalesItem[], currencyScale: number): SalesItem[] {
  return items.map((item, index) => {
    if (!item.item_code) throw errors.validation(`Item code is required at row ${index + 1}`);
    if (!item.warehouse) throw errors.validation(`Warehouse is required at row ${index + 1}`);
    const qtyMicros = toScaledInt(item.qty, 6, `items[${index}].qty`);
    if (qtyMicros <= 0) throw errors.validation(`Quantity must be positive at row ${index + 1}`);
    const rateMicros = toScaledInt(item.rate, 6, `items[${index}].rate`);
    const valuation = item.valuation_rate ?? item.rate;
    const valuationMicros = toScaledInt(valuation, 6, `items[${index}].valuation_rate`);
    if (rateMicros < 0 || valuationMicros < 0) throw errors.validation(`Rate cannot be negative at row ${index + 1}`);
    return {
      ...item,
      qty: fromScaledInt(qtyMicros, 6),
      rate: fromScaledInt(rateMicros, 6),
      qty_micros: qtyMicros,
      rate_minor: toScaledInt(item.rate, currencyScale),
      valuation_rate: fromScaledInt(valuationMicros, 6),
      valuation_rate_minor: toScaledInt(valuation, currencyScale),
    };
  });
}

function normalizeDeliveryWeights(items: SalesItem[], required: boolean): SalesItem[] {
  return items.map((item, index) => {
    const catchWeight = item.has_catch_weight === true || item.has_catch_weight === 1;
    const weightMicros = item.weight_micros
      ?? (item.weight_kg === undefined ? undefined : toScaledInt(item.weight_kg, 6, `items[${index}].weight_kg`));
    if (catchWeight && required && weightMicros === undefined) {
      throw errors.validation(`Khối lượng xuất là bắt buộc cho mặt hàng cân theo kiện ở dòng ${index + 1}`);
    }
    if (weightMicros !== undefined && weightMicros <= 0) {
      throw errors.validation(`Khối lượng xuất phải lớn hơn 0 ở dòng ${index + 1}`);
    }
    return weightMicros === undefined
      ? item
      : { ...item, weight_micros: weightMicros, weight_kg: fromScaledInt(weightMicros, 6) };
  });
}

async function requireSubmittedDocument<T extends JsonObject>(
  context: ControllerContext<JsonObject>,
  doctype: string,
  name: string,
): Promise<CanonicalDocument<T>> {
  const document = await context.reader.getDocument<T>(context.command.tenant_id, doctype, name);
  if (!document) throw errors.reference(`${doctype} ${name} does not exist`);
  if (document.docstatus !== 1) throw errors.reference(`${doctype} ${name} must be submitted`);
  return document;
}

function assertSameCommercialContext(
  target: { customer: string; company: string; currency: string },
  source: { customer: string; company: string; currency: string },
  targetLabel: string,
  sourceLabel: string,
): void {
  if (target.customer !== source.customer) throw errors.reference(`${targetLabel} customer does not match ${sourceLabel}`);
  if (target.company !== source.company) throw errors.reference(`${targetLabel} company does not match ${sourceLabel}`);
  if (target.currency !== source.currency) throw errors.reference(`${targetLabel} currency does not match ${sourceLabel}`);
}

async function assertRemainingQuantity(
  context: ControllerContext<JsonObject>,
  input: {
    source: CanonicalDocument<SalesOrderData>;
    items: SalesItem[];
    targetParentDoctype: string;
    referenceField: string;
    referenceName: string;
    label: string;
    quantityKind: "stock" | "transaction";
  },
): Promise<void> {
  const orderByItem = aggregateItemQuantity(input.source.data.items, input.quantityKind);
  const currentByItem = aggregateItemQuantity(input.items, input.quantityKind);
  for (const [itemCode, requestedMicros] of currentByItem) {
    const orderedMicros = orderByItem.get(itemCode);
    if (orderedMicros === undefined) throw errors.reference(`Item ${itemCode} is not present in Sales Order ${input.referenceName}`);
    const alreadySubmitted = await context.reader.sumSubmittedChildQuantityMicros({
      tenantId: context.command.tenant_id,
      parentDoctype: input.targetParentDoctype,
      referenceField: input.referenceField,
      referenceName: input.referenceName,
      itemCode,
      excludeName: context.command.aggregate.name,
      quantityKind: input.quantityKind,
    });
    if (alreadySubmitted + requestedMicros > orderedMicros) {
      throw errors.reference(`Quantity ${input.label} for ${itemCode} exceeds Sales Order quantity`, {
        ordered_qty_micros: orderedMicros,
        already_submitted_qty_micros: alreadySubmitted,
        requested_qty_micros: requestedMicros,
      });
    }
  }
}

function aggregateItemQuantity(items: SalesItem[], quantityKind: "stock" | "transaction"): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of items) {
    const micros = quantityKind === "stock"
      ? stockQtyMicros(item)
      : item.qty_micros ?? toScaledInt(item.qty, 6, `${item.item_code}.qty`);
    result.set(item.item_code, (result.get(item.item_code) ?? 0) + micros);
  }
  return result;
}

interface ResolvedCurrencyContext {
  transactionScale: number;
  companyCurrency: string;
  companyScale: number;
  rateMicros: number;
}

async function applySellingPricing<T extends SalesItem>(context: ControllerContext<JsonObject>, items: T[], priceList: string | undefined, currency: string, postingDate: string, customer: string, customerGroup?: string): Promise<T[]> {
  if (!priceList) return items;
  const allowsManualOverride = String(context.command.document.company ?? "").trim() === "ALUMDOOR";
  return Promise.all(items.map(async (item) => {
    // Bậc giá phải chạy trên đúng trục của đơn giá. Hầu hết dòng dùng transaction qty;
    // catch-weight dùng số kg thực mà UOM core đã chụp vào priced_qty_micros.
    const qtyMicros = pricedQtyMicros(item);
    const priceUom = typeof item.rate_uom === "string" && item.rate_uom.trim()
      ? item.rate_uom.trim()
      : typeof item.uom === "string" ? item.uom.trim() : "";
    // Diện tích một bộ phải đi cùng yêu cầu tra giá ở ĐÂY nữa, không chỉ ở đường Đơn hàng.
    //
    // Đây là đường tra giá của Hoá đơn bán KHÔNG lập từ đơn (`controllers.ts` ~629; hoá đơn lập
    // từ đơn thì đóng băng dòng của đơn). `priceTierMatches` fail-closed khi thiếu diện tích,
    // nên bỏ trống ở đây nghĩa là: ngay khi mặt hàng đầu tiên có dòng giá theo bậc, báo giá và
    // đơn hàng vẫn ra giá bình thường còn hoá đơn bán lẻ cùng mặt hàng đó ném
    // "Item Price … does not exist for variant STANDARD".
    const areaPerSet = areaTierBasisSqm(item as unknown as { area_per_set_sqm?: unknown; billable_area_sqm?: unknown; set_count?: unknown });
    /**
     * BIẾN THỂ GIÁ phải đi cùng yêu cầu tra giá ở ĐÂY nữa. `commercial-line-resolver.ts:116`
     * truyền `priceVariant`, đường này thì không — nên mọi dòng đi qua đây đều tra biến thể
     * `STANDARD` bất kể người bán chọn gì.
     *
     * Không lộ ra chừng nào mặt hàng còn một dòng giá STANDARD. Ngày 21/08/2026, sau khi bảng
     * giá cửa chuyển hẳn sang các biến thể theo ảnh (CHI_LA/TANG_RAY cho cửa Đức,
     * KEO_TAY/MOTOR_NGOAI cho cửa Úc, TRON_BO/TACH_MON cho Đài Loan) và các dòng STANDARD cũ
     * lấy từ sheet ĐM bị gỡ, thì KHÔNG cánh cửa nào bán được nữa: "Item Price … does not exist
     * for variant STANDARD", kể cả khi dòng bán ghi rõ CHI_LA.
     */
    const bienThe = typeof item.price_variant === "string" && item.price_variant.trim() ? item.price_variant.trim() : "";
    const price = await resolveServerPrice(context, { itemCode:item.item_code, qtyMicros, postingDate, priceList, documentCurrency:currency, ...(priceUom ? { uom:priceUom } : {}), ...(areaPerSet === undefined ? {} : { billableAreaSqm: areaPerSet }), ...(bienThe ? { priceVariant: bienThe } : {}), partyType:"Customer", party:customer, ...(customerGroup?{customerGroup}:{}) });
    const hasSubmittedRate = allowsManualOverride && item.rate !== undefined && item.rate !== null && String(item.rate).trim() !== "";
    const submittedRateMinor = hasSubmittedRate
      ? toScaledInt(item.rate, price.currency_scale, `${item.item_code}.rate`)
      : price.rate_minor;
    const rateChanged = hasSubmittedRate && submittedRateMinor !== price.rate_minor;
    return {
      ...item,
      rate: rateChanged ? item.rate : price.rate,
      rate_minor: rateChanged ? submittedRateMinor : price.rate_minor,
      standard_rate: price.rate,
      rate_requires_approval: rateChanged,
      item_price: price.item_price,
      ...(price.pricing_rule?{pricing_rule:price.pricing_rule}:{}),
      ...(price.discount_percentage?{discount_percentage:price.discount_percentage}:{}),
    };
  }));
}

async function resolveCurrencyContext(
  context: ControllerContext<JsonObject>,
  company: string,
  documentCurrency: string,
  postingAt: string,
): Promise<ResolvedCurrencyContext> {
  const currencyData = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", documentCurrency);
  const transactionScale = masterCurrencyScale(currencyData, documentCurrency, context.command.action === "submit");

  const companyData = await context.reader.getMasterRecordData(context.command.tenant_id, "Company", company);
  const configuredCurrency = companyData?.default_currency;
  const companyCurrency = typeof configuredCurrency === "string" && configuredCurrency
    ? configuredCurrency
    : documentCurrency;
  if (context.command.action === "submit" && (!companyData || typeof configuredCurrency !== "string" || !configuredCurrency)) {
    throw errors.reference(`Company ${company} must define default_currency`);
  }

  const companyCurrencyData = companyCurrency === documentCurrency
    ? currencyData
    : await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", companyCurrency);
  const companyScale = masterCurrencyScale(companyCurrencyData, companyCurrency, context.command.action === "submit");
  if (companyCurrency === documentCurrency) {
    return { transactionScale, companyCurrency, companyScale, rateMicros: 1_000_000 };
  }

  const postingDate = postingAt.slice(0, 10);
  const names = [`${documentCurrency}:${companyCurrency}:${postingDate}`, `${documentCurrency}:${companyCurrency}`];
  for (const name of names) {
    const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Exchange Rate", name);
    if (!data) continue;
    const raw = data.rate;
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const rateMicros = toScaledInt(raw, 6, `Exchange Rate ${name}`);
    if (rateMicros <= 0) throw errors.reference(`Exchange Rate ${name} must be positive`);
    return { transactionScale, companyCurrency, companyScale, rateMicros };
  }
  throw errors.reference(`Exchange Rate ${documentCurrency}:${companyCurrency} does not exist or is disabled`);
}

function masterCurrencyScale(data: JsonObject | null, currency: string, required: boolean): number {
  const raw = data?.currency_scale;
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 && raw <= 6) return raw;
  if (required) throw errors.reference(`Currency ${currency} must define currency_scale`);
  // Drafts may be incomplete, but precision never comes from client input.
  return 2;
}

function convertMinor(
  amountMinor: number,
  sourceScale: number,
  rateMicros: number,
  targetScale: number,
  field: string,
): number {
  return multiplyScaled(fromScaledInt(amountMinor, sourceScale), sourceScale, fromScaledInt(rateMicros, 6), 6, targetScale, field);
}

function baseTotals(
  totals: { net_total_minor: number; total_taxes_and_charges_minor: number; grand_total_minor: number },
  currency: ResolvedCurrencyContext,
  sourceScale: number,
): Pick<SalesOrderData, "base_net_total" | "base_net_total_minor" | "base_total_taxes_and_charges" | "base_total_taxes_and_charges_minor" | "base_grand_total" | "base_grand_total_minor"> {
  const baseNet = convertMinor(totals.net_total_minor, sourceScale, currency.rateMicros, currency.companyScale, "base net total");
  const baseTax = convertMinor(totals.total_taxes_and_charges_minor, sourceScale, currency.rateMicros, currency.companyScale, "base tax total");
  const baseGrand = convertMinor(totals.grand_total_minor, sourceScale, currency.rateMicros, currency.companyScale, "base grand total");
  return {
    base_net_total_minor: baseNet, base_net_total: fromScaledInt(baseNet, currency.companyScale),
    base_total_taxes_and_charges_minor: baseTax, base_total_taxes_and_charges: fromScaledInt(baseTax, currency.companyScale),
    base_grand_total_minor: baseGrand, base_grand_total: fromScaledInt(baseGrand, currency.companyScale),
  };
}

async function assertMasterData(context: ControllerContext<JsonObject>, records: Array<[string, string]>): Promise<void> {
  const unique = new Set(records.map(([type, name]) => `${type}:${name}`));
  for (const key of unique) {
    const separator = key.indexOf(":");
    const recordType = key.slice(0, separator);
    const name = key.slice(separator + 1);
    if (!await context.reader.hasMasterRecord(context.command.tenant_id, recordType, name)) {
      throw errors.reference(`${recordType} ${name} does not exist or is disabled`);
    }
  }
}

/**
 * Tài khoản theo thứ tự Item → nhóm gần nhất → nhóm cha.
 *
 * Item Group là cây nên mặc định kế toán phải kế thừa. Chỉ khai field trên form mà không
 * đọc nó ở bút toán sẽ tạo cảm giác đã cấu hình trong khi sổ vẫn âm thầm dùng Company.
 */
async function itemAccount(
  context: ControllerContext<JsonObject>,
  item: JsonObject | null,
  itemField: string,
  groupField: string,
): Promise<string> {
  const direct = item?.[itemField];
  if (typeof direct === "string" && direct) return direct;
  let groupName = typeof item?.item_group === "string" ? item.item_group : "";
  const seen = new Set<string>();
  for (let depth = 0; groupName && depth < 24 && !seen.has(groupName); depth += 1) {
    seen.add(groupName);
    const group = await context.reader.getMasterRecordData(context.command.tenant_id, "Item Group", groupName);
    if (!group) break;
    const account = group[groupField];
    if (typeof account === "string" && account) return account;
    groupName = typeof group.parent_item_group === "string" ? group.parent_item_group : "";
  }
  return "";
}

async function assertPostingUnlocked(context: ControllerContext<JsonObject>, company: string, postingAt: string): Promise<void> {
  if (context.command.actor.roles.includes("System Manager") || context.command.actor.user_id === "Administrator") return;
  const lockDate = await context.reader.getPeriodLockDate(context.command.tenant_id, company);
  if (!lockDate) return;
  const postingDate = postingAt.slice(0, 10);
  if (postingDate <= lockDate) {
    throw errors.validation(`Posting date ${postingDate} is locked for ${company}`, { lock_date: lockDate });
  }
}

function requireExisting<T extends JsonObject>(context: ControllerContext<T>): CanonicalDocument<T> {
  if (!context.existing) throw errors.notFound();
  return context.existing;
}

/**
 * Negative stock bypasses the stock_balance_guard DB trigger, so only a
 * privileged operator may enable it. An ordinary submitter attempting to set
 * the flag is rejected rather than silently downgraded, to avoid confusion
 * over whether the invariant is in force.
 */
function resolveAllowNegativeStock(context: ControllerContext<JsonObject>, requested: boolean | undefined): boolean {
  if (requested !== true) return false;
  const actor = context.command.actor;
  const privileged = actor.user_id === "Administrator"
    || actor.roles.includes("Administrator")
    || actor.roles.includes("System Manager")
    || actor.roles.includes("Stock Manager");
  if (!privileged) throw errors.permission("Only Stock Manager or System Manager may allow negative stock");
  return true;
}

function extractChildren(parentDoctype: string, data: JsonObject): ChildRow[] {
  const rows: ChildRow[] = [];
  for (const [fieldname, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    for (const [index, candidate] of value.entries()) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const object = candidate as JsonObject;
      const rowId = typeof object.row_id === "string" ? object.row_id : `${fieldname}-${index + 1}`;
      rows.push({ fieldname, child_doctype: childDoctype(parentDoctype, fieldname), row_id: rowId, idx: index + 1, data: object });
    }
  }
  return rows;
}

function childDoctype(parentDoctype: string, fieldname: string): string {
  const mapping: Record<string, Record<string, string>> = {
    "Sales Order": { items: "Sales Order Item", taxes: "Sales Taxes and Charges" },
    "Delivery Note": { items: "Delivery Note Item" },
    "Sales Invoice": { items: "Sales Invoice Item", taxes: "Sales Taxes and Charges" },
    "Payment Entry": { references: "Payment Entry Reference" },
  };
  return mapping[parentDoctype]?.[fieldname] ?? "Dynamic Child";
}
