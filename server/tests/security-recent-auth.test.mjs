import test from "node:test";
import assert from "node:assert/strict";
import {
  assertRecentSecurityAuthentication,
  RECENT_SECURITY_AUTH_MAX_AGE_SECONDS,
  requiresRecentSecurityAuthentication,
  requiresRecentSecurityAuthenticationForResource,
  routeFrappeApi,
} from "../dist/packages/frappe-api/src/index.js";

const NOW_ISO = "2026-08-03T00:00:00.000Z";
const NOW = Math.floor(Date.parse(NOW_ISO) / 1000);
const ADMIN = { user_id: "admin@example.com", roles: ["System Manager"] };

function edgeContext(authenticatedAt) {
  return {
    tenantId: "tenant-a",
    actor: ADMIN,
    traceId: "trace-recent-auth",
    authenticatedAt,
    now: () => NOW_ISO,
  };
}

function methodRequest(method, body = {}) {
  const url = new URL(`https://tenant.test/api/method/${method}`);
  const request = new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { request, url };
}

function resourceRequest(httpMethod, doctype, name, body = {}) {
  const suffix = name ? `/${encodeURIComponent(name)}` : "";
  const url = new URL(`https://tenant.test/api/resource/${encodeURIComponent(doctype)}${suffix}`);
  const request = new Request(url, {
    method: httpMethod,
    ...(httpMethod === "GET" ? {} : {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
  return { request, url };
}

test("recent security authentication accepts the configured window and rejects stale, absent and implausibly future timestamps", () => {
  assert.doesNotThrow(() => assertRecentSecurityAuthentication(NOW, NOW_ISO));
  assert.doesNotThrow(() => assertRecentSecurityAuthentication(
    NOW - RECENT_SECURITY_AUTH_MAX_AGE_SECONDS,
    NOW_ISO,
  ));

  assert.throws(
    () => assertRecentSecurityAuthentication(NOW - RECENT_SECURITY_AUTH_MAX_AGE_SECONDS - 1, NOW_ISO),
    /sign in again/i,
  );
  assert.throws(() => assertRecentSecurityAuthentication(undefined, NOW_ISO), /sign in again/i);
  assert.throws(() => assertRecentSecurityAuthentication(NOW + 61, NOW_ISO), /sign in again/i);
});

test("the step-up contract covers tenant IAM, app lifecycle and customization mutations", () => {
  for (const method of [
    "metaforge.api.add_user_permission",
    "metaforge.api.remove_user_permission",
    "metaforge.api.set_user_roles",
    "metaforge.api.create_user",
    "metaforge.api.set_user_enabled",
    "frappe.custom.doctype.customize_form.customize_form.save_customization",
    "forge.apps.install",
    "forge.apps.uninstall",
  ]) {
    assert.equal(requiresRecentSecurityAuthentication(method, ADMIN.user_id), true, method);
  }
  assert.equal(
    requiresRecentSecurityAuthentication(
      "frappe.core.doctype.user.user.update_password",
      ADMIN.user_id,
      "worker@example.com",
    ),
    true,
  );
  assert.equal(
    requiresRecentSecurityAuthentication(
      "frappe.core.doctype.user.user.update_password",
      ADMIN.user_id,
      ADMIN.user_id,
    ),
    false,
  );
  assert.equal(requiresRecentSecurityAuthentication("metaforge.api.list_users", ADMIN.user_id), false);
  assert.equal(requiresRecentSecurityAuthentication("forge.apps.list", ADMIN.user_id), false);
});

test("the step-up contract covers every Frappe platform-metadata mutation but not metadata reads", () => {
  for (const doctype of ["DocType", "Custom Field", "Property Setter", "Workflow", "Print Format"]) {
    for (const method of ["POST", "PUT", "DELETE"]) {
      assert.equal(
        requiresRecentSecurityAuthenticationForResource(method, `/api/resource/${encodeURIComponent(doctype)}/X`),
        true,
        `${method} ${doctype}`,
      );
    }
    assert.equal(
      requiresRecentSecurityAuthenticationForResource("GET", `/api/resource/${encodeURIComponent(doctype)}/X`),
      false,
      `GET ${doctype}`,
    );
  }
  assert.equal(requiresRecentSecurityAuthenticationForResource("PUT", "/api/resource/Sales%20Order/SO-1"), false);
});

test("a stale administrator session is rejected at the API edge before an IAM mutation reaches the core router", async () => {
  const { request, url } = methodRequest("metaforge.api.set_user_roles", {
    user: "worker@example.com",
    roles: ["Stock Manager"],
  });
  const response = await routeFrappeApi(
    request,
    url,
    edgeContext(NOW - RECENT_SECURITY_AUTH_MAX_AGE_SECONDS - 1),
  );
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.exc_type, "AuthenticationError");
  assert.match(body.message, /sign in again/i);
});

test("a stale administrator session cannot reshape platform metadata through the Frappe resource surface", async () => {
  const { request, url } = resourceRequest("PUT", "Workflow", "Sales Order Workflow", {
    name: "Sales Order Workflow",
  });
  const response = await routeFrappeApi(
    request,
    url,
    edgeContext(NOW - RECENT_SECURITY_AUTH_MAX_AGE_SECONDS - 1),
  );
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.exc_type, "AuthenticationError");
  assert.match(body.message, /sign in again/i);
});

test("a stale administrator session cannot install an app through the Frappe method surface", async () => {
  const { request, url } = methodRequest("forge.apps.install", { package: {} });
  const response = await routeFrappeApi(
    request,
    url,
    edgeContext(NOW - RECENT_SECURITY_AUTH_MAX_AGE_SECONDS - 1),
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).exc_type, "AuthenticationError");
});

test("an administrator reset of another user's password also requires recent password authentication", async () => {
  const { request, url } = methodRequest("frappe.core.doctype.user.user.update_password", {
    user: "worker@example.com",
    new_password: "replacement-password",
  });
  const response = await routeFrappeApi(request, url, edgeContext(undefined));
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.exc_type, "AuthenticationError");
  assert.match(body.message, /sign in again/i);
});
