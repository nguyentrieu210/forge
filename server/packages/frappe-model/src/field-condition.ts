/**
 * A restricted evaluator for Frappe field conditions (`mandatory_depends_on`).
 *
 * Frappe writes these as JavaScript (`eval:doc.is_return == 1`). Running actual
 * JavaScript on the server to decide a validation rule would hand every DocType
 * author remote code execution, so this parses a small, closed grammar instead:
 *
 *     condition  := clause (('&&' | '||') clause)*
 *     clause     := ['!'] 'doc.' field [ op value ]
 *     op         := '==' | '===' | '!=' | '!==' | '>' | '>=' | '<' | '<=' | 'in'
 *     value      := number | 'true' | 'false' | quoted string | array of those
 *
 * A bare `fieldname` (no `eval:`) is Frappe's shorthand for "that field is
 * truthy" and is supported too.
 *
 * Anything outside the grammar is REJECTED WHEN THE DOCTYPE IS SAVED rather than
 * ignored at runtime. Ignoring it would silently drop a business rule the author
 * believed was in force; refusing the metadata means the rule is either enforced
 * or visibly absent.
 *
 * Mixed `&&`/`||` without parentheses is refused for the same reason: JavaScript
 * would apply its own precedence, and a rule that reads differently to its author
 * than to the engine is worse than no rule.
 */

import { errors } from "../../core/src/index.js";
import type { JsonObject, JsonValue } from "../../contracts/src/index.js";

type Comparison = "==" | "!=" | ">" | ">=" | "<" | "<=" | "in";

interface Clause {
  negated: boolean;
  field: string;
  operator?: Comparison;
  value?: JsonValue;
}

interface ParsedCondition {
  joiner: "&&" | "||" | null;
  clauses: Clause[];
}

const CLAUSE = /^(!?)\s*doc\.([A-Za-z_][A-Za-z0-9_]*)\s*(===|!==|==|!=|>=|<=|>|<|\bin\b)?\s*(.*)$/;

/** Parses a condition, throwing a validation error when it is outside the grammar. */
export function parseFieldCondition(expression: string): ParsedCondition {
  const trimmed = expression.trim();
  if (!trimmed) throw errors.validation("A field condition cannot be empty");

  if (!trimmed.startsWith("eval:")) {
    // Shorthand: a bare field name means "this other field has a value".
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
      throw errors.validation(`Unsupported field condition: ${expression}`);
    }
    return { joiner: null, clauses: [{ negated: false, field: trimmed }] };
  }

  const body = trimmed.slice("eval:".length).trim();
  const hasAnd = /&&/.test(body);
  const hasOr = /\|\|/.test(body);
  if (hasAnd && hasOr) {
    throw errors.validation("A field condition cannot mix && and || without parentheses");
  }
  if (/[()]/.test(body)) throw errors.validation("Parenthesised field conditions are not supported");

  const joiner: "&&" | "||" | null = hasAnd ? "&&" : hasOr ? "||" : null;
  const parts = joiner ? body.split(joiner) : [body];
  return { joiner, clauses: parts.map((part) => parseClause(part, expression)) };
}

function parseClause(part: string, original: string): Clause {
  const match = CLAUSE.exec(part.trim());
  if (!match) throw errors.validation(`Unsupported field condition: ${original}`);
  const [, bang, field, rawOperator, rawValue] = match;
  const negated = bang === "!";

  if (!rawOperator) {
    if (rawValue && rawValue.trim()) throw errors.validation(`Unsupported field condition: ${original}`);
    return { negated, field: field! };
  }
  const operator = normalizeOperator(rawOperator);
  const value = parseLiteral(rawValue ?? "", original);
  if (operator === "in" && !Array.isArray(value)) {
    throw errors.validation(`The "in" operator needs a list: ${original}`);
  }
  return { negated, field: field!, operator, value };
}

function normalizeOperator(raw: string): Comparison {
  const trimmed = raw.trim();
  if (trimmed === "===") return "==";
  if (trimmed === "!==") return "!=";
  return trimmed as Comparison;
}

