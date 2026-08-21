import type { DocumentListDefinition, FieldDef, FieldType } from "../../document-kernel/src/document-list.js";
import type { DocFieldMeta, DocTypeMeta } from "./types.js";

const COMMON: Record<string, FieldDef> = {
  name: { type: "string", source: { column: "name" } },
  status: { type: "string", source: { column: "status" } },
  docstatus: { type: "int", source: { column: "docstatus" } },
  version: { type: "int", source: { column: "version" } },
  owner: { type: "string", source: { column: "owner" } },
  created_at: { type: "date", source: { column: "created_at" } },
  modified_at: { type: "date", source: { column: "modified_at" } },
};

export function metadataToListDefinition(meta: DocTypeMeta): DocumentListDefinition {
  const fields: Record<string, FieldDef> = { ...COMMON };
  for (const field of meta.fields) {
    const type = listType(field);
    if (!type) continue;
    fields[field.fieldname] = {
      type,
      source: { json: `$.${field.fieldname}` },
      // Cờ nhị phân: vắng mặt = 0. Xem `filterExpression` bên document-list.ts.
      ...(field.fieldtype === "Check" ? { flag: true as const } : {}),
    };
  }
  const listFields = meta.fields.filter((field) => field.in_list_view && Object.hasOwn(fields, field.fieldname)).map((field) => field.fieldname);
  const defaultFields = ["name", ...(meta.title_field && Object.hasOwn(fields, meta.title_field) ? [meta.title_field] : []), ...listFields, "status", "docstatus", "version", "modified_at"];
  // Link search phải luôn tìm được bằng TÊN người dùng nhìn thấy. App sinh mã tự động thường
  // có `name = DT-.#####` và chỉ khai `title_field`; nếu tác giả quên lặp lại title trong
  // `search_fields`, dropdown chỉ tìm được bằng mã kỹ thuật và trông như không có bản ghi.
  const searchFields = [...new Set([
    "name",
    ...(meta.title_field ? [meta.title_field] : []),
    ...(meta.search_fields ?? []),
    ...meta.fields.filter((field) => field.search_index).map((field) => field.fieldname),
    // The list search box is a global table search. Include every queryable metadata field so
    // users can find records by group, UOM, note, price, or another visible column—not only code.
    ...meta.fields.filter((field) => listType(field) !== null).map((field) => field.fieldname),
  ])].filter((field) => Object.hasOwn(fields, field));
  // A tree's parent field is structurally filterable — walking the tree IS a
  // filter on it. Requiring the author to also flag it `in_standard_filter` turns
  // a correct tree definition into a "filter field is not allowed" error, so it is
  // included whenever the conventional field exists.
  const treeParentField = `parent_${meta.name.toLowerCase().replace(/ /g, "_")}`;
  const filterFields = [
    /**
     * `name` — khoá chính — LUÔN lọc được.
     *
     * Nó đã có mặt trong `defaultFields`, `searchFields` và `sortFields`; thiếu đúng ở đây,
     * và đó là một lỗ hổng chứ không phải một quyết định: `frappe.client.get_value` hỏi một
     * field của MỘT bản ghi bằng `filters: {name: "…"}`, nên thiếu nó là toàn bộ cơ chế
     * `fetch_from` của nền tảng chết — chọn mặt hàng xong không có gì tự điền.
     *
     * Hỏng theo kiểu tệ nhất: client bọc lời gọi trong `catch` rồi bỏ qua, nên không lỗi
     * nào hiện ra. Người dùng chỉ thấy các ô đứng im và tưởng tính năng chưa được làm.
     */
    "name",
    "docstatus", "status",
    ...(Object.hasOwn(fields, treeParentField) ? [treeParentField] : []),
    /**
     * Every Link is filterable, for the same reason the tree parent is.
     *
     * A Link IS a relationship, and "show me the rows pointing at this record" is the
     * only question it exists to answer. Requiring `in_list_view` as well means the
     * author must show a field as a COLUMN in order to make it queryable — two unrelated
     * decisions welded together, and the way to satisfy it is to crowd the list with
     * columns nobody reads.
     *
     * Found when a Sales Order carried `against_quotation` and "which order came from
     * this quotation?" answered `Filter field is not allowed`. That is not a missing
     * feature the user can see; it is a link that exists in the data and cannot be
     * followed.
     */
    ...meta.fields.filter((field) => field.fieldtype === "Link" || field.fieldtype === "Dynamic Link").map((field) => field.fieldname),
    /**
     * Mọi ô `Check` cũng lọc được, vì cùng một lý do như Link và như trường cha của cây.
     *
     * Một `Check` là một CỜ. Thứ duy nhất người ta làm với cờ là hỏi "còn dùng / đã tắt",
     * "bán được / không bán được" — tức là lọc. Bắt tác giả brief đánh thêm `in_list_view`
     * mới cho lọc nghĩa là muốn lọc thì phải bày cờ đó thành một CỘT trong danh sách.
     *
     * Đo trên 8810 ngày 21/08/2026: `link_filters` khai trong metadata cho MỌI ô chọn Kho là
     * `{"is_group":0,"disabled":0}`, mà `Warehouse.disabled` không có hai cờ kia. Gọi
     * `frappe.desk.search.search_link` với đúng bộ lọc metadata tự khai trả
     * `417 Filter field is not allowed: disabled`. 24 ô chọn Kho (Sales Order Item.warehouse,
     * Stock Entry.source/target_warehouse, Work Order.source/target_warehouse, Purchase Receipt
     * Item.warehouse …) cộng `Sales Order.bank_account` rơi vào đúng chỗ này: danh sách xổ xuống
     * KHÔNG có bản ghi nào, mà không phải vì thiếu dữ liệu. Client còn ÉP `{is_group:0,
     * disabled:0}` cho mọi Link → Warehouse / Item Group (`link-query.ts::applyTreeLeafDefaults`),
     * nên vá ở một nơi khai báo cũng không đủ — phải cho lọc được ở tầng nền.
     */
    ...meta.fields.filter((field) => field.fieldtype === "Check").map((field) => field.fieldname),
    ...meta.fields.filter((field) => field.in_standard_filter || field.in_list_view).map((field) => field.fieldname),
  ].filter((field) => Object.hasOwn(fields, field));
  const sortField = meta.sort_field && Object.hasOwn(fields, meta.sort_field) ? meta.sort_field : "modified_at";
  return {
    doctype: meta.name,
    table: "documents",
    fields,
    defaultFields: [...new Set(defaultFields)].slice(0, 40),
    searchFields: searchFields.length ? searchFields : ["name"],
    filterFields: [...new Set(filterFields)],
    sortFields: [...new Set(["modified_at", "created_at", "name", "docstatus", sortField, ...meta.fields.filter((field) => field.in_list_view).map((field) => field.fieldname)])].filter((field) => Object.hasOwn(fields, field)),
    defaultSort: [{ field: sortField, direction: meta.sort_order === "ASC" ? "asc" : "desc" }],
  };
}

function listType(field: DocFieldMeta): FieldType | null {
  // A Password is never queryable. Filtering on it would let anyone recover the value a
  // character at a time with `like`, which is the same disclosure as reading it.
  if (field.fieldtype === "Password") return null;
  if ([
    "Data", "Small Text", "Text", "Long Text", "Code", "Select", "Link", "Dynamic Link",
    "Attach", "Attach Image", "Currency", "Float", "Percent",
    "Text Editor", "Markdown Editor", "HTML Editor", "Autocomplete", "Read Only",
    "Barcode", "Icon", "Image", "Signature", "Phone", "Color",
  ].includes(field.fieldtype)) return "string";
  if (["Int", "Check", "Duration"].includes(field.fieldtype)) return "int";
  // A fraction from 0 to 1, so it sorts and ranges as a number.
  if (field.fieldtype === "Rating") return "string";
  if (["Date", "Datetime", "Time"].includes(field.fieldtype)) return "date";
  return null;
}
