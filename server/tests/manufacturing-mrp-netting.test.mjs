import assert from "node:assert/strict";
import test from "node:test";

import { netMrpAgainstOnHand } from "../dist/packages/clouderp-erpnext/src/index.js";

function req(type,item,qty,warehouse="RAW",date="2026-08-05") { return { requirement_type:type,item_code:item,warehouse,schedule_date:date,gross_qty:Number(qty).toFixed(6),gross_qty_micros:qty*1_000_000,source_count:1,sources:[] }; }
function mrp(purchase,manufacture=[]) { return { schema_version:1,company:"ACME",production_plan:"PLAN-1",planning_date:"2026-08-03",netting_mode:"gross_only",planned_outputs:[],purchase_requirements:purchase,manufacture_requirements:manufacture,warnings:[] }; }

test("on-hand netting allocates stock once in need-date order", async()=>{
  const balances=new Map([["RM\u0000RAW",5_000_000]]);
  const result=await netMrpAgainstOnHand(mrp([req("Purchase","RM",4,"RAW","2026-08-04"),req("Purchase","RM",4,"RAW","2026-08-05")]),async(item,wh)=>balances.get(`${item}\u0000${wh}`)??0);
  assert.equal(result.netting_mode,"ON_HAND_ONLY_NOT_ATP");
  assert.equal(result.purchase_requirements[0].allocated_on_hand,"4.000000");
  assert.equal(result.purchase_requirements[0].net_requirement,"0.000000");
  assert.equal(result.purchase_requirements[1].on_hand_before,"1.000000");
  assert.equal(result.purchase_requirements[1].allocated_on_hand,"1.000000");
  assert.equal(result.purchase_requirements[1].net_requirement,"3.000000");
});

test("on-hand netting never shares one warehouse balance with another warehouse", async()=>{
  const result=await netMrpAgainstOnHand(mrp([req("Purchase","RM",3,"RAW-A"),req("Purchase","RM",3,"RAW-B")]),async(_item,wh)=>wh==="RAW-A"?2_000_000:1_000_000);
  assert.deepEqual(result.purchase_requirements.map(r=>r.net_requirement),["1.000000","2.000000"]);
});

test("on-hand netting keeps Purchase and Manufacture demands competing for the same physical balance by date", async()=>{
  const result=await netMrpAgainstOnHand(mrp([req("Purchase","SUB",3,"WIP","2026-08-06")],[req("Manufacture","SUB",4,"WIP","2026-08-05")]),async()=>5_000_000);
  assert.equal(result.manufacture_requirements[0].net_requirement,"0.000000");
  assert.equal(result.purchase_requirements[0].on_hand_before,"1.000000");
  assert.equal(result.purchase_requirements[0].net_requirement,"2.000000");
});

test("on-hand netting does not invent a warehouse or reduce an unallocated requirement", async()=>{
  const row=req("Purchase","RM",2); delete row.warehouse;
  const result=await netMrpAgainstOnHand(mrp([row]),async()=>99_000_000);
  assert.equal(result.purchase_requirements[0].allocated_on_hand,"0.000000");
  assert.equal(result.purchase_requirements[0].net_requirement,"2.000000");
  assert.deepEqual(result.warnings,["UNALLOCATED_WAREHOUSE:RM"]);
});

test("on-hand netting floors negative physical balance at zero instead of turning shortage into extra demand", async()=>{
  const result=await netMrpAgainstOnHand(mrp([req("Purchase","RM",2)]),async()=>-3_000_000);
  assert.equal(result.purchase_requirements[0].on_hand_before,"0.000000");
  assert.equal(result.purchase_requirements[0].net_requirement,"2.000000");
});
