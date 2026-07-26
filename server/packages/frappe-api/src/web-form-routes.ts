/**
 * Serving a Web Form to the public, and accepting what it sends back.
 *
 * The definition and payload rules are pure (`web-form` in frappe-model). This is the
 * part that reads the form, enforces the ceiling, and runs the write — the only code
 * path on this platform an unauthenticated visitor can reach.
 *
 * THE GRANT COMES FROM DocPerm, NOT FROM HERE. A submission runs as an actor carrying
 * the form's `submit_as_role` and nothing else, and the ordinary permission layer then
 * decides. If the tenant has not given that role `create` on the doctype, the write is
 * refused exactly as any other unauthorised write would be. There is no bypass to
 * remember, and revoking the role is the same action in the same place as always.
 */

import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { acceptWebFormPayload, parseWebForm, visitorKey, type WebFormDefinition } from "../../frappe-model/src/index.js";

export const WEB_FORM_GET = "/api/method/metaforge.api.get_web_form";
export const WEB_FORM_ACCEPT = "/api/method/frappe.website.doctype.web_form.web_form.accept";

/** Paths a visitor with no session may reach. */
export function isWebFormPath(pathname: string): boolean {
  return pathname === WEB_FORM_GET || pathname === WEB_FORM_ACCEPT;
}

export interface WebFormStore {
  db: D1Database;
  tenantId: string;
  now: string;
  /** Per-deployment salt for the visitor counter — never the visitor's address. */
  salt: string;
}

/**
 * Loads a form by route.
 *
 * An unpublished or missing form is the SAME answer — 404 — so the existence of a draft
 * form cannot be probed from outside.
 */
export async function loadPublishedForm(store: WebFormStore, route: string): Promise<WebFormDefinition> {
  const row = await store.db.prepare(
    `SELECT name, route, doc_type, title, introduction, success_message, fields_json,
            submit_as_role, login_required, published, max_per_day
     FROM web_forms WHERE tenant_id=?1 AND route=?2 AND published=1`,
  ).bind(store.tenantId, route).first<{
    name: string; route: string; doc_type: string; title: string; introduction: string;
    success_message: string; fields_json: string; submit_as_role: string;
    login_required: number; published: number; max_per_day: number;
  }>();
  if (!row) throw errors.notFound("No such form");

  return parseWebForm({
    ...row,
    fields: JSON.parse(row.fields_json) as string[],
    login_required: row.login_required === 1,
    published: true,
  });
}

/** What a visitor is allowed to see about a form: enough to render it, and no more. */
export function publicFormShape(form: WebFormDefinition): JsonObject {
  return {
    name: form.name,
    route: form.route,
    doc_type: form.doc_type,
    title: form.title,
    introduction: form.introduction,
    fields: form.fields,
    login_required: form.login_required,
    // `submit_as_role` and `max_per_day` are deliberately absent: they tell an attacker
    // which role to target and how much room they have before the ceiling stops them.
  };
}

/**
 * Records one submission against the daily ceiling, refusing when it is reached.
 *
 * Counted BEFORE the write, so a visitor cannot exhaust the tenant's database and only
 * then be told to stop.
 */
export async function consumeSubmissionAllowance(
  store: WebFormStore,
  form: WebFormDefinition,
  clientAddress: string,
): Promise<void> {
  const visitor = await visitorKey(clientAddress, form.name, store.salt);
  const day = store.now.slice(0, 10);

  const row = await store.db.prepare(
    `INSERT INTO web_form_submissions(tenant_id,form_name,visitor,day,count,modified_at)
     VALUES(?1,?2,?3,?4,1,?5)
     ON CONFLICT(tenant_id,form_name,visitor,day) DO UPDATE SET count=count+1, modified_at=excluded.modified_at
     RETURNING count`,
  ).bind(store.tenantId, form.name, visitor, day, store.now).first<{ count: number }>();

  if ((row?.count ?? 0) > form.max_per_day) {
    // Deliberately vague: naming the ceiling tells a submitter exactly how many attempts
    // a fresh address buys them.
    throw errors.validation("Too many submissions from this address today");
  }
}

/**
 * The actor a submission runs as.
 *
 * Guest, carrying ONLY the role the form names. Not the visitor's own session even when
 * they have one: a form must behave the same for everybody, or an internal user filling
 * in a public form would silently write with their own, larger rights.
 */
export function submissionActor(form: WebFormDefinition): Actor {
  return { user_id: "Guest", roles: [form.submit_as_role] };
}

/** Validates a submission against the form and the doctype, returning the document to write. */
export function submissionDocument(
  form: WebFormDefinition,
  meta: Parameters<typeof acceptWebFormPayload>[1],
  submitted: JsonObject,
): JsonObject {
  return acceptWebFormPayload(form, meta, submitted);
}
