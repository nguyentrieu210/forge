import type { Actor, JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { deriveO2CStatus } from "./status.js";

// ---------------------------------------------------------------------------
// Narrow, server-owned document list/search for the four O2C doctypes.
//
// One shared compiler drives all four; there is NO per-doctype fork and NO
// generic DocType metadata. Every field, filter, sort key and json_extract path
// comes from a STATIC server-owned definition below — never from the request.
// The request may only reference names that appear in the whitelists. All values
// are bound as parameters; the tenant predicate is injected by the server.
// ---------------------------------------------------------------------------

export type FieldType = "string" | "int" | "date";

/** A field is either a real `documents` column or a static json_extract path. */
export type FieldSource = { column: string } | { json: string };
export interface FieldDef {
  type: FieldType;
  source: FieldSource;
  /**
   * Ô `Check` — CỜ nhị phân, vắng mặt nghĩa là 0.
   *
   * Cần đánh dấu riêng vì `type` của nó cũng là `"int"`, giống `Int` và `Duration`, mà hai loại
   * kia thì vắng mặt KHÁC 0 (không khai số lượng ≠ số lượng bằng 0). Chỉ cờ mới được coi vắng
   * mặt là 0, và chỉ ở vế so sánh của bộ lọc.
   */
  flag?: true;
}

export interface SortSpec {
  field: string;
  direction: "asc" | "desc";
}

export interface DocumentListDefinition {
  doctype: string;
  /** table is fixed; documents live in one physical table keyed by (tenant, doc_key). */
  table: "documents";
  fields: Record<string, FieldDef>;
  /** projection used when the request omits `fields`. */
  defaultFields: string[];
  searchFields: string[];
  filterFields: string[];
  sortFields: string[];
  defaultSort: SortSpec[];
}

export type ListOperator = "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "is_null" | "like";
export interface ListFilter {
  field: string;
  operator: ListOperator;
  value?: JsonValue;
}

export interface DocumentListRequest {
  doctype: string;
  fields?: string[];
  filters?: ListFilter[];
  search?: string;
  sort?: SortSpec[];
  limit?: number;
  cursor?: string | null;
  /**
   * Offset pagination, for Frappe clients that page with `limit_start`.
   *
   * Keyset (`cursor`) is the correct mechanism and stays the default: it cannot
   * skip or duplicate rows when the underlying data shifts between pages. Offset
   * exists only because the Frappe list protocol has no cursor concept, and the
   * two are mutually exclusive so a request can never mix positions.
   */
  offset?: number;
}

export interface DocumentListPage {
  rows: Array<Record<string, JsonValue>>;
  next_cursor: string | null;
  has_more: boolean;
}

export interface DocumentUserPermissionConstraint {
  allow_doctype: string;
  fields: string[];
  allowed_values: string[];
}

export interface DocumentReadScope {
  mode: "all" | "owner" | "shared" | "owner_or_shared";
  actor_user_id: string;
  user_permissions: DocumentUserPermissionConstraint[];
}

// ---- limits / budget --------------------------------------------------------
/**
 * Trần số dòng cho MỘT lần đọc danh sách.
 *
 * 100 → 2000 (2026-08-20). Trần 100 biến "Dòng mỗi trang: Tất cả" ở Desk thành lời nói dối:
 * người dùng chọn xem hết, giao diện xin nhiều hơn, tầng API cắt xuống 100 và KHÔNG báo gì.
 * Cùng cái trần đó khiến mọi lượt quét dữ liệu qua `/api/resource/...` chỉ chạm 100 bản ghi đầu
 * mà tưởng đã quét hết — một lớp lỗi im lặng, không lệnh nào kêu.
 *
 * Vẫn giữ TRẦN chứ không bỏ: một lời gọi lỡ tay kéo cả trăm nghìn dòng qua worker là cách chắc
 * chắn để treo tab và ăn hết thời gian CPU. 2000 phủ mọi danh mục của xưởng (lớn nhất ~3.300
 * phường xã vẫn cần phân trang) mà vẫn là một con số hữu hạn.
 */
export const MAX_LIMIT = 2000;
export const DEFAULT_LIMIT = 25;
const MAX_FILTERS = 20;
const MAX_IN_VALUES = 50;
const MAX_SEARCH_LEN = 128;
const MAX_VALUE_LEN = 256;
const MAX_SORT = 3;
const MAX_FIELDS = 40;
// D1 caps bound parameters per query at 100; keep a safe margin so an in-budget
// request can never build a statement the store rejects (which would 500).
const MAX_BIND_PARAMS = 90;
/** Deep offset paging degrades into a full scan; past this, use a prepared report. */
export const MAX_OFFSET = 10_000;

const SQL_OPERATOR: Record<Exclude<ListOperator, "in" | "is_null">, string> = {
  eq: "=",
  ne: "<>",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
  // Always emitted with ESCAPE '\' so a literal % or _ in the pattern can be
  // escaped by the caller. Unlike `search`, the wildcards here are intentional —
  // the pattern is the caller's, so it is bounded by length but not escaped.
  like: "LIKE",
};

// ---- static definitions -----------------------------------------------------
const col = (column: string, type: FieldType): FieldDef => ({ type, source: { column } });
const json = (path: string, type: FieldType): FieldDef => ({ type, source: { json: path } });

// Columns that physically exist on the `documents` table.
const COMMON_FIELDS: Record<string, FieldDef> = {
  name: col("name", "string"),
  status: col("status", "string"),
  docstatus: col("docstatus", "int"),
  version: col("version", "int"),
  owner: col("owner", "string"),
  created_at: col("created_at", "date"),
  modified_at: col("modified_at", "date"),
};

export const DOCUMENT_LIST_DEFINITIONS: Record<string, DocumentListDefinition> = {
  "Sales Order": {
    doctype: "Sales Order",
    table: "documents",
    fields: {
      ...COMMON_FIELDS,
      customer: json("$.customer", "string"),
      company: json("$.company", "string"),
      currency: json("$.currency", "string"),
      transaction_date: json("$.transaction_date", "date"),
      grand_total: json("$.grand_total", "string"),
    },
    defaultFields: ["name", "customer", "status", "docstatus", "version", "grand_total", "modified_at"],
    searchFields: ["name", "customer"],
    filterFields: ["docstatus", "status", "customer", "company", "currency"],
    sortFields: ["modified_at", "created_at", "transaction_date", "name", "docstatus"],
    defaultSort: [{ field: "modified_at", direction: "desc" }],
  },
  "Delivery Note": {
    doctype: "Delivery Note",
    table: "documents",
    fields: {
      ...COMMON_FIELDS,
      customer: json("$.customer", "string"),
      company: json("$.company", "string"),
      currency: json("$.currency", "string"),
      posting_at: json("$.posting_at", "date"),
      against_sales_order: json("$.against_sales_order", "string"),
    },
    defaultFields: ["name", "customer", "against_sales_order", "status", "docstatus", "version", "modified_at"],
    searchFields: ["name", "customer", "against_sales_order"],
    filterFields: ["docstatus", "status", "customer", "company", "currency", "against_sales_order"],
    sortFields: ["modified_at", "created_at", "posting_at", "name", "docstatus"],
    defaultSort: [{ field: "modified_at", direction: "desc" }],
  },
  "Sales Invoice": {
    doctype: "Sales Invoice",
    table: "documents",
    fields: {
      ...COMMON_FIELDS,
      customer: json("$.customer", "string"),
      company: json("$.company", "string"),
      currency: json("$.currency", "string"),
      posting_at: json("$.posting_at", "date"),
      against_sales_order: json("$.against_sales_order", "string"),
      grand_total: json("$.grand_total", "string"),
    },
    defaultFields: ["name", "customer", "against_sales_order", "status", "docstatus", "version", "grand_total", "modified_at"],
    searchFields: ["name", "customer", "against_sales_order"],
    filterFields: ["docstatus", "status", "customer", "company", "currency", "against_sales_order"],
    sortFields: ["modified_at", "created_at", "posting_at", "name", "docstatus"],
    defaultSort: [{ field: "modified_at", direction: "desc" }],
  },
  "Payment Entry": {
    doctype: "Payment Entry",
    table: "documents",
    fields: {
      ...COMMON_FIELDS,
      party: json("$.party", "string"),
      company: json("$.company", "string"),
      currency: json("$.currency", "string"),
      posting_at: json("$.posting_at", "date"),
      payment_type: json("$.payment_type", "string"),
      party_type: json("$.party_type", "string"),
      paid_amount: json("$.paid_amount", "string"),
    },
    defaultFields: ["name", "party", "payment_type", "status", "docstatus", "version", "paid_amount", "modified_at"],
    searchFields: ["name", "party"],
    filterFields: ["docstatus", "status", "party", "company", "currency", "payment_type", "party_type"],
    sortFields: ["modified_at", "created_at", "posting_at", "name", "docstatus"],
    defaultSort: [{ field: "modified_at", direction: "desc" }],
  },
};

export const SUPPORTED_LIST_DOCTYPES = Object.keys(DOCUMENT_LIST_DEFINITIONS);

/** Resolve a definition from a request body, reading ONLY the doctype. */
export function resolveDefinition(body: JsonObject): DocumentListDefinition {
  const doctype = body.doctype;
  if (typeof doctype !== "string") throw errors.validation("doctype is required");
  const definition = DOCUMENT_LIST_DEFINITIONS[doctype];
  if (!definition) throw errors.validation(`Unsupported doctype: ${doctype}`);
  return definition;
}

// ---- request parsing / whitelist enforcement --------------------------------
export function parseDocumentListRequest(body: JsonObject, definition: DocumentListDefinition): DocumentListRequest {
  const request: DocumentListRequest = { doctype: definition.doctype };

  if (body.fields !== undefined) {
    if (!Array.isArray(body.fields) || body.fields.length > MAX_FIELDS) throw errors.validation("fields must be an array within the field budget");
    const fields = body.fields.map((field, index) => {
      if (typeof field !== "string") throw errors.validation(`fields[${index}] must be a string`);
      // Object.hasOwn (not truthy index access) so inherited names like
      // "constructor"/"toString" can never pass the whitelist.
      if (!Object.hasOwn(definition.fields, field)) throw errors.validation(`Field is not allowed: ${field}`);
      return field;
    });
    request.fields = fields;
  }

  if (body.filters !== undefined) {
    if (!Array.isArray(body.filters) || body.filters.length > MAX_FILTERS) throw errors.validation("filters must be an array within the filter budget");
    request.filters = body.filters.map((entry, index) => parseFilter(entry, index, definition));
  }

  if (body.search !== undefined && body.search !== null && body.search !== "") {
    if (typeof body.search !== "string") throw errors.validation("search must be a string");
    if (body.search.length > MAX_SEARCH_LEN) throw errors.validation("search exceeds the maximum length");
    request.search = body.search;
  }

  if (body.sort !== undefined) {
    if (!Array.isArray(body.sort) || body.sort.length > MAX_SORT) throw errors.validation("sort must be an array within the sort budget");
    request.sort = body.sort.map((entry, index) => parseSort(entry, index, definition));
  }

  if (body.limit !== undefined) {
    const limit = body.limit;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw errors.validation(`limit must be an integer from 1 to ${MAX_LIMIT}`);
    }
    request.limit = limit;
  }

  if (body.cursor !== undefined && body.cursor !== null) {
    if (typeof body.cursor !== "string" || body.cursor.length === 0 || body.cursor.length > 4096) throw errors.validation("cursor is invalid");
    request.cursor = body.cursor;
  }

  if (body.offset !== undefined && body.offset !== null && body.offset !== 0) {
    const offset = body.offset;
    if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
      throw errors.validation(`offset must be an integer from 0 to ${MAX_OFFSET}`);
    }
    // Two positions in one request cannot both be honoured; failing closed is
    // better than silently ignoring one and returning a page the caller did not ask for.
    if (request.cursor) throw errors.validation("offset and cursor cannot be combined");
    request.offset = offset;
  }

  return request;
}

