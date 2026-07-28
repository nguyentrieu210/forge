/**
 * selfcheck — kiểm chứng LOGIC THUẦN của engine, KHÔNG cần site Frappe.
 * Chạy: pnpm --filter @metaforge/demo run selfcheck
 * Đây là phần "test chạy được ngay"; smoke test gọi Frappe thật ở smoke.ts (cần site cô lập).
 */
import { strict as assert } from "node:assert";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BRANDS, isBrandMode, resolveIcon } from "@metaforge/shell";
import {
  mapError,
  AUTHORABLE_FIELDTYPES,
  resolveMeta,
  resolveField,
  evalDependsOn,
  toTruthy,
  normalizeMeta,
  fieldTypeStatus,
  MetaValidationError,
  serializeCreateDocument,
  serializeUpdatePatch,
  buildLinkFilters,
  parseFetchFrom,
  collectFetchFrom,
  makeTranslator,
  sanitizeUrl,
  sanitizeImageUrl,
  formatMessage,
  formatNumber,
  formatCurrency,
  formatDate,
  formatDuration,
  parseDuration,
  makeLocaleFormat,
  validateManifest,
  resolveHomeRoute,
  navGroups,
  resolveNavPath,
  mergeLocale,
  type AppManifest,
  type DocField,
  type DocTypeMeta,
  type Doc,
} from "@metaforge/core";
import { ControlRegistry, createDefaultRegistry, DateControl, AttachControl, GeolocationControl, LinkControl } from "@metaforge/controls";
import {
  FormView, groupLayout, resolveFormFieldWidth, ChildGrid, createFullRegistry, KanbanView, TreeView, ReportView, PrintView, DashboardView, CalendarView, GanttView, type TreeNodeItem,
  deriveColumns, applyClientQuery, buildServerQuery, countQuery, deriveStandardFilters, deriveSearchFields, statusVariant, emptyListState,
  applyColumnOrder, columnPreferenceKey, hasCustomColumnPreferences, moveColumn, normalizeColumnPreferences, stableColumnPreferenceScope,
  resolveFormActions, resolveWorkflowActions, editableCodeField, suggestEditableCode, type FormActionCtx,
} from "@metaforge/views";
import { History, blankDocType, newField, addField, updateField, moveField, removeField, DocTypeBuilder, diffMeta, metaEqual, hasChanges, diffPermissions, permRuleKey, validateDraft, openDraft, draftStatus, serializeDocTypeForSave, roundTripLocal, planCustomization, serializeWorkflow, validateWorkflow, workflowMasters, serializePrintFormat, validatePrintFormat, printHtml, serializeDashboard, validateDashboard } from "@metaforge/builder";
import { toUiPhase, createScopeKey } from "@metaforge/adapter-frappe";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("selfcheck — logic thuần (no network):");

// 1. Fieldtype đúng 43 authorable (verified live docfield.json).
check("theme: 13 bảng màu, gồm Sakura và 4 gradient", () => {
  assert.equal(BRANDS.length, 13);
  assert.equal(isBrandMode("sakura"), true);
  assert.equal(isBrandMode("unknown"), false);
  assert.equal(BRANDS.filter((brand) => brand.swatch.includes("gradient")).length, 4);
});

check("43 authorable fieldtypes", () => {
  assert.equal(AUTHORABLE_FIELDTYPES.length, 43);
});

// 2. Registry rỗng → thiếu đủ 43 (chưa nạp control nào).
check("ControlRegistry.missing() = 43 khi rỗng", () => {
  assert.equal(new ControlRegistry().missing().length, 43);
});

// 3. mapError: TimestampMismatch (417) = conflict, PHÂN BIỆT với validation (417).
check("417 TimestampMismatch → conflict (không phải validation)", () => {
  const conflict = mapError({ exc_type: "TimestampMismatchError", httpStatus: 417 });
  const validation = mapError({ exc_type: "ValidationError", httpStatus: 417 });
  assert.equal(conflict.kind, "conflict");
  assert.equal(validation.kind, "validation");
  assert.notEqual(conflict.message, validation.message);
});

// 4. mapError: HTTP fallback + P0-10 (KHÔNG nhầm error thường thành network).
check("403→permission · 404→not_found · {}→unknown (KHÔNG network) · ERR_NETWORK→network", () => {
  assert.equal(mapError({ httpStatus: 403 }).kind, "permission");
  assert.equal(mapError({ httpStatus: 404 }).kind, "not_found");
  assert.equal(mapError({}).kind, "unknown"); // P0-10: no-info ≠ network
  assert.equal(mapError({ code: "ERR_NETWORK" }).kind, "network");
  assert.equal(mapError(new Error("Network Error")).kind, "network");
});

// 4b. mapError: đào lỗi axios-nested + parse exception→exc_type + _server_messages→field errors.
check("axios-nested + exception-parse + _server_messages (P0-10)", () => {
  // status trong response, exc_type trong response.data
  assert.equal(mapError({ response: { status: 403, data: { exc_type: "PermissionError" } } }).kind, "permission");
  // exc_type vắng, parse từ chuỗi exception
  assert.equal(mapError({ response: { status: 417, data: { exception: "frappe.exceptions.TimestampMismatchError: x" } } }).kind, "conflict");
  // _server_messages (double-encoded) → message + fieldErrors
  const sm = JSON.stringify([JSON.stringify({ message: "<b>Thiếu Chủ đề</b>", fieldname: "subject" })]);
  const ve = mapError({ response: { status: 417, data: { exc_type: "ValidationError", _server_messages: sm } } });
  assert.equal(ve.kind, "validation");
  assert.equal(ve.message, "Thiếu Chủ đề"); // HTML stripped, dùng message server
  assert.equal(ve.fieldErrors?.subject, "Thiếu Chủ đề");
});

// 4c. safe evaluator (P0-06): allowlist đúng + hàm/định danh cấm → false + KHÔNG chạm global.
check("safeEval depends_on: comparisons/bool/field/in_list + invalid→false + no-global", () => {
  const d = { status: "Open", priority: "High", qty: 5, items: [1, 2], disabled: 0 };
  assert.equal(evalDependsOn('eval:doc.status=="Open"', d), true);
  assert.equal(evalDependsOn('eval:doc.status=="Closed"', d), false);
  assert.equal(evalDependsOn('eval:doc.status=="Open" && doc.priority=="High"', d), true);
  assert.equal(evalDependsOn('eval:doc.qty > 3', d), true);
  assert.equal(evalDependsOn("eval:!doc.disabled", d), true);
  assert.equal(evalDependsOn("eval:doc.items.length", d), true);
  assert.equal(evalDependsOn('eval:in_list(["Open","Closed"], doc.status)', d), true);
  assert.equal(evalDependsOn("priority", d), true); // shorthand field truthy
  // M2: số âm / unary minus (trước đây ParseError → false SAI)
  const n = { balance: -500, qty: 5 };
  assert.equal(evalDependsOn("eval:doc.balance < -1000", n), false, "balance(-500) < -1000 → false");
  assert.equal(evalDependsOn("eval:doc.balance < -100", n), true, "balance(-500) < -100 → true");
  assert.equal(evalDependsOn("eval:doc.balance == -500", n), true, "so sánh literal âm");
  assert.equal(evalDependsOn("eval:doc.qty > -1", n), true, "qty > -1");
  assert.equal(evalDependsOn("eval:-doc.qty == -5", n), true, "unary minus trên field");
  // SECURITY: định danh/hàm ngoài allowlist ⇒ ParseError → false (KHÔNG thực thi)
  assert.equal(evalDependsOn("eval:window", d), false);
  assert.equal(evalDependsOn("eval:doc.constructor", d), false); // constructor bị chặn → undefined → false
  assert.equal(evalDependsOn("eval:alert(1)", d), false); // hàm không whitelist
  assert.equal(evalDependsOn("fn:() => true", d), false); // fn: không hỗ trợ (bảo mật)
});

// 4c2. H1 (review) — child-table permission inherit: assumeWritable → field con editable dù perms rỗng.
check("resolveField assumeWritable: child field editable, vẫn tôn trọng read_only", () => {
  const childMeta: DocTypeMeta = {
    name: "Sales Order Item",
    fields: [
      { fieldname: "qty", fieldtype: "Float" },
      { fieldname: "amount", fieldtype: "Currency", read_only: 1 },
    ],
    permissions: [], // DocType con (istable) → permissions RỖNG
  };
  const qty = childMeta.fields[0]!;
  // assumeWritable (child grid) → editable dù perms rỗng (H1 fix)
  assert.equal(resolveField(qty, childMeta, { doc: {}, assumeWritable: true }).readOnly, false, "assumeWritable → editable");
  // KHÔNG assumeWritable + perms rỗng → read-only (mô phỏng bug cũ, chứng minh nguyên nhân)
  assert.equal(resolveField(qty, childMeta, { doc: {} }).readOnly, true, "perms rỗng + không inherit → read-only");
  // read_only field VẪN khoá kể cả assumeWritable
  assert.equal(resolveField(childMeta.fields[1]!, childMeta, { doc: {}, assumeWritable: true }).readOnly, true, "read_only vẫn khoá");
  // depends_on ẩn VẪN áp dụng dưới assumeWritable
  const dep = { fieldname: "disc", fieldtype: "Float", depends_on: "eval:doc.qty > 5" } as DocField;
  assert.equal(resolveField(dep, childMeta, { doc: { qty: 3 }, assumeWritable: true }).visible, false, "depends_on vẫn ẩn");
});

// 4d. Canonical metadata pipeline (P0-08): normalizeMeta validate + tag _compat + retain ext.
check("normalizeMeta: validate + _compat + giữ extension + ném lỗi shape sai", () => {
  const raw = {
    name: "ToDo", custom_flag: 1, // custom_flag = extension key (Frappe có thể thêm)
    fields: [
      { fieldname: "description", fieldtype: "Text Editor", custom_prop: "x" },
      { fieldname: "status", fieldtype: "Select", options: "Open\nClosed" },
      { fieldname: "weird", fieldtype: "SomeFutureType" },
    ],
    permissions: [{ role: "All", read: 1 }],
  };
  const m = normalizeMeta(raw);
  assert.equal(m.name, "ToDo");
  assert.equal((m as Record<string, unknown>).custom_flag, 1); // extension doctype-level giữ nguyên
  assert.equal((m.fields[0] as Record<string, unknown>).custom_prop, "x"); // extension field giữ nguyên
  assert.equal((m.fields[0] as Record<string, unknown>)._compat, "PARTIAL"); // Text Editor = PARTIAL
  assert.equal((m.fields[1] as Record<string, unknown>)._compat, "SUPPORTED"); // Select
  assert.equal((m.fields[2] as Record<string, unknown>)._compat, "UNSUPPORTED_VISIBLE"); // fieldtype lạ
  // fieldTypeStatus trực tiếp
  assert.equal(fieldTypeStatus("Data"), "SUPPORTED");
  assert.equal(fieldTypeStatus("Read Only"), "READ_ONLY");
  assert.equal(fieldTypeStatus("Dynamic Link"), "PARTIAL");
  assert.equal(fieldTypeStatus("NopeType"), "UNSUPPORTED_VISIBLE");
  // shape sai → MetaValidationError (KHÔNG cast mù)
  assert.throws(() => normalizeMeta({ fields: [] }), MetaValidationError); // thiếu name
  assert.throws(() => normalizeMeta({ name: "X" }), MetaValidationError); // fields không mảng
  assert.throws(() => normalizeMeta({ name: "X", fields: [{ label: "no fieldname" }] }), MetaValidationError);
});

// 4e. Serializers (P0-03): create gửi FULL doc (default⊕nhập), update gửi PATCH có chủ đích.
check("serializeCreateDocument (full, loại system/layout) + serializeUpdatePatch (patch+OCC)", () => {
  const meta = normalizeMeta({
    name: "ToDo",
    fields: [
      { fieldname: "sec", fieldtype: "Section Break" }, // layout → loại
      { fieldname: "description", fieldtype: "Data" },
      { fieldname: "status", fieldtype: "Select", options: "Open\nClosed" },
      { fieldname: "priority", fieldtype: "Select" },
    ],
  });
  // full values = default (status=Open, priority=Low) ⊕ nhập (description) + system fields
  const values = {
    name: "new", doctype: "ToDo", docstatus: 0, __islocal: 1, // system → loại
    sec: null, // layout → loại
    workflow_state: "Pending", // server-managed → loại (fix debt: create gửi workflow_state → 500)
    description: "task", status: "Open", priority: "Low",
  };
  const created = serializeCreateDocument(meta, values);
  assert.deepEqual(Object.keys(created).sort(), ["description", "priority", "status"]); // full authorable, no system/layout
  assert.equal("workflow_state" in created, false, "workflow_state server-managed → KHÔNG gửi khi tạo");
  assert.equal(created.status, "Open"); // default chưa-chạm VẪN gửi (P0-03)
  assert.equal(created.priority, "Low");
  assert.equal("name" in created, false);
  assert.equal("sec" in created, false);
  // update patch: chỉ field đổi + name + modified (OCC)
  const patch = serializeUpdatePatch(meta, "TODO-001", "2026-01-01 00:00:00", { status: "Closed", docstatus: 1 });
  assert.deepEqual(Object.keys(patch).sort(), ["modified", "name", "status"]);
  assert.equal(patch.name, "TODO-001");
  assert.equal(patch.modified, "2026-01-01 00:00:00");
  assert.equal("docstatus" in patch, false); // system loại
});

