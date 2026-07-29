/**
 * Compiles an app BRIEF into a full app package.
 *
 *   brief (≈20 lines of what the app is)  →  manifest (hundreds of lines of metadata)
 *
 * The brief is the smallest description from which a working app follows: doctypes, their
 * fields, who may do what, the states a document moves through, and how it is presented.
 * Everything else — permission matrices, workflow docstatus bookkeeping, nav routes, print
 * formats, the client manifest — is derivable, and deriving it is the point. Writing that
 * by hand is where the mistakes live: a DocPerm naming a role nothing defines, a workflow
 * whose approving state has the wrong docstatus, a nav route the router cannot reach.
 *
 * Pure and synchronous: no filesystem, no network. It returns the package object that
 * `parseAppManifest` validates, so a brief that compiles cannot fail installation for a
 * shape reason — and the compiler can be tested without deploying anything.
 */

/** Permission letters. Deliberately few — the rest are derived below. */
const PERMISSION_LETTERS = {
  r: "read", w: "write", c: "create", s: "submit", x: "cancel", a: "amend",
};

/**
 * Letters that LOOK like rights but are not separate ones in this kernel.
 *
 * `d` is refused rather than accepted-and-ignored, and the difference matters. Deleting is
 * a write-class action here — `deleteDocument` authorises through `loadWritable`, and the
 * metadata layer reports `delete` as a copy of `write`. So a brief that writes `"rwc"`
 * believing it withholds deletion is wrong: that role CAN delete. Accepting `d` would let
 * an author encode a policy the platform does not implement and never learn otherwise,
 * which is the "declared but read by nothing" failure this project has hit before.
 */
const NON_LETTERS = {
  d: "deleting is a write-class action in this kernel, so `w` already grants it — there is no separate delete right to withhold",
};

/**
 * Rights that follow from being able to read, granted automatically.
 *
 * Withholding them is almost never what an author means: a role that may read a document
 * but not print or export it is a specific, unusual policy, and making it the DEFAULT
 * produces apps whose print button silently does nothing. An author who wants that can
 * still write the DocType by hand.
 */
const READ_IMPLIES = ["print", "email", "report", "export"];

const FIELD_TYPES = new Map([
  "Data", "Small Text", "Text", "Long Text", "Code", "Int", "Float", "Currency", "Percent",
  "Check", "Date", "Datetime", "Time", "Select", "Link", "Dynamic Link", "Table",
  "Table MultiSelect", "JSON", "Attach", "Attach Image", "Heading", "Section Break",
  "Column Break", "HTML", "Text Editor", "Markdown Editor", "Password", "Read Only",
  "Barcode", "Color", "Duration", "Geolocation", "Icon", "Image", "Rating", "Signature",
  "Phone", "Autocomplete", "Button",
].map((type) => [type.toLowerCase().replace(/\s+/g, ""), type]));

/** Types whose meaning depends on `options`, so an author cannot forget it. */
const NEEDS_OPTIONS = new Set(["Link", "Select", "Table", "Table MultiSelect", "Dynamic Link"]);

export class BriefError extends Error {}

const fail = (message) => { throw new BriefError(message); };

/**
 * Write actions a validator may name — the SERVER's list, restated here.
 *
 * Restated rather than imported because the compiler runs before anything is built, and
 * the two are pinned together by `tests/compile-brief.test.mjs`. Without this check a
 * plausible-but-wrong action (`insert`, the name every other system uses for this) got
 * past the compiler and was rejected by the server's parser as
 * "COMPILE_PRODUCED_INVALID_PACKAGE … This is a compiler defect" — which blames the tool
 * for the author's typo and says nothing about what to write instead.
 */
const VALIDATOR_ACTIONS = ["create", "save", "submit", "cancel", "amend", "delete"];

/**
 * Một cột báo cáo, viết gọn: `<field>:<Type> Nhãn` hoặc `sum(<field>):<Type> Nhãn`.
 *
 * Cùng lối viết với field của doctype, vì cùng một người viết cả hai trong một file. Bốn
 * phép gộp `sum/avg/min/max` tính trên field được nêu; `count(name)` đếm BẢN GHI — field
 * chỉ để câu viết ra đọc được, server bỏ qua nó.
 */
const REPORT_COLUMN = /^(?:(count|sum|avg|min|max)\(([a-z_][a-z0-9_]*)\)|([a-z_][a-z0-9_]*))(?::([A-Za-z ]+)(?:\(([^)]+)\))?)?(?:\s+(.+))?$/;

function compileReportColumn(raw, where) {
  if (typeof raw !== "string") fail(`${where} phải là chuỗi dạng "field:Type Nhãn".`);
  const match = REPORT_COLUMN.exec(raw.trim());
  if (!match) fail(`${where} không đọc được: "${raw}". Ví dụ: "class_group:Link(Class Group) Lớp học", "sum(amount):Currency Tổng tiền".`);
  const [, aggregate, aggregateField, plainField, type, options, label] = match;
  const field = aggregateField ?? plainField;
  const fieldtype = (type ?? (aggregate === "count" ? "Int" : "Data")).trim();
  // Cùng lối viết với field của doctype: `Link(Class Group)`. Link mà không nêu doctype
  // đích thì client không giải được nhãn và cột in ra mã — đúng lỗi đã phải sửa ở
  // danh sách và ở lịch.
  if (fieldtype === "Link" && !options) fail(`${where} là Link nhưng chưa nêu doctype đích. Viết "${field}:Link(Tên DocType) Nhãn".`);
  return {
    field,
    label: (label ?? titleize(field)).trim(),
    type: fieldtype,
    ...(options ? { options: options.trim() } : {}),
    ...(aggregate ? { aggregate } : {}),
  };
}