function parseLiteral(raw: string, original: string): JsonValue {
  const text = raw.trim();
  if (!text) throw errors.validation(`Field condition is missing a value: ${original}`);
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (/^["'].*["']$/.test(text)) return text.slice(1, -1);
  if (text.startsWith("[")) {
    // Single quotes are legal in JavaScript but not JSON; normalising them keeps
    // real-world expressions working without accepting arbitrary syntax.
    try {
      return JSON.parse(text.replace(/'/g, '"')) as JsonValue;
    } catch {
      throw errors.validation(`Field condition list is malformed: ${original}`);
    }
  }
  throw errors.validation(`Unsupported field condition value: ${original}`);
}

/**
 * Evaluates a condition against a document.
 *
 * `submitted` is the incoming payload and `existing` the stored document; a field
 * absent from the payload falls back to its stored value, so a partial save is
 * judged against the document as it will be, not as the request happened to
 * describe it.
 */
export function evaluateFieldCondition(expression: string, submitted: JsonObject, existing?: JsonObject): boolean {
  let parsed: ParsedCondition;
  try {
    parsed = parseFieldCondition(expression);
  } catch {
    // Unreachable for stored metadata: `assertFieldConditionSupported` rejects an
    // unparseable expression when the DocType is saved. Treated as "no condition"
    // rather than throwing, so a legacy row can never make a document unsavable.
    return false;
  }
  const results = parsed.clauses.map((clause) => evaluateClause(clause, submitted, existing));
  if (parsed.joiner === "||") return results.some(Boolean);
  return results.every(Boolean);
}

function evaluateClause(clause: Clause, submitted: JsonObject, existing?: JsonObject): boolean {
  const raw = clause.field in submitted ? submitted[clause.field] : existing?.[clause.field];
  const outcome = clause.operator ? compare(clause.operator, raw, clause.value) : truthy(raw);
  return clause.negated ? !outcome : outcome;
}

function compare(operator: Comparison, left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (operator === "in") {
    const list = Array.isArray(right) ? right : [];
    return list.some((entry) => looseEquals(left, entry));
  }
  if (operator === "==") return looseEquals(left, right);
  if (operator === "!=") return !looseEquals(left, right);

  const a = numeric(left);
  const b = numeric(right);
  // A non-numeric comparison is neither true nor false in any useful sense; the
  // condition simply does not apply, which is the same answer JavaScript's NaN
  // comparisons would give.
  if (a === null || b === null) return false;
  if (operator === ">") return a > b;
  if (operator === ">=") return a >= b;
  if (operator === "<") return a < b;
  return a <= b;
}

/**
 * Frappe stores checkboxes as 0/1 and often compares them to `1` or `true`, and
 * numbers arriving from a query string are strings. Comparison is therefore loose
 * across those representations — strictly comparing would make ordinary
 * conditions silently never fire.
 */
function looseEquals(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (left === right) return true;
  if (left === undefined || left === null) return right === undefined || right === null || right === "" || right === false || right === 0;
  if (typeof left === "boolean" || typeof right === "boolean") return boolish(left) === boolish(right);
  const a = numeric(left);
  const b = numeric(right);
  if (a !== null && b !== null) return a === b;
  return String(left) === String(right);
}

function truthy(value: JsonValue | undefined): boolean {
  if (value === undefined || value === null || value === "" || value === false || value === 0) return false;
  if (value === "0") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function boolish(value: JsonValue | undefined): boolean {
  return truthy(value);
}

function numeric(value: JsonValue | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/**
 * Validates a condition at DocType-save time.
 *
 * This is the gate that makes runtime evaluation safe: a condition the server
 * cannot enforce is never allowed into stored metadata, so nobody can define a
 * rule that appears to exist but is quietly ignored.
 */
export function assertFieldConditionSupported(expression: string, fieldname: string, property: string): void {
  try {
    parseFieldCondition(expression);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unsupported";
    throw errors.validation(`${fieldname}.${property} cannot be enforced by the server: ${detail}`, { fieldname });
  }
}
