import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export interface MigrationSourceTable {
  source_id: string;
  source_kind: "csv" | "excel" | "api" | "sql" | "erpnext" | "misa" | "odoo" | "fast" | "bravo" | "legacy";
  headers: string[];
  rows: JsonObject[];
  key_field?: string;
}

const FRAPPE_SYSTEM_FIELDS = new Set([
  "doctype", "owner", "creation", "modified", "modified_by", "docstatus", "idx", "status",
  "parent", "parenttype", "parentfield", "_user_tags", "_comments", "_assign", "_liked_by",
]);

/**
 * Normalises a Frappe/ERPNext export or REST result into the generic migration table.
 *
 * `name` is deliberately retained as the default stable source key. Framework-owned
 * audit/lifecycle fields are stripped so a migrated row cannot attempt to forge them on
 * Forge. Child-table values remain JSON arrays; the target metadata/controller decides
 * whether they are valid for the destination DocType.
 */
export function adaptFrappeRows(input: {
  source_id: string;
  rows: JsonObject[];
  source_kind?: "erpnext" | "api";
}): MigrationSourceTable {
  const sourceId = requireText(input.source_id, "source_id", 240);
  const headers: string[] = [];
  const seen = new Set<string>();
  const rows = input.rows.map((source, index) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw errors.validation(`Frappe source row ${index + 1} must be an object`);
    }
    const row: JsonObject = {};
    for (const [key, value] of Object.entries(source)) {
      if (FRAPPE_SYSTEM_FIELDS.has(key) || key.startsWith("__")) continue;
      if (!seen.has(key)) { seen.add(key); headers.push(key); }
      if (value !== undefined) row[key] = structuredClone(value);
    }
    return row;
  });
  if (!headers.length) throw errors.validation("Frappe source contains no importable fields");
  return {
    source_id: sourceId,
    source_kind: input.source_kind ?? "erpnext",
    headers,
    rows,
    ...(seen.has("name") ? { key_field: "name" } : {}),
  };
}

export type MisaInventoryKind = "nhap" | "xuat" | "chuyen";

type MisaFieldType = "date" | "decimal" | "text";
interface MisaFieldSpec {
  target: string;
  headers: string[];
  line?: boolean;
  required?: boolean;
  type?: MisaFieldType;
}
interface MisaSpec {
  target_doctype: string;
  fixed?: JsonObject;
  fields: MisaFieldSpec[];
}

/**
 * Canonical MISA AMIS inventory mappings promoted from the verified kho-vn importer.
 * These mappings were validated in-repo against real receipt/delivery/transfer sample
 * workbooks. Matching is by normalised header text, never by column position.
 */
export const MISA_INVENTORY_SPECS: Readonly<Record<MisaInventoryKind, MisaSpec>> = {
  nhap: {
    target_doctype: "Purchase Receipt",
    fields: [
      { target: "posting_date", headers: ["ngay hach toan", "ngay chung tu"], required: true, type: "date" },
      { target: "supplier", headers: ["ma doi tuong", "ten doi tuong"], required: true },
      { target: "remarks", headers: ["dien giai", "ly do nhap"] },
      { target: "item_code", line: true, headers: ["ma hang"], required: true },
      { target: "qty", line: true, headers: ["so luong", "so luong nhap"], required: true, type: "decimal" },
      { target: "rate", line: true, headers: ["don gia"], type: "decimal" },
      { target: "warehouse", line: true, headers: ["nhap tai kho", "kho nhap", "ma kho", "kho"] },
      { target: "uom", line: true, headers: ["dvt", "don vi tinh"] },
    ],
  },
  xuat: {
    target_doctype: "Delivery Note",
    fields: [
      { target: "posting_date", headers: ["ngay hach toan", "ngay chung tu"], required: true, type: "date" },
      { target: "customer", headers: ["ma doi tuong", "ten doi tuong"], required: true },
      { target: "instructions", headers: ["ly do xuat", "dien giai"] },
      { target: "item_code", line: true, headers: ["ma hang"], required: true },
      { target: "qty", line: true, headers: ["so luong", "so luong xuat"], required: true, type: "decimal" },
      { target: "rate", line: true, headers: ["don gia"], type: "decimal" },
      { target: "warehouse", line: true, headers: ["xuat tai kho", "kho xuat", "ma kho", "kho"] },
      { target: "uom", line: true, headers: ["dvt", "don vi tinh"] },
    ],
  },
  chuyen: {
    target_doctype: "Stock Entry",
    fixed: { stock_entry_type: "Material Transfer", purpose: "Material Transfer" },
    fields: [
      { target: "posting_date", headers: ["ngay hach toan", "ngay chung tu"], required: true, type: "date" },
      { target: "remarks", headers: ["ve viec dien giai", "dien giai"] },
      { target: "item_code", line: true, headers: ["ma hang"], required: true },
      { target: "qty", line: true, headers: ["so luong", "so luong chuyen"], required: true, type: "decimal" },
      { target: "s_warehouse", line: true, headers: ["kho xuat", "xuat tai kho", "tu kho"], required: true },
      { target: "t_warehouse", line: true, headers: ["kho nhap", "nhap tai kho", "den kho"], required: true },
      { target: "uom", line: true, headers: ["dvt", "don vi tinh"] },
    ],
  },
};

