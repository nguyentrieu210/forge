import type {
  AssetDepreciationEntry, CanonicalDocument, ChildRow, GeneralLedgerEntry, JsonObject,
  ManufacturingEntry, MutationPlan, PaymentLedgerEntry, ReturnEntry, StockBundleUsageEntry, StockLedgerEntry,
} from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { reverseGl, reversePayment, reverseStock } from "../../ledger/src/index.js";
import { addMinor, fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import { calculateSalesTotals } from "../../clouderp-selling/src/totals.js";
import type { StockEntryData, StockEntryItem } from "../../clouderp-core/src/types.js";
import { buildTrackedStockLines, deriveOutgoingValuation } from "../../clouderp-stock/src/index.js";
import type {
  AssetData, AssetDepreciationData, BillOfMaterialsData, BomItem, CreditNoteData, DebitNoteData,
  ReturnItem, StockReturnData, WorkOrderData, WorkOrderRequiredItem,
} from "./types.js";

type Ledgers = {
  gl?: GeneralLedgerEntry[];
  stock?: StockLedgerEntry[];
  payment?: PaymentLedgerEntry[];
  returns?: ReturnEntry[];
  manufacturing?: ManufacturingEntry[];
  depreciation?: AssetDepreciationEntry[];
  bundleUsages?: StockBundleUsageEntry[];
};

abstract class BaseController<T extends JsonObject> implements DocumentController<T> {
  abstract readonly doctype: string;
  abstract normalize(context: ControllerContext<T>): Promise<T>;
  abstract ledger(context: ControllerContext<T>, data: T): Promise<Ledgers>;
  status(context: ControllerContext<T>, _data: T): string {
    const ds=nextDocStatus(context.command.action); return ds===0?"Draft":ds===1?"Submitted":"Cancelled";
  }
  async buildPlan(context:ControllerContext<T>):Promise<MutationPlan<T>>{
    const data=context.command.action==="cancel"?structuredClone(requireExisting(context).data):await this.normalize(context);
    const docstatus=nextDocStatus(context.command.action);const status=this.status(context,data);const ledgers=await this.ledger(context,data);
    const document:CanonicalDocument<T>={tenant_id:context.command.tenant_id,doctype:this.doctype,name:context.command.aggregate.name,owner:context.existing?.owner??context.command.actor.user_id,docstatus,status,version:context.nextVersion,created_at:context.existing?.created_at??context.now,modified_at:context.now,data,children:extractChildren(this.doctype,data)};
    return {command:context.command,document,gl_entries:ledgers.gl??[],stock_entries:ledgers.stock??[],payment_entries:ledgers.payment??[],fulfillment_entries:[],stock_bundle_usages:ledgers.bundleUsages??[],return_entries:ledgers.returns??[],manufacturing_entries:ledgers.manufacturing??[],asset_depreciation_entries:ledgers.depreciation??[],events:[domainEvent({type:`${slug(this.doctype)}.${context.command.action}`,tenantId:context.command.tenant_id,aggregate:context.command.aggregate,aggregateVersion:context.nextVersion,actor:context.command.actor.user_id,commandId:context.command.command_id,occurredAt:context.now,payload:{status}})],result:{doctype:this.doctype,name:document.name,version:document.version,docstatus,status}};
  }
}

export class CreditNoteController extends BaseController<CreditNoteData>{
  readonly doctype="Credit Note";
  async normalize(context:ControllerContext<CreditNoteData>):Promise<CreditNoteData>{
    const input=context.command.document;if(!input.customer||!input.company||!input.currency||!input.posting_at||!input.return_against||!input.debit_to||!input.default_income_account)throw errors.validation("Customer, company, currency, posting_at, return invoice and accounts are required");
    const currency=await resolveCurrency(context,input.company,input.currency,input.posting_at,context.command.action==="submit");
    const totals=calculateSalesTotals(input.items as never,input.taxes??[],currency.transactionScale);
    if(context.command.action==="submit"){
      const source=await requireSubmitted<JsonObject>(context,"Sales Invoice",input.return_against);if(source.data.customer!==input.customer||source.data.company!==input.company||source.data.currency!==input.currency)throw errors.reference("Credit Note context does not match Sales Invoice");
      const outstanding=await context.reader.getOutstandingMinor(context.command.tenant_id,"Sales Invoice",input.return_against);if(totals.grand_total_minor>outstanding)throw errors.reference("Credit Note exceeds Sales Invoice outstanding",{outstanding_minor:outstanding,credit_minor:totals.grand_total_minor});
      await assertReturnRemaining(context,source,"Sales Credit",totals.items as unknown as ReturnItem[]);
      await assertMasters(context,[["Customer",input.customer],["Company",input.company],["Currency",input.currency],["Account",input.debit_to],["Account",input.default_income_account],...totals.items.map((i):[string,string]=>["Item",i.item_code]),...totals.taxes.map((t):[string,string]=>["Account",t.account])]);
    }
    return{...input,currency_scale:currency.transactionScale,company_currency:currency.companyCurrency,company_currency_scale:currency.companyScale,conversion_rate:fromScaledInt(currency.rateMicros,6),conversion_rate_micros:currency.rateMicros,...totals,...baseTotals(totals,currency)} as CreditNoteData;
  }
  async ledger(context:ControllerContext<CreditNoteData>,data:CreditNoteData):Promise<Ledgers>{
    if(!["submit","cancel"].includes(context.command.action))return{};await assertUnlocked(context,data.company,data.posting_at);const tx=data.currency_scale??2;const baseScale=data.company_currency_scale??tx;const rate=data.conversion_rate_micros??1_000_000;const currency=data.company_currency??data.currency;const baseNet=data.base_net_total_minor??convertMinor(data.net_total_minor??0,tx,rate,baseScale);const baseGrand=data.base_grand_total_minor??convertMinor(data.grand_total_minor??0,tx,rate,baseScale);
    const gl:GeneralLedgerEntry[]=[{line_key:"INCOME",account:data.default_income_account,debit_minor:baseNet,credit_minor:0,currency,currency_scale:baseScale,posting_at:data.posting_at}];let components=baseNet;
    for(const [index,tax] of (data.taxes??[]).entries()){const amount=convertMinor(Math.abs(tax.tax_amount_minor??0),tx,rate,baseScale);if(!amount)continue;const positive=(tax.tax_amount_minor??0)>0;components+=positive?amount:-amount;gl.push({line_key:`TAX-${tax.row_id||index+1}`,account:tax.account,debit_minor:positive?amount:0,credit_minor:positive?0:amount,currency,currency_scale:baseScale,posting_at:data.posting_at});}
    const difference=baseGrand-components;if(difference!==0){if(!data.round_off_account)throw errors.validation("round_off_account is required");gl.push({line_key:"ROUND-OFF",account:data.round_off_account,debit_minor:difference>0?difference:0,credit_minor:difference<0?-difference:0,currency,currency_scale:baseScale,posting_at:data.posting_at});}
    gl.push({line_key:"RECEIVABLE",account:data.debit_to,party_type:"Customer",party:data.customer,debit_minor:0,credit_minor:baseGrand,currency,currency_scale:baseScale,posting_at:data.posting_at});
    const payment:PaymentLedgerEntry[]=[{line_key:"CREDIT",account_type:"Receivable",party_type:"Customer",party:data.customer,account:data.debit_to,amount_minor:-(data.grand_total_minor??0),base_amount_minor:-baseGrand,currency:data.currency,currency_scale:tx,against_voucher_type:"Sales Invoice",against_voucher_no:data.return_against,posting_at:data.posting_at}];
    const returns=data.items.map((item,index):ReturnEntry=>({line_key:`RETURN-${item.row_id||index+1}`,reference_doctype:"Sales Invoice",reference_name:data.return_against,kind:"Sales Credit",item_code:item.item_code,qty_micros:item.qty_micros??toScaledInt(item.qty,6),posting_at:data.posting_at}));
    return context.command.action==="cancel"?{gl:reverseGl(gl),payment:reversePayment(payment),returns:reverseReturns(returns)}:{gl,payment,returns};
  }
  status(context:ControllerContext<CreditNoteData>):string{return nextDocStatus(context.command.action)===1?"Credit Issued":super.status(context,{} as CreditNoteData);}
}

export class DebitNoteController extends BaseController<DebitNoteData>{
  readonly doctype="Debit Note";
  async normalize(context:ControllerContext<DebitNoteData>):Promise<DebitNoteData>{
    const input=context.command.document;if(!input.supplier||!input.company||!input.currency||!input.posting_at||!input.return_against||!input.credit_to||!input.default_expense_account)throw errors.validation("Supplier, company, currency, posting_at, return invoice and accounts are required");
    const currency=await resolveCurrency(context,input.company,input.currency,input.posting_at,context.command.action==="submit");const totals=calculateSalesTotals(input.items as never,input.taxes??[],currency.transactionScale);
    if(context.command.action==="submit"){const source=await requireSubmitted<JsonObject>(context,"Purchase Invoice",input.return_against);if(source.data.supplier!==input.supplier||source.data.company!==input.company||source.data.currency!==input.currency)throw errors.reference("Debit Note context does not match Purchase Invoice");const outstanding=await context.reader.getOutstandingMinor(context.command.tenant_id,"Purchase Invoice",input.return_against);if(totals.grand_total_minor>outstanding)throw errors.reference("Debit Note exceeds Purchase Invoice outstanding");await assertReturnRemaining(context,source,"Purchase Debit",totals.items as unknown as ReturnItem[]);await assertMasters(context,[["Supplier",input.supplier],["Company",input.company],["Currency",input.currency],["Account",input.credit_to],["Account",input.default_expense_account],...totals.items.map((i):[string,string]=>["Item",i.item_code]),...totals.taxes.map((t):[string,string]=>["Account",t.account])]);}
    return{...input,currency_scale:currency.transactionScale,company_currency:currency.companyCurrency,company_currency_scale:currency.companyScale,conversion_rate:fromScaledInt(currency.rateMicros,6),conversion_rate_micros:currency.rateMicros,...totals,...baseTotals(totals,currency)} as DebitNoteData;
  }
  async ledger(context:ControllerContext<DebitNoteData>,data:DebitNoteData):Promise<Ledgers>{if(!["submit","cancel"].includes(context.command.action))return{};await assertUnlocked(context,data.company,data.posting_at);const tx=data.currency_scale??2;const baseScale=data.company_currency_scale??tx;const rate=data.conversion_rate_micros??1_000_000;const currency=data.company_currency??data.currency;const baseNet=data.base_net_total_minor??convertMinor(data.net_total_minor??0,tx,rate,baseScale);const baseGrand=data.base_grand_total_minor??convertMinor(data.grand_total_minor??0,tx,rate,baseScale);const gl:GeneralLedgerEntry[]=[{line_key:"EXPENSE",account:data.default_expense_account,debit_minor:0,credit_minor:baseNet,currency,currency_scale:baseScale,posting_at:data.posting_at}];let components=baseNet;for(const [index,tax] of (data.taxes??[]).entries()){const amount=convertMinor(Math.abs(tax.tax_amount_minor??0),tx,rate,baseScale);if(!amount)continue;const positive=(tax.tax_amount_minor??0)>0;components+=positive?amount:-amount;gl.push({line_key:`TAX-${tax.row_id||index+1}`,account:tax.account,debit_minor:positive?0:amount,credit_minor:positive?amount:0,currency,currency_scale:baseScale,posting_at:data.posting_at});}const difference=baseGrand-components;if(difference!==0){if(!data.round_off_account)throw errors.validation("round_off_account is required");gl.push({line_key:"ROUND-OFF",account:data.round_off_account,debit_minor:difference<0?-difference:0,credit_minor:difference>0?difference:0,currency,currency_scale:baseScale,posting_at:data.posting_at});}gl.push({line_key:"PAYABLE",account:data.credit_to,party_type:"Supplier",party:data.supplier,debit_minor:baseGrand,credit_minor:0,currency,currency_scale:baseScale,posting_at:data.posting_at});const payment:PaymentLedgerEntry[]=[{line_key:"DEBIT",account_type:"Payable",party_type:"Supplier",party:data.supplier,account:data.credit_to,amount_minor:-(data.grand_total_minor??0),base_amount_minor:-baseGrand,currency:data.currency,currency_scale:tx,against_voucher_type:"Purchase Invoice",against_voucher_no:data.return_against,posting_at:data.posting_at}];const returns=data.items.map((item,index):ReturnEntry=>({line_key:`RETURN-${item.row_id||index+1}`,reference_doctype:"Purchase Invoice",reference_name:data.return_against,kind:"Purchase Debit",item_code:item.item_code,qty_micros:item.qty_micros??toScaledInt(item.qty,6),posting_at:data.posting_at}));return context.command.action==="cancel"?{gl:reverseGl(gl),payment:reversePayment(payment),returns:reverseReturns(returns)}:{gl,payment,returns};}
  status(context:ControllerContext<DebitNoteData>):string{return nextDocStatus(context.command.action)===1?"Debit Issued":super.status(context,{} as DebitNoteData);}
}

export class StockReturnController extends BaseController<StockReturnData>{
  readonly doctype="Stock Return";
  async normalize(context:ControllerContext<StockReturnData>):Promise<StockReturnData>{const input=context.command.document;if(!input.party||!input.company||!input.currency||!input.posting_at||!input.return_against||!["Sales","Purchase"].includes(input.return_type)||!Array.isArray(input.items)||!input.items.length)throw errors.validation("Party, company, currency, posting_at, source and items are required");const sourceType=input.return_type==="Sales"?"Delivery Note":"Purchase Receipt";const source=await requireSubmitted<JsonObject>(context,sourceType,input.return_against);if(source.data.company!==input.company||source.data.currency!==input.currency)throw errors.reference("Stock Return context does not match source");const sourceParty=input.return_type==="Sales"?source.data.customer:source.data.supplier;if(sourceParty!==input.party)throw errors.reference("Stock Return party does not match source");const scale=typeof source.data.currency_scale==="number"?source.data.currency_scale:2;const normalized:ReturnItem[]=[];for(const [index,row] of input.items.entries()){const qty=toScaledInt(row.qty,6);if(qty<=0||!row.item_code||!row.warehouse)throw errors.validation(`Valid item, warehouse and quantity required at row ${index+1}`);const sourceRow=findSourceItem(source,row.item_code);const sourceWarehouse=String(sourceRow.warehouse??sourceRow.target_warehouse??"");if(sourceWarehouse&&sourceWarehouse!==row.warehouse)throw errors.reference(`Return warehouse for ${row.item_code} must match source warehouse ${sourceWarehouse}`);const kind=input.return_type==="Sales"?"Sales Stock":"Purchase Stock";const returned=await context.reader.getReturnedQuantityMicros(context.command.tenant_id,sourceType,input.return_against,kind,row.item_code);const original=source.children.filter(c=>c.fieldname==="items"&&c.data.item_code===row.item_code).reduce((sum,c)=>sum+(typeof c.data.qty_micros==="number"?c.data.qty_micros:toScaledInt(String(c.data.qty??0),6)),0);if(returned+qty>original)throw errors.reference(`Return quantity for ${row.item_code} exceeds source`);let valuationRate=typeof sourceRow.valuation_rate_minor==="number"?sourceRow.valuation_rate_minor:toScaledInt(String(sourceRow.valuation_rate??sourceRow.rate??0),scale);let stockValue=multiplyScaled(fromScaledInt(qty,6),6,fromScaledInt(valuationRate,scale),scale,scale);if(input.return_type==="Purchase"){const valuation=await deriveOutgoingValuation(context as unknown as ControllerContext<JsonObject>,{itemCode:row.item_code,warehouse:row.warehouse,qtyMicros:qty,postingAt:input.posting_at,currencyScale:scale});valuationRate=valuation.valuation_rate_minor;stockValue=Math.abs(valuation.stock_value_difference_minor);}normalized.push({...row,row_id:row.row_id||`ROW-${index+1}`,qty:fromScaledInt(qty,6),qty_micros:qty,valuation_rate_minor:valuationRate,valuation_rate:fromScaledInt(valuationRate,scale),stock_value_difference_minor:input.return_type==="Sales"?stockValue:-stockValue});}if(context.command.action==="submit"){const partyType=input.return_type==="Sales"?"Customer":"Supplier";const records:Array<[string,string]>=[[partyType,input.party],["Company",input.company],["Currency",input.currency],...normalized.map((row):[string,string]=>["Item",row.item_code]),...normalized.map((row):[string,string]=>["Warehouse",row.warehouse!])];if(input.stock_account)records.push(["Account",input.stock_account]);if(input.cogs_or_expense_account)records.push(["Account",input.cogs_or_expense_account]);await assertMasters(context,records);}return{...input,currency_scale:scale,items:normalized};}
  async ledger(context:ControllerContext<StockReturnData>,data:StockReturnData):Promise<Ledgers>{if(!["submit","cancel"].includes(context.command.action))return{};await assertUnlocked(context,data.company,data.posting_at);const stock:StockLedgerEntry[]=[];const usages:StockBundleUsageEntry[]=[];const returns:ReturnEntry[]=[];const gl:GeneralLedgerEntry[]=[];const inward=data.return_type==="Sales";for(const [index,item] of data.items.entries()){const qty=item.qty_micros??toScaledInt(item.qty,6);const value=Math.abs(item.stock_value_difference_minor??0);const tracked=await buildTrackedStockLines(context as unknown as ControllerContext<JsonObject>,{itemCode:item.item_code,warehouse:item.warehouse!,qtyMicros:qty,direction:inward?"Inward":"Outward",postingAt:data.posting_at,currency:data.currency,currencyScale:data.currency_scale??2,valuationRateMinor:item.valuation_rate_minor??0,stockValueMinor:value,lineKey:`RETURN-${item.row_id||index+1}`,...(item.serial_and_batch_bundle?{bundleName:item.serial_and_batch_bundle}:{})});stock.push(...tracked.stock);usages.push(...tracked.usages);returns.push({line_key:`RETURN-${item.row_id||index+1}`,reference_doctype:inward?"Delivery Note":"Purchase Receipt",reference_name:data.return_against,kind:inward?"Sales Stock":"Purchase Stock",item_code:item.item_code,qty_micros:qty,posting_at:data.posting_at});if(data.stock_account&&data.cogs_or_expense_account)gl.push(inward?{line_key:`STOCK-${index}`,account:data.stock_account,debit_minor:value,credit_minor:0,currency:data.currency,currency_scale:data.currency_scale??2,posting_at:data.posting_at}:{line_key:`EXPENSE-${index}`,account:data.cogs_or_expense_account,debit_minor:value,credit_minor:0,currency:data.currency,currency_scale:data.currency_scale??2,posting_at:data.posting_at},inward?{line_key:`COGS-${index}`,account:data.cogs_or_expense_account,debit_minor:0,credit_minor:value,currency:data.currency,currency_scale:data.currency_scale??2,posting_at:data.posting_at}:{line_key:`STOCK-${index}`,account:data.stock_account,debit_minor:0,credit_minor:value,currency:data.currency,currency_scale:data.currency_scale??2,posting_at:data.posting_at});}return context.command.action==="cancel"?{stock:reverseStock(stock),gl:reverseGl(gl),returns:reverseReturns(returns),bundleUsages:usages.map(line=>({...line,line_key:`REV-${line.line_key}`,usage_delta:-1 as const}))}:{stock,gl,returns,bundleUsages:usages};}
}

export class BillOfMaterialsController extends BaseController<BillOfMaterialsData>{
  readonly doctype="Bill of Materials";
  async normalize(context:ControllerContext<BillOfMaterialsData>):Promise<BillOfMaterialsData>{const input=context.command.document;if(!input.company||!input.item||!Array.isArray(input.items)||!input.items.length)throw errors.validation("Company, finished item and raw materials are required");const company=await companyCurrency(context,input.company);const quantity=toScaledInt(input.quantity,6);if(quantity<=0)throw errors.validation("BOM quantity must be positive");const items:BomItem[]=[];let raw=0;for(const [index,row] of input.items.entries()){const qty=toScaledInt(row.qty,6);if(qty<=0||!row.item_code)throw errors.validation(`Valid raw material required at row ${index+1}`);const master=await context.reader.getMasterRecordData(context.command.tenant_id,"Item",row.item_code);if(context.command.action==="submit"&&!master)throw errors.reference(`Item ${row.item_code} does not exist`);const rate=toScaledInt(decimalValue(master?.standard_rate??master?.valuation_rate??row.rate??0,"BOM valuation rate"),company.scale);const amount=multiplyScaled(fromScaledInt(qty,6),6,fromScaledInt(rate,company.scale),company.scale,company.scale);raw=addMinor([raw,amount]);items.push({...row,row_id:row.row_id||`ROW-${index+1}`,qty:fromScaledInt(qty,6),qty_micros:qty,rate:fromScaledInt(rate,company.scale),rate_minor:rate,amount_minor:amount});}const operating=toScaledInt(input.operating_cost??0,company.scale);if(operating<0)throw errors.validation("Operating cost cannot be negative");const total=addMinor([raw,operating]);const rate=divideRounded(total*1_000_000,quantity);return{...input,quantity:fromScaledInt(quantity,6),quantity_micros:quantity,currency:company.currency,currency_scale:company.scale,items,operating_cost:fromScaledInt(operating,company.scale),operating_cost_minor:operating,raw_material_cost_minor:raw,total_cost_minor:total,rate_minor:rate};}
  async ledger():Promise<Ledgers>{return{};}
}

export class WorkOrderController extends BaseController<WorkOrderData>{
  readonly doctype="Work Order";
  async normalize(context:ControllerContext<WorkOrderData>):Promise<WorkOrderData>{const input=context.command.document;if(!input.company||!input.production_item||!input.bom_no||!input.source_warehouse||!input.target_warehouse)throw errors.validation("Company, item, BOM and warehouses are required");const qty=toScaledInt(input.qty,6);if(qty<=0)throw errors.validation("Work Order quantity must be positive");const bom=await requireSubmitted<BillOfMaterialsData>(context,"Bill of Materials",input.bom_no);if(bom.data.item!==input.production_item||bom.data.company!==input.company)throw errors.reference("Work Order does not match BOM");const bomQty=bom.data.quantity_micros??toScaledInt(bom.data.quantity,6);const required:WorkOrderRequiredItem[]=bom.data.items.map((row,index)=>{const raw=row.qty_micros??toScaledInt(row.qty,6);const req=divideRounded(raw*qty,bomQty);return{row_id:row.row_id||`ROW-${index+1}`,item_code:row.item_code,required_qty:fromScaledInt(req,6),required_qty_micros:req,source_warehouse:row.source_warehouse??input.source_warehouse};});if(context.command.action==="submit")await assertMasters(context,[["Company",input.company],["Item",input.production_item],["Warehouse",input.source_warehouse],["Warehouse",input.target_warehouse],...required.map(r=>["Item",r.item_code] as [string,string])]);return{...input,qty:fromScaledInt(qty,6),qty_micros:qty,required_items:required,operating_cost_minor:divideRounded((bom.data.operating_cost_minor??0)*qty,bomQty),produced_qty:"0.000000",produced_qty_micros:0,produced_percentage:"0.00"};}
  async ledger(context:ControllerContext<WorkOrderData>):Promise<Ledgers>{if(context.command.action==="cancel"&&await context.reader.getManufacturedQuantityMicros(context.command.tenant_id,context.command.aggregate.name)!==0)throw errors.reference("Work Order cannot be cancelled after manufacturing activity");return{};}
  status(context:ControllerContext<WorkOrderData>):string{return nextDocStatus(context.command.action)===1?"Not Started":super.status(context,{} as WorkOrderData);}
}

export class AdvancedStockEntryController extends BaseController<StockEntryData>{
  readonly doctype="Stock Entry";
  async normalize(context:ControllerContext<StockEntryData>):Promise<StockEntryData>{
    const input=context.command.document;
    if(!input.company||!input.posting_at||!["Material Receipt","Material Issue","Material Transfer","Manufacture"].includes(input.purpose))throw errors.validation("Company, posting_at and valid purpose are required");
    const company=await companyCurrency(context,input.company);
    const items:StockEntryItem[]=[];
    for(const [index,row] of input.items.entries()){
      const qty=toScaledInt(row.qty,6);
      if(qty<=0||!row.item_code)throw errors.validation(`Valid item and quantity required at row ${index+1}`);
      const master=await context.reader.getMasterRecordData(context.command.tenant_id,"Item",row.item_code);
      const catchWeight=master?.has_catch_weight===true||master?.has_catch_weight===1;
      const weightMicros=row.weight_micros??(row.weight_kg===undefined?undefined:toScaledInt(row.weight_kg,6,`items[${index}].weight_kg`));
      if(weightMicros!==undefined&&weightMicros<=0)throw errors.validation(`Khối lượng phải lớn hơn 0 ở dòng ${index+1}`);
      if(catchWeight&&context.command.action==="submit"&&weightMicros===undefined)throw errors.validation(`Khối lượng là bắt buộc cho mặt hàng cân theo kiện ở dòng ${index+1}`);
      const weightSnapshot=weightMicros===undefined?{}:{weight_micros:weightMicros,weight_kg:fromScaledInt(weightMicros,6)};
      let source=row.source_warehouse;
      const target=row.target_warehouse;
      if(input.purpose==="Material Receipt"&&!target)throw errors.validation(`Target warehouse required at row ${index+1}`);
      if(input.purpose==="Material Issue"&&!source)throw errors.validation(`Source warehouse required at row ${index+1}`);
      if(input.purpose==="Material Transfer"&&(!source||!target||source===target))throw errors.validation(`Distinct warehouses required at row ${index+1}`);
      if(input.purpose==="Manufacture"&&!source)source=input.source_warehouse;
      if((input.purpose==="Material Issue"||input.purpose==="Material Transfer"||input.purpose==="Manufacture")&&source){
        const valuation=await deriveOutgoingValuation(context as unknown as ControllerContext<JsonObject>,{itemCode:row.item_code,warehouse:source,qtyMicros:qty,postingAt:input.posting_at,currencyScale:company.scale});
        items.push({...row,...weightSnapshot,row_id:row.row_id||`ROW-${index+1}`,qty:fromScaledInt(qty,6),qty_micros:qty,source_warehouse:source,...(target?{target_warehouse:target}:{}),valuation_rate_minor:valuation.valuation_rate_minor,valuation_rate:fromScaledInt(valuation.valuation_rate_minor,company.scale),stock_value_difference_minor:valuation.stock_value_difference_minor});
      }else{
        const rate=toScaledInt(row.valuation_rate??0,company.scale);
        items.push({...row,...weightSnapshot,row_id:row.row_id||`ROW-${index+1}`,qty:fromScaledInt(qty,6),qty_micros:qty,...(source?{source_warehouse:source}:{}),...(target?{target_warehouse:target}:{}),valuation_rate_minor:rate,valuation_rate:fromScaledInt(rate,company.scale)});
      }
    }
    let finishedQty=0;
    if(input.purpose==="Manufacture"){
      if(!input.work_order||!input.finished_good_item||!input.target_warehouse)throw errors.validation("Manufacture requires Work Order, finished item and target warehouse");
      const wo=await requireSubmitted<WorkOrderData>(context,"Work Order",input.work_order);
      if(wo.data.production_item!==input.finished_good_item||wo.data.company!==input.company)throw errors.reference("Manufacture entry does not match Work Order");
      finishedQty=toScaledInt(input.finished_good_qty??0,6);
      const made=await context.reader.getManufacturedQuantityMicros(context.command.tenant_id,input.work_order,"Manufacture",input.finished_good_item);
      if(finishedQty<=0||made+finishedQty>(wo.data.qty_micros??0))throw errors.reference("Manufacture quantity exceeds Work Order remaining quantity");
      for(const row of items){
        const required=wo.data.required_items?.find(x=>x.item_code===row.item_code)?.required_qty_micros??0;
        const consumed=await context.reader.getManufacturedQuantityMicros(context.command.tenant_id,input.work_order,"Consumption",row.item_code);
        if(consumed+(row.qty_micros??0)>required)throw errors.reference(`Consumption for ${row.item_code} exceeds Work Order requirement`);
      }
    }
    if(context.command.action==="submit"){
      const records:Array<[string,string]>=[["Company",input.company],...items.map((row):[string,string]=>["Item",row.item_code])];
      for(const row of items){if(row.source_warehouse)records.push(["Warehouse",row.source_warehouse]);if(row.target_warehouse)records.push(["Warehouse",row.target_warehouse]);}
      if(input.finished_good_item)records.push(["Item",input.finished_good_item]);
      if(input.target_warehouse)records.push(["Warehouse",input.target_warehouse]);
      await assertMasters(context,records);
    }
    return{...input,currency:company.currency,currency_scale:company.scale,items,finished_good_qty:fromScaledInt(finishedQty,6),finished_good_qty_micros:finishedQty,allow_negative_stock:false};
  }
  async ledger(context:ControllerContext<StockEntryData>,data:StockEntryData):Promise<Ledgers>{
    if(!["submit","cancel"].includes(context.command.action))return{};
    await assertUnlocked(context,data.company,data.posting_at);
    if(context.command.action==="cancel"){
      const originalRevision=requireExisting(context).version;
      const stock=await context.reader.getVoucherStockEntries(context.command.tenant_id,this.doctype,context.command.aggregate.name,originalRevision);
      if(stock.length===0)throw errors.reference(`Original stock posting for ${this.doctype} ${context.command.aggregate.name} was not found`);
      const bundleUsages:StockBundleUsageEntry[]=[];
      for(const [index,item] of data.items.entries()){
        if(!item.serial_and_batch_bundle)continue;
        const warehouse=item.source_warehouse??item.target_warehouse;
        if(!warehouse)continue;
        bundleUsages.push({line_key:`REV-BUNDLE-${item.row_id||index+1}`,bundle_name:item.serial_and_batch_bundle,item_code:item.item_code,warehouse,direction:item.source_warehouse?"Outward":"Inward",usage_delta:-1,posting_at:data.posting_at});
      }
      if(data.finished_good_bundle&&data.finished_good_item&&data.target_warehouse){
        bundleUsages.push({line_key:"REV-BUNDLE-FINISHED",bundle_name:data.finished_good_bundle,item_code:data.finished_good_item,warehouse:data.target_warehouse,direction:"Inward",usage_delta:-1,posting_at:data.posting_at});
      }
      const manufacturing:ManufacturingEntry[]=[];
      if(data.purpose==="Manufacture"&&data.work_order){
        for(const [index,item] of data.items.entries())manufacturing.push({line_key:`REV-CONSUME-${item.row_id||index+1}`,work_order:data.work_order,kind:"Consumption",item_code:item.item_code,qty_micros:-(item.qty_micros??toScaledInt(item.qty,6)),posting_at:data.posting_at});
        if(data.finished_good_item)manufacturing.push({line_key:"REV-MANUFACTURE",work_order:data.work_order,kind:"Manufacture",item_code:data.finished_good_item,qty_micros:-(data.finished_good_qty_micros??toScaledInt(data.finished_good_qty??0,6)),posting_at:data.posting_at});
      }
      return{stock:reverseStock(stock),manufacturing,bundleUsages};
    }
    const stock:StockLedgerEntry[]=[];
    const usages:StockBundleUsageEntry[]=[];
    const manufacturing:ManufacturingEntry[]=[];
    let consumedValue=0;
    for(const [index,item] of data.items.entries()){
      const qty=item.qty_micros??toScaledInt(item.qty,6);
      const rate=item.valuation_rate_minor??0;
      const value=Math.abs(item.stock_value_difference_minor??multiplyScaled(fromScaledInt(qty,6),6,fromScaledInt(rate,data.currency_scale??2),data.currency_scale??2,data.currency_scale??2));
      const weight=item.weight_micros===undefined?{}:{weightMicros:item.weight_micros};
      if(item.source_warehouse){
        const out=await buildTrackedStockLines(context as unknown as ControllerContext<JsonObject>,{itemCode:item.item_code,warehouse:item.source_warehouse,qtyMicros:qty,...weight,direction:"Outward",postingAt:data.posting_at,currency:data.currency??"USD",currencyScale:data.currency_scale??2,valuationRateMinor:rate,stockValueMinor:value,lineKey:`SRC-${item.row_id||index+1}`,...(item.serial_and_batch_bundle?{bundleName:item.serial_and_batch_bundle}:{})});
        stock.push(...out.stock);
        usages.push(...out.usages);
        consumedValue=addMinor([consumedValue,out.stockValueMinor]);
      }
      if(item.target_warehouse){
        if(item.source_warehouse&&item.serial_and_batch_bundle){
          const sourceLines=stock.filter(line=>line.line_key.startsWith(`SRC-${item.row_id||index+1}-`));
          stock.push(...sourceLines.map(line=>({...line,line_key:line.line_key.replace("SRC-","TGT-"),warehouse:item.target_warehouse!,actual_qty_micros:-line.actual_qty_micros,...(line.actual_weight_micros===undefined?{}:{actual_weight_micros:-line.actual_weight_micros}),stock_value_difference_minor:-line.stock_value_difference_minor,allow_negative_stock:false})));
        }else{
          const incoming=await buildTrackedStockLines(context as unknown as ControllerContext<JsonObject>,{itemCode:item.item_code,warehouse:item.target_warehouse,qtyMicros:qty,...weight,direction:"Inward",postingAt:data.posting_at,currency:data.currency??"USD",currencyScale:data.currency_scale??2,valuationRateMinor:rate,stockValueMinor:value,lineKey:`TGT-${item.row_id||index+1}`,...(item.serial_and_batch_bundle?{bundleName:item.serial_and_batch_bundle}:{})});
          stock.push(...incoming.stock);
          usages.push(...incoming.usages);
        }
      }
      if(data.purpose==="Manufacture"&&data.work_order)manufacturing.push({line_key:`CONSUME-${item.row_id||index+1}`,work_order:data.work_order,kind:"Consumption",item_code:item.item_code,qty_micros:qty,posting_at:data.posting_at});
    }
    if(data.purpose==="Manufacture"&&data.work_order&&data.finished_good_item&&data.target_warehouse){
      const qty=data.finished_good_qty_micros??toScaledInt(data.finished_good_qty??0,6);
      const wo=await requireSubmitted<WorkOrderData>(context,"Work Order",data.work_order);
      const operating=divideRounded((wo.data.operating_cost_minor??0)*qty,wo.data.qty_micros??qty);
      const value=addMinor([consumedValue,operating]);
      const rate=divideRounded(value*1_000_000,qty);
      const incoming=await buildTrackedStockLines(context as unknown as ControllerContext<JsonObject>,{itemCode:data.finished_good_item,warehouse:data.target_warehouse,qtyMicros:qty,direction:"Inward",postingAt:data.posting_at,currency:data.currency??"USD",currencyScale:data.currency_scale??2,valuationRateMinor:rate,stockValueMinor:value,lineKey:"FINISHED",...(data.finished_good_bundle?{bundleName:data.finished_good_bundle}:{})});
      stock.push(...incoming.stock);
      usages.push(...incoming.usages);
      manufacturing.push({line_key:"MANUFACTURE",work_order:data.work_order,kind:"Manufacture",item_code:data.finished_good_item,qty_micros:qty,posting_at:data.posting_at});
    }
    return{stock,manufacturing,bundleUsages:usages};
  }
}

export class AssetController extends BaseController<AssetData>{
  readonly doctype="Asset";
  async normalize(context:ControllerContext<AssetData>):Promise<AssetData>{const input=context.command.document;if(!input.asset_name||!input.company||!input.asset_category||!input.purchase_date||!input.available_for_use_date||!input.accumulated_depreciation_account||!input.depreciation_expense_account||!input.fixed_asset_account)throw errors.validation("Asset identity, dates, category and accounts are required");const company=await companyCurrency(context,input.company);const gross=toScaledInt(input.gross_purchase_amount,company.scale);const salvage=toScaledInt(input.salvage_value??0,company.scale);if(gross<=0||salvage<0||salvage>=gross)throw errors.validation("Asset gross and salvage values are invalid");if(!Number.isSafeInteger(input.total_number_of_depreciations)||input.total_number_of_depreciations<=0||!Number.isSafeInteger(input.frequency_of_depreciation_months)||input.frequency_of_depreciation_months<=0)throw errors.validation("Asset depreciation schedule is invalid");if(context.command.action==="submit")await assertMasters(context,[["Company",input.company],["Asset Category",input.asset_category],["Account",input.accumulated_depreciation_account],["Account",input.depreciation_expense_account],["Account",input.fixed_asset_account]]);return{...input,currency:company.currency,currency_scale:company.scale,gross_purchase_amount:fromScaledInt(gross,company.scale),gross_purchase_amount_minor:gross,salvage_value:fromScaledInt(salvage,company.scale),salvage_value_minor:salvage};}
  async ledger(context:ControllerContext<AssetData>):Promise<Ledgers>{if(context.command.action==="cancel"&&await context.reader.getAssetDepreciatedMinor(context.command.tenant_id,context.command.aggregate.name)!==0)throw errors.reference("Asset cannot be cancelled after depreciation");return{};}
  status(context:ControllerContext<AssetData>):string{return nextDocStatus(context.command.action)===1?"Active":super.status(context,{} as AssetData);}
}

export class AssetDepreciationController extends BaseController<AssetDepreciationData>{
  readonly doctype="Asset Depreciation Entry";
  async normalize(context:ControllerContext<AssetDepreciationData>):Promise<AssetDepreciationData>{const input=context.command.document;if(!input.asset||!input.company||!input.posting_at)throw errors.validation("Asset, company and posting_at are required");const asset=await requireSubmitted<AssetData>(context,"Asset",input.asset);if(asset.data.company!==input.company)throw errors.reference("Asset belongs to another company");const scale=asset.data.currency_scale??2;const gross=asset.data.gross_purchase_amount_minor??0;const salvage=asset.data.salvage_value_minor??0;const already=await context.reader.getAssetDepreciatedMinor(context.command.tenant_id,input.asset);const remaining=gross-salvage-already;if(remaining<=0)throw errors.reference("Asset is fully depreciated");let amount:number;if(input.amount!==undefined){if(!context.command.actor.roles.some(r=>r==="Accounts Manager"||r==="System Manager"))throw errors.permission("Manual depreciation requires Accounts Manager");amount=toScaledInt(input.amount,scale);}else if(asset.data.depreciation_method==="Straight Line")amount=Math.min(remaining,divideRounded(gross-salvage,asset.data.total_number_of_depreciations));else{const rate=asset.data.depreciation_method==="Double Declining Balance"?divideRounded(2_000_000,asset.data.total_number_of_depreciations):toScaledInt(asset.data.depreciation_rate??0,6);amount=Math.min(remaining,divideRounded((gross-already)*rate,100_000_000));}if(amount<=0||amount>remaining)throw errors.reference("Depreciation amount exceeds remaining asset value");if(context.command.action==="submit")await assertMasters(context,[["Company",input.company],["Account",asset.data.accumulated_depreciation_account],["Account",asset.data.depreciation_expense_account]]);return{...input,amount:fromScaledInt(amount,scale),amount_minor:amount,currency:asset.data.currency??"USD",currency_scale:scale,accumulated_depreciation_account:asset.data.accumulated_depreciation_account,depreciation_expense_account:asset.data.depreciation_expense_account};}
  async ledger(context:ControllerContext<AssetDepreciationData>,data:AssetDepreciationData):Promise<Ledgers>{if(!["submit","cancel"].includes(context.command.action))return{};await assertUnlocked(context,data.company,data.posting_at);const amount=data.amount_minor??0;const gl:GeneralLedgerEntry[]=[{line_key:"EXPENSE",account:data.depreciation_expense_account!,debit_minor:amount,credit_minor:0,currency:data.currency??"USD",currency_scale:data.currency_scale??2,posting_at:data.posting_at},{line_key:"ACCUMULATED",account:data.accumulated_depreciation_account!,debit_minor:0,credit_minor:amount,currency:data.currency??"USD",currency_scale:data.currency_scale??2,posting_at:data.posting_at}];const depreciation:AssetDepreciationEntry[]=[{line_key:"DEPRECIATION",asset:data.asset,amount_minor:amount,currency:data.currency??"USD",currency_scale:data.currency_scale??2,posting_at:data.posting_at}];return context.command.action==="cancel"?{gl:reverseGl(gl),depreciation:depreciation.map(x=>({...x,line_key:`REV-${x.line_key}`,amount_minor:-x.amount_minor}))}:{gl,depreciation};}
}

interface CurrencyContext{transactionScale:number;companyCurrency:string;companyScale:number;rateMicros:number}
async function resolveCurrency(context:ControllerContext<JsonObject>,company:string,currency:string,postingAt:string,required:boolean):Promise<CurrencyContext>{const tx=await context.reader.getMasterRecordData(context.command.tenant_id,"Currency",currency);if(required&&!tx)throw errors.reference(`Currency ${currency} does not exist`);const companyData=await context.reader.getMasterRecordData(context.command.tenant_id,"Company",company);const companyCurrency=typeof companyData?.default_currency==="string"?companyData.default_currency:"";if(required&&!companyCurrency)throw errors.reference(`Company ${company} must define default_currency`);const companyCur=companyCurrency?await context.reader.getMasterRecordData(context.command.tenant_id,"Currency",companyCurrency):null;const transactionScale=typeof tx?.currency_scale==="number"?tx.currency_scale:2;const companyScale=typeof companyCur?.currency_scale==="number"?companyCur.currency_scale:2;if(companyCurrency===currency)return{transactionScale,companyCurrency,companyScale,rateMicros:1_000_000};for(const name of [`${currency}:${companyCurrency}:${postingAt.slice(0,10)}`,`${currency}:${companyCurrency}`]){const record=await context.reader.getMasterRecordData(context.command.tenant_id,"Exchange Rate",name);if(record&&(typeof record.rate==="string"||typeof record.rate==="number")){const rate=toScaledInt(record.rate,6);if(rate>0)return{transactionScale,companyCurrency,companyScale,rateMicros:rate};}}if(required)throw errors.reference(`Exchange Rate ${currency}:${companyCurrency} does not exist`);return{transactionScale,companyCurrency:companyCurrency||currency,companyScale,rateMicros:1_000_000};}
async function companyCurrency(context:ControllerContext<JsonObject>,company:string):Promise<{currency:string;scale:number}>{const data=await context.reader.getMasterRecordData(context.command.tenant_id,"Company",company);const currency=typeof data?.default_currency==="string"?data.default_currency:"";if(!currency)throw errors.reference(`Company ${company} must define default_currency`);const cur=await context.reader.getMasterRecordData(context.command.tenant_id,"Currency",currency);if(!cur)throw errors.reference(`Currency ${currency} does not exist`);return{currency,scale:typeof cur.currency_scale==="number"?cur.currency_scale:2};}
function baseTotals(totals:{net_total_minor:number;total_taxes_and_charges_minor:number;grand_total_minor:number},currency:CurrencyContext):JsonObject{return{base_net_total_minor:convertMinor(totals.net_total_minor,currency.transactionScale,currency.rateMicros,currency.companyScale),base_total_taxes_and_charges_minor:convertMinor(totals.total_taxes_and_charges_minor,currency.transactionScale,currency.rateMicros,currency.companyScale),base_grand_total_minor:convertMinor(totals.grand_total_minor,currency.transactionScale,currency.rateMicros,currency.companyScale)};}
function convertMinor(amount:number,sourceScale:number,rate:number,targetScale:number):number{return multiplyScaled(fromScaledInt(amount,sourceScale),sourceScale,fromScaledInt(rate,6),6,targetScale);}
async function requireSubmitted<T extends JsonObject>(context:ControllerContext<JsonObject>,doctype:string,name:string):Promise<CanonicalDocument<T>>{const doc=await context.reader.getDocument<T>(context.command.tenant_id,doctype,name);if(!doc||doc.docstatus!==1)throw errors.reference(`Submitted ${doctype} ${name} is required`);return doc;}
async function assertMasters(context:ControllerContext<JsonObject>,records:Array<[string,string]>):Promise<void>{for(const [type,name] of new Map(records.map(r=>[`${r[0]}:${r[1]}`,r])).values())if(!await context.reader.hasMasterRecord(context.command.tenant_id,type,name))throw errors.reference(`${type} ${name} does not exist or is disabled`);}
async function assertUnlocked(context:ControllerContext<JsonObject>,company:string,postingAt:string):Promise<void>{if(context.command.actor.roles.includes("System Manager")||context.command.actor.user_id==="Administrator")return;const lock=await context.reader.getPeriodLockDate(context.command.tenant_id,company);if(lock&&postingAt.slice(0,10)<=lock)throw errors.validation(`Posting date ${postingAt.slice(0,10)} is locked for ${company}`,{lock_date:lock});}
async function assertReturnRemaining(context:ControllerContext<JsonObject>,source:CanonicalDocument<JsonObject>,kind:ReturnEntry["kind"],items:ReturnItem[]):Promise<void>{for(const item of items){const original=source.children.filter(c=>c.fieldname==="items"&&c.data.item_code===item.item_code).reduce((sum,c)=>sum+(typeof c.data.qty_micros==="number"?c.data.qty_micros:toScaledInt(String(c.data.qty??0),6)),0);const returned=await context.reader.getReturnedQuantityMicros(context.command.tenant_id,source.doctype,source.name,kind,item.item_code);const qty=item.qty_micros??toScaledInt(item.qty,6);if(original<=0||returned+qty>original)throw errors.reference(`Return quantity for ${item.item_code} exceeds source quantity`);}}
function findSourceItem(source:CanonicalDocument<JsonObject>,itemCode:string):JsonObject{const child=source.children.find(c=>c.fieldname==="items"&&c.data.item_code===itemCode);if(!child)throw errors.reference(`Item ${itemCode} is not in ${source.doctype} ${source.name}`);return child.data;}
function reverseReturns(lines:ReturnEntry[]):ReturnEntry[]{return lines.map(x=>({...x,line_key:`REV-${x.line_key}`,qty_micros:-x.qty_micros}));}
function requireExisting<T extends JsonObject>(context:ControllerContext<T>):CanonicalDocument<T>{if(!context.existing)throw errors.notFound();return context.existing;}
function extractChildren(doctype:string,data:JsonObject):ChildRow[]{const result:ChildRow[]=[];for(const [fieldname,value] of Object.entries(data)){if(!Array.isArray(value))continue;value.forEach((row,index)=>{if(!row||typeof row!=="object"||Array.isArray(row))return;const object=row as JsonObject;result.push({fieldname,child_doctype:`${doctype} ${fieldname}`,row_id:String(object.row_id??`${fieldname}-${index+1}`),idx:index+1,data:structuredClone(object)});});}return result;}
function decimalValue(value:unknown,label:string):string|number{if(typeof value==="string"||typeof value==="number")return value;throw errors.validation(`${label} must be numeric`);}
function slug(value:string):string{return value.toLowerCase().replaceAll(" ","_");}
function divideRounded(numerator:number,denominator:number):number{if(!Number.isSafeInteger(numerator)||!Number.isSafeInteger(denominator)||denominator<=0)throw errors.validation("Arithmetic exceeds safe integer range");const sign=numerator<0?-1:1;const value=Math.abs(numerator);const q=Math.floor(value/denominator);return sign*(q+((value%denominator)*2>=denominator?1:0));}
