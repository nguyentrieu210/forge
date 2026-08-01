import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseJson(text, source) {
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`${source}: ${error.message}`); }
}

function sourcePathOf(source) {
  if (source instanceof URL) {
    if (source.protocol !== "file:") throw new Error(`${source}: brief source URL phải dùng giao thức file:.`);
    return fileURLToPath(source);
  }
  if (typeof source !== "string") throw new TypeError("brief source phải là đường dẫn chuỗi hoặc file URL.");
  return source;
}

async function readOptionalJson(source) {
  let text;
  try { text = await readFile(source, "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  return parseJson(text, source);
}

function assertSidecarObject(extension, source) {
  if (!extension || typeof extension !== "object" || Array.isArray(extension)) throw new Error(`${source}: gốc file phải là object.`);
}

function applyPrintSidecar(brief, extension, source, briefSource) {
  assertSidecarObject(extension, source);
  const unsupported = Object.keys(extension).filter((key) => key !== "version" && key !== "prints" && !key.startsWith("//"));
  if (unsupported.length) throw new Error(`${source}: chỉ nhận version, prints và khóa ghi chú //; không nhận ${unsupported.join(", ")}.`);
  if (!Array.isArray(extension.prints) || extension.prints.length === 0) throw new Error(`${source}: prints phải là mảng không rỗng.`);
  if (brief.prints !== undefined && !Array.isArray(brief.prints)) throw new Error(`${briefSource}: prints hiện có phải là mảng trước khi ghép sidecar.`);
  return { ...brief, ...(extension.version ? { version: extension.version } : {}), prints: [...(brief.prints ?? []), ...extension.prints] };
}

function applyPermissionSidecar(brief, extension, source, briefSource) {
  assertSidecarObject(extension, source);
  const unsupported = Object.keys(extension).filter((key) => key !== "version" && key !== "permissions" && !key.startsWith("//"));
  if (unsupported.length) throw new Error(`${source}: chỉ nhận version, permissions và khóa ghi chú //; không nhận ${unsupported.join(", ")}.`);
  if (!extension.permissions || typeof extension.permissions !== "object" || Array.isArray(extension.permissions)) throw new Error(`${source}: permissions phải là object theo tên DocType.`);
  if (!Array.isArray(brief.doctypes)) throw new Error(`${briefSource}: doctypes phải là mảng trước khi ghép permission sidecar.`);

  const replacements = new Map();
  for (const [doctype, permissions] of Object.entries(extension.permissions)) {
    if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) throw new Error(`${source}: permissions.${doctype} phải là object theo role.`);
    if (Object.keys(permissions).length === 0) throw new Error(`${source}: permissions.${doctype} không được rỗng.`);
    replacements.set(doctype, permissions);
  }
  if (replacements.size === 0) throw new Error(`${source}: permissions phải có ít nhất một DocType.`);

  const seen = new Set();
  const doctypes = brief.doctypes.map((doctype) => {
    const name = typeof doctype?.name === "string" ? doctype.name : "";
    const permissions = replacements.get(name);
    if (!permissions) return doctype;
    seen.add(name);
    return { ...doctype, permissions };
  });
  const missing = [...replacements.keys()].filter((name) => !seen.has(name));
  if (missing.length) throw new Error(`${source}: DocType không tồn tại trong brief: ${missing.join(", ")}.`);
  return { ...brief, ...(extension.version ? { version: extension.version } : {}), doctypes };
}

const BULK_VIEW_KEYS = new Set(["enabled", "columns", "editableFields", "commitStrategy", "allowPaste", "allowFillDown", "pageSize"]);

function validateBulkView(view, source, doctype) {
  if (!view || typeof view !== "object" || Array.isArray(view)) throw new Error(`${source}: views.${doctype}.bulk phải là object.`);
  const unsupported = Object.keys(view).filter((key) => !BULK_VIEW_KEYS.has(key) && !key.startsWith("//"));
  if (unsupported.length) throw new Error(`${source}: views.${doctype}.bulk không nhận ${unsupported.join(", ")}.`);
  if (view.enabled !== false) {
    if (!Array.isArray(view.columns) || view.columns.length === 0 || !view.columns.every((value) => typeof value === "string" && value)) throw new Error(`${source}: views.${doctype}.bulk.columns phải là mảng field không rỗng.`);
    if (!Array.isArray(view.editableFields) || view.editableFields.length === 0 || !view.editableFields.every((value) => typeof value === "string" && value)) throw new Error(`${source}: views.${doctype}.bulk.editableFields phải là mảng field không rỗng.`);
    const columns = new Set(view.columns);
    const outside = view.editableFields.filter((field) => !columns.has(field));
    if (outside.length) throw new Error(`${source}: views.${doctype}.bulk.editableFields phải nằm trong columns: ${outside.join(", ")}.`);
    if ((view.commitStrategy ?? "document_update") !== "document_update") throw new Error(`${source}: views.${doctype}.bulk.commitStrategy hiện chỉ nhận document_update.`);
  }
  if (view.pageSize !== undefined && (!Number.isInteger(view.pageSize) || view.pageSize < 20 || view.pageSize > 500)) throw new Error(`${source}: views.${doctype}.bulk.pageSize chỉ nhận số nguyên 20–500.`);
  return {
    enabled: view.enabled !== false,
    ...(view.columns ? { columns: [...view.columns] } : {}),
    ...(view.editableFields ? { editableFields: [...view.editableFields] } : {}),
    commitStrategy: view.commitStrategy ?? "document_update",
    ...(view.allowPaste === undefined ? {} : { allowPaste: Boolean(view.allowPaste) }),
    ...(view.allowFillDown === undefined ? {} : { allowFillDown: Boolean(view.allowFillDown) }),
    ...(view.pageSize === undefined ? {} : { pageSize: view.pageSize }),
  };
}

function applyViewSidecar(brief, extension, source, briefSource) {
  assertSidecarObject(extension, source);
  const unsupported = Object.keys(extension).filter((key) => key !== "version" && key !== "views" && !key.startsWith("//"));
  if (unsupported.length) throw new Error(`${source}: chỉ nhận version, views và khóa ghi chú //; không nhận ${unsupported.join(", ")}.`);
  if (!extension.views || typeof extension.views !== "object" || Array.isArray(extension.views)) throw new Error(`${source}: views phải là object theo tên DocType.`);
  if (!Array.isArray(brief.doctypes)) throw new Error(`${briefSource}: doctypes phải là mảng trước khi ghép view sidecar.`);

  const replacements = new Map();
  for (const [doctype, declared] of Object.entries(extension.views)) {
    if (!declared || typeof declared !== "object" || Array.isArray(declared)) throw new Error(`${source}: views.${doctype} phải là object.`);
    const keys = Object.keys(declared).filter((key) => key !== "bulk" && !key.startsWith("//"));
    if (keys.length) throw new Error(`${source}: views.${doctype} hiện chỉ hỗ trợ bulk; không nhận ${keys.join(", ")}.`);
    if (!declared.bulk) throw new Error(`${source}: views.${doctype} thiếu bulk.`);
    replacements.set(doctype, validateBulkView(declared.bulk, source, doctype));
  }
  if (!replacements.size) throw new Error(`${source}: views phải có ít nhất một DocType.`);

  const seen = new Set();
  const doctypes = brief.doctypes.map((doctype) => {
    const name = typeof doctype?.name === "string" ? doctype.name : "";
    const bulk = replacements.get(name);
    if (!bulk) return doctype;
    seen.add(name);
    const mobile = doctype.mobile && typeof doctype.mobile === "object" && !Array.isArray(doctype.mobile) ? doctype.mobile : {};
    return { ...doctype, mobile: { ...mobile, bulk } };
  });
  const missing = [...replacements.keys()].filter((name) => !seen.has(name));
  if (missing.length) throw new Error(`${source}: DocType không tồn tại trong brief: ${missing.join(", ")}.`);
  return { ...brief, ...(extension.version ? { version: extension.version } : {}), doctypes };
}

export async function readBriefSource(source) {
  const sourcePath = sourcePathOf(source);
  let brief = parseJson(await readFile(sourcePath, "utf8"), sourcePath);
  const parsed = path.parse(sourcePath);

  const printsSource = path.join(parsed.dir, `${parsed.name}.prints.json`);
  const prints = await readOptionalJson(printsSource);
  if (prints) brief = applyPrintSidecar(brief, prints, printsSource, sourcePath);

  const permissionsSource = path.join(parsed.dir, `${parsed.name}.permissions.json`);
  const permissions = await readOptionalJson(permissionsSource);
  if (permissions) brief = applyPermissionSidecar(brief, permissions, permissionsSource, sourcePath);

  const viewsSource = path.join(parsed.dir, `${parsed.name}.views.json`);
  const views = await readOptionalJson(viewsSource);
  if (views) brief = applyViewSidecar(brief, views, viewsSource, sourcePath);

  return brief;
}