function compileReport(report, index, doctypeNames) {
  const where = `reports[${index}]`;
  if (!report?.name) fail(`${where} thiếu \`name\`.`);
  if (!report.doctype) fail(`${where} (${report.name}) thiếu \`doctype\`.`);
  if (!doctypeNames.has(report.doctype)) {
    fail(`${where} (${report.name}) đọc doctype "${report.doctype}" mà brief này không khai. Có: ${[...doctypeNames].join(", ")}.`);
  }
  const columns = (report.columns ?? []).map((raw, position) => compileReportColumn(raw, `${where}.columns[${position}]`));
  if (!columns.length) fail(`${where} (${report.name}) chưa có cột nào.`);

  let orderBy;
  if (report.orderBy) {
    // "sum(amount) desc" — cùng cách viết với cột, để không phải nhớ hai cú pháp.
    const [expression, direction = "asc"] = String(report.orderBy).trim().split(/\s+/);
    const parsed = compileReportColumn(expression, `${where}.orderBy`);
    if (direction !== "asc" && direction !== "desc") fail(`${where}.orderBy chỉ nhận "asc" hoặc "desc", nhận được "${direction}".`);
    orderBy = { column: parsed.field, direction };
  }

  return {
    name: report.name,
    label: report.label ?? report.name,
    doctype: report.doctype,
    columns,
    ...(report.groupBy ? { group_by: report.groupBy } : {}),
    ...(orderBy ? { order_by: orderBy } : {}),
    filters: report.filters ?? [],
    limit: report.limit ?? 500,
  };
}

/**
 * `"alumdoor.cut.apply | Cắt thật | Cắt và trừ tồn?"` → `{ method, label, confirm }`.
 *
 * Dạng object cũng nhận, cho ai thích viết rõ. Dấu `|` là vì phần lớn action chỉ cần một
 * dòng, và bắt viết ba khoá cho một dòng thì brief dài ra mà không rõ thêm.
 */
function compileActionCall(raw, where) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    if (!raw.method) fail(`${where} thiếu \`method\`.`);
    return { method: raw.method, label: raw.label ?? raw.method, ...(raw.confirm ? { confirm: raw.confirm } : {}) };
  }
  if (typeof raw !== "string") fail(`${where} phải là chuỗi "method | nhãn [| câu hỏi xác nhận]" hoặc object.`);
  const [method, label, confirm] = raw.split("|").map((part) => part.trim());
  if (!method) fail(`${where} thiếu tên method.`);
  return { method, label: label || method, ...(confirm ? { confirm } : {}) };
}

/**
 * Một thao tác dạng form. Xem `AppAction` (packages/app-registry) để biết vì sao nó tồn tại.
 *
 * Field dùng CHUNG cú pháp với field của doctype — `"profile:Link(Item)! Mã nhôm"` — nên
 * người viết brief không phải học cú pháp thứ hai cho cùng một khái niệm.
 */
function compileAction(action, index, doctypeNames) {
  const where = `actions[${index}]`;
  if (!action?.name) fail(`${where} thiếu \`name\`.`);
  if (!action.permission) fail(`${where} (${action.name}) thiếu \`permission\` — doctype dùng để chặn quyền vào màn này.`);
  if (!doctypeNames.has(action.permission)) {
    fail(`${where} (${action.name}) chặn quyền theo "${action.permission}" mà brief này không khai. Có: ${[...doctypeNames].join(", ")}.`);
  }
  if (!action.commit) fail(`${where} (${action.name}) thiếu \`commit\` — màn không có nút chạy thì không phải một thao tác.`);
  const fields = (action.fields ?? []).map((raw, position) => {
    const field = parseField(raw, position, `${where} (${action.name})`);
    // Compiler của doctype còn trả `unique`/`read_only`; màn thao tác không có hai khái
    // niệm đó, và gửi kèm thì parser của server từ chối cả gói.
    const { fieldname, label, fieldtype, options, required, default: value, description } = field;
    return {
      fieldname, label, fieldtype,
      ...(options ? { options } : {}),
      ...(required ? { required: true } : {}),
      ...(value === undefined ? {} : { default: value }),
      ...(description ? { description } : {}),
    };
  });
  if (!fields.length) fail(`${where} (${action.name}) chưa có ô nhập nào.`);
  return {
    name: action.name,
    label: action.label ?? action.name,
    ...(action.icon ? { icon: action.icon } : {}),
    ...(action.group ? { group: action.group } : {}),
    ...(action.description ? { description: action.description } : {}),
    fields,
    ...(action.preview ? { preview: compileActionCall(action.preview, `${where}.preview`) } : {}),
    commit: compileActionCall(action.commit, `${where}.commit`),
    permission_doctype: action.permission,
    ...(action.resultTable ? { result_table: action.resultTable } : {}),
  };
}

/** HTML/CSS viết trong brief: chuỗi, hoặc mảng dòng cho dễ đọc. */
const joinLines = (value) => (Array.isArray(value) ? value.join("\n") : String(value ?? ""));

/**
 * Mẫu in.
 *
 * Bản in là thứ KHÁCH HÀNG cầm, nên nó thuộc về app chứ không phải một thứ ai đó dán vào
 * sau. Lặp dòng hàng viết `{{#each items}} … {{/each}}`, định dạng tiền viết
 * `{{ grand_total | money }}` — xem `renderPrintFormat`.
 */
