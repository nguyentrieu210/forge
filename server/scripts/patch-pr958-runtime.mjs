#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

function replaceExactlyOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`${label}: anchor not found`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: anchor not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

const controllerPath = "server/packages/clouderp-selling/src/commercial-sales-order-controller.ts";
let controller = await readFile(controllerPath, "utf8");
controller = replaceExactlyOnce(
  controller,
  `        ...(priceUom ? { uom: priceUom } : {}),\n        pricedQty,`,
  `        ...(priceUom ? { uom: priceUom } : {}),\n        ...(item.price_variant ? { priceVariant: item.price_variant } : {}),\n        pricedQty,`,
  "controller price variant",
);
controller = replaceExactlyOnce(
  controller,
  `function multiplyMinorByQty(rateMinor: number, qtyMicros: number, field: string): number {\n  const result = Number((BigInt(rateMinor) * BigInt(qtyMicros) + 500_000n) / 1_000_000n);\n  if (!Number.isSafeInteger(result)) throw errors.validation(\`${'${field}'} exceeds safe integer range\`);\n  return result;\n}`,
  `function multiplyMinorByQty(rateMinor: number, qtyMicros: number, field: string): number {\n  if (!Number.isSafeInteger(rateMinor) || !Number.isSafeInteger(qtyMicros) || qtyMicros < 0) {\n    throw errors.validation(\`${'${field}'} exceeds safe integer bounds\`);\n  }\n  const product = BigInt(rateMinor) * BigInt(qtyMicros);\n  const roundedAbs = ((product < 0n ? -product : product) + 500_000n) / 1_000_000n;\n  const result = Number(product < 0n ? -roundedAbs : roundedAbs);\n  if (!Number.isSafeInteger(result)) throw errors.validation(\`${'${field}'} exceeds safe integer range\`);\n  return result;\n}`,
  "controller signed adjustment multiplication",
);
await writeFile(controllerPath, controller, "utf8");

const policyPath = "server/packages/clouderp-pricing/src/commercial-policy.ts";
let policy = await readFile(policyPath, "utf8");
policy = replaceExactlyOnce(
  policy,
  `    const rateMinor = moneyMinor(\n      candidate.data.adjustment_rate ?? candidate.data.effect_value ?? candidate.data.rate,\n      input.currencyScale,\n      \`${'${candidate.name}'}.adjustment_rate\`,\n    );`,
  `    const rateMinor = signedMoneyMinor(\n      candidate.data.adjustment_rate ?? candidate.data.effect_value ?? candidate.data.rate,\n      input.currencyScale,\n      \`${'${candidate.name}'}.adjustment_rate\`,\n    );`,
  "policy signed adjustment rate",
);
policy = replaceExactlyOnce(
  policy,
  `function multiplyMinorByQuantity(rateMinor: number, qtyMicros: number, field: string): number {\n  if (!Number.isSafeInteger(rateMinor) || rateMinor < 0) throw errors.validation(\`${'${field}'}: rate must be a non-negative safe integer\`);\n  if (!Number.isSafeInteger(qtyMicros) || qtyMicros < 0) throw errors.validation(\`${'${field}'}: quantity must be a non-negative safe integer\`);\n  const rounded = (BigInt(rateMinor) * BigInt(qtyMicros) + 500_000n) / 1_000_000n;\n  const value = Number(rounded);\n  if (!Number.isSafeInteger(value)) throw errors.validation(\`${'${field}'}: amount exceeds safe integer range\`);\n  return value;\n}`,
  `function multiplyMinorByQuantity(rateMinor: number, qtyMicros: number, field: string): number {\n  if (!Number.isSafeInteger(rateMinor)) throw errors.validation(\`${'${field}'}: rate must be a safe integer\`);\n  if (!Number.isSafeInteger(qtyMicros) || qtyMicros < 0) throw errors.validation(\`${'${field}'}: quantity must be a non-negative safe integer\`);\n  const product = BigInt(rateMinor) * BigInt(qtyMicros);\n  const roundedAbs = ((product < 0n ? -product : product) + 500_000n) / 1_000_000n;\n  const value = Number(product < 0n ? -roundedAbs : roundedAbs);\n  if (!Number.isSafeInteger(value)) throw errors.validation(\`${'${field}'}: amount exceeds safe integer range\`);\n  return value;\n}`,
  "policy signed adjustment multiplication",
);
const moneyHelper = `function moneyMinor(value: unknown, scale: number, label: string): number {\n  const minor = toScaledInt(numeric(value, label), scale, label);\n  if (minor < 0) throw errors.validation(\`${'${label}'} cannot be negative\`);\n  return minor;\n}`;
policy = replaceExactlyOnce(
  policy,
  moneyHelper,
  `${moneyHelper}\n\nfunction signedMoneyMinor(value: unknown, scale: number, label: string): number {\n  const minor = toScaledInt(numeric(value, label), scale, label);\n  if (!Number.isSafeInteger(minor)) throw errors.validation(\`${'${label}'} must be a safe monetary integer\`);\n  return minor;\n}`,
  "policy signed money helper",
);
await writeFile(policyPath, policy, "utf8");
console.log("PR958_RUNTIME_PATCH_APPLIED");
