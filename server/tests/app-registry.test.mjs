import test from "node:test";
import assert from "node:assert/strict";
import { combinedNavigation, compareVersions, navItemPath, parseAppManifest, satisfiesVersion } from "../dist/packages/app-registry/src/index.js";

function doctype(name, overrides = {}) {
  return {
    name,
    module: "Kho",
    fields: [{ fieldname: "title", label: "Title", fieldtype: "Data", required: true }],
    permissions: [{ role: "Kho User", read: true, write: true, create: true }],
    revision: 1,
    ...overrides,
  };
}

function manifest(overrides = {}) {
  return parseAppManifest({
    id: "kho",
    name: "Quản lý kho",
    version: "1.0.0",
    roles: [{ role: "Kho User" }],
    doctypes: [doctype("Stock Request")],
    nav: [{ key: "Stock Request", label: "Phiếu kho", kind: "doctype" }],
    ...overrides,
  });
}

// ---- manifest shape ---------------------------------------------------------

test("a minimal app package parses into a normalised manifest", () => {
  const parsed = manifest();
  assert.equal(parsed.id, "kho");
  assert.equal(parsed.version, "1.0.0");
  assert.equal(parsed.doctypes.length, 1);
  assert.deepEqual(parsed.roles, [{ role: "Kho User", desk_access: true }]);
  // Absent collections normalise to empty, so consumers never branch on undefined.
  assert.deepEqual(parsed.workflows, []);
  assert.deepEqual(parsed.fixtures, []);
  assert.deepEqual(parsed.requires, []);
});

test("a role may be given as a bare string", () => {
  assert.deepEqual(manifest({ roles: ["Kho User"] }).roles, [{ role: "Kho User", desk_access: true }]);
});

test("ids and versions are constrained", () => {
  assert.throws(() => manifest({ id: "Kho" }), /lowercase letters/);
  assert.throws(() => manifest({ id: "kho_vn" }), /lowercase letters/);
  assert.throws(() => manifest({ version: "1.0" }), /semantic/);
  assert.throws(() => manifest({ version: "v1.0.0" }), /semantic/);
  assert.doesNotThrow(() => manifest({ version: "1.0.0-rc.1" }));
  assert.throws(() => manifest({ platform_requires: "1.2" }), /platform_requires must be semantic/);
  assert.equal(manifest({ platform_requires: "1.2.0" }).platform_requires, "1.2.0");
});

test("an app cannot depend on itself", () => {
  assert.throws(() => manifest({ requires: [{ id: "kho", version: "1.0.0" }] }), /cannot depend on itself/);
});

test("duplicate doctypes and nav keys are refused", () => {
  assert.throws(() => manifest({ doctypes: [doctype("Stock Request"), doctype("Stock Request")] }), /Duplicate doctype/);
  assert.throws(() => manifest({
    nav: [
      { key: "Stock Request", label: "A", kind: "doctype" },
      { key: "Stock Request", label: "B", kind: "doctype" },
    ],
  }), /Duplicate nav key/);
});

// ---- cross-reference integrity ---------------------------------------------

test("a DocPerm role must be defined by the app or be a platform role", () => {
  // Otherwise the permission row matches nobody and users appear to have been
  // granted access they do not have.
  assert.throws(() => manifest({
    roles: [],
    doctypes: [doctype("Stock Request", { permissions: [{ role: "Kho User", read: true }] })],
  }), /which the app does not define/);
  assert.doesNotThrow(() => manifest({
    roles: [],
    doctypes: [doctype("Stock Request", { permissions: [{ role: "System Manager", read: true, write: true }] })],
  }));
});

test("a workflow must target a doctype the app ships", () => {
  const workflow = {
    name: "Stock Approval",
    document_type: "Something Else",
    state_field: "workflow_state",
    is_active: true,
    states: [{ state: "Draft", docstatus: 0 }],
    transitions: [],
    revision: 1,
  };
  assert.throws(() => manifest({ workflows: [workflow] }), /this app does not define/);
  assert.doesNotThrow(() => manifest({ workflows: [{ ...workflow, document_type: "Stock Request" }] }));
});

test("a print format must target a doctype the app ships", () => {
  assert.throws(() => manifest({
    print_formats: [{ name: "Slip", doc_type: "Ghost", html: "<p>x</p>" }],
  }), /this app does not define/);
});

test("a doctype nav item must point at a doctype the app ships", () => {
  // A menu entry that leads nowhere is worse than a missing one.
  assert.throws(() => manifest({ nav: [{ key: "Ghost", label: "X", kind: "doctype" }] }), /this app does not define/);
});

