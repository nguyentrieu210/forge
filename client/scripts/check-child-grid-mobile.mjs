import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const source = fs.readFileSync(path.join(process.cwd(), "packages/views/src/form/ChildGridWithExtensions.tsx"), "utf8");
const required = [
  ["mobile card renderer", 'className="space-y-3 p-3 md:hidden"'],
  ["desktop table renderer", 'className="hidden overflow-x-auto md:block"'],
  ["shared control renderer", "const renderControl = (row: Doc, rowIndex: number, field: DocField) =>"],
  ["permission resolver preserved", "const resolved = resolveField(gridField, childMeta"],
  ["mobile row label", "aria-label={`${purchaseOrder ? \"Dòng đặt nhôm\" : \"Dòng mở rộng\"} ${rowIndex + 1}`}"],
];

let failed = false;
for (const [label, needle] of required) {
  if (source.includes(needle)) continue;
  console.error(`Child-grid mobile check failed: missing ${label}`);
  failed = true;
}
if (!source.includes("readOnly={Boolean(readOnly || resolved.readOnly)}") || !source.includes("masked={resolved.masked}")) {
  console.error("Child-grid mobile check failed: permission/masking contract changed");
  failed = true;
}
if (failed) process.exitCode = 1;
else console.log("Child-grid mobile contract OK");
