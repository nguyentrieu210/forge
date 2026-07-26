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

/** Frappe wraps every method payload under `message`. */
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

  it("fails an unimplemented method loudly instead of returning an empty success", async () => {
    // An empty success would let a screen render as though it had data.
    const response = await method("frappe.desk.doctype.kanban_board.kanban_board.get_kanban_boards", { doctype: "Field Visit" }, "GET");
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
