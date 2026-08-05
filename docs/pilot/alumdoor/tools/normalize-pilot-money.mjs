#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const policyPath = path.resolve(here, "../PILOT_01_MONEY_ROUNDING_V1.json");
export const MONEY_POLICY = Object.freeze(JSON.parse(readFileSync(policyPath, "utf8")));

function parseDecimal(value) {
  const text = String(value ?? "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new Error(`invalid VND decimal: ${text}`);
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  return {
    negative,
    whole: BigInt(whole),
    fraction,
    raw: BigInt(`${whole}${fraction}` || "0") * (negative ? -1n : 1n),
    scale: fraction.length,
    source: text,
  };
}

function decimalString(raw, scale) {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const digits = abs.toString().padStart(scale + 1, "0");
  const text = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative && abs !== 0n ? `-${text}` : text;
}

function subtractIntegerFromDecimal(parsed, integer) {
  const factor = 10n ** BigInt(parsed.scale);
  return decimalString(BigInt(integer) * factor - parsed.raw, parsed.scale);
}

export function roundVnd(value) {
  const parsed = parseDecimal(value);
  if (parsed.scale === 0) {
    return {
      source_vnd: parsed.source,
      rounded_vnd: parsed.raw.toString(),
      rounding_delta_vnd: "0",
      rule: MONEY_POLICY.rounding_policy.name,
    };
  }

  const firstFractionDigit = Number(parsed.fraction[0] ?? "0");
  let magnitude = parsed.whole;
  if (firstFractionDigit >= 5) magnitude += 1n;
  const rounded = parsed.negative ? -magnitude : magnitude;

  return {
    source_vnd: parsed.source,
    rounded_vnd: rounded.toString(),
    rounding_delta_vnd: subtractIntegerFromDecimal(parsed, rounded),
    rule: MONEY_POLICY.rounding_policy.name,
  };
}

export function assertMoneyPolicy() {
  if (MONEY_POLICY.format !== "forge-alumdoor-pilot-01-money-rounding/v1") throw new Error("unexpected money policy format");
  if (MONEY_POLICY.status !== "LOCKED_PREVIEW_ONLY") throw new Error("money policy status drift");
  if (MONEY_POLICY.currency !== "VND") throw new Error("money policy currency drift");
  if (MONEY_POLICY.source_display_semantics.display_decimal_places !== 0) throw new Error("source VND display must remain integer");
  if (MONEY_POLICY.observed_fractional_rows.count !== 45) throw new Error("fractional source-row count drift");
  if (MONEY_POLICY.production_write_authorized !== false || MONEY_POLICY.production_data_mutated !== false) throw new Error("money normalization must remain preview-only");
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  assertMoneyPolicy();
  process.stdout.write(`${JSON.stringify({
    status: MONEY_POLICY.status,
    fractional_rows: MONEY_POLICY.observed_fractional_rows.count,
    rounded_per_row_sum_vnd: MONEY_POLICY.observed_fractional_rows.rounded_per_row_sum_vnd,
    production_write_authorized: false,
  })}\n`);
}