export interface MisaAdaptedDocument {
  source_key: string;
  target_doctype: string;
  document: JsonObject;
  source_rows: number[];
  errors: string[];
}

export interface MisaAdaptResult {
  kind: MisaInventoryKind;
  header_row: number;
  target_doctype: string;
  matched_columns: Record<string, number>;
  missing_required_columns: string[];
  documents: MisaAdaptedDocument[];
}

const MISA_HEADER_MARKERS = ["ma hang", "ngay hach toan", "ngay chung tu", "so chung tu", "so luong", "don gia"];
const MISA_DOC_NO_HEADERS = ["so chung tu", "so phieu", "so ct"];

export function adaptMisaInventoryGrid(input: {
  kind: MisaInventoryKind;
  rows: unknown[][];
  company?: string;
  max_header_scan?: number;
}): MisaAdaptResult {
  const spec = MISA_INVENTORY_SPECS[input.kind];
  const headerIndex = findMisaHeaderRow(input.rows, input.max_header_scan ?? 20);
  if (headerIndex < 0) throw errors.validation("MISA source header row was not found");
  const header = input.rows[headerIndex] ?? [];
  const columns = matchMisaColumns(header, spec.fields);
  const missing = spec.fields
    .filter((field) => field.required && columns[field.target] === undefined)
    .map((field) => field.headers[0]!);
  if (missing.length) {
    return {
      kind: input.kind,
      header_row: headerIndex + 1,
      target_doctype: spec.target_doctype,
      matched_columns: columns,
      missing_required_columns: missing,
      documents: [],
    };
  }

  const docNoColumn = findMisaDocNoColumn(header);
  const grouped = new Map<string, MisaAdaptedDocument>();
  let lastKey = "";
  const body = input.rows.slice(headerIndex + 1);
  for (let offset = 0; offset < body.length; offset += 1) {
    const raw = body[offset] ?? [];
    const sourceRow = headerIndex + 2 + offset;
    const itemColumn = columns.item_code;
    const itemCode = itemColumn === undefined ? "" : String(raw[itemColumn] ?? "").trim();
    const docNo = docNoColumn < 0 ? "" : String(raw[docNoColumn] ?? "").trim();
    if (!itemCode && !docNo) continue;

    const sourceKey = docNo || lastKey || `row-${sourceRow}`;
    lastKey = sourceKey;
    let draft = grouped.get(sourceKey);
    if (!draft) {
      const document: JsonObject = { ...(spec.fixed ? structuredClone(spec.fixed) : {}) };
      if (input.company?.trim()) document.company = input.company.trim();
      for (const field of spec.fields) {
        if (field.line) continue;
        const column = columns[field.target];
        if (column === undefined) continue;
        const value = coerceMisaValue(raw[column], field.type ?? "text");
        if (value !== "") document[field.target] = value;
      }
      draft = { source_key: sourceKey, target_doctype: spec.target_doctype, document, source_rows: [], errors: [] };
      grouped.set(sourceKey, draft);
    }
    draft.source_rows.push(sourceRow);
    if (!itemCode) continue;

    const line: JsonObject = {};
    for (const field of spec.fields) {
      if (!field.line) continue;
      const column = columns[field.target];
      if (column === undefined) continue;
      const value = coerceMisaValue(raw[column], field.type ?? "text");
      if (value !== "") line[field.target] = value;
    }
    if (!isPositiveDecimal(line.qty)) draft.errors.push(`Row ${sourceRow}: quantity must be greater than zero`);
    const currentItems = draft.document.items;
    const items: JsonValue[] = Array.isArray(currentItems) ? currentItems : [];
    items.push(line);
    draft.document.items = items;
  }

  const documents = [...grouped.values()];
  for (const draft of documents) {
    const items = draft.document.items;
    if (!Array.isArray(items) || !items.length) draft.errors.push("Document has no item rows");
    for (const field of spec.fields) {
      if (field.line || !field.required) continue;
      const value = draft.document[field.target];
      if (value === undefined || value === null || value === "") draft.errors.push(`Missing ${field.headers[0]}`);
    }
  }

  return {
    kind: input.kind,
    header_row: headerIndex + 1,
    target_doctype: spec.target_doctype,
    matched_columns: columns,
    missing_required_columns: [],
    documents,
  };
}

