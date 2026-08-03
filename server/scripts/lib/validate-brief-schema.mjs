import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { prepareBriefInputTablesForSchema } from "./action-input-table-brief.mjs";
import { validateBriefContextDimensions } from "./business-context-dimensions.mjs";
import { validateBriefUiViewPolicies, withoutUiViewPolicies } from "./brief-ui-view-policy.mjs";

let compiled;

/**
 * Validates the author-facing brief before semantic compilation.
 *
 * The checked-in schema still predates two first-class authoring additions: AppAction
 * inputTables and DocType Bulk/Matrix policies. Each extension is validated by its owned
 * helper, stripped only from the AJV compatibility view, then validated deeply by the
 * canonical server parser after compilation. All other unknown keys still fail closed.
 */
export async function validateBriefSchema(brief, schemaPath = path.resolve(import.meta.dirname, "../../briefs/brief.schema.json")) {
  if (!compiled) {
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    compiled = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  }

  const { schemaBrief: inputTableCompatibleBrief, errors: inputTableErrors } = prepareBriefInputTablesForSchema(brief);
  const schemaBrief = withoutUiViewPolicies(inputTableCompatibleBrief);
  const dimensionErrors = validateBriefContextDimensions(brief);
  const uiErrors = validateBriefUiViewPolicies(brief);
  const schemaErrors = compiled(schemaBrief)
    ? []
    : (compiled.errors ?? []).map((error) => {
      const at = error.instancePath || "/";
      return `${at} ${error.message ?? "is invalid"}`;
    });

  return [...new Set([...inputTableErrors, ...dimensionErrors, ...uiErrors, ...schemaErrors])];
}
