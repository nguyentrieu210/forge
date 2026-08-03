import { BriefError } from "./compile-brief.mjs";

const UI_POLICY_KEYS = ["bulk", "matrix"];

/**
 * Keep the legacy brief schema strict for every pre-existing property while allowing
 * UI01-owned view policy blocks to be validated by the canonical server parser after
 * compilation. The clone is schema-only; the original brief remains untouched.
 */
export function withoutUiViewPolicies(brief) {
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) return brief;
  if (!Array.isArray(brief.doctypes)) return brief;
  return {
    ...brief,
    doctypes: brief.doctypes.map((doctype) => {
      if (!doctype || typeof doctype !== "object" || Array.isArray(doctype)) return doctype;
      const copy = { ...doctype };
      for (const key of UI_POLICY_KEYS) delete copy[key];
      return copy;
    }),
  };
}

/** Cheap author-facing checks. Deep semantics are intentionally owned by parseDocTypeMeta. */
export function validateBriefUiViewPolicies(brief) {
  if (!brief || typeof brief !== "object" || !Array.isArray(brief.doctypes)) return [];
  const errors = [];
  brief.doctypes.forEach((doctype, index) => {
    if (!doctype || typeof doctype !== "object" || Array.isArray(doctype)) return;
    for (const key of UI_POLICY_KEYS) {
      if (doctype[key] === undefined) continue;
      if (!doctype[key] || typeof doctype[key] !== "object" || Array.isArray(doctype[key])) {
        errors.push(`/doctypes/${index}/${key} must be an object`);
        continue;
      }
      if (doctype[key].enabled !== undefined && typeof doctype[key].enabled !== "boolean") {
        errors.push(`/doctypes/${index}/${key}/enabled must be boolean`);
      }
    }
  });
  return errors;
}

/**
 * Add UI01-owned policies after the mature base compiler has derived the rest of a package.
 * This avoids duplicating list/form/workflow compilation while still making Matrix/Bulk
 * first-class package data. parseAppManifest immediately validates the result in forge-app.
 */
export function attachBriefUiViewPolicies(brief, pkg) {
  if (!brief || typeof brief !== "object" || !Array.isArray(brief.doctypes)) return pkg;
  if (!pkg || typeof pkg !== "object" || !Array.isArray(pkg.doctypes)) {
    throw new BriefError("compiler output has no doctypes array for UI view policy attachment");
  }

  const sourceByName = new Map();
  for (const doctype of brief.doctypes) {
    if (!doctype || typeof doctype !== "object" || Array.isArray(doctype) || typeof doctype.name !== "string") continue;
    sourceByName.set(doctype.name, doctype);
  }

  for (const compiled of pkg.doctypes) {
    if (!compiled || typeof compiled !== "object" || Array.isArray(compiled) || typeof compiled.name !== "string") continue;
    const source = sourceByName.get(compiled.name);
    if (!source) continue;
    const next = {};
    for (const key of UI_POLICY_KEYS) {
      const policy = source[key];
      if (policy === undefined) continue;
      if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
        throw new BriefError(`${compiled.name}: ${key} must be an object`);
      }
      next[key] = { enabled: true, ...policy };
    }
    if (Object.keys(next).length) compiled.viewPolicy = { ...(compiled.viewPolicy ?? {}), ...next };
  }
  return pkg;
}