function parseFilter(entry: JsonValue, index: number, definition: DocumentListDefinition): ListFilter {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw errors.validation(`filters[${index}] must be an object`);
  const object = entry as JsonObject;
  const field = object.field;
  if (typeof field !== "string" || !definition.filterFields.includes(field)) throw errors.validation(`Filter field is not allowed: ${String(field)}`);
  const operator = object.operator;
  if (typeof operator !== "string" || !isOperator(operator)) throw errors.validation(`Filter operator is not allowed: ${String(operator)}`);
  const fieldDef = definition.fields[field]!;
  const filter: ListFilter = { field, operator };
  if (operator === "is_null") return filter;
  if (operator === "in") {
    if (!Array.isArray(object.value) || object.value.length === 0 || object.value.length > MAX_IN_VALUES) {
      throw errors.validation(`filters[${index}] "in" requires a non-empty array within the value budget`);
    }
    filter.value = object.value.map((value) => assertScalarType(value, fieldDef.type, index));
    return filter;
  }
  if (operator === "like") {
    // A LIKE against an integer column would force SQLite to coerce every row,
    // defeating the index and returning results the caller cannot predict.
    if (fieldDef.type === "int") throw errors.validation(`filters[${index}] "like" cannot be applied to a numeric field`);
    if (typeof object.value !== "string") throw errors.validation(`filters[${index}] "like" expects a string pattern`);
    if (object.value.length > MAX_VALUE_LEN) throw errors.validation(`filters[${index}] value exceeds the maximum length`);
    filter.value = object.value;
    return filter;
  }
  filter.value = assertScalarType(object.value, fieldDef.type, index);
  return filter;
}

