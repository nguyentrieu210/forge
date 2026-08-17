#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAlumdoorIndexedMarkdownRows, readAlumdoorCell } from "./lib/alumdoor-source-markdown.mjs";
import { ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";
import { resolveAlumdoorLotItemEvidence } from "./lib/alumdoor-aluminium-lot-evidence.mjs";

const [sourceRecordsArg, itemPayloadArg, outputArg] = process.argv.slice(2);
if (!sourceRecordsArg || !itemPayloadArg || !outputArg) throw new Error("Usage: build-alumdoor-real-aluminium-lot-payload.mjs <source-records.json> <item-payload.json> <lot-payload.json>");
const source = JSON.parse(readFileSync(path.resolve(sourceRecordsArg), "utf8"));
const records = Array.isArray(source) ? source : source.records;
const itemPayload = JSON.parse(readFileSync(path.resolve(itemPayloadArg), "utf8"));
if (!Array.isArray(records) || !Array.isArray(itemPayload.items)) throw new Error("Invalid source/item payload");
const itemCodes = new Set(itemPayload.items.map((r) => String(r.item_code ?? "").trim()));
const stockRows = records.filter((r) => r.source_role === ITEM_SOURCE_ROLES.STOCK_ITEM && String(r.item_code ?? "").trim());
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const lotRoot = path.join(repoRoot, "apps", "alumdoor", "docs", "nguon", "ton-nhom");
const skipFiles = new Set(["MẪU.md", "LICH_SU.md", "LỊCH-SỬ.md"]);

const clean = (v) => String(v ?? "").trim();
const fold = (v) => clean(v).normalize("NFD").replace(/\p{M}/gu, "").toLocaleUpperCase("vi").replace(/[Đ]/g,"D");
const key = (v) => fold(v).replace(/[^A-Z0-9]+/g, "");
const num = (v) => { const n=Number(clean(v).replace(",",".")); return Number.isFinite(n)?n:null; };
const dateOnly = (v) => { const m=clean(v).match(/^(\d{4}-\d{2}-\d{2})/); return m?.[1] ?? ""; };
const boolNum = (v) => /^(TRUE|1|YES|CÓ)$/i.test(clean(v)) ? 1 : 0;
const slug = (v) => fold(v).replace(/[^A-Z0-9]+/g,"-").replace(/^-|-$/g,"");

const PROFILE_ALIASES = new Map([
  ["AL701LOP", "AL701LOP"],
  ["AL702LOP", "AL702LOP"],
  ["AL7015MM", "AL7015MM"],
]);
const COLOR_KEYS = new Map([
  ["VK", "VANGKEM"], ["VANGKEM", "VANGKEM"],
  ["GS", "GHISAN"], ["GHISAN", "GHISAN"],
  ["CF", "CAFE"], ["CAFE", "CAFE"],
  ["THO", "THO"],
  ["XNVK", "XANHNGOCVANGKEM"], ["XANHNGOCVANGKEM", "XANHNGOCVANGKEM"],
  ["XAMTRANG", "XAMTRANG"], ["GHIKEM", "GHIUCKEMUC"], ["GHIUCKEMUC", "GHIUCKEMUC"],
]);
function profileKey(sheet) { const k=key(sheet); return PROFILE_ALIASES.get(k) ?? k; }
function colorKey(value) { const k=key(value); return COLOR_KEYS.get(k) ?? k; }
function candidateProfileKey(row) {
  const nameKey = key(row.item_name);
  if (PROFILE_ALIASES.has(nameKey)) return PROFILE_ALIASES.get(nameKey);
  return nameKey;
}
function mapSpecialItem(sheet, type) {
  if (sheet === "BỘ BA LÁ ĐÁY LÁ ĐẦU") {
    const t=fold(type);
    if (t.includes("A282") && itemCodes.has("TP-A282")) return { code:"TP-A282", origin:"source_type_code", reason:"Physical lot type contains source profile A282.", evidence:"TỒN NHÔM/BỘ BA LÁ ĐÁY + LÁ ĐẦU" };
    if (t.includes("TD327") && itemCodes.has("TP-TD327")) return { code:"TP-TD327", origin:"source_type_code", reason:"Physical lot type contains source profile TD327.", evidence:"TỒN NHÔM/BỘ BA LÁ ĐÁY + LÁ ĐẦU" };
  }
  return null;
}
function mapProfileItem(sheet, lotColor) {
  const evidence = resolveAlumdoorLotItemEvidence({ source_sheet: sheet, color: lotColor });
  if (evidence) {
    if (!itemCodes.has(evidence.canonical_item_code)) {
      throw new Error(`Audited Aluminium Lot evidence target missing from Item payload: ${sheet} ${lotColor} -> ${evidence.canonical_item_code}`);
    }
    return {
      code: evidence.canonical_item_code,
      candidates: [],
      origin: "explicit_source_evidence",
      reason: evidence.reason,
      evidence: evidence.evidence,
    };
  }

  const pk = profileKey(sheet);
  const ck = colorKey(lotColor);
  const scored=[];
  for (const row of stockRows) {
    const code=clean(row.item_code); if(!itemCodes.has(code)) continue;
    const np=candidateProfileKey(row);
    const codeKey=key(code);
    let score=0;
    if (np===pk) score+=100;
    else if (np.includes(pk) || pk.includes(np)) score+=25;
    else if (codeKey.includes(pk)) score+=15;
    else continue;
    const sourceColor=colorKey(row.source_color);
    if (sourceColor && sourceColor===ck) score+=80;
    const rawColorKey=key(lotColor);
    if (rawColorKey && (codeKey.endsWith(rawColorKey) || codeKey.includes(`${pk}${rawColorKey}`))) score+=35;
    if (score>0) scored.push({code,score,row});
  }
  scored.sort((a,b)=>b.score-a.score || a.code.localeCompare(b.code,"vi"));
  if (!scored.length) return { code:"", candidates:[] };
  const best=scored[0].score;
  const bestRows=scored.filter((r)=>r.score===best);
  const distinct=[...new Set(bestRows.map((r)=>r.code))];
  return distinct.length===1
    ? {
      code:distinct[0],
      candidates:scored.slice(0,5),
      origin:"deterministic_profile_color_match",
      reason:`Matched physical profile ${sheet} / color ${lotColor || "∅"} to canonical stock identity ${distinct[0]} using source profile/color evidence.`,
      evidence:"MS LIÊN BS/Trang tính29 + TỒN NHÔM profile sheet",
    }
    : {code:"",candidates:scored.slice(0,5)};
}
function displaySheet(filename) { return filename.replace(/\.md$/i,"").replace(/---/g," ").replace(/-/g," ").replace(/\s+/g," ").trim(); }

const lots=[]; const blockers=[]; const files=[];
for (const filename of readdirSync(lotRoot).filter((f)=>f.endsWith(".md")&&!skipFiles.has(f)).sort((a,b)=>a.localeCompare(b,"vi"))) {
  const text=readFileSync(path.join(lotRoot,filename),"utf8");
  const heading=(text.match(/^#\s+(.+)$/m)?.[1]??displaySheet(filename)).trim();
  const sheet=heading.replace(/\s*\+\s*/g," ").replace(/\s+/g," ").trim();
  const rows=parseAlumdoorIndexedMarkdownRows(text);
  let headerRow=0;
  for(const row of rows){if(fold(readAlumdoorCell(row,0)).includes("NGAY")&&fold(readAlumdoorCell(row,3)).includes("KHO")){headerRow=row.source_row;break;}}
  let fileLots=0;
  for(const row of rows){
    if(row.source_row<=headerRow)continue;
    const length=num(readAlumdoorCell(row,3)); const pieces=num(readAlumdoorCell(row,4)); const kg=num(readAlumdoorCell(row,9));
    // Physical lot rows must carry an actual dimension and piece count/weight.
    if(!(length>0) || !((pieces??0)>0 || (kg??0)>0))continue;
    const special=sheet==="BỘ BA LÁ ĐÁY LÁ ĐẦU" || sheet==="RAY";
    const type=special?readAlumdoorCell(row,1):"";
    const color=special?readAlumdoorCell(row,2):readAlumdoorCell(row,1);
    const condition=special?"":readAlumdoorCell(row,2);
    let mapping=mapSpecialItem(sheet,type); let candidates=[];
    if(!mapping&&sheet!=="RAY"){mapping=mapProfileItem(sheet,color);candidates=mapping.candidates??[];}
    const item=mapping?.code??"";
    if(!item){blockers.push({source_sheet:sheet,source_file:filename,source_row:row.source_row,type,color,length_m:length,piece_count:pieces,total_kg:kg,candidates:candidates.map((c)=>({code:c.code,score:c.score,source_color:c.row.source_color,item_name:c.row.item_name}))});continue;}
    const status=readAlumdoorCell(row,6); const scrap=readAlumdoorCell(row,8);
    const snapshot={};for(const [idx,value] of Object.entries(row.cells??{}))snapshot[idx]=value;
    lots.push({
      source_key:`TN-${slug(sheet)}-${String(row.source_row).padStart(4,"0")}`,
      item,
      profile:sheet,
      source_file:filename,
      source_sheet:sheet,
      source_row:Number(row.source_row),
      item_mapping_origin:mapping.origin??"source",
      item_mapping_reason:mapping.reason??"",
      item_mapping_evidence:mapping.evidence??"",
      entry_date:dateOnly(readAlumdoorCell(row,0)),
      lot_type:type,
      color_code:color,
      condition,
      length_m:length,
      piece_count:pieces??0,
      reentry_date:dateOnly(readAlumdoorCell(row,5)),
      stock_status:status,
      selected_for_cut:boolNum(readAlumdoorCell(row,7)),
      scrap_or_remnant:scrap,
      total_kg:kg??0,
      source_action:readAlumdoorCell(row,10),
      source_note:readAlumdoorCell(row,11),
      source_snapshot:JSON.stringify(snapshot),
      is_active: /HẾT|HET|PHẾ|PHE/i.test(`${status} ${scrap}`)?0:1,
    });
    fileLots+=1;
  }
  files.push({file:filename,sheet,parsed_rows:rows.length,physical_lots:fileLots});
}
if(blockers.length){console.error(JSON.stringify({blocker_count:blockers.length,blockers:blockers.slice(0,100)},null,2));throw new Error(`ALUMDOOR_REAL_ALUMINIUM_LOT_MAPPING_BLOCKED count=${blockers.length}`);}
const keys=lots.map((r)=>r.source_key);if(new Set(keys).size!==keys.length)throw new Error("Duplicate Aluminium Lot source_key");
if(lots.length===0)throw new Error("Aluminium Lot payload empty");
const payload={format:"alumdoor-real-aluminium-lot-payload/v1",source:"apps/alumdoor/docs/nguon/ton-nhom/*.md",lot_count:lots.length,files,lots};
writeFileSync(path.resolve(outputArg),`${JSON.stringify(payload,null,2)}\n`);
console.log(`ALUMDOOR_REAL_ALUMINIUM_LOT_PAYLOAD_PASS lots=${lots.length} files=${files.length}`);