check("mã định danh chính được gợi ý tự động nhưng vẫn là field Data sửa được", () => {
  const meta = normalizeMeta({
    name: "Item",
    autoname: "field:item_code",
    fields: [
      { fieldname: "item_code", label: "Mã hàng", fieldtype: "Data", reqd: 1, unique: 1 },
      { fieldname: "tax_id", label: "Mã số thuế", fieldtype: "Data" },
      { fieldname: "linked_item_code", label: "Mã hàng liên kết", fieldtype: "Link", options: "Item" },
    ],
    permissions: [],
  });
  const field = editableCodeField(meta);
  assert.equal(field?.fieldname, "item_code");
  assert.equal(field?.read_only, undefined, "mã gợi ý vẫn sửa được");
  assert.equal(
    suggestEditableCode(meta, field!, new Date(2026, 6, 28), "A4K9Q"),
    "ITEM-260728-A4K9Q",
  );

  assert.equal(editableCodeField(normalizeMeta({
    name: "Customer",
    autoname: "field:customer_name",
    fields: [{ fieldname: "customer_name", fieldtype: "Data" }, { fieldname: "tax_id", fieldtype: "Data" }],
    permissions: [],
  })), undefined, "tên khách và mã số thuế không bị tự điền nhầm");
});

// 4f. P0-09 — Link subsystem: buildLinkFilters (link_filters tĩnh + eval: ngữ cảnh, fail-safe).
check("buildLinkFilters: static + eval-context + op + malformed→undefined", () => {
  const fld = (link_filters?: string): DocField => ({ fieldname: "warehouse", fieldtype: "Link", options: "Warehouse", ...(link_filters ? { link_filters } : {}) });

  // Không có link_filters → undefined (không lọc)
  assert.equal(buildLinkFilters(fld()), undefined);

  // Tĩnh op "=" → { field: value }; op khác → { field: [op, value] }
  const st = buildLinkFilters(fld(JSON.stringify([
    ["Warehouse", "is_group", "=", 0],
    ["Warehouse", "warehouse_name", "like", "%kho%"],
  ])));
  assert.deepEqual(st, { is_group: 0, warehouse_name: ["like", "%kho%"] });

  // eval: giải trong ngữ cảnh doc (dependent filter) — Warehouse theo company đang chọn
  const ev = buildLinkFilters(
    fld(JSON.stringify([["Warehouse", "company", "=", "eval:doc.company"]])),
    { company: "APH Co" },
  );
  assert.deepEqual(ev, { company: "APH Co" });

  // eval: field phụ thuộc chưa set → bỏ điều kiện (không ràng buộc → undefined toàn bộ filter)
  const ev2 = buildLinkFilters(fld(JSON.stringify([["Warehouse", "company", "=", "eval:doc.company"]])), {});
  assert.equal(ev2, undefined);
  assert.equal(
    buildLinkFilters(fld(JSON.stringify([["Warehouse", "company", "=", "eval:doc.company"]])), { company: "" }),
    undefined,
    "field phụ thuộc là chuỗi rỗng không được biến thành filter company=''",
  );
  assert.equal(
    buildLinkFilters(fld(JSON.stringify([["Warehouse", "company", "=", "eval:doc.company"]])), { company: null }),
    undefined,
    "field phụ thuộc null không được làm Link rỗng vĩnh viễn",
  );

  // eval ngoài allowlist (truy cập window) → bỏ điều kiện đó (fail-safe, không ném)
  const evBad = buildLinkFilters(fld(JSON.stringify([["Warehouse", "company", "=", "eval:window.location"]])), {});
  assert.equal(evBad, undefined);

  // JSON hỏng → undefined (Link vẫn tìm được, chỉ mất lọc)
  assert.equal(buildLinkFilters(fld("[[broken")), undefined);
  // Mảng rỗng → undefined
  assert.equal(buildLinkFilters(fld("[]")), undefined);
});

// 4j. Gate 5 — sanitizeUrl chặn scheme nguy hiểm (javascript:/data:/vbscript:/file:).
check("sanitizeUrl: chặn scheme nguy hiểm, giữ URL an toàn", () => {
  // an toàn → giữ nguyên
  assert.equal(sanitizeUrl("https://x.com/a"), "https://x.com/a");
  assert.equal(sanitizeUrl("/files/a.pdf"), "/files/a.pdf", "relative giữ");
  assert.equal(sanitizeUrl("mailto:a@b.com"), "mailto:a@b.com");
  assert.equal(sanitizeUrl("#frag"), "#frag", "anchor giữ");
  // nguy hiểm → ""
  assert.equal(sanitizeUrl("javascript:alert(1)"), "", "javascript: chặn");
  assert.equal(sanitizeUrl("JavaScript:alert(1)"), "", "chặn không phân biệt hoa/thường");
  assert.equal(sanitizeUrl("  javascript:alert(1)"), "", "chặn dù có space đầu");
  assert.equal(sanitizeUrl("java\tscript:alert(1)"), "", "chặn dù chèn control-char");
  assert.equal(sanitizeUrl("vbscript:msgbox(1)"), "", "vbscript: chặn");
  assert.equal(sanitizeUrl("data:text/html,<script>"), "", "data:text/html chặn");
  assert.equal(sanitizeUrl("file:///etc/passwd"), "", "file: chặn");
  assert.equal(sanitizeUrl(123), "", "không phải string → rỗng");
  // ảnh: data:image/* cho phép, data:text/* thì không
  assert.equal(sanitizeImageUrl("data:image/png;base64,iVBOR"), "data:image/png;base64,iVBOR", "data:image cho phép");
  assert.equal(sanitizeImageUrl("data:text/html,<script>"), "", "data:text KHÔNG phải ảnh → chặn");
  assert.equal(sanitizeImageUrl("https://x.com/a.png"), "https://x.com/a.png", "https ảnh giữ");
});

// 4i. P1-09 fetch_from — parse "link.source" + gom rule + doctype nguồn từ options link.
check("parseFetchFrom + collectFetchFrom (link→source, doctype nguồn)", () => {
  assert.deepEqual(parseFetchFrom("customer.customer_name"), { linkField: "customer", sourceField: "customer_name" });
  assert.equal(parseFetchFrom("nofield"), null, "không có '.' → null");
  assert.equal(parseFetchFrom(".x"), null, "thiếu link → null");
  assert.equal(parseFetchFrom("x."), null, "thiếu source → null");
  assert.equal(parseFetchFrom(undefined), null, "undefined → null");

  const meta: DocTypeMeta = {
    name: "Sales Order",
    fields: [
      { fieldname: "customer", fieldtype: "Link", options: "Customer" },
      { fieldname: "customer_name", fieldtype: "Data", fetch_from: "customer.customer_name", read_only: 1 },
      { fieldname: "territory", fieldtype: "Data", fetch_from: "customer.territory" },
      { fieldname: "misc", fieldtype: "Data" }, // không fetch_from
    ],
    permissions: [],
  };
  const rules = collectFetchFrom(meta);
  assert.equal(rules.length, 2, "2 field fetch_from");
  const cn = rules.find((r) => r.target === "customer_name")!;
  assert.equal(cn.linkField, "customer");
  assert.equal(cn.sourceField, "customer_name");
  assert.equal(cn.sourceDoctype, "Customer", "doctype nguồn = options của link field");
});

// 4g. P1-12 i18n — translator mô hình Frappe (dịch theo chuỗi nguồn + context + format args).
check("makeTranslator: source-string + context + {n}/{name} format", () => {
  const __ = makeTranslator({ "Save": "Lưu", "Status": "Trạng thái", "Draft:Status": "Nháp-TT", "Hello {0}": "Xin chào {0}" });
  assert.equal(__("Save"), "Lưu", "dịch chuỗi nguồn");
  assert.equal(__("Missing"), "Missing", "thiếu → trả nguyên chuỗi nguồn");
  assert.equal(__("Status", undefined, "Draft"), "Nháp-TT", "context ưu tiên khoá context:text");
  assert.equal(__("Status"), "Trạng thái", "không context → khoá text");
  assert.equal(__("Hello {0}", ["An"]), "Xin chào An", "thay {0} từ mảng");
  // formatMessage: {} tự tăng, {name} object, thiếu → giữ nguyên placeholder
  assert.equal(formatMessage("{} + {} = {}", [1, 2, 3]), "1 + 2 = 3", "{} tự tăng");
  assert.equal(formatMessage("Hi {name}", { name: "Bình" }), "Hi Bình", "{name} object");
  assert.equal(formatMessage("{0} {1}", ["x"]), "x {1}", "thiếu tham số → giữ placeholder");
  const empty = makeTranslator();
  assert.equal(empty("Anything"), "Anything", "catalog rỗng → identity");
});

// 4h. P1-16 locale format — số/tiền/ngày theo number_format + date_format (thuần hàm).
check("formatNumber/Currency/Date theo locale", () => {
  // mặc định #,###.## (comma group, dot decimal, 2 dp)
  assert.equal(formatNumber(1234567.5), "1,234,567.50", "group 3 + 2dp");
  // EU #.###,## (dot group, comma decimal)
  assert.equal(formatNumber(1234567.5, "#.###,##"), "1.234.567,50", "EU sep hoán đổi");
  // Ấn Độ lakh grouping
  assert.equal(formatNumber(1234567, "#,##,###.##", 0), "12,34,567", "Ấn Độ 2,2,3");
  // precision override thắng format
  assert.equal(formatNumber(3.14159, "#,###.##", 3), "3.142", "precision override");
  // âm + rỗng
  assert.equal(formatNumber(-1000, "#,###", 0), "-1,000", "âm giữ dấu");
  assert.equal(formatNumber(null), "", "null → rỗng");
  // currency: symbol trước + space; âm dấu trước symbol
  assert.equal(formatCurrency(1000, "₫", "#,###", 0), "₫ 1,000", "symbol + số");
  assert.equal(formatCurrency(-50, "$", "#,###.##"), "-$ 50.00", "âm: dấu trước symbol");
  // date_format
  assert.equal(formatDate("2026-07-24", "dd-mm-yyyy"), "24-07-2026", "dd-mm-yyyy");
  assert.equal(formatDate("2026-07-24 13:05:00", "dd/mm/yyyy"), "24/07/2026", "cắt phần giờ");
  assert.equal(formatDate(""), "", "rỗng → rỗng");
});

// 4k. Section B — Duration canonical (giây ↔ chuỗi, round-trip lossless).
check("Duration parse/format round-trip (giây)", () => {
  // format
  assert.equal(formatDuration(93784), "1d 2h 3m 4s", "giây → d/h/m/s");
  assert.equal(formatDuration(3600), "1h", "bỏ thành phần 0");
  assert.equal(formatDuration(0), "0s", "0 → 0s");
  assert.equal(formatDuration(90), "1m 30s");
  assert.equal(formatDuration(93784, { hideDays: true }), "26h 3m 4s", "hideDays gộp giờ");
  // parse
  assert.equal(parseDuration("1d 2h 3m 4s"), 93784);
  assert.equal(parseDuration("26h 3m 4s"), 93784, "không ngày");
  assert.equal(parseDuration("90m"), 5400);
  assert.equal(parseDuration("3600"), 3600, "số thuần = giây");
  assert.equal(parseDuration(""), 0);
  assert.equal(parseDuration("rác"), 0, "không hợp lệ → 0");
  // ROUND-TRIP lossless
  for (const n of [0, 4, 59, 60, 3599, 3600, 86399, 93784, 123456]) {
    assert.equal(parseDuration(formatDuration(n)), n, `round-trip ${n}`);
    assert.equal(parseDuration(formatDuration(n, { hideDays: true })), n, `round-trip hideDays ${n}`);
  }
});

