import assert from "node:assert/strict";
import test from "node:test";

import { routeManufacturingCapacityApi } from "../dist/apps/tenant-worker/src/manufacturing-capacity-api.js";

const URL = "https://tenant.test/api/method/metaforge.manufacturing.preview_capacity_plan";

function doc(doctype, name, data, docstatus = 1) {
  return { tenant_id:"tenant-a",doctype,name,owner:"planner@example.com",docstatus,status:docstatus===1?"Submitted":"Draft",version:1,created_at:"2026-08-03T00:00:00.000Z",modified_at:"2026-08-03T00:00:00.000Z",children:[],data };
}
function plan(){return doc("Production Plan","PLAN-1",{company:"ACME",posting_at:"2026-08-03",items:[{row_id:"P",item_code:"FG",bom_no:"BOM-FG",planned_qty:"2",schedule_date:"2026-08-05"}]});}
function bom(){return doc("Bill of Materials","BOM-FG",{company:"ACME",item:"FG",quantity:"1",quantity_micros:1_000_000,output_stock_qty_micros:1_000_000,revision:1,bom_status:"Active",effective_from:"2026-01-01",items:[{row_id:"R",item_code:"RM",qty:"1",qty_micros:1_000_000,stock_qty_micros:1_000_000,qty_basis:"Cố định",source_warehouse:"RAW"}]});}
function routing(){return doc("Manufacturing Routing","RT-FG",{company:"ACME",routing_name:"FG",item_code:"FG",effective_from:"2026-01-01",is_active:true,operations:[{row_id:"O",sequence:1,operation:"Cut",workstation:"WS",setup_minutes:"0",run_minutes_per_unit:"60"}]});}
function calendar(){return doc("Workstation Capacity Calendar","CAL-WS",{company:"ACME",workstation:"WS",effective_from:"2026-01-01",utilization_percent:"100",days:["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((weekday,i)=>({row_id:`D${i}`,weekday,capacity_hours:"8"}))});}
function downtime(){return doc("Manufacturing Downtime","DT-1",{company:"ACME",workstation:"WS",from_time:"2026-08-03T08:00:00Z",to_time:"2026-08-03T09:00:00Z",category:"Maintenance",reason:"Service"});}
function request(body){return new Request(URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
function context({hidden=new Set()}={}){const permissionCalls=[];return{permissionCalls,value:{tenantId:"tenant-a",actor:{user_id:"planner@example.com",roles:["Manufacturing Planner"]},traceId:"trace-cap",permissions:{async assert(x){permissionCalls.push(x);},async canReadDocument(_a,_t,d){return !hidden.has(d.name);}},async loadProductionPlan(){return plan();},async listBomDocuments(){return[bom()];},async listRoutings(){return[routing()];},async listCalendars(){return[calendar()];},async listDowntimes(){return[downtime()];}}};}

test("capacity API returns finite schedule and subtracts visible downtime",async()=>{const ctx=context();const response=await routeManufacturingCapacityApi(request({production_plan:"PLAN-1",through_date:"2026-08-05"}),new URL(URL),ctx.value);assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.message.operations[0].required_minutes,"120.000000");assert.equal(payload.message.workstation_summary[0].downtime_minutes,"60.000000");assert.equal(ctx.permissionCalls.length,4);});

test("capacity API fails closed when relevant routing is hidden",async()=>{const ctx=context({hidden:new Set(["RT-FG"])});await assert.rejects(()=>routeManufacturingCapacityApi(request({production_plan:"PLAN-1",through_date:"2026-08-05"}),new URL(URL),ctx.value),/relevant Manufacturing Routing is outside/);});

test("capacity API fails closed when relevant downtime is hidden",async()=>{const ctx=context({hidden:new Set(["DT-1"])});await assert.rejects(()=>routeManufacturingCapacityApi(request({production_plan:"PLAN-1",through_date:"2026-08-05"}),new URL(URL),ctx.value),/Relevant workstation downtime is outside/);});

test("capacity API rejects client tenant selection",async()=>{const ctx=context();await assert.rejects(()=>routeManufacturingCapacityApi(request({production_plan:"PLAN-1",through_date:"2026-08-05",tenant_id:"other"}),new URL(URL),ctx.value),/tenant scope is controlled/);});
