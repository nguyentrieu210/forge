import assert from "node:assert/strict";
import test from "node:test";

import { netMrpAgainstProjectedAvailability } from "../dist/packages/clouderp-erpnext/src/index.js";

const Q=1_000_000;
function req(type,item,qty,warehouse="RAW",date="2026-08-05"){
  return { requirement_type:type,item_code:item,warehouse,schedule_date:date,gross_qty:Number(qty).toFixed(6),gross_qty_micros:qty*Q,source_count:1,sources:[] };
}
function mrp(purchase,manufacture=[]){
  return { schema_version:1,company:"ACME",production_plan:"PLAN-1",planning_date:"2026-08-03",netting_mode:"gross_only",planned_outputs:[],purchase_requirements:purchase,manufacture_requirements:manufacture,warnings:[] };
}

test("projected MRP combines on-hand, dated PO and WO supply then subtracts reservation and safety stock",async()=>{
  const result=await netMrpAgainstProjectedAvailability(
    mrp([req("Purchase","RM",12,"RAW","2026-08-10")]),
    async()=>({
      on_hand_qty_micros:5*Q,
      open_purchase_qty_micros:6*Q,
      open_manufacture_qty_micros:4*Q,
      reserved_qty_micros:2*Q,
      safety_stock_qty_micros:3*Q,
    }),
  );
  const row=result.purchase_requirements[0];
  assert.equal(result.netting_mode,"PROJECTED_MRP_V1");
  assert.equal(row.projected_before_demand,"13.000000");
  assert.equal(row.available_before,"10.000000");
  assert.equal(row.allocated_projected,"10.000000");
  assert.equal(row.net_requirement,"2.000000");
});

test("projected MRP allocates cumulative dated supply only once across need dates",async()=>{
  const result=await netMrpAgainstProjectedAvailability(
    mrp([
      req("Purchase","RM",4,"RAW","2026-08-05"),
      req("Purchase","RM",5,"RAW","2026-08-10"),
    ]),
    async(_item,_warehouse,date)=>date<="2026-08-05"
      ? {on_hand_qty_micros:3*Q,open_purchase_qty_micros:1*Q}
      : {on_hand_qty_micros:3*Q,open_purchase_qty_micros:5*Q},
  );
  assert.equal(result.purchase_requirements[0].net_requirement,"0.000000");
  assert.equal(result.purchase_requirements[1].available_before,"4.000000");
  assert.equal(result.purchase_requirements[1].net_requirement,"1.000000");
});

test("projected MRP keeps Purchase and Manufacture requirements competing for one material pool",async()=>{
  const result=await netMrpAgainstProjectedAvailability(
    mrp([req("Purchase","SUB",4,"WIP","2026-08-06")],[req("Manufacture","SUB",5,"WIP","2026-08-05")]),
    async()=>({on_hand_qty_micros:6*Q}),
  );
  assert.equal(result.manufacture_requirements[0].allocated_projected,"5.000000");
  assert.equal(result.purchase_requirements[0].available_before,"1.000000");
  assert.equal(result.purchase_requirements[0].net_requirement,"3.000000");
});

test("incomplete projected evidence fails closed and does not reduce gross demand",async()=>{
  const result=await netMrpAgainstProjectedAvailability(
    mrp([req("Purchase","RM",4)]),
    async()=>({on_hand_qty_micros:100*Q,complete:false,warnings:["UNSCOPED_RESERVATION:RM"]}),
  );
  const row=result.purchase_requirements[0];
  assert.equal(row.availability_complete,false);
  assert.equal(row.allocated_projected,"0.000000");
  assert.equal(row.net_requirement,"4.000000");
  assert.deepEqual(result.warnings,["UNSCOPED_RESERVATION:RM"]);
});

test("safety stock is protected even when projected physical quantity is positive",async()=>{
  const result=await netMrpAgainstProjectedAvailability(
    mrp([req("Purchase","RM",3)]),
    async()=>({on_hand_qty_micros:5*Q,safety_stock_qty_micros:4*Q}),
  );
  assert.equal(result.purchase_requirements[0].available_before,"1.000000");
  assert.equal(result.purchase_requirements[0].net_requirement,"2.000000");
});

test("missing warehouse never consumes projected supply",async()=>{
  const row=req("Purchase","RM",2); delete row.warehouse;
  const result=await netMrpAgainstProjectedAvailability(mrp([row]),async()=>({on_hand_qty_micros:100*Q}));
  assert.equal(result.purchase_requirements[0].net_requirement,"2.000000");
  assert.equal(result.purchase_requirements[0].availability_complete,false);
  assert.deepEqual(result.warnings,["UNALLOCATED_WAREHOUSE:RM"]);
});
