import type { ResolvedBomComponent, ResolvedBomTemplate } from "./bom-template-core.js";

export interface BomActualComponentInput {
  component_key: string;
  item_code: string;
  qty: number;
  source_row?: number;
  note?: string;
}

export interface BomActualRequirement {
  component_key: string;
  allowed_item_codes: string[];
  provided_item_codes: string[];
  provided_rows: number;
  missing: boolean;
}

export interface BomActualInspection {
  actual_components: BomActualComponentInput[];
  requirements: BomActualRequirement[];
  missing_component_keys: string[];
  complete: boolean;
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function positive(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || !(number > 0)) throw new Error(`${label} phải là số lớn hơn 0.`);
  return number;
}

export function normalizeBomActualComponents(input: unknown): BomActualComponentInput[] {
  if (input === undefined || input === null || input === "") return [];
  if (!Array.isArray(input)) throw new Error("Vật tư BOM thực tế phải là bảng dữ liệu.");
  return input.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Vật tư BOM thực tế dòng ${index + 1} không hợp lệ.`);
    }
    const row = raw as Record<string, unknown>;
    const componentKey = text(row.component_key);
    const itemCode = text(row.item_code);
    if (!componentKey) throw new Error(`Vật tư BOM thực tế dòng ${index + 1}: thiếu component_key.`);
    if (!itemCode) throw new Error(`Vật tư BOM thực tế dòng ${index + 1}: thiếu item_code.`);
    const sourceRowRaw = row.source_row;
    const sourceRow = sourceRowRaw === undefined || sourceRowRaw === null || sourceRowRaw === ""
      ? undefined
      : Number(sourceRowRaw);
    if (sourceRow !== undefined && (!Number.isInteger(sourceRow) || sourceRow <= 0)) {
      throw new Error(`Vật tư BOM thực tế dòng ${index + 1}: source_row phải là số nguyên dương.`);
    }
    return {
      component_key: componentKey,
      item_code: itemCode,
      qty: positive(row.qty, `Vật tư BOM thực tế ${componentKey}/${itemCode}`),
      ...(sourceRow === undefined ? {} : { source_row: sourceRow }),
      ...(text(row.note) ? { note: text(row.note) } : {}),
    };
  });
}

function normalizeRequiredKeys(input: string[] | undefined): string[] {
  return [...new Set((input ?? []).map(text).filter(Boolean))];
}

function normalizeAllowedItems(input: Record<string, string[]> | undefined): Map<string, Set<string>> {
  const output = new Map<string, Set<string>>();
  for (const [rawKey, rawItems] of Object.entries(input ?? {})) {
    const key = text(rawKey);
    if (!key) throw new Error("BOM Template có actual component key rỗng trong allowlist.");
    if (!Array.isArray(rawItems)) throw new Error(`${key}: allowlist item actual phải là mảng.`);
    const items = new Set(rawItems.map(text).filter(Boolean));
    if (!items.size) throw new Error(`${key}: allowlist item actual không được rỗng.`);
    output.set(key, items);
  }
  return output;
}

export function inspectBomActualComponents(input: {
  template_code: string;
  actual_components?: unknown;
  required_actual_component_keys?: string[];
  allowed_item_codes_by_key?: Record<string, string[]>;
}): BomActualInspection {
  const templateCode = text(input.template_code) || "BOM Template";
  const required = normalizeRequiredKeys(input.required_actual_component_keys);
  const allowedKeys = new Set(required);
  const allowedItems = normalizeAllowedItems(input.allowed_item_codes_by_key);
  const actual = normalizeBomActualComponents(input.actual_components);

  for (const key of allowedItems.keys()) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${templateCode}: allowlist khai báo slot ${key} nhưng slot này không nằm trong required actual keys.`);
    }
  }

  for (const row of actual) {
    if (!allowedKeys.has(row.component_key)) {
      throw new Error(`${templateCode}: actual component ${row.component_key} không được BOM Template khai báo; hệ thống không tự chèn vật tư.`);
    }
    const itemAllowlist = allowedItems.get(row.component_key);
    if (itemAllowlist && !itemAllowlist.has(row.item_code)) {
      throw new Error(`${templateCode}: ${row.item_code} không được phép cho actual slot ${row.component_key}; hệ thống không thay vật tư nguồn.`);
    }
  }

  const requirements = required.map((componentKey) => {
    const rows = actual.filter((row) => row.component_key === componentKey);
    return {
      component_key: componentKey,
      allowed_item_codes: [...(allowedItems.get(componentKey) ?? new Set<string>())],
      provided_item_codes: rows.map((row) => row.item_code),
      provided_rows: rows.length,
      missing: rows.length === 0,
    } satisfies BomActualRequirement;
  });
  const missing = requirements.filter((row) => row.missing).map((row) => row.component_key);
  return {
    actual_components: actual,
    requirements,
    missing_component_keys: missing,
    complete: missing.length === 0,
  };
}

export function mergeBomActualComponents(input: {
  resolved: ResolvedBomTemplate;
  actual_components?: unknown;
  required_actual_component_keys?: string[];
  allowed_item_codes_by_key?: Record<string, string[]>;
}): ResolvedBomTemplate {
  const inspection = inspectBomActualComponents({
    template_code: input.resolved.template_code,
    actual_components: input.actual_components,
    required_actual_component_keys: input.required_actual_component_keys,
    allowed_item_codes_by_key: input.allowed_item_codes_by_key,
  });
  if (!inspection.complete) {
    throw new Error(`${input.resolved.template_code}: thiếu vật tư BOM thực tế cho ${inspection.missing_component_keys.join(", ")}; hệ thống không tự đoán.`);
  }

  const actualResolved: ResolvedBomComponent[] = inspection.actual_components.map((row, index) => ({
    component_key: row.component_key,
    item_code: row.item_code,
    qty: row.qty,
    source_rule: `ACTUAL:${row.component_key}:${index + 1}`,
    note: [
      row.source_row === undefined ? "" : `ĐM row ${row.source_row}`,
      row.note ?? "",
    ].filter(Boolean).join(" · "),
  }));

  const components = [...input.resolved.components, ...actualResolved];
  return {
    ...input.resolved,
    components,
    applied_rules: components.map((row) => row.source_rule),
  };
}
