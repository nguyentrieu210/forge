const LAYOUT_FIELD_TYPES = new Set([
  "Heading", "Section Break", "Column Break", "HTML", "Tab Break", "Fold", "Button",
]);

/**
 * Platform-owned DocTypes that first-party app source may reference without repeating
 * their ownership metadata in every app header. Unknown targets are NOT guessed: they
 * must be declared explicitly through `externalDocTypes` so a typo cannot silently turn
 * into a valid Link.
 */
const PLATFORM_EXTERNAL_DOCTYPES = new Map(Object.entries({
  "User": { kind: "system", app: "core" },
  "Role": { kind: "system", app: "core" },
  "DocType": { kind: "system", app: "core" },
  "File": { kind: "system", app: "core" },
  "Company": { kind: "master", app: "accounts" },
  "Currency": { kind: "master", app: "accounts" },
  "Cost Center": { kind: "tree", app: "accounts" },
  "Account": { kind: "tree", app: "accounts" },
  "Journal Entry": { kind: "transaction", app: "accounts" },
  "GL Entry": { kind: "system", app: "accounts" },
  "Payment Entry": { kind: "transaction", app: "accounts" },
  "Sales Invoice": { kind: "transaction", app: "selling" },
  "Purchase Invoice": { kind: "transaction", app: "buying" },
  "Customer": { kind: "master", app: "selling" },
  "Supplier": { kind: "master", app: "buying" },
  "Item": { kind: "master", app: "stock" },
  "Item Group": { kind: "tree", app: "stock" },
  "UOM": { kind: "master", app: "stock" },
  "Warehouse": { kind: "tree", app: "stock" },
  "Project": { kind: "master", app: "projects" },
  "Territory": { kind: "tree", app: "selling" },
  "Price List": { kind: "master", app: "stock" },
  "Branch": { kind: "master", app: "hrm" },
  "Department": { kind: "tree", app: "hrm" },
  "Employee": { kind: "master", app: "hrm" },
  "Employment Contract": { kind: "transaction", app: "hrm" },
  "Attendance": { kind: "transaction", app: "hrm" },
  "Leave Application": { kind: "transaction", app: "hrm" },
  "Leave Type": { kind: "master", app: "hrm" },
  "Shift Assignment": { kind: "transaction", app: "hrm" },
  "Shift Type": { kind: "master", app: "hrm" },
  "Salary Structure": { kind: "master", app: "hrm" },
  "Salary Structure Assignment": { kind: "transaction", app: "hrm" },
  "VN Payroll Rule": { kind: "master", app: "hrm" },
  "Payroll Entry": { kind: "transaction", app: "hrm" },
  "Salary Slip": { kind: "transaction", app: "hrm" },
  "Employee Advance": { kind: "transaction", app: "hrm" },
  "Payroll Accounting Batch": { kind: "transaction", app: "vn-accounting" },
  "VN Accounting Policy": { kind: "single", app: "vn-accounting" },
  "VN Legal Rule": { kind: "master", app: "vn-accounting" },
  "VN Accounting Period": { kind: "transaction", app: "vn-accounting" },
  "Visit Category": { kind: "master", app: "visits" },
}));

function flag(value) {
  return value === true || value === 1;
}

function canonicalField(field, doctype) {
  const layout = LAYOUT_FIELD_TYPES.has(field.fieldtype);
  const required = field.required === undefined ? flag(field.reqd) : flag(field.required);
  const valueSource = field.valueSource ?? (
    layout ? "system"
      : field.fetch_from ? "link"
        : flag(field.read_only) ? (field.fieldname === "workflow_state" ? "workflow" : "formula")
          : field.default !== undefined ? "default"
            : "user"
  );
  const editMode = field.editMode ?? (
    flag(field.hidden) ? "hidden"
      : flag(field.set_only_once) ? "set_once"
        : flag(field.read_only) || layout ? "readonly"
          : flag(doctype.is_submittable) && !flag(field.allow_on_submit) ? "immutable_after_submit"
            : "editable"
  );
  const surface = field.surface ?? (
    editMode === "hidden" ? "internal"
      : !layout && required && editMode !== "readonly" ? "quick"
        : "expanded"
  );
  const serverEnforced = field.serverEnforced ?? (
    ["system", "workflow", "formula"].includes(valueSource)
      || ["readonly", "hidden", "set_once", "immutable_after_submit"].includes(editMode)
  );

  return {
    ...field,
    ...(editMode === "readonly" ? { read_only: true } : {}),
    ...(editMode === "set_once" ? { set_only_once: true } : {}),
    ...(editMode === "hidden" ? { hidden: true } : {}),
    valueSource,
    editMode,
    surface,
    serverEnforced,
    ...(valueSource === "link" && editMode === "editable" && !field.dirtyGuard
      ? { dirtyGuard: "preserve_user_value" }
      : {}),
  };
}

