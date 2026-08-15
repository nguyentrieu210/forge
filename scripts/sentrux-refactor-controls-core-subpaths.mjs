import { readFile, writeFile } from "node:fs/promises";

const packagePath = "client/packages/core/package.json";
const contractPath = "client/packages/controls/src/contract.ts";

const pkg = JSON.parse(await readFile(packagePath, "utf8"));
pkg.exports ??= {};
const additions = {
  "./types/meta": {
    types: "./dist/types/meta.d.ts",
    import: "./dist/types/meta.js"
  },
  "./types/fieldtype": {
    types: "./dist/types/fieldtype.d.ts",
    import: "./dist/types/fieldtype.js"
  },
  "./i18n/format": {
    types: "./dist/i18n/format.d.ts",
    import: "./dist/i18n/format.js"
  }
};
for (const [key, value] of Object.entries(additions)) {
  if (pkg.exports[key] && JSON.stringify(pkg.exports[key]) !== JSON.stringify(value)) {
    throw new Error(`Refusing to overwrite existing export ${key}`);
  }
  pkg.exports[key] = value;
}
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

let contract = await readFile(contractPath, "utf8");
const oldImports = `import type { DocField, Fieldtype, BoundFormatters } from "@metaforge/core";\nimport { AUTHORABLE_FIELDTYPES } from "@metaforge/core";`;
if (!contract.includes(oldImports)) throw new Error("Expected controls root-core imports not found");
const newImports = `import type { DocField } from "@metaforge/core/types/meta";\nimport { AUTHORABLE_FIELDTYPES, type Fieldtype } from "@metaforge/core/types/fieldtype";\nimport type { BoundFormatters } from "@metaforge/core/i18n/format";`;
contract = contract.replace(oldImports, newImports);
await writeFile(contractPath, contract, "utf8");
