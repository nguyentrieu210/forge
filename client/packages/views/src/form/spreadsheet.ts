import {
  getNumberFormatInfo,
  validateFieldValue,
  type DocField,
  type FieldValidationIssue,
} from "@metaforge/core";

const NUMERIC_TYPES = new Set(["Int", "Long Int", "Float", "Currency", "Percent"]);

export interface SpreadsheetCellResult {
  ok: boolean;
  empty: boolean;
  value?: unknown;
  issue?: FieldValidationIssue;
  reason?: string;
}

export interface SpreadsheetColumnPlan {
  fields: Array<DocField | undefined>;
  dataStart: number;
  headerMapped: boolean;
}

/** Parse TSV copied by Excel/Sheets, including quoted tabs/newlines and escaped quotes. */
export function parseSpreadsheetClipboard(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]!;
    if (char === '"') {
      if (quoted && raw[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
      continue;
    }
    if (!quoted && char === "\t") { row.push(cell); cell = ""; continue; }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && raw[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = ""; continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "" || !rows.length) rows.push(row);
  while (rows.length > 1 && rows.at(-1)?.every((entry) => entry === "")) rows.pop();
  return rows;
}

function key(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("vi")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * If the first pasted row looks like field labels/names, map by metadata instead of visual order.
 * Otherwise keep ordinary Excel positional paste starting at the currently focused column.
 */
export function planSpreadsheetColumns(columns: DocField[], firstRow: string[] | undefined, startColumn: number): SpreadsheetColumnPlan {
  if (!firstRow?.length) return { fields: columns.slice(startColumn), dataStart: 0, headerMapped: false };
  const byKey = new Map<string, DocField>();
  for (const field of columns) {
    for (const candidate of [field.fieldname, field.label]) {
      const normalized = key(candidate);
      if (normalized && !byKey.has(normalized)) byKey.set(normalized, field);
    }
  }
  const mapped = firstRow.map((entry) => byKey.get(key(entry)));
  const nonEmpty = firstRow.filter((entry) => entry.trim()).length;
  const matches = mapped.filter(Boolean).length;
  const threshold = nonEmpty <= 1 ? 1 : 2;
  if (nonEmpty > 0 && matches >= threshold) return { fields: mapped, dataStart: 1, headerMapped: true };
  return { fields: columns.slice(startColumn), dataStart: 0, headerMapped: false };
}

function normalizedNumber(raw: string, numberFormat?: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const negativeByParentheses = /^\(.*\)$/.test(trimmed);
  let value = trimmed.replace(/[()\s\u00a0']/g, "").replace(/[^\d,.*+\-]/g, "");
  value = value.replace(/\*/g, "");
  if (!value || value === "+" || value === "-") return undefined;
  const info = getNumberFormatInfo(numberFormat);
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const group = decimal === "," ? "." : ",";
    value = value.split(group).join("").replace(decimal, ".");
  } else {
    const separator = lastComma >= 0 ? "," : lastDot >= 0 ? "." : undefined;
    if (separator) {
      const occurrences = value.split(separator).length - 1;
      const last = value.lastIndexOf(separator);
      const after = value.slice(last + 1).replace(/\D/g, "");
      const treatAsGroup = separator === info.group && separator !== info.decimal && after.length === 3;
      if (occurrences > 1 && value.split(separator).slice(1).every((group) => /^\d{3}$/.test(group))) value = value.split(separator).join("");
      else if (treatAsGroup) value = value.split(separator).join("");
      else value = value.slice(0, last).split(separator).join("") + "." + value.slice(last + 1);
    }
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return negativeByParentheses ? -Math.abs(parsed) : parsed;
}

/** Parse + validate one pasted cell using canonical DocField rules. Blank cells are explicit skips. */
export function parseSpreadsheetCell(field: DocField, raw: string, numberFormat?: string): SpreadsheetCellResult {
  const text = raw.trim();
  if (!text) return { ok: true, empty: true };
  let value: unknown = text;
  if (field.fieldtype === "Check") {
    const normalized = text.toLocaleLowerCase("vi");
    if (["1", "true", "yes", "y", "x", "có", "co"].includes(normalized)) value = 1;
    else if (["0", "false", "no", "n", "không", "khong"].includes(normalized)) value = 0;
    else return { ok: false, empty: false, reason: "Giá trị Có/Không không hợp lệ" };
  } else if (NUMERIC_TYPES.has(field.fieldtype)) {
    const parsed = normalizedNumber(text, numberFormat);
    if (parsed === undefined) return { ok: false, empty: false, reason: "Không đọc được số" };
    value = parsed;
  }
  const issue = validateFieldValue(field, value, false);
  return issue ? { ok: false, empty: false, value, issue } : { ok: true, empty: false, value };
}

export function spreadsheetIssueMessage(result: SpreadsheetCellResult): string {
  if (result.reason) return result.reason;
  switch (result.issue?.code) {
    case "too_long": return `Vượt ${result.issue.limit ?? "giới hạn"} ký tự`;
    case "invalid_select": return "Không nằm trong danh sách cho phép";
    case "integer": return "Phải là số nguyên";
    case "numeric": return "Phải là số";
    case "negative": return "Không được là số âm";
    case "date": return "Ngày phải có dạng YYYY-MM-DD";
    case "datetime": return "Ngày giờ không hợp lệ";
    case "time": return "Giờ không hợp lệ";
    case "phone": return "Số điện thoại không hợp lệ";
    case "color": return "Màu không hợp lệ";
    case "check": return "Giá trị Có/Không không hợp lệ";
    default: return "Giá trị không hợp lệ";
  }
}

export function spreadsheetCellEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}
