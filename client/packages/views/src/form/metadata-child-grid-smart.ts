import { resolveField, type Doc, type DocField, type DocTypeMeta } from "@metaforge/core";

export interface SmartGridLayout {
  widths: Record<string, number>;
  order: string[];
  hidden: string[];
  pinned: string[];
  labels: Record<string, string>;
}

export interface SmartGridDeletedRow {
  row: Doc;
  index: number;
}

export interface SmartGridCellEdit {
  rowIndex: number;
  fieldname: string;
  value: unknown;
}

export interface SmartGridPastePlan {
  matrix: string[][];
  columnIndexes: number[];
  headerAware: boolean;
}

export type SmartGridFieldOverrides = Record<string, Record<string, Partial<DocField>>>;

export const EMPTY_SMART_GRID_LAYOUT: SmartGridLayout = {
  widths: {},
  order: [],
  hidden: [],
  pinned: [],
  labels: {},
};

const NUMERIC_TYPES = new Set(["Currency", "Float", "Int", "Percent", "Duration", "Rating"]);
const LAYOUT_TYPES = new Set([
  "Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button",
  "Table", "Table MultiSelect",
]);

export function smartGridRowKey(row: Doc, index: number): string {
  return String(row.name ?? `row-${index}`);
}

export function smartGridField(
  field: DocField,
  row: Doc,
  rowIndex: number,
  overrides: SmartGridFieldOverrides,
): DocField {
  const override = overrides[smartGridRowKey(row, rowIndex)]?.[field.fieldname];
  return override ? ({ ...field, ...override } as DocField) : field;
}

export function resolveSmartGridCell(
  field: DocField,
  meta: DocTypeMeta,
  row: Doc,
  rowIndex: number,
  parentDoc: Record<string, unknown> | undefined,
  roles: string[] | undefined,
  overrides: SmartGridFieldOverrides,
) {
  const effective = smartGridField(field, row, rowIndex, overrides);
  const gridField: DocField = effective.list_only ? { ...effective, list_only: 0 } : effective;
  const internal = effective.surface === "internal"
    || effective.editMode === "hidden"
    || LAYOUT_TYPES.has(effective.fieldtype);
  const resolved = resolveField(gridField, meta, {
    doc: row,
    parent: parentDoc,
    roles,
    assumeWritable: true,
  });
  return {
    field: gridField,
    visible: !internal && Boolean(resolved.visible),
    readOnly: Boolean(resolved.readOnly),
    masked: Boolean(resolved.masked),
  };
}

/**
 * Only columns applicable to at least one current row are rendered. An empty grid uses a probe row
 * so parent-dependent fields can still become reachable before the first row exists.
 */
export function applicableSmartGridColumns(
  columns: readonly DocField[],
  meta: DocTypeMeta,
  rows: readonly Doc[],
  parentDoc: Record<string, unknown> | undefined,
  roles: string[] | undefined,
  overrides: SmartGridFieldOverrides,
): DocField[] {
  const probes: Doc[] = rows.length
    ? [...rows]
    : [{ name: "__smart-grid-probe__", doctype: meta.name } as Doc];
  return columns.filter((field) => {
    if (field.surface === "internal" || field.editMode === "hidden" || LAYOUT_TYPES.has(field.fieldtype)) return false;
    return probes.some((row, rowIndex) => resolveSmartGridCell(
      field,
      meta,
      row,
      rowIndex,
      parentDoc,
      roles,
      overrides,
    ).visible);
  });
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Layout persistence is invalidated when the declared presentation/schema changes. */
export function smartGridLayoutKey(meta: DocTypeMeta, mode: "compact" | "full", columns: readonly DocField[]): string {
  const view = mode === "full" ? meta.viewPolicy?.form : meta.viewPolicy?.quickEntry ?? meta.viewPolicy?.form;
  const explicitVersion = String(view?.version ?? view?.policyVersion ?? view?.schemaVersion ?? "");
  const signature = [
    explicitVersion,
    ...columns.map((field) => [
      field.fieldname,
      field.fieldtype,
      field.surface ?? "",
      field.hidden ?? "",
      field.read_only ?? "",
      field.depends_on ?? "",
      field.read_only_depends_on ?? "",
    ].join(":")),
  ].join("|");
  return `mf-metadata-grid:${meta.name}:${mode}:${hashString(signature)}`;
}

function sanitizeLayout(value: unknown): SmartGridLayout {
  if (!value || typeof value !== "object") return { ...EMPTY_SMART_GRID_LAYOUT, widths: {}, order: [], hidden: [], pinned: [], labels: {} };
  const input = value as Partial<SmartGridLayout>;
  const widths = Object.fromEntries(Object.entries(input.widths ?? {})
    .filter(([, width]) => Number.isFinite(Number(width)))
    .map(([fieldname, width]) => [fieldname, Math.max(5, Math.min(48, Number(width)))])
  );
  const labels = Object.fromEntries(Object.entries(input.labels ?? {})
    .filter(([, label]) => typeof label === "string" && label.trim())
    .map(([fieldname, label]) => [fieldname, String(label).trim()]));
  const strings = (items: unknown) => Array.isArray(items) ? items.map(String).filter(Boolean) : [];
  return {
    widths,
    order: strings(input.order),
    hidden: strings(input.hidden),
    pinned: strings(input.pinned),
    labels,
  };
}

export function loadSmartGridLayout(key: string, storage?: Pick<Storage, "getItem">): SmartGridLayout {
  try {
    const source = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
    const value = source?.getItem(key);
    return value ? sanitizeLayout(JSON.parse(value)) : sanitizeLayout(null);
  } catch {
    return sanitizeLayout(null);
  }
}

export function saveSmartGridLayout(
  key: string,
  layout: SmartGridLayout,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    const target = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
    target?.setItem(key, JSON.stringify(sanitizeLayout(layout)));
  } catch {
    // Layout persistence is optional UX. Storage failures must never break document editing.
  }
}

