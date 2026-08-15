import { readFile, writeFile } from "node:fs/promises";

const coreTypesPath = "server/packages/clouderp-core/src/types.ts";
const sellingTypesPath = "server/packages/clouderp-selling/src/types.ts";
const taxTypesPath = "server/packages/clouderp-core/src/tax-types.ts";

let coreTypes = await readFile(coreTypesPath, "utf8");
let sellingTypes = await readFile(sellingTypesPath, "utf8");

const coreCycleImport = 'import type { TaxRow } from "../../clouderp-selling/src/types.js";';
if (!coreTypes.includes(coreCycleImport)) {
  throw new Error("Expected clouderp-core -> clouderp-selling TaxRow import not found");
}
coreTypes = coreTypes.replace(coreCycleImport, 'import type { TaxRow } from "./tax-types.js";');

const taxBlock = `export type TaxChargeType = "On Net Total" | "On Previous Row Total" | "Actual" | "On Item Quantity";\nexport type TaxAddDeduct = "Add" | "Deduct";\n\nexport interface TaxRow extends JsonObject {\n  row_id: string;\n  account: string;\n  rate: DecimalInput;\n  charge_type?: TaxChargeType;\n  included_in_print_rate?: boolean;\n  add_deduct_tax?: TaxAddDeduct;\n  /** Positive input amount for Actual charge type. Kept separate from signed canonical tax_amount. */\n  actual_tax_amount?: DecimalInput;\n  /** Signed canonical tax amount after Add/Deduct normalization. */\n  tax_amount?: DecimalInput;\n  tax_amount_minor?: number;\n  total?: string;\n  total_minor?: number;\n}\n\n`;

if (!sellingTypes.includes(taxBlock)) {
  throw new Error("Expected TaxRow block not found in clouderp-selling/types.ts");
}

const sellingImportAnchor = 'import type { UomLine } from "../../clouderp-core/src/types.js";';
if (!sellingTypes.includes(sellingImportAnchor)) {
  throw new Error("Expected UomLine import not found in clouderp-selling/types.ts");
}
sellingTypes = sellingTypes.replace(
  sellingImportAnchor,
  `${sellingImportAnchor}\nimport type { TaxRow } from "../../clouderp-core/src/tax-types.js";\nexport type { TaxAddDeduct, TaxChargeType, TaxRow } from "../../clouderp-core/src/tax-types.js";`,
);
sellingTypes = sellingTypes.replace(taxBlock, "");

const taxTypes = `import type { JsonObject } from "../../contracts/src/index.js";\nimport type { DecimalInput } from "../../money/src/index.js";\n\n${taxBlock}`;

await writeFile(coreTypesPath, coreTypes, "utf8");
await writeFile(sellingTypesPath, sellingTypes, "utf8");
await writeFile(taxTypesPath, taxTypes, "utf8");
