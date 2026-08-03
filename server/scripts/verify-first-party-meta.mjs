#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";
import { readAppSource } from "./lib/read-app-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");
const sources = ["maintenance", "projects", "support", "visits", "hrm", "vn-accounting", "erp-organization-security", "manufacturing-qms"];
const failures = [];

for (const source of sources) {
  const sourceDir = path.join(serverRoot, "apps-src", source);
  let manifest;
  try {
    manifest = parseAppManifest(await readAppSource(sourceDir));
  } catch (error) {
    failures.push(`${source}: ${error.message}`);
    continue;
  }

  if (manifest.metaContractVersion !== 1) failures.push(`${source}: canonical Meta v1 is not enabled`);
  for (const doctype of manifest.doctypes) {
    if (!doctype.kind) failures.push(`${source}/${doctype.name}: missing kind`);
    if (!doctype.viewPolicy?.list || !doctype.viewPolicy?.form) failures.push(`${source}/${doctype.name}: missing list/form viewPolicy`);
    for (const field of doctype.fields) {
      if (!field.valueSource || !field.editMode || !field.surface) {
        failures.push(`${source}/${doctype.name}.${field.fieldname}: incomplete field contract`);
      }
      if (["system", "workflow", "formula"].includes(field.valueSource) && !field.serverEnforced) {
        failures.push(`${source}/${doctype.name}.${field.fieldname}: server-owned value is not enforced`);
      }
      if (field.surface === "internal" && field.editMode === "editable") {
        failures.push(`${source}/${doctype.name}.${field.fieldname}: internal field is editable`);
      }
    }
  }

  const fieldCount = manifest.doctypes.reduce((total, doctype) => total + doctype.fields.length, 0);
  console.log(`FIRST_PARTY_META_PASS app=${manifest.id}@${manifest.version} doctypes=${manifest.doctypes.length} fields=${fieldCount} external=${manifest.externalDocTypes.length}`);
}

if (failures.length) {
  console.error("FIRST_PARTY_META_FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
