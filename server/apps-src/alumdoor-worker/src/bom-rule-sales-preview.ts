import { roundTo } from "../../../packages/core/src/index.js";
import {
  bomRuleFormulaDisplay,
  evaluateBomRuleMaster,
  resolveBomRuleMaster,
  type BomRuleMaster,
} from "./bom-rule-core.js";
import type { ProductionPlatformCall } from "./sales-production-core.js";

type Json = Record<string, unknown>;

interface ItemDoc extends Json {
  item_code?: string;
  stock_uom?: string;
  uom_conversions?: Array<{ uom?: string; conversion_factor?: unknown }>;
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function normalizedUom(value: unknown): string {
  return text(value).toLocaleLowerCase("vi").replaceAll("²", "2").replaceAll(" ", "");
}

function positive(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function quantityText(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("vi-VN", { maximumFractionDigits: 6 })
    : "";
}

async function listDocs<T extends Json>(
  call: ProductionPlatformCall,
  doctype: string,
  fields: string[],
  filters: unknown[] = [],
  limit = 500,
): Promise<T[]> {
  const output: T[] = [];
  while (output.length < limit) {
    const pageLength = Math.min(100, limit - output.length);
    const query = new URLSearchParams({
      fields: JSON.stringify(fields),
      filters: JSON.stringify(filters),
      limit_start: String(output.length),
      limit_page_length: String(pageLength),
    });
    const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Không đọc được danh sách ${doctype} (HTTP ${response.status}).`);
    const page = (((await response.json()) as { data?: T[] }).data ?? []);
    output.push(...page);
    if (page.length < pageLength) break;
  }
  return output.slice(0, limit);
}

async function readDoc<T extends Json>(call: ProductionPlatformCall, doctype: string, name: string): Promise<T> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((((await response.json()) as { data?: T }).data ?? {}) as T);
}

async function loadBomRules(call: ProductionPlatformCall): Promise<BomRuleMaster[]> {
  const names = await listDocs<{ name?: string }>(call, "BOM Rule", ["name"], [["disabled", "=", 0]], 500);
  if (!names.length) return [];
  const docs = await Promise.all(names.map(async (row) => {
    const name = text(row.name);
    if (!name) return null;
    return readDoc<BomRuleMaster & Json>(call, "BOM Rule", name);
  }));
  return docs.filter((row): row is BomRuleMaster & Json => Boolean(row && text(row.rule_code)));
}

function safeFormulaDisplay(rule: BomRuleMaster): string {
  try {
    return bomRuleFormulaDisplay(rule);
  } catch {
    return text(rule.source_formula_text) || text(rule.rule_name) || text(rule.rule_code);
  }
}

/**
 * Values handed to a BOM Rule are PER ONE parent set. set_count is multiplied only by
 * evaluateBomRuleMaster afterwards. Sales billable_area_sqm can already include all sets,
 * so it is never passed through unchanged when a per-set area can be derived.
 */
function geometryValues(args: Json): Json {
  const setCount = positive(args.set_count) ?? 1;
  const width = positive(args.width_m);
  const widthRay = positive(args.width_pb_ray_m) ?? width;
  const widthPlastic = positive(args.width_pb_nhua_m) ?? width;
  const height = positive(args.height_m);
  const cut = positive(args.cut_width_m);
  const totalArea = positive(args.billable_area_sqm);
  const areaPerSet = width && height
    ? roundTo(width * height)
    : totalArea
      ? roundTo(totalArea / setCount)
      : undefined;
  const values: Json = {
    width_m: width,
    height_m: height,
    mesh_height_m: positive(args.mesh_height_m),
    cut_width_m: cut,
    billable_area_sqm: areaPerSet,
    leaf_count: positive(args.leaf_count),
    set_count: 1,
    "RONG-PB-RAY": widthRay,
    PB_NHUA_RONG: widthPlastic,
    PB_RONG: width,
    "CAO-PB": height,
    "RONG-CAT-LA": cut,
    CAO_LUOI: positive(args.mesh_height_m),
  };
  for (const key of Object.keys(values)) {
    if (values[key] === undefined || values[key] === null || values[key] === "") delete values[key];
  }
  return values;
}

function conversionFor(item: ItemDoc, fromUom: string): { factor: number; stock_uom: string } | null {
  const stockUom = text(item.stock_uom);
  if (!stockUom) return null;
  if (normalizedUom(stockUom) === normalizedUom(fromUom)) return { factor: 1, stock_uom: stockUom };
  const rows = Array.isArray(item.uom_conversions) ? item.uom_conversions : [];
  const matched = rows.find((row) => normalizedUom(row.uom) === normalizedUom(fromUom) && positive(row.conversion_factor));
  const factor = positive(matched?.conversion_factor);
  return factor ? { factor, stock_uom: stockUom } : null;
}

function componentRuleNote(
  result: ReturnType<typeof evaluateBomRuleMaster>,
  stockQty: number | null,
  stockUom: string,
  warning: string,
): string {
  const parts = [
    `Quy tắc BOM ${result.rule_code} v${result.rule_version}: ${result.formula_display}`,
    `${quantityText(result.result_per_piece)} ${result.consumption_uom}/đơn vị`,
    `${quantityText(result.qty_per_set)} đơn vị/bộ`,
    `${quantityText(result.consumption_qty)} ${result.consumption_uom} tổng tiêu hao`,
  ];
  if (stockQty !== null && stockUom) parts.push(`${quantityText(stockQty)} ${stockUom} xuất kho`);
  if (warning) parts.push(warning);
  return parts.filter(Boolean).join(" · ");
}

export async function enrichSalesBomPreviewWithRules(
  call: ProductionPlatformCall,
  args: Json,
  preview: Json,
): Promise<Json> {
  const components = Array.isArray(preview.components)
    ? preview.components.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
  if (!components.length) return preview;

  const rules = await loadBomRules(call);
  if (!rules.length) return {
    ...preview,
    bom_rule_status: "NOT_IMPORTED",
    bom_rule_warning: "Chưa import danh mục Quy tắc BOM; đang hiển thị snapshot BOM cũ.",
  };

  const values = geometryValues(args);
  const setCount = positive(args.set_count) ?? 1;
  const itemCodes = [...new Set(components.map((row) => text(row.item_code)).filter(Boolean))];
  const itemPairs = await Promise.all(itemCodes.map(async (code) => [code, await readDoc<ItemDoc>(call, "Item", code)] as const));
  const itemByCode = new Map(itemPairs);
  const missing: string[] = [];

  const enriched = components.map((component) => {
    const itemCode = text(component.item_code);
    const rule = resolveBomRuleMaster(rules, {
      bom: text(preview.bom_no),
      parent_item: text(args.item_code),
      parent_item_group: text(args.item_group),
      door_type: text(args.door_type),
      component_item: itemCode,
      on: text(args.delivery_date),
    });
    if (!rule) {
      missing.push(itemCode);
      return {
        ...component,
        bom_rule_missing: true,
        bom_rule_warning: `Chưa map Quy tắc BOM cho ${itemCode}.`,
        note: [`Chưa map Quy tắc BOM cho ${itemCode}.`, text(component.note)].filter(Boolean).join(" · "),
      };
    }

    try {
      const result = evaluateBomRuleMaster(rule, values, { set_count: setCount });
      const item = itemByCode.get(itemCode) ?? {};
      const conversion = conversionFor(item, result.consumption_uom);
      const stockUom = conversion?.stock_uom ?? text(item.stock_uom);
      const stockQty = conversion ? roundTo(result.consumption_qty * conversion.factor) : null;
      const conversionWarning = conversion || !stockUom || normalizedUom(stockUom) === normalizedUom(result.consumption_uom)
        ? ""
        : `Thiếu quy đổi ${result.consumption_uom} → ${stockUom} trên Item ${itemCode}.`;
      const {
        width_pb_ray_m: _widthPbRay,
        width_pb_nhua_m: _widthPbNhua,
        width_m: _width,
        height_m: _height,
        mesh_height_m: _meshHeight,
        cut_width_m: _cutWidth,
        sales_uom_message: _oldSalesUomMessage,
        ...base
      } = component;
      void _widthPbRay; void _widthPbNhua; void _width; void _height; void _meshHeight; void _cutWidth; void _oldSalesUomMessage;
      return {
        ...base,
        bom_rule_code: result.rule_code,
        bom_rule_version: result.rule_version,
        bom_rule_authority: result.authority_type,
        formula_display: result.formula_display,
        formula_snapshot: result.formula_snapshot,
        result_per_piece: result.result_per_piece,
        qty_per_set: result.qty_per_set,
        parent_set_count: result.set_count,
        consumption_qty: result.consumption_qty,
        consumption_uom: result.consumption_uom,
        // Current Sales BOM table reads set_count as the per-set quantity column. Keep that
        // compatibility projection while the explicit qty_per_set field remains authoritative.
        set_count: result.qty_per_set,
        qty: result.consumption_qty,
        uom: result.consumption_uom,
        ...(text(rule.result_kind) === "LENGTH" ? { length_m: result.result_per_piece } : {}),
        stock_uom: stockUom,
        stock_qty: stockQty,
        conversion_factor: conversion?.factor ?? null,
        note: componentRuleNote(result, stockQty, stockUom, conversionWarning),
        ...(conversionWarning ? { uom_warning: conversionWarning } : {}),
      };
    } catch (error) {
      const formulaDisplay = safeFormulaDisplay(rule);
      const quantityError = error instanceof Error ? error.message : "Không tính được Quy tắc BOM.";
      return {
        ...component,
        bom_rule_code: text(rule.rule_code),
        bom_rule_version: Number(rule.version ?? 1),
        formula_display: formulaDisplay,
        quantity_error: quantityError,
        note: [formulaDisplay, quantityError].filter(Boolean).join(" · "),
      };
    }
  });

  return {
    ...preview,
    components: enriched,
    bom_rule_status: missing.length ? "PARTIAL" : "APPLIED",
    bom_rule_missing_components: [...new Set(missing)],
  };
}