export function normalizeSourceHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/\(\*\)/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function findMisaHeaderRow(rows: unknown[][], maxScan = 20): number {
  let best = -1;
  let bestScore = 0;
  for (let index = 0; index < Math.min(rows.length, maxScan); index += 1) {
    const normalized = (rows[index] ?? []).map(normalizeSourceHeader);
    let score = 0;
    for (const marker of MISA_HEADER_MARKERS) {
      if (normalized.some((header) => header === marker || header.includes(marker))) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = index; }
  }
  return bestScore >= 2 ? best : -1;
}

export function parseMigrationDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return isoDate(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return Number.isNaN(date.getTime()) ? "" : isoDate(date);
  }
  const text = String(value).trim();
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (local) return `${local[3]}-${local[2]!.padStart(2, "0")}-${local[1]!.padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

/** Returns a plain-decimal string; migration money/qty must not be rounded through binary float. */
export function parseMigrationDecimal(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value);
  }
  let text = String(value).trim().replace(/\s/g, "");
  if (!text) return "";
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma > dot) text = text.replace(/\./g, "").replace(",", ".");
  else if (dot >= 0) text = text.replace(/,/g, "");
  else text = text.replace(/,/g, "");
  text = text.replace(/[^\d+\-.]/g, "");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return "";
  if (text.startsWith("+")) text = text.slice(1);
  return canonicalDecimal(text);
}

function matchMisaColumns(header: unknown[], fields: MisaFieldSpec[]): Record<string, number> {
  const normalized = header.map(normalizeSourceHeader);
  const output: Record<string, number> = {};
  for (const field of fields) {
    for (const wanted of field.headers) {
      const exact = normalized.findIndex((candidate) => candidate === wanted);
      if (exact >= 0) { output[field.target] = exact; break; }
    }
    if (output[field.target] !== undefined) continue;
    for (const wanted of field.headers) {
      const partial = normalized.findIndex((candidate) => candidate.includes(wanted));
      if (partial >= 0) { output[field.target] = partial; break; }
    }
  }
  return output;
}

function findMisaDocNoColumn(header: unknown[]): number {
  const normalized = header.map(normalizeSourceHeader);
  for (const wanted of MISA_DOC_NO_HEADERS) {
    const index = normalized.findIndex((candidate) => candidate === wanted || candidate.includes(wanted));
    if (index >= 0) return index;
  }
  return -1;
}

function coerceMisaValue(value: unknown, type: MisaFieldType): JsonValue {
  if (type === "date") return parseMigrationDate(value);
  if (type === "decimal") return parseMigrationDecimal(value);
  return String(value ?? "").trim();
}

function isPositiveDecimal(value: JsonValue | undefined): boolean {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value)) return false;
  return !value.startsWith("-") && !/^0(?:\.0+)?$/.test(value);
}

function canonicalDecimal(value: string): string {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [wholeRaw, fractionRaw = ""] = unsigned.split(".");
  const whole = (wholeRaw ?? "0").replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionRaw.replace(/0+$/, "");
  const canonical = fraction ? `${whole}.${fraction}` : whole;
  return negative && canonical !== "0" ? `-${canonical}` : canonical;
}

function isoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function requireText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${label} is required`);
  const text = value.trim();
  if (text.length > max) throw errors.validation(`${label} must be at most ${max} characters`);
  return text;
}
