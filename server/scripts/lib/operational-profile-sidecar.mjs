import { readFile } from "node:fs/promises";
import path from "node:path";

const CELL_ROLES = new Set([
  "operator_input", "optional_input", "auto", "formula", "readonly", "warning", "result", "money",
]);
const PARENT_SYSTEM_FIELDS = new Set(["name", "owner", "creation", "modified", "modified_by", "docstatus", "doctype", "status"]);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

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

function briefFieldName(field) {
  if (typeof field === "string") {
    const colon = field.indexOf(":");
    const name = (colon >= 0 ? field.slice(0, colon) : field).trim();
    return IDENT.test(name) ? name : undefined;
  }
  if (field && typeof field === "object" && !Array.isArray(field) && typeof field.fieldname === "string" && IDENT.test(field.fieldname)) {
    return field.fieldname;
  }
  return undefined;
}

function briefTableTarget(field) {
  if (typeof field === "string") {
    const match = /^[A-Za-z_][A-Za-z0-9_]*\s*:\s*Table(?:\s*MultiSelect)?\(([^)]+)\)/.exec(field.trim());
    return match?.[1]?.trim();
  }
  if (field && typeof field === "object" && !Array.isArray(field)
    && (field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect")
    && typeof field.options === "string" && field.options.trim()) {
    return field.options.trim();
  }
  return undefined;
}

function parentBindings(grid) {
  const names = new Set();
  if (!grid || typeof grid !== "object" || Array.isArray(grid) || !Array.isArray(grid.projections)) return names;
  const add = (binding) => {
    if (typeof binding !== "string" || !binding.startsWith("parent.")) return;
    const field = binding.slice("parent.".length);
    if (IDENT.test(field)) names.add(field);
  };
  for (const projection of grid.projections) {
    if (!projection || typeof projection !== "object" || Array.isArray(projection)) continue;
    if (Array.isArray(projection.watch)) for (const binding of projection.watch) add(binding);
    if (projection.inputs && typeof projection.inputs === "object" && !Array.isArray(projection.inputs)) {
      for (const binding of Object.values(projection.inputs)) add(binding);
    }
  }
  return names;
}

/**
 * A `parent.<field>` binding is only meaningful when every parent DocType that can host this child
 * actually owns that field. Validate this while the brief still contains both sides of the table
 * relation; the child-level metadata parser cannot prove it in isolation.
 */
function validateParentProjectionBindings(brief, requested, profileSource) {
  const parentsByChild = new Map();
  for (const parent of brief.doctypes ?? []) {
    if (!parent || typeof parent !== "object") continue;
    const parentName = typeof parent.name === "string" ? parent.name : "?";
    const fields = Array.isArray(parent.fields) ? parent.fields : [];
    const known = new Set(fields.map(briefFieldName).filter(Boolean));
    for (const field of fields) {
      const target = briefTableTarget(field);
      if (!target) continue;
      const parents = parentsByChild.get(target) ?? [];
      parents.push({ name: parentName, fields: known });
      parentsByChild.set(target, parents);
    }
  }

  for (const [doctype, declaration] of requested) {
    const bindings = parentBindings(declaration.grid);
    if (!bindings.size) continue;
    const parents = parentsByChild.get(doctype) ?? [];
    if (!parents.length) {
      throw new Error(`${profileSource}: doctypes.${doctype}.grid uses parent.* projection bindings but no parent Table field targets ${doctype}`);
    }
    for (const field of bindings) {
      if (PARENT_SYSTEM_FIELDS.has(field)) continue;
      const missing = parents.filter((parent) => !parent.fields.has(field)).map((parent) => parent.name);
      if (missing.length) {
        throw new Error(`${profileSource}: doctypes.${doctype}.grid references parent.${field}, missing from parent DocType(s): ${missing.join(", ")}`);
      }
    }
  }
}

/**
 * Merge an optional `<brief>.operational.json` presentation profile into brief DocTypes.
 *
 * This is deliberately a sidecar rather than a second business schema. The profile can only add
 * operational presentation metadata, visual field roles and a presentation column list. The normal
 * brief compiler and canonical server DocType parser still validate every field reference and
 * named server projection.
 *
 * `version` in the sidecar is a profile revision marker only. It MUST NOT replace the effective
 * app/package version already resolved from the canonical brief and its business sidecars. Keeping
 * package version authority outside this presentation overlay prevents a stale UI profile from
 * silently downgrading an otherwise newer install candidate.
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
  validateParentProjectionBindings(brief, requested, profileSource);

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
    // Deliberately preserve brief.version. The operational sidecar is presentation-only and
    // cannot become app/package release authority.
    doctypes,
  };
}
