import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry, SemanticQueryCompiler } from "../dist/packages/semantic/src/index.js";
import { D1SemanticQueryService } from "../dist/packages/semantic/src/service.js";

const registry = new SemanticModelRegistry([{
  id: "sales.orders",
  label: "Sales orders",
  source: { kind: "doctype", doctype: "Sales Order", state: "submitted" },
  grain: "one submitted sales order",
  permission: { doctype: "Sales Order", action: "report" },
  dimensions: [
    { id: "branch", label: "Branch", field: "branch", kind: "link", options: "Branch" },
    { id: "customer", label: "Customer", field: "customer", kind: "link", options: "Customer" },
  ],
  metrics: [{ id: "order_count", label: "Orders", aggregation: "count", value: { kind: "integer", exact: true } }],
  maxRows: 100,
}]);

const compiler = new SemanticQueryCompiler(registry);

test("D1 service prepares SQL containing owner/share and User Permission scope returned by access adapter", async () => {
  let preparedSql = "";
  let bound = [];
  const db = {
    prepare(sql) {
      preparedSql = sql;
      return {
        bind(...params) {
          bound = params;
          return { async all() { return { results: [{ order_count: 2 }] }; } };
        },
      };
    },
  };
  const service = new D1SemanticQueryService(db, compiler, {
    async authorize() {
      return {
        mode: "owner_or_shared",
        actor_user_id: "alice@example.com",
        user_permissions: [
          { allow_doctype: "Branch", fields: ["branch"], allowed_values: ["BR-1"] },
          { allow_doctype: "Customer", fields: ["customer"], allowed_values: ["CUST-1", "CUST-2"] },
        ],
      };
    },
  });

  const result = await service.run({ model: "sales.orders", tenant_id: "tenant-a", metrics: ["order_count"] });
  assert.equal(result.row_count, 1);
  assert.match(preparedSql, /s\.owner=\?3 OR EXISTS \(SELECT 1 FROM document_shares ds/);
  assert.match(preparedSql, /json_extract\(s\.payload_json,'\$\.branch'\) IN \(\?6\)/);
  assert.match(preparedSql, /json_extract\(s\.payload_json,'\$\.customer'\) IN \(\?7,\?8\)/);
  assert.deepEqual(bound.slice(0, 8), [
    "tenant-a", "Sales Order", "alice@example.com", "Sales Order", "alice@example.com", "BR-1", "CUST-1", "CUST-2",
  ]);
});
