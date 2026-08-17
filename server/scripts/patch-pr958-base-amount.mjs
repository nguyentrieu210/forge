#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const path = "server/packages/clouderp-selling/src/commercial-line-resolver.ts";
let text = await readFile(path, "utf8");
const before = `  const facts = {\n    ...optionFacts,\n    price_variant: rawPrice.price_variant,\n    discount_basis_variant: discountBasisPrice.price_variant,\n  };`;
const after = `  const baseAmountMinor = multiplyMinorByQuantity(rawPrice.rate_minor, pricedQtyMicros, "pricing facts base amount");\n  const facts = {\n    ...optionFacts,\n    base_rate: Number(rawPrice.rate),\n    base_amount: Number(fromScaledInt(baseAmountMinor, rawPrice.currency_scale)),\n    price_variant: rawPrice.price_variant,\n    discount_basis_variant: discountBasisPrice.price_variant,\n  };`;
const first = text.indexOf(before);
if (first < 0) throw new Error("base amount fact anchor not found");
if (text.indexOf(before, first + before.length) >= 0) throw new Error("base amount fact anchor is not unique");
text = text.slice(0, first) + after + text.slice(first + before.length);
await writeFile(path, text, "utf8");
console.log("PR958_BASE_AMOUNT_FACT_PATCHED");
