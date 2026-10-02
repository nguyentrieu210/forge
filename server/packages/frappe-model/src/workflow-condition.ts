/**
 * Bounded Frappe workflow-condition evaluator.
 *
 * Frappe v16 stores transition conditions as Python expressions and evaluates them
 * against `doc`. Forge deliberately does not execute arbitrary Python from tenant
 * metadata. Instead it accepts a closed, auditable subset that covers field truthiness,
 * comparisons, membership and parenthesised boolean composition.
 *
 * Supported examples:
 *   doc.total > 0
 *   doc.status == "Open" and doc.company in ["A", "B"]
 *   not doc.is_return
 *
 * Unsupported syntax is rejected when workflow metadata is saved. This is fail-closed:
 * a business rule is either enforced everywhere or visibly refused; it is never silently
 * ignored by one workflow surface.
 */

import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { evaluateFieldCondition, parseFieldCondition } from "./field-condition.js";

function pythonToBoundedExpression(expression: string): string {
  let body = expression.trim();
  if (!body) throw errors.validation("Workflow condition cannot be empty");
  if (body.startsWith("eval:")) body = body.slice("eval:".length).trim();

  // Reject Python constructs we intentionally do not emulate before token rewriting.
  if (/\b(?:lambda|for|while|if|else|import|exec|eval|__\w+__)\b/.test(body)) {
    throw errors.validation("Workflow condition uses unsupported Python syntax");
  }
  if (/\bdoc\.(?:get|setdefault|update|items|keys|values)\s*\(/.test(body) || /\w+\s*\(/.test(body)) {
    throw errors.validation("Workflow condition function calls are not supported");
  }
  if (/\bnot\s+in\b/.test(body) || /\bis\s+(?:not\s+)?None\b/.test(body)) {
    throw errors.validation("Workflow condition operator is not supported");
  }

  // Frappe/Python literals and boolean operators -> the shared bounded evaluator grammar.
  body = body
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\bNone\b/g, "null")
    .replace(/\band\b/g, "&&")
    .replace(/\bor\b/g, "||")
    .replace(/\bnot\s+(?=doc\.)/g, "!");

  const normalized = `eval:${body}`;
  parseFieldCondition(normalized);
  return normalized;
}

/** Validate at metadata-write/read boundary so unsupported rules never become latent. */
export function assertWorkflowConditionSupported(expression: string): void {
  pythonToBoundedExpression(expression);
}

/** Evaluate using the same authority used by every workflow offer and commit path. */
export function evaluateWorkflowCondition(
  expression: string,
  submitted: JsonObject,
  existing?: JsonObject,
): boolean {
  return evaluateFieldCondition(pythonToBoundedExpression(expression), submitted, existing);
}
