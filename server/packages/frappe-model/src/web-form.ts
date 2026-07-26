/**
 * Web Forms — the one place an unauthenticated visitor may write.
 *
 * Every other write on this platform requires a session. This is the exception, so it is
 * built to be boring: a form names one doctype, one list of fields, and one role. It
 * grants nothing by itself.
 *
 * THE DESIGN DECISION THAT MATTERS: there is NO permission bypass. A submission runs as
 * `submit_as_role`, and the tenant must grant that role `create` on the doctype through
 * ordinary DocPerm. If they have not, the submission is refused by the same permission
 * layer that governs every other write. A Web Form can therefore never do more than the
 * tenant already decided that role may do — and revoking it is the same action as
 * revoking any other role, in the same place, with no special case to remember.
 *
 * The alternative — letting the form itself confer the right — would put a second,
 * invisible grant beside DocPerm, and the two would drift.
 */

import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { DocTypeMeta } from "./types.js";

export interface WebFormDefinition {
  name: string;
  route: string;
  doc_type: string;
  title: string;
  introduction: string;
  success_message: string;
  fields: string[];
  submit_as_role: string;
  login_required: boolean;
  published: boolean;
  max_per_day: number;
}

export function parseWebForm(value: unknown): WebFormDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation("Web form must be an object");
  const input = value as JsonObject;

  const route = text(input.route, "route", 200);
  // A route is a URL segment, not a path: allowing slashes would let one form claim a
  // prefix of another's address.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(route)) throw errors.validation(`route must be a lowercase slug: ${route}`);

  const fields = (Array.isArray(input.fields) ? input.fields : []).map((entry, index) => {
    const fieldname = text(entry, `fields[${index}]`, 140);
    if (!/^[a-z][a-z0-9_]*$/.test(fieldname)) throw errors.validation(`fields[${index}] is not a fieldname: ${fieldname}`);
    return fieldname;
  });
  // A form with no fields would accept an empty document from anyone — a way to fill a
  // table with blanks, and never what the author meant.
  if (!fields.length) throw errors.validation("A web form must expose at least one field");

  const maxPerDay = input.max_per_day === undefined ? 20 : Number(input.max_per_day);
  if (!Number.isSafeInteger(maxPerDay) || maxPerDay < 1 || maxPerDay > 10_000) {
    throw errors.validation("max_per_day must be a whole number from 1 to 10000");
  }

  return {
    name: text(input.name, "name", 140),
    route,
    doc_type: text(input.doc_type, "doc_type", 160),
    submit_as_role: text(input.submit_as_role, "submit_as_role", 140),
    fields,
    max_per_day: maxPerDay,
    title: optional(input.title, "title", 200),
    introduction: optional(input.introduction, "introduction", 4000),
    success_message: optional(input.success_message, "success_message", 500),
    login_required: input.login_required === true,
    // Unpublished by default: a form that went live the moment it was saved would be a
    // public endpoint nobody meant to open yet.
    published: input.published === true,
  };
}

/**
 * The payload a submission may actually write.
 *
 * Fields outside the form's list are REFUSED, not dropped. Dropping them silently would
 * let a visitor believe they set a value that was discarded — and would hide an attempt
 * to set `approved`, an amount, or a Link to a record they were never shown.
 */
export function acceptWebFormPayload(
  form: WebFormDefinition,
  meta: DocTypeMeta,
  submitted: JsonObject,
): JsonObject {
  const declared = new Set(form.fields);
  const known = new Map(meta.fields.map((field) => [field.fieldname, field]));

  const payload: JsonObject = {};
  for (const [key, value] of Object.entries(submitted)) {
    if (!declared.has(key)) throw errors.validation(`${key} is not accepted by this form`, { fieldname: key });
    const field = known.get(key);
    // A form naming a field the doctype no longer has is a stale form, not a valid
    // write: accepting it would store a value nothing reads.
    if (!field) throw errors.validation(`${key} is not a field of ${meta.name}`, { fieldname: key });
    // Never settable from outside, whatever the form declares. `read_only` is the
    // author's own statement that a value is computed, and a Password submitted through
    // a public form would be stored from an unauthenticated source.
    if (field.read_only) throw errors.validation(`${key} is read-only`, { fieldname: key });
    if (field.fieldtype === "Password") throw errors.validation(`${key} cannot be submitted through a web form`, { fieldname: key });
    payload[key] = value as JsonValue;
  }

  // Required fields the form never exposes can never be filled by a submitter, so the
  // write would fail at the kernel with a confusing message about a field that was not
  // on the page. Caught here, where it names the form's own mistake.
  for (const field of meta.fields) {
    if (!field.required || declared.has(field.fieldname) || field.default !== undefined) continue;
    throw errors.validation(`${meta.name}.${field.fieldname} is required but this form does not collect it`);
  }

  return payload;
}

/** A stable, non-identifying key for counting one visitor's submissions. */
export async function visitorKey(clientAddress: string, formName: string, salt: string): Promise<string> {
  // Hashed with a per-deployment salt: the ceiling needs to tell visitors apart, not to
  // record who they were. Storing the address itself would make a public form a log of
  // everyone who ever opened it.
  const data = new TextEncoder().encode(`${salt}:${formName}:${clientAddress}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].slice(0, 16).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function optional(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null || value === "") return "";
  return text(value, field, max);
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw errors.validation(`${field} must be a non-empty string up to ${max} characters`);
  }
  return value.trim();
}
