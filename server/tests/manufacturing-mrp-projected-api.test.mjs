import assert from "node:assert/strict";
import test from "node:test";

import { routeManufacturingMrpApi } from "../dist/apps/tenant-worker/src/manufacturing-mrp-api.js";

const PREVIEW="https://tenant.test/api/method/metaforge.manufacturing.preview_production_plan_mrp";
const CREATE="https://tenant.test/api/method/metaforge.manufacturing.create_mrp_material_request";
const Q=1_000_000;

function plan(){return{
  tenant_id:"tenant-a",doctype:"Production Plan",name:"PLAN-1",owner:"planner@example.com",docstatus:1,status:"Planned",version:1,
  created_at:"2026-08-03T00:00:00Z",modified_at:"2026-08-03T00:00:00Z",children:[],
  data:{company:"ACME",posting_at:"2026-08-03",items:[{row_id:"P1",item_code:"FG",bom_no:"BOM-FG",planned_qty:"2",warehouse:"FG"}]},
};}
function bom(){return{
  tenant_id:"tenant-a",doctype:"Bill of Materials",name:"BOM-FG",owner:"planner@example.com",docstatus:1,status:"Submitted",version:1,
  created_at:"2026-08-01T00:00:00Z",modified_at:"2026-08-01T00:00:00Z",children:[],
  data:{company:"ACME",item:"FG",quantity:"1.000000",quantity_micros:Q,output_stock_qty_micros:Q,revision:1,bom_status:"Active",effective_from:"2026-01-01",
    items:[{row_id:"R1",item_code:"RM",qty:"3.000000",qty_micros:3*Q,stock_qty_micros:3*Q,qty_basis:"Cố định",source_warehouse:"RAW"}]},
};}
function req(url,body){return new Request(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
function ctx({availability,requests=[]}={}){
  const creates=[];
  return {creates,value:{
    tenantId:"tenant-a",actor:{user_id:"planner@example.com",roles:["Manufacturing User"]},traceId:"trace-r9",
    permissions:{async assert(){},async canReadDocument(){return true;}},
    async loadProductionPlan(name){return name==="PLAN-1"?plan():null;},
    async listBomDocuments(){return [bom()];},
    async listMaterialRequests(){return requests;},
    async getProjectedAvailability(company,item,warehouse,date){
      return availability?availability(company,item,warehouse,date):{on_hand_qty_micros:0};
    },
    async createCanonicalMaterialRequest(document){
      creates.push(document);
      return new Response(JSON.stringify({data:{name:"MR-R9",docstatus:0}}),{status:201,headers:{"content-type":"application/json"}});
    },
  }};
}

test("projected MRP preview exposes dated availability without changing gross explosion",async()=>{
  const c=ctx({availability:async(company,item,warehouse,date)=>{
    assert.deepEqual([company,item,warehouse,date],["ACME","RM","RAW","2026-08-03"]);
    return {on_hand_qty_micros:2*Q,open_purchase_qty_micros:2*Q,reserved_qty_micros:Q,safety_stock_qty_micros:Q};
  }});
  const response=await routeManufacturingMrpApi(req(PREVIEW,{production_plan:"PLAN-1",net_projected_mrp:1}),new URL(PREVIEW),c.value);
  const body=await response.json();
  assert.equal(body.message.purchase_requirements[0].gross_qty,"6.000000");
  assert.equal(body.message.projected_netting.netting_mode,"PROJECTED_MRP_V1");
  assert.equal(body.message.projected_netting.purchase_requirements[0].net_requirement,"4.000000");
});

test("projected MRP conversion creates only the post-net shortage",async()=>{
  const c=ctx({availability:async()=>({on_hand_qty_micros:2*Q})});
  const response=await routeManufacturingMrpApi(req(CREATE,{production_plan:"PLAN-1",material_request_type:"Purchase",net_projected_mrp:1}),new URL(CREATE),c.value);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.message.created,true);
  assert.equal(body.message.netting_mode,"PROJECTED_MRP_V1");
  assert.equal(c.creates.length,1);
  assert.equal(c.creates[0].mrp_netting_mode,"PROJECTED_MRP_V1");
  assert.equal(c.creates[0].items[0].qty,"4.000000");
  assert.match(c.creates[0].mrp_fingerprint,/^[a-f0-9]{64}$/);
});

test("projected MRP conversion creates nothing when authoritative projected supply covers demand",async()=>{
  const c=ctx({availability:async()=>({on_hand_qty_micros:2*Q,open_purchase_qty_micros:4*Q})});
  const response=await routeManufacturingMrpApi(req(CREATE,{production_plan:"PLAN-1",material_request_type:"Purchase",net_projected_mrp:true}),new URL(CREATE),c.value);
  const body=await response.json();
  assert.equal(body.message.created,false);
  assert.equal(body.message.reason,"NO_REQUIREMENTS");
  assert.equal(body.message.netting_mode,"PROJECTED_MRP_V1");
  assert.equal(c.creates.length,0);
});

test("ambiguous projected evidence fails closed so conversion keeps gross demand",async()=>{
  const c=ctx({availability:async()=>({on_hand_qty_micros:100*Q,complete:false,warnings:["UNSCOPED_RESERVATION:RES-1"]})});
  await routeManufacturingMrpApi(req(CREATE,{production_plan:"PLAN-1",material_request_type:"Purchase",net_projected_mrp:1}),new URL(CREATE),c.value);
  assert.equal(c.creates[0].items[0].qty,"6.000000");
});

test("on-hand and projected modes cannot be mixed in one preview",async()=>{
  const c=ctx();
  await assert.rejects(
    ()=>routeManufacturingMrpApi(req(PREVIEW,{production_plan:"PLAN-1",net_on_hand:1,net_projected_mrp:1}),new URL(PREVIEW),c.value),
    /either net_on_hand or net_projected_mrp/,
  );
});
