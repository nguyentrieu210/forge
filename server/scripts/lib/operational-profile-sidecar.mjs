import { readFile } from "node:fs/promises";
import path from "node:path";

const CELL_ROLES = new Set([
  "operator_input", "optional_input", "auto", "formula", "readonly", "warning", "result", "money",
]);

async function readOptionalJson(source) {
  try { return JSON.parse(await readFile(source, "utf8")); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) throw new Error(`${source}: ${error.message}`);
    throw error;
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function stringList(value, label) {
  if (!Array.isArray(value) || !value.length || !value.every((entry) => typeof entry === "string" && entry.trim())) {
    throw new Error(`${label} must be a non-empty string array`);
  }
  const normalized = value.map((entry) => entry.trim());
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} must not contain duplicates`);
  return normalized;
}

/**
 * Merge an optional `<brief>.operational.json` presentation profile into brief DocTypes.
 *
 * This is deliberately a sidecar rather than a second business schema. The profile can only add
 * operational presentation metadata, visual field roles and a presentation column list. The normal
 * brief compiler and canonical server DocType parser still validate every field reference and
 * named server projection.
 */
export async function applyOperationalProfileSidecar(brief, briefSource) {
  if (!briefSource || typeof briefSource !== "string") return brief;
  const parsed = path.parse(briefSource);
  if (!parsed.ext) return brief;
  const profileSource = path.join(parsed.dir, `${parsed.name}.operational.json`);
  const profile = await readOptionalJson(profileSource);
  if (!profile) return brief;
  assertObject(profile, profileSource);
  const unsupported = Object.keys(profile).filter((key) => !["version", "doctypes"].includes(key) && !key.startsWith("//"));
  if (unsupported.length) throw new Error(`${profileSource}: only version, doctypes and // comments are supported; got ${unsupported.join(", ")}`);
  assertObject(profile.doctypes, `${profileSource}: doctypes`);
  if (!Array.isArray(brief?.doctypes)) throw new Error(`${briefSource}: doctypes must be an array before applying the operational profile`);

  const requested = new Map();
  for (const [doctype, declaration] of Object.entries(profile.doctypes)) {
    assertObject(declaration, `${profileSource}: doctypes.${doctype}`);
    const keys = Object.keys(declaration).filter((key) => !["form", "grid", "fieldRoles", "listColumns"].includes(key) && !key.startsWith("//"));
    if (keys.length) throw new Error(`${profileSource}: doctypes.${doctype} does not support ${keys.join(", ")}`);
    if (declaration.form === undefined && declaration.grid === undefined && declaration.fieldRoles === undefined && declaration.listColumns === undefined) {
      throw new Error(`${profileSource}: doctypes.${doctype} must declare form, grid, fieldRoles, or listColumns`);
    }
    if (declaration.form !== undefined) assertObject(declaration.form, `${profileSource}: doctypes.${doctype}.form`);
    if (declaration.grid !== undefined) assertObject(declaration.grid, `${profileSource}: doctypes.${doctype}.grid`);
    const listColumns = declaration.listColumns === undefined
      ? undefined
      : stringList(declaration.listColumns, `${profileSource}: doctypes.${doctype}.listColumns`);
    if (declaration.fieldRoles !== undefined) {
      assertObject(declaration.fieldRoles, `${profileSource}: doctypes.${doctype}.fieldRoles`);
      for (const [fieldname, role] of Object.entries(declaration.fieldRoles)) {
        if (!fieldname || typeof role !== "string" || !CELL_ROLES.has(role)) {
          throw new Error(`${profileSource}: doctypes.${doctype}.fieldRoles.${fieldname || "?"} has invalid role ${String(role)}`);
        }
      }
    }
    requested.set(doctype, { ...declaration, ...(listColumns ? { listColumns } : {}) });
  }
  if (!requested.size) throw new Error(`${profileSource}: doctypes must not be empty`);

  const seen = new Set();
  const doctypes = brief.doctypes.map((doctype) => {
    const name = typeof doctype?.name === "string" ? doctype.name : "";
    const declaration = requested.get(name);
    if (!declaration) return doctype;
    seen.add(name);
    return {
      ...doctype,
      ...(declaration.listColumns ? { list: declaration.listColumns } : {}),
      operational: {
        ...(declaration.form ? { form: declaration.form } : {}),
        ...(declaration.grid ? { grid: declaration.grid } : {}),
        ...(declaration.fieldRoles ? { fieldRoles: declaration.fieldRoles } : {}),
      },
    };
  });
  const missing = [...requested.keys()].filter((name) => !seen.has(name));
  if (missing.length) throw new Error(`${profileSource}: DocType not found in brief: ${missing.join(", ")}`);

  return {
    ...brief,
    ...(profile.version ? { version: profile.version } : {}),
    doctypes,
  };
}