test("a data-backed experience carries a validated permission target", () => {
  const parsed = manifest({
    nav: [{ key: "approval:Stock Request", label: "Duyệt kho", kind: "experience" }],
  });
  assert.equal(parsed.nav[0].permission_doctype, "Stock Request");
  assert.throws(() => manifest({
    nav: [{ key: "approval:Ghost", label: "Duyệt ma", kind: "experience" }],
  }), /permission_doctype points at Ghost/);
  assert.throws(() => manifest({
    nav: [{ key: "approval:Stock Request", label: "Soạn hàng", kind: "experience", permission_doctype: "Ghost" }],
  }), /permission_doctype points at Ghost/);
});

test("social commerce experience is operational and relies on its server-scoped API", () => {
  const value = manifest({
    nav: [{ key: "social-commerce:dashboard", label: "Social", kind: "experience" }],
  });
  assert.equal(value.nav[0].key, "social-commerce:dashboard");
  assert.equal(value.nav[0].permission_doctype, undefined);
});

test("a route nav item needs an absolute route", () => {
  assert.throws(() => manifest({ nav: [{ key: "reports", label: "R", kind: "route" }] }), /requires a route/);
  // A relative route resolves incorrectly in the client router.
  assert.throws(() => manifest({ nav: [{ key: "reports", label: "R", kind: "route", route: "reports" }] }), /must be absolute/);
  assert.doesNotThrow(() => manifest({ nav: [{ key: "reports", label: "R", kind: "route", route: "/reports" }] }));
});

test("an unrecognised nav kind is refused", () => {
  assert.throws(() => manifest({ nav: [{ key: "x", label: "X", kind: "page" }] }), /kind is not recognised/);
});

test("doctypes inside a package are validated by the platform's own rules", () => {
  assert.throws(() => manifest({
    doctypes: [doctype("Stock Request", { fields: [{ fieldname: "ref", label: "Ref", fieldtype: "Link" }] })],
  }), /requires options/);
  assert.throws(() => manifest({
    doctypes: [doctype("Stock Request", {
      fields: [
        { fieldname: "kind", label: "Kind", fieldtype: "Data" },
        { fieldname: "note", label: "Note", fieldtype: "Data", mandatory_depends_on: "eval:frappe.whatever()" },
      ],
    })],
  }), /cannot be enforced by the server/);
});

test("fixtures must carry a record type, name and object payload", () => {
  assert.doesNotThrow(() => manifest({ fixtures: [{ record_type: "Warehouse", name: "Stores", data: { is_group: 0 } }] }));
  assert.throws(() => manifest({ fixtures: [{ record_type: "Warehouse", name: "Stores", data: "nope" }] }), /must be an object/);
  assert.throws(() => manifest({ fixtures: [{ name: "Stores", data: {} }] }), /record_type is required/);
});

// ---- version comparison -----------------------------------------------------

