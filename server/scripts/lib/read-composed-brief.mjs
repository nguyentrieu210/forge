import { readFile } from "node:fs/promises";
import path from "node:path";

export class BriefOverlayError extends Error {}

/**
 * Reads a normal brief or a small semantic overlay that extends another brief.
 *
 * The resulting object is an ordinary brief and is validated/compiled by the existing
 * pipeline. Overlay-only keys never reach the manifest parser.
 */
export async function readComposedBrief(sourcePath, chain = []) {
  const absolute = path.resolve(sourcePath);
  if (chain.includes(absolute)) {
    throw new BriefOverlayError(`Brief overlay cycle: ${[...chain, absolute].join(" -> ")}`);
  }

  let declared;
  try {
    declared = JSON.parse(await readFile(absolute, "utf8"));
  } catch (error) {
    throw new BriefOverlayError(`${sourcePath}: ${error.message}`);
  }
  if (!declared.$extends) return declared;
  if (typeof declared.$extends !== "string" || !declared.$extends.trim()) {
    throw new BriefOverlayError(`${sourcePath}: $extends must be a non-empty relative path`);
  }

  const basePath = path.resolve(path.dirname(absolute), declared.$extends);
  const base = await readComposedBrief(basePath, [...chain, absolute]);
  return applyBriefOverlay(base, declared, sourcePath);
}

export function applyBriefOverlay(base, overlay, label = "brief overlay") {
  if (!base || typeof base !== "object" || Array.isArray(base)) {
    throw new BriefOverlayError(`${label}: base brief must be an object`);
  }
  if (!overlay || typeof overlay !== "object" || Array.isArray(overlay)) {
    throw new BriefOverlayError(`${label}: overlay must be an object`);
  }

  const allowed = new Set([
    "$extends", "$schema", "//", "set", "doctypeUpserts", "doctypePatches",
    "reportUpserts", "linkUpserts", "screenUpserts", "actionUpserts",
    "validatorUpserts", "printUpserts",
  ]);
  for (const key of Object.keys(overlay)) {
    if (!allowed.has(key) && !key.startsWith("//")) {
      throw new BriefOverlayError(`${label}: unsupported overlay key ${key}`);
    }
  }

  const result = structuredClone(base);
  if (overlay.set !== undefined) {
    assertPlainObject(overlay.set, `${label}.set`);
    Object.assign(result, structuredClone(overlay.set));
  }

  result.doctypes = upsertNamed(result.doctypes, overlay.doctypeUpserts, "name", `${label}.doctypeUpserts`);
  for (const [index, patch] of (overlay.doctypePatches ?? []).entries()) {
    patchDoctype(result, patch, `${label}.doctypePatches[${index}]`);
  }
  result.reports = upsertNamed(result.reports, overlay.reportUpserts, "name", `${label}.reportUpserts`);
  result.links = upsertNamed(result.links, overlay.linkUpserts, "report", `${label}.linkUpserts`);
  result.screens = upsertNamed(result.screens, overlay.screenUpserts, "name", `${label}.screenUpserts`);
  result.actions = upsertNamed(result.actions, overlay.actionUpserts, "name", `${label}.actionUpserts`);
  result.validators = upsertNamed(result.validators, overlay.validatorUpserts, "doctype", `${label}.validatorUpserts`);
  result.prints = upsertNamed(result.prints, overlay.printUpserts, "name", `${label}.printUpserts`);
  return result;
}

function patchDoctype(brief, patch, where) {
  assertPlainObject(patch, where);
  if (typeof patch.name !== "string" || !patch.name) throw new BriefOverlayError(`${where}.name is required`);
  const doctypes = Array.isArray(brief.doctypes) ? brief.doctypes : [];
  const target = doctypes.find((doctype) => doctype?.name === patch.name);
  if (!target) throw new BriefOverlayError(`${where}: DocType ${patch.name} does not exist`);

  const allowed = new Set(["name", "set", "fieldUpserts", "removeFields", "listAppend", "searchAppend"]);
  for (const key of Object.keys(patch)) {
    if (!allowed.has(key) && !key.startsWith("//")) throw new BriefOverlayError(`${where}: unsupported key ${key}`);
  }

  if (patch.set !== undefined) {
    assertPlainObject(patch.set, `${where}.set`);
    Object.assign(target, structuredClone(patch.set));
  }
  target.fields = upsertFields(target.fields, patch.fieldUpserts, `${where}.fieldUpserts`);
  if (patch.removeFields !== undefined) {
    if (!Array.isArray(patch.removeFields)) throw new BriefOverlayError(`${where}.removeFields must be an array`);
    const remove = new Set(patch.removeFields.map(String));
    target.fields = (target.fields ?? []).filter((field) => !remove.has(fieldName(field, `${where}.fields`)));
  }
  target.list = appendUnique(target.list, patch.listAppend, `${where}.listAppend`);
  target.search = appendUnique(target.search, patch.searchAppend, `${where}.searchAppend`);
}

function upsertFields(current, additions, where) {
  const result = Array.isArray(current) ? structuredClone(current) : [];
  if (additions === undefined) return result;
  if (!Array.isArray(additions)) throw new BriefOverlayError(`${where} must be an array`);
  const indexes = new Map(result.map((field, index) => [fieldName(field, `${where}.base[${index}]`), index]));
  for (const [index, field] of additions.entries()) {
    const name = fieldName(field, `${where}[${index}]`);
    const existing = indexes.get(name);
    if (existing === undefined) {
      indexes.set(name, result.length);
      result.push(structuredClone(field));
    } else {
      result[existing] = structuredClone(field);
    }
  }
  return result;
}

function fieldName(field, where) {
  if (field && typeof field === "object" && !Array.isArray(field) && typeof field.fieldname === "string") {
    return field.fieldname;
  }
  if (typeof field === "string") {
    const match = /^([a-z_][a-z0-9_]*)/i.exec(field.trim());
    if (match) return match[1];
  }
  throw new BriefOverlayError(`${where}: cannot determine fieldname`);
}

function upsertNamed(current, additions, key, where) {
  const result = Array.isArray(current) ? structuredClone(current) : [];
  if (additions === undefined) return result;
  if (!Array.isArray(additions)) throw new BriefOverlayError(`${where} must be an array`);
  const indexes = new Map();
  for (const [index, entry] of result.entries()) {
    const value = entry?.[key];
    if (typeof value === "string") indexes.set(value, index);
  }
  for (const [index, entry] of additions.entries()) {
    assertPlainObject(entry, `${where}[${index}]`);
    const value = entry[key];
    if (typeof value !== "string" || !value) throw new BriefOverlayError(`${where}[${index}].${key} is required`);
    const existing = indexes.get(value);
    if (existing === undefined) {
      indexes.set(value, result.length);
      result.push(structuredClone(entry));
    } else {
      result[existing] = structuredClone(entry);
    }
  }
  return result;
}

function appendUnique(current, additions, where) {
  const result = Array.isArray(current) ? [...current] : [];
  if (additions === undefined) return result;
  if (!Array.isArray(additions)) throw new BriefOverlayError(`${where} must be an array`);
  const seen = new Set(result);
  for (const value of additions) {
    if (typeof value !== "string" || !value) throw new BriefOverlayError(`${where} entries must be non-empty strings`);
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function assertPlainObject(value, where) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BriefOverlayError(`${where} must be an object`);
  }
}
