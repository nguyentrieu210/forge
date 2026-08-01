import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseJson(text, source) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${source}: ${error.message}`);
  }
}

function sourcePathOf(source) {
  if (source instanceof URL) {
    if (source.protocol !== "file:") {
      throw new Error(`${source}: brief source URL phải dùng giao thức file:.`);
    }
    return fileURLToPath(source);
  }
  if (typeof source !== "string") {
    throw new TypeError("brief source phải là đường dẫn chuỗi hoặc file URL.");
  }
  return source;
}

async function readOptionalJson(source) {
  let text;
  try {
    text = await readFile(source, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  return parseJson(text, source);
}

function assertSidecarObject(extension, source) {
  if (!extension || typeof extension !== "object" || Array.isArray(extension)) {
    throw new Error(`${source}: gốc file phải là object.`);
  }
}

function applyPrintSidecar(brief, extension, source, briefSource) {
  assertSidecarObject(extension, source);
  const unsupported = Object.keys(extension).filter((key) => key !== "version" && key !== "prints" && !key.startsWith("//"));
  if (unsupported.length) {
    throw new Error(`${source}: chỉ nhận version, prints và khóa ghi chú //; không nhận ${unsupported.join(", ")}.`);
  }
  if (!Array.isArray(extension.prints) || extension.prints.length === 0) {
    throw new Error(`${source}: prints phải là mảng không rỗng.`);
  }
  if (brief.prints !== undefined && !Array.isArray(brief.prints)) {
    throw new Error(`${briefSource}: prints hiện có phải là mảng trước khi ghép sidecar.`);
  }
  return {
    ...brief,
    ...(extension.version ? { version: extension.version } : {}),
    prints: [...(brief.prints ?? []), ...extension.prints],
  };
}

function applyPermissionSidecar(brief, extension, source, briefSource) {
  assertSidecarObject(extension, source);
  const unsupported = Object.keys(extension).filter((key) => key !== "version" && key !== "permissions" && !key.startsWith("//"));
  if (unsupported.length) {
    throw new Error(`${source}: chỉ nhận version, permissions và khóa ghi chú //; không nhận ${unsupported.join(", ")}.`);
  }
  if (!extension.permissions || typeof extension.permissions !== "object" || Array.isArray(extension.permissions)) {
    throw new Error(`${source}: permissions phải là object theo tên DocType.`);
  }
  if (!Array.isArray(brief.doctypes)) {
    throw new Error(`${briefSource}: doctypes phải là mảng trước khi ghép permission sidecar.`);
  }

  const replacements = new Map();
  for (const [doctype, permissions] of Object.entries(extension.permissions)) {
    if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) {
      throw new Error(`${source}: permissions.${doctype} phải là object theo role.`);
    }
    if (Object.keys(permissions).length === 0) {
      throw new Error(`${source}: permissions.${doctype} không được rỗng.`);
    }
    replacements.set(doctype, permissions);
  }
  if (replacements.size === 0) {
    throw new Error(`${source}: permissions phải có ít nhất một DocType.`);
  }

  const seen = new Set();
  const doctypes = brief.doctypes.map((doctype) => {
    const name = typeof doctype?.name === "string" ? doctype.name : "";
    const permissions = replacements.get(name);
    if (!permissions) return doctype;
    seen.add(name);
    return { ...doctype, permissions };
  });
  const missing = [...replacements.keys()].filter((name) => !seen.has(name));
  if (missing.length) {
    throw new Error(`${source}: DocType không tồn tại trong brief: ${missing.join(", ")}.`);
  }

  return {
    ...brief,
    ...(extension.version ? { version: extension.version } : {}),
    doctypes,
  };
}

function applyExtrasSidecar(brief, extension, source, briefSource) {
  assertSidecarObject(extension, source);
  const arrayKeys = ["doctypes", "reports", "charts", "nav", "actions"];
  const allowed = new Set(["version", ...arrayKeys]);
  const unsupported = Object.keys(extension).filter((key) => !allowed.has(key) && !key.startsWith("//"));
  if (unsupported.length) {
    throw new Error(`${source}: extras chỉ nhận version, ${arrayKeys.join(", ")} và khóa ghi chú //; không nhận ${unsupported.join(", ")}.`);
  }

  let additions = 0;
  const output = { ...brief, ...(extension.version ? { version: extension.version } : {}) };
  for (const key of arrayKeys) {
    if (extension[key] === undefined) continue;
    if (!Array.isArray(extension[key]) || extension[key].length === 0) {
      throw new Error(`${source}: ${key} phải là mảng không rỗng khi được khai.`);
    }
    if (brief[key] !== undefined && !Array.isArray(brief[key])) {
      throw new Error(`${briefSource}: ${key} hiện có phải là mảng trước khi ghép extras.`);
    }
    output[key] = [...(brief[key] ?? []), ...extension[key]];
    additions += extension[key].length;
  }
  if (additions === 0) {
    throw new Error(`${source}: extras phải bổ sung ít nhất một doctypes/reports/charts/nav/actions.`);
  }

  const doctypeNames = new Set();
  for (const doctype of output.doctypes ?? []) {
    const name = typeof doctype?.name === "string" ? doctype.name : "";
    if (!name) continue;
    if (doctypeNames.has(name)) throw new Error(`${source}: DocType bị trùng sau khi ghép extras: ${name}.`);
    doctypeNames.add(name);
  }
  return output;
}

/**
 * Read a brief plus optional independently reviewable sidecars.
 *
 * Accepts either a filesystem path or a file URL so CLI paths and import.meta.url-based
 * tests use the same loader contract.
 *
 * Large production briefs should not have every A4 template, high-risk permission edit,
 * or bounded business extension embedded in one giant JSON file. Sibling
 * `<brief>.prints.json`, `<brief>.permissions.json` and `<brief>.extras.json` files are
 * merged before schema validation and compilation, so the compiler and installer still
 * receive one ordinary brief and remain authoritative.
 *
 * Permission sidecars REPLACE the complete permission map for each named DocType. They do
 * not merge individual role strings, because leaving one stale grant behind during an RBAC
 * change is much worse than requiring the reviewer to see the full final role matrix.
 * Extras only APPEND bounded arrays and reject duplicate DocType names.
 *
 * @param {string | URL} source
 * @returns {Promise<Record<string, unknown>>}
 */
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

  const extrasSource = path.join(parsed.dir, `${parsed.name}.extras.json`);
  const extras = await readOptionalJson(extrasSource);
  if (extras) brief = applyExtrasSidecar(brief, extras, extrasSource, sourcePath);

  return brief;
}
