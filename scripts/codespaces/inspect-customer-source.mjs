#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot=path.resolve(import.meta.dirname,'../..');
const sourcePath=path.join(repoRoot,'data','customer-export.xlsx');
const txPath=path.join(repoRoot,'data','don-hang-xuat-hang.xlsx');
const stores=[path.join(repoRoot,'client','node_modules','.pnpm'),path.join(repoRoot,'node_modules','.pnpm')];
const store=stores.find(existsSync);if(!store)throw new Error('pnpm dependency store not found');
const xlsxFile=readdirSync(store).filter((n)=>n.startsWith('xlsx@')).sort().reverse().map((n)=>path.join(store,n,'node_modules','xlsx','xlsx.mjs')).find(existsSync);
if(!xlsxFile)throw new Error('xlsx dependency not found');
const XLSX=await import(pathToFileURL(xlsxFile).href);
const read=(file)=>XLSX.read(readFileSync(file),{type:'buffer',cellFormula:false,cellText:true,cellDates:false});
const rows=(book,name)=>XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,blankrows:false,defval:'',raw:false});
const clean=(v)=>String(v??'').normalize('NFC').replace(/\s+/g,' ').trim();
const key=(v)=>clean(v).normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[đĐ]/g,'d').toLocaleLowerCase('vi').replace(/[^a-z0-9]+/g,' ').trim();
const identity=(v)=>key(v).replace(/\s*(?:\+?84|0)[\d\s().-]{7,}$/u,'').replace(/\s+/g,' ').trim();
const aliases=['customer_name','customer name','ten khach hang','khach hang','ten khach','ten kh','dai ly'].map(key);
const book=read(sourcePath);
console.log(`CUSTOMER_SOURCE_DIAG sheets=${book.SheetNames.length}`);
for(const name of book.SheetNames){
  const matrix=rows(book,name);
  let best={row:-1,col:-1,nonblankAfter:0};
  for(let i=0;i<Math.min(matrix.length,40);i++){
    const row=matrix[i]??[];
    const col=row.findIndex((v)=>aliases.includes(key(v)));
    if(col<0)continue;
    let nonblankAfter=0;
    for(let j=i+1;j<matrix.length;j++)if(clean(matrix[j]?.[col]))nonblankAfter++;
    if(nonblankAfter>best.nonblankAfter)best={row:i+1,col:col+1,nonblankAfter};
  }
  const ref=book.Sheets[name]?.['!ref']??'';
  console.log(`CUSTOMER_SOURCE_SHEET name=${JSON.stringify(name)} ref=${JSON.stringify(ref)} rows=${matrix.length} customer_header_row=${best.row} customer_col=${best.col} nonblank_after=${best.nonblankAfter}`);
}

const tx=read(txPath);
const explicit=new Map();
const monthly=new Map();
let explicitRows=0, explicitDealer=0, explicitRetail=0, explicitOther=0, explicitConflicts=0, monthlyRows=0;
if(tx.Sheets['DS KH-NCC']){
  const m=rows(tx,'DS KH-NCC');
  for(let i=2;i<m.length;i++){
    const name=clean(m[i]?.[0]), id=identity(name), t=key(m[i]?.[2]);
    if(!id||t.includes('ncc'))continue;
    explicitRows++;
    const g=t==='kh'||t==='dai ly'?'Đại lý':(t.includes('kh le')||t.includes('khach le')?'Lẻ':'');
    if(g==='Đại lý')explicitDealer++; else if(g==='Lẻ')explicitRetail++; else explicitOther++;
    const old=explicit.get(id);
    if(old?.group&&g&&old.group!==g) explicitConflicts++;
    if(!old) explicit.set(id,{group:g}); else if(!old.group&&g) old.group=g;
  }
}
for(const s of tx.SheetNames.filter((n)=>/^T\d{1,2}\.20\d{2}$/i.test(n))){
  const m=rows(tx,s);if(!m.length)continue;
  const h=m[0].map(key),ci=h.findIndex((x)=>x==='dai ly'||x==='khach hang');if(ci<0)continue;
  for(let i=1;i<m.length;i++){
    const name=clean(m[i]?.[ci]),id=identity(name);if(!id)continue;
    monthlyRows++;
    if(!monthly.has(id))monthly.set(id,{namePresent:true});
  }
}
const union=new Set([...explicit.keys(),...monthly.keys()]);
let monthlyOnly=0;for(const id of monthly.keys())if(!explicit.has(id))monthlyOnly++;
console.log(`CUSTOMER_TX_DIAG sheets=${tx.SheetNames.length} explicit_rows=${explicitRows} explicit_unique=${explicit.size} explicit_dealer_rows=${explicitDealer} explicit_retail_rows=${explicitRetail} explicit_other_rows=${explicitOther} explicit_conflicts=${explicitConflicts} monthly_rows=${monthlyRows} monthly_unique=${monthly.size} monthly_only=${monthlyOnly} union_unique=${union.size}`);
