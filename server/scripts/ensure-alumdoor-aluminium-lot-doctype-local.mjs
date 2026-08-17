#!/usr/bin/env node

const origin=(process.env.FORGE_ORIGIN??"http://127.0.0.1:8799").replace(/\/$/,"");const user=process.env.FORGE_ADMIN_USER??"",password=process.env.FORGE_ADMIN_PASSWORD??"";if(!user||!password)throw new Error("Admin credentials required");if(!["127.0.0.1","localhost","::1"].includes(new URL(origin).hostname))throw new Error("local-only");
const cookies=new Map();let csrf="";function rem(r){const raw=r.headers.get("set-cookie");if(!raw)return;for(const p of raw.split(/,(?=[^;,]+=)/)){const q=p.split(";",1)[0],i=q.indexOf("=");if(i>0)cookies.set(q.slice(0,i).trim(),q.slice(i+1).trim());}}async function req(p,o={}){const h=new Headers(o.headers??{});if(cookies.size)h.set("cookie",[...cookies].map(([k,v])=>`${k}=${v}`).join("; "));if(csrf&&o.method&&o.method!=="GET")h.set("x-frappe-csrf-token",csrf);if(o.body!==undefined)h.set("content-type","application/json");const r=await fetch(`${origin}${p}`,{...o,headers:h,body:o.body===undefined?undefined:JSON.stringify(o.body)});rem(r);const t=await r.text();let b;try{b=t?JSON.parse(t):null}catch{b=t}return{r,b,t};}async function ok(p,o={}){const x=await req(p,o);if(!x.r.ok)throw new Error(`${o.method??"GET"} ${p} ${x.r.status}: ${x.t}`);return x.b;}
await ok("/api/method/login",{method:"POST",body:{usr:user,pwd:password}});const boot=await ok("/api/method/metaforge.api.get_boot");csrf=boot?.message?.csrf_token??boot?.csrf_token??"";
const metaPath="/api/resource/DocType/Aluminium%20Lot";const current=await req(metaPath);if(current.r.ok){const doc=current.b?.data??current.b?.message??current.b;const names=new Set((doc?.fields??[]).map((f)=>f.fieldname));for(const required of ["source_key","item","source_sheet","source_row","source_snapshot"]){if(!names.has(required))throw new Error(`Existing Aluminium Lot schema missing ${required}`);}console.log("ALUMDOOR_ALUMINIUM_LOT_DOCTYPE_READY existing=1");process.exit(0);}if(current.r.status!==404)throw new Error(`GET Aluminium Lot meta failed ${current.r.status}: ${current.t}`);
const fields=[
 {fieldname:"source_key",label:"Khóa nguồn",fieldtype:"Data",reqd:1,unique:1},
 {fieldname:"item",label:"Vật tư",fieldtype:"Link",options:"Item",reqd:1},
 {fieldname:"profile",label:"Profile / vật tư nguồn",fieldtype:"Data",reqd:1},
 {fieldname:"source_sheet",label:"Sheet nguồn",fieldtype:"Data",reqd:1},
 {fieldname:"source_row",label:"Dòng nguồn",fieldtype:"Int",reqd:1},
 {fieldname:"entry_date",label:"Ngày nhập nhôm",fieldtype:"Date"},
 {fieldname:"lot_type",label:"Loại",fieldtype:"Data"},
 {fieldname:"color_code",label:"Màu nguồn",fieldtype:"Data"},
 {fieldname:"condition",label:"Tình trạng",fieldtype:"Data"},
 {fieldname:"length_m",label:"Khổ / chiều dài (m)",fieldtype:"Float",reqd:1},
 {fieldname:"piece_count",label:"Số lá / cây",fieldtype:"Float",reqd:1},
 {fieldname:"reentry_date",label:"Ngày nhập lại",fieldtype:"Date"},
 {fieldname:"stock_status",label:"Theo dõi tồn",fieldtype:"Data"},
 {fieldname:"selected_for_cut",label:"Chọn cắt",fieldtype:"Check",default:"0"},
 {fieldname:"scrap_or_remnant",label:"LM / phế",fieldtype:"Data"},
 {fieldname:"total_kg",label:"Số kg tổng",fieldtype:"Float"},
 {fieldname:"source_action",label:"Nhập / ghi chú",fieldtype:"Data"},
 {fieldname:"source_note",label:"Ghi chú nguồn",fieldtype:"Small Text"},
 {fieldname:"source_snapshot",label:"Snapshot dòng nguồn",fieldtype:"Code",options:"JSON",reqd:1},
 {fieldname:"is_active",label:"Còn hiệu lực",fieldtype:"Check",default:"1"}
];
const body={doctype:"DocType",name:"Aluminium Lot",module:"Alumdoor",custom:1,istable:0,track_changes:1,autoname:"field:source_key",fields};await ok("/api/resource/DocType",{method:"POST",body});const verify=await ok(metaPath);const doc=verify?.data??verify?.message??verify;if(doc?.name!=="Aluminium Lot")throw new Error("Aluminium Lot DocType verify failed");console.log(`ALUMDOOR_ALUMINIUM_LOT_DOCTYPE_READY existing=0 fields=${fields.length}`);