function compilePrint(print, index, doctypeNames) {
  const where = `prints[${index}]`;
  if (!print?.name) fail(`${where} thiếu \`name\`.`);
  if (!print.doctype) fail(`${where} (${print.name}) thiếu \`doctype\`.`);
  if (!doctypeNames.has(print.doctype)) {
    fail(`${where} (${print.name}) in doctype "${print.doctype}" mà brief này không khai. Có: ${[...doctypeNames].join(", ")}.`);
  }
  const html = joinLines(print.html);
  if (!html.trim()) fail(`${where} (${print.name}) chưa có nội dung \`html\`.`);
  // `{{#each}}` không có `{{/each}}` sẽ in ra nguyên chuỗi mẫu lên giấy giao cho khách.
  const opens = (html.match(/{{#each\s/g) ?? []).length;
  const closes = (html.match(/{{\/each}}/g) ?? []).length;
  if (opens !== closes) fail(`${where} (${print.name}) có ${opens} \`{{#each}}\` nhưng ${closes} \`{{/each}}\`.`);
  return {
    name: print.name,
    doc_type: print.doctype,
    format_type: "Standard",
    html,
    ...(print.css ? { css: joinLines(print.css) } : {}),
    is_default: print.default !== false,
    disabled: false,
    revision: 1,
  };
}

/**
 * Mục menu trỏ tới một BÁO CÁO SẴN CÓ của nền tảng.
 *
 * Nền tảng có sẵn hai chục báo cáo đã chạy được — sổ kho, tồn kho, sổ cái, cân đối, công
 * nợ — nhưng KHÔNG có đường nào đưa chúng vào menu của một app, nên khách không nhìn thấy
 * cái nào. Một tính năng không ai tìm ra thì bằng không có.
 *
 * `permission` là doctype dùng để chặn: báo cáo tồn kho chỉ nên hiện với người được đọc
 * hàng hoá. Bỏ trống thì mục hiện cho mọi vai trò.
 */
function compileLink(link, index, doctypeNames) {
  const where = `links[${index}]`;
  if (!link?.report) fail(`${where} thiếu \`report\` — tên báo cáo của nền tảng.`);
  if (link.permission && !doctypeNames.has(link.permission)) {
    fail(`${where} chặn quyền theo "${link.permission}" mà brief này không khai.`);
  }
  return {
    key: `report:${link.report}`,
    label: link.label ?? link.report,
    kind: "route",
    route: `/report/${encodeURIComponent(link.report)}`,
    ...(link.permission ? { permission_doctype: link.permission } : {}),
    icon: link.icon ?? "bar-chart-3",
    group: link.group ?? "Báo cáo",
  };
}

function assertUniqueNames(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`Trùng ${label}: ${value}`);
    seen.add(value);
  }
}

function compileValidators(validators) {
  if (!Array.isArray(validators)) fail("`validators` phải là một mảng.");
  return validators.map((entry, index) => {
    if (!entry?.doctype) fail(`validators[${index}] thiếu \`doctype\`.`);
    if (entry.actions === undefined) return { doctype: entry.doctype };
    for (const action of entry.actions) {
      if (!VALIDATOR_ACTIONS.includes(action)) {
        fail(`validators[${index}] (${entry.doctype}) khai action "${action}" không tồn tại. Chọn trong: ${VALIDATOR_ACTIONS.join(", ")}. Tạo mới là "create", không phải "insert".`);
      }
    }
    return { doctype: entry.doctype, actions: [...entry.actions] };
  });
}

/**
 * The public face of the app: what a stranger may read, and what they may order.
 *
 * Written in the brief's own vocabulary and translated here into the manifest's, so an
 * author writes `publishedField` next to `fields` rather than learning two spellings of
 * the same idea. The server re-validates every name against the doctype, so a typo is a
 * refused install rather than a storefront that serves nulls.
 */
function compileStorefront(declared) {
  if (declared === null || typeof declared !== "object" || Array.isArray(declared)) {
    fail("`storefront` phải là object có `catalog` (và tuỳ chọn `order`).");
  }
  const catalog = declared.catalog;
  if (!catalog?.doctype) fail("storefront.catalog cần `doctype`.");
  for (const key of ["publishedField", "slugField", "priceField", "fields"]) {
    if (!catalog[key]) fail(`storefront.catalog cần \`${key}\`.`);
  }
  if (!Array.isArray(catalog.fields) || catalog.fields.length === 0) {
    fail("storefront.catalog.fields phải liệt kê ít nhất một field — đây là DANH SÁCH TRẮNG, không phải gợi ý.");
  }

  const compiled = {
    catalog: {
      doctype: catalog.doctype,
      published_field: catalog.publishedField,
      slug_field: catalog.slugField,
      price_field: catalog.priceField,
      fields: [...catalog.fields],
      search_fields: [...(catalog.search ?? [])],
      ...(catalog.facetField ? { facet_field: catalog.facetField } : {}),
    },
  };

  const order = declared.order;
  if (!order) return compiled;
  for (const key of ["doctype", "role", "lines", "placedAt", "total", "trackBy", "buyerFields"]) {
    if (!order[key]) fail(`storefront.order cần \`${key}\`.`);
  }
  if (!Array.isArray(order.buyerFields) || order.buyerFields.length === 0) {
    fail("storefront.order.buyerFields phải liệt kê field khách được điền — mọi field khác là của nhân viên.");
  }
  compiled.order = {
    doctype: order.doctype,
    submit_as_role: order.role,
    lines_field: order.lines,
    placed_at_field: order.placedAt,
    total_field: order.total,
    track_field: order.trackBy,
    buyer_fields: [...order.buyerFields],
    max_per_day: order.maxPerDay ?? 20,
  };
  return compiled;
}

/**
 * Fields the app adds to doctypes it does not own.
 *
 * Written as `{ "Item": ["image:Attach Image Ảnh sản phẩm"] }` — the same field language
 * as everywhere else, because a second syntax for the same idea is a second set of
 * mistakes to learn.
 *
 * Refusing a doctype the brief itself declares is deliberate: there the field belongs in
 * `fields`, and putting it here instead would make the DocType definition an incomplete
 * description of what installs.
 */
function compileCustomFields(declared, doctypeNames) {
  if (declared === null || typeof declared !== "object" || Array.isArray(declared)) {
    fail("`customFields` phải là object: { \"<DocType>\": [\"field:Kiểu Nhãn\", …] }");
  }
  const compiled = [];
  for (const [doctype, entries] of Object.entries(declared)) {
    if (doctypeNames.has(doctype)) {
      fail(`customFields."${doctype}": brief này tự khai DocType đó — thêm field vào \`fields\` của nó, đừng phủ thêm một lớp overlay lên chính mình.`);
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      fail(`customFields."${doctype}" phải là mảng field không rỗng.`);
    }
    for (const [index, entry] of entries.entries()) {
      const context = `customFields."${doctype}"`;
      const raw = typeof entry === "object" && entry !== null && !Array.isArray(entry) ? entry.field : entry;
      const after = typeof entry === "object" && entry !== null && !Array.isArray(entry) ? entry.after : undefined;
      if (after !== undefined && (typeof after !== "string" || !after.trim())) {
        fail(`${context}[${index}]: \`after\` phải là tên field chuẩn để chèn phía sau.`);
      }
      const field = parseField(raw, index, context);
      compiled.push({
        name: `${doctype}-${field.fieldname}`,
        dt: doctype,
        fieldname: field.fieldname,
        field,
        insert_after: after ? after.trim() : null,
      });
    }
  }
  return compiled;
}

/** `lead_name` → `Lead Name`, so a field without a label still reads like one. */
function titleize(fieldname) {
  return fieldname.split(/[_\s]+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

/**
 * Splits a string at the first delimiter that is NOT inside parentheses.
 *
 * Needed because both Select options and labels contain spaces in the languages these
 * apps are written in: `status:Select(Mới,Đang liên hệ) Trạng thái` must split after the
 * closing paren, not at the space inside it.
 */
function splitOutsideParens(text, delimiter) {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (depth === 0 && character === delimiter) return [text.slice(0, index), text.slice(index + 1)];
  }
  return [text, null];
}

/** Index of the `)` that closes the `(` at position 0, or -1. */
function closingParen(text) {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    else if (text[index] === ")") { depth -= 1; if (depth === 0) return index; }
  }
  return -1;
}

/**
 * Matches the longest known type name at the start of a type expression.
 *
 * Longest-first because several Frappe types are prefixes of nothing but share a first
 * word (`Text` / `Text Editor`, `Attach` / `Attach Image`): taking the first word would
 * resolve `Text Editor` to `Text` and silently give the field the wrong renderer AND the
 * wrong escaping rules on print.
 */
function matchFieldType(expression, fieldname, context) {
  const words = expression.split(/\s+/);
  for (let count = Math.min(3, words.length); count >= 1; count -= 1) {
    const candidate = words.slice(0, count).join(" ");
    // A candidate ending mid-token (`Data!`, `Link(`) is not a type name on its own; strip
    // the trailing punctuation before looking it up, then keep it in the remainder.
    // `-` is in the list because it is a modifier (ẩn) and no Frappe type name contains one.
    const bare = candidate.replace(/[!*~(=-].*$/, "");
    const fieldtype = FIELD_TYPES.get(bare.toLowerCase().replace(/\s+/g, ""));
    if (!fieldtype) continue;
    const consumed = expression.indexOf(bare) + bare.length;
    return { fieldtype, rest: expression.slice(consumed) };
  }
  fail(`${context}: field "${fieldname}" has an unknown type "${words[0]?.replace(/[!*~(=].*$/, "")}"`);
}

/**
 * Parses one field.
 *
 *   "lead_name:Data! Tên khách hàng"
 *   "status:Select(Mới,Đang liên hệ,Mất)=(Đang liên hệ) Trạng thái"
 *   "company:Link(Company)! Công ty"
 *   { fieldname: "notes", fieldtype: "Text Editor", label: "Ghi chú" }   ← object form
 *
 * Grammar: `<fieldname>:<Type>[(options)][modifiers][=default][ label]`
 * Modifiers: `!` required · `*` unique · `~` read-only · `-` ẩn khỏi form
 *
 * `-` (ẩn) tồn tại cho một cảnh rất cụ thể: field mà NHÂN bắt buộc nhưng người dùng không
 * có gì để chọn. Xưởng chỉ có MỘT công ty và tiêu MỘT loại tiền, nên hai ô "Công ty" và
 * "Tiền tệ" trên mọi chứng từ là hai ô luôn luôn đúng một giá trị — chúng chỉ làm form dài
 * ra và làm người nhập liệu phải đọc lướt qua thứ không bao giờ đổi. Ẩn KHÔNG phải bỏ:
 * giá trị mặc định vẫn được gửi lên như thường, vì `blankDoc` gieo default cho MỌI field
 * kể cả field ẩn, và bộ serialize lúc tạo gửi cả document chứ không chỉ ô đã chạm.
 *

 * A default containing spaces goes in parentheses — `=(Đang liên hệ)`. Without that rule
 * the label and the default are indistinguishable, and the field would silently get the
 * first word of its label as its default value.
 */
export function parseField(input, index, context) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    if (!input.fieldname || !input.fieldtype) fail(`${context}: fields[${index}] in object form needs fieldname and fieldtype`);
    return { label: titleize(input.fieldname), ...input };
  }
  if (typeof input !== "string") fail(`${context}: fields[${index}] must be a string or an object`);

  const [rawName, remainder] = splitOutsideParens(input.trim(), ":");
  const fieldname = rawName.trim();
  if (!/^[a-z][a-z0-9_]*$/.test(fieldname)) fail(`${context}: "${fieldname}" is not a valid fieldname (lowercase, digits, underscore)`);
  if (remainder === null) fail(`${context}: field "${fieldname}" has no type — write "${fieldname}:Data"`);

  // The type name is matched FIRST and greedily, before anything is split on spaces.
  // Splitting on the first space instead would read `notes:Small Text Ghi chú` as a type
  // called "Small" — Frappe has plenty of two-word types, so that mistake is the common
  // case rather than an edge one.
  const { fieldtype, rest } = matchFieldType(remainder.trim(), fieldname, context);

  // Options next: they may contain spaces, `=` and `!`, so nothing else can be parsed
  // until they are removed.
  let tail = rest;
  let options;
  if (tail.startsWith("(")) {
    const close = closingParen(tail);
    if (close < 0) fail(`${context}: field "${fieldname}" has an unclosed "(" in its options`);
    options = tail.slice(1, close).trim();
    tail = tail.slice(close + 1);
  }

  // Then the label, which is whatever follows the first space — safe now that neither
  // the type name nor the options are still in play.
  const [typeSuffix, rawLabel] = splitOutsideParens(tail, " ");
  const label = (rawLabel ?? "").trim() || titleize(fieldname);

  // Default before modifiers: a default may itself end in `!`, and stripping modifiers
  // first would take that as "required".
  const [beforeDefault, rawDefault] = splitOutsideParens(typeSuffix, "=");
  let defaultValue;
  if (rawDefault !== null) {
    const trimmed = rawDefault.trim();
    defaultValue = trimmed.startsWith("(") && trimmed.endsWith(")") ? trimmed.slice(1, -1) : trimmed;
    if (!defaultValue) fail(`${context}: field "${fieldname}" has "=" with no default value`);
  }

  let expression = beforeDefault.trim();
  const modifiers = { required: false, unique: false, read_only: false, hidden: false };
  while (expression.length) {
    const last = expression.at(-1);
    if (last === "!") modifiers.required = true;
    else if (last === "*") modifiers.unique = true;
    else if (last === "~") modifiers.read_only = true;
    else if (last === "-") modifiers.hidden = true;
    else break;
    expression = expression.slice(0, -1);
  }
  if (expression.trim()) fail(`${context}: field "${fieldname}" has trailing text after its type: "${expression.trim()}"`);

  /**
   * Ẩn + bắt buộc + KHÔNG có mặc định = một form không ai nộp nổi, và không ai hiểu vì sao.
   *
   * Server từ chối vì thiếu giá trị, nhưng ô đang thiếu thì người dùng KHÔNG NHÌN THẤY để
   * điền. Đây là kiểu bế tắc tệ nhất: thông báo lỗi nêu tên một field không có trên màn
   * hình. Bắt khai mặc định tại đây biến nó thành một lỗi lúc biên dịch brief.
   */
  if (modifiers.hidden && modifiers.required && defaultValue === undefined) {
    fail(`${context}: field "${fieldname}" vừa ẩn (-) vừa bắt buộc (!) nhưng không có giá trị mặc định. Viết "${fieldname}:…-!=(giá trị)" — người dùng không thấy ô này để điền, nên mặc định là cách duy nhất nó có giá trị.`);
  }
  if (NEEDS_OPTIONS.has(fieldtype) && !options) {
    // A Link with no target and a Select with no choices are the two ways to produce a
    // field that renders but can never hold a valid value.
    fail(`${context}: field "${fieldname}" of type ${fieldtype} needs options — write "${fieldname}:${fieldtype}(Target)"`);
  }

  const choices = fieldtype === "Select" && options ? options.split(",").map((entry) => entry.trim()) : null;

  /**
   * A Select's default MUST be one of its own options.
   *
   * This check exists because its absence shipped seven broken fields to a live tenant.
   * `status:Select(Đang học,Tạm nghỉ)=Đang học Trạng thái` looks right and is not: the
   * default is cut at the first space, so the field ends up with `default: "Đang"` — a
   * value no option matches — and the leftover word is glued onto the label, which
   * becomes "học Trạng thái". Both are silent. The record then either carries a status
   * the doctype does not recognise, or is refused on save for a reason that points at the
   * data rather than at the definition.
   *
   * The fix an author needs is `=(Đang học)`, and saying so here is the difference
   * between a five-second correction and finding it in a screenshot later.
   */
  if (choices && defaultValue !== undefined && !choices.includes(defaultValue)) {
    fail(
      `${context}: field "${fieldname}" defaults to "${defaultValue}", which is not one of its options (${choices.join(", ")}).`
      + (/\s/.test(rawLabel ?? "") || (rawLabel ?? "").length
        ? `\n  A default containing a space must be parenthesised: "${fieldname}:Select(${choices.join(",")})=(${defaultValue} ${String(rawLabel).split(/\s+/)[0]}) ${String(rawLabel).split(/\s+/).slice(1).join(" ")}"`
        : ""),
    );
  }

  return {
    fieldname,
    label,
    fieldtype,
    // Select stores its choices newline-separated, exactly as Frappe does.
    ...(options ? { options: choices ? choices.join("\n") : options } : {}),
    ...(modifiers.required ? { required: true } : {}),
    ...(modifiers.unique ? { unique: true } : {}),
    ...(modifiers.read_only ? { read_only: true } : {}),
    ...(modifiers.hidden ? { hidden: true } : {}),
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
  };
}

/** `"rwc"` → a DocPerm row, with the read-implied rights filled in. */
export function parsePermission(role, letters, context) {
  if (typeof letters !== "string" || !letters) fail(`${context}: permissions["${role}"] must be a string of letters like "rwc"`);
  const permission = { role };
  for (const letter of letters) {
    if (NON_LETTERS[letter]) fail(`${context}: permissions["${role}"] uses "${letter}" — ${NON_LETTERS[letter]}`);
    const right = PERMISSION_LETTERS[letter];
    // An unrecognised letter would silently grant nothing, so the role would appear
    // configured and behave as if it had no access at all.
    if (!right) fail(`${context}: permissions["${role}"] has an unknown letter "${letter}" (r w c s x a)`);
    permission[right] = true;
  }
  if (permission.read) for (const right of READ_IMPLIES) permission[right] = true;
  return permission;
}

/**
 * Compiles a workflow brief.
 *
 *   { "states": { "Nháp": 0, "Chờ duyệt": 0, "Đã duyệt": 1, "Từ chối": 2 },
 *     "transitions": [["Nháp","Gửi duyệt","Chờ duyệt","Nhân viên"],
 *                     ["Chờ duyệt","Duyệt","Đã duyệt","Quản lý"]] }
 *
 * `allow_self_approval` defaults to FALSE on any transition that raises docstatus. That
 * default is the whole reason this is compiled rather than hand-written: separation of
 * duties is what an approval workflow is FOR, and a hand-written workflow that omits the
 * flag silently lets the person who raised a request approve it. Making the safe case the
 * default means an author has to ask for the unsafe one in writing.
 */
export function compileWorkflow(doctypeName, brief, declaredRoles, context) {
  const stateEntries = Object.entries(brief.states ?? {});
  if (!stateEntries.length) fail(`${context}: workflow needs at least one state`);
  const states = stateEntries.map(([state, docstatus]) => {
    if (![0, 1, 2].includes(docstatus)) fail(`${context}: state "${state}" has docstatus ${docstatus} — must be 0 (draft), 1 (submitted) or 2 (cancelled)`);
    return { state, docstatus };
  });
  const known = new Map(states.map((entry) => [entry.state, entry.docstatus]));

  const transitions = (brief.transitions ?? []).map((entry, index) => {
    const [from, action, to, role, ...rest] = Array.isArray(entry)
      ? entry
      : [entry.from, entry.action, entry.to, entry.role, entry.self ? "self" : undefined];
    for (const [value, label] of [[from, "from"], [action, "action"], [to, "to"], [role, "role"]]) {
      if (typeof value !== "string" || !value.trim()) fail(`${context}: transitions[${index}] is missing ${label}`);
    }
    // A transition out of or into a state the workflow does not define is a menu action
    // that can never fire, or one that moves a document into a state with no docstatus.
    if (!known.has(from)) fail(`${context}: transitions[${index}] leaves undefined state "${from}"`);
    if (!known.has(to)) fail(`${context}: transitions[${index}] enters undefined state "${to}"`);
    if (!declaredRoles.has(role)) fail(`${context}: transitions[${index}] allows role "${role}", which the brief does not declare`);
    const raisesStatus = known.get(to) > known.get(from);
    const selfApproval = rest.includes("self");
    return {
      state: from, action, next_state: to, allowed_role: role,
      ...(raisesStatus ? { allow_self_approval: selfApproval } : {}),
    };
  });
  if (!transitions.length) fail(`${context}: workflow needs at least one transition, or it can never leave its first state`);

  return {
    name: brief.name ?? `${doctypeName} Workflow`,
    document_type: doctypeName,
    state_field: brief.field ?? "workflow_state",
    is_active: true,
    states,
    transitions,
    revision: 1,
  };
}

/** The nav path the client router builds — must agree with `navItemPath` on the server. */
function navPath(item) {
  if (item.kind === "experience") return `/x/${encodeURIComponent(item.key)}`;
  if (item.kind === "doctype") return `/app/${encodeURIComponent(item.key)}`;
  return item.route ?? null;
}

/**
 * Compiles a whole brief into an installable package.
 *
 * Ordering matters: roles are collected first, because every later check — DocPerms,
 * workflow transitions, `allow_edit` — has to be able to say "that role is not declared"
 * rather than emit a rule that matches nobody.
 */
export function compileBrief(brief) {
  if (!brief || typeof brief !== "object") fail("a brief must be an object");
  const id = brief.id;
  if (!/^[a-z][a-z0-9-]*$/.test(id ?? "")) fail(`id "${id}" must be lowercase letters, digits and hyphens`);
  const name = brief.name?.trim();
  if (!name) fail("name is required — it is what the user sees in the app bar");
  const module = brief.module?.trim() || name;
  const version = brief.version ?? "1.0.0";

  const doctypeBriefs = brief.doctypes;
  if (!Array.isArray(doctypeBriefs) || !doctypeBriefs.length) fail("a brief needs at least one doctype");

  // Roles come from the explicit list plus everything any permission map or transition
  // mentions, so an author is not forced to write each role twice.
  const declaredRoles = new Set(brief.roles ?? []);
  for (const doctype of doctypeBriefs) {
    for (const role of Object.keys(doctype.permissions ?? {})) declaredRoles.add(role);
  }
  if (!declaredRoles.size) fail("a brief needs at least one role — without one nobody can open the app");

  const doctypes = [];
  const workflows = [];
  const nav = [];

  for (const doctype of doctypeBriefs) {
    const doctypeName = doctype.name?.trim();
    if (!doctypeName) fail("every doctype needs a name");
    const context = `${doctypeName}`;

    const fields = (doctype.fields ?? []).map((field, index) => parseField(field, index, context));
    if (!fields.length) fail(`${context}: needs at least one field`);
    const fieldNames = new Set(fields.map((field) => field.fieldname));

    const workflowBrief = doctype.workflow;
    // The state field is added BEFORE anything validates against the field list, so a
    // brief may name it in `list` or `title` without having to declare it twice. It is
    // added rather than demanded because forgetting it produces a workflow writing to a
    // column the doctype does not have, which fails on the first transition.
    if (workflowBrief) {
      const stateField = workflowBrief.field ?? "workflow_state";
      if (!fieldNames.has(stateField)) {
        const stateNames = Object.keys(workflowBrief.states ?? {});
        fields.push({
          fieldname: stateField, label: workflowBrief.label ?? "Trạng thái", fieldtype: "Select",
          options: stateNames.join("\n"),
          // Read-only: the state belongs to the workflow, and a form that lets a user pick
          // it directly is a form that bypasses every transition rule.
          read_only: true, in_standard_filter: true,
          ...(stateNames[0] ? { default: stateNames[0] } : {}),
        });
        fieldNames.add(stateField);
      }
    }

    const listed = doctype.list ?? [];
    for (const fieldname of listed) {
      if (!fieldNames.has(fieldname)) fail(`${context}: list names "${fieldname}", which is not a field`);
    }
    const listedSet = new Set(listed);
    for (const field of fields) {
      if (!listedSet.has(field.fieldname)) continue;
      field.in_list_view = true;
      field.in_standard_filter = field.fieldtype === "Select" || field.fieldtype === "Link";
      /**
       * `-` (ẩn) CỘNG với việc có mặt trong `list` = "cột của bảng, không phải ô của form".
       *
       * Hai thứ đó không mâu thuẫn, chúng trả lời hai câu khác nhau: `-` nói "đừng bắt người
       * dùng nhìn ô này lúc đang gõ", `list` nói "cột này đáng xem trong bảng". Cái hay gặp
       * nhất trong ERP là đúng tổ hợp đó — `đã nhận %` là con số MÁY đặt: trên form nó là
       * một ô chết chiếm chỗ, còn trên danh sách nó chính là cột người ta mở danh sách để xem.
       *
       * Dịch sang `list_only` chứ KHÔNG để nguyên `hidden`, vì `hidden` nghĩa là giấu ở MỌI
       * màn. Giữ `hidden` ở đây sẽ khiến một field đánh dấu giấu vì lý do riêng tư rò ra bảng
       * ngay khi ai đó lỡ khai nó làm cột.
       */
      if (field.hidden) { delete field.hidden; field.list_only = true; }
    }

    if (doctype.title && !fieldNames.has(doctype.title)) fail(`${context}: title "${doctype.title}" is not a field`);
    for (const fieldname of doctype.search ?? []) {
      if (!fieldNames.has(fieldname)) fail(`${context}: search names "${fieldname}", which is not a field`);
    }
    if (doctype.tree === true) {
      const parentField = `parent_${doctypeName.toLowerCase().replace(/ /g, "_")}`;
      const declaredParent = fields.find((field) => field.fieldname === parentField);
      if (!declaredParent || !["Link", "Data"].includes(declaredParent.fieldtype)) {
        fail(`${context}: tree doctype needs ${parentField}:Link(${doctypeName})`);
      }
      if (declaredParent.fieldtype === "Link" && declaredParent.options !== doctypeName) {
        fail(`${context}: ${parentField} must link to ${doctypeName}`);
      }
    }

    const permissions = Object.entries(doctype.permissions ?? {}).map(([role, letters]) => parsePermission(role, letters, context));
    if (!permissions.length) fail(`${context}: needs a permissions map — a doctype nobody may read is invisible`);

    /**
     * System Manager always gets a row, even when the brief does not mention it.
     *
     * Not a convenience — a correctness fix for a disagreement between the two halves of
     * the platform. The SERVER already lets a System Manager write anything (`isPlatformAdmin`
     * short-circuits the permission check), but the CLIENT resolves editability purely from
     * DocPerm rows matching the user's roles. With no such row, the server accepts writes
     * the UI refuses to let anyone type: every field on every create form rendered
     * read-only while the API happily accepted the same document via curl.
     *
     * Writing the row makes the metadata SAY what the server already does, so both halves
     * decide from one source instead of two. The alternative — teaching the client to
     * special-case role names — puts policy in the UI, which is where it can drift.
     */
    if (!permissions.some((permission) => permission.role === "System Manager")) {
      permissions.push(parsePermission("System Manager", "rwcsxa", context));
    }

    const submittable = doctype.submittable ?? Boolean(workflowBrief && Object.values(workflowBrief.states ?? {}).some((status) => status > 0));
    if (workflowBrief) workflows.push(compileWorkflow(doctypeName, workflowBrief, declaredRoles, context));

    /**
     * Một doctype CON chỉ tồn tại làm dòng của bảng cha (dòng đơn hàng, dòng phiếu xuất).
     *
     * Khai rõ vì hai hệ quả, cả hai đều nhìn thấy được: nó KHÔNG được xuất hiện trên menu
     * — không ai vào menu để mở "Dòng đơn hàng" — và nó không có danh sách riêng, nên hỏi
     * danh sách của nó phải bị từ chối thay vì trả về một bảng vô nghĩa.
     *
     * Trước đây brief không nói được điều này, nên bốn doctype dòng của Alumdoor nằm chình
     * ình trong nhóm "Danh mục" cạnh Hàng hoá và Khách hàng.
     */
    const isChild = doctype.child === true;

    doctypes.push({
      name: doctypeName,
      // Nhãn đi CÙNG metadata, không chỉ vào mục menu. Thiếu dòng này thì breadcrumb, ô
      // chọn loại chứng từ và màn phân quyền đều hiện tên kỹ thuật tiếng Anh, trong khi
      // menu bên cạnh hiện tiếng Việt — cùng một thứ, hai cách gọi.
      ...(doctype.label ? { label: doctype.label } : {}),
      module,
      is_child: isChild,
      is_tree: doctype.tree === true,
      is_submittable: submittable,
      track_changes: true,
      allow_rename: doctype.allow_rename === true,
      ...(doctype.naming ? { autoname: doctype.naming } : {}),
      ...(doctype.title ? { title_field: doctype.title } : {}),
      ...(doctype.search?.length ? { search_fields: doctype.search } : {}),
      fields: fields.map((field, index) => ({ ...field, idx: index + 1 })),
      permissions,
      revision: 1,
    });

    /**
     * A `calendar` block adds a week/month view of the doctype.
     *
     * Declared, not inferred: plenty of doctypes carry a date without wanting a calendar
     * (a join date, an effective-from), and putting one in the menu for every such doctype
     * would bury the ones that matter. The runtime derives WHICH date and time field to
     * use from metadata, so the app only says whether it wants the screen at all.
     */
    if (doctype.menu !== false && doctype.calendar) {
      nav.push({
        key: `calendar:${doctypeName}`,
        label: doctype.calendar.label ?? `Lịch ${doctype.label ?? doctypeName}`,
        kind: "experience",
        icon: doctype.calendar.icon ?? "calendar-days",
        group: doctype.calendar.group ?? doctype.group ?? module,
      });
    }

    // Nav: the operational inbox first when there is one, because a user who has an
    // approval queue opens the app to work it, not to browse a table.
    if (doctype.menu !== false && (doctype.inbox ?? Boolean(workflowBrief))) {
      nav.push({
        key: `approval:${doctypeName}`,
        label: doctype.inboxLabel ?? `Xử lý ${doctype.label ?? doctypeName}`,
        kind: "experience", permission_doctype: doctypeName,
        icon: doctype.inboxIcon ?? "inbox", group: doctype.inboxGroup ?? "Tác nghiệp",
      });
    }
    if (isChild) continue;
    /**
     * `menu: false` — CÀI ĐẶT nhưng KHÔNG lên menu.
     *
     * Khác hẳn với việc xoá doctype khỏi brief. Xoá thì định nghĩa thành mồ côi: bản ghi cũ
     * vẫn nằm trong kho dữ liệu nhưng không còn schema nào mô tả chúng — không đọc được,
     * không xuất được, và không lấy lại được nếu không cài lại đúng gói cũ. Dữ liệu sống lâu
     * hơn app, nên dữ liệu thắng.
     *
     * Cái này dành cho chuyện rất thường gặp: xưởng chỉ dùng hai loại chứng từ trong mười
     * loại nền tảng có. Tám cái kia vẫn phải chạy được — nhân vẫn kiểm, chứng từ cũ vẫn mở
     * được bằng đường dẫn thẳng, báo cáo vẫn đọc — chỉ là không chiếm chỗ trên thanh bên.
     * Bật lại là sửa một chữ.
     */
    if (doctype.menu === false) continue;
    nav.push({
      key: doctypeName,
      label: doctype.label ?? doctypeName,
      kind: "doctype",
      ...(doctype.icon ? { icon: doctype.icon } : {}),
      group: doctype.group ?? module,
    });
  }

  /**
   * Reports, and a menu entry for each.
   *
   * Emitted AFTER the doctypes so a report can name any of them, and each gets a nav item
   * of kind `route` carrying `permission_doctype`. Without that, a report of enrolments
   * would appear in the menu of a user who cannot read an enrolment — the entry would
   * still refuse on open, but a menu that lists what you may not see is how people learn
   * to distrust a menu.
   */
  const doctypeNames = new Set(doctypes.map((entry) => entry.name));
  const reports = (brief.reports ?? []).map((report, index) => compileReport(report, index, doctypeNames));
  for (const [index, report] of reports.entries()) {
    const declared = brief.reports[index];
    nav.push({
      key: `report:${report.name}`,
      label: report.label,
      kind: "route",
      route: `/report/${encodeURIComponent(report.name)}`,
      permission_doctype: report.doctype,
      icon: declared.icon ?? "bar-chart-3",
      group: declared.group ?? "Báo cáo",
    });
  }

  /**
   * Thao tác dạng form, và một mục menu cho mỗi cái.
   *
   * Chặn quyền theo `permission_doctype` của chính action, nên mục menu và màn hình dùng
   * CHUNG một cái chốt — không phải hai chỗ phải nhớ giữ cho khớp nhau.
   */
  const actions = (brief.actions ?? []).map((action, index) => compileAction(action, index, doctypeNames));
  if (actions.length && !brief.worker) {
    fail("`actions` cần `worker`: action gọi method, mà method không có Worker phục vụ thì nút bấm chỉ trả 404.");
  }
  for (const [index, action] of actions.entries()) {
    // Keep the callable action installed while removing it from the daily sidebar.
    // This mirrors DocType `menu: false`: direct links and contextual buttons still work.
    if (brief.actions?.[index]?.menu === false) continue;
    nav.push({
      key: `action:${action.name}`,
      label: action.label,
      kind: "experience",
      permission_doctype: action.permission_doctype,
      icon: action.icon ?? "play",
      group: action.group ?? "Thao tác",
    });
  }

  /**
   * Mẫu in và link tới báo cáo sẵn có của nền tảng.
   *
   * Sau doctype, vì cả hai đều nêu tên doctype và phải từ chối được tên không tồn tại.
   */
  const printFormats = (brief.prints ?? []).map((print, index) => compilePrint(print, index, doctypeNames));
  assertUniqueNames(printFormats.map((entry) => entry.name), "mẫu in");
  for (const link of (brief.links ?? []).map((entry, index) => compileLink(entry, index, doctypeNames))) {
    // Một app cũng khai báo cáo trùng tên với báo cáo nền tảng thì router chỉ khớp cái
    // ĐẦU TIÊN — mục thứ hai vĩnh viễn không tới được. Từ chối ngay thay vì để nó im lặng.
    if (nav.some((item) => item.key === link.key)) fail(`links: "${link.label}" trùng với một báo cáo app đã khai (${link.key}).`);
    nav.push(link);
  }

  /**
   * Sidebar order belongs to app metadata, not to the React shell.
   *
   * A brief is compiled from several independent collections (DocTypes, reports,
   * actions and platform-report links). Without this final ordering pass those
   * collections leak into the visible menu: every DocType precedes every report,
   * and a master declared early can put "Danh mục" above the daily workflows.
   */
  const navigation = brief.navigation ?? {};
  const requestedGroups = navigation.groups ?? [];
  const requestedItems = navigation.items ?? [];
  const knownGroups = new Set(nav.map((item) => item.group));
  const knownItems = new Set(nav.map((item) => item.key));
  for (const group of requestedGroups) {
    if (!knownGroups.has(group)) fail(`navigation.groups names unknown sidebar group "${group}"`);
  }
  for (const key of requestedItems) {
    if (!knownItems.has(key)) fail(`navigation.items names unknown nav key "${key}"`);
  }
  if (requestedGroups.length || requestedItems.length) {
    const groupRank = new Map(requestedGroups.map((group, index) => [group, index]));
    const itemRank = new Map(requestedItems.map((key, index) => [key, index]));
    const originalRank = new Map(nav.map((item, index) => [item.key, index]));
    nav.sort((left, right) => {
      const leftGroup = groupRank.get(left.group) ?? Number.MAX_SAFE_INTEGER;
      const rightGroup = groupRank.get(right.group) ?? Number.MAX_SAFE_INTEGER;
      if (leftGroup !== rightGroup) return leftGroup - rightGroup;
      const leftItem = itemRank.get(left.key) ?? Number.MAX_SAFE_INTEGER;
      const rightItem = itemRank.get(right.key) ?? Number.MAX_SAFE_INTEGER;
      if (leftItem !== rightItem) return leftItem - rightItem;
      return (originalRank.get(left.key) ?? 0) - (originalRank.get(right.key) ?? 0);
    });
  }

  // Home: the brief may name a doctype or an inbox by its short form; the encoded route
  // is computed here so an author never has to write `%3A` by hand — getting that wrong
  // is a redirect loop, and it is the kind of mistake nobody spots by reading.
  let home;
  if (brief.home) {
    const target = nav.find((item) => item.key === brief.home);
    if (!target) fail(`home "${brief.home}" does not match any nav key (${nav.map((item) => item.key).join(", ")})`);
    const path = navPath(target);
    home = target.kind === "doctype" ? { doctype: target.key } : { route: path };
  } else {
    const first = nav[0];
    home = first.kind === "doctype" ? { doctype: first.key } : { route: navPath(first) };
  }

  const fixtures = (brief.fixtures ?? []).map((fixture, index) => {
    if (!fixture?.type || !fixture?.name) fail(`fixtures[${index}] needs a type and a name`);
    return { record_type: fixture.type, name: fixture.name, data: fixture.data ?? {} };
  });

  const customFields = compileCustomFields(brief.customFields ?? {}, doctypeNames);
  const storefront = brief.storefront ? compileStorefront(brief.storefront) : undefined;

  return {
    id, name, version,
    platform_requires: brief.platformRequires ?? "1.0.0",
    requires: brief.requires ?? [],
    roles: [...declaredRoles].map((role) => ({ role, desk_access: true })),
    doctypes,
    workflows,
    print_formats: printFormats,
    fixtures,
    custom_fields: customFields,
    ...(storefront ? { storefront } : {}),
    nav,
    /**
     * Việc app muốn làm SAU KHI ghi sổ xong — đường duy nhất để app chạy logic mà không
     * chen vào đường ghi của nhân.
     *
     * Nền tảng đã dựng đủ: giao sau khi commit (một app chậm không làm nghẽn mọi lệnh ghi),
     * cô lập giữa các app, giao ít nhất một lần với chống lặp theo từng cặp (app, sự kiện),
     * 12 lần thử trải hơn bảy tiếng. Thứ duy nhất còn thiếu là brief không khai được — nên
     * app viết bằng brief không có cách nào phản ứng sau khi chứng từ được ghi.
     *
     * Cùng lý do với validator: hook cần một Worker để giao tới, nên thiếu `worker` thì bỏ
     * qua thay vì xếp hàng những sự kiện không bao giờ có ai nhận.
     */
    hooks: brief.worker ? (brief.hooks ?? []).map((event) => ({ event })) : [],
    // Validator cần một Worker để hỏi; parser của server từ chối cái này nếu thiếu, nên
    // hai thứ đi cùng nhau hoặc không có gì cả.
    validators: brief.worker ? compileValidators(brief.validators ?? []) : [],
    reports,
    actions,
    ...(brief.worker ? { worker: brief.worker } : {}),
    client: {
      ...(brief.brand ? { brand: brief.brand } : {}),
      ...(brief.domain ? { domain: brief.domain } : {}),
      home,
      dimensions: brief.dimensions ?? [],
      catalog_mode: brief.catalogMode ?? "hybrid",
      ...(brief.locale ? { locale: brief.locale } : {}),
    },
  };
}
