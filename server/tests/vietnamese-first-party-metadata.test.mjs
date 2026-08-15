import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { translateVietnameseUiSource } from "../dist/packages/frappe-api/src/vietnamese-enum-translations.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appsSrc = path.join(here, "..", "apps-src");
const vietnameseMarks = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
const acceptedInternationalTerms = new Set([
  "api", "bom", "email", "erp", "gps", "hr", "hrm", "id", "ip", "json", "otp", "qr", "sku", "sql", "uom", "url", "uuid", "vat", "vnd", "website",
]);

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

function isTechnicalCode(text) {
  if (/^(?:https?:\/\/|eval:|field:)/i.test(text)) return true;
  if (/^[A-Z0-9]+(?:_[A-Z0-9]+){2,}$/.test(text)) return true;
  if (/^[A-Z]{2,}[0-9][A-Z0-9_-]*$/.test(text)) return true;
  return false;
}

function stillLooksEnglish(text) {
  const value = String(text ?? "").trim();
  if (!value || value.length > 120 || vietnameseMarks.test(value) || isTechnicalCode(value)) return false;
  const words = value.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  if (!words.length) return false;
  const meaningful = words.filter((word) => !acceptedInternationalTerms.has(word.toLowerCase()));
  return meaningful.length > 0;
}

function collectSources(meta, file) {
  const sources = [];
  const push = (kind, source) => {
    if (typeof source === "string" && source.trim()) sources.push({ file, kind, source: source.trim() });
  };

  // Generic List/Form/Quick Create uses label when present and falls back to the stable DocType name.
  push("doctype-title", meta.label || meta.name);
  for (const field of meta.fields ?? []) {
    push("field-label", field.label);
    if (typeof field.description === "string" && field.description.length <= 120) push("field-description", field.description);
    if (field.fieldtype === "Select" && typeof field.options === "string") {
      for (const option of field.options.split("\n")) push("select-option", option);
    }
  }
  return sources;
}

test("all first-party DocType UI metadata has a Vietnamese display fallback", async (t) => {
  const files = (await walk(appsSrc)).filter((file) => file.endsWith(".json") && file.split(path.sep).includes("doctypes"));
  const sources = [];
  for (const file of files) {
    try {
      const meta = JSON.parse(await fs.readFile(file, "utf8"));
      if (meta && typeof meta === "object" && Array.isArray(meta.fields)) sources.push(...collectSources(meta, path.relative(appsSrc, file)));
    } catch {
      // Non-DocType JSON or generated fragments are covered by their own metadata validation.
    }
  }

  const unresolved = [];
  for (const entry of sources) {
    const translated = translateVietnameseUiSource(entry.source);
    if (translated === entry.source && stillLooksEnglish(entry.source)) unresolved.push(entry);
  }

  t.diagnostic(JSON.stringify({
    scannedFiles: files.length,
    uiSources: sources.length,
    unresolvedCount: unresolved.length,
    unresolved: unresolved.slice(0, 120),
  }, null, 2));

  assert.deepEqual(unresolved, []);
});
