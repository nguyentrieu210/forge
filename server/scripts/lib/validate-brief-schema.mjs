import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

let compiled;

/** Validates the author-facing brief before semantic compilation. */
export async function validateBriefSchema(brief, schemaPath = path.resolve(import.meta.dirname, "../../briefs/brief.schema.json")) {
  if (!compiled) {
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    compiled = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  }
  if (compiled(brief)) return [];
  return (compiled.errors ?? []).map((error) => {
    const at = error.instancePath || "/";
    return `${at} ${error.message ?? "is invalid"}`;
  });
}
