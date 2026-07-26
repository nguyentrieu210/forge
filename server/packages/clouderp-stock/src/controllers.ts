import type { CanonicalDocument, ChildRow, GeneralLedgerEntry, JsonObject, MutationPlan, StockLedgerEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { reverseGl, reverseStock } from "../../ledger/src/index.js";
import { fromScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import { expectedCurrentStockValue, getItemValuationMethod } from "./valuation.js";
import { normalizeBundleRows } from "./tracking.js";
import type { RepostItemValuationData, SerialBatchBundleData } from "./types.js";

abstract class Base<T extends JsonObject> implements DocumentController<T> {
  abstract readonly doctype: string;
  abstract normalize(context: ControllerContext<T>): Promise<T>;
  abstract ledgers(context: ControllerContext<T>, data: T): Promise<{gl?:GeneralLedgerEntry[];stock?:StockLedgerEntry[]}>;
  async buildPlan(context: ControllerContext<T>): Promise<MutationPlan<T>> {
    const data = context.command.action === "cancel" ? structuredClone(requireExisting(context).data) : await this.normalize(context);
    const docstatus=nextDocStatus(context.command.action); const status=docstatus===0?"Draft":docstatus===1?"Submitted":"Cancelled"; const ledger=await this.ledgers(context,data);
    const document:CanonicalDocument<T>={tenant_id:context.command.tenant_id,doctype:this.doctype,name:context.command.aggregate.name,owner:context.existing?.owner??context.command.actor.user_id,docstatus,status,version:context.nextVersion,created_at:context.existing?.created_at??context.now,modified_at:context.now,data,children:children(this.doctype,data)};
    return { command:context.command,document,gl_entries:ledger.gl??[],stock_entries:ledger.stock??[],payment_entries:[],fulfillment_entries:[],events:[domainEvent({type:`${this.doctype.toLowerCase().replaceAll(" ","_")}.${context.command.action}`,tenantId:context.command.tenant_id,aggregate:context.command.aggregate,aggregateVersion:context.nextVersion,actor:context.command.actor.user_id,commandId:context.command.command_id,occurredAt:context.now,payload:{status}})],result:{doctype:this.doctype,name:document.name,version:document.version,docstatus,status} };
  }
}

export class SerialAndBatchBundleController extends Base<SerialBatchBundleData> {
  readonly doctype="Serial and Batch Bundle";
  async normalize(context:ControllerContext<SerialBatchBundleData>):Promise<SerialBatchBundleData>{
    const input=context.command.document;
    if(!input.item_code||!input.warehouse||!input.posting_at||!["Inward","Outward"].includes(input.type))throw errors.validation("Item, warehouse, posting_at and valid bundle type are required");
    const entries=normalizeBundleRows(input.entries); const total=entries.reduce((sum,row)=>sum+(row.qty_micros??0),0);
    if(context.command.action==="submit"){
      if(await context.reader.isStockBundleUsed(context.command.tenant_id,context.command.aggregate.name))throw errors.reference("Used bundle cannot be resubmitted");
      for(const [type,name] of [["Item",input.item_code],["Warehouse",input.warehouse]] as Array<[string,string]>) if(!await context.reader.hasMasterRecord(context.command.tenant_id,type,name))throw errors.reference(`${type} ${name} does not exist`);
      for(const row of entries){if(row.batch_no&&!await context.reader.hasMasterRecord(context.command.tenant_id,"Batch",row.batch_no))throw errors.reference(`Batch ${row.batch_no} does not exist`);if(row.serial_no){const serial=await context.reader.getMasterRecordData(context.command.tenant_id,"Serial No",row.serial_no);if(input.type==="Outward"&&!serial)throw errors.reference(`Serial No ${row.serial_no} does not exist`);}}
    }
    return {...input,entries,total_qty_micros:total,total_qty:fromScaledInt(total,6)};
  }
  async ledgers(context:ControllerContext<SerialBatchBundleData>):Promise<{}>{if(context.command.action==="cancel"&&await context.reader.isStockBundleUsed(context.command.tenant_id,context.command.aggregate.name))throw errors.reference("Used Serial and Batch Bundle cannot be cancelled");return{};}
}

export class RepostItemValuationController extends Base<RepostItemValuationData>{
  readonly doctype="Repost Item Valuation";
  async normalize(context:ControllerContext<RepostItemValuationData>):Promise<RepostItemValuationData>{
    const input=context.command.document;if(!input.company||!input.item_code||!input.warehouse||!input.posting_at||!input.stock_account||!input.difference_account)throw errors.validation("Company, item, warehouse, posting_at and accounts are required");
    const company=await context.reader.getMasterRecordData(context.command.tenant_id,"Company",input.company);const currency=typeof company?.default_currency==="string"?company.default_currency:"";const cur=currency?await context.reader.getMasterRecordData(context.command.tenant_id,"Currency",currency):null;const scale=typeof cur?.currency_scale==="number"?cur.currency_scale:2;
    if(context.command.action==="submit")for(const [type,name] of [["Company",input.company],["Item",input.item_code],["Warehouse",input.warehouse],["Account",input.stock_account],["Account",input.difference_account]] as Array<[string,string]>)if(!await context.reader.hasMasterRecord(context.command.tenant_id,type,name))throw errors.reference(`${type} ${name} does not exist`);
    const history=await context.reader.getStockLedgerHistory(context.command.tenant_id,input.item_code,input.warehouse,input.posting_at);const method=await getItemValuationMethod(context as unknown as ControllerContext<JsonObject>,input.item_code);const current=history.reduce((sum,line)=>sum+line.stock_value_difference_minor,0);const expected=expectedCurrentStockValue(history,method);const adjustment=expected-current;
    return {...input,valuation_method:method,current_stock_value_minor:current,expected_stock_value_minor:expected,adjustment_minor:adjustment,currency:currency||"USD",currency_scale:scale};
  }
  async ledgers(context:ControllerContext<RepostItemValuationData>,data:RepostItemValuationData):Promise<{gl?:GeneralLedgerEntry[];stock?:StockLedgerEntry[]}>{
    if(!["submit","cancel"].includes(context.command.action))return{};await assertUnlocked(context,data.company,data.posting_at);const adjustment=data.adjustment_minor??0;if(adjustment===0)return{};const stock:[StockLedgerEntry]=[{line_key:"VALUATION-ADJUSTMENT",item_code:data.item_code,warehouse:data.warehouse,actual_qty_micros:0,valuation_rate_minor:0,stock_value_difference_minor:adjustment,qty_scale:6,currency_scale:data.currency_scale??2,currency:data.currency??"USD",posting_at:data.posting_at}];const gl:GeneralLedgerEntry[]=[{line_key:"STOCK",account:data.stock_account,debit_minor:adjustment>0?adjustment:0,credit_minor:adjustment<0?-adjustment:0,currency:data.currency??"USD",currency_scale:data.currency_scale??2,posting_at:data.posting_at},{line_key:"DIFFERENCE",account:data.difference_account,debit_minor:adjustment<0?-adjustment:0,credit_minor:adjustment>0?adjustment:0,currency:data.currency??"USD",currency_scale:data.currency_scale??2,posting_at:data.posting_at}];return context.command.action==="cancel"?{stock:reverseStock(stock),gl:reverseGl(gl)}:{stock,gl};
  }
}

function requireExisting<T extends JsonObject>(context:ControllerContext<T>):CanonicalDocument<T>{if(!context.existing)throw errors.notFound();return context.existing;}
function children(doctype:string,data:JsonObject):ChildRow[]{const result:ChildRow[]=[];for(const [fieldname,value] of Object.entries(data)){if(!Array.isArray(value))continue;value.forEach((row,index)=>{if(!row||typeof row!=="object"||Array.isArray(row))return;const obj=row as JsonObject;result.push({fieldname,child_doctype:`${doctype} ${fieldname}`,row_id:String(obj.row_id??`${fieldname}-${index+1}`),idx:index+1,data:structuredClone(obj)});});}return result;}

async function assertUnlocked(context:ControllerContext<JsonObject>,company:string,postingAt:string):Promise<void>{if(context.command.actor.roles.includes("System Manager")||context.command.actor.user_id==="Administrator")return;const lock=await context.reader.getPeriodLockDate(context.command.tenant_id,company);if(lock&&postingAt.slice(0,10)<=lock)throw errors.validation(`Posting date ${postingAt.slice(0,10)} is locked for ${company}`,{lock_date:lock});}