// 4l. Section B — LocaleContext: makeLocaleFormat config-driven + fallback + scope-switch.
check("makeLocaleFormat: config-driven number/currency/date/precision + fallback + switch", () => {
  const vi = makeLocaleFormat({ numberFormat: "#.###,##", currencySymbol: "₫", dateFormat: "dd/mm/yyyy" });
  assert.equal(vi.number(1234567.5), "1.234.567,50", "number theo config EU");
  // Ký hiệu đồng viết SAU số — "₫ 1.000" là sai quy ước tiếng Việt. Vị trí suy từ chính
  // ký hiệu, nên một app chỉ khai `currencySymbol` vẫn đặt đúng chỗ.
  assert.equal(vi.currency(1000), "1.000 ₫", "currency symbol đứng sau + VND không có phần lẻ");
  assert.equal(vi.date("2026-07-24"), "24/07/2026", "date theo config");
  assert.equal(vi.number(3.14159, 3), "3,142", "precision override");
  // fallback khi thiếu sysdefaults → default #,###.##, date yyyy-mm-dd, không symbol
  const def = makeLocaleFormat();
  assert.equal(def.number(1234567.5), "1,234,567.50", "fallback number");
  assert.equal(def.currency(1000), "1,000.00", "fallback không symbol");
  assert.equal(def.date("2026-07-24"), "2026-07-24", "fallback date yyyy-mm-dd");
  // scope-switch: config KHÁC → output KHÁC (không dùng lại cache cũ; provider memo theo localeKey)
  const us = makeLocaleFormat({ numberFormat: "#,###.##", currencySymbol: "$", dateFormat: "mm/dd/yyyy" });
  assert.notEqual(us.number(1234567.5), vi.number(1234567.5), "đổi locale → number khác");
  assert.notEqual(us.date("2026-07-24"), vi.date("2026-07-24"), "đổi locale → date khác");
  assert.equal(us.currency(1000), "$ 1,000.00");
});

// 4m. Gate 7.1 — App manifest: validate + resolveHomeRoute + navGroups (bỏ hard-code home/nav).
check("validateManifest + resolveHomeRoute + navGroups", () => {
  const ok: AppManifest = {
    id: "wms", name: "Kho APH", brand: "blue",
    home: { doctype: "Warehouse Transfer" },
    nav: [
      { key: "Warehouse Transfer", label: "Chuyển kho", group: "Kho", icon: "arrow-left-right" },
      { key: "Lot Hold", label: "Giữ lô", group: "Kho" },
      { key: "__workspace", label: "Workspace", group: "Hệ thống", kind: "workspace" },
      { key: "receive", label: "Nhận/Giao", group: "Kho", kind: "route", route: "/x/receive" },
    ],
  };
  assert.equal(validateManifest(ok).ok, true, "manifest hợp lệ");
  assert.equal(resolveHomeRoute(ok), "/app/Warehouse Transfer", "home theo doctype");
  assert.equal(resolveHomeRoute({ ...ok, home: { route: "/dash" } }), "/dash", "home theo route tuỳ biến");
  const groups = navGroups(ok);
  assert.deepEqual(groups.map((g) => g.group), ["Kho", "Hệ thống"], "gom nhóm giữ thứ tự");
  assert.equal(groups[0]!.items.length, 3, "nhóm Kho 3 mục");

  // lỗi: id sai, home rỗng, nav rỗng, key trùng, route thiếu
  assert.ok(!validateManifest({ id: "Bad Id", name: "", home: {}, nav: [] }).ok, "nhiều lỗi → not ok");
  const dup = validateManifest({ id: "a", name: "A", home: { doctype: "X" }, nav: [{ key: "X", label: "x" }, { key: "X", label: "y" }] });
  assert.ok(dup.issues.some((i) => i.code === "nav_key_dup"), "nav key trùng → error");
  const badRoute = validateManifest({ id: "a", name: "A", home: { doctype: "X" }, nav: [{ key: "X", label: "x" }, { key: "r", label: "R", kind: "route" }] });
  assert.ok(badRoute.issues.some((i) => i.code === "nav_route"), "kind=route thiếu route → error");
  const badBrand = validateManifest({ id: "a", name: "A", brand: "neon" as never, home: { doctype: "X" }, nav: [{ key: "X", label: "x" }] });
  assert.ok(badBrand.issues.some((i) => i.code === "brand"), "brand lạ → error");
  // home.doctype không trong nav → warning (không chặn)
  const warnHome = validateManifest({ id: "a", name: "A", home: { doctype: "Ghost" }, nav: [{ key: "X", label: "x" }] });
  assert.equal(warnHome.ok, true, "home ngoài nav chỉ warning");
  assert.ok(warnHome.issues.some((i) => i.severity === "warning" && i.code === "home_not_in_nav"));
  // home.route KHÔNG khớp route/workspace/system nào trong nav → ERROR (không chỉ warning — review
  // P1-MANIFEST-01: mismatch này gây redirect loop thật ở runtime, khác home.doctype thiếu chỉ mất 1 deep-link).
  const badHomeRoute = validateManifest({ id: "a", name: "A", home: { route: "/dash" }, nav: [{ key: "X", label: "x" }] });
  assert.ok(!badHomeRoute.ok && badHomeRoute.issues.some((i) => i.code === "home_route_unmatched"), "home.route lệch nav → error");
  const okHomeRoute = validateManifest({ id: "a", name: "A", home: { route: "/x/receive" }, nav: [{ key: "receive", label: "R", kind: "route", route: "/x/receive" }] });
  assert.equal(okHomeRoute.ok, true, "home.route khớp route trong nav → ok");

  // route tương đối (thiếu "/" đầu) — review độc lập: resolve SAI trong React Router (coi là path con
  // của URL hiện tại, không phải tuyệt đối), lỗi khó thấy lúc runtime → chặn sớm ở validate.
  const relRoute = validateManifest({ id: "a", name: "A", home: { doctype: "X" }, nav: [{ key: "X", label: "x" }, { key: "docs", label: "Docs", kind: "route", route: "docs" }] });
  assert.ok(!relRoute.ok && relRoute.issues.some((i) => i.code === "nav_route_relative"), "route tương đối → error");
  assert.ok(validateManifest({ id: "a", name: "A", home: { doctype: "X" }, nav: [{ key: "X", label: "x" }, { key: "docs", label: "Docs", kind: "route", route: "/docs" }] }).ok, "route tuyệt đối → ok");

  // 2 nav item khác key nhưng cùng resolve 1 path — review độc lập: React Router chỉ khớp <Route> ĐẦU
  // TIÊN, item còn lại "tồn tại" trong nav nhưng không bao giờ tới được. Case cụ thể: kind=system key
  // "__ws" và "ws" đều còn "/ws" sau khi bỏ tiền tố "__".
  const dupRoute = validateManifest({
    id: "a", name: "A", home: { doctype: "X" },
    nav: [{ key: "X", label: "x" }, { key: "__ws", label: "WS1", kind: "system" }, { key: "ws", label: "WS2", kind: "system" }],
  });
  assert.ok(!dupRoute.ok && dupRoute.issues.some((i) => i.code === "nav_route_dup"), "2 nav item cùng resolve 1 path → error");
});

// 4n. Gate 7.1/P2 — resolveNavPath (mỗi kind) + mergeLocale (P1-MANIFEST-01, ManifestAppRuntime parity).
check("resolveNavPath (doctype/route/workspace/system/unknown) + mergeLocale", () => {
  assert.equal(resolveNavPath({ key: "ToDo", label: "ToDo" }), "/app/ToDo", "kind mặc định = doctype");
  assert.equal(resolveNavPath({ key: "ToDo", label: "ToDo", kind: "doctype" }), "/app/ToDo", "kind=doctype tường minh");
  assert.equal(resolveNavPath({ key: "x", label: "X", kind: "route", route: "/x/receive" }), "/x/receive", "kind=route → chính route khai báo");
  assert.equal(resolveNavPath({ key: "x", label: "X", kind: "route" }), null, "kind=route thiếu route → null (KHÔNG suy đoán)");
  assert.equal(resolveNavPath({ key: "__ws", label: "WS", kind: "workspace" }), "/workspace", "kind=workspace → path chung");
  assert.equal(resolveNavPath({ key: "__settings", label: "Settings", kind: "system" }), "/settings", "kind=system → /<key bỏ tiền tố __>");
  // kind=experience — Experience plugin system (review độc lập, vòng 2): path mặc định "/x/<key>",
  // khớp Experience.key registry (@metaforge/shell/app-mode).
  assert.equal(resolveNavPath({ key: "receive", label: "Nhận/Giao", kind: "experience" }), "/x/receive", "kind=experience → /x/<key>");
  assert.equal(resolveNavPath({ key: "receive", label: "R", kind: "experience" }, { experienceBase: "/app-mode" }), "/app-mode/receive", "experienceBase tuỳ biến");
  assert.equal(resolveNavPath({ key: "x", label: "X", kind: "weird" as never }), null, "kind lạ → null, TUYỆT ĐỐI không ngầm coi là doctype");
  // custom base path (app tự deploy dưới prefix khác) — vẫn tôn trọng override.
  assert.equal(resolveNavPath({ key: "ToDo", label: "ToDo" }, { doctypeBase: "/rec" }), "/rec/ToDo", "doctypeBase tuỳ biến");

  // mergeLocale: override TỪNG FIELD, field không set giữ nguyên boot — không mất field khác khi ép 1 field.
  const boot = { number_format: "#,###.##", currency: "VND", date_format: "dd-mm-yyyy" };
  const noPrec = { floatPrecision: undefined, currencyPrecision: undefined };
  assert.deepEqual(mergeLocale(boot, undefined), { numberFormat: "#,###.##", currency: "VND", dateFormat: "dd-mm-yyyy", ...noPrec }, "không override → giữ boot nguyên vẹn");
  assert.deepEqual(
    mergeLocale(boot, { currency: "USD" }),
    { numberFormat: "#,###.##", currency: "USD", dateFormat: "dd-mm-yyyy", ...noPrec },
    "override 1 field KHÔNG làm mất field khác của boot",
  );
  assert.deepEqual(
    mergeLocale(undefined, { currency: "USD" }),
    { numberFormat: undefined, currency: "USD", dateFormat: undefined, ...noPrec },
    "boot rỗng vẫn nhận override",
  );

  // Độ chính xác: Frappe trả CHUỖI. "0" là số 0 THẬT (VND không có phần lẻ) — mọi cách kiểm kiểu
  // `if (raw)` hay `cint(raw)` đều coi "0" là chưa đặt và âm thầm rơi về mặc định 2 số lẻ.
  assert.equal(mergeLocale({ ...boot, currency_precision: "0" }, undefined).currencyPrecision, 0, '"0" phải ra số 0, KHÔNG được coi là chưa đặt');
  assert.equal(mergeLocale({ ...boot, float_precision: "3" }, undefined).floatPrecision, 3, 'chuỗi "3" → số 3');
  assert.equal(mergeLocale({ ...boot, currency_precision: "" }, undefined).currencyPrecision, undefined, "chuỗi rỗng = chưa đặt");
});

// 5. Data Import raw status → UI phase (KHÔNG dùng chuỗi lowercase sai).
check("toUiPhase map raw status đúng", () => {
  assert.equal(toUiPhase("Pending"), "queued");
  assert.equal(toUiPhase("Success"), "completed");
  assert.equal(toUiPhase("Partial Success"), "completed");
  assert.equal(toUiPhase("Error"), "failed");
  assert.equal(toUiPhase("Timed Out"), "failed");
});

// 5b. createScopeKey (P2-CACHE-01) — cách ly cache THẬT theo site+user+lang+version, KHÔNG còn hằng
// số "16" đoán. 2 site khác nhau (hoặc user/lang/version khác) PHẢI ra scopeKey khác nhau — nếu không
// TanStack Query sẽ lẫn cache của site A vào site B khi cả 2 dùng chung 1 trình duyệt/localStorage.
check("createScopeKey: site+user+lang+version khác nhau → key khác nhau (cách ly cache)", () => {
  const base = { user: "a@x.com", lang: "vi", site_name: "site-a.local", frappe_version: "16.28.0" };
  const key = createScopeKey(base);
  assert.ok(key.includes("site-a.local") && key.includes("a@x.com") && key.includes("vi") && key.includes("16.28.0"), "key phải mang đủ 4 thành phần");

  const diffSite = createScopeKey({ ...base, site_name: "site-b.local" });
  assert.notEqual(key, diffSite, "khác site → khác key (2 tenant dùng chung trình duyệt không lẫn cache)");

  const diffUser = createScopeKey({ ...base, user: "b@x.com" });
  assert.notEqual(key, diffUser, "khác user → khác key");

  const diffVersion = createScopeKey({ ...base, frappe_version: "17.0.0" });
  assert.notEqual(key, diffVersion, "khác version Frappe (site nâng cấp) → khác key, không dùng cache cũ có thể lệch schema/contract");

  assert.equal(createScopeKey(base), createScopeKey(base), "cùng input → cùng key (deterministic)");
});

// 6. evalDependsOn: eval expr, shorthand fieldname, rỗng.
check("evalDependsOn: eval / shorthand / rỗng", () => {
  assert.equal(evalDependsOn("eval:doc.status=='Open'", { status: "Open" }), true);
  assert.equal(evalDependsOn("eval:doc.status=='Open'", { status: "Closed" }), false);
  assert.equal(evalDependsOn("is_group", { is_group: 1 }), true);
  assert.equal(evalDependsOn("is_group", { is_group: 0 }), false);
  assert.equal(evalDependsOn("", { a: 1 }), true); // rỗng → hiển thị
  assert.equal(evalDependsOn("eval:doc.x.y.z", {}), false); // lỗi eval → false
});

