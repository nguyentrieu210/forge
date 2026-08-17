#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyAlumdoorItemSourceCode, ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";
import { resolveAlumdoorBomEvidenceAlias, resolveAlumdoorBomItemPromotion } from "./lib/alumdoor-item-evidence-overrides.mjs";
import { classifyExactSourceBomEvidenceGap } from "./lib/alumdoor-exact-source-bom-evidence-gap.mjs";
import { resolveExactSourceBomQuantity, resolveExactSourceBomUomOverride } from "./lib/alumdoor-exact-source-bom-quantity.mjs";
import { preflightAlumdoorItemSourceRecords } from "./lib/alumdoor-item-source-preflight.mjs";
import { blockerClass, resolveBomParentOutput, resolveBomQuantity, resolveBomRuntimeUom, resolveTemplateLineage } from "./lib/alumdoor-real-bom-gate-semantics.mjs";

const [sourceArg,itemArg,outputArg,auditArg] = process.argv.slice(2);
if (!sourceArg || !itemArg || !outputArg || !auditArg) throw new Error("Usage: build-alumdoor-canonical-bom-payload.mjs <source.json> <items.json> <payload.json> <audit.json>");
const source = JSON.parse(readFileSync(path.resolve(sourceArg),"utf8"));
const records = Array.isArray(source) ? source : source.records;
const itemPayload = JSON.parse(readFileSync(path.resolve(itemArg),"utf8"));
if (!Array.isArray(records) || !Array.isArray(itemPayload.items)) throw new Error("Invalid source/item payload");
const preflight = preflightAlumdoorItemSourceRecords(records);
if (preflight.blocker_count !== 0) throw new Error(`BOM build requires zero Item source blockers; got ${preflight.blocker_count}`);
const clean = (v) => String(v ?? "").trim();
const parentRowOf = (record) => Number(record?.source_parent_row);
const itemMap = new Map(itemPayload.items.map((row)=>[clean(row.item_code),row]));
const itemCodes = new Set(itemMap.keys());
const blockers=[]; const excluded=[]; const parents=new Map(); const excludedParents=new Map(); const groups=new Map();

