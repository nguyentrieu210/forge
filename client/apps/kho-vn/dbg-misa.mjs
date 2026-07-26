import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
const wb = XLSX.read(readFileSync("C:\\Toka\\Form Amis\\nhap_kho_tt200_full.xls"), { type: "buffer", cellDates: true });
const sh = wb.Sheets[wb.SheetNames[0]];
console.log("!ref =", sh["!ref"]);
for (const [label, opt] of [
  ["blankrows:false", { header: 1, blankrows: false, defval: "" }],
  ["blankrows:true ", { header: 1, blankrows: true, defval: "" }],
]) {
  const rows = XLSX.utils.sheet_to_json(sh, opt);
  console.log(`=== ${label}: ${rows.length} dòng ===`);
  rows.slice(0, 10).forEach((r, i) => {
    const cells = (r || []).slice(0, 4).map((c) => String(c).slice(0, 24));
    console.log(`  [${i}] len=${(r || []).length}  ${cells.join(" | ")}`);
  });
}