// Meta mẫu để test resolver.
const meta: DocTypeMeta = {
  name: "Task",
  fields: [
    { fieldname: "sb", fieldtype: "Section Break" },
    { fieldname: "title", fieldtype: "Data", reqd: 1 },
    { fieldname: "status", fieldtype: "Select", options: "Open\nClosed" },
    { fieldname: "close_reason", fieldtype: "Small Text", mandatory_depends_on: "eval:doc.status=='Closed'", depends_on: "eval:doc.status=='Closed'" },
    { fieldname: "locked_note", fieldtype: "Data", read_only: 1 },
    { fieldname: "secret", fieldtype: "Data", permlevel: 1 },
  ],
  permissions: [
    { role: "Employee", permlevel: 0, read: 1, write: 1 },
    // KHÔNG có perm permlevel 1 cho Employee → field 'secret' bị che
  ],
};
const asEmployee = { roles: ["Employee"] };

// 7. Resolver: required cơ bản + section break là layout.
check("resolver: layout + reqd", () => {
  const r = resolveMeta(meta, { ...asEmployee, doc: { status: "Open" } });
  const byName = Object.fromEntries(r.map((x) => [x.field.fieldname, x]));
  assert.equal(byName.sb!.layout, true);
  assert.equal(byName.title!.required, true);
  assert.equal(byName.title!.state, "editable");
});

// 8. Resolver: depends_on ẩn/hiện + mandatory_depends_on.
check("resolver: depends_on + mandatory_depends_on theo status", () => {
  const open = resolveField(meta.fields[3]!, meta, { ...asEmployee, doc: { status: "Open" } });
  const closed = resolveField(meta.fields[3]!, meta, { ...asEmployee, doc: { status: "Closed" } });
  assert.equal(open.visible, false); // status=Open → close_reason ẩn
  assert.equal(open.state, "hidden");
  assert.equal(closed.visible, true); // status=Closed → hiện
  assert.equal(closed.required, true); // và bắt buộc
});

// 9. Resolver: read_only field → locked.
check("resolver: read_only → locked", () => {
  const f = resolveField(meta.fields[4]!, meta, { ...asEmployee, doc: {} });
  assert.equal(f.readOnly, true);
  assert.equal(f.state, "locked");
});

// 10. Resolver: permlevel 1 không quyền đọc → masked.
check("resolver: permlevel > quyền → masked", () => {
  const f = resolveField(meta.fields[5]!, meta, { ...asEmployee, doc: {} });
  assert.equal(f.masked, true);
  assert.equal(f.state, "masked");
});

// 11. Resolver: docstatus submitted → khoá field (trừ allow_on_submit).
check("resolver: docstatus=1 → locked", () => {
  const f = resolveField(meta.fields[1]!, meta, { ...asEmployee, doc: { docstatus: 1 } });
  assert.equal(f.readOnly, true);
  assert.equal(f.state, "locked");
});

// 12. Control registry: nạp mặc định → các fieldtype hay gặp có control, missing giảm.
check("registerDefaultControls: fieldtype phổ biến có control", () => {
  const reg = createDefaultRegistry();
  for (const ft of ["Data", "Select", "Link", "Check", "Date", "Currency", "Int", "Text"] as const) {
    assert.ok(reg.resolve(ft), `thiếu control cho ${ft}`);
  }
  const missing = reg.missing();
  assert.ok(!missing.includes("Data"));
  assert.ok(missing.length < 43, "phải phủ được một phần"); // còn lại là media/table/layout (build sau)
  console.log(`      (đã phủ ${43 - missing.length}/43, còn thiếu: ${missing.join(", ")})`);
});

// 13. List LOGIC: deriveColumns (in_list_view + title + status) — UI verify bằng screenshot/E2E.
check("List logic: deriveColumns từ metadata", () => {
  const listMeta: DocTypeMeta = {
    name: "Task",
    title_field: "subject",
    image_field: "avatar",
    fields: [
      { fieldname: "subject", fieldtype: "Data", label: "Tiêu đề", in_list_view: 1 },
      { fieldname: "status", fieldtype: "Select", label: "TT", options: "Open\nClosed", in_list_view: 1 },
      { fieldname: "amount", fieldtype: "Currency", label: "Tiền", in_list_view: 1 },
      { fieldname: "avatar", fieldtype: "Attach Image", label: "Ảnh", in_list_view: 1 },
      { fieldname: "secret_note", fieldtype: "Data", label: "Ẩn", in_list_view: 1, hidden: 1 },
    ],
    permissions: [],
  };
  const cols = deriveColumns(listMeta);
  assert.equal(cols[0]!.fieldname, "subject", "cột đầu = title_field");
  assert.ok(cols[0]!.isTitle, "cột title đánh dấu isTitle");
  assert.ok(cols.find((c) => c.fieldname === "status")!.isStatus, "Select status → isStatus");
  assert.equal(cols.find((c) => c.fieldname === "amount")!.align, "right", "Currency canh phải");
  assert.equal(cols[0]!.imageFieldname, "avatar", "ảnh gắn vào cột chính");
  assert.equal(cols.some((c) => c.fieldname === "avatar"), false, "không sinh cột URL ảnh trùng");
  assert.equal(cols.some((c) => c.fieldname === "secret_note"), false, "field hidden không lọt vào List");
  assert.ok((buildServerQuery(listMeta, emptyListState(), cols).fields ?? []).includes("avatar"), "query vẫn nạp ảnh hợp lệ");
  assert.equal((buildServerQuery(listMeta, emptyListState(), cols).fields ?? []).includes("secret_note"), false, "query không nạp field hidden");
  assert.equal(statusVariant("Cancelled"), "destructive", "Cancelled → badge destructive");
});

check("List columns: preference được scope + normalize metadata + reset detection", () => {
  const specs = [
    { fieldname: "subject", isTitle: true, minWidth: 200 },
    { fieldname: "status", minWidth: 120, groupable: true },
    { fieldname: "amount", minWidth: 104 },
  ];
  const prefs = normalizeColumnPreferences({
    hidden: ["subject", "status", "status", "field_da_xoa"],
    order: ["amount", "field_da_xoa", "amount"],
    widths: { status: 10, amount: 9_999, field_da_xoa: 300, subject: Number.NaN },
    density: "compact",
    groupBy: "status",
  }, specs);
  assert.deepEqual(prefs.hidden, ["status"], "title bắt buộc + field cũ không được ẩn");
  assert.deepEqual(prefs.order, ["amount", "subject", "status"], "order sạch, field mới được nối vào");
  assert.deepEqual(prefs.widths, { status: 120, amount: 720 }, "width clamp theo min riêng và max chung");
  assert.equal(prefs.groupBy, "status");
  assert.equal(prefs.density, "compact");
  assert.equal(hasCustomColumnPreferences(prefs, specs), true);
  assert.notEqual(columnPreferenceKey("site-a|user-a", "Task"), columnPreferenceKey("site-a|user-b", "Task"), "khác user phải khác key");
  assert.notEqual(columnPreferenceKey("site-a|user-a", "Task"), columnPreferenceKey("site-b|user-a", "Task"), "khác tenant phải khác key");
  assert.equal(stableColumnPreferenceScope("site-a|user-a|vi|16.20"), stableColumnPreferenceScope("site-a|user-a|en|17.0"), "đổi ngôn ngữ/version không làm mất sở thích");
});

check("List columns: chuyển trái/phải và áp thứ tự không làm mất cột", () => {
  assert.deepEqual(moveColumn(["a", "b", "c"], "a", "b"), ["b", "a", "c"], "sang phải phải đổi chỗ");
  assert.deepEqual(moveColumn(["a", "b", "c"], "c", "b"), ["a", "c", "b"], "sang trái phải đổi chỗ");
  assert.deepEqual(moveColumn(["a", "b", "c"], "a", "c"), ["b", "c", "a"], "kéo xa sang phải đặt sau đích");
  assert.deepEqual(
    applyColumnOrder([{ fieldname: "a" }, { fieldname: "b" }, { fieldname: "new" }], ["b", "a"]),
    [{ fieldname: "b" }, { fieldname: "a" }, { fieldname: "new" }],
    "field metadata mới vẫn được nối cuối",
  );
});

// 14. FormView render thật — required *, depends_on hiện, masked ••••, nút Lưu.
check("FormView render: required + depends_on + masked", () => {
  const reg = createDefaultRegistry();
  const html = renderToStaticMarkup(
    h(FormView, {
      meta,
      doc: { name: "T-1", doctype: "Task", status: "Closed" },
      registry: reg,
      roles: ["Employee"],
    }),
  );
  assert.ok(html.includes("mf-required"), "field reqd có dấu *");
  assert.ok(html.includes("close_reason"), "close_reason hiện khi status=Closed (depends_on)");
  assert.ok(html.includes("••••••"), "secret permlevel bị che");
  assert.ok(html.includes(">Lưu<") || html.includes("Lưu"), "có nút Lưu");
});

// 15. FormView: 417 conflict → banner "Tải lại", không cho ghi đè.
check("FormView render: conflict banner", () => {
  const reg = createDefaultRegistry();
  const html = renderToStaticMarkup(
    h(FormView, {
      meta,
      doc: { name: "T-1", doctype: "Task", status: "Open" },
      registry: reg,
      roles: ["Employee"],
      conflict: true,
    }),
  );
  assert.ok(html.includes("Tải lại"), "conflict → banner tải lại");
  assert.ok(html.includes("mf-conflict"), "có vùng conflict");
});

// 16. FormView: depends_on ẩn → field KHÔNG render khi status=Open.
check("FormView render: field ẩn khi depends_on không thoả", () => {
  const reg = createDefaultRegistry();
  const html = renderToStaticMarkup(
    h(FormView, {
      meta,
      doc: { name: "T-1", doctype: "Task", status: "Open" },
      registry: reg,
      roles: ["Employee"],
    }),
  );
  assert.ok(!html.includes("close_reason"), "close_reason ẩn khi status=Open");
});

// ===== HOTFIX P0 (reviewer) =====

// 17. PERMISSION: role {read:1, write:0} → read-only, KHÔNG editable (bug fallback write.size===0).
check("perm: read-only role → locked (không editable)", () => {
  const roMeta: DocTypeMeta = {
    name: "Doc",
    fields: [{ fieldname: "title", fieldtype: "Data", label: "Title" }],
    permissions: [{ role: "Viewer", permlevel: 0, read: 1, write: 0 }],
  };
  const f = resolveField(roMeta.fields[0]!, roMeta, { roles: ["Viewer"], doc: {} });
  assert.equal(f.readOnly, true, "read:1 write:0 phải read-only");
  assert.equal(f.state, "locked");
});

// 18. PERMISSION: có write ở đúng permlevel → editable.
check("perm: có write → editable", () => {
  const rwMeta: DocTypeMeta = {
    name: "Doc",
    fields: [{ fieldname: "title", fieldtype: "Data" }],
    permissions: [{ role: "Editor", permlevel: 0, read: 1, write: 1 }],
  };
  const f = resolveField(rwMeta.fields[0]!, rwMeta, { roles: ["Editor"], doc: {} });
  assert.equal(f.readOnly, false);
  assert.equal(f.state, "editable");
});

// 19. toTruthy kiểu Frappe: mảng theo length.
check("toTruthy: mảng rỗng = false", () => {
  assert.equal(toTruthy([]), false);
  assert.equal(toTruthy([1]), true);
  assert.equal(toTruthy(""), false);
  assert.equal(toTruthy("x"), true);
  assert.equal(toTruthy(0), false);
});

// 20. depends_on: shorthand + eval trên mảng rỗng = false (KHỚP Frappe).
check("depends_on: array truthiness = false khi rỗng", () => {
  assert.equal(evalDependsOn("items", { items: [] }), false);
  assert.equal(evalDependsOn("items", { items: [1] }), true);
  assert.equal(evalDependsOn("eval:doc.items", { items: [] }), false);
});

// 21. depends_on: fn: (hàm tuỳ ý) KHÔNG hỗ trợ trong runtime an toàn (P0-06) → false + diagnostic.
check("depends_on: fn: hàm tuỳ ý → false (bảo mật, không new Function)", () => {
  assert.equal(evalDependsOn("fn:function(doc){return doc.n>1}", { n: 2 }), false);
  assert.equal(evalDependsOn("fn:function(doc){return doc.n>1}", { n: 0 }), false);
  // thay bằng eval: (allowlist) cho cùng ý định — CÁI NÀY chạy an toàn:
  assert.equal(evalDependsOn("eval:doc.n>1", { n: 2 }), true);
  assert.equal(evalDependsOn("eval:doc.n>1", { n: 0 }), false);
});

