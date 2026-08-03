import assert from "node:assert/strict";
import test from "node:test";

import { routeManufacturingCostingApi } from "../dist/apps/tenant-worker/src/manufacturing-costing-api.js";

const URL="https://tenant.test/api/method/metaforge.manufacturing.get_work_order_cost_evidence";
function doc(doctype,name,data,docstatus=1){return{tenant_id:"tenant-a",doctype,name,owner:"planner@example.com",docstatus,status:docstatus===1?"Submitted":"Draft",version:1,created_at:"2026-08-03T00:00:00Z",modified_at:"2026-08-03T00:00:00Z",children:[],data};}
function wo(){return doc("Work Order","WO-1",{company:"ACME",production_item:"FG",bom_no:"BOM-FG",bom_checksum:"abc",qty:"2",qty_micros:2_000_000});}
function bom(checksum="abc"){return doc("Bill of Materials","BOM-FG",{company:"ACME",item:"FG",quantity:"1",quantity_micros:1_000_000,revision:1,bom_checksum:checksum,currency:"VND",currency_scale:0,raw_material_cost_minor:100,operating_cost_minor:20});}
function ste(){return doc("Stock Entry","STE-1",{company:"ACME",posting_at:"2026-08-03T01:00:00Z",purpose:"Manufacture",work_order:"WO-1",finished_good_item:"FG",finished_good_qty:"2",target_warehouse:"FG",items:[{row_id:"R",item_code:"RM",qty:"2",source_warehouse:"RAW",bom_row_id:"R"}]});}
function ledger(){return[{line_key:"SRC-R",item_code:"RM",warehouse:"RAW",actual_qty_micros:-2_000_000,valuation_rate_minor:100,stock_value_difference_minor:-200,qty_scale:6,currency_scale:0,currency:"VND",posting_at:"2026-08-03T01:00:00Z"},{line_key:"FINISHED",item_code:"FG",warehouse:"FG",actual_qty_micros:2_000_000,valuation_rate_minor:120,stock_value_difference_minor:240,qty_scale:6,currency_scale:0,currency:"VND",posting_at:"2026-08-03T01:00:00Z"}];}
function request(body){return new Request(URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
function context({hidden=new Set(),checksum="abc"}={}){return{tenantId:"tenant-a",actor:{user_id:"planner@example.com",roles:["Manufacturing Planner"]},traceId:"trace-cost",permissions:{async canReadDocument(_a,_t,d){return !hidden.has(d.name);}},async loadWorkOrder(){return wo();},async loadBom(){return bom(checksum);},async listStockEntries(){return[ste()];},async getVoucherStockEntries(){return ledger();}};}

test("cost evidence API returns read-only ledger evidence",async()=>{const response=await routeManufacturingCostingApi(request({work_order:"WO-1"}),new URL(URL),context());assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.message.posting_status,"NOT_POSTED");assert.equal(payload.message.actual_finished_good_value_minor,240);assert.equal(payload.message.standard_total_cost_minor,240);assert.equal(payload.message.total_variance_minor,0);});

test("cost evidence API fails closed on hidden Work Order BOM or Stock Entry",async()=>{await assert.rejects(()=>routeManufacturingCostingApi(request({work_order:"WO-1"}),new URL(URL),context({hidden:new Set(["BOM-FG"])})),/BOM is outside/);await assert.rejects(()=>routeManufacturingCostingApi(request({work_order:"WO-1"}),new URL(URL),context({hidden:new Set(["STE-1"])})),/Stock Entry outside/);});

test("cost evidence API rejects mismatched BOM checksum",async()=>{await assert.rejects(()=>routeManufacturingCostingApi(request({work_order:"WO-1"}),new URL(URL),context({checksum:"other"})),/checksum does not match/);});

test("cost evidence API rejects client tenant selection",async()=>{await assert.rejects(()=>routeManufacturingCostingApi(request({work_order:"WO-1",tenant_id:"other"}),new URL(URL),context()),/tenant scope is controlled/);});