function mergeView(defaultView, declaredView) {
  return declaredView && typeof declaredView === "object" && !Array.isArray(declaredView)
    ? { ...defaultView, ...declaredView }
    : defaultView;
}

function canonicalDocType(doctype) {
  const fields = (doctype.fields ?? []).map((field) => canonicalField(field, doctype));
  const isChild = flag(doctype.is_child) || flag(doctype.istable);
  const isTree = flag(doctype.is_tree);
  const isSingle = flag(doctype.is_single) || flag(doctype.issingle);
  const kind = doctype.kind ?? (isChild
    ? "child_table"
    : isTree ? "tree"
      : isSingle ? "single"
        : flag(doctype.is_submittable) ? "transaction"
          : "master");
  const quickFields = fields.filter((field) => field.surface === "quick").map((field) => field.fieldname);
  const formFields = fields
    .filter((field) => !LAYOUT_FIELD_TYPES.has(field.fieldtype) && field.surface !== "internal")
    .map((field) => field.fieldname);
  const listColumns = fields.filter((field) => flag(field.in_list_view)).map((field) => field.fieldname);
  const declared = doctype.viewPolicy && typeof doctype.viewPolicy === "object" && !Array.isArray(doctype.viewPolicy)
    ? doctype.viewPolicy
    : {};

  const viewPolicy = {
    ...declared,
    list: mergeView({ enabled: !isChild && !isSingle, columns: listColumns }, declared.list),
    form: mergeView({ enabled: !isChild, fields: formFields }, declared.form),
    quickEntry: mergeView({ enabled: !isChild && quickFields.length > 0, fields: quickFields }, declared.quickEntry),
    kanban: mergeView({ enabled: false }, declared.kanban),
    calendar: mergeView({ enabled: false }, declared.calendar),
    gantt: mergeView({ enabled: false }, declared.gantt),
    chart: mergeView({ enabled: false }, declared.chart),
    mobile: declared.mobile && typeof declared.mobile === "object" && !Array.isArray(declared.mobile) ? declared.mobile : {},
  };

  return { ...doctype, kind, fields, viewPolicy };
}

function canonicalExternalDocTypes(pkg, doctypes) {
  const own = new Set(doctypes.map((doctype) => doctype.name));
  const declared = new Map((pkg.externalDocTypes ?? []).map((entry) => [entry.name, { ...entry }]));

  for (const doctype of doctypes) {
    for (const field of doctype.fields ?? []) {
      if (field.fieldtype !== "Link" || !field.options || own.has(field.options) || declared.has(field.options)) continue;
      const platform = PLATFORM_EXTERNAL_DOCTYPES.get(field.options);
      if (!platform) {
        throw new Error(`${pkg.id}: ${doctype.name}.${field.fieldname} links to ${field.options}; declare it in app.json externalDocTypes`);
      }
      declared.set(field.options, { name: field.options, ...platform });
    }
  }

  return [...declared.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * `apps-src` is an authoring format, not a second runtime metadata dialect.
 * Every source package crosses this compiler before the authoritative manifest parser,
 * so installed first-party apps always use the same canonical contract as brief-built apps.
 */
export function canonicalizeAppSourcePackage(pkg) {
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) throw new Error("App source package must be an object");
  if (pkg.metaContractVersion !== undefined && pkg.metaContractVersion !== 1) {
    throw new Error(`${pkg.id ?? "app"}: unsupported metaContractVersion ${pkg.metaContractVersion}`);
  }
  const doctypes = (pkg.doctypes ?? []).map(canonicalDocType);
  return {
    ...pkg,
    metaContractVersion: 1,
    doctypes,
    externalDocTypes: canonicalExternalDocTypes(pkg, doctypes),
  };
}