// 22. LAYOUT: field đầu là Tab Break → KHÔNG sinh tab rỗng dẫn đầu.
check("layout: không tab rỗng đầu khi bắt đầu bằng Tab Break", () => {
  const meta2: DocTypeMeta = {
    name: "D",
    fields: [
      { fieldname: "t1", fieldtype: "Tab Break", label: "Chi tiết" },
      { fieldname: "a", fieldtype: "Data", label: "A" },
      { fieldname: "t2", fieldtype: "Tab Break", label: "Khác" },
      { fieldname: "b", fieldtype: "Data", label: "B" },
    ],
    permissions: [{ role: "All", permlevel: 0, read: 1, write: 1 }],
  };
  const tabs = groupLayout(resolveMeta(meta2, { roles: ["All"], doc: {} }));
  assert.equal(tabs.length, 2, "đúng 2 tab, không có tab rỗng dẫn đầu");
  assert.equal(tabs[0]!.label, "Chi tiết");
  assert.equal(tabs[1]!.label, "Khác");
});

// 23. LAYOUT: nội dung trước Tab Break đầu → giữ làm tab đầu (không mất).
check("layout: giữ nội dung trước Tab Break đầu", () => {
  const meta3: DocTypeMeta = {
    name: "D",
    fields: [
      { fieldname: "a", fieldtype: "Data", label: "A" },
      { fieldname: "t", fieldtype: "Tab Break", label: "Tab 2" },
      { fieldname: "b", fieldtype: "Data", label: "B" },
    ],
    permissions: [{ role: "All", permlevel: 0, read: 1, write: 1 }],
  };
  const tabs = groupLayout(resolveMeta(meta3, { roles: ["All"], doc: {} }));
  assert.equal(tabs.length, 2);
  assert.equal(tabs[0]!.label, ""); // tab ngầm giữ nội dung 'a'
});

// 24. LAYOUT: Section Break ẩn theo depends_on → section.hidden.
check("layout: Section Break depends_on ẩn → section ẩn", () => {
  const meta4: DocTypeMeta = {
    name: "D",
    fields: [
      { fieldname: "s1", fieldtype: "Section Break", label: "Luôn" },
      { fieldname: "a", fieldtype: "Data" },
      { fieldname: "s2", fieldtype: "Section Break", label: "Điều kiện", depends_on: "eval:doc.show==1" },
      { fieldname: "b", fieldtype: "Data" },
    ],
    permissions: [{ role: "All", permlevel: 0, read: 1, write: 1 }],
  };
  const tabs = groupLayout(resolveMeta(meta4, { roles: ["All"], doc: { show: 0 } }));
  const sections = tabs[0]!.sections;
  const cond = sections.find((s) => s.label === "Điều kiện");
  assert.ok(cond, "có section điều kiện");
  assert.equal(cond!.hidden, true, "Section Break ẩn → section ẩn");
});

check("form width: tên/mã mặc định 2 ô, field ngắn 3 ô, explicit luôn thắng", () => {
  assert.equal(resolveFormFieldWidth({ fieldname: "item_name", fieldtype: "Data" }, "item_name"), "half");
  assert.equal(resolveFormFieldWidth({ fieldname: "stock_uom", fieldtype: "Link" }), "third");
  assert.equal(resolveFormFieldWidth({ fieldname: "item_status", fieldtype: "Data" }), "third");
  assert.equal(resolveFormFieldWidth({ fieldname: "item_code", fieldtype: "Data" }), "half");
  assert.equal(resolveFormFieldWidth({ fieldname: "item_code", fieldtype: "Data", form_width: "full" }), "full");
});

check("FormView: checkbox được gom riêng, không chen vào hàng input", () => {
  const compactMeta: DocTypeMeta = {
    name: "Item",
    title_field: "item_name",
    fields: [
      { fieldname: "item_code", fieldtype: "Data", label: "Mã hàng" },
      { fieldname: "item_name", fieldtype: "Data", label: "Tên hàng" },
      { fieldname: "can_buy", fieldtype: "Check", label: "Được mua" },
      { fieldname: "can_sell", fieldtype: "Check", label: "Được bán" },
      { fieldname: "is_stock", fieldtype: "Check", label: "Quản lý tồn" },
    ],
    permissions: [{ role: "All", permlevel: 0, read: 1, write: 1 }],
  };
  const html = renderToStaticMarkup(h(FormView, {
    meta: compactMeta,
    doc: { name: "ITEM-1", doctype: "Item" },
    registry: createFullRegistry(),
    roles: ["All"],
  }));
  assert.ok(html.includes("mf-check-group"));
  assert.equal((html.match(/mf-field-width-half/g) ?? []).length, 2);
});

// 25. DATETIME: Frappe "YYYY-MM-DD HH:mm:ss" → input datetime-local "YYYY-MM-DDTHH:mm".
check("datetime: convert Frappe ↔ datetime-local", () => {
  const html = renderToStaticMarkup(
    h(DateControl, {
      field: { fieldname: "dt", fieldtype: "Datetime" },
      value: "2026-07-23 14:30:00",
      onChange: () => {},
    }),
  );
  assert.ok(html.includes('value="2026-07-23T14:30"'), "value chuyển sang datetime-local");
});

check("datetime: wrapper đủ rộng để không cắt phút và nút lịch", () => {
  const datetimeMeta: DocTypeMeta = {
    name: "Event",
    fields: [{ fieldname: "starts_at", fieldtype: "Datetime", label: "Bắt đầu" }],
    permissions: [{ role: "All", permlevel: 0, read: 1, write: 1 }],
  };
  const html = renderToStaticMarkup(
    h(FormView, {
      meta: datetimeMeta,
      doc: { name: "EVT-1", doctype: "Event", starts_at: "2026-07-23 14:30:00" },
      registry: createDefaultRegistry(),
      roles: ["All"],
    }),
  );
  // ERPNext để control chiếm trọn form-column. Không ghim Datetime vào một `basis` hẹp:
  // chính cột responsive bảo đảm đủ chỗ cho ngày, phút và nút lịch.
  assert.ok(html.includes("mf-form-grid"), "form phải dùng lưới cột responsive theo bề rộng pane");
  assert.ok(html.includes('type="datetime-local"'), "phải render đúng datetime-local");
  assert.ok(!html.includes("basis-["), "field không được tự ghim bề rộng làm cắt phần phút/nút lịch");
});

// 26. FORM: role không quyền write → FormView render field ở trạng thái locked.
check("FormView: read-only role → mf-state-locked", () => {
  const reg = createDefaultRegistry();
  const html = renderToStaticMarkup(
    h(FormView, {
      meta,
      doc: { name: "T-1", doctype: "Task", status: "Open" },
      registry: reg,
      roles: ["Guest"], // không khớp perm Employee → không write
    }),
  );
  assert.ok(html.includes("mf-state-locked"), "field khoá khi không quyền write");
});

// ===== MEDIA + CHILD GRID (bước 6) =====

// 27. Media controls đã đăng ký trong createDefaultRegistry.
check("media: Attach/Image/Signature/Barcode/Geolocation/Icon có control", () => {
  const reg = createDefaultRegistry();
  for (const ft of ["Attach", "Attach Image", "Image", "Signature", "Barcode", "Geolocation", "Icon"] as const) {
    assert.ok(reg.resolve(ft), `thiếu control ${ft}`);
  }
});

// 28. createFullRegistry: Table + Table MultiSelect có control; chỉ còn thiếu layout/Button.
check("full registry: Table + MultiSelect + phủ 100% field value", () => {
  const reg = createFullRegistry();
  assert.ok(reg.resolve("Table"), "có Table");
  assert.ok(reg.resolve("Table MultiSelect"), "có Table MultiSelect");
  const missing = reg.missing().sort();
  const expected = ["Button", "Column Break", "Fold", "HTML", "Heading", "Section Break", "Tab Break"].sort();
  assert.deepEqual(missing, expected, "chỉ còn layout + Button (không phải field value)");
  console.log(`      (full registry phủ ${43 - missing.length}/43; còn lại đều là layout/action)`);
});

// 29. AttachControl render: trạng thái rỗng.
check("AttachControl render: rỗng → 'Chưa có tệp'", () => {
  const html = renderToStaticMarkup(
    h(AttachControl, { field: { fieldname: "f", fieldtype: "Attach" }, value: "", onChange: () => {} }),
  );
  assert.ok(html.includes("Chưa có tệp"));
  assert.ok(html.includes('type="file"'));
});

// 30. GeolocationControl render: chưa có vị trí + nút lấy vị trí.
check("GeolocationControl render: nút lấy vị trí", () => {
  const html = renderToStaticMarkup(
    h(GeolocationControl, { field: { fieldname: "loc", fieldtype: "Geolocation" }, value: "", onChange: () => {} }),
  );
  assert.ok(html.includes("Chưa có vị trí"));
  assert.ok(html.includes("Lấy vị trí hiện tại"));
});

// 30b. LinkControl (P1-LINK-01) — 3 trạng thái fail-visible KHÁC nhau, KHÔNG còn gộp chung 1 input
// tự do. Trước fix: !search || !target → free-text input (silent). Giờ: mỗi case 1 chẩn đoán riêng.
check("LinkControl: Dynamic Link chưa chọn nguồn → khoá + hướng dẫn (KHÔNG phải lỗi)", () => {
  const html = renderToStaticMarkup(
    h(LinkControl, {
      field: { fieldname: "reference_name", fieldtype: "Dynamic Link", options: "reference_type" },
      value: "", onChange: () => {},
      // linkTarget undefined (chưa chọn reference_type) — không truyền services cũng ok, target thiếu chặn trước.
    }),
  );
  assert.ok(html.includes("reference_type"), "phải nêu tên field tham chiếu cần chọn trước");
  assert.ok(!html.includes("<input"), "KHÔNG được là input tự do");
});

check("LinkControl: static Link thiếu options → chẩn đoán lỗi cấu hình, KHÔNG input tự do", () => {
  const html = renderToStaticMarkup(
    h(LinkControl, { field: { fieldname: "customer", fieldtype: "Link", options: "" }, value: "", onChange: () => {} }),
  );
  assert.ok(html.includes("customer"), "phải nêu tên field lỗi cấu hình");
  assert.ok(html.includes("cấu hình"), "phải nói rõ đây là lỗi cấu hình (options thiếu)");
  assert.ok(!html.includes("<input"), "KHÔNG được là input tự do");
});

check("LinkControl: options hợp lệ nhưng thiếu services.searchLink → chẩn đoán lỗi hạ tầng, KHÔNG input tự do", () => {
  const html = renderToStaticMarkup(
    h(LinkControl, { field: { fieldname: "customer", fieldtype: "Link", options: "Customer" }, value: "", onChange: () => {} }),
  );
  assert.ok(html.includes("dịch vụ tìm kiếm"), "phải nói rõ thiếu service, không phải field rỗng bình thường");
  assert.ok(!html.includes("<input"), "KHÔNG được là input tự do");
});

check("LinkControl: cờ dev __MF_LINK_ALLOW_FREE_TEXT__ khôi phục input tự do (escape hatch tường minh)", () => {
  (globalThis as { __MF_LINK_ALLOW_FREE_TEXT__?: boolean }).__MF_LINK_ALLOW_FREE_TEXT__ = true;
  try {
    const html = renderToStaticMarkup(
      h(LinkControl, { field: { fieldname: "customer", fieldtype: "Link", options: "" }, value: "abc", onChange: () => {} }),
    );
    assert.ok(html.includes("<input"), "cờ dev bật → phải là input tự do như hành vi cũ");
  } finally {
    delete (globalThis as { __MF_LINK_ALLOW_FREE_TEXT__?: boolean }).__MF_LINK_ALLOW_FREE_TEXT__;
  }
});

// 31. ChildGrid render: cột từ child meta + rows + nút thêm dòng + P1-06 canonical per-row state.
check("ChildGrid render: cột child meta + thêm dòng + resolve depends_on theo row", () => {
  const childMeta: DocTypeMeta = {
    name: "Sales Order Item",
    fields: [
      { fieldname: "item_code", fieldtype: "Data", label: "Mã hàng", in_list_view: 1, reqd: 1 },
      { fieldname: "qty", fieldtype: "Float", label: "SL", in_list_view: 1 },
      // P1-06: field con chỉ hiện khi qty > 5 (depends_on eval theo row)
      { fieldname: "discount", fieldtype: "Float", label: "CK", in_list_view: 1, depends_on: "eval:doc.qty > 5" },
    ],
    permissions: [],
  };
  const html = renderToStaticMarkup(
    h(ChildGrid, {
      childMeta,
      rows: [
        { name: "r1", doctype: "Sales Order Item", item_code: "ITEM-1", qty: 3 },  // qty≤5 → discount ẩn
        { name: "r2", doctype: "Sales Order Item", item_code: "ITEM-2", qty: 10 }, // qty>5 → discount hiện
      ],
      onChange: () => {},
      registry: createFullRegistry(),
    }),
  );
  assert.ok(html.includes("Mã hàng"), "header child");
  assert.ok(html.includes("ITEM-1"), "giá trị cell");
  assert.ok(html.includes("Thêm dòng"), "nút thêm dòng");
  // canonical: row qty=3 → cell discount bị ẩn (placeholder "—"); có ít nhất 1 dấu — cho row đầu
  assert.ok(html.includes("—"), "depends_on ẩn cell discount ở row qty≤5 (P1-06)");
});

