import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { prepareBriefInputTablesForSchema } from "./action-input-table-brief.mjs";

let compiled;

/** Validates the author-facing brief before semantic compilation. */
export async function validateBriefSchema(brief, schemaPath = path.resolve(import.meta.dirname, "../../briefs/brief.schema.json")) {
  if (!compiled) {
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    compiled = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  }

  // WS09 transition: the checked-in JSON Schema predates AppAction input tables and keeps
  // `additionalProperties=false`. Strip exactly `actions[].inputTables` after validating it
  // with the shared brief helper; all other unknown keys still reach AJV unchanged.
  const { schemaBrief, errors: inputTableErrors } = prepareBriefInputTablesForSchema(brief);
  const schemaErrors = compiled(schemaBrief)
    ? []
    : (compiled.errors ?? []).map((error) => {
      const at = error.instancePath || "/";
      return `${at} ${error.message ?? "is invalid"}`;
    });
  return [...inputTableErrors, ...schemaErrors];
}
