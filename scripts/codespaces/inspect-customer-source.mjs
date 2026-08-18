#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot=path.resolve(import.meta.dirname,'../..');
const sourcePath=path.join(repoRoot,'data','customer-export.xlsx');
const stores=[path.join(repoRoot,'client','node_modules','.pnpm'),path.join(repoRoot,'node_modules','.pnpm')];
const store=stores.find(existsSync);if(!store)throw new Error('pnpm dependency store not found');
const xlsxFile=readdirSync(store).filter((n)=>n.startsWith('xlsx@')).sort().reverse().map((n)=>path.join(store,n,'node_modules','xlsx','xlsx.mjs')).find(existsSync);
if(!xlsxFile)throw new Error('xlsx dependency not found');
const XLSX=await import(pathToFileURL(xlsxFile).href);
const book=XLSX.read(readFileSync(sourcePath),{type:'buffer',cellFormula:false,cellText:true,cellDates:false});
const clean=(v)=>String(v??'').normalize('NFC').replace(/\s+/g,' ').trim();
const key=(v)=>clean(v).normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[đĐ]/g,'d').toLocaleLowerCase('vi').replace(/[^a-z0-9]+/g,' ').trim();
const aliases=['customer_name','customer name','ten khach hang','khach hang','ten khach','ten kh','dai ly'].map(key);
console.log(`CUSTOMER_SOURCE_DIAG sheets=${book.SheetNames.length}`);
for(const name of book.SheetNames){
  const matrix=XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,blankrows:false,defval:'',raw:false});
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