// ===== VIEWS: Kanban + Tree =====

// 32. KanbanView render: cột từ board + card nhóm theo field.
check("KanbanView render: cột + nhóm card theo field", () => {
  const kmeta: DocTypeMeta = { name: "Task", title_field: "subject", fields: [], permissions: [] };
  const html = renderToStaticMarkup(
    h(KanbanView, {
      meta: kmeta,
      fieldName: "status",
      columns: ["Open", "Working", "Closed"],
      rows: [
        { name: "T1", doctype: "Task", subject: "A", status: "Open" },
        { name: "T2", doctype: "Task", subject: "B", status: "Working" },
        { name: "T3", doctype: "Task", subject: "C", status: "Working" },
      ],
    }),
  );
  assert.ok(html.includes("Working"), "có cột");
  assert.ok(html.includes(">2<"), "cột Working badge = 2 card");
  assert.ok(html.includes(">A<") || html.includes("A"), "card title");
});

// 33. TreeView render: node gốc + expandable + con khi mở.
check("TreeView render: node + expand", () => {
  const roots: TreeNodeItem[] = [
    { value: "Root A", title: "Nhóm A", expandable: true },
    { value: "Leaf B", title: "Lá B", expandable: false },
  ];
  const kids: Record<string, TreeNodeItem[]> = { "Root A": [{ value: "A-1", title: "Con A1", expandable: false }] };
  const html = renderToStaticMarkup(
    h(TreeView, {
      roots,
      childrenOf: (v: string) => kids[v],
      expanded: new Set(["Root A"]),
      onToggle: () => {},
    }),
  );
  assert.ok(html.includes("Nhóm A"), "node gốc");
  assert.ok(html.includes("Con A1"), "con hiện khi expanded");
  assert.ok(html.includes("Thu gọn"), "node mở → nút Thu gọn (aria-label)");
});

// 34. TreeView: node expandable chưa mở → không render con + hiện ▸.
check("TreeView render: chưa mở → ẩn con", () => {
  const roots: TreeNodeItem[] = [{ value: "Root A", title: "Nhóm A", expandable: true }];
  const html = renderToStaticMarkup(
    h(TreeView, { roots, childrenOf: () => [{ value: "x", title: "Con X" }], expanded: new Set<string>(), onToggle: () => {} }),
  );
  assert.ok(html.includes(">Mở<") || html.includes('"Mở"'), "node đóng → nút Mở (aria-label)");
  assert.ok(!html.includes("Con X"), "con ẩn khi chưa mở");
});

// 35. ReportView render: cột + row (dict) từ query_report.run.
check("ReportView render: columns + result dict", () => {
  const html = renderToStaticMarkup(
    h(ReportView, {
      columns: [
        { label: "Khách", fieldname: "customer", fieldtype: "Data" },
        { label: "Tổng", fieldname: "total", fieldtype: "Currency" },
      ],
      result: [{ customer: "ACME", total: 1000 }],
    }),
  );
  assert.ok(html.includes("Khách"));
  assert.ok(html.includes("ACME"));
  // Cột Currency phải RA ĐỊNH DẠNG có phân cách hàng nghìn, không phải "1000" trần. Không chốt
  // cứng dấu phân cách vì nó theo locale (VN dùng ".", Anh dùng ",").
  assert.ok(/1[.,]000/.test(html), `số tiền phải có phân cách hàng nghìn, nhận được: ${html.slice(0, 200)}`);
});

// 36. ReportView: hỗ trợ result dạng mảng (array row).
check("ReportView render: result array-row", () => {
  const html = renderToStaticMarkup(
    h(ReportView, {
      columns: [{ label: "A", fieldname: "a" }, { label: "B", fieldname: "b" }],
      result: [["x", "y"]],
    }),
  );
  assert.ok(html.includes(">x<") || html.includes("x"));
  assert.ok(html.includes("y"));
});

// 37. PrintView render: iframe srcDoc = html print.
check("PrintView render: iframe với html", () => {
  const html = renderToStaticMarkup(h(PrintView, { html: "<style>.a{}</style><div>HÓA ĐƠN</div>" }));
  assert.ok(html.includes("<iframe"), "dùng iframe cô lập");
  assert.ok(html.toLowerCase().includes("srcdoc"), "có srcDoc");
  assert.ok(html.includes("HÓA ĐƠN"), "nội dung print trong iframe");
});

// 38. DashboardView render: number card + chart bar (SVG).
check("DashboardView render: number card + chart", () => {
  const html = renderToStaticMarkup(
    h(DashboardView, {
      cards: [{ label: "Đơn tháng này", value: 128, trend: 12 }],
      charts: [{ title: "Doanh thu", labels: ["T1", "T2", "T3"], datasets: [{ values: [10, 30, 20] }] }],
    }),
  );
  assert.ok(html.includes("Đơn tháng này"));
  assert.ok(html.includes("128"));
  assert.ok(html.includes("Doanh thu"));
  assert.ok(html.includes("recharts-responsive-container") || html.includes("recharts"), "chart Recharts mount");
});

// 39. CalendarView render: lưới tháng + event đúng ngày.
check("CalendarView render: lưới tháng + event", () => {
  const html = renderToStaticMarkup(
    h(CalendarView, {
      year: 2026,
      month: 7,
      dateField: "exp_date",
      titleField: "subject",
      events: [{ name: "E1", doctype: "Task", subject: "Họp KO", exp_date: "2026-07-15" }],
    }),
  );
  assert.ok(html.includes("Tháng 7/2026"), "tiêu đề tháng");
  assert.ok(html.includes("Họp KO"), "event hiện trong lưới");
  assert.ok(html.includes(">15<") || html.includes("15"), "ngày 15");
});

// 45b. List LOGIC: search + standard-filter + sort + pagination (client + server query).
check("List logic: filter/search/sort/paginate + server query", () => {
  const lm: DocTypeMeta & { search_fields?: string } = {
    name: "T", title_field: "s", search_fields: "s",
    fields: [
      { fieldname: "s", fieldtype: "Data", label: "S", in_list_view: 1 },
      { fieldname: "status", fieldtype: "Select", label: "TT", options: "Open\nClosed", in_list_view: 1, in_standard_filter: 1 },
      { fieldname: "amt", fieldtype: "Int", label: "Số", in_list_view: 1 },
    ],
    permissions: [],
  };
  const many: Doc[] = Array.from({ length: 5 }, (_, i) => ({ name: `R${i}`, doctype: "T", s: `row${i}`, status: i % 2 ? "Closed" : "Open", amt: i }));

  // pagination
  const p1 = applyClientQuery(lm, many, { ...emptyListState(), pageSize: 2 });
  assert.equal(p1.total, 5, "total = toàn bộ");
  assert.equal(p1.rows.length, 2, "trang 1 có 2 row");
  assert.equal(p1.rows[0]!.name, "R0");

  // standard filter status=Open
  const f = applyClientQuery(lm, many, { ...emptyListState(), pageSize: 10, filters: { status: "Open" } });
  assert.equal(f.total, 3, "3 row Open");

  // search "row3"
  const s = applyClientQuery(lm, many, { ...emptyListState(), pageSize: 10, q: "row3" });
  assert.equal(s.total, 1, "search khớp 1");

  // sort amt desc
  const so = applyClientQuery(lm, many, { ...emptyListState(), pageSize: 10, sort: "amt:desc" });
  assert.equal(so.rows[0]!.amt, 4, "sort desc → lớn nhất trước");

  // standard filters derive + server query
  assert.ok(deriveStandardFilters(lm).some((x) => x.fieldname === "status"), "status là standard filter");
  assert.ok(deriveSearchFields(lm).includes("s"), "s là search field");
  const q = buildServerQuery(lm, { ...emptyListState(), q: "abc", filters: { status: "Open" }, page: 2, pageSize: 20 }, deriveColumns(lm));
  assert.equal(q.limitStart, 20, "page 2 → limit_start 20");
  assert.ok(Array.isArray(q.orFilters) && q.orFilters!.length >= 1, "search → orFilters LIKE");
  assert.ok(Array.isArray(q.filters), "standard filter → filters");

  // P1-10: countQuery KHỚP list — search sinh orFilters GIỐNG buildServerQuery (đếm = số dòng).
  const cq = countQuery(lm, { ...emptyListState(), q: "abc", filters: { status: "Open" } });
  assert.deepEqual(cq.orFilters, q.orFilters, "count orFilters khớp list orFilters (search)");
  assert.ok(Array.isArray(cq.filters) && cq.filters!.length >= 1, "count filters có standard filter");
  // không search → không orFilters (dùng get_count nhanh)
  const cq0 = countQuery(lm, { ...emptyListState(), filters: { status: "Open" } });
  assert.equal(cq0.orFilters, undefined, "không search → count không orFilters");
});

// 45c. Form actions LOGIC (metadata-driven: docstatus + submittable + perms + workflow).
check("Form actions: metadata-driven (docstatus/perms/workflow)", () => {
  const base: FormActionCtx = { docstatus: 0, isSubmittable: false, isNew: false, dirty: true, hasWorkflow: false, perms: {} };
  const kinds = (c: FormActionCtx) => resolveFormActions(c).map((a) => a.kind);

  // Draft + write → Lưu
  assert.ok(kinds({ ...base, perms: { write: true } }).includes("save"), "Draft+write → save");

  // Draft + submittable + submit, KHÔNG workflow → có submit
  assert.ok(kinds({ ...base, isSubmittable: true, perms: { write: true, submit: true } }).includes("submit"), "submit khi submittable+submit");

  // CÓ workflow → KHÔNG submit thủ công
  assert.ok(!kinds({ ...base, isSubmittable: true, hasWorkflow: true, perms: { write: true, submit: true } }).includes("submit"), "workflow ẩn submit thủ công");

  // Submitted + cancel → có cancel
  assert.ok(kinds({ ...base, docstatus: 1, perms: { cancel: true } }).includes("cancel"), "submitted+cancel → cancel");

  // Cancelled + amend → có amend
  assert.ok(kinds({ ...base, docstatus: 2, perms: { amend: true } }).includes("amend"), "cancelled+amend → amend");

  // delete + đã lưu → có delete (menu, destructive)
  const del = resolveFormActions({ ...base, perms: { delete: true } }).find((a) => a.kind === "delete");
  assert.ok(del && del.inMenu && del.variant === "destructive", "delete trong menu, destructive");

  // KHÔNG perm → không nút nào CẦN QUYỀN (metadata-driven, không hiện cứng).
  // "In" là ngoại lệ CỐ Ý: đang mở được bản ghi nghĩa là đã có quyền đọc, in chỉ là đọc lại bản
  // đã lưu nên không gác thêm quyền riêng. Vì vậy kiểm theo TỪNG kind thay vì đếm số nút — đếm
  // sẽ vỡ mỗi lần thêm một hành động không cần quyền, mà không nói được là vỡ vì cái gì.
  const noPerm = resolveFormActions({ ...base, perms: {} }).map((a) => a.kind);
  assert.deepEqual(noPerm, ["print"], `không quyền → chỉ còn In, nhận được: ${noPerm.join(",")}`);

  // WorkflowResolver presentation: dedupe action
  const wf = resolveWorkflowActions([
    { action: "Approve", next_state: "Approved" },
    { action: "Approve", next_state: "Approved" },
    { action: "Reject", next_state: "Rejected" },
  ]);
  assert.equal(wf.length, 2, "dedupe transitions theo action");
});

