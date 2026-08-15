#!/usr/bin/env node
/**
 * Audits every human-facing DocType/field/Select label in the canonical Alumdoor manifest against
 * the built-in Vietnamese ERP fallback.
 *
 * Run after `npm run build` from `server/`:
 *   node scripts/audit-alumdoor-vietnamese-i18n.mjs
 *
 * This is deliberately metadata-driven: no hard-coded screen list. A new DocType/field added to
 * alumdoor-v2.json automatically enters the audit on the next run.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileBrief } from "./lib/compile-brief.mjs";
import { readBriefSource } from "./lib/read-brief-source.mjs";
import {
  isLikelyEnglishUiSource,
  translateVietnameseSource,
  VIETNAMESE_ERP_TRANSLATIONS,
} from "../dist/packages/frappe-api/src/vietnamese-translations.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const briefPath = path.join(here, "..", "briefs", "alumdoor-v2.json");
const manifest = compileBrief(await readBriefSource(briefPath));

const rows = [];
const add = (scope, source) => {
  if (typeof source !== "string" || !source.trim()) return;
  rows.push({ scope, source: source.trim() });
};

for (const doctype of manifest.doctypes ?? []) {
  add(`DocType:${doctype.name}`, doctype.name);
  add(`DocType:${doctype.name}:label`, doctype.label);
  for (const field of doctype.fields ?? []) {
    add(`${doctype.name}.${field.fieldname}`, field.label);
    if (field.fieldtype === "Select" && typeof field.options === "string") {
      for (const option of field.options.split("\n")) add(`${doctype.name}.${field.fieldname}:option`, option);
    }
  }
}
for (const doctype of manifest.externalDocTypes ?? []) {
  add(`External:${doctype.name}`, doctype.name);
  add(`External:${doctype.name}:label`, doctype.label);
}

const unique = [...new Map(rows.map((row) => [`${row.scope}\u0000${row.source}`, row])).values()];
const englishLike = unique.filter((row) => isLikelyEnglishUiSource(row.source));
const resolved = englishLike.map((row) => ({ ...row, translated: translateVietnameseSource(row.source) }));
const unresolved = resolved.filter((row) => row.translated === row.source);
const exactHits = resolved.filter((row) => VIETNAMESE_ERP_TRANSLATIONS[row.source]);
const tokenHits = resolved.filter((row) => !VIETNAMESE_ERP_TRANSLATIONS[row.source] && row.translated !== row.source);

const summary = {
  doctypes: manifest.doctypes?.length ?? 0,
  externalDocTypes: manifest.externalDocTypes?.length ?? 0,
  scannedUiEntries: unique.length,
  englishLikeEntries: englishLike.length,
  translatedEntries: resolved.length - unresolved.length,
  exactCatalogHits: exactHits.length,
  tokenFallbackHits: tokenHits.length,
  unresolvedEntries: unresolved.length,
  exactCatalogSize: Object.keys(VIETNAMESE_ERP_TRANSLATIONS).length,
};

console.log(unresolved.length ? "ALUMDOOR_VI_I18N_AUDIT_FAIL" : "ALUMDOOR_VI_I18N_AUDIT_PASS");
console.log(JSON.stringify(summary, null, 2));
if (unresolved.length) {
  console.error("Unresolved English-like metadata labels:");
  for (const row of unresolved.slice(0, 100)) console.error(`- ${row.scope}: ${JSON.stringify(row.source)}`);
  if (unresolved.length > 100) console.error(`... and ${unresolved.length - 100} more`);
  process.exit(1);
}