function parseSort(entry: JsonValue, index: number, definition: DocumentListDefinition): SortSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw errors.validation(`sort[${index}] must be an object`);
  const object = entry as JsonObject;
  const field = object.field;
  if (typeof field !== "string" || !definition.sortFields.includes(field)) throw errors.validation(`Sort field is not allowed: ${String(field)}`);
  if (object.direction !== "asc" && object.direction !== "desc") throw errors.validation(`sort[${index}].direction must be asc or desc`);
  return { field, direction: object.direction };
}

function isOperator(value: string): value is ListOperator {
  return value === "eq" || value === "ne" || value === "lt" || value === "lte"
    || value === "gt" || value === "gte" || value === "in" || value === "is_null" || value === "like";
}

/** Values are validated against the field's declared type — never trusted as SQL. */
function assertScalarType(value: JsonValue | undefined, type: FieldType, index: number): JsonValue {
  if (type === "int") {
    if (typeof value !== "number" || !Number.isInteger(value)) throw errors.validation(`filters[${index}] expects an integer value`);
    return value;
  }
  // string / date are compared as text
  if (typeof value !== "string") throw errors.validation(`filters[${index}] expects a string value`);
  if (value.length > MAX_VALUE_LEN) throw errors.validation(`filters[${index}] value exceeds the maximum length`);
  return value;
}

// ---- SQL expression helpers -------------------------------------------------
function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw errors.validation(`Unsafe identifier: ${value}`);
  return `"${value}"`;
}

