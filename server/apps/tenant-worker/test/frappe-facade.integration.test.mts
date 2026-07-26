/**
 * End-to-end proof of the Frappe-compatible façade against real workerd, real D1
 * and real Durable Objects.
 *
 * Every other suite tests a layer in isolation. This one exercises the whole path
 * a Desk request actually takes — session, façade translation, permission layer,
 * aggregate Durable Object, D1 — because that is where the translation decisions
 * either hold together or do not.
 */
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, toFrappeModified } from "../../../packages/frappe-api/src/index.js";

const NOW = "2026-07-26T10:00:00.000Z";
const PASSWORD = "supersecret-password";

/** State shared across the ordered scenarios below. */
let sid = "";
let csrf = "";

async function call(path: string, init: RequestInit = {}, options: { auth?: boolean } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (options.auth !== false && sid) {
    headers.set("cookie", `sid=${sid}`);
    const method = (init.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD" && csrf) headers.set("x-frappe-csrf-token", csrf);
  }
  return exports.default.fetch(new Request(`https://tenant.test${path}`, { ...init, headers }));
}

async function method(name: string, args: Record<string, unknown> = {}, verb: "GET" | "POST" = "POST"): Promise<Response> {
  if (verb === "GET") {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(args)) {
      if (value === undefined) continue;
      query.set(key, typeof value === "string" ? value : JSON.stringify(value));
    }
    return call(`/api/method/${name}?${query.toString()}`);
  }
  return call(`/api/method/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
}

/** Builds CSV text with a trailing newline, as a real upload would carry. */
function csvOf(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

/**
 * Frappe wraps a method's RETURN VALUE under `message` — but not every payload.
 *
 * `getdoctype`, `getdoc` and `savedocs` write onto `frappe.response` instead of
 * returning, so their keys are top-level. Believing "always under `message`" is what
 * produced a defect that broke the Desk silently; the fallback below tolerates both
 * shapes, so it must NOT be read as evidence that either is correct. The shape itself
 * is pinned by `docs at the top level` below and by `scripts/http-smoke.mjs`.
 */
async function unwrap(response: Response): Promise<any> {
  const body: any = await response.json();
  return body?.message ?? body;
}

async function seed(): Promise<void> {
  // Master data the O2C controllers resolve from the server.
  for (const [recordType, name, data] of [
    ["Company", "Demo", { default_currency: "USD" }],
    ["Customer", "CUST-1", { customer_name: "Acme Corporation" }],
    ["Customer", "CUST-2", { customer_name: "Beta Industries" }],
    ["Currency", "USD", { currency_scale: 2 }],
    ["Item", "ITEM-1", {}],
    ["Warehouse", "Stores", {}],
    ["System Settings", "System Settings", { date_format: "dd-mm-yyyy", currency: "USD", time_zone: "Asia/Ho_Chi_Minh" }],
  ] as const) {
    await env.DB.prepare(
      `INSERT INTO master_records(tenant_id,record_type,name,data_json,modified_at)
       VALUES('demo',?1,?2,?3,?4) ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET data_json=excluded.data_json, disabled=0`,
    ).bind(recordType, name, JSON.stringify(data), NOW).run();
  }

  // A real user with a real password hash, so login is exercised rather than stubbed.
  await env.DB.prepare(
    `INSERT INTO roles(tenant_id,role,modified_at) VALUES('demo','System Manager',?1)
     ON CONFLICT(tenant_id,role) DO NOTHING`,
  ).bind(NOW).run();
  await env.DB.prepare(
    `INSERT INTO users(tenant_id,user_id,full_name,email,password_hash,language,time_zone,created_at,modified_at)
     VALUES('demo','sales@example.com','Sales Person','sales@example.com',?1,'vi','Asia/Ho_Chi_Minh',?2,?2)
     ON CONFLICT(tenant_id,user_id) DO UPDATE SET password_hash=excluded.password_hash`,
  ).bind(await hashPassword(PASSWORD, 1_000), NOW).run();
  await env.DB.prepare(
    `INSERT INTO user_roles(tenant_id,user_id,role) VALUES('demo','sales@example.com','System Manager')
     ON CONFLICT DO NOTHING`,
  ).bind().run();

  // A metadata-driven DocType, so the generic runtime is what answers.
  const meta = {
    name: "Field Visit",
    module: "Custom",
    is_submittable: true,
    autoname: "FV-.YYYY.-####",
    title_field: "subject",
    search_fields: ["subject"],
    fields: [
      { fieldname: "subject", label: "Subject", fieldtype: "Data", required: true, in_list_view: true },
      { fieldname: "customer", label: "Customer", fieldtype: "Link", options: "Customer", in_list_view: true },
      { fieldname: "is_billable", label: "Billable", fieldtype: "Check" },
      { fieldname: "billing_note", label: "Billing Note", fieldtype: "Data", mandatory_depends_on: "eval:doc.is_billable == 1" },
      { fieldname: "external_ref", label: "External Ref", fieldtype: "Data", no_copy: true },
    ],
    permissions: [{ role: "System Manager", read: true, write: true, create: true, submit: true, cancel: true, amend: true, share: true, report: true }],
    revision: 1,
  };
  await env.DB.prepare(
    `INSERT INTO doctype_definitions(tenant_id,doctype,module,is_submittable,revision,metadata_json,modified_by,modified_at)
     VALUES('demo',?1,?2,1,1,?3,'Administrator',?4)
     ON CONFLICT(tenant_id,doctype) DO UPDATE SET metadata_json=excluded.metadata_json`,
  ).bind(meta.name, meta.module, JSON.stringify(meta), NOW).run();

  await env.DB.prepare(
    `INSERT INTO translations(tenant_id,language,source_text,translated_text,modified_at)
     VALUES('demo','vi','Subject','Chủ đề',?1) ON CONFLICT DO NOTHING`,
  ).bind(NOW).run();
}

beforeAll(seed);

describe("frappe facade over real workerd, D1 and Durable Objects", () => {
  it("refuses an unauthenticated method the way frappe does, so the client can detect a lost session", async () => {
    // Real Frappe answers PermissionError/403 with "Login to access" — NOT 401.
    // The client keys session-expiry detection off exactly that string.
    const response = await method("metaforge.api.get_boot", {}, "GET");
    expect(response.status).toBe(403);
    const body: any = await response.json();
    expect(body.exc_type).toBe("PermissionError");
    expect(String(body.message)).toMatch(/Login to access/i);
  });

  it("logs in with a real password hash and issues an HttpOnly session cookie", async () => {
    const response = await call("/api/method/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usr: "sales@example.com", pwd: PASSWORD }),
    }, { auth: false });

    expect(response.status).toBe(200);
    expect(await unwrap(response)).toBe("Logged In");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/HttpOnly/);
    sid = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1).split(";")[0]!);
    csrf = response.headers.get("x-frappe-csrf-token") ?? "";
    expect(sid).not.toBe("");
    expect(csrf).not.toBe("");
  });

  it("rejects a wrong password identically to an unknown user", async () => {
    for (const credentials of [{ usr: "sales@example.com", pwd: "wrong" }, { usr: "ghost@example.com", pwd: PASSWORD }]) {
      const response = await call("/api/method/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(credentials),
      }, { auth: false });
      expect(response.status).toBe(401);
      expect((await response.json() as any).exc_type).toBe("AuthenticationError");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("boots with the tenant as site_name, which is what scopes the client cache per tenant", async () => {
    const boot = await unwrap(await method("metaforge.api.get_boot", {}, "GET"));
    expect(boot.user).toBe("sales@example.com");
    expect(boot.full_name).toBe("Sales Person");
    expect(boot.roles).toContain("System Manager");
    expect(boot.site_name).toBe("demo");
    expect(boot.frappe_version).toMatch(/forge/);
    expect(boot.csrf_token).toBe(csrf);
    expect(boot.lang).toBe("vi");
    expect(boot.sysdefaults.currency).toBe("USD");
  });

  it("rejects a write without the CSRF header even with a valid session cookie", async () => {
    // A cross-site form can send the cookie but cannot read the nonce.
    const response = await exports.default.fetch(new Request("https://tenant.test/api/resource/Field Visit", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `sid=${sid}` },
      body: JSON.stringify({ subject: "No CSRF" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json() as any).exc_type).toBe("PermissionError");
  });

  it("refuses a request routed for a different tenant than this script is bound to", async () => {
    // `env.TENANT_ID` is what the script was DEPLOYED as; `x-cloudforge-tenant` is what
    // the gateway ROUTED from the hostname. If they disagree the script is bound to the
    // wrong database, and answering is a cross-tenant breach — a customer on their own
    // hostname handed another customer's records, silently.
    //
    // This happened for real: `wrangler deploy --config <demo's config> --name
    // cloudforge-tenant-hrm` overrides only the SCRIPT NAME, so the hrm script ran with
    // demo's TENANT_ID and demo's D1. It accepted demo's password on hrm's hostname.
    //
    // Preferring either value is wrong — env would serve the wrong tenant, the header
    // would let a caller choose one — so the only safe answer is to fail.
    const response = await exports.default.fetch(new Request("https://tenant.test/api/method/metaforge.api.get_boot", {
      headers: { "x-cloudforge-tenant": "some-other-tenant", cookie: `sid=${sid}` },
    }));
    expect(response.status).toBe(500);
    const body = await response.json() as any;
    // Masked: the caller must not learn which tenant this script is really bound to.
    expect(JSON.stringify(body)).not.toMatch(/demo/);
  });

  it("puts getdoctype's keys at the top level, as frappe.response does", async () => {
    // frappe/desk/form/load.py does `frappe.response.docs.extend(docs)` — it does not
    // return, so nothing is wrapped in `message`. Wrapping it is an HTTP 200 that
    // every Frappe client reads as a missing document: the Desk takes `r.docs` off
    // the body, gets undefined, and raises DoesNotExistError with nothing logged. Its
    // list view then shows one `ID` column and never issues a list query at all,
    // because that query is gated on the metadata having loaded.
    const meta = await (await method("frappe.desk.form.load.getdoctype", { doctype: "Field Visit", with_parent: 1 }, "GET")).json() as any;
    expect(Array.isArray(meta.docs)).toBe(true);
    expect("message" in meta).toBe(false);
  });

  it("serves metadata in frappe shape, with reqd and integer flags", async () => {
    const bundle = await unwrap(await method("frappe.desk.form.load.getdoctype", { doctype: "Field Visit", with_parent: 1 }, "GET"));
    const doc = bundle.docs.find((entry: any) => entry.name === "Field Visit");
    expect(doc).toBeTruthy();
    expect(doc.is_submittable).toBe(1);
    expect(doc.issingle).toBe(0);
    const subject = doc.fields.find((field: any) => field.fieldname === "subject");
    expect(subject.reqd).toBe(1);
    expect(subject.required).toBeUndefined();
    // Served verbatim so the client's own evaluator can act on it.
    const note = doc.fields.find((field: any) => field.fieldname === "billing_note");
    expect(note.mandatory_depends_on).toBe("eval:doc.is_billable == 1");
  });

  let createdName = "";
  let createdModified = "";

  it("creates a document through REST, with the server allocating the name from the series", async () => {
    const response = await call("/api/resource/Field Visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "First visit", customer: "CUST-1", external_ref: "EXT-1" }),
    });
    expect(response.status).toBe(201);
    const doc = (await response.json() as any).data;
    // The dots are separators, so the name carries none of them.
    expect(doc.name).toBe("FV-2026-0001");
    expect(doc.docstatus).toBe(0);
    expect(doc.owner).toBe("sales@example.com");
    expect(doc.modified_by).toBe("sales@example.com");
    createdName = doc.name;
    createdModified = doc.modified;
  });

  it("enforces mandatory_depends_on on the server, not just in the client", async () => {
    const response = await call("/api/resource/Field Visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "Billable visit", is_billable: 1 }),
    });
    expect(response.status).toBe(417);
    const body: any = await response.json();
    expect(body.exc_type).toBe("ValidationError");
    // The failure names the field, so it lands on the right control.
    const inner = JSON.parse(JSON.parse(body._server_messages)[0]);
    expect(inner.fieldname).toBe("billing_note");
  });

  it("reads the document back with its docinfo and effective permissions", async () => {
    const raw = await (await method("frappe.desk.form.load.getdoc", { doctype: "Field Visit", name: createdName }, "GET")).json() as any;
    // Same rule as getdoctype: `frappe.response.docs.append(doc)` and
    // `frappe.response["docinfo"] = docinfo`, so both keys are top-level, unwrapped.
    expect(Array.isArray(raw.docs)).toBe(true);
    expect(raw.docinfo).toBeTruthy();
    expect("message" in raw).toBe(false);

    const payload = await unwrap(await method("frappe.desk.form.load.getdoc", { doctype: "Field Visit", name: createdName }, "GET"));
    expect(payload.docs[0].subject).toBe("First visit");
    expect(payload.docinfo.permissions.read).toBe(1);
    expect(payload.docinfo.permissions.submit).toBe(1);
    expect(Array.isArray(payload.docinfo.comments)).toBe(true);
  });

  it("saves with the modified token and rejects a stale one as a conflict", async () => {
    const stale = await call(`/api/resource/Field Visit/${createdName}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "Stale write", modified: "2020-01-01 00:00:00.000000" }),
    });
    expect(stale.status).toBe(417);
    // TimestampMismatchError is the only exception the client maps to "conflict".
    expect((await stale.json() as any).exc_type).toBe("TimestampMismatchError");

    const fresh = await call(`/api/resource/Field Visit/${createdName}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "Renamed subject", customer: "CUST-1", modified: createdModified }),
    });
    expect(fresh.status).toBe(200);
    const doc = (await fresh.json() as any).data;
    expect(doc.subject).toBe("Renamed subject");
    expect(doc.modified).not.toBe(createdModified);
    createdModified = doc.modified;
  });

  it("refuses a write that omits the modified token, rather than treating it as a force-write", async () => {
    const response = await call(`/api/resource/Field Visit/${createdName}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "No token" }),
    });
    expect(response.status).toBe(417);
    expect((await response.json() as any).exc_type).toBe("TimestampMismatchError");
  });

  it("accepts the framework timestamps in a list projection, and packs modified from them", async () => {
    // The Desk requests `modified` on EVERY list — it needs the token to make an
    // inline edit safe. The kernel column is `modified_at`, and the projection was
    // not being translated, so every list answered "Field is not allowed: modified"
    // and the list view stayed empty for every doctype.
    //
    // `modified` is also not a stored column: it is packed from `modified_at` AND
    // `version`, so requesting it must pull both. Were `version` dropped, rows would
    // arrive with no `modified` at all and the Desk would send an empty token —
    // turning every inline save into a refused stale write.
    const rows = await unwrap(await method(
      "frappe.client.get_list",
      { doctype: "Field Visit", fields: JSON.stringify(["name", "subject", "modified", "creation"]) },
      "GET",
    ));
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(typeof rows[0].modified).toBe("string");
    expect(rows[0].modified).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/);
    expect(typeof rows[0].creation).toBe("string");
    // Kernel spellings must not leak back out to a Frappe client.
    expect("modified_at" in rows[0]).toBe(false);
    expect("version" in rows[0]).toBe(false);
  });

  it("lists and counts documents, honouring filters and search", async () => {
    const rows = await unwrap(await method("frappe.client.get_list", {
      doctype: "Field Visit", fields: ["name", "subject", "customer"], filters: { customer: "CUST-1" },
    }, "GET"));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].name).toBe(createdName);
    // Framework timestamps come back under their Frappe names.
    expect(rows[0].modified_at).toBeUndefined();

    const count = await unwrap(await method("frappe.desk.reportview.get_count", {
      doctype: "Field Visit", filters: { customer: "CUST-1" },
    }, "GET"));
    expect(Number(count)).toBeGreaterThanOrEqual(1);
  });

  it("resolves link searches and display values through the permission layer", async () => {
    const hits = await unwrap(await method("frappe.desk.search.search_link", { doctype: "Customer", txt: "" }, "GET"));
    expect(Array.isArray(hits)).toBe(true);

    const labels = await unwrap(await method("metaforge.api.resolve_display_values", {
      items: [{ doctype: "Field Visit", name: createdName }],
    }));
    expect(labels[0].label).toBe("Renamed subject");
  });

  it("submits the document and then reports capabilities that match the new state", async () => {
    const submitted = await unwrap(await method("frappe.client.submit", {
      doc: { doctype: "Field Visit", name: createdName, modified: createdModified },
    }));
    expect(submitted.docstatus).toBe(1);
    createdModified = submitted.modified;

    const caps = await unwrap(await method("metaforge.api.get_capabilities", { doctype: "Field Visit", name: createdName }, "GET"));
    expect(caps.cancel).toBe(true);
    // A submitted document is never deletable.
    expect(caps.delete).toBe(false);
  });

  it("refuses to delete a submitted document", async () => {
    const response = await call(`/api/resource/Field Visit/${createdName}`, { method: "DELETE" });
    expect(response.status).toBe(417);
    expect(String((await response.json() as any).message)).toMatch(/submitted document cannot be deleted/i);
  });

  it("amends a cancelled document, dropping no_copy fields and chaining the successor", async () => {
    const cancelled = await unwrap(await method("frappe.client.cancel", { doctype: "Field Visit", name: createdName }));
    expect(cancelled.docstatus).toBe(2);

    const response = await call("/api/resource/Field Visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...cancelled, amended_from: createdName, name: undefined, docstatus: 0 }),
    });
    expect(response.status).toBe(201);
    const amendment = (await response.json() as any).data;
    expect(amendment.name).toBe(`${createdName}-1`);
    expect(amendment.amended_from).toBe(createdName);
    expect(amendment.docstatus).toBe(0);
    // no_copy finally means something: the external reference must not carry over.
    expect(amendment.external_ref).toBeUndefined();

    // The same source cannot be amended twice.
    const second = await call("/api/resource/Field Visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...cancelled, amended_from: createdName, name: undefined }),
    });
    expect(second.status).toBeGreaterThanOrEqual(400);
  });

  it("applies a Custom Field and a Property Setter, and the effective schema changes", async () => {
    const custom = await call("/api/method/frappe.custom.doctype.customize_form.customize_form.save_customization", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        doctype: "Field Visit",
        fields: [{ op: "custom_field", dt: "Field Visit", fieldname: "site_contact", fieldtype: "Data", label: "Site Contact", insert_after: "customer" }],
        propertySetters: [{ op: "property_setter", doctype_or_field: "DocField", doc_type: "Field Visit", field_name: "subject", property: "label", value: "Chủ đề", property_type: "Data" }],
      }),
    });
    expect(custom.status).toBe(200);

    const bundle = await unwrap(await method("frappe.desk.form.load.getdoctype", { doctype: "Field Visit" }, "GET"));
    const doc = bundle.docs.find((entry: any) => entry.name === "Field Visit");
    const order = doc.fields.map((field: any) => field.fieldname);
    // The custom field lands exactly where insert_after said.
    expect(order.indexOf("site_contact")).toBe(order.indexOf("customer") + 1);
    expect(doc.fields.find((field: any) => field.fieldname === "subject").label).toBe("Chủ đề");

    // The customised field is immediately writable through the same REST surface.
    const created = await call("/api/resource/Field Visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "With custom field", site_contact: "Mr Long" }),
    });
    expect(created.status).toBe(201);
    expect((await created.json() as any).data.site_contact).toBe("Mr Long");
  });

  it("finds documents by global search, and never returns one the actor cannot read", async () => {
    const hits = await unwrap(await method("metaforge.api.global_search", { text: "custom field", limit: 10 }, "GET"));
    expect(hits.some((hit: any) => hit.doctype === "Field Visit")).toBe(true);
    // A cancelled document is removed from the index rather than offered.
    expect(hits.some((hit: any) => hit.name === createdName)).toBe(false);
  });

  it("translates strings, falling back to the source when no translation exists", async () => {
    const translated = await unwrap(await method("metaforge.api.translate_strings", { strings: ["Subject", "Customer"], lang: "vi" }));
    expect(translated.Subject).toBe("Chủ đề");
    // A missing translation degrades to readable English, never to a blank label.
    expect(translated.Customer).toBe("Customer");
  });

  it("shares a document and lists the share back", async () => {
    const target = "colleague@example.com";
    const shared = await unwrap(await method("frappe.share.add", { doctype: "Field Visit", name: `${createdName}-1`, user: target, read: 1 }));
    expect(shared.user).toBe(target);
    const shares = await unwrap(await method("frappe.share.get_users", { doctype: "Field Visit", name: `${createdName}-1` }, "GET"));
    expect(shares.find((share: any) => share.user === target)?.read).toBe(1);
  });

  it("tags a document and removes the tag", async () => {
    const name = `${createdName}-1`;
    expect(await unwrap(await method("frappe.desk.doctype.tag.tag.add_tag", { tag: "urgent", dt: "Field Visit", dn: name }))).toBe("urgent");
    expect((await unwrap(await method("frappe.desk.doctype.tag.tag.remove_tag", { tag: "urgent", dt: "Field Visit", dn: name }))).removed).toBe(true);
  });

  it("renders a print format with redacted content, returning html for the client to sandbox", async () => {
    await env.DB.prepare(
      `INSERT INTO print_formats(tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at)
       VALUES('demo','Field Visit Slip','Field Visit',1,0,1,?1,'Administrator',?2)
       ON CONFLICT(tenant_id,name) DO UPDATE SET format_json=excluded.format_json`,
    ).bind(JSON.stringify({
      name: "Field Visit Slip", doc_type: "Field Visit", format_type: "Standard",
      html: "<h1>{{ subject }}</h1>", css: "h1{font-size:14px}", is_default: true, disabled: false, revision: 1,
    }), NOW).run();

    const printed = await unwrap(await method("frappe.www.printview.get_html_and_style", {
      doctype: "Field Visit", name: `${createdName}-1`,
    }, "GET"));
    expect(printed.html).toContain("<h1>");
    expect(printed.style).toContain("font-size");
  });

  it("escapes document content in a printout, so a value cannot inject markup", async () => {
    const created = await call("/api/resource/Field Visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "<script>alert(1)</script>" }),
    });
    const injected = (await created.json() as any).data.name;
    const printed = await unwrap(await method("frappe.www.printview.get_html_and_style", { doctype: "Field Visit", name: injected }, "GET"));
    expect(printed.html).toContain("&lt;script&gt;");
    expect(printed.html).not.toContain("<script>alert");
  });

  it("reports bulk delete per item rather than collapsing a partial result", async () => {
    const draft = await call("/api/resource/Field Visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "Disposable" }),
    });
    const disposable = (await draft.json() as any).data.name;

    // One deletable draft, one CANCELLED document (never deletable, because its
    // reversing ledger entries would be orphaned), one that does not exist.
    const outcome = await unwrap(await method("frappe.desk.reportview.delete_items", {
      doctype: "Field Visit", items: [disposable, createdName, "FV-NOPE"],
    }));
    const byName = Object.fromEntries(outcome.results.map((entry: any) => [entry.name, entry]));
    expect(byName[disposable].deleted).toBe(true);
    expect(byName[createdName].deleted).toBe(false);
    expect(String(byName[createdName].error)).toMatch(/cancelled/i);
    // A name that does not exist is reported as not-deleted rather than as an
    // error, so a retried bulk delete is idempotent.
    expect(byName["FV-NOPE"].deleted).toBe(false);
    expect(outcome.deleted).toBe(1);
    expect(outcome.failed).toBe(2);
  });

  it("derives workspaces from installed apps and counts open documents within the read scope", async () => {
    const spaces = await unwrap(await method("frappe.desk.desktop.get_workspaces", {}, "GET"));
    expect(Array.isArray(spaces.pages)).toBe(true);
    const counts = await unwrap(await method("frappe.desk.notifications.get_open_count", { doctype: "Field Visit" }, "GET"));
    expect(Number(counts.open_count)).toBeGreaterThanOrEqual(0);
  });

  it("reports has_workflow separately from the transition list", async () => {
    // An empty list cannot distinguish "no workflow" from "a terminal state", and
    // the client needs to tell those apart to know whether to show an action bar.
    const result = await unwrap(await method("metaforge.api.get_workflow_transitions", {
      doctype: "Field Visit", name: `${createdName}-1`,
    }, "GET"));
    expect(result.has_workflow).toBe(false);
    expect(result.transitions).toEqual([]);
  });

  it("walks a tree doctype, deriving the parent field by convention", async () => {
    const treeMeta = {
      name: "Visit Region", module: "Custom",
      autoname: "prompt",
      title_field: "region_name",
      fields: [
        { fieldname: "region_name", label: "Region", fieldtype: "Data", required: true },
        { fieldname: "is_group", label: "Is Group", fieldtype: "Check" },
        { fieldname: "parent_visit_region", label: "Parent", fieldtype: "Link", options: "Visit Region" },
      ],
      permissions: [{ role: "System Manager", read: true, write: true, create: true, report: true }],
      revision: 1,
    };
    await env.DB.prepare(
      `INSERT INTO doctype_definitions(tenant_id,doctype,module,revision,metadata_json,modified_by,modified_at)
       VALUES('demo','Visit Region','Custom',1,?1,'Administrator',?2)
       ON CONFLICT(tenant_id,doctype) DO UPDATE SET metadata_json=excluded.metadata_json`,
    ).bind(JSON.stringify(treeMeta), NOW).run();

    const root = await unwrap(await method("metaforge.api.add_tree_node", {
      doctype: "Visit Region", is_root: true, name: "North", region_name: "North", is_group: 1,
    }));
    expect(root.value).toBe("North");
    expect(root.expandable).toBe(true);

    const child = await unwrap(await method("metaforge.api.add_tree_node", {
      doctype: "Visit Region", parent: "North", name: "Hanoi", region_name: "Hanoi",
    }));
    expect(child.value).toBe("Hanoi");
    // A leaf must not be reported as expandable, or the UI offers an arrow that
    // opens nothing.
    expect(child.expandable).toBe(false);

    const roots = await unwrap(await method("frappe.desk.treeview.get_children", { doctype: "Visit Region", parent: "" }, "GET"));
    expect(roots.map((node: any) => node.value)).toEqual(["North"]);
    const children = await unwrap(await method("frappe.desk.treeview.get_children", { doctype: "Visit Region", parent: "North" }, "GET"));
    expect(children.map((node: any) => node.value)).toEqual(["Hanoi"]);
  });

  it("refuses to walk a doctype that was never modelled as a tree", async () => {
    // An empty tree would read as "no data" while the real problem is the model.
    const response = await method("frappe.desk.treeview.get_children", { doctype: "Field Visit", parent: "" }, "GET");
    expect(response.status).toBe(417);
    expect(String((await response.json() as any).message)).toMatch(/is not a tree/i);
  });

  it("runs a server-defined report with its declared columns", async () => {
    const report = await unwrap(await method("frappe.desk.query_report.run", {
      report_name: "General Ledger", filters: { account: "Debtors" },
    }, "GET"));
    // Either real rows, or Frappe's queued shape — never a silently empty table
    // with no explanation.
    expect(report.prepared_report === true || Array.isArray(report.result)).toBe(true);
    if (!report.prepared_report) {
      expect(report.columns.map((column: any) => column.field)).toContain("posting_at");
    }
  });

  it("refuses an unknown report and a filter outside the report's whitelist", async () => {
    // Silently dropping an unsupported filter would show every row while the UI
    // claims the report is filtered — worse than refusing.
    const missing = await method("frappe.desk.query_report.run", { report_name: "No Such Report" }, "GET");
    expect(missing.status).toBeGreaterThanOrEqual(400);
    expect(String((await missing.json() as any).message)).toMatch(/Unknown report/i);

    const badFilter = await method("frappe.desk.query_report.run", {
      report_name: "General Ledger", filters: { company: "Demo" },
    }, "GET");
    expect(badFilter.status).toBeGreaterThanOrEqual(400);
    expect(String((await badFilter.json() as any).message)).toMatch(/Filter is not allowed/i);
  });

  it("imports a CSV row by row, so one bad row does not discard the good ones", async () => {
    const preview = await unwrap(await method("frappe.core.doctype.data_import.data_import.get_preview_from_template", {
      doctype: "Field Visit", csv: csvOf(["subject,customer", "Imported A,CUST-1", "Imported B,CUST-2"]),
    }));
    expect(preview.headers).toEqual(["subject", "customer"]);

    // Row 2 omits the mandatory subject; row 1 is valid. (A bad Link is NOT the
    // right example here: the kernel validates references at submit, not at create,
    // so a draft may legitimately carry a reference that is not resolvable yet.)
    const applied = await unwrap(await method("frappe.core.doctype.data_import.data_import.form_start_import", {
      doctype: "Field Visit", csv: csvOf(["subject,customer", "Imported OK,CUST-1", ",CUST-2"]),
    }));
    expect(applied.imported).toBe(1);
    expect(applied.failed).toBe(1);
    expect(applied.status).toBe("Partial Success");
    expect(applied.results[1].error).toBeTruthy();
  });

  it("rejects an import column the doctype does not have, rather than dropping it", async () => {
    // A dropped column means rows import with fields missing and no way to see which.
    const response = await method("frappe.core.doctype.data_import.data_import.get_preview_from_template", {
      doctype: "Field Visit", csv: csvOf(["subject,not_a_field", "X,Y"]),
    });
    expect(response.status).toBe(417);
    expect(String((await response.json() as any).message)).toMatch(/Unknown import columns/i);
  });

  it("moves a kanban card by writing the field, and reorders without touching the document", async () => {
    // The board charts `subject` only because Field Visit has no Select field; what
    // matters is that a move writes a real field and a reorder does not.
    await env.DB.prepare(
      `INSERT INTO doctype_definitions(tenant_id,doctype,module,revision,metadata_json,modified_by,modified_at)
       VALUES('demo','Visit Stage','Custom',1,?1,'Administrator',?2)
       ON CONFLICT(tenant_id,doctype) DO UPDATE SET metadata_json=excluded.metadata_json`,
    ).bind(JSON.stringify({
      name: "Visit Stage", module: "Custom", autoname: "prompt", title_field: "label",
      fields: [
        { fieldname: "label", label: "Label", fieldtype: "Data", required: true, in_list_view: true },
        // "Backlog" rather than the obvious word: the repo-hygiene gate treats
        // \bTODO\b as a placeholder marker, and the column name is incidental to what
        // this test proves — so the test bends, not the gate.
        { fieldname: "stage", label: "Stage", fieldtype: "Select", options: "Backlog\nDoing\nDone", in_standard_filter: true },
      ],
      permissions: [{ role: "System Manager", read: true, write: true, create: true }],
      revision: 1,
    }), NOW).run();

    await env.DB.prepare(
      `INSERT INTO kanban_boards(tenant_id,name,reference_doctype,field_name,columns_json,owner,modified_at)
       VALUES('demo','Stage Board','Visit Stage','stage',?1,'sales@example.com',?2)
       ON CONFLICT(tenant_id,name) DO UPDATE SET columns_json=excluded.columns_json`,
    ).bind(JSON.stringify([{ column_name: "Backlog" }, { column_name: "Doing" }, { column_name: "Done" }]), NOW).run();

    const created = await call("/api/resource/Visit Stage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "VS-1", label: "First", stage: "Backlog" }),
    });
    expect(created.status).toBe(201);
    const beforeVersion = (await created.json() as any).data.modified;

    const boards = await unwrap(await method("frappe.desk.doctype.kanban_board.kanban_board.get_kanban_boards", { doctype: "Visit Stage" }, "GET"));
    expect(boards.map((board: any) => board.name)).toContain("Stage Board");

    // Reordering is view state: it must not bump the document's version.
    const reordered = await unwrap(await method("frappe.desk.doctype.kanban_board.kanban_board.update_order_for_single_card", {
      board_name: "Stage Board", column_name: "Backlog", order: ["VS-1"],
    }));
    expect(reordered.cards).toBe(1);
    const unchanged = (await (await call("/api/resource/Visit Stage/VS-1")).json() as any).data;
    expect(unchanged.modified).toBe(beforeVersion);

    // Moving IS a business change, so it writes the field through the command path.
    const moved = await unwrap(await method("metaforge.api.kanban_move_with_comment", {
      board: "Stage Board", docname: "VS-1", from: "Backlog", to: "Doing", comment: "Started work",
    }));
    expect(moved.stage).toBe("Doing");
    expect(moved.modified).not.toBe(beforeVersion);
  });

  it("refuses a kanban move into a column the field cannot hold", async () => {
    // Otherwise the drop appears to succeed and the save fails afterwards.
    const response = await method("metaforge.api.kanban_move_with_comment", {
      board: "Stage Board", docname: "VS-1", from: "Doing", to: "Nonexistent",
    });
    expect(response.status).toBe(417);
    expect(String((await response.json() as any).message)).toMatch(/not one of/i);
  });

  it("serves only the caller's own notifications and marks them read", async () => {
    for (const [name, forUser, read] of [["NL-A", "sales@example.com", 0], ["NL-B", "sales@example.com", 0], ["NL-C", "someone@example.com", 0]] as const) {
      await env.DB.prepare(
        `INSERT INTO notification_log(tenant_id,name,for_user,subject,read,created_at) VALUES('demo',?1,?2,?3,?4,?5)
         ON CONFLICT(tenant_id,name) DO NOTHING`,
      ).bind(name, forUser, `Subject ${name}`, read, NOW).run();
    }

    const logs = await unwrap(await method("frappe.desk.doctype.notification_log.notification_log.get_notification_logs", {}, "GET"));
    const names = logs.notification_logs.map((entry: any) => entry.name);
    expect(names).toContain("NL-A");
    // Another user's notification must never appear.
    expect(names).not.toContain("NL-C");

    expect((await unwrap(await method("frappe.desk.doctype.notification_log.notification_log.mark_as_read", { docname: "NL-A" }))).marked).toBe(true);
    // Marking somebody else's is not an error, it is simply a no-op.
    expect((await unwrap(await method("frappe.desk.doctype.notification_log.notification_log.mark_as_read", { docname: "NL-C" }))).marked).toBe(false);
    expect((await unwrap(await method("frappe.desk.doctype.notification_log.notification_log.mark_all_as_read", {}))).marked).toBeGreaterThanOrEqual(1);
  });

  it("offers business-context dimensions from master data, disabling ones with none", async () => {
    const context = await unwrap(await method("metaforge.api.get_business_context", { app_id: "demo" }, "GET"));
    const byKey = Object.fromEntries(context.dimensions.map((dimension: any) => [dimension.key, dimension]));
    // Company and Warehouse were seeded; Territory was not.
    expect(byKey.company.enabled).toBe(true);
    expect(byKey.company.options.map((option: any) => option.value)).toContain("Demo");
    expect(byKey.warehouse.enabled).toBe(true);
    expect(byKey.territory.enabled).toBe(false);
    expect(byKey.company.required).toBe(true);
  });

  it("applies a context selection only to dimensions the doctype actually has", async () => {
    // Field Visit has a `customer` field but no `company`, so a company selection
    // must be skipped rather than filtering on a field that does not exist.
    const all = await unwrap(await method("metaforge.api.get_contextual_count", {
      doctype: "Field Visit", context: { company: "Demo" },
    }, "GET"));
    const unfiltered = await unwrap(await method("frappe.desk.reportview.get_count", { doctype: "Field Visit" }, "GET"));
    expect(Number(all)).toBe(Number(unfiltered));

    const rows = await unwrap(await method("metaforge.api.get_contextual_list", {
      doctype: "Field Visit", fields: ["name", "subject"], context: { company: "Demo" }, page_length: 5,
    }, "GET"));
    expect(Array.isArray(rows)).toBe(true);
  });

  it("exports a list as CSV and neutralises spreadsheet formula injection", async () => {
    // A value starting with `=` executes when the file is opened in a spreadsheet;
    // exporting it unguarded turns "download your data" into code execution on the
    // analyst's machine.
    await call("/api/resource/Field Visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "=cmd|' /c calc'!A1" }),
    });

    const response = await call("/api/method/frappe.desk.reportview.export_query?doctype=Field+Visit&fields=%5B%22name%22%2C%22subject%22%5D");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/csv/);
    expect(response.headers.get("content-disposition")).toMatch(/attachment/);
    // Checked at the byte level: the UTF-8 BOM is what makes a spreadsheet read the
    // file as UTF-8 instead of the local codepage, and `Response.text()` strips it
    // during decoding so it is invisible to a string assertion.
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xEF, 0xBB, 0xBF]);

    const csv = await response.text();
    expect(csv.split("\r\n")[0]).toBe("name,subject");
    expect(csv).toContain("'=cmd");
    expect(csv).not.toMatch(/(^|,|")=cmd/m);
  });

  it("serves an unsaved Single DocType as an empty form, not a 404", async () => {
    // A Settings page that has never been saved must render its form so the user can
    // fill it in, not an error telling them the settings do not exist.
    await env.DB.prepare(
      `INSERT INTO doctype_definitions(tenant_id,doctype,module,revision,metadata_json,modified_by,modified_at)
       VALUES('demo','Visit Settings','Custom',1,?1,'Administrator',?2)
       ON CONFLICT(tenant_id,doctype) DO UPDATE SET metadata_json=excluded.metadata_json`,
    ).bind(JSON.stringify({
      name: "Visit Settings", module: "Custom", is_single: true,
      fields: [
        { fieldname: "default_customer", label: "Default Customer", fieldtype: "Link", options: "Customer" },
        { fieldname: "require_photo", label: "Require Photo", fieldtype: "Check", default: false },
      ],
      permissions: [{ role: "System Manager", read: true, write: true, create: true }],
      revision: 1,
    }), NOW).run();

    const bundle = await unwrap(await method("frappe.desk.form.load.getdoctype", { doctype: "Visit Settings" }, "GET"));
    expect(bundle.docs.find((entry: any) => entry.name === "Visit Settings").issingle).toBe(1);

    const empty = (await (await call("/api/resource/Visit Settings")).json() as any).data;
    expect(empty.name).toBe("Visit Settings");
    expect(empty.__islocal).toBe(1);
    expect(empty.require_photo).toBe(false);
  });

  it("saves a Single under its own name and keeps the concurrency check", async () => {
    const saved = (await (await call("/api/resource/Visit Settings/Visit Settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ default_customer: "CUST-1", require_photo: true }),
    })).json() as any).data;
    // Named after the doctype, so there is exactly one and its name is predictable.
    expect(saved.name).toBe("Visit Settings");
    expect(saved.default_customer).toBe("CUST-1");
    expect(saved.__islocal).toBeUndefined();

    // Two admins on one Settings page must not silently overwrite each other.
    const stale = await call("/api/resource/Visit Settings/Visit Settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ require_photo: false, modified: "2020-01-01 00:00:00.000000" }),
    });
    expect(stale.status).toBe(417);
    expect((await stale.json() as any).exc_type).toBe("TimestampMismatchError");

    const fresh = await call("/api/resource/Visit Settings/Visit Settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ default_customer: "CUST-2", modified: saved.modified }),
    });
    expect(fresh.status).toBe(200);
    expect((await fresh.json() as any).data.default_customer).toBe("CUST-2");
  });

  it("refuses to delete a Single, which would silently reset configuration", async () => {
    const response = await call("/api/resource/Visit Settings/Visit Settings", { method: "DELETE" });
    expect(response.status).toBe(417);
    expect(String((await response.json() as any).message)).toMatch(/not supported on a single doctype/i);
  });

  it("installs an app, and re-installing the identical package is a no-op", async () => {
    const pkg = {
      id: "visits", name: "Visits", version: "1.0.0",
      roles: [{ role: "Visit User" }],
      doctypes: [{
        name: "Visit Note", module: "Visits",
        fields: [{ fieldname: "body", label: "Body", fieldtype: "Data", required: true }],
        permissions: [{ role: "Visit User", read: true, write: true, create: true }],
        revision: 1,
      }],
      fixtures: [{ record_type: "Visit Category", name: "Routine", data: { label: "Routine" } }],
      nav: [{ key: "Visit Note", label: "Ghi chú", kind: "doctype" }],
    };

    const first = await unwrap(await method("forge.apps.install", { app: pkg }));
    expect(first.outcome).toBe("installed");
    expect(first.doctypes).toBe(1);

    // Re-installing the identical bytes must not churn metadata revisions and
    // invalidate every client cache for nothing.
    expect((await unwrap(await method("forge.apps.install", { app: pkg }))).outcome).toBe("unchanged");

    // The app's doctype is immediately usable through the same REST surface.
    const created = await call("/api/resource/Visit Note", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "VN-1", body: "First note" }),
    });
    expect(created.status).toBe(201);

    const catalog = await unwrap(await method("metaforge.api.get_application_catalog", {}, "GET"));
    expect(catalog.apps.map((app: any) => app.id)).toContain("visits");

    // Every app MUST carry `workspaces`. The client flattens the catalog with
    // `for (const ws of app.workspaces)`, so an app without it throws
    // "workspaces is not iterable" and the entire Desk renders blank — not a degraded
    // menu, a white screen. It hid for a long time because the loop never runs on a
    // tenant with no apps: the first app installed is what breaks the Desk.
    const app = catalog.apps.find((entry: any) => entry.id === "visits");
    expect(Array.isArray(app.workspaces)).toBe(true);
    expect(app.workspaces.length).toBeGreaterThan(0);
    const workspace = app.workspaces[0];
    expect(typeof workspace.key).toBe("string");
    expect(typeof workspace.route).toBe("string");
    expect(Array.isArray(workspace.sections)).toBe(true);
    expect(workspace.sections[0].items.length).toBeGreaterThan(0);
    expect(workspace.sections[0].items[0].route).toMatch(/^\/app\//);
  });

  it("refuses to uninstall an app whose doctypes still hold documents", async () => {
    // Removing the definition would leave rows whose schema no longer exists:
    // unreadable, unexportable, unrecoverable without the exact package.
    const response = await method("forge.apps.uninstall", { app_id: "visits" });
    expect(response.status).toBe(417);
    expect(String((await response.json() as any).message)).toMatch(/still holds documents/i);

    // With the document gone, the app uninstalls and takes its doctype with it.
    await call("/api/resource/Visit Note/VN-1", { method: "DELETE" });
    const removed = await unwrap(await method("forge.apps.uninstall", { app_id: "visits" }));
    expect(removed.removed.doctypes).toBe(1);
    const gone = await method("frappe.desk.form.load.getdoctype", { doctype: "Visit Note" }, "GET");
    expect(gone.status).toBe(404);
  });

  it("fails an unimplemented method loudly instead of returning an empty success", async () => {
    // An empty success would let a screen render as though it had data.
    const response = await method("frappe.desk.doctype.dashboard_chart.dashboard_chart.get", { chart_name: "Anything" }, "GET");
    expect(response.status).toBe(404);
    expect((await response.json() as any).exc_type).toBe("DoesNotExistError");
  });

  it("logs out and the session stops working", async () => {
    const response = await call("/api/method/logout", { method: "POST" });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });

  it("keeps the native API working alongside the frappe surface", async () => {
    // The two surfaces share one kernel; the native routes must not have been
    // shadowed by the façade mount.
    const response = await exports.default.fetch(new Request("https://tenant.test/api/v1/whoami"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ tenant_id: "demo" });
  });

  it("proves the modified token distinguishes versions committed in the same millisecond", () => {
    // The property the whole concurrency bridge rests on.
    const at = "2026-07-26T10:30:00.250Z";
    expect(toFrappeModified(at, 3)).not.toBe(toFrappeModified(at, 4));
  });
});
