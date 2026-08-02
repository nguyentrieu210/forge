import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry, SemanticQueryCompiler } from "../dist/packages/semantic/src/index.js";
import { ReadScopeSemanticAccessController } from "../dist/packages/semantic/src/access.js";

const doctypeModel = {
  id: "sales.orders",
  label: "Sales orders",
  source: { kind: "doctype", doctype: "Sales Order", state: "submitted" },
  grain: "one submitted sales order",
  permission: { doctype: "Sales Order", action: "report" },
  dimensions: [
    { id: "company", label: "Company", field: "company", kind: "link", options: "Company" },
    { id: "branch", label: "Branch", field: "branch", kind: "link", options: "Branch" },
    { id: "customer", label: "Customer", field: "customer", kind: "link", options: "Customer" },
  ],
  metrics: [{ id: "order_count", label: "Orders", aggregation: "count", value: { kind: "integer", exact: true } }],
  maxRows: 500,
};

const viewModel = {
  ...doctypeModel,
  id: "sales.order_view",
  source: { kind: "view", name: "sales_order_semantic", tenantField: "tenant_id", access: { ownerField: "owner", nameField: "name" } },
};

const registry = new SemanticModelRegistry([doctypeModel, viewModel]);
const compiler = new SemanticQueryCompiler(registry);

test("doctype owner scope injects owner predicate", () => {
  const compiled = compiler.compile({ model: "sales.orders", tenant_id: "tenant-a", metrics: ["order_count"] }, {
    mode: "owner", actor_user_id: "alice@example.com", user_permissions: [],
  });
  assert.match(compiled.sql, /s\.owner=\?3/);
  assert.deepEqual(compiled.params.slice(0, 3), ["tenant-a", "Sales Order", "alice@example.com"]);
});

test("doctype shared and owner-or-shared scope reuse document_shares semantics", () => {
  const shared = compiler.compile({ model: "sales.orders", tenant_id: "tenant-a", metrics: ["order_count"] }, {
    mode: "shared", actor_user_id: "alice@example.com", user_permissions: [],
  });
  assert.match(shared.sql, /EXISTS \(SELECT 1 FROM document_shares ds/);
  assert.match(shared.sql, /ds\.tenant_id=s\.tenant_id/);
  assert.match(shared.sql, /ds\.name=s\.name/);
  assert.deepEqual(shared.params.slice(0, 4), ["tenant-a", "Sales Order", "Sales Order", "alice@example.com"]);

  const ownerOrShared = compiler.compile({ model: "sales.orders", tenant_id: "tenant-a", metrics: ["order_count"] }, {
    mode: "owner_or_shared", actor_user_id: "alice@example.com", user_permissions: [],
  });
  assert.match(ownerOrShared.sql, /\(s\.owner=\?3 OR EXISTS/);
});

test("user-permission fields are OR within one restriction and restrictions are ANDed", () => {
  const compiled = compiler.compile({ model: "sales.orders", tenant_id: "tenant-a", metrics: ["order_count"] }, {
    mode: "all",
    actor_user_id: "alice@example.com",
    user_permissions: [
      { allow_doctype: "Organization", fields: ["company", "branch"], allowed_values: ["COMP-1", "BR-1"] },
      { allow_doctype: "Customer", fields: ["customer"], allowed_values: ["CUST-1"] },
    ],
  });
  assert.match(compiled.sql, /json_extract\(s\.payload_json,'\$\.company'\) IN \(\?3,\?4\) OR json_extract\(s\.payload_json,'\$\.branch'\) IN \(\?3,\?4\)/);
  assert.match(compiled.sql, /json_extract\(s\.payload_json,'\$\.customer'\) IN \(\?5\)/);
  assert.deepEqual(compiled.params.slice(0, 5), ["tenant-a", "Sales Order", "COMP-1", "BR-1", "CUST-1"]);
});

test("view owner/share scope requires explicit owner/name access mapping", () => {
  const mapped = compiler.compile({ model: "sales.order_view", tenant_id: "tenant-a", metrics: ["order_count"] }, {
    mode: "owner_or_shared", actor_user_id: "alice@example.com", user_permissions: [],
  });
  assert.match(mapped.sql, /s\."owner"=\?2/);
  assert.match(mapped.sql, /ds\.name=s\."name"/);

  const unsafeRegistry = new SemanticModelRegistry([{ ...viewModel, id: "sales.unsafe_view", source: { kind: "view", name: "sales_order_semantic", tenantField: "tenant_id" } }]);
  const unsafe = new SemanticQueryCompiler(unsafeRegistry);
  assert.throws(() => unsafe.compile({ model: "sales.unsafe_view", tenant_id: "tenant-a", metrics: ["order_count"] }, {
    mode: "owner", actor_user_id: "alice@example.com", user_permissions: [],
  }), (error) => error.code === "PERMISSION_DENIED");
});

test("semantic query fails closed when a User Permission field is not represented by a semantic dimension", () => {
  assert.throws(() => compiler.compile({ model: "sales.orders", tenant_id: "tenant-a", metrics: ["order_count"] }, {
    mode: "all", actor_user_id: "alice@example.com",
    user_permissions: [{ allow_doctype: "Territory", fields: ["territory"], allowed_values: ["VN-SOUTH"] }],
  }), (error) => error.code === "PERMISSION_DENIED");
});

test("read-scope access adapter reuses report permission then validates enforceable scope", async () => {
  const events = [];
  const access = new ReadScopeSemanticAccessController(registry, {
    async assertReport(tenantId, doctype) { events.push(["report", tenantId, doctype]); },
    async getReadScope(tenantId, doctype) {
      events.push(["scope", tenantId, doctype]);
      return {
        mode: "all",
        actor_user_id: "alice@example.com",
        user_permissions: [{ allow_doctype: "Branch", fields: ["branch"], allowed_values: ["BR-1"] }],
      };
    },
  });
  const scope = await access.authorize({ tenantId: "tenant-a", model: "sales.orders", permission: { doctype: "Sales Order", action: "report" } });
  assert.deepEqual(events, [
    ["report", "tenant-a", "Sales Order"],
    ["scope", "tenant-a", "Sales Order"],
  ]);
  assert.deepEqual(scope.user_permissions[0].allowed_values, ["BR-1"]);
});

test("read-scope adapter denies a view whose actor scope cannot be represented", async () => {
  const unsafeRegistry = new SemanticModelRegistry([{ ...viewModel, id: "sales.unsafe_view", source: { kind: "view", name: "sales_order_semantic", tenantField: "tenant_id" } }]);
  const access = new ReadScopeSemanticAccessController(unsafeRegistry, {
    async assertReport() {},
    async getReadScope() { return { mode: "owner", actor_user_id: "alice@example.com", user_permissions: [] }; },
  });
  await assert.rejects(() => access.authorize({ tenantId: "tenant-a", model: "sales.unsafe_view", permission: { doctype: "Sales Order", action: "report" } }), (error) => error.code === "PERMISSION_DENIED");
});