export function orderedSmartGridColumns(
  columns: readonly DocField[],
  layout: SmartGridLayout,
  identityFieldname?: string,
): DocField[] {
  const byName = new Map(columns.map((field) => [field.fieldname, field]));
  const ordered = [
    ...layout.order.map((fieldname) => byName.get(fieldname)).filter((field): field is DocField => Boolean(field)),
    ...columns.filter((field) => !layout.order.includes(field.fieldname)),
  ];
  return ordered.filter((field) => field.fieldname === identityFieldname || !layout.hidden.includes(field.fieldname));
}

export function reorderSmartGridField(
  fieldnames: readonly string[],
  fieldname: string,
  direction: -1 | 1,
): string[] {
  const next = [...fieldnames];
  const index = next.indexOf(fieldname);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Move selected rows as a stable block without reordering selected rows relative to each other. */
export function moveSmartGridRows(rows: readonly Doc[], selected: ReadonlySet<string>, direction: -1 | 1): Doc[] {
  const next = [...rows];
  if (direction < 0) {
    for (let index = 1; index < next.length; index += 1) {
      const key = smartGridRowKey(next[index], index);
      const previousKey = smartGridRowKey(next[index - 1], index - 1);
      if (selected.has(key) && !selected.has(previousKey)) [next[index - 1], next[index]] = [next[index], next[index - 1]];
    }
  } else {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      const key = smartGridRowKey(next[index], index);
      const nextKey = smartGridRowKey(next[index + 1], index + 1);
      if (selected.has(key) && !selected.has(nextKey)) [next[index], next[index + 1]] = [next[index + 1], next[index]];
    }
  }
  return next;
}

export function restoreSmartGridRows(rows: readonly Doc[], deleted: readonly SmartGridDeletedRow[]): Doc[] {
  const next = [...rows];
  for (const entry of [...deleted].sort((left, right) => left.index - right.index)) {
    next.splice(Math.max(0, Math.min(entry.index, next.length)), 0, entry.row);
  }
  return next;
}

/** RFC4180-style quoting, but tab-separated to match Excel/Sheets clipboard output. */
export function parseSmartGridTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === "\t") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  rows.push(row);
  while (rows.length > 1 && rows.at(-1)?.every((value) => value === "")) rows.pop();
  return rows;
}

function normalizedHeader(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase("vi").replace(/\s+/g, " ");
}

export function planSmartGridPaste(text: string, columns: readonly DocField[], startColumn: number): SmartGridPastePlan {
  const matrix = parseSmartGridTsv(text);
  const first = matrix[0] ?? [];
  const lookup = new Map<string, number>();
  columns.forEach((field, index) => {
    lookup.set(normalizedHeader(field.fieldname), index);
    lookup.set(normalizedHeader(field.label || field.fieldname), index);
  });
  const headerIndexes = first.map((header) => lookup.get(normalizedHeader(header)) ?? -1);
  const nonBlankHeaders = first.filter((value) => value.trim()).length;
  const recognized = headerIndexes.filter((index) => index >= 0).length;
  const headerAware = nonBlankHeaders > 0 && recognized === nonBlankHeaders;
  return {
    matrix: headerAware ? matrix.slice(1) : matrix,
    columnIndexes: headerAware
      ? headerIndexes
      : first.map((_, offset) => startColumn + offset),
    headerAware,
  };
}

function normalizeNumericClipboard(text: string): string {
  let value = text.replace(/[\s\u00a0]/g, "").replace(/[^\d,.-]/g, "");
  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    value = value.split(thousands).join("").replace(decimal, ".");
    return value;
  }
  if (comma >= 0) {
    if (/^-?\d{1,3}(,\d{3})+$/.test(value)) return value.replace(/,/g, "");
    return value.replace(/,/g, ".");
  }
  if ((value.match(/\./g) ?? []).length > 1 && /^-?\d{1,3}(\.\d{3})+$/.test(value)) return value.replace(/\./g, "");
  if (/^-?\d{1,3}\.\d{3}$/.test(value)) return value.replace(".", "");
  return value;
}

export function parseSmartGridPastedValue(field: DocField, raw: string): unknown {
  const text = raw.trim();
  if (!text) return undefined;
  if (field.fieldtype === "Check") {
    const normalized = normalizedHeader(text);
    if (["1", "true", "yes", "y", "x", "có", "co"].includes(normalized)) return 1;
    if (["0", "false", "no", "n", "không", "khong"].includes(normalized)) return 0;
    return undefined;
  }
  if (NUMERIC_TYPES.has(field.fieldtype)) {
    const value = Number(normalizeNumericClipboard(text));
    if (!Number.isFinite(value)) return undefined;
    return field.fieldtype === "Int" ? Math.trunc(value) : value;
  }
  return text;
}