test("versions compare component-wise, not as strings", () => {
  // String comparison ranks "1.10.0" below "1.9.0", which is exactly the mistake
  // that lets a too-old dependency satisfy a requirement.
  assert.equal(compareVersions("1.10.0", "1.9.0"), 1);
  assert.equal(compareVersions("1.9.0", "1.10.0"), -1);
  assert.equal(compareVersions("2.0.0", "1.99.99"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.0.0-rc.1", "1.0.0"), 0, "a prerelease suffix does not change ordering here");
});

test("a dependency is satisfied by an equal or newer version", () => {
  assert.equal(satisfiesVersion("1.2.0", "1.2.0"), true);
  assert.equal(satisfiesVersion("1.3.0", "1.2.0"), true);
  assert.equal(satisfiesVersion("1.1.0", "1.2.0"), false);
  assert.equal(satisfiesVersion("1.10.0", "1.9.0"), true);
});

// ---- combined navigation ----------------------------------------------------

test("navigation combines across apps and the first claim on a key wins", () => {
  // Two routes resolving to one path would leave the second permanently
  // unreachable in the client router.
  const nav = combinedNavigation([
    { app_id: "kho", app_name: "Kho", version: "1.0.0", content_hash: "", installed_at: "", worker: null, nav: [{ key: "Stock Request", label: "Phiếu kho", kind: "doctype" }] },
    { app_id: "ban", app_name: "Bán", version: "1.0.0", content_hash: "", installed_at: "", worker: null, nav: [
      { key: "Stock Request", label: "Trùng", kind: "doctype" },
      { key: "Sales Order", label: "Đơn bán", kind: "doctype" },
    ] },
  ]);
  assert.deepEqual(nav.map((item) => item.key), ["Stock Request", "Sales Order"]);
  assert.equal(nav[0].label, "Phiếu kho");
  assert.equal(nav[0].app_id, "kho");
  assert.equal(nav[1].app_id, "ban");
});

test("an app with no navigation contributes nothing rather than breaking the menu", () => {
  assert.deepEqual(combinedNavigation([
    { app_id: "core", app_name: "Core", version: "1.0.0", content_hash: "", installed_at: "", worker: null, nav: [] },
  ]), []);
});

// ---- the sample app on disk -------------------------------------------------

test("the sample app in apps-src packs and parses, so it cannot rot unnoticed", async () => {
  // Packing runs through the same parser the installer uses, so this also proves a
  // real on-disk app layout stays installable as the platform's rules evolve.
  const { readFile, readdir } = await import("node:fs/promises");
  const root = new URL("../apps-src/visits/", import.meta.url);

  const header = JSON.parse(await readFile(new URL("app.json", root), "utf8"));
  const roles = JSON.parse(await readFile(new URL("roles.json", root), "utf8"));

  const readDir = async (folder) => {
    const names = (await readdir(new URL(`${folder}/`, root))).filter((name) => name.endsWith(".json")).sort();
    return Promise.all(names.map(async (name) => JSON.parse(await readFile(new URL(`${folder}/${name}`, root), "utf8"))));
  };
  const doctypes = await readDir("doctypes");
  const fixtureFiles = await readDir("fixtures");

  const manifest = parseAppManifest({
    ...header,
    roles,
    doctypes,
    workflows: [],
    print_formats: [],
    fixtures: fixtureFiles.flat(),
  });

  assert.equal(manifest.id, "visits");
  assert.equal(manifest.doctypes.length, 1);
  assert.equal(manifest.fixtures.length, 2);
  // Every role a DocPerm names is defined by the app itself.
  const declared = new Set(manifest.roles.map((role) => role.role));
  for (const permission of manifest.doctypes[0].permissions) {
    assert.ok(declared.has(permission.role), `role ${permission.role} must be declared`);
  }
  // The nav entry points at a doctype the app actually ships.
  assert.equal(manifest.nav[0].key, manifest.doctypes[0].name);
});

// ---- client manifest (presentation carried in the package) --------------------
//
// The block that makes ONE client bundle serve every app. Each check below is a way a
// client that trusted this block would render something the user cannot use, so the
// package is refused at pack time instead.

test("a client block is parsed and carried on the manifest", () => {
  const parsed = manifest({
    nav: [
      { key: "Stock Request", label: "Phiếu kho", kind: "doctype" },
      { key: "approval:Stock Request", label: "Duyệt kho", kind: "experience" },
    ],
    client: {
      brand: "warm",
      domain: "stock",
      home: { route: "/x/approval%3AStock%20Request" },
      dimensions: ["company", "warehouse"],
      catalog_mode: "manifest",
      locale: { currency: "VND" },
    },
  });
  assert.equal(parsed.client.brand, "warm");
  assert.equal(parsed.client.domain, "stock");
  assert.deepEqual(parsed.client.home, { route: "/x/approval%3AStock%20Request" });
  assert.deepEqual(parsed.client.dimensions, ["company", "warehouse"]);
  assert.equal(parsed.client.catalog_mode, "manifest");
  assert.deepEqual(parsed.client.locale, { currency: "VND" });
});

test("a manifest without a client block stays valid and carries none", () => {
  assert.equal(manifest().client, undefined);
});

test("a dimension the server cannot resolve is refused", () => {
  // Not cosmetic: the shell blocks on "choose a scope" for a selector that can never
  // be populated, and the app is unopenable.
  assert.throws(() => manifest({ client: { dimensions: ["company", "department"] } }), /not a dimension the server can resolve/);
  assert.throws(() => manifest({ client: { dimensions: ["company", "company"] } }), /Duplicate client dimension/);
});

test("a home route no nav item reaches is refused", () => {
  // The client router would fall to its catch-all, which redirects home, which is the
  // same unreachable route.
  assert.throws(() => manifest({ client: { home: { route: "/x/picking" } } }), /not reachable from this app's nav/);
  assert.throws(() => manifest({ client: { home: { doctype: "Missing" } } }), /not a doctype this app defines/);
  assert.doesNotThrow(() => manifest({ client: { home: { doctype: "Stock Request" } } }));
});

test("brand and catalog mode are constrained to what the client can render", () => {
  assert.throws(() => manifest({ client: { brand: "neon" } }), /client.brand is not recognised/);
  assert.throws(() => manifest({ client: { catalog_mode: "everything" } }), /client.catalog_mode is not recognised/);
});

test("an experience without a deployed generic renderer is refused", () => {
  assert.throws(() => manifest({
    nav: [{ key: "picking", label: "Soạn hàng", kind: "experience" }],
  }), /unsupported experience picking/);
});

test("nav paths agree with the routes the client builds", () => {
  assert.equal(navItemPath({ key: "Stock Request", label: "x", kind: "doctype" }), "/app/Stock%20Request");
  assert.equal(navItemPath({ key: "picking", label: "x", kind: "experience" }), "/x/picking");
  assert.equal(navItemPath({ key: "__permissions", label: "x", kind: "system" }), "/permissions");
  assert.equal(navItemPath({ key: "c", label: "x", kind: "route", route: "/catalog" }), "/catalog");
  // A route-kind entry with no route reaches nothing; callers must handle null rather
  // than silently treating it as a doctype.
  assert.equal(navItemPath({ key: "c", label: "x", kind: "route" }), null);
});
