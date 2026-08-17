#!/usr/bin/env node

const origin=(process.env.FORGE_ORIGIN??"http://127.0.0.1:8799").replace(/\/$/,"");
const user=process.env.FORGE_ADMIN_USER??"";
const password=process.env.FORGE_ADMIN_PASSWORD??"";
if(!user||!password)throw new Error("Admin credentials required");
if(!["127.0.0.1","localhost","::1"].includes(new URL(origin).hostname))throw new Error("local-only");

const cookies=new Map();let csrf="";
function remember(response){const raw=response.headers.get("set-cookie");if(!raw)return;for(const part of raw.split(/,(?=[^;,]+=)/)){const pair=part.split(";",1)[0],i=pair.indexOf("=");if(i>0)cookies.set(pair.slice(0,i).trim(),pair.slice(i+1).trim());}}
async function request(path,options={}){const headers=new Headers(options.headers??{});if(cookies.size)headers.set("cookie",[...cookies].map(([k,v])=>`${k}=${v}`).join("; "));if(csrf&&options.method&&options.method!=="GET")headers.set("x-frappe-csrf-token",csrf);if(options.body!==undefined)headers.set("content-type","application/json");const response=await fetch(`${origin}${path}`,{...options,headers,body:options.body===undefined?undefined:JSON.stringify(options.body)});remember(response);const text=await response.text();let body;try{body=text?JSON.parse(text):null}catch{body=text}return{response,body,text};}
async function ok(path,options={}){const result=await request(path,options);if(!result.response.ok)throw new Error(`${options.method??"GET"} ${path} ${result.response.status}: ${result.text}`);return result.body;}
await ok("/api/method/login",{method:"POST",body:{usr:user,pwd:password}});
const boot=await ok("/api/method/metaforge.api.get_boot");csrf=boot?.message?.csrf_token??boot?.csrf_token??"";
const body=await ok("/api/resource/DocType/Aluminium%20Lot");
const meta=body?.data??body?.message??body;
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
for(const [name,type,required] of expected){const field=fieldMap.get(name);if(!field){errors.push(`missing:${name}`);continue;}if(String(field.fieldtype??"")!==type)errors.push(`type:${name}:${field.fieldtype}->${type}`);if(required&&!Boolean(Number(field.reqd??0)||field.reqd===true))errors.push(`required:${name}`);}
const sourceKey=fieldMap.get("source_key");if(sourceKey&&!Boolean(Number(sourceKey.unique??0)||sourceKey.unique===true))errors.push("unique:source_key");
const item=fieldMap.get("item");if(item&&String(item.options??"")!=="Item")errors.push(`options:item:${item.options??""}->Item`);
if(errors.length)throw new Error(`Aluminium Lot metadata contract invalid: ${errors.join(",")}`);
console.log(`ALUMDOOR_ALUMINIUM_LOT_DOCTYPE_READY fields=${fields.length} source_key_unique=1 item_link=Item`);