// 45d. P0-04 — dirty-submit guard: thao tác đổi trạng thái KHÔNG chạy trên form chưa lưu.
check("Form actions: dirty guard (P0-04) khoá Gửi/Huỷ/Sửa đổi khi dirty", () => {
  const clean: FormActionCtx = { docstatus: 0, isSubmittable: false, isNew: false, dirty: false, hasWorkflow: false, perms: {} };
  const find = (c: FormActionCtx, k: string) => resolveFormActions(c).find((a) => a.kind === k);

  // Submit: dirty → disabled + có lý do; clean → enabled
  const subDirty = find({ ...clean, dirty: true, isSubmittable: true, perms: { write: true, submit: true } }, "submit");
  assert.ok(subDirty && subDirty.disabled === true && !!subDirty.disabledReason, "submit dirty → disabled + reason");
  const subClean = find({ ...clean, isSubmittable: true, perms: { write: true, submit: true } }, "submit");
  assert.ok(subClean && !subClean.disabled, "submit clean → enabled");

  // Cancel (submitted): dirty → disabled
  const canDirty = find({ ...clean, docstatus: 1, dirty: true, perms: { cancel: true } }, "cancel");
  assert.ok(canDirty && canDirty.disabled === true, "cancel dirty → disabled");
  const canClean = find({ ...clean, docstatus: 1, perms: { cancel: true } }, "cancel");
  assert.ok(canClean && !canClean.disabled, "cancel clean → enabled");

  // Amend (cancelled): dirty → disabled
  const amDirty = find({ ...clean, docstatus: 2, dirty: true, perms: { amend: true } }, "amend");
  assert.ok(amDirty && amDirty.disabled === true, "amend dirty → disabled");

  // Delete: KHÔNG bị khoá bởi dirty (xoá không phụ thuộc snapshot)
  const delDirty = find({ ...clean, dirty: true, perms: { delete: true } }, "delete");
  assert.ok(delDirty && !delDirty.disabled, "delete KHÔNG khoá theo dirty");

  // Save: dirty → enabled (nút giải quyết); clean → disabled (không có gì để lưu)
  const saveDirty = find({ ...clean, dirty: true, perms: { write: true } }, "save");
  assert.ok(saveDirty && !saveDirty.disabled, "save dirty → enabled");
  const saveClean = find({ ...clean, perms: { write: true } }, "save");
  assert.ok(saveClean && saveClean.disabled === true, "save clean → disabled (không dirty)");
});

// ===== BUILDER + SHELL + GANTT (làm nốt code) =====

// 40. History undo/redo.
check("BuilderKernel History: undo/redo", () => {
  const hh = new History<number>(1);
  hh.set(2);
  hh.set(3);
  assert.equal(hh.get(), 3);
  assert.equal(hh.undo(), true);
  assert.equal(hh.get(), 2);
  assert.equal(hh.redo(), true);
  assert.equal(hh.get(), 3);
  assert.equal(hh.canRedo(), false);
});

// 41. meta-build: add/update/move/remove PURE.
check("meta-build: add/update/move/remove", () => {
  let m = blankDocType("Test");
  m = addField(m, newField("Data"));
  m = addField(m, newField("Select"));
  assert.equal(m.fields.length, 2);
  const fn0 = m.fields[0]!.fieldname;
  m = updateField(m, fn0, { label: "Tên", reqd: 1 });
  assert.equal(m.fields[0]!.label, "Tên");
  assert.equal(m.fields[0]!.reqd, 1);
  m = moveField(m, 0, 1);
  assert.equal(m.fields[1]!.fieldname, fn0);
  m = removeField(m, fn0);
  assert.equal(m.fields.length, 1);
});

// 41b. Gate 6.1 — diffMeta tất định: added/removed/changed/reordered/doc + metaEqual round-trip.
check("diffMeta: added/removed/changed/reordered/doc + metaEqual", () => {
  const base: DocTypeMeta = {
    name: "Task", title_field: "subject", is_submittable: 0,
    fields: [
      { fieldname: "subject", fieldtype: "Data", label: "Chủ đề" },
      { fieldname: "status", fieldtype: "Select", options: "Open\nClosed" },
      { fieldname: "old", fieldtype: "Data" },
    ],
    permissions: [],
  };
  // draft: đổi label subject, thêm priority, bỏ old, đảo thứ tự status↔subject, đổi is_submittable
  const draft: DocTypeMeta = {
    name: "Task", title_field: "subject", is_submittable: 1,
    fields: [
      { fieldname: "status", fieldtype: "Select", options: "Open\nClosed" },
      { fieldname: "subject", fieldtype: "Data", label: "Tiêu đề" },
      { fieldname: "priority", fieldtype: "Select", options: "Low\nHigh" },
    ],
    permissions: [],
  };
  const d = diffMeta(base, draft);
  assert.deepEqual(d.added.map((f) => f.fieldname), ["priority"], "added=priority");
  assert.deepEqual(d.removed.map((f) => f.fieldname), ["old"], "removed=old");
  assert.equal(d.changed.length, 1, "1 field changed (subject.label)");
  assert.equal(d.changed[0]!.fieldname, "subject");
  assert.deepEqual(d.changed[0]!.props.label, { from: "Chủ đề", to: "Tiêu đề" });
  assert.equal(d.reordered, true, "subject/status đảo → reordered");
  assert.ok(d.doc.is_submittable && d.doc.is_submittable.from === 0 && d.doc.is_submittable.to === 1, "doc.is_submittable 0→1");
  assert.equal(hasChanges(d), true);

  // tất định: chạy lại cho kết quả GIỐNG (không phụ thuộc thứ tự duyệt)
  assert.equal(JSON.stringify(diffMeta(base, draft)), JSON.stringify(d), "diff tất định");

  // metaEqual: bằng chính nó → true; clone khác thứ tự KEY prop → vẫn equal (semantic)
  assert.equal(metaEqual(base, base), true, "equal chính nó");
  const clone: DocTypeMeta = { ...base, fields: base.fields.map((f) => ({ ...f })) };
  assert.equal(metaEqual(base, clone), true, "clone → semantic equal");
  assert.equal(metaEqual(base, draft), false, "khác → not equal");
  // _compat/idx KHÔNG tính là changed (khoá tính toán/thứ tự)
  const tagged: DocTypeMeta = { ...base, fields: base.fields.map((f) => ({ ...f, _compat: "SUPPORTED", idx: 9 })) };
  assert.equal(metaEqual(base, tagged), true, "_compat/idx bỏ qua");
});

// 41b2. P2-BUILDER-01 (review độc lập) — diffMeta.permissions: đổi CHỈ quyền (không đụng field/doc
// prop nào) PHẢI báo hasChanges=true và metaEqual=false; trước fix cả 2 đều sai (bỏ qua permissions
// hoàn toàn) ⇒ nút Apply không bật + round-trip coi 2 meta khác quyền là "giống hệt".
check("diffMeta.permissions: add/remove/change rule (role,permlevel,if_owner) + gate Apply/metaEqual", () => {
  const withPerms = (perms: DocTypeMeta["permissions"]): DocTypeMeta => ({
    name: "Task", fields: [{ fieldname: "subject", fieldtype: "Data" }], permissions: perms ?? [],
  });

  // 2 hàng CÙNG role+permlevel, khác if_owner — permRuleKey PHẢI phân biệt được (không gộp nhầm).
  const baseline = withPerms([
    { role: "Desk User", permlevel: 0, read: 1, write: 0, if_owner: 0 },
    { role: "Desk User", permlevel: 0, read: 0, write: 1, create: 1, if_owner: 1 },
  ]);
  assert.equal(
    permRuleKey({ role: "Desk User", permlevel: 0, if_owner: 0 }),
    "Desk User|0|0",
  );
  assert.notEqual(
    permRuleKey({ role: "Desk User", permlevel: 0, if_owner: 0 }),
    permRuleKey({ role: "Desk User", permlevel: 0, if_owner: 1 }),
    "khác if_owner → khác khoá dù cùng role+permlevel",
  );

  // draft: đổi write của rule if_owner=0 (0→1) + thêm 1 role mới + bỏ rule if_owner=1.
  const draft = withPerms([
    { role: "Desk User", permlevel: 0, read: 1, write: 1, if_owner: 0 },
    { role: "Sales User", permlevel: 0, read: 1, write: 1, if_owner: 0 },
  ]);

  const d = diffMeta(baseline, draft);
  assert.equal(d.added.length, 0, "field/doc không đổi (chỉ permissions)");
  assert.equal(d.changed.length, 0);
  assert.equal(Object.keys(d.doc).length, 0);

  assert.equal(d.permissions.added.length, 1, "thêm rule Sales User");
  assert.equal(d.permissions.added[0]!.role, "Sales User");
  assert.equal(d.permissions.removed.length, 1, "mất rule if_owner=1");
  assert.equal(d.permissions.removed[0]!.if_owner, 1);
  assert.equal(d.permissions.changed.length, 1, "rule if_owner=0 đổi write");
  assert.deepEqual(d.permissions.changed[0]!.props.write, { from: 0, to: 1 });

  // ĐIỂM MẤU CHỐT của fix: field/doc rỗng nhưng permissions đổi → vẫn phải bật Apply + not-equal.
  assert.equal(hasChanges(d), true, "hasChanges PHẢI true dù chỉ permissions đổi (trước fix: false)");
  assert.equal(metaEqual(baseline, draft), false, "metaEqual PHẢI false dù chỉ permissions đổi (trước fix: true)");

  // diffPermissions xuất trực tiếp (dùng độc lập, không qua diffMeta) — kết quả nhất quán.
  const pd = diffPermissions(baseline.permissions!, draft.permissions!);
  assert.deepEqual(pd, d.permissions, "diffPermissions độc lập khớp diffMeta.permissions");

  // giống hệt (kể cả permissions) → hasChanges=false, metaEqual=true.
  assert.equal(hasChanges(diffMeta(baseline, baseline)), false);
  assert.equal(metaEqual(baseline, baseline), true);

  // PHÁT HIỆN LIVE (permissions-roundtrip-live.mjs): rule server reload LUÔN có đủ mọi ptype (0 tường
  // minh cho submit/cancel/amend chưa bật), nhưng rule 1 draft tự construct (Builder/CLI) thường CHỈ
  // set ptype họ chạm tới, BỎ TRỐNG phần còn lại. undefined (draft) và 0 (server) PHẢI coi tương
  // đương — nếu không, mọi round-trip live sẽ báo lệch permission GIẢ dù không đổi gì thật.
  const partial = withPerms([{ role: "Desk User", permlevel: 0, read: 1, write: 1, if_owner: 0 }]); // KHÔNG set create/delete/submit/cancel/amend
  const full = withPerms([{ role: "Desk User", permlevel: 0, read: 1, write: 1, create: 0, delete: 0, submit: 0, cancel: 0, amend: 0, if_owner: 0 }]);
  assert.equal(metaEqual(partial, full), true, "ptype undefined (draft) ≡ 0 tường minh (server reload) — KHÔNG báo changed giả");
  // nhưng 0 khác 1 vẫn phải báo changed thật (không làm mù mọi khác biệt).
  const changed1 = withPerms([{ role: "Desk User", permlevel: 0, read: 1, write: 1, create: 1, if_owner: 0 }]);
  assert.equal(metaEqual(partial, changed1), false, "0/undefined ≡ nhau, nhưng 1 vẫn PHẢI khác 0/undefined");
});

// 41c. Gate 6.2 — validateDraft (fieldname/options/title_field) + openDraft/draftStatus gate apply.
check("validateDraft + draft session (validate-trước-apply)", () => {
  const ok: DocTypeMeta = {
    name: "Task",
    title_field: "subject",
    fields: [
      { fieldname: "subject", fieldtype: "Data" },
      { fieldname: "customer", fieldtype: "Link", options: "Customer" },
      { fieldname: "status", fieldtype: "Select", options: "Open\nClosed" },
    ],
    permissions: [],
  };
  assert.equal(validateDraft(ok).ok, true, "meta hợp lệ → ok");

  // fieldname không hợp lệ + trùng + reserved
  const badName = validateDraft({ name: "X", fields: [{ fieldname: "Bad Name", fieldtype: "Data" }], permissions: [] });
  assert.ok(badName.issues.some((i) => i.code === "fieldname_invalid"), "fieldname có space → error");
  const dup = validateDraft({ name: "X", fields: [{ fieldname: "a", fieldtype: "Data" }, { fieldname: "a", fieldtype: "Data" }], permissions: [] });
  assert.ok(!dup.ok && dup.issues.some((i) => i.code === "fieldname_dup"), "trùng fieldname → error");
  const reserved = validateDraft({ name: "X", fields: [{ fieldname: "name", fieldtype: "Data" }], permissions: [] });
  assert.ok(reserved.issues.some((i) => i.code === "fieldname_reserved"), "'name' hệ thống → error");

  // Link thiếu options → error; Select thiếu options → warning (KHÔNG chặn)
  const link = validateDraft({ name: "X", fields: [{ fieldname: "c", fieldtype: "Link" }], permissions: [] });
  assert.ok(!link.ok && link.issues.some((i) => i.code === "options_required"), "Link thiếu options → error");
  const sel = validateDraft({ name: "X", fields: [{ fieldname: "s", fieldtype: "Select" }], permissions: [] });
  assert.equal(sel.ok, true, "Select rỗng → chỉ warning, vẫn ok");
  assert.ok(sel.issues.some((i) => i.severity === "warning" && i.code === "select_empty"));

  // title_field trỏ sai / trỏ layout → error
  assert.ok(validateDraft({ name: "X", title_field: "ghost", fields: [{ fieldname: "a", fieldtype: "Data" }], permissions: [] }).issues.some((i) => i.code === "title_field"), "title_field ma → error");
  assert.ok(validateDraft({ name: "X", title_field: "sec", fields: [{ fieldname: "sec", fieldtype: "Section Break" }], permissions: [] }).issues.some((i) => i.code === "title_field_layout"), "title_field layout → error");

  // openDraft: baseline canonical + draft clone; draftStatus gate apply
  const session = openDraft({ name: "Task", fields: [{ fieldname: "subject", fieldtype: "Data" }], permissions: [] });
  assert.equal(session.baseline.fields[0]!._compat, "SUPPORTED", "baseline qua normalizeMeta (tag _compat)");
  assert.equal(metaEqual(session.baseline, session.draft), true, "draft = clone baseline lúc mở");
  assert.equal(draftStatus(session).canApply, false, "chưa đổi → không apply");
  // sửa hợp lệ → canApply true
  session.draft = addField(session.draft, { fieldname: "note", fieldtype: "Data" });
  assert.equal(draftStatus(session).canApply, true, "đổi hợp lệ → apply được");
  // sửa thành không hợp lệ → canApply false dù có thay đổi
  session.draft = addField(session.draft, { fieldname: "note", fieldtype: "Data" }); // trùng
  const st = draftStatus(session);
  assert.equal(st.canApply, false, "có lỗi validate → KHÔNG apply (fail-closed)");
  assert.ok(hasChanges(st.diff), "vẫn có diff");
});

