import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { validateBriefUiViewPolicies, withoutUiViewPolicies } from "./brief-ui-view-policy.mjs";

let compiled;

/**
 * Validates the author-facing brief before semantic compilation.
 *
 * UI01-owned `bulk`/`matrix` blocks are removed only from the legacy JSON-schema input,
 * then checked here and finally validated deeply by parseAppManifest/parseDocTypeMeta after
 * compilation. Everything else remains under the existing additionalProperties:false gate.
 */
export async function validateBriefSchema(brief, schemaPath = path.resolve(import.meta.dirname, "../../briefs/brief.schema.json")) {
  if (!compiled) {
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    compiled = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  }
  const uiErrors = validateBriefUiViewPolicies(brief);
  const baseInput = withoutUiViewPolicies(brief);
  if (compiled(baseInput) && uiErrors.length === 0) return [];
  const baseErrors = (compiled.errors ?? []).map((error) => {
    const at = error.instancePath || "/";
    return `${at} ${error.message ?? "is invalid"}`;
  });
  return [...baseErrors, ...uiErrors];
}
