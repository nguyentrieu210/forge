#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const policyPath = path.resolve(here, "../PILOT_01_UOM_RECONCILIATION_V1.json");
export const UOM_POLICY = Object.freeze(JSON.parse(readFileSync(policyPath, "utf8")));

function present(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function decimal(value, field) {
  const text = String(value ?? "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new Error(`${field} must be a decimal number`);
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  return { raw: BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n), scale: fraction.length };
}

function normalize({ raw, scale }) {
  while (scale > 0 && raw % 10n === 0n) {
    raw /= 10n;
    scale -= 1;
  }
  return { raw, scale };
}

function multiply(...values) {
  let raw = 1n;
  let scale = 0;
  for (const [index, value] of values.entries()) {
    const parsed = decimal(value, `factor[${index}]`);
    if (parsed.raw < 0n) throw new Error("quantity factors must be non-negative");
    raw *= parsed.raw;
    scale += parsed.scale;
  }
  return normalize({ raw, scale });
}

function toString(value) {
  const { raw, scale } = normalize(value);
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(scale + 1, "0");
  const text = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative ? `-${text}` : text;
}

function requirePositiveStructured(value, field) {
  const parsed = decimal(value, field);
  if (parsed.raw <= 0n) throw new Error(`${field} must be greater than zero`);
  return value;
}

function requireSourceQuantity(value) {
  if (!present(value)) throw new Error("source_quantity is required for a direct source quantity");
  const parsed = decimal(value, "source_quantity");
  if (parsed.raw < 0n) throw new Error("source_quantity must be non-negative");
  return toString(parsed);
}

function lengthTimesPieces(structured = {}) {
  const length = requirePositiveStructured(structured.length_m, "length_m");
  const pieces = requirePositiveStructured(structured.piece_qty, "piece_qty");
  return toString(multiply(length, pieces));
}

function area(structured = {}) {
  if (present(structured.source_area_m2)) return requireSourceQuantity(structured.source_area_m2);
  const height = requirePositiveStructured(structured.height_m, "height_m");
  const width = requirePositiveStructured(structured.width_m, "width_m");
  const sets = requirePositiveStructured(structured.set_qty, "set_qty");
  return toString(multiply(height, width, sets));
}

export function assertUomPolicy() {
  if (UOM_POLICY.format !== "forge-alumdoor-pilot-01-uom-reconciliation/v1") throw new Error("unexpected UOM policy format");
  if (UOM_POLICY.status !== "PARTIAL_LOCK_PREVIEW_ONLY") throw new Error("UOM policy status drift");
  const reviewed = Number(UOM_POLICY.scope.identities_reviewed);
  const resolved = Number(UOM_POLICY.scope.opening_or_stock_uom_resolved) + Number(UOM_POLICY.scope.legacy_non_stock_or_derived_resolved);
  const blocked = Number(UOM_POLICY.scope.stock_uom_blocked);
  if (reviewed !== resolved + blocked) throw new Error(`UOM scope mismatch: ${reviewed} != ${resolved} + ${blocked}`);
  if (reviewed !== 21 || resolved !== 19 || blocked !== 2) throw new Error("expected Pilot-01 UOM scope 21 reviewed / 19 resolved / 2 blocked");
  if (UOM_POLICY.production_write_authorized !== false || UOM_POLICY.production_data_mutated !== false) throw new Error("UOM policy must remain preview-only");
  return true;
}

export function reconcilePilotQuantity({ source_code: sourceCode, business_context: businessContext, source_quantity: sourceQuantity, source_uom: sourceUom, structured = {} } = {}) {
  const code = String(sourceCode ?? "").trim();
  if (!code) throw new Error("source_code is required");

  const blocked = UOM_POLICY.blocked_stock_uom_identities?.[code];
  if (blocked) throw new Error(`${code}: UOM_BLOCKED — ${blocked.reason}`);

  const split = UOM_POLICY.supersedes_identity_resolution_for?.[code];
  if (split) {
    if (["stock", "opening_stock", "purchase"].includes(businessContext)) {
      return {
        source_item_code: code,
        target_item_code: split.stock_context.item_code,
        quantity: requireSourceQuantity(sourceQuantity),
        uom: split.stock_context.stock_uom,
        evidence_kind: "source-stock-quantity",
        context_split: true,
      };
    }
    if (businessContext === "sales") {
      return {
        source_item_code: code,
        target_item_code: split.sales_context.commercial_item_code,
        quantity: area(structured),
        uom: split.sales_context.commercial_uom,
        evidence_kind: present(structured.source_area_m2) ? "source-commercial-area" : "derived-from-structured-dimensions",
        context_split: true,
      };
    }
    throw new Error(`${code}: business_context must be stock/opening_stock/purchase or sales because this legacy identity is overloaded`);
  }

  const stock = UOM_POLICY.resolved_stock_identities?.[code];
  if (stock) {
    if (code === "NVL-TOLE1.2x190-CORON" || code === "NVL-TRUC114_2.4LY") {
      return {
        source_item_code: code,
        target_item_code: stock.target_item_code,
        quantity: lengthTimesPieces(structured),
        uom: stock.stock_uom,
        evidence_kind: "derived-from-structured-length-piece-fields",
      };
    }
    if (code === "NVL-VIS-BANLO2P" && present(sourceUom) && String(sourceUom).trim().toLocaleUpperCase("vi-VN") !== "CON") {
      throw new Error(`${code}: source UOM ${sourceUom} conflicts with source-authoritative stock UOM Con; conversion is not proven`);
    }
    return {
      source_item_code: code,
      target_item_code: stock.target_item_code,
      quantity: requireSourceQuantity(sourceQuantity),
      uom: stock.stock_uom,
      evidence_kind: "source-direct-quantity",
    };
  }

  const legacy = UOM_POLICY.resolved_legacy_non_stock_or_derived?.[code];
  if (legacy) {
    if (legacy.classification === "service") {
      return {
        source_item_code: code,
        target_item_code: code,
        quantity: present(sourceQuantity) ? requireSourceQuantity(sourceQuantity) : null,
        uom: legacy.sales_uom ?? null,
        stock_uom: null,
        evidence_kind: "service-non-stock",
      };
    }
    if (legacy.classification === "legacy-derived-transaction-line") {
      if (businessContext !== "sales") throw new Error(`${code}: legacy derived line is accepted only in sales context, not as opening stock`);
      return {
        source_item_code: code,
        target_item_code: legacy.commercial_context_item,
        quantity: area(structured),
        uom: legacy.commercial_uom,
        stock_uom: null,
        evidence_kind: present(structured.source_area_m2) ? "source-commercial-area" : "derived-from-structured-dimensions",
      };
    }
  }

  throw new Error(`${code}: no locked UOM reconciliation exists`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  assertUomPolicy();
  process.stdout.write(`${JSON.stringify({
    status: UOM_POLICY.status,
    identities_reviewed: UOM_POLICY.scope.identities_reviewed,
    resolved: UOM_POLICY.scope.opening_or_stock_uom_resolved + UOM_POLICY.scope.legacy_non_stock_or_derived_resolved,
    blocked: UOM_POLICY.scope.stock_uom_blocked,
    production_write_authorized: false,
  })}\n`);
}
