const ID = /^[a-z][a-z0-9-]*$/;
const FIELD = /^[a-z][a-z0-9_]*$/;
const APP = /^[a-z][a-z0-9-]*$/;
const REF = /^@ref:([a-z][a-z0-9-]*)$/;
const DATE = /^@date:([+-]?\d{1,4})$/;
const DATETIME = /^@datetime:([+-]?\d{1,4})$/;

export function validateDemoSeedManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("seed manifest must be an object");
  if (!APP.test(String(input.app ?? ""))) throw new Error("seed manifest app must be kebab-case");
  if (input.profile !== undefined && !ID.test(String(input.profile))) throw new Error("seed manifest profile must be kebab-case");
  if (!Array.isArray(input.records) || !input.records.length) throw new Error("seed manifest records must be a non-empty array");

  const seen = new Set();
  for (let index = 0; index < input.records.length; index += 1) {
    const record = input.records[index];
    const where = `records[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`${where} must be an object`);
    if (!ID.test(String(record.id ?? ""))) throw new Error(`${where}.id must be kebab-case`);
    if (seen.has(record.id)) throw new Error(`duplicate seed record id: ${record.id}`);
    if (!String(record.doctype ?? "").trim()) throw new Error(`${where}.doctype is required`);
    if (!record.key || typeof record.key !== "object" || Array.isArray(record.key)) throw new Error(`${where}.key is required`);
    if (!FIELD.test(String(record.key.field ?? ""))) throw new Error(`${where}.key.field must be snake_case`);
    if (!["string", "number"].includes(typeof record.key.value)) throw new Error(`${where}.key.value must be string or number`);
    if (!record.data || typeof record.data !== "object" || Array.isArray(record.data)) throw new Error(`${where}.data must be an object`);

    const refs = collectRefs(record.data);
    for (const ref of refs) {
      if (!seen.has(ref)) throw new Error(`${where} references ${ref} before it is defined`);
    }
    seen.add(record.id);
  }
  return input;
}

export function collectRefs(value, refs = new Set()) {
  if (typeof value === "string") {
    const match = REF.exec(value);
    if (match) refs.add(match[1]);
    return refs;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectRefs(entry, refs);
    return refs;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectRefs(entry, refs);
  }
  return refs;
}

export function resolveDemoSeedValue(value, { names = new Map(), now = new Date() } = {}) {
  if (typeof value === "string") {
    if (value === "@today") return formatDate(now);
    if (value === "@now") return now.toISOString();
    let match = REF.exec(value);
    if (match) {
      const name = names.get(match[1]);
      if (!name) throw new Error(`seed reference is unresolved: ${match[1]}`);
      return name;
    }
    match = DATE.exec(value);
    if (match) return formatDate(addUtcDays(now, Number(match[1])));
    match = DATETIME.exec(value);
    if (match) return addUtcDays(now, Number(match[1])).toISOString();
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => resolveDemoSeedValue(entry, { names, now }));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveDemoSeedValue(entry, { names, now })]));
  }
  return value;
}

export function buildSeedLookup(record) {
  return {
    doctype: record.doctype,
    fields: ["name"],
    filters: { [record.key.field]: record.key.value },
    limit_page_length: 2,
  };
}

export function seedSummary(manifest) {
  const counts = new Map();
  for (const record of manifest.records) counts.set(record.doctype, (counts.get(record.doctype) ?? 0) + 1);
  return {
    app: manifest.app,
    profile: manifest.profile ?? "default",
    records: manifest.records.length,
    doctypes: Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
}

function addUtcDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}
