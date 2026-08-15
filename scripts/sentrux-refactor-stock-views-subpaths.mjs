import { readFile, writeFile } from "node:fs/promises";

const packagePath = "client/packages/views/package.json";
const screenPath = "client/packages/stock-vn/src/TongHopDoiTuongScreen.tsx";

const pkg = JSON.parse(await readFile(packagePath, "utf8"));
pkg.exports ??= {};
const additions = {
  "./context": {
    types: "./dist/container/meta-context.d.ts",
    import: "./dist/container/meta-context.js",
  },
  "./date-range": {
    types: "./dist/list/date-range.d.ts",
    import: "./dist/list/date-range.js",
  },
  "./period-picker": {
    types: "./dist/report/PeriodPicker.d.ts",
    import: "./dist/report/PeriodPicker.js",
  },
  "./form-export": {
    types: "./dist/report/form-export.d.ts",
    import: "./dist/report/form-export.js",
  },
};
for (const [key, value] of Object.entries(additions)) {
  if (pkg.exports[key] && JSON.stringify(pkg.exports[key]) !== JSON.stringify(value)) {
    throw new Error(`Refusing to overwrite existing export ${key}`);
  }
  pkg.exports[key] = value;
}
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

let screen = await readFile(screenPath, "utf8");
const rootImport = 'import { useLocaleFormat, useMetaForge, resolveDateRange, PeriodPicker, exportFormXlsx, ymdToDmy } from "@metaforge/views";';
if (!screen.includes(rootImport)) throw new Error("Expected @metaforge/views root import not found");
const directImports = [
  'import { useLocaleFormat, useMetaForge } from "@metaforge/views/context";',
  'import { resolveDateRange } from "@metaforge/views/date-range";',
  'import { PeriodPicker } from "@metaforge/views/period-picker";',
  'import { exportFormXlsx, ymdToDmy } from "@metaforge/views/form-export";',
].join("\n");
screen = screen.replace(rootImport, directImports);
await writeFile(screenPath, screen, "utf8");