function quoteJsonPath(path: string): string {
  // Defense in depth: the path is server-owned, but still validate its shape and
  // reject anything that could break out of the single-quoted SQL literal.
  if (!/^\$(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(path)) throw errors.validation(`Unsafe JSON path: ${path}`);
  return `'${path}'`;
}

function fieldDef(definition: DocumentListDefinition, field: string): FieldDef {
  // Object.hasOwn so inherited object keys can never resolve to a field.
  if (!Object.hasOwn(definition.fields, field)) throw errors.validation(`Field is not allowed: ${field}`);
  return definition.fields[field]!;
}

/** Expression for projection / filters — the raw value (may be NULL for json fields). */
function fieldExpression(definition: DocumentListDefinition, field: string): string {
  const def = fieldDef(definition, field);
  if ("column" in def.source) return quoteIdentifier(def.source.column);
  return `json_extract(payload_json, ${quoteJsonPath(def.source.json)})`;
}

/**
 * Expression for ORDER BY / keyset comparison. json fields are wrapped in
 * COALESCE(..., '') so a NULL (absent payload key) becomes a comparable value.
 * Without this, SQLite three-valued logic makes `field < ?`/`field = ?` NULL for
 * NULL rows, so keyset pagination would silently SKIP them. The cursor mirrors
 * this by coalescing null -> '' in encodeCursor, keeping ORDER BY and the keyset
 * predicate in exact agreement. Real columns in sortFields are NOT NULL, so they
 * need no wrapper. (All json sort fields are date/string typed -> '' is a valid
 * sentinel that orders consistently.)
 */
/**
 * Vế trái của một so sánh trong bộ lọc. Với ô `Check`, vắng mặt phải đọc là 0.
 *
 * `json_extract` trả NULL khi bản ghi không có khoá ấy, và trong SQLite `NULL = 0` ra NULL chứ
 * không ra false — dòng bị LOẠI. Mà `Check` phần lớn không khai `default` trong brief, nên bản
 * ghi tạo qua API không hề có khoá `disabled`. Đo trên 8810 ngày 21/08/2026: `Item` có 430 bản
 * ghi, `disabled = 1` đúng 6, nhưng `disabled = 0` chỉ ra 398 — 26 mặt hàng CÒN DÙNG biến mất
 * khỏi mọi ô chọn mặt hàng có `link_filters {"disabled":0}`. `Item Group` mất 4/25,
 * `Bậc diện tích` mất 2/13. Không lỗi nào hiện ra: danh sách vẫn có kết quả, chỉ thiếu.
 *
 * `is_null` KHÔNG đi qua đây — câu hỏi "khoá này có mặt không" phải giữ nguyên nghĩa đen.
 */
function filterExpression(definition: DocumentListDefinition, field: string): string {
  const def = fieldDef(definition, field);
  const raw = fieldExpression(definition, field);
  return def.flag === true && !("column" in def.source) ? `COALESCE(${raw}, 0)` : raw;
}

function sortExpression(definition: DocumentListDefinition, field: string): string {
  const def = fieldDef(definition, field);
  if ("column" in def.source) return quoteIdentifier(def.source.column);
  return `COALESCE(json_extract(payload_json, ${quoteJsonPath(def.source.json)}), '')`;
}

function escapeLike(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Gõ "nhôm" phải tìm ra "NHÔM", và gõ "nhom" cũng phải ra.
 *
 * `LIKE` của SQLite chỉ gập hoa–thường cho 26 chữ cái ASCII. `A↔a` thì gập, còn `Ô↔ô`, `Ạ↔ạ`,
 * `Ứ↔ứ` thì với nó là những ký tự hoàn toàn khác nhau — và không có bước bỏ dấu nào. Đo trên
 * dữ liệu thật ngày 29/7: gõ `NHÔM` ra một kết quả, gõ `nhôm` ra KHÔNG kết quả nào; `cửa`,
 * `CỬA`, `cua` cho ba tập kết quả khác hẳn nhau, không tập nào chứa tập nào.
 *
 * Người Việt gõ telex ra chữ THƯỜNG có dấu — tức cách gõ tự nhiên nhất là cách không ra gì.
 *
 * D1 không có bộ ICU nên không bật được so sánh theo ngôn ngữ. Cách còn lại là tự hạ chữ và
 * bỏ dấu ở CẢ HAI VẾ. Nó không làm chậm thêm: `LIKE '%…%'` vốn đã không dùng được chỉ mục, nên
 * câu truy vấn vẫn quét đúng như trước.
 */
const VIETNAMESE_FOLD: Array<[string, string]> = [
  ["àáảãạăằắẳẵặâầấẩẫậ", "a"],
  ["èéẻẽẹêềếểễệ", "e"],
  ["ìíỉĩị", "i"],
  ["òóỏõọôồốổỗộơờớởỡợ", "o"],
  ["ùúủũụưừứửữự", "u"],
  ["ỳýỷỹỵ", "y"],
  ["đ", "d"],
];

/** Bỏ dấu trong JS — dùng cho từ khoá, phải khớp từng chữ với biểu thức SQL dưới đây. */
function foldVietnamese(value: string): string {
  let folded = value.toLowerCase();
  for (const [accented, plain] of VIETNAMESE_FOLD) {
    for (const character of accented) folded = folded.split(character).join(plain);
  }
  return folded;
}

/**
 * Cùng phép gập đó, viết bằng SQL — nhưng CHỈ cho những chữ cái có trong từ khoá.
 *
 * `lower()` của SQLite cũng chỉ hạ được ASCII, nên chữ hoa có dấu phải thay bằng tay: mỗi chữ
 * hoa có dấu đổi thẳng sang chữ thường không dấu, gộp hai bước làm một.
 *
 * Gập cả bảng chữ cái tiếng Việt là 134 lần `replace` lồng nhau cho MỖI cột — một câu truy vấn
 * hai cột đã hơn 9 KB, và nhân tiếp theo số từ. Không cần thế: tìm "nhom" thì chỉ chữ `o` có
 * biến thể đáng gập, ba chữ còn lại không có dấu bao giờ. Lọc theo chữ cái trong từ khoá cắt
 * câu truy vấn xuống còn một phần năm mà không mất một kết quả nào.
 */
function foldVietnameseSql(expression: string, letters: Set<string>): string {
  let sql = `lower(${expression})`;
  for (const [accented, plain] of VIETNAMESE_FOLD) {
    if (!letters.has(plain)) continue;
    for (const character of accented) {
      sql = `replace(${sql}, '${character}', '${plain}')`;
      const upper = character.toUpperCase();
      if (upper !== character) sql = `replace(${sql}, '${upper}', '${plain}')`;
    }
  }
  return sql;
}

/** Reject (as a 422) before the store would build a statement D1 can't bind.
 *  MAX_FILTERS × MAX_IN_VALUES could otherwise exceed D1's 100-parameter cap. */
function assertParamBudget(params: JsonValue[]): void {
  if (params.length > MAX_BIND_PARAMS) {
    throw errors.validation("Query is too complex; reduce the number of filters or IN values");
  }
}

/** Effective sort = requested (or default) sort, with `name` appended as a unique
 *  tie-breaker so keyset pagination can never duplicate or skip a row. */
export function effectiveSort(definition: DocumentListDefinition, sort?: SortSpec[]): SortSpec[] {
  const base = (sort && sort.length ? sort : definition.defaultSort).map((spec) => {
    if (!definition.sortFields.includes(spec.field)) throw errors.validation(`Sort field is not allowed: ${spec.field}`);
    return { field: spec.field, direction: spec.direction };
  });
  if (!base.some((spec) => spec.field === "name")) base.push({ field: "name", direction: "desc" });
  return base;
}

function sortSignature(sort: SortSpec[]): string {
  return sort.map((spec) => `${spec.field}:${spec.direction}`).join(",");
}

// ---- cursor (opaque, carries the full sort tuple of the last row) -----------
function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeCursor(sort: SortSpec[], row: Record<string, JsonValue>): string {
  // Mirror sortExpression's COALESCE(..., '') so the boundary value equals what
  // ORDER BY/keyset compared: a null sort value becomes '' (never a JSON null).
  const keys = sort.map((spec) => row[spec.field] ?? "");
  return b64urlEncode(JSON.stringify({ v: 1, s: sortSignature(sort), k: keys }));
}

export function decodeCursor(cursor: string, sort: SortSpec[]): JsonValue[] {
  let payload: unknown;
  try {
    payload = JSON.parse(b64urlDecode(cursor));
  } catch {
    throw errors.validation("cursor is invalid");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw errors.validation("cursor is invalid");
  const object = payload as { v?: unknown; s?: unknown; k?: unknown };
  if (object.v !== 1 || object.s !== sortSignature(sort) || !Array.isArray(object.k) || object.k.length !== sort.length) {
    // A cursor is only valid for the exact sort it was issued for.
    throw errors.validation("cursor does not match the requested sort");
  }
  // Each keyset value must be a JSON scalar; a forged cursor carrying an object/
  // array would otherwise reach D1 .bind() and surface as a 500 instead of a 422.
  for (const value of object.k) {
    const type = value === null ? "null" : typeof value;
    if (type !== "null" && type !== "string" && type !== "number" && type !== "boolean") {
      throw errors.validation("cursor is invalid");
    }
  }
  return object.k as JsonValue[];
}

// ---- compiler ---------------------------------------------------------------
export interface CompiledList {
  sql: string;
  params: JsonValue[];
  projection: string[];
  effectiveSort: SortSpec[];
  limit: number;
}
export interface CompiledCount {
  sql: string;
  params: JsonValue[];
}

export type DocumentGroupAggregate = "count" | "sum" | "avg" | "min" | "max";
export interface DocumentGroupProjection {
  field: string;
  alias: string;
  aggregate?: DocumentGroupAggregate;
}
export interface CompiledGroup {
  sql: string;
  params: JsonValue[];
  limit: number;
}
export interface DocumentGroupPage {
  rows: Array<Record<string, JsonValue>>;
  has_more: boolean;
}

/**
 * One authoritative read surface for configurable master data.
 *
 * App fixtures live in `master_records`; operator edits/imports live in `documents`.
 * A list that reads only `documents` makes an installed fixture resolvable by Link
 * validation but invisible in the same Link picker.  Keep the precedence already used
 * by `getMasterRecordData`: a document with the same identity wins, including a disabled
 * or cancelled document acting as a tombstone.  Only active, non-overlapped fixtures are
 * synthesized as ordinary draft documents for the read API.
 *
 * Both branches are bounded by the server-owned tenant and doctype parameters before the
 * outer filters run.  `catalog_documents AS documents` preserves the qualified names used
 * by the permission predicates without weakening their scope.
 */
const CATALOG_DOCUMENTS_CTE = `WITH catalog_documents AS (
  SELECT tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,
         modified_by,amended_from,payload_json
    FROM documents
   WHERE tenant_id=?1 AND doctype=?2
  UNION ALL
  SELECT master.tenant_id,
         master.record_type || ':' || master.name AS doc_key,
         master.record_type AS doctype,
         master.name,
         'Administrator' AS owner,
         0 AS docstatus,
         'Draft' AS status,
         1 AS version,
         master.modified_at AS created_at,
         master.modified_at,
         'app' AS modified_by,
         NULL AS amended_from,
         master.data_json AS payload_json
    FROM master_records AS master
   WHERE master.tenant_id=?1 AND master.record_type=?2 AND master.disabled=0
     AND NOT EXISTS (
       SELECT 1 FROM documents AS overlay
        WHERE overlay.tenant_id=master.tenant_id
          AND overlay.doctype=master.record_type
          AND overlay.name=master.name
     )
)`;

export class DocumentListCompiler {
  compileList(tenantId: string, request: DocumentListRequest, definition: DocumentListDefinition, scope?: DocumentReadScope): CompiledList {
    const params: JsonValue[] = [tenantId, definition.doctype];
    const where = this.selectionPredicate(params, request, definition, scope);

    const sort = effectiveSort(definition, request.sort);
    if (request.cursor) {
      const values = decodeCursor(request.cursor, sort);
      where.push(this.keysetPredicate(params, sort, values, definition));
    }

    const projection = this.projection(definition, request.fields, sort);
    const selectSql = projection.map((field) => `${fieldExpression(definition, field)} AS ${quoteIdentifier(field)}`).join(", ");
    const orderSql = sort.map((spec) => `${sortExpression(definition, spec.field)} ${spec.direction === "asc" ? "ASC" : "DESC"}`).join(", ");

    const limit = request.limit ?? DEFAULT_LIMIT;
    // Fetch one extra row to detect whether a further page exists.
    params.push(limit + 1);
    const limitParam = params.length;
    let tail = `LIMIT ?${limitParam}`;
    if (request.offset) {
      params.push(request.offset);
      tail += ` OFFSET ?${params.length}`;
    }
    assertParamBudget(params);
    const sql = `${CATALOG_DOCUMENTS_CTE}
SELECT ${selectSql} FROM catalog_documents AS documents WHERE ${where.join(" AND ")} ORDER BY ${orderSql} ${tail}`;
    return { sql, params, projection, effectiveSort: sort, limit };
  }

  compileCount(tenantId: string, request: DocumentListRequest, definition: DocumentListDefinition, scope?: DocumentReadScope): CompiledCount {
    // Count uses the SAME selection predicate as list (tenant + doctype + filters +
    // search); the cursor is a pagination position, not a filter, so it is excluded.
    const params: JsonValue[] = [tenantId, definition.doctype];
    const where = this.selectionPredicate(params, request, definition, scope);
    assertParamBudget(params);
    const sql = `${CATALOG_DOCUMENTS_CTE}
SELECT COUNT(*) AS count FROM catalog_documents AS documents WHERE ${where.join(" AND ")}`;
    return { sql, params };
  }


  compileGroup(
    tenantId: string,
    request: DocumentListRequest,
    definition: DocumentListDefinition,
    groupBy: string[],
    projections: DocumentGroupProjection[],
    scope?: DocumentReadScope,
  ): CompiledGroup {
    if (!groupBy.length) throw errors.validation("group_by requires at least one field");
    if (groupBy.length > 4) throw errors.validation("group_by exceeds the field budget");
    if (!projections.length || projections.length > 20) throw errors.validation("group fields exceed the projection budget");

    for (const field of groupBy) {
      if (!Object.hasOwn(definition.fields, field)) throw errors.validation(`Group field is not allowed: ${field}`);
    }

    const aliases = new Set<string>();
    const selected = projections.map((projection) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(projection.alias)) {
        throw errors.validation(`Unsafe group alias: ${projection.alias}`);
      }
      if (aliases.has(projection.alias)) throw errors.validation(`Duplicate group alias: ${projection.alias}`);
      aliases.add(projection.alias);
      if (!Object.hasOwn(definition.fields, projection.field)) {
        throw errors.validation(`Group projection field is not allowed: ${projection.field}`);
      }
      const expression = fieldExpression(definition, projection.field);
      if (!projection.aggregate) {
        if (!groupBy.includes(projection.field)) {
          throw errors.validation(`Non-aggregate projection must be grouped: ${projection.field}`);
        }
        return `${expression} AS ${quoteIdentifier(projection.alias)}`;
      }
      const aggregate = projection.aggregate === "count"
        ? "COUNT(*)"
        : projection.aggregate === "sum"
          ? `COALESCE(SUM(CAST(${expression} AS REAL)),0)`
          : projection.aggregate === "avg"
            ? `AVG(CAST(${expression} AS REAL))`
            : projection.aggregate === "min"
              ? `MIN(${expression})`
              : `MAX(${expression})`;
      return `${aggregate} AS ${quoteIdentifier(projection.alias)}`;
    });

    const params: JsonValue[] = [tenantId, definition.doctype];
    const where = this.selectionPredicate(params, request, definition, scope);
    const limit = request.limit ?? DEFAULT_LIMIT;
    params.push(limit + 1);
    const limitParam = params.length;
    let tail = ` LIMIT ?${limitParam}`;
    if (request.offset) {
      params.push(request.offset);
      tail += ` OFFSET ?${params.length}`;
    }
    assertParamBudget(params);
    const groupSql = groupBy.map((field) => fieldExpression(definition, field)).join(", ");
    const sql = `${CATALOG_DOCUMENTS_CTE}
SELECT ${selected.join(", ")} FROM catalog_documents AS documents
WHERE ${where.join(" AND ")}
GROUP BY ${groupSql}${tail}`;
    return { sql, params, limit };
  }

  private selectionPredicate(params: JsonValue[], request: DocumentListRequest, definition: DocumentListDefinition, scope?: DocumentReadScope): string[] {
    const where = ["tenant_id=?1", "doctype=?2"];
    for (const filter of request.filters ?? []) {
      if (filter.operator === "is_null") {
        where.push(`${fieldExpression(definition, filter.field)} IS NULL`);
        continue;
      }
      const expression = filterExpression(definition, filter.field);
      if (filter.operator === "in") {
        const values = filter.value as JsonValue[];
        const placeholders = values.map((value) => {
          params.push(value);
          return `?${params.length}`;
        });
        where.push(`${expression} IN (${placeholders.join(", ")})`);
        continue;
      }
      params.push(filter.value ?? null);
      const escape = filter.operator === "like" ? " ESCAPE '\\'" : "";
      where.push(`${expression} ${SQL_OPERATOR[filter.operator]} ?${params.length}${escape}`);
    }
    if (request.search) {
      /**
       * Từ khoá tách thành TỪ RỜI, và mọi từ đều phải có mặt — không cần đúng thứ tự.
       *
       * Một chuỗi liền mạch bắt người tìm nhớ đúng thứ tự đã lưu: gõ "ray nhom uc" thì ra,
       * gõ "nhom ray" thì trượt, dù cả hai đều mô tả đúng thứ cần tìm.
       */
      const terms = foldVietnamese(request.search).split(/\s+/).filter(Boolean).slice(0, 6);
      for (const term of terms) {
        params.push(`%${escapeLike(term)}%`);
        const index = params.length;
        const letters = new Set(term);
        const clauses = definition.searchFields.map((field) =>
          `${foldVietnameseSql(fieldExpression(definition, field), letters)} LIKE ?${index} ESCAPE '\\'`);
        where.push(`(${clauses.join(" OR ")})`);
      }
    }
    if (scope) this.appendAccessPredicate(where, params, definition, scope);
    return where;
  }

  private appendAccessPredicate(where: string[], params: JsonValue[], definition: DocumentListDefinition, scope: DocumentReadScope): void {
    const shareClause = () => {
      params.push(scope.actor_user_id);
      const userParam = params.length;
      return `EXISTS (SELECT 1 FROM document_shares ds WHERE ds.tenant_id=documents.tenant_id AND ds.doctype=documents.doctype AND ds.name=documents.name AND ds.user=?${userParam} AND ds.can_read=1)`;
    };
    if (scope.mode === "owner") {
      params.push(scope.actor_user_id); where.push(`owner=?${params.length}`);
    } else if (scope.mode === "shared") {
      where.push(shareClause());
    } else if (scope.mode === "owner_or_shared") {
      params.push(scope.actor_user_id); const ownerParam = params.length;
      where.push(`(owner=?${ownerParam} OR ${shareClause()})`);
    }
    for (const restriction of scope.user_permissions) {
      if (!restriction.allowed_values.length || !restriction.fields.length) throw errors.permission("User permission scope is invalid");
      const placeholders = restriction.allowed_values.map((value) => { params.push(value); return `?${params.length}`; });
      const clauses = restriction.fields.map((field) => {
        if (!Object.hasOwn(definition.fields, field)) throw errors.permission(`User permission field is unavailable: ${field}`);
        return `${fieldExpression(definition, field)} IN (${placeholders.join(", ")})`;
      });
      where.push(`(${clauses.join(" OR ")})`);
    }
  }

  private keysetPredicate(params: JsonValue[], sort: SortSpec[], values: JsonValue[], definition: DocumentListDefinition): string {
    const orTerms: string[] = [];
    for (let i = 0; i < sort.length; i += 1) {
      const andParts: string[] = [];
      for (let j = 0; j < i; j += 1) {
        params.push(values[j] ?? null);
        andParts.push(`${sortExpression(definition, sort[j]!.field)} = ?${params.length}`);
      }
      const comparator = sort[i]!.direction === "asc" ? ">" : "<";
      params.push(values[i] ?? null);
      andParts.push(`${sortExpression(definition, sort[i]!.field)} ${comparator} ?${params.length}`);
      orTerms.push(`(${andParts.join(" AND ")})`);
    }
    return `(${orTerms.join(" OR ")})`;
  }

  private projection(definition: DocumentListDefinition, fields: string[] | undefined, sort: SortSpec[]): string[] {
    const selected = new Set(fields && fields.length ? fields : definition.defaultFields);
    // Always include the fields the UI + cursor rely on.
    for (const required of ["name", "docstatus", "version", "modified_at"]) selected.add(required);
    for (const spec of sort) selected.add(spec.field);
    for (const field of selected) {
      if (!Object.hasOwn(definition.fields, field)) throw errors.validation(`Field is not allowed: ${field}`);
    }
    return [...selected];
  }
}

/**
 * Ba doctype có số CÒN NỢ cộng được bằng MỘT phép cộng trên `payment_ledger_entries`.
 *
 * Giữ đúng một bản khai ở đây để nó không trôi khỏi `d1-store.ts::hydrateDerived` — hai nơi
 * cùng nói một luật rồi lệch nhau là đúng kiểu lỗi đã sinh ra chênh lệch 8 triệu / 5 triệu.
 */
const SO_THANH_TOAN_THEO_DOCTYPE: Record<string, {
  /** Ô gốc để so xem đã trả hết chưa: tổng phải thu / phải trả / thực lĩnh. */
  base: string;
  baseMinor: string;
  fields: readonly string[];
  status: (outstandingMinor: number, baseMinor: number) => string;
}> = {
  "Sales Invoice": {
    base: "grand_total", baseMinor: "grand_total_minor",
    fields: ["outstanding_amount", "outstanding_amount_minor"],
    status: (outstanding, grand) => deriveO2CStatus("Sales Invoice", 1, { outstandingMinor: outstanding, grandTotalMinor: grand }),
  },
  "Purchase Invoice": {
    base: "grand_total", baseMinor: "grand_total_minor",
    fields: ["outstanding_amount", "outstanding_amount_minor"],
    status: (outstanding, grand) => deriveO2CStatus("Purchase Invoice", 1, { outstandingMinor: outstanding, grandTotalMinor: grand }),
  },
  "Salary Slip": {
    base: "net_pay", baseMinor: "net_pay_minor",
    fields: ["outstanding_amount", "outstanding_amount_minor"],
    // Cùng luật với `d1-store.ts::hydrateDerived` cho Salary Slip.
    status: (outstanding, net) => (outstanding <= 0 ? "Paid" : outstanding < net ? "Partly Paid" : "Unpaid"),
  },
};

// ---- store + service --------------------------------------------------------
export interface DocumentListStore {
  list(tenantId: string, request: DocumentListRequest, definition: DocumentListDefinition, scope?: DocumentReadScope): Promise<DocumentListPage>;
  count(tenantId: string, request: DocumentListRequest, definition: DocumentListDefinition, scope?: DocumentReadScope): Promise<number>;
  group(
    tenantId: string,
    request: DocumentListRequest,
    definition: DocumentListDefinition,
    groupBy: string[],
    projections: DocumentGroupProjection[],
    scope?: DocumentReadScope,
  ): Promise<DocumentGroupPage>;
}

export class D1DocumentListStore implements DocumentListStore {
  private readonly reader: D1Database | D1DatabaseSession;

  constructor(db: D1Database, private readonly compiler = new DocumentListCompiler()) {
    // Read from the primary session so a just-committed document is visible on the
    // next list/reload (read-your-writes), matching the command-side reader.
    this.reader = db.withSession?.("first-primary") ?? db;
  }

  async list(tenantId: string, request: DocumentListRequest, definition: DocumentListDefinition, scope?: DocumentReadScope): Promise<DocumentListPage> {
    const compiled = this.compiler.compileList(tenantId, request, definition, scope);
    const result = await this.reader.prepare(compiled.sql).bind(...compiled.params).all<Record<string, JsonValue>>();
    const all = result.results ?? [];
    const hasMore = all.length > compiled.limit;
    const rows = hasMore ? all.slice(0, compiled.limit) : all;
    const last = rows[rows.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(compiled.effectiveSort, last) : null;
    await this.hydrateOutstanding(tenantId, definition.doctype, rows);
    return { rows, next_cursor: nextCursor, has_more: hasMore };
  }

  /**
   * Tính lại số CÒN NỢ và trạng thái thanh toán cho một TRANG danh sách.
   *
   * `payload_json` giữ con số lúc GHI chứng từ. Tiền thu về sau đó nằm ở `payment_ledger_entries`,
   * và `d1-store.ts::hydrateDerived` cộng lại — nhưng nó CHỈ chạy khi đọc MỘT tài liệu. Đường
   * danh sách đọc thẳng cột, nên nó trả con số đông cứng. Đo trên `HD-2026-0017` (hoá đơn 8 triệu,
   * đã thu 3 triệu): mở hồ sơ ra "còn nợ 5.000.000", mà cùng lúc danh sách ghi "8.000.000" và
   * trạng thái vẫn "Unpaid". Hai màn nói hai số, không màn nào báo lỗi.
   *
   * Không lặp từng dòng: MỘT câu truy vấn gộp cho cả trang (chia lô theo trần tham số của D1).
   * Chỉ ba doctype này suy ra từ sổ thanh toán bằng một phép cộng — đủ rẻ để làm đúng ở đây.
   *
   * CHƯA khép: `Sales Order`/`Purchase Order` (%giao, %xuất hoá đơn), `Work Order`
   * (`produced_qty`), `Asset` (khấu hao), `Project` (giờ/chi phí thực), `Bank Transaction`
   * (đã đối chiếu) vẫn đông cứng trên đường danh sách — chúng cần cộng theo TỪNG DÒNG hàng,
   * không gộp được bằng một câu như ở đây.
   */
  private async hydrateOutstanding(
    tenantId: string, doctype: string, rows: Array<Record<string, JsonValue>>,
  ): Promise<void> {
    const luat = SO_THANH_TOAN_THEO_DOCTYPE[doctype];
    if (!luat || rows.length === 0) return;
    // Chỉ trả giá mở rộng khi trang này THỰC SỰ mang một trong các ô suy ra.
    const mau = rows[0]!;
    const canTinh = luat.fields.some((f) => Object.hasOwn(mau, f)) || Object.hasOwn(mau, "status");
    if (!canTinh) return;

    const names = rows.map((row) => String(row.name ?? "")).filter(Boolean);
    if (names.length === 0) return;
    const tong = new Map<string, { outstanding: number; base: number; docstatus: number; scale: number }>();
    // D1 chặn ở 100 tham số cho mỗi câu; chia lô để một trang đầy không bao giờ dựng câu bị từ chối.
    for (let i = 0; i < names.length; i += 80) {
      const lo = names.slice(i, i + 80);
      const cho = lo.map((_, k) => `?${k + 3}`).join(", ");
      const result = await this.reader.prepare(
        `SELECT d.name AS name, d.docstatus AS docstatus,
                json_extract(d.payload_json, '$.currency_scale') AS currency_scale,
                json_extract(d.payload_json, ${quoteJsonPath(`$.${luat.baseMinor}`)}) AS base_minor,
                json_extract(d.payload_json, ${quoteJsonPath(`$.${luat.base}`)}) AS base_text,
                COALESCE((SELECT SUM(p.amount_minor) FROM payment_ledger_entries p
                          WHERE p.tenant_id = d.tenant_id
                            AND p.against_voucher_type = d.doctype
                            AND p.against_voucher_no = d.name), 0) AS outstanding_minor
         FROM documents d
         WHERE d.tenant_id = ?1 AND d.doctype = ?2 AND d.name IN (${cho})`,
      ).bind(tenantId, doctype, ...lo).all<Record<string, JsonValue>>();
      for (const row of result.results ?? []) {
        const scale = typeof row.currency_scale === "number" ? row.currency_scale : 2;
        const base = typeof row.base_minor === "number"
          ? row.base_minor
          : toScaledInt(String(row.base_text ?? "0"), scale);
        tong.set(String(row.name), {
          outstanding: Number(row.outstanding_minor ?? 0),
          base,
          docstatus: Number(row.docstatus ?? 0),
          scale,
        });
      }
    }

    for (const row of rows) {
      const so = tong.get(String(row.name ?? ""));
      if (!so) continue;
      if (Object.hasOwn(row, "outstanding_amount_minor")) row.outstanding_amount_minor = so.outstanding;
      if (Object.hasOwn(row, "outstanding_amount")) row.outstanding_amount = fromScaledInt(so.outstanding, so.scale);
      if (Object.hasOwn(row, "status") && so.docstatus === 1) {
        row.status = luat.status(so.outstanding, so.base);
      }
    }
  }

  async count(tenantId: string, request: DocumentListRequest, definition: DocumentListDefinition, scope?: DocumentReadScope): Promise<number> {
    const compiled = this.compiler.compileCount(tenantId, request, definition, scope);
    const row = await this.reader.prepare(compiled.sql).bind(...compiled.params).first<{ count: number }>();
    return Number(row?.count ?? 0);
  }

  async group(
    tenantId: string, request: DocumentListRequest, definition: DocumentListDefinition,
    groupBy: string[], projections: DocumentGroupProjection[], scope?: DocumentReadScope,
  ): Promise<DocumentGroupPage> {
    const compiled = this.compiler.compileGroup(tenantId, request, definition, groupBy, projections, scope);
    const result = await this.reader.prepare(compiled.sql).bind(...compiled.params).all<Record<string, JsonValue>>();
    const all = result.results ?? [];
    return {
      rows: all.length > compiled.limit ? all.slice(0, compiled.limit) : all,
      has_more: all.length > compiled.limit,
    };
  }
}

/** Structural read-authorizer (satisfied by policy.PermissionService) so this
 *  package need not depend on the policy package. */
export interface ReadAuthorizer {
  assert(request: { actor: Actor; doctype: string; action: "read"; tenantId?: string }): void | Promise<void>;
  getReadScope?(actor: Actor, tenantId: string, doctype: string): DocumentReadScope | Promise<DocumentReadScope>;
}

export interface DocumentListDefinitionResolver {
  resolve(tenantId: string, body: JsonObject, actor?: Actor): DocumentListDefinition | Promise<DocumentListDefinition>;
}

export class StaticDocumentListDefinitionResolver implements DocumentListDefinitionResolver {
  resolve(_tenantId: string, body: JsonObject, _actor?: Actor): DocumentListDefinition { return resolveDefinition(body); }
}

/**
 * Parses, authorizes (doctype-level read, BEFORE touching data so 403 vs a data
 * result can never be an existence oracle), then executes list/count.
 */
export class DocumentListService {
  constructor(
    private readonly store: DocumentListStore,
    private readonly authorizer: ReadAuthorizer,
    private readonly definitions: DocumentListDefinitionResolver = new StaticDocumentListDefinitionResolver(),
  ) {}

  async list(actor: Actor, tenantId: string, body: JsonObject): Promise<DocumentListPage> {
    const definition = await this.definitions.resolve(tenantId, body, actor);
    const scope = this.authorizer.getReadScope
      ? await this.authorizer.getReadScope(actor, tenantId, definition.doctype)
      : (await this.authorizer.assert({ actor, doctype: definition.doctype, action: "read", tenantId }), undefined);
    const request = parseDocumentListRequest(body, definition);
    return this.store.list(tenantId, request, definition, scope);
  }

  async count(actor: Actor, tenantId: string, body: JsonObject): Promise<{ count: number }> {
    const definition = await this.definitions.resolve(tenantId, body, actor);
    const scope = this.authorizer.getReadScope
      ? await this.authorizer.getReadScope(actor, tenantId, definition.doctype)
      : (await this.authorizer.assert({ actor, doctype: definition.doctype, action: "read", tenantId }), undefined);
    const request = parseDocumentListRequest(body, definition);
    return { count: await this.store.count(tenantId, request, definition, scope) };
  }
  async group(
    actor: Actor,
    tenantId: string,
    body: JsonObject,
    groupBy: string[],
    projections: DocumentGroupProjection[],
  ): Promise<DocumentGroupPage> {
    const definition = await this.definitions.resolve(tenantId, body, actor);
    const scope = this.authorizer.getReadScope
      ? await this.authorizer.getReadScope(actor, tenantId, definition.doctype)
      : (await this.authorizer.assert({ actor, doctype: definition.doctype, action: "read", tenantId }), undefined);
    const request = parseDocumentListRequest(body, definition);
    return this.store.group(tenantId, request, definition, groupBy, projections, scope);
  }

}