function addBlock(type, record, extra={}) {
  blockers.push({ type, classification:blockerClass(type), source_sheet:record?.source_sheet ?? "ĐM", source_row:Number(record?.source_row)||null, source_index:Number(record?.source_index)||null, source_parent_row:Number(record?.source_parent_row)||null, parent_item_code:clean(record?.parent_item_code), source_item_code:clean(record?.item_code), source_uom:clean(record?.source_uom), source_qty_or_formula:clean(record?.source_qty_or_formula), source_formula_code:clean(record?.source_formula_code), source_formula_text:clean(record?.source_formula_text), ...extra });
}
function canonicalReference(record) {
  const code=clean(record.item_code);
  if(code==="RONDAYUC" && clean(record.source_sheet)==="ĐM" && Number(record.source_row)===686) {
    return {status:"accepted",item_code:"NVL-RONDAYUC",reason:"exact_raw_bottom_seal_bom_identity"};
  }
  const alias=resolveAlumdoorBomEvidenceAlias(code,ITEM_SOURCE_ROLES.BOM_REFERENCE);
  if(alias) return {status:"accepted",item_code:alias.canonical_item_code,reason:"evidence_alias"};
  const promotion=resolveAlumdoorBomItemPromotion(code,ITEM_SOURCE_ROLES.BOM_REFERENCE);
  if(promotion) return {status:"accepted",item_code:promotion.canonical_item_code,reason:"bom_item_promotion"};
  const classified=classifyAlumdoorItemSourceCode(code,{source_role:ITEM_SOURCE_ROLES.BOM_REFERENCE,source_index:record.source_index});
  if(classified.status==="excluded" || classified.status==="blocked") return classified;
  if(classified.status==="source" || classified.status==="alias") {
    return {status:"accepted",item_code:classified.canonical_item_code||code,reason:classified.reason||"canonical_identity"};
  }
  return {status:"blocked",reason:`unexpected_item_source_status:${classified.status||"blank"}`,canonical_item_code:classified.canonical_item_code||""};
}
for(const record of records){
  if(record.source_role!==ITEM_SOURCE_ROLES.SELLABLE_PRODUCT) continue;
  const index=Number(record.source_index); if(!Number.isFinite(index)) continue;
  const parentRow=parentRowOf(record);
  if(!Number.isFinite(parentRow)){addBlock("missing_parent_lineage",record);continue;}
  const code=clean(record.item_code);
  if(itemCodes.has(code)){parents.set(parentRow,record);continue;}
  const classified=classifyAlumdoorItemSourceCode(code,{source_role:ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,source_index:index});
  if(classified.status==="excluded"){excludedParents.set(parentRow,classified.reason||"source_policy_excluded_parent");continue;}
  addBlock("missing_parent_item",record,{canonical_item_code:classified.canonical_item_code||code,reason:classified.reason});
}
for(const record of records){
  if(record.source_role!==ITEM_SOURCE_ROLES.BOM_REFERENCE) continue;
  const index=Number(record.source_index);
  const parentRow=parentRowOf(record);
  if(!Number.isFinite(parentRow)){addBlock("missing_parent_lineage",record);continue;}
  if(excludedParents.has(parentRow)){excluded.push({source_row:record.source_row,source_index:index,source_parent_row:parentRow,source_item_code:clean(record.item_code),reason:"excluded_parent"});continue;}
  const ref=canonicalReference(record);
  if(ref.status==="excluded"){excluded.push({source_row:record.source_row,source_index:index,source_parent_row:parentRow,source_item_code:clean(record.item_code),reason:ref.reason});continue;}
  if(ref.status!=="accepted"){addBlock("missing_component_item",record,{reason:ref.reason});continue;}
  const item=itemMap.get(ref.item_code); if(!item){addBlock("missing_component_item",record,{canonical_item_code:ref.item_code});continue;}
  const parentRecord=parents.get(parentRow); const parentItem=parentRecord?itemMap.get(clean(parentRecord.item_code)):null;
  if(!parentRecord||!parentItem){addBlock("missing_parent_item",record,{canonical_item_code:ref.item_code});continue;}
  if(ref.item_code===clean(parentItem.item_code)){
    excluded.push({source_row:record.source_row,source_index:index,source_parent_row:parentRow,source_item_code:clean(record.item_code),canonical_item_code:ref.item_code,reason:"canonical_self_reference_non_bom"});
    continue;
  }
  const templateLineage=resolveTemplateLineage(record,ref.item_code);
  const deferredActual=templateLineage.status==="mapped" && templateLineage.kind==="deferred_actual";
  const uomOverride=resolveExactSourceBomUomOverride(record,ref.item_code);
  const uomRecord=deferredActual?{...record,source_uom:item.stock_uom}:uomOverride?{...record,source_uom:uomOverride.runtime_uom}:record;
  const uom=resolveBomRuntimeUom(uomRecord,item);
  if(uom.status!=="accepted"){addBlock(uom.reason,record,{canonical_item_code:ref.item_code,runtime_uom:uom.runtime_uom,stock_uom:uom.stock_uom,conversion_factors:uom.conversion_factors});continue;}
  const exactQuantity=resolveExactSourceBomQuantity(record,uom,ref.item_code);
  const standardQuantity=exactQuantity?null:resolveBomQuantity(record,uom,parentItem,ref.item_code);
  const quantity=exactQuantity ?? standardQuantity;
  if(quantity.status==="blocked"){
    const evidenceGap=classifyExactSourceBomEvidenceGap(record,ref.item_code,quantity.reason);
    addBlock(evidenceGap?.reason||quantity.reason||"runtime_contract_invalid",record,{
      canonical_item_code:ref.item_code,
      runtime_uom:uom.runtime_uom,
      stock_uom:uom.stock_uom,
      resolver_reason:evidenceGap?.resolver_reason,
      formula_text:quantity.formula_text,
      formula_code:quantity.formula_code,
      template_code:quantity.template_code,
      component_key:quantity.component_key,
      expected_item_code:quantity.expected_item_code,
      expected_item_codes:quantity.expected_item_codes,
      expected_source_sheet:quantity.expected_source_sheet,
    });
    continue;
  }
  const line={
    item_code:ref.item_code,
    uom:uom.runtime_uom,
    ...(uom.conversion_factor?{conversion_factor:uom.conversion_factor}:{}),
    resolution:quantity.status,
    qty_basis:quantity.qty_basis,
    ...(quantity.qty?{qty:quantity.qty}:{}),
    ...(quantity.quantity_formula_json?{quantity_formula_json:quantity.quantity_formula_json}:{}),
    ...(quantity.template_code?{bom_template_code:quantity.template_code,component_key:quantity.component_key}:{}),
    lineage:{source_sheet:clean(record.source_sheet),source_row:Number(record.source_row),source_index:index,source_parent_row:parentRow,source_item_code:clean(record.item_code),canonical_item_code:ref.item_code,source_uom:clean(record.source_uom),source_qty_or_formula:clean(record.source_qty_or_formula),source_formula_code:clean(record.source_formula_code),source_formula_text:clean(record.source_formula_text),resolution_reason:quantity.reason||quantity.formula_kind||quantity.kind||"accepted"}
  };
  const list=groups.get(parentRow)||[]; list.push(line); groups.set(parentRow,list);
}
const boms=[];
for(const [parentRow,lines] of [...groups.entries()].sort((a,b)=>a[0]-b[0])){
  const parent=parents.get(parentRow); const parentItem=parent&&itemMap.get(clean(parent.item_code));
  if(!parent||!parentItem){addBlock("missing_parent_item",parent||{source_parent_row:parentRow});continue;}
  const output=resolveBomParentOutput(parentItem);
  if(output.status!=="accepted"){addBlock(output.reason,parent,{item_code:clean(parent.item_code),stock_uom:output.stock_uom});continue;}
  const normalized=[...lines].sort((a,b)=>(a.lineage.source_row-b.lineage.source_row)||a.item_code.localeCompare(b.item_code,"vi"));
  const snapshot={schema_version:3,source:"apps/alumdoor/docs/nguon/ms-lien/ĐM.md",source_index:Number(parent.source_index),source_row:Number(parent.source_row),item:clean(parent.item_code),output,lines:normalized};
  const fingerprint=createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  boms.push({source_index:Number(parent.source_index),source_row:Number(parent.source_row),item:clean(parent.item_code),company:"ALUMDOOR",quantity:1,output_uom:output.output_uom,bom_status:"Draft",bom_fingerprint:fingerprint,lines:normalized,configuration_snapshot:snapshot});
}
blockers.sort((a,b)=>(a.source_row??1e9)-(b.source_row??1e9)||a.type.localeCompare(b.type,"vi")||a.source_item_code.localeCompare(b.source_item_code,"vi"));
excluded.sort((a,b)=>(a.source_row??1e9)-(b.source_row??1e9));
boms.sort((a,b)=>(a.source_row-b.source_row)||a.source_index-b.source_index);
const counts={}; const classes={};
for(const b of blockers){counts[b.type]=(counts[b.type]||0)+1; classes[b.classification]=(classes[b.classification]||0)+1;}
const refs=records.filter((r)=>r.source_role===ITEM_SOURCE_ROLES.BOM_REFERENCE).length;
const resolved=boms.reduce((n,b)=>n+b.lines.length,0);
const audit={format:"alumdoor-canonical-bom-audit/v3",source_reference_count:refs,canonical_bom_count:boms.length,resolved_reference_count:resolved,excluded_reference_count:excluded.length,blocker_count:blockers.length,blocker_counts:Object.fromEntries(Object.entries(counts).sort()),blocker_class_counts:Object.fromEntries(Object.entries(classes).sort()),blockers,excluded};
const payload={format:"alumdoor-canonical-bom-payload/v3",source:"apps/alumdoor/docs/nguon/ms-lien/ĐM.md",bom_count:boms.length,source_reference_count:refs,resolved_reference_count:resolved,excluded_reference_count:excluded.length,blocker_count:blockers.length,boms};
writeFileSync(path.resolve(outputArg),`${JSON.stringify(payload,null,2)}\n`);
writeFileSync(path.resolve(auditArg),`${JSON.stringify(audit,null,2)}\n`);
const regressionScript=fileURLToPath(new URL("./check-alumdoor-canonical-bom-regressions.mjs",import.meta.url));
const regression=spawnSync(process.execPath,[regressionScript,path.resolve(sourceArg),path.resolve(itemArg),path.resolve(outputArg),path.resolve(auditArg)],{stdio:"inherit"});
if(regression.status!==0) throw new Error(`Canonical BOM regression gate failed with exit ${regression.status}`);
console.log(`ALUMDOOR_CANONICAL_BOM_GATE refs=${refs} boms=${boms.length} resolved=${resolved} excluded=${excluded.length} blockers=${blockers.length}`);
console.log(`ALUMDOOR_CANONICAL_BOM_BLOCKER_COUNTS ${JSON.stringify(audit.blocker_counts)}`);
console.log(`ALUMDOOR_CANONICAL_BOM_CLASS_COUNTS ${JSON.stringify(audit.blocker_class_counts)}`);
for(const blocker of blockers.slice(0,200)) console.log(`ALUMDOOR_CANONICAL_BOM_BLOCKER ${JSON.stringify(blocker)}`);
if(resolved+excluded.length+blockers.length!==refs) throw new Error(`BOM coverage mismatch refs=${refs} covered=${resolved+excluded.length+blockers.length}`);
if(blockers.length) throw new Error(`Gate B remains blocked by ${blockers.length} canonical BOM issues`);
console.log("ALUMDOOR_CANONICAL_BOM_GATE_PASS");