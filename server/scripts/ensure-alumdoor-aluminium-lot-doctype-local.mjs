#!/usr/bin/env node

const origin=(process.env.FORGE_ORIGIN??"http://127.0.0.1:8799").replace(/\/$/,"");
const user=process.env.FORGE_ADMIN_USER??"";
const password=process.env.FORGE_ADMIN_PASSWORD??"";
if(!user||!password)throw new Error("Admin credentials required");
if(!["127.0.0.1","localhost","::1"].includes(new URL(origin).hostname))throw new Error("local-only");

const jar=new Map();let csrf="";
function remember(response){for(const value of response.headers.getSetCookie?.()??[]){const pair=value.split(";",1)[0],i=pair.indexOf("=");if(i>0)jar.set(pair.slice(0,i).trim(),pair.slice(i+1).trim());}}
async function call(method,body={}){const response=await fetch(`${origin}/api/method/${method}`,{method:"POST",headers:{"content-type":"application/json",...(jar.size?{cookie:[...jar].map(([k,v])=>`${k}=${v}`).join("; ")} : {}),...(csrf?{"x-frappe-csrf-token":csrf}:{})},body:JSON.stringify(body)});remember(response);csrf=response.headers.get("x-frappe-csrf-token")??csrf;const text=await response.text();let parsed;try{parsed=text?JSON.parse(text):null}catch{parsed=null}if(!response.ok)throw new Error(`${method} HTTP ${response.status}: ${parsed?.message??parsed?.exception??text.slice(0,500)}`);return parsed?.message??parsed;}
await call("login",{usr:user,pwd:password});
const meta=await call("metaforge.api.get_meta",{doctype:"Aluminium Lot"});
const fields=meta?.fields??[];
const fieldMap=new Map(fields.map((field)=>[field.fieldname,field]));
const expected=[
  ["source_key","Data",true],
  ["item","Link",true],
  ["profile","Data",true],
  ["source_file","Data",true],
  ["source_sheet","Data",true],
  ["source_row","Int",true],
  ["item_mapping_origin","Data",true],
  ["item_mapping_reason","Small Text",true],
  ["item_mapping_evidence","Small Text",true],
  ["entry_date","Date",false],
  ["lot_type","Data",false],
  ["color_code","Data",false],
  ["condition","Data",false],
  ["length_m","Float",true],
  ["piece_count","Float",true],
  ["reentry_date","Date",false],
  ["stock_status","Data",false],
  ["selected_for_cut","Check",false],
  ["scrap_or_remnant","Data",false],
  ["total_kg","Float",false],
  ["source_action","Data",false],
  ["source_note","Small Text",false],
  ["source_snapshot","Code",true],
  ["is_active","Check",false]
];
const errors=[];
for(const [name,type,required] of expected){const field=fieldMap.get(name);if(!field){errors.push(`missing:${name}`);continue;}if(String(field.fieldtype??"")!==type)errors.push(`type:${name}:${field.fieldtype}->${type}`);if(required&&!Boolean(Number(field.reqd??field.required??0)||field.reqd===true||field.required===true))errors.push(`required:${name}`);}
const sourceKey=fieldMap.get("source_key");if(sourceKey&&!Boolean(Number(sourceKey.unique??0)||sourceKey.unique===true))errors.push("unique:source_key");
const item=fieldMap.get("item");if(item&&String(item.options??"")!=="Item")errors.push(`options:item:${item.options??""}->Item`);
if(errors.length)throw new Error(`Aluminium Lot metadata contract invalid: ${errors.join(",")}`);
console.log(`ALUMDOOR_ALUMINIUM_LOT_DOCTYPE_READY fields=${fields.length} source_key_unique=1 item_link=Item`);