// 41d. Gate 6.3 — apply serializer + round-trip cấp serializer (semantic equality).
check("serializeDocTypeForSave + roundTripLocal (semantic equality)", () => {
  const session = openDraft({
    name: "Widget",
    modified: "2026-07-24 10:00:00", // OCC token từ server
    title_field: "label",
    fields: [
      { fieldname: "label", fieldtype: "Data" },
      { fieldname: "supplier", fieldtype: "Link", options: "Supplier" },
      { fieldname: "notes", fieldtype: "Text Editor" }, // PARTIAL — vẫn serialize bình thường
    ],
    permissions: [{ role: "System Manager", read: 1, write: 1 }],
  });
  const payload = serializeDocTypeForSave(session);
  assert.equal(payload.doctype, "DocType");
  assert.equal(payload.name, "Widget");
  assert.equal(payload.modified, "2026-07-24 10:00:00", "OCC modified gửi kèm (conflict detection)");
  // fields: idx tăng dần + envelope child-row + KHÔNG _compat
  assert.deepEqual(payload.fields.map((f) => f.idx), [1, 2, 3], "idx theo thứ tự");
  assert.equal(payload.fields[0]!.parenttype, "DocType");
  assert.equal(payload.fields[0]!.parentfield, "fields");
  assert.equal("_compat" in payload.fields[0]!, false, "strip _compat khỏi payload");

  // ROUND-TRIP cấp serializer: serialize → normalize ≈ draft (bỏ plumbing/computed)
  const reloaded = roundTripLocal(session);
  assert.equal(metaEqual(reloaded, session.draft), true, "round-trip serializer semantic-equal draft");

  // sửa rồi round-trip: vẫn equal với draft đã sửa (không mất field/prop)
  session.draft = addField(session.draft, { fieldname: "qty", fieldtype: "Int", reqd: 1 });
  assert.equal(metaEqual(roundTripLocal(session), session.draft), true, "round-trip sau khi thêm field");
  // đổi thứ tự → round-trip vẫn giữ đúng thứ tự (không reorder giả)
  session.draft = moveField(session.draft, 0, 3);
  assert.equal(metaEqual(roundTripLocal(session), session.draft), true, "round-trip giữ thứ tự");
});

// 41e. Serializer #1 — planCustomization: diff STANDARD doctype → Custom Field / Property Setter.
check("planCustomization: added→CF · changed→PS · doc→PS · removed(custom→del, chuẩn→warn)", () => {
  const baseline: DocTypeMeta = {
    name: "ToDo", is_submittable: 0,
    fields: [
      { fieldname: "description", fieldtype: "Text Editor", label: "Mô tả" },
      { fieldname: "status", fieldtype: "Select", options: "Open\nClosed" },
      { fieldname: "legacy_custom", fieldtype: "Data", is_custom_field: 1 }, // custom field cũ
    ],
    permissions: [],
  };
  const draft: DocTypeMeta = {
    name: "ToDo", is_submittable: 1, // đổi doc-level prop
    fields: [
      { fieldname: "description", fieldtype: "Text Editor", label: "Nội dung" }, // đổi label
      { fieldname: "status", fieldtype: "Select", options: "Open\nClosed" },
      { fieldname: "sla_hours", fieldtype: "Int", label: "SLA (giờ)" }, // field MỚI
    ],
    permissions: [],
  };
  const diff = diffMeta(baseline, draft);
  const order = draft.fields.map((f) => f.fieldname);
  const plan = planCustomization("ToDo", diff, order);

  // added → Custom Field, insert_after = field liền trước (status)
  assert.equal(plan.customFields.length, 1, "1 custom field");
  assert.equal(plan.customFields[0]!.fieldname, "sla_hours");
  assert.equal(plan.customFields[0]!.insert_after, "status", "insert_after theo thứ tự draft");
  // changed label → Property Setter (DocField, property_type Data)
  const psLabel = plan.propertySetters.find((p) => p.field_name === "description" && p.property === "label");
  assert.ok(psLabel && psLabel.value === "Nội dung" && psLabel.doctype_or_field === "DocField", "PS label field");
  // doc-level is_submittable → Property Setter (DocType, Check)
  const psDoc = plan.propertySetters.find((p) => p.doctype_or_field === "DocType" && p.property === "is_submittable");
  assert.ok(psDoc && psDoc.field_name === null && psDoc.property_type === "Check" && psDoc.value === 1, "PS doc is_submittable");
  // removed custom field (legacy_custom) → deletion; KHÔNG có field chuẩn nào removed ở đây
  assert.equal(plan.deletions.length, 1, "xoá 1 custom field");
  assert.equal(plan.deletions[0]!.fieldname, "legacy_custom");

  // removed field CHUẨN → warning (không xoá được)
  const draft2: DocTypeMeta = { name: "ToDo", fields: [{ fieldname: "description", fieldtype: "Text Editor" }], permissions: [] };
  const plan2 = planCustomization("ToDo", diffMeta(baseline, draft2), ["description"]);
  assert.ok(plan2.warnings.some((w) => w.code === "standard_field_no_delete" && w.fieldname === "status"), "xoá field chuẩn → warn");
  assert.ok(plan2.deletions.some((d) => d.fieldname === "legacy_custom"), "vẫn xoá custom field");
});

// 41f. Serializer #2 Workflow — validate + serialize (state/transition/role/docstatus).
check("serializeWorkflow + validateWorkflow", () => {
  const wf = {
    name: "ToDo Approval", document_type: "ToDo", workflow_state_field: "workflow_state",
    states: [{ state: "Pending", doc_status: 0 as const }, { state: "Approved", doc_status: 1 as const }],
    transitions: [{ state: "Pending", action: "Approve", next_state: "Approved", allowed: "System Manager" }],
  };
  assert.equal(validateWorkflow(wf).ok, true, "workflow hợp lệ");
  const p = serializeWorkflow(wf);
  assert.equal(p.doctype, "Workflow");
  assert.equal(p.states[0]!.doctype, "Workflow Document State");
  assert.equal(p.states[0]!.doc_status, "0", "doc_status = chuỗi Frappe");
  assert.equal(p.transitions[0]!.doctype, "Workflow Transition");
  assert.equal(p.transitions[0]!.allowed, "System Manager");
  // lỗi: transition trỏ state không tồn tại + thiếu action
  const bad = validateWorkflow({ ...wf, transitions: [{ state: "Ghost", action: "", next_state: "Approved", allowed: "" }] });
  assert.ok(!bad.ok && bad.issues.some((i) => i.code === "trans_from") && bad.issues.some((i) => i.code === "trans_action"), "transition sai → error");
  // workflowMasters: state/action master phải insert TRƯỚC (Frappe Link) — phát hiện lúc live
  const mst = workflowMasters(wf);
  assert.deepEqual(mst.states.sort(), ["Approved", "Pending"], "unique state master");
  assert.deepEqual(mst.actions, ["Approve"], "unique action master");
  // defaultEditRole áp cho state chưa có allow_edit (Frappe bắt buộc)
  assert.equal(serializeWorkflow(wf, { defaultEditRole: "All" }).states[0]!.allow_edit, "All", "defaultEditRole");
});

// 41g. Serializer #3 Print Format — html Jinja an toàn từ block visible.
check("serializePrintFormat + printHtml", () => {
  const m = { name: "ToDo Print", doc_type: "ToDo", blocks: [
    { fieldname: "description", label: "Mô tả", visible: true },
    { fieldname: "status", label: "Trạng thái", visible: true },
    { fieldname: "secret", label: "Ẩn", visible: false },
  ] };
  assert.equal(validatePrintFormat(m).ok, true);
  const p = serializePrintFormat(m);
  assert.equal(p.doctype, "Print Format");
  assert.equal(p.print_format_type, "Jinja");
  assert.ok(p.html.includes("{{ doc.description }}") && p.html.includes("{{ doc.status }}"), "field visible → Jinja");
  assert.ok(!p.html.includes("secret"), "field ẩn → bỏ");
  // escape: fieldname/label không phá HTML
  const evil = serializePrintFormat({ name: "X", doc_type: "Y", blocks: [{ fieldname: "a", label: "<script>", visible: true }] });
  assert.ok(!evil.html.includes("<script>") && evil.html.includes("&lt;script&gt;"), "label escape (không inject)");
});

// 41h. Serializer #4 Dashboard — multi-doc plan (Number Card + Chart + Dashboard link).
check("serializeDashboard + validateDashboard", () => {
  const m = {
    name: "Kho Dashboard",
    cards: [{ label: "Tổng ToDo", document_type: "ToDo", function: "Count" as const }],
    charts: [{ title: "ToDo theo trạng thái", chart_type: "Bar" as const, document_type: "ToDo" }],
  };
  assert.equal(validateDashboard(m).ok, true);
  const plan = serializeDashboard(m);
  assert.equal(plan.numberCards[0]!.doctype, "Number Card");
  assert.equal(plan.charts[0]!.doctype, "Dashboard Chart");
  assert.equal(plan.dashboard.doctype, "Dashboard");
  assert.deepEqual(plan.dashboard.cards, [{ card: "Tổng ToDo" }], "Dashboard link card");
  assert.deepEqual(plan.dashboard.charts, [{ chart: "ToDo theo trạng thái" }], "Dashboard link chart");
  // Sum cần aggregate_field
  const bad = validateDashboard({ name: "X", cards: [{ label: "S", document_type: "ToDo", function: "Sum" as const }], charts: [] });
  assert.ok(!bad.ok && bad.issues.some((i) => i.code === "card_field"), "Sum thiếu aggregate_field → error");
});

// 42. DocTypeBuilder render: palette 43 fieldtype + canvas rỗng.
check("DocTypeBuilder render: palette + canvas", () => {
  const html = renderToStaticMarkup(h(DocTypeBuilder, { initial: blankDocType("New") }));
  assert.ok(html.includes("Currency"), "palette có fieldtype");
  assert.ok(html.includes("Section Break"), "palette có layout break");
  assert.ok(html.includes("Kéo fieldtype"), "canvas rỗng gợi ý kéo");
});

// 43. GanttView render: bar theo start/end.
check("GanttView render: thanh thời gian", () => {
  const html = renderToStaticMarkup(
    h(GanttView, { tasks: [{ name: "t1", label: "BRD", start: "2026-07-01", end: "2026-07-10", progress: 50 }] }),
  );
  assert.ok(html.includes("BRD"));
  assert.ok(html.includes("mf-gantt-bar"), "có thanh gantt");
});

// 44. resolveIcon (@metaforge/shell) — tra ĐỘNG bộ icon lucide-react theo tên kebab-case (review độc
// lập: map tay cố định trước đây "quên" icon là MẤT ÂM THẦM — nay không còn danh sách cố định để quên).
check("resolveIcon: tra động lucide-react theo tên kebab-case", () => {
  assert.ok(renderToStaticMarkup(h("div", null, resolveIcon("layout-grid"))).includes("<svg"), "icon nhiều từ → SVG thật");
  assert.ok(renderToStaticMarkup(h("div", null, resolveIcon("settings"))).includes("<svg"), "icon 1 từ → SVG thật");
  assert.ok(renderToStaticMarkup(h("div", null, resolveIcon("arrow-left-right"))).includes("<svg"), "icon 3 từ (case CLI template cũ bỏ sót) → SVG thật");
  assert.equal(resolveIcon(undefined), undefined, "không tên → undefined (không throw)");
  assert.equal(resolveIcon("khong-ton-tai-xyz"), undefined, "tên không khớp icon nào → undefined, KHÔNG throw (caller tự fallback)");
});

// (44/45 AppShell+CommandPalette render tests đã bỏ: shadcn/Radix/cmdk dùng portal — không SSR
//  sạch; UI shell verify bằng Playwright screenshot/E2E, không bằng selfcheck. Selfcheck = LOGIC.)

console.log(`\nselfcheck OK — ${passed} nhóm assert xanh.`);
