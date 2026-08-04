import { describe,expect,it } from "vitest";
import { cmd,createAndSubmit,env,post,readDoc,seedMaster } from "./r6-golden-flow-helpers.js";

describe("R6 Golden Flow on real workerd + D1 + Aggregate DO",()=>{
  it("runs commercial, procurement, manufacture, fulfillment and settlement with authoritative readback",async()=>{
    for(const [t,n,d] of [
      ["Company","Demo",{default_currency:"USD"}],["Customer","CUST-R6",{}],["Supplier","SUP-R6",{}],["Currency","USD",{currency_scale:2}],
      ["Item","RAW-R6",{valuation_method:"FIFO",standard_rate:"5"}],["Item","FG-R6",{valuation_method:"FIFO",standard_rate:"11"}],
      ["Warehouse","Stores",{}],["Warehouse","Finished",{}],["Account","Debtors",{}],["Account","Sales",{}],["Account","Bank",{}],["Account","Stock",{}],["Account","SRBNB",{}],
    ] as const) await seedMaster(t,n,d);

    const q={customer:"CUST-R6",company:"Demo",currency:"USD",transaction_date:"2026-08-04",valid_till:"2026-08-31",items:[{row_id:"SO-R6-ROW-1",item_code:"FG-R6",qty:"1",rate:"100"}],taxes:[]};
    await createAndSubmit("Quotation","QTN-R6",q);
    const so={customer:"CUST-R6",company:"Demo",currency:"USD",currency_scale:2,transaction_date:"2026-08-04",items:[{row_id:"SO-R6-ROW-1",item_code:"FG-R6",qty:"1",rate:"100"}],taxes:[]};
    await createAndSubmit("Sales Order","SO-R6",so);
    const po={supplier:"SUP-R6",company:"Demo",currency:"USD",transaction_date:"2026-08-04",items:[{row_id:"PO-R6-ROW-1",item_code:"RAW-R6",qty:"2",rate:"5"}],taxes:[]};
    await createAndSubmit("Purchase Order","PO-R6",po);
    const pr={supplier:"SUP-R6",company:"Demo",currency:"USD",posting_at:"2026-08-04T08:30:00.000Z",against_purchase_order:"PO-R6",stock_account:"Stock",stock_received_but_not_billed:"SRBNB",items:[{row_id:"PR-R6-ROW-1",item_code:"RAW-R6",qty:"2",rate:"5",warehouse:"Stores"}]};
    await createAndSubmit("Purchase Receipt","PR-R6",pr);
    const bom={company:"Demo",item:"FG-R6",quantity:"1",operating_cost:"1",items:[{row_id:"BOM-R6-ROW-1",item_code:"RAW-R6",qty:"2",source_warehouse:"Stores"}]};
    await createAndSubmit("Bill of Materials","BOM-R6",bom);
    const wo={company:"Demo",production_item:"FG-R6",bom_no:"BOM-R6",qty:"1",source_warehouse:"Stores",target_warehouse:"Finished",against_sales_order:"SO-R6",sales_order_row_id:"SO-R6-ROW-1"};
    await createAndSubmit("Work Order","WO-R6",wo);
    const mfg={company:"Demo",posting_at:"2026-08-04T09:00:00.000Z",purpose:"Manufacture",work_order:"WO-R6",source_warehouse:"Stores",finished_good_item:"FG-R6",finished_good_qty:"1",target_warehouse:"Finished",items:[{row_id:"MFG-R6-RAW-1",item_code:"RAW-R6",qty:"2",source_warehouse:"Stores"}]};
    await createAndSubmit("Stock Entry","MFG-R6",mfg);
    const dn={customer:"CUST-R6",company:"Demo",currency:"USD",currency_scale:2,posting_at:"2026-08-04T09:30:00.000Z",against_sales_order:"SO-R6",items:[{row_id:"DN-R6-ROW-1",item_code:"FG-R6",qty:"1",rate:"100",warehouse:"Finished",valuation_rate:"11",sales_order:"SO-R6",sales_order_row_id:"SO-R6-ROW-1"}]};
    await createAndSubmit("Delivery Note","DN-R6",dn);
    const si={customer:"CUST-R6",company:"Demo",currency:"USD",currency_scale:2,posting_at:"2026-08-04T10:00:00.000Z",against_sales_order:"SO-R6",debit_to:"Debtors",default_income_account:"Sales",items:[{row_id:"SI-R6-ROW-1",item_code:"FG-R6",qty:"1",rate:"100",income_account:"Sales",sales_order:"SO-R6"}],taxes:[]};
    await createAndSubmit("Sales Invoice","SI-R6",si);

    const pay=(name:string,amount:string)=>({company:"Demo",posting_at:"2026-08-04T10:30:00.000Z",payment_type:"Receive",party_type:"Customer",party:"CUST-R6",paid_from:"Debtors",paid_to:"Bank",paid_amount:amount,received_amount:amount,currency:"USD",currency_scale:2,references:[{row_id:`${name}-REF`,reference_doctype:"Sales Invoice",reference_name:"SI-R6",allocated_amount:amount}]});
    await createAndSubmit("Payment Entry","PE-R6-A",pay("PE-R6-A","40"));
    let out=await env.DB.prepare("SELECT COALESCE(SUM(amount_minor),0) total FROM payment_ledger_entries WHERE tenant_id='demo' AND against_voucher_type='Sales Invoice' AND against_voucher_no='SI-R6'").first<{total:number}>();
    expect(out?.total).toBe(6000);

    const final=pay("PE-R6-B","60");
    expect((await post(await cmd({id:"r6-pe-b-create",doctype:"Payment Entry",name:"PE-R6-B",action:"create",version:null,document:final}))).status).toBe(200);
    const submit=await cmd({id:"r6-pe-b-submit",doctype:"Payment Entry",name:"PE-R6-B",action:"submit",version:1,document:final});
    expect((await post(submit)).status).toBe(200);
    const before=await env.DB.prepare("SELECT COUNT(*) total FROM gl_entries WHERE tenant_id='demo' AND voucher_type='Payment Entry' AND voucher_no='PE-R6-B'").first<{total:number}>();
    expect((await post(submit)).status).toBe(200);
    const after=await env.DB.prepare("SELECT COUNT(*) total FROM gl_entries WHERE tenant_id='demo' AND voucher_type='Payment Entry' AND voucher_no='PE-R6-B'").first<{total:number}>();
    expect(after?.total).toBe(before?.total);
    out=await env.DB.prepare("SELECT COALESCE(SUM(amount_minor),0) total FROM payment_ledger_entries WHERE tenant_id='demo' AND against_voucher_type='Sales Invoice' AND against_voucher_no='SI-R6'").first<{total:number}>();
    expect(out?.total).toBe(0);

    const over={...dn,items:[{...dn.items[0],row_id:"DN-R6-OVER",qty:"1"}]};
    expect((await post(await cmd({id:"r6-dn-over-create",doctype:"Delivery Note",name:"DN-R6-OVER",action:"create",version:null,document:over}))).status).toBe(200);
    expect((await post(await cmd({id:"r6-dn-over-submit",doctype:"Delivery Note",name:"DN-R6-OVER",action:"submit",version:1,document:over}))).status).toBe(422);

    for(const [t,n] of [["Quotation","QTN-R6"],["Sales Order","SO-R6"],["Purchase Order","PO-R6"],["Purchase Receipt","PR-R6"],["Bill of Materials","BOM-R6"],["Work Order","WO-R6"],["Stock Entry","MFG-R6"],["Delivery Note","DN-R6"],["Sales Invoice","SI-R6"],["Payment Entry","PE-R6-A"],["Payment Entry","PE-R6-B"]] as const) expect((await readDoc(t,n))?.docstatus,`${t} ${n}`).toBe(1);
    const woRead=await readDoc("Work Order","WO-R6");
    expect(woRead?.data.manufacturing_snapshot).toBeTruthy();
    expect((await env.DB.prepare("SELECT COALESCE(SUM(actual_qty_micros),0) qty FROM stock_ledger_entries WHERE tenant_id='demo' AND item_code='RAW-R6' AND warehouse='Stores'").first<{qty:number}>())?.qty).toBe(0);
    expect((await env.DB.prepare("SELECT COALESCE(SUM(actual_qty_micros),0) qty FROM stock_ledger_entries WHERE tenant_id='demo' AND item_code='FG-R6' AND warehouse='Finished'").first<{qty:number}>())?.qty).toBe(0);
    expect((await env.DB.prepare("SELECT COALESCE(SUM(debit_minor-credit_minor),0) balance FROM gl_entries WHERE tenant_id='demo' AND voucher_type='Sales Invoice' AND voucher_no='SI-R6'").first<{balance:number}>())?.balance).toBe(0);
  });
});
