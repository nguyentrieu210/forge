/**
 * Frappe v16 fieldtypes — grep-verified từ docfield.json trên live 16.29.0.
 * 43 fieldtype AUTHORABLE (hiện trong builder palette / DocField.fieldtype options)
 * + "Long Int" = runtime-only (KHÔNG trong palette) = tổng 44 dòng field-ledger.
 * Nguồn: docs/technical/field-ledger.md
 */

/** 43 fieldtype người dùng tạo được từ builder (DocType Builder palette). */
export type AuthorableFieldtype =
  // A. Layout / break (không lưu value)
  | "Section Break"
  | "Column Break"
  | "Tab Break"
  | "Fold"
  | "Heading"
  // B. Data / text
  | "Data"
  | "Small Text"
  | "Text"
  | "Long Text"
  | "Text Editor"
  | "Code"
  | "HTML Editor"
  | "Markdown Editor"
  | "HTML"
  | "Password"
  | "Read Only"
  // C. Numeric
  | "Int"
  | "Float"
  | "Currency"
  | "Percent"
  | "Rating"
  // D. Date / time
  | "Date"
  | "Datetime"
  | "Time"
  | "Duration"
  // E. Selection / relation
  | "Check"
  | "Select"
  | "Link"
  | "Dynamic Link"
  | "Table"
  | "Table MultiSelect"
  // F. Media / attach / special
  | "Attach"
  | "Attach Image"
  | "Image"
  | "Signature"
  | "Color"
  | "Barcode"
  | "Geolocation"
  | "JSON"
  | "Icon"
  | "Autocomplete"
  | "Phone"
  | "Button";

/** Runtime-only (không authorable): dùng cho khoá lớn/ID nội bộ. */
export type RuntimeFieldtype = "Long Int";

export type Fieldtype = AuthorableFieldtype | RuntimeFieldtype;

/** Fieldtype không lưu giá trị (layout/hiển thị) — renderer bỏ qua khi đọc/ghi doc. */
export const NO_VALUE_FIELDTYPES: ReadonlySet<Fieldtype> = new Set<Fieldtype>([
  "Section Break",
  "Column Break",
  "Tab Break",
  "Fold",
  "Heading",
  "HTML",
  "Button",
]);

export const AUTHORABLE_FIELDTYPES: readonly AuthorableFieldtype[] = [
  "Section Break", "Column Break", "Tab Break", "Fold", "Heading",
  "Data", "Small Text", "Text", "Long Text", "Text Editor", "Code",
  "HTML Editor", "Markdown Editor", "HTML", "Password", "Read Only",
  "Int", "Float", "Currency", "Percent", "Rating",
  "Date", "Datetime", "Time", "Duration",
  "Check", "Select", "Link", "Dynamic Link", "Table", "Table MultiSelect",
  "Attach", "Attach Image", "Image", "Signature", "Color", "Barcode",
  "Geolocation", "JSON", "Icon", "Autocomplete", "Phone", "Button",
] as const;
