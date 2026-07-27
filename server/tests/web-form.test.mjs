import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptWebFormPayload,
  parseDocTypeMeta,
  parseWebForm,
  visitorKey,
} from "../dist/packages/frappe-model/src/index.js";

/**
 * The platform's only public write surface.
 *
 * Every other write needs a session, so every rule here is load-bearing: this is where
 * an anonymous visitor reaches a tenant's database.
 */
function form(overrides = {}) {
  return parseWebForm({
    name: "Contact us",
    route: "contact",
    doc_type: "Lead",
    submit_as_role: "Website Visitor",
    fields: ["full_name", "message"],
    ...overrides,
  });
}

const LEAD = parseDocTypeMeta({
  name: "Lead",
  module: "CRM",
  fields: [
    { fieldname: "full_name", label: "Name", fieldtype: "Data", required: true },
    { fieldname: "message", label: "Message", fieldtype: "Text" },
    { fieldname: "score", label: "Score", fieldtype: "Int", read_only: true },
    { fieldname: "portal_pin", label: "PIN", fieldtype: "Password" },
    { fieldname: "owner_note", label: "Internal", fieldtype: "Data" },
  ],
  permissions: [{ role: "Website Visitor", read: true, create: true }],
  revision: 1,
});

// ---- defining a form ---------------------------------------------------------

test("a form is UNPUBLISHED until someone says otherwise", () => {
  // A form that went live the moment it was saved would be a public endpoint nobody
  // meant to open yet.
  assert.equal(form().published, false);
  assert.equal(form({ published: true }).published, true);
});

test("a route is a slug, not a path", () => {
  // Allowing slashes would let one form claim a prefix of another's address.
  for (const bad of ["contact/us", "/contact", "Contact", "contact us", ""]) {
    assert.throws(() => form({ route: bad }), undefined, bad);
  }
});

test("a form with no fields is refused", () => {
  // It would accept an empty document from anyone.
  assert.throws(() => form({ fields: [] }), /at least one field/);
});

test("the submission ceiling is bounded and cannot be disabled", () => {
  assert.equal(form().max_per_day, 20);
  assert.throws(() => form({ max_per_day: 0 }));
  assert.throws(() => form({ max_per_day: 999_999 }));
});

// ---- accepting a submission --------------------------------------------------

test("a submission may set exactly the fields the form declares", () => {
  const payload = acceptWebFormPayload(form(), LEAD, { full_name: "An", message: "Xin chào" });
  assert.deepEqual(payload, { full_name: "An", message: "Xin chào" });
});

test("a field outside the form is REFUSED, not silently dropped", () => {
  // Dropping would let a visitor believe they set a value that was discarded, and would
  // hide an attempt to set something they were never shown.
  assert.throws(
    () => acceptWebFormPayload(form(), LEAD, { full_name: "An", owner_note: "escalate me" }),
    /is not accepted by this form/,
  );
});

test("a read-only field cannot be set from outside even if the form declares it", () => {
  // `read_only` is the author's statement that the value is computed. A form must not
  // be able to override that from the public internet.
  assert.throws(
    () => acceptWebFormPayload(form({ fields: ["full_name", "score"] }), LEAD, { full_name: "An", score: 100 }),
    /is read-only/,
  );
});

test("a Password can never be submitted through a public form", () => {
  assert.throws(
    () => acceptWebFormPayload(form({ fields: ["full_name", "portal_pin"] }), LEAD, { full_name: "An", portal_pin: "1234" }),
    /cannot be submitted through a web form/,
  );
});

test("a field the doctype no longer has is refused rather than stored", () => {
  assert.throws(
    () => acceptWebFormPayload(form({ fields: ["full_name", "removed_field"] }), LEAD, { full_name: "An", removed_field: "x" }),
    /is not a field of Lead/,
  );
});

test("a form that cannot satisfy a required field is caught here, not at the kernel", () => {
  // Otherwise the write fails deep in the stack with a message about a field that was
  // never on the page.
  assert.throws(
    () => acceptWebFormPayload(form({ fields: ["message"] }), LEAD, { message: "hi" }),
    /required but this form does not collect it/,
  );
});

// ---- counting visitors -------------------------------------------------------

test("the visitor key distinguishes visitors without recording who they are", async () => {
  const salt = "deployment-salt";
  const a = await visitorKey("203.0.113.5", "contact", salt);
  const b = await visitorKey("203.0.113.9", "contact", salt);
  assert.notEqual(a, b, "two visitors must count separately");
  assert.match(a, /^[0-9a-f]{64}$/, "the stored key must be a complete SHA-256 digest");
  assert.equal(a, await visitorKey("203.0.113.5", "contact", salt), "and one visitor must count together");

  // The address must not be recoverable from what is stored: a public form would
  // otherwise become a log of everyone who ever opened it.
  assert.doesNotMatch(a, /203|113/);

  // Per form, so a visitor's use of one form does not consume another's allowance.
  assert.notEqual(a, await visitorKey("203.0.113.5", "careers", salt));
  // Per deployment, so a key from one platform means nothing on another.
  assert.notEqual(a, await visitorKey("203.0.113.5", "contact", "other-salt"));
});
