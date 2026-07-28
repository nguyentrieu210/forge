import type {
  CanonicalDocument, ChildRow, GeneralLedgerEntry, JsonObject, MutationPlan, PaymentLedgerEntry, ProcurementEntry, StockLedgerEntry, StockBundleUsageEntry, ManufacturingEntry,
} from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { reverseGl, reversePayment, reverseStock } from "../../ledger/src/index.js";
import { addMinor, fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import { buildTrackedStockLines } from "../../clouderp-stock/src/index.js";
import { resolveServerPrice } from "../../clouderp-pricing/src/index.js";
import { calculateSalesTotals } from "../../clouderp-selling/src/totals.js";
import type { TaxRow } from "../../clouderp-selling/src/types.js";
import { applyUomConversion, stockQtyMicros } from "./uom.js";
import type { JournalEntryData, JournalEntryLine, MaterialRequestData, MaterialRequestItem, PurchaseInvoiceData, PurchaseItem, PurchaseOrderData, PurchaseReceiptData, RequestForQuotationData, RequestForQuotationSupplier, StockEntryData, StockEntryItem, SupplierQuotationData } from "./types.js";

abstract class BaseController<T extends JsonObject> implements DocumentController<T> {
  abstract readonly doctype: string;
  abstract normalize(context: ControllerContext<T>): Promise<T> | T;
  abstract ledger(context: ControllerContext<T>, data: T): Promise<LedgerResult> | LedgerResult;
  abstract eventTypes(context: ControllerContext<T>): string[];
  status(context: ControllerContext<T>, _data: T): string {
    const ds = nextDocStatus(context.command.action); return ds === 0 ? "Draft" : ds === 1 ? "Submitted" : "Cancelled";
  }
  async buildPlan(context: ControllerContext<T>): Promise<MutationPlan<T>> {
    const data = context.command.action === "cancel" ? structuredClone(requireExisting(context).data) : await this.normalize(context);
    const docstatus = nextDocStatus(context.command.action); const status = this.status(context, data); const ledger = await this.ledger(context, data);
    const document: CanonicalDocument<T> = { tenant_id: context.command.tenant_id, doctype: this.doctype, name: context.command.aggregate.name,
      owner: context.existing?.owner ?? context.command.actor.user_id, docstatus, status, version: context.nextVersion,
      created_at: context.existing?.created_at ?? context.now, modified_at: context.now, data, children: extractChildren(this.doctype, data) };
    return { command: context.command, document, gl_entries: ledger.gl ?? [], stock_entries: ledger.stock ?? [], payment_entries: ledger.payment ?? [], fulfillment_entries: [], procurement_entries: ledger.procurement ?? [], stock_bundle_usages: ledger.stockBundleUsages ?? [], manufacturing_entries: ledger.manufacturing ?? [],
      events: this.eventTypes(context).map((type) => domainEvent({ type, tenantId: context.command.tenant_id, aggregate: context.command.aggregate, aggregateVersion: context.nextVersion, actor: context.command.actor.user_id, commandId: context.command.command_id, occurredAt: context.now, payload: { action: context.command.action, status } })),
      result: { doctype: this.doctype, name: document.name, version: document.version, docstatus, status } };
  }
}
interface LedgerResult { gl?: GeneralLedgerEntry[]; stock?: StockLedgerEntry[]; payment?: PaymentLedgerEntry[]; procurement?: ProcurementEntry[]; stockBundleUsages?: StockBundleUsageEntry[]; manufacturing?: ManufacturingEntry[] }

export class JournalEntryController extends BaseController<JournalEntryData> {
  readonly doctype = "Journal Entry";
  async normalize(context: ControllerContext<JournalEntryData>): Promise<JournalEntryData> {
    const input = context.command.document; if (!input.company || !input.posting_at) throw errors.validation("Company and posting_at are required");
    if (!Array.isArray(input.accounts) || input.accounts.length < 2) throw errors.validation("Journal Entry requires at least two account rows");
    const currency = await companyCurrency(context, input.company, context.command.action === "submit");
    const lines = input.accounts.map((line, index) => normalizeJournalLine(line, currency.scale, index));
    const debit = addMinor(lines.map((line) => line.debit_minor ?? 0), "total debit"); const credit = addMinor(lines.map((line) => line.credit_minor ?? 0), "total credit");
    if (debit <= 0 || debit !== credit) throw errors.validation("Journal Entry debits and credits must be equal and positive", { total_debit_minor: debit, total_credit_minor: credit });
    if (context.command.action === "submit") { await assertUnlocked(context, input.company, input.posting_at); await assertMasters(context, [["Company", input.company], ...lines.map((line): [string,string] => ["Account", line.account])]); }
    return { ...input, company_currency: currency.currency, company_currency_scale: currency.scale, accounts: lines, total_debit_minor: debit, total_credit_minor: credit, total_debit: fromScaledInt(debit, currency.scale), total_credit: fromScaledInt(credit, currency.scale) };
  }
  ledger(context: ControllerContext<JournalEntryData>, data: JournalEntryData): LedgerResult {
    if (!["submit","cancel"].includes(context.command.action)) return {};
    const lines = data.accounts.map((line, index): GeneralLedgerEntry => ({
      line_key: line.row_id || `ROW-${index+1}`, account: line.account,
      ...(line.party_type ? { party_type: line.party_type } : {}), ...(line.party ? { party: line.party } : {}),
      debit_minor: line.debit_minor ?? 0, credit_minor: line.credit_minor ?? 0, currency: data.company_currency!, currency_scale: data.company_currency_scale ?? 2,
      ...(line.cost_center ? { cost_center: line.cost_center } : {}), ...(line.accounting_dimensions ? { accounting_dimensions: line.accounting_dimensions } : {}),
      ...(data.user_remark ? { remarks: data.user_remark } : {}), posting_at: data.posting_at,
    }));
    return { gl: context.command.action === "cancel" ? reverseGl(lines) : lines };
  }
  eventTypes(context: ControllerContext<JournalEntryData>): string[] { return context.command.action === "submit" ? ["gl.posted","journal_entry.submitted"] : context.command.action === "cancel" ? ["gl.reversed","journal_entry.cancelled"] : ["journal_entry.updated"]; }
}

const MATERIAL_REQUEST_TYPES = ["Purchase", "Material Transfer", "Material Issue", "Manufacture"];

/**
 * YÊU CẦU VẬT TƯ — chỗ nhu cầu ra đời, trước khi có nhà cung cấp và trước khi có giá.
 *
 * Không ghi sổ nào cả, và đó là điều đúng: yêu cầu chưa cam kết tiền, chưa động vào kho.
 * Giá trị của nó nằm ở chỗ khác — nó cho phép hỏi "cái này ai yêu cầu" và "đã đặt mua đủ
 * chưa", hai câu mà một đơn mua đứng một mình không trả lời được. Hạn mức chống đặt vượt
 * nằm ở `assertRequestRemaining`, phía đơn mua.
 */
export class MaterialRequestController extends BaseController<MaterialRequestData> {
  readonly doctype = "Material Request";
  async normalize(context: ControllerContext<MaterialRequestData>): Promise<MaterialRequestData> {
    const input = context.command.document;
    if (!input.company || !input.transaction_date) throw errors.validation("Company and transaction date are required");
    if (!MATERIAL_REQUEST_TYPES.includes(input.material_request_type)) throw errors.validation(`Material request type must be one of ${MATERIAL_REQUEST_TYPES.join(", ")}`);
    if (!Array.isArray(input.items) || !input.items.length) throw errors.validation("At least one item is required");
    const items = await applyUomConversion(context, input.items.map((item, index): MaterialRequestItem => {
      if (!item.item_code) throw errors.validation(`Item is required at row ${index + 1}`);
      const qty = toScaledInt(item.qty, 6, `items[${index}].qty`);
      if (qty <= 0) throw errors.validation(`Quantity must be positive at row ${index + 1}`);
      return { ...item, row_id: item.row_id || `ROW-${index + 1}`, qty: fromScaledInt(qty, 6), qty_micros: qty };
    }));
    if (context.command.action === "submit") await assertMasters(context, [["Company", input.company], ...items.map((item): [string, string] => ["Item", item.item_code]), ...items.filter((item) => item.warehouse).map((item): [string, string] => ["Warehouse", item.warehouse!])]);
    return { ...input, items };
  }
  ledger(): LedgerResult { return {}; }
  status(context: ControllerContext<MaterialRequestData>): string { const ds = nextDocStatus(context.command.action); return ds === 0 ? "Draft" : ds === 2 ? "Cancelled" : "Pending"; }
  eventTypes(context: ControllerContext<MaterialRequestData>): string[] { return context.command.action === "submit" ? ["material_request.submitted"] : context.command.action === "cancel" ? ["material_request.cancelled"] : ["material_request.updated"]; }
}

/**
 * YÊU CẦU BÁO GIÁ — một rổ hàng, hỏi nhiều nhà cung cấp cùng lúc.
 *
 * Rổ hàng viết MỘT lần ở đây, mỗi NCC trả lời bằng một `Supplier Quotation` trỏ ngược về.
 * Nhờ vậy so giá là so trên cùng một danh sách, thay vì so ba tờ giấy mà tờ nào cũng
 * thiếu một món khác nhau — chuyện thường xảy ra khi hỏi giá bằng Zalo.
 */
export class RequestForQuotationController extends BaseController<RequestForQuotationData> {
  readonly doctype = "Request for Quotation";
  async normalize(context: ControllerContext<RequestForQuotationData>): Promise<RequestForQuotationData> {
    const input = context.command.document;
    if (!input.company || !input.transaction_date) throw errors.validation("Company and transaction date are required");
    if (!Array.isArray(input.suppliers) || !input.suppliers.length) throw errors.validation("At least one supplier is required");
    if (!Array.isArray(input.items) || !input.items.length) throw errors.validation("At least one item is required");
    const seen = new Set<string>();
    const suppliers = input.suppliers.map((row, index): RequestForQuotationSupplier => {
      if (!row.supplier) throw errors.validation(`Supplier is required at row ${index + 1}`);
      // Hỏi cùng một NCC hai lần trong một yêu cầu là lỗi nhập liệu, và nó làm bảng so
      // giá có hai cột giống hệt nhau — người đọc không biết cột nào là câu trả lời thật.
      if (seen.has(row.supplier)) throw errors.validation(`Supplier ${row.supplier} appears twice`);
      seen.add(row.supplier);
      return { ...row, row_id: row.row_id || `ROW-${index + 1}` };
    });
    const items = await applyUomConversion(context, input.items.map((item, index): MaterialRequestItem => {
      if (!item.item_code) throw errors.validation(`Item is required at row ${index + 1}`);
      const qty = toScaledInt(item.qty, 6, `items[${index}].qty`);
      if (qty <= 0) throw errors.validation(`Quantity must be positive at row ${index + 1}`);
      return { ...item, row_id: item.row_id || `ROW-${index + 1}`, qty: fromScaledInt(qty, 6), qty_micros: qty };
    }));
    if (context.command.action === "submit") {
      if (input.material_request) { const request = await requireSubmitted<MaterialRequestData>(context, "Material Request", input.material_request); if (request.data.company !== input.company) throw errors.reference(`Material Request ${input.material_request} belongs to another company`); }
      await assertMasters(context, [["Company", input.company], ...suppliers.map((row): [string, string] => ["Supplier", row.supplier]), ...items.map((item): [string, string] => ["Item", item.item_code])]);
    }
    return { ...input, suppliers, items };
  }
  ledger(): LedgerResult { return {}; }
  status(context: ControllerContext<RequestForQuotationData>): string { const ds = nextDocStatus(context.command.action); return ds === 0 ? "Draft" : ds === 2 ? "Cancelled" : "Sent"; }
  eventTypes(context: ControllerContext<RequestForQuotationData>): string[] { return context.command.action === "submit" ? ["request_for_quotation.submitted"] : context.command.action === "cancel" ? ["request_for_quotation.cancelled"] : ["request_for_quotation.updated"]; }
}

/**
 * BÁO GIÁ NHÀ CUNG CẤP — câu trả lời của MỘT nhà cung cấp cho một rổ hàng.
 *
 * Tính tổng bằng đúng bộ máy đã dùng cho đơn mua và hoá đơn mua (`calculateSalesTotals`),
 * nên con số so giá và con số cuối cùng phải trả là cùng một phép tính. Tự cộng lại ở đây
 * sẽ tạo ra một cách tính thứ hai, và hai cách tính thì sớm muộn lệch nhau.
 */
export class SupplierQuotationController extends BaseController<SupplierQuotationData> {
  readonly doctype = "Supplier Quotation";
  async normalize(context: ControllerContext<SupplierQuotationData>): Promise<SupplierQuotationData> {
    const input = context.command.document;
    if (!input.supplier || !input.company || !input.currency || !input.transaction_date) throw errors.validation("Supplier, company, currency and transaction date are required");
    if (!Array.isArray(input.items) || !input.items.length) throw errors.validation("At least one item is required");
    const currency = await resolveCurrency(context, input.company, input.currency, input.transaction_date, context.command.action === "submit");
    const totals = calculateSalesTotals(input.items as never, input.taxes ?? [], currency.transactionScale);
    const items = await applyUomConversion(context, totals.items as unknown as PurchaseItem[]);
    if (context.command.action === "submit") {
      if (input.request_for_quotation) {
        const rfq = await requireSubmitted<RequestForQuotationData>(context, "Request for Quotation", input.request_for_quotation);
        if (rfq.data.company !== input.company) throw errors.reference(`Request for Quotation ${input.request_for_quotation} belongs to another company`);
        // Một NCC không được hỏi mà tự gửi giá vào thì bảng so giá có một cột không ai
        // giải thích được — và nó là đường để lách quy trình chọn nhà cung cấp.
        if (!rfq.data.suppliers.some((row) => row.supplier === input.supplier)) throw errors.reference(`Supplier ${input.supplier} was not invited to ${input.request_for_quotation}`);
      }
      await assertMasters(context, [["Supplier", input.supplier], ["Company", input.company], ["Currency", input.currency], ...items.map((item): [string, string] => ["Item", item.item_code]), ...totals.taxes.map((tax): [string, string] => ["Account", tax.account])]);
    }
    return { ...input, currency_scale: currency.transactionScale, company_currency: currency.companyCurrency, company_currency_scale: currency.companyScale, conversion_rate: fromScaledInt(currency.rateMicros, 6), conversion_rate_micros: currency.rateMicros, ...(totals as unknown as JsonObject), items, ...baseTotals(totals, currency) } as SupplierQuotationData;
  }
  ledger(): LedgerResult { return {}; }
  status(context: ControllerContext<SupplierQuotationData>): string { const ds = nextDocStatus(context.command.action); return ds === 0 ? "Draft" : ds === 2 ? "Cancelled" : "Submitted"; }
  eventTypes(context: ControllerContext<SupplierQuotationData>): string[] { return context.command.action === "submit" ? ["supplier_quotation.submitted"] : context.command.action === "cancel" ? ["supplier_quotation.cancelled"] : ["supplier_quotation.updated"]; }
}

export class PurchaseOrderController extends BaseController<PurchaseOrderData> {
  readonly doctype = "Purchase Order";
  async normalize(context: ControllerContext<PurchaseOrderData>): Promise<PurchaseOrderData> {
    const input = context.command.document; if (!input.supplier || !input.company || !input.currency || !input.transaction_date) throw errors.validation("Supplier, company, currency and transaction date are required");
    const currency = await resolveCurrency(context, input.company, input.currency, input.transaction_date, context.command.action === "submit");
    const pricedItems=await applyBuyingPricing(context,input.items,input.buying_price_list,input.currency,input.transaction_date,input.supplier,input.supplier_group);const totals = calculateSalesTotals(pricedItems as never, input.taxes ?? [], currency.transactionScale);
    const items = await applyUomConversion(context, totals.items as unknown as PurchaseItem[]);
    if (context.command.action === "submit") { await assertMasters(context, [["Supplier",input.supplier],["Company",input.company],["Currency",input.currency],...items.map((item):[string,string]=>["Item",item.item_code]),...totals.taxes.map((tax):[string,string]=>["Account",tax.account])]);
      if (input.supplier_quotation) { const quotation = await requireSubmitted<SupplierQuotationData>(context,"Supplier Quotation",input.supplier_quotation); if (quotation.data.supplier!==input.supplier||quotation.data.company!==input.company||quotation.data.currency!==input.currency) throw errors.reference("Purchase Order commercial context does not match Supplier Quotation"); }
      if (input.material_request) await assertRequestRemaining(context, input.material_request, input.company, items); }
    return { ...input, currency_scale: currency.transactionScale, company_currency: currency.companyCurrency, company_currency_scale: currency.companyScale, conversion_rate: fromScaledInt(currency.rateMicros,6), conversion_rate_micros: currency.rateMicros,
      ...(totals as unknown as JsonObject), items, ...baseTotals(totals, currency), received_percentage:"0.00", billed_percentage:"0.00" } as PurchaseOrderData;
  }
  async ledger(context: ControllerContext<PurchaseOrderData>): Promise<LedgerResult> { if (context.command.action === "cancel" && await context.reader.getProcuredQuantityMicros(context.command.tenant_id, context.command.aggregate.name) !== 0) throw errors.reference("Purchase Order cannot be cancelled while submitted receipts or invoices exist"); return {}; }
  status(context: ControllerContext<PurchaseOrderData>): string { const ds=nextDocStatus(context.command.action); return ds===0?"Draft":ds===2?"Cancelled":"To Receive and Bill"; }
  eventTypes(context: ControllerContext<PurchaseOrderData>): string[] { return context.command.action === "submit" ? ["purchase_order.submitted"] : context.command.action === "cancel" ? ["purchase_order.cancelled"] : ["purchase_order.updated"]; }
}

export class PurchaseReceiptController extends BaseController<PurchaseReceiptData> {
  readonly doctype = "Purchase Receipt";
  async normalize(context: ControllerContext<PurchaseReceiptData>): Promise<PurchaseReceiptData> {
    const input=context.command.document; if(!input.supplier||!input.company||!input.currency||!input.posting_at) throw errors.validation("Supplier, company, currency and posting_at are required");
    const currency=await resolveCurrency(context,input.company,input.currency,input.posting_at,context.command.action==="submit"); const items=await applyUomConversion(context,normalizePurchaseStockItems(input.items,currency.transactionScale));
    /**
     * Đơn mua lấy theo TỪNG DÒNG, đầu phiếu chỉ là mặc định.
     *
     * Đây là chỗ giải bài toán N–N của mua hàng: một đơn giao làm nhiều đợt (đã chạy được từ
     * trước nhờ `assertPurchaseRemaining`), VÀ một chuyến giao gộp nhiều đơn — cái sau trước
     * đây không làm được, vì cả phiếu chỉ trỏ được về một đơn. Thủ kho phải tách một chuyến
     * xe, một biên bản giao nhận của NCC, thành hai phiếu nhập.
     *
     * Hạn mức "không nhận quá số đặt" vẫn giữ nguyên, nhưng phải kiểm THEO TỪNG ĐƠN: gom dòng
     * theo đơn rồi kiểm riêng. Kiểm gộp cả phiếu vào một đơn sẽ vừa từ chối nhầm, vừa cho lọt
     * phần vượt của đơn kia.
     */
    const orderOf=(item:PurchaseItem):string|undefined=>item.purchase_order??input.against_purchase_order;
    for(const [index,item] of items.entries()) if(!orderOf(item)) throw errors.validation(`Purchase Order is required at row ${index+1} (on the line or on the receipt)`);
    const allowNegative=Boolean(input.allow_negative_stock && (context.command.actor.roles.includes("Stock Manager")||context.command.actor.roles.includes("System Manager")));
    if(context.command.action==="submit") { await assertUnlocked(context,input.company,input.posting_at); await assertMasters(context,[["Supplier",input.supplier],["Company",input.company],["Currency",input.currency],...items.map((i):[string,string]=>["Item",i.item_code]),...items.map((i):[string,string]=>["Warehouse",i.warehouse!])]);
      const byOrder=new Map<string,PurchaseItem[]>();
      for(const item of items){const name=orderOf(item)!;const list=byOrder.get(name);if(list)list.push(item);else byOrder.set(name,[item]);}
      for(const [name,lines] of byOrder){const po=await requireSubmitted<PurchaseOrderData>(context,"Purchase Order",name); assertPurchaseContext(input,po.data,"Purchase Receipt"); await assertPurchaseRemaining(context,po,lines,"Receipt");} }
    return {...input,currency_scale:currency.transactionScale,items,allow_negative_stock:allowNegative};
  }
  async ledger(context: ControllerContext<PurchaseReceiptData>,data:PurchaseReceiptData):Promise<LedgerResult> { if(!["submit","cancel"].includes(context.command.action))return{}; const scale=data.currency_scale??2;
    const stock:StockLedgerEntry[]=[];const usages:StockBundleUsageEntry[]=[];
    /**
     * SỐ LƯỢNG vào sổ kho là số theo ĐƠN VỊ TỒN, còn TIỀN vẫn là tiền của hoá đơn.
     *
     * Mua 20 cây ray, mỗi cây 5,85 m: sổ kho ghi 117 mét, thành tiền vẫn 20 × đơn giá cây.
     * Kéo theo đó, giá vốn một đơn vị tồn phải chia lại — `giá 1 cây ÷ 5,85` — nếu không
     * thì 117 mét × giá-một-cây, tồn kho phình lên gần sáu lần so với số tiền đã trả.
     */
    for(const [index,item] of data.items.entries()){const valuation=item.valuation_rate??item.rate;const stockQty=stockQtyMicros(item);const value=multiplyScaled(item.qty,6,valuation,6,scale,`items[${index}].stock_value`);const ratePerStockUnit=divideRounded(value*1_000_000,stockQty);const tracked=await buildTrackedStockLines(context as unknown as ControllerContext<JsonObject>,{itemCode:item.item_code,warehouse:item.warehouse!,qtyMicros:stockQty,direction:"Inward",postingAt:data.posting_at,currency:data.currency,currencyScale:scale,valuationRateMinor:ratePerStockUnit,stockValueMinor:value,lineKey:`ITEM-${item.row_id||index+1}`,...(item.serial_and_batch_bundle?{bundleName:item.serial_and_batch_bundle}:{})});stock.push(...tracked.stock);usages.push(...tracked.usages);}
    const procurement=data.items.map((item,index):ProcurementEntry=>({line_key:`RECEIPT-${item.row_id||index+1}`,purchase_order:(item.purchase_order??data.against_purchase_order)!,kind:"Receipt",item_code:item.item_code,qty_micros:stockQtyMicros(item),posting_at:data.posting_at}));
    /**
     * Hàng về thì GHI SỔ CÁI, không chỉ ghi sổ kho.
     *
     *     Nợ Hàng tồn kho  /  Có Hàng đã nhận chưa có hoá đơn
     *
     * Thiếu bút toán này thì kho và sổ cái là hai thế giới rời nhau: hàng nằm trong kho mà
     * bảng cân đối không thấy tài sản lẫn khoản phải trả, và không cách nào đối chiếu hai sổ.
     * Tài khoản trung gian là thứ cho phép hàng về trước, hoá đơn về sau — chuyện thường
     * ngày ở Việt Nam — mà sổ vẫn cân: hoá đơn mua sau đó ghi Nợ chính tài khoản này.
     *
     * Có điều kiện, CÙNG KHUÔN với Delivery Note: app chưa khai hai tài khoản thì hành vi
     * không đổi, nên bản cập nhật này không làm lệch sổ của app đang chạy.
     */
    const gl:GeneralLedgerEntry[]=[];
    if(data.stock_account&&data.stock_received_but_not_billed){
      for(const [index,item] of data.items.entries()){
        const qty=item.qty_micros??toScaledInt(item.qty,6);
        const value=multiplyScaled(fromScaledInt(qty,6),6,item.valuation_rate??item.rate,scale,scale);
        if(value===0)continue;
        const key=item.row_id||index+1;
        gl.push({line_key:`STOCK-${key}`,account:data.stock_account,debit_minor:value,credit_minor:0,currency:data.currency,currency_scale:scale,posting_at:data.posting_at},
                {line_key:`SRBNB-${key}`,account:data.stock_received_but_not_billed,debit_minor:0,credit_minor:value,currency:data.currency,currency_scale:scale,posting_at:data.posting_at});
      }
    }
    return context.command.action==="cancel"?{gl:reverseGl(gl),stock:reverseStock(stock),procurement:procurement.map(x=>({...x,line_key:`REV-${x.line_key}`,qty_micros:-x.qty_micros})),stockBundleUsages:usages.map(line=>({...line,line_key:`REV-${line.line_key}`,usage_delta:-1 as const}))}:{gl,stock,procurement,stockBundleUsages:usages}; }
  eventTypes(context:ControllerContext<PurchaseReceiptData>):string[]{return context.command.action==="submit"?["stock.posted","purchase_receipt.submitted","purchase_order.progressed"]:context.command.action==="cancel"?["stock.reversed","purchase_receipt.cancelled","purchase_order.progressed"]:["purchase_receipt.updated"]}
}

export class PurchaseInvoiceController extends BaseController<PurchaseInvoiceData> {
  readonly doctype="Purchase Invoice";
  async normalize(context:ControllerContext<PurchaseInvoiceData>):Promise<PurchaseInvoiceData>{const input=context.command.document;if(!input.supplier||!input.company||!input.currency||!input.posting_at||!input.credit_to)throw errors.validation("Supplier, company, currency, posting_at and payable account are required");
    const currency=await resolveCurrency(context,input.company,input.currency,input.posting_at,context.command.action==="submit");const pricedItems=await applyBuyingPricing(context,input.items,input.buying_price_list,input.currency,input.posting_at,input.supplier,input.supplier_group);const totals=calculateSalesTotals(pricedItems as never,input.taxes??[],currency.transactionScale);const items=await applyUomConversion(context,(totals.items as unknown as PurchaseItem[]).map((item,index): PurchaseItem=>{const source=input.items[index]!;if(!source.expense_account)throw errors.validation(`Expense account is required at row ${index+1}`);return{...item,expense_account:source.expense_account,...(source.warehouse ? { warehouse: source.warehouse } : {})}}));
    if(context.command.action==="submit"){await assertUnlocked(context,input.company,input.posting_at);await assertMasters(context,[["Supplier",input.supplier],["Company",input.company],["Currency",input.currency],["Account",input.credit_to],...items.map(i=>["Item",i.item_code] as [string,string]),...items.map(i=>["Account",i.expense_account!] as [string,string]),...totals.taxes.map(t=>["Account",t.account] as [string,string])]);if(input.against_purchase_order){const po=await requireSubmitted<PurchaseOrderData>(context,"Purchase Order",input.against_purchase_order);assertPurchaseContext(input,po.data,"Purchase Invoice");await assertPurchaseRemaining(context,po,items,"Billing");}}
    const bases=baseTotals(totals,currency);return{...input,currency_scale:currency.transactionScale,company_currency:currency.companyCurrency,company_currency_scale:currency.companyScale,conversion_rate:fromScaledInt(currency.rateMicros,6),conversion_rate_micros:currency.rateMicros,...totals,items,...bases,outstanding_amount_minor:totals.grand_total_minor,outstanding_amount:fromScaledInt(totals.grand_total_minor,currency.transactionScale)} as PurchaseInvoiceData; }
  ledger(context:ControllerContext<PurchaseInvoiceData>,data:PurchaseInvoiceData):LedgerResult{if(!["submit","cancel"].includes(context.command.action))return{};const txScale=data.currency_scale??2;const baseScale=data.company_currency_scale??txScale;const rate=data.conversion_rate_micros??1_000_000;const currency=data.company_currency??data.currency;
    const gl:GeneralLedgerEntry[]=[];data.items.forEach((item,index)=>{const base=convertMinor(item.net_amount_minor??item.amount_minor??toScaledInt(item.amount??0,txScale),txScale,rate,baseScale);gl.push({line_key:`EXPENSE-${item.row_id||index+1}`,account:item.expense_account!,debit_minor:base,credit_minor:0,currency,currency_scale:baseScale,posting_at:data.posting_at})});
    for(const [index,tax] of (data.taxes??[]).entries()){const base=convertMinor(tax.tax_amount_minor??0,txScale,rate,baseScale);if(base===0)continue;const deduct=tax.add_deduct_tax==="Deduct";gl.push({line_key:`TAX-${tax.row_id||index+1}`,account:tax.account,debit_minor:deduct?0:base,credit_minor:deduct?base:0,currency,currency_scale:baseScale,posting_at:data.posting_at})}
    const payable=data.base_grand_total_minor??convertMinor(data.grand_total_minor??0,txScale,rate,baseScale);gl.push({line_key:"PAYABLE",account:data.credit_to,party_type:"Supplier",party:data.supplier,debit_minor:0,credit_minor:payable,currency,currency_scale:baseScale,posting_at:data.posting_at});
    const payment:PaymentLedgerEntry[]=[{line_key:"PAYABLE",account_type:"Payable",party_type:"Supplier",party:data.supplier,account:data.credit_to,amount_minor:data.grand_total_minor??0,base_amount_minor:payable,currency:data.currency,currency_scale:txScale,against_voucher_type:"Purchase Invoice",against_voucher_no:context.command.aggregate.name,posting_at:data.posting_at}];
    const procurement:ProcurementEntry[]=data.against_purchase_order?data.items.map((item,index)=>({line_key:`BILL-${item.row_id||index+1}`,purchase_order:data.against_purchase_order!,kind:"Billing",item_code:item.item_code,qty_micros:stockQtyMicros(item),posting_at:data.posting_at})):[];
    return context.command.action==="cancel"?{gl:reverseGl(gl),payment:reversePayment(payment),procurement:procurement.map(x=>({...x,line_key:`REV-${x.line_key}`,qty_micros:-x.qty_micros}))}:{gl,payment,procurement}; }
  status(context:ControllerContext<PurchaseInvoiceData>):string{const ds=nextDocStatus(context.command.action);return ds===0?"Draft":ds===2?"Cancelled":"Unpaid"}
  eventTypes(context:ControllerContext<PurchaseInvoiceData>):string[]{return context.command.action==="submit"?["gl.posted","payable.updated","purchase_invoice.submitted","purchase_order.progressed"]:context.command.action==="cancel"?["gl.reversed","payable.updated","purchase_invoice.cancelled","purchase_order.progressed"]:["purchase_invoice.updated"]}
}

export class StockEntryController extends BaseController<StockEntryData>{readonly doctype="Stock Entry";async normalize(context:ControllerContext<StockEntryData>):Promise<StockEntryData>{const input=context.command.document;if(!input.company||!input.posting_at||!["Material Receipt","Material Issue","Material Transfer"].includes(input.purpose))throw errors.validation("Company, posting_at and valid purpose are required");const company=await companyCurrency(context,input.company,context.command.action==="submit");const items=input.items.map((item,index)=>normalizeStockEntryItem(item,company.scale,index,input.purpose));const allow=Boolean(input.allow_negative_stock&&(context.command.actor.roles.includes("Stock Manager")||context.command.actor.roles.includes("System Manager")));if(context.command.action==="submit"){await assertUnlocked(context,input.company,input.posting_at);const masters:[[string,string]]|Array<[string,string]>=[["Company",input.company],["Currency",company.currency],...items.map(i=>["Item",i.item_code] as [string,string])];for(const i of items){if(i.source_warehouse)masters.push(["Warehouse",i.source_warehouse]);if(i.target_warehouse)masters.push(["Warehouse",i.target_warehouse])}await assertMasters(context,masters)}return{...input,currency:company.currency,currency_scale:company.scale,allow_negative_stock:allow,items}}
  ledger(context:ControllerContext<StockEntryData>,data:StockEntryData):LedgerResult{if(!["submit","cancel"].includes(context.command.action))return{};const normal:StockLedgerEntry[]=[];for(const [index,item]of data.items.entries()){const qty=item.qty_micros??toScaledInt(item.qty,6);const scale=data.currency_scale??2;const rate=item.valuation_rate_minor??toScaledInt(item.valuation_rate??0,scale);const value=multiplyScaled(fromScaledInt(qty,6),6,fromScaledInt(rate,scale),scale,scale);if(item.source_warehouse)normal.push({line_key:`SRC-${item.row_id||index+1}`,item_code:item.item_code,warehouse:item.source_warehouse,actual_qty_micros:-qty,valuation_rate_minor:rate,stock_value_difference_minor:-value,qty_scale:6,currency_scale:data.currency_scale??2,currency:data.currency??"USD",posting_at:data.posting_at,allow_negative_stock:Boolean(data.allow_negative_stock)});if(item.target_warehouse)normal.push({line_key:`TGT-${item.row_id||index+1}`,item_code:item.item_code,warehouse:item.target_warehouse,actual_qty_micros:qty,valuation_rate_minor:rate,stock_value_difference_minor:value,qty_scale:6,currency_scale:data.currency_scale??2,currency:data.currency??"USD",posting_at:data.posting_at})}return{stock:context.command.action==="cancel"?reverseStock(normal):normal}}
  eventTypes(context:ControllerContext<StockEntryData>):string[]{return context.command.action==="submit"?["stock.posted","stock_entry.submitted"]:context.command.action==="cancel"?["stock.reversed","stock_entry.cancelled"]:["stock_entry.updated"]}}

async function applyBuyingPricing<T extends PurchaseItem>(context:ControllerContext<JsonObject>,items:T[],priceList:string|undefined,currency:string,postingDate:string,supplier:string,supplierGroup?:string):Promise<T[]>{if(!priceList)return items;return Promise.all(items.map(async item=>{const qtyMicros=item.qty_micros??toScaledInt(item.qty,6);const price=await resolveServerPrice(context,{itemCode:item.item_code,qtyMicros,postingDate,priceList,documentCurrency:currency,partyType:"Supplier",party:supplier,...(supplierGroup?{supplierGroup}:{})});return{...item,rate:price.rate,rate_minor:price.rate_minor,item_price:price.item_price,...(price.pricing_rule?{pricing_rule:price.pricing_rule}:{}),...(price.discount_percentage?{discount_percentage:price.discount_percentage}:{})};}));}
function normalizeJournalLine(line:JournalEntryLine,scale:number,index:number):JournalEntryLine{if(!line.account)throw errors.validation(`Account is required at row ${index+1}`);const debit=toScaledInt(line.debit??0,scale);const credit=toScaledInt(line.credit??0,scale);if(debit<0||credit<0||(debit>0&&credit>0)||(debit===0&&credit===0))throw errors.validation(`Row ${index+1} must contain either debit or credit`);return{...line,row_id:line.row_id||`ROW-${index+1}`,debit:fromScaledInt(debit,scale),credit:fromScaledInt(credit,scale),debit_minor:debit,credit_minor:credit}}
function normalizePurchaseStockItems(items:PurchaseItem[],scale:number):PurchaseItem[]{if(!Array.isArray(items)||!items.length)throw errors.validation("At least one item is required");return items.map((item,index)=>{if(!item.item_code||!item.warehouse)throw errors.validation(`Item and warehouse are required at row ${index+1}`);const qty=toScaledInt(item.qty,6);if(qty<=0)throw errors.validation(`Quantity must be positive at row ${index+1}`);const rate=toScaledInt(item.rate,scale);const valuation=item.valuation_rate??item.rate;return{...item,row_id:item.row_id||`ROW-${index+1}`,qty:fromScaledInt(qty,6),qty_micros:qty,rate:fromScaledInt(rate,scale),rate_minor:rate,valuation_rate:fromScaledInt(toScaledInt(valuation,scale),scale),valuation_rate_minor:toScaledInt(valuation,scale)}})}
function normalizeStockEntryItem(item:StockEntryItem,scale:number,index:number,purpose:StockEntryData["purpose"]):StockEntryItem{if(!item.item_code)throw errors.validation(`Item is required at row ${index+1}`);const qty=toScaledInt(item.qty,6);if(qty<=0)throw errors.validation(`Quantity must be positive at row ${index+1}`);if(purpose==="Material Receipt"&&!item.target_warehouse)throw errors.validation(`Target warehouse is required at row ${index+1}`);if(purpose==="Material Issue"&&!item.source_warehouse)throw errors.validation(`Source warehouse is required at row ${index+1}`);if(purpose==="Material Transfer"&&(!item.source_warehouse||!item.target_warehouse||item.source_warehouse===item.target_warehouse))throw errors.validation(`Distinct source and target warehouses are required at row ${index+1}`);const rate=toScaledInt(item.valuation_rate??0,scale);if(rate<0)throw errors.validation(`Valuation rate cannot be negative at row ${index+1}`);return{...item,row_id:item.row_id||`ROW-${index+1}`,qty:fromScaledInt(qty,6),qty_micros:qty,valuation_rate:fromScaledInt(rate,scale),valuation_rate_minor:rate}}
function extractChildren(doctype:string,data:JsonObject):ChildRow[]{const result:ChildRow[]=[];for(const [fieldname,value]of Object.entries(data)){if(!Array.isArray(value))continue;value.forEach((row,index)=>{if(!row||typeof row!=="object"||Array.isArray(row))return;const obj=row as JsonObject;result.push({fieldname,child_doctype:`${doctype} ${fieldname.replace(/(^|_)(\w)/g,(_,a,b)=>`${a?" ":""}${String(b).toUpperCase()}`)}`,row_id:String(obj.row_id??`${fieldname}-${index+1}`),idx:index+1,data:structuredClone(obj)})})}return result}
function requireExisting<T extends JsonObject>(context:ControllerContext<T>):CanonicalDocument<T>{if(!context.existing)throw errors.notFound();return context.existing}
async function requireSubmitted<T extends JsonObject>(context:ControllerContext<JsonObject>,doctype:string,name:string):Promise<CanonicalDocument<T>>{const doc=await context.reader.getDocument<T>(context.command.tenant_id,doctype,name);if(!doc||doc.docstatus!==1)throw errors.reference(`Submitted ${doctype} ${name} is required`);return doc}
async function assertMasters(context:ControllerContext<JsonObject>,records:Array<[string,string]>):Promise<void>{for(const [type,name]of new Map(records.map(r=>[`${r[0]}:${r[1]}`,r])).values())if(!await context.reader.hasMasterRecord(context.command.tenant_id,type,name))throw errors.reference(`${type} ${name} does not exist or is disabled`)}
async function assertUnlocked(context:ControllerContext<JsonObject>,company:string,postingAt:string):Promise<void>{if(context.command.actor.roles.includes("System Manager")||context.command.actor.user_id==="Administrator")return;const lock=await context.reader.getPeriodLockDate(context.command.tenant_id,company);if(lock&&postingAt.slice(0,10)<=lock)throw errors.validation(`Posting date ${postingAt.slice(0,10)} is locked for ${company}`)}
async function companyCurrency(context:ControllerContext<JsonObject>,company:string,required:boolean):Promise<{currency:string;scale:number}>{const c=await context.reader.getMasterRecordData(context.command.tenant_id,"Company",company);const currency=typeof c?.default_currency==="string"?c.default_currency:"";if(required&&!currency)throw errors.reference(`Company ${company} must define default_currency`);const cur=currency?await context.reader.getMasterRecordData(context.command.tenant_id,"Currency",currency):null;const scale=typeof cur?.currency_scale==="number"&&Number.isSafeInteger(cur.currency_scale)?cur.currency_scale:2;if(required&&!cur)throw errors.reference(`Currency ${currency} does not exist`);return{currency:currency||"USD",scale}}
interface CurrencyContext{transactionScale:number;companyCurrency:string;companyScale:number;rateMicros:number}
async function resolveCurrency(context:ControllerContext<JsonObject>,company:string,currency:string,postingAt:string,required:boolean):Promise<CurrencyContext>{const tx=await context.reader.getMasterRecordData(context.command.tenant_id,"Currency",currency);const transactionScale=typeof tx?.currency_scale==="number"?tx.currency_scale:2;if(required&&!tx)throw errors.reference(`Currency ${currency} does not exist`);const cc=await companyCurrency(context,company,required);if(cc.currency===currency)return{transactionScale,companyCurrency:cc.currency,companyScale:cc.scale,rateMicros:1_000_000};for(const name of [`${currency}:${cc.currency}:${postingAt.slice(0,10)}`,`${currency}:${cc.currency}`]){const r=await context.reader.getMasterRecordData(context.command.tenant_id,"Exchange Rate",name);if(r&&(typeof r.rate==="string"||typeof r.rate==="number")){const rate=toScaledInt(r.rate,6);if(rate>0)return{transactionScale,companyCurrency:cc.currency,companyScale:cc.scale,rateMicros:rate}}}if(required)throw errors.reference(`Exchange Rate ${currency}:${cc.currency} does not exist`);return{transactionScale,companyCurrency:cc.currency,companyScale:cc.scale,rateMicros:1_000_000}}
function convertMinor(amount:number,sourceScale:number,rate:number,targetScale:number):number{return multiplyScaled(fromScaledInt(amount,sourceScale),sourceScale,fromScaledInt(rate,6),6,targetScale)}
function baseTotals(totals:{net_total_minor:number;total_taxes_and_charges_minor:number;grand_total_minor:number},currency:CurrencyContext):JsonObject{const net=convertMinor(totals.net_total_minor,currency.transactionScale,currency.rateMicros,currency.companyScale);const tax=convertMinor(totals.total_taxes_and_charges_minor,currency.transactionScale,currency.rateMicros,currency.companyScale);const grand=convertMinor(totals.grand_total_minor,currency.transactionScale,currency.rateMicros,currency.companyScale);return{base_net_total_minor:net,base_net_total:fromScaledInt(net,currency.companyScale),base_total_taxes_and_charges_minor:tax,base_total_taxes_and_charges:fromScaledInt(tax,currency.companyScale),base_grand_total_minor:grand,base_grand_total:fromScaledInt(grand,currency.companyScale)}}
function assertPurchaseContext(target:{supplier:string;company:string;currency:string},source:PurchaseOrderData,label:string):void{if(target.supplier!==source.supplier||target.company!==source.company||target.currency!==source.currency)throw errors.reference(`${label} commercial context does not match Purchase Order`)}
/**
 * Hạn mức đối chiếu theo ĐƠN VỊ TỒN, không phải đơn vị ghi trên chứng từ.
 *
 * Đặt 20 CÂY rồi nhận 117 MÉT là nhận đúng đủ, không phải nhận vượt 97 lần. Quy về một
 * đơn vị chung là cách duy nhất so được hai chứng từ khai bằng hai đơn vị khác nhau; sổ
 * tiến độ (`purchase_order_progress_entries`) vì thế cũng ghi bằng đơn vị tồn.
 */
async function assertPurchaseRemaining(context:ControllerContext<JsonObject>,po:CanonicalDocument<PurchaseOrderData>,items:PurchaseItem[],kind:"Receipt"|"Billing"):Promise<void>{const ordered=new Map<string,number>();for(const i of po.data.items)ordered.set(i.item_code,(ordered.get(i.item_code)??0)+stockQtyMicros(i));const requested=new Map<string,number>();for(const i of items)requested.set(i.item_code,(requested.get(i.item_code)??0)+stockQtyMicros(i));for(const[item,qty]of requested){const max=ordered.get(item);if(max===undefined)throw errors.reference(`Item ${item} is not in Purchase Order ${po.name}`);const used=await context.reader.getProcuredQuantityMicros(context.command.tenant_id,po.name,kind,item);if(used+qty>max)throw errors.reference(`${kind} quantity for ${item} exceeds Purchase Order quantity`)}}

/**
 * Không đặt mua quá số đã yêu cầu — cùng một luật, một tầng cao hơn.
 *
 * Số đã đặt đọc từ CHÍNH các đơn mua đã ghi sổ trỏ về yêu cầu này
 * (`sumSubmittedChildQuantityMicros`), không từ một cột `%đã đặt` nào cả. Cột tổng hợp
 * là thứ trôi dạt khi có người sửa hay huỷ đơn; đếm lại từ chứng từ thì không.
 */
async function assertRequestRemaining(context:ControllerContext<JsonObject>,requestName:string,company:string,items:PurchaseItem[]):Promise<void>{
  const request=await requireSubmitted<MaterialRequestData>(context,"Material Request",requestName);
  if(request.data.company!==company)throw errors.reference(`Material Request ${requestName} belongs to another company`);
  const requested=new Map<string,number>();for(const row of request.data.items)requested.set(row.item_code,(requested.get(row.item_code)??0)+stockQtyMicros(row));
  const wanted=new Map<string,number>();for(const row of items)wanted.set(row.item_code,(wanted.get(row.item_code)??0)+stockQtyMicros(row));
  for(const [item,qty] of wanted){
    const max=requested.get(item);
    if(max===undefined)throw errors.reference(`Item ${item} is not in Material Request ${requestName}`);
    const ordered=await context.reader.sumSubmittedChildQuantityMicros({tenantId:context.command.tenant_id,parentDoctype:"Purchase Order",referenceField:"material_request",referenceName:requestName,itemCode:item,excludeName:context.command.aggregate.name});
    if(ordered+qty>max)throw errors.reference(`Ordered quantity for ${item} exceeds Material Request ${requestName}`);
  }
}

function divideRounded(numerator:number,denominator:number):number{if(!Number.isSafeInteger(numerator)||!Number.isSafeInteger(denominator)||denominator<=0)throw errors.validation("Arithmetic exceeds safe integer range");const sign=numerator<0?-1:1;const value=Math.abs(numerator);const quotient=Math.floor(value/denominator);return sign*(quotient+((value%denominator)*2>=denominator?1:0));}
