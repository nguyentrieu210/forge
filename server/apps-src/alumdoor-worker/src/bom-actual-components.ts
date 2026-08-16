import type { ResolvedBomComponent, ResolvedBomTemplate } from "./bom-template-core.js";

export interface BomActualComponentInput {
  component_key: string;
  item_code: string;
  qty: number;
  source_row?: number;
  note?: string;
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

export function mergeBomActualComponents(input: {
  resolved: ResolvedBomTemplate;
  actual_components?: unknown;
  required_actual_component_keys?: string[];
}): ResolvedBomTemplate {
  const required = [...new Set((input.required_actual_component_keys ?? []).map(text).filter(Boolean))];
  const allowed = new Set(required);
  const actual = normalizeBomActualComponents(input.actual_components);

  for (const row of actual) {
    if (!allowed.has(row.component_key)) {
      throw new Error(`${input.resolved.template_code}: actual component ${row.component_key} không được BOM Template khai báo; hệ thống không tự chèn vật tư.`);
    }
  }

  const present = new Set(actual.map((row) => row.component_key));
  const missing = required.filter((key) => !present.has(key));
  if (missing.length) {
    throw new Error(`${input.resolved.template_code}: thiếu vật tư BOM thực tế cho ${missing.join(", ")}; hệ thống không tự đoán.`);
  }

  const actualResolved: ResolvedBomComponent[] = actual.map((row, index) => ({
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
