import assert from "node:assert/strict";
import test from "node:test";

import { createProjectedMrpAvailabilityResolver } from "../dist/packages/clouderp-erpnext/src/index.js";

const Q=1_000_000;
function doc(doctype,name,data,docstatus=1){
  return {tenant_id:"tenant-a",doctype,name,owner:"planner",docstatus,status:docstatus===1?"Submitted":"Draft",version:1,created_at:"2026-08-01T00:00:00Z",modified_at:"2026-08-01T00:00:00Z",children:[],data};
}
function reader({purchaseOrders=[],workOrders=[],reservations=[],item={},onHand=0,received=new Map(),manufactured=new Map()}={}){
  return {
    async getStockBalanceMicros(){ return onHand; },
    async listDocumentsByDoctype(_tenant,doctype){
      if(doctype==="Purchase Order") return purchaseOrders;
      if(doctype==="Work Order") return workOrders;
      if(doctype==="Stock Reservation") return reservations;
      return [];
    },
    async getProcuredQuantityMicros(_tenant,po,_kind,_item,row){ return received.get(`${po}:${row}`)??0; },
    async getManufacturedQuantityMicros(_tenant,wo){ return manufactured.get(wo)??0; },
    async getMasterRecordData(_tenant,type,name){ return type==="Item"&&name==="RM"?item:null; },
  };
}

test("resolver derives dated open PO + WO supply, reservations and safety stock from canonical sources",async()=>{
  const purchaseOrders=[doc("Purchase Order","PO-1",{company:"ACME",transaction_date:"2026-08-01",schedule_date:"2026-08-08",items:[
    {row_id:"P1",item_code:"RM",warehouse:"RAW",stock_qty_micros:8*Q,qty:"8"},
  ]})];
  const workOrders=[doc("Work Order","WO-1",{company:"ACME",production_item:"RM",target_warehouse:"RAW",planned_end_date:"2026-08-09",qty_micros:5*Q,qty:"5"})];
  const reservations=[doc("Stock Reservation","RES-1",{item_code:"RM",warehouse:"RAW",qty_reserved:"2",state:"Đang giữ",expires_at:"2026-08-20T00:00:00Z"},0)];
  const resolve=createProjectedMrpAvailabilityResolver({
    tenantId:"tenant-a",company:"ACME",now:"2026-08-04T00:00:00Z",
    reader:reader({purchaseOrders,workOrders,reservations,item:{reorder_levels:[{warehouse:"RAW",safety_stock:"3"}]},onHand:4*Q,received:new Map([["PO-1:P1",3*Q]]),manufactured:new Map([["WO-1",1*Q]])}),
  });
  const out=await resolve("RM","RAW","2026-08-10");
  assert.deepEqual(out,{
    on_hand_qty_micros:4*Q,
    open_purchase_qty_micros:5*Q,
    open_manufacture_qty_micros:4*Q,
    reserved_qty_micros:2*Q,
    safety_stock_qty_micros:3*Q,
    complete:true,
    warnings:[],
  });
});

test("resolver respects need date and never counts future supply early",async()=>{
  const purchaseOrders=[
    doc("Purchase Order","PO-EARLY",{company:"ACME",schedule_date:"2026-08-05",items:[{row_id:"E",item_code:"RM",warehouse:"RAW",stock_qty_micros:2*Q,qty:"2"}]}),
    doc("Purchase Order","PO-LATE",{company:"ACME",schedule_date:"2026-08-20",items:[{row_id:"L",item_code:"RM",warehouse:"RAW",stock_qty_micros:9*Q,qty:"9"}]}),
  ];
  const resolve=createProjectedMrpAvailabilityResolver({tenantId:"tenant-a",company:"ACME",now:"2026-08-04T00:00:00Z",reader:reader({purchaseOrders})});
  assert.equal((await resolve("RM","RAW","2026-08-10")).open_purchase_qty_micros,2*Q);
  assert.equal((await resolve("RM","RAW","2026-08-25")).open_purchase_qty_micros,11*Q);
});

test("warehouse-less active reservation makes projected availability incomplete",async()=>{
  const reservations=[doc("Stock Reservation","RES-OPEN",{item_code:"RM",qty_reserved:"2",state:"Đang giữ"},0)];
  const resolve=createProjectedMrpAvailabilityResolver({tenantId:"tenant-a",company:"ACME",now:"2026-08-04T00:00:00Z",reader:reader({reservations,onHand:100*Q})});
  const out=await resolve("RM","RAW","2026-08-10");
  assert.equal(out.complete,false);
  assert.deepEqual(out.warnings,["UNSCOPED_RESERVATION:RES-OPEN"]);
});

test("expired and other-warehouse reservations do not reduce this warehouse",async()=>{
  const reservations=[
    doc("Stock Reservation","RES-OLD",{item_code:"RM",warehouse:"RAW",qty_reserved:"2",state:"Đang giữ",expires_at:"2026-08-01T00:00:00Z"},0),
    doc("Stock Reservation","RES-OTHER",{item_code:"RM",warehouse:"OTHER",qty_reserved:"3",state:"Đang giữ"},0),
  ];
  const resolve=createProjectedMrpAvailabilityResolver({tenantId:"tenant-a",company:"ACME",now:"2026-08-04T00:00:00Z",reader:reader({reservations})});
  assert.equal((await resolve("RM","RAW","2026-08-10")).reserved_qty_micros,0);
});

test("duplicate safety-stock rules fail closed instead of choosing one arbitrarily",async()=>{
  const resolve=createProjectedMrpAvailabilityResolver({
    tenantId:"tenant-a",company:"ACME",now:"2026-08-04T00:00:00Z",
    reader:reader({item:{reorder_levels:[{warehouse:"RAW",safety_stock:"1"},{warehouse:"RAW",safety_stock:"2"}]}}),
  });
  const out=await resolve("RM","RAW","2026-08-10");
  assert.equal(out.complete,false);
  assert.deepEqual(out.warnings,["DUPLICATE_SAFETY_STOCK_RULE:RM:RAW"]);
});

test("open PO progress is row-specific so duplicate item rows cannot overstate supply",async()=>{
  const purchaseOrders=[doc("Purchase Order","PO-1",{company:"ACME",schedule_date:"2026-08-05",items:[
    {row_id:"A",item_code:"RM",warehouse:"RAW",stock_qty_micros:4*Q,qty:"4"},
    {row_id:"B",item_code:"RM",warehouse:"RAW",stock_qty_micros:6*Q,qty:"6"},
  ]})];
  const resolve=createProjectedMrpAvailabilityResolver({
    tenantId:"tenant-a",company:"ACME",now:"2026-08-04T00:00:00Z",
    reader:reader({purchaseOrders,received:new Map([["PO-1:A",4*Q],["PO-1:B",2*Q]])}),
  });
  assert.equal((await resolve("RM","RAW","2026-08-10")).open_purchase_qty_micros,4*Q);
});
