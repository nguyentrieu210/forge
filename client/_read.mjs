import * as XLSX from "xlsx";
const wb = XLSX.readFile("C:/Users/Admin/Downloads/TỒN NHÔM 2026 NEW.xlsx");
console.log(`Số sheet: ${wb.SheetNames.length}\n`);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const ref = ws["!ref"] ?? "";
  const range = ref ? XLSX.utils.decode_range(ref) : null;
  console.log(`  ${name.padEnd(24)} ${ref.padEnd(12)} ${range ? (range.e.r+1)+" dòng × "+(range.e.c+1)+" cột" : ""}`);
}
