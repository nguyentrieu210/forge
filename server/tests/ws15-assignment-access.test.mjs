import test from "node:test";
import assert from "node:assert/strict";

import { D1CollaborationService } from "../dist/packages/frappe-model/src/services.js";

function fakeDatabase() {
  const prepared = [];
  const runs = [];
  const batches = [];
  const db = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          this.values = values;
          prepared.push(this);
          return this;
        },
        async run() {
          runs.push(this);
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements) {
      batches.push(statements);
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  return { db, prepared, runs, batches };
}

const actor = { user_id: "manager@example.test", roles: ["Workplace Manager"] };
const now = "2026-08-03T02:00:00Z";

test("readable assignee creates assignment without widening document access", async () => {
  const { db, runs, batches } = fakeDatabase();
  const plans = [];
  const service = new D1CollaborationService(db, {
    async plan(input) {
      plans.push(input);
      return "none";
    },
  });

  const record = await service.assign("demo", actor, "Purchase Order", "PO-1", {
    assigned_to: "buyer@example.test",
    description: "Review",
  }, now);

  assert.equal(record.assigned_to, "buyer@example.test");
  assert.equal(plans.length, 1);
  assert.equal(runs.length, 1);
  assert.match(runs[0].sql, /INSERT INTO assignments/);
  assert.equal(batches.length, 0);
});

test("unreadable assignee gets narrow Read share atomically with assignment", async () => {
  const { db, runs, batches } = fakeDatabase();
  const service = new D1CollaborationService(db, { plan: async () => "read_share" });

  await service.assign("demo", actor, "Purchase Order", "PO-1", {
    assigned_to: "buyer@example.test",
  }, now);

  assert.equal(runs.length, 0, "share and assignment must not be committed separately");
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 2);
  assert.match(batches[0][0].sql, /INSERT INTO document_shares/);
  assert.match(batches[0][0].sql, /can_read=1/);
  assert.match(batches[0][0].sql, /MAX\(document_shares\.can_write,excluded\.can_write\)/);
  assert.match(batches[0][0].sql, /MAX\(document_shares\.can_share,excluded\.can_share\)/);
  assert.match(batches[0][1].sql, /INSERT INTO assignments/);
});

test("assignment access refusal performs no write", async () => {
  const { db, prepared, runs, batches } = fakeDatabase();
  const service = new D1CollaborationService(db, {
    async plan() {
      throw new Error("recipient cannot read and assigner cannot share");
    },
  });

  await assert.rejects(
    () => service.assign("demo", actor, "Purchase Order", "PO-1", { assigned_to: "buyer@example.test" }, now),
    /cannot read/,
  );
  assert.equal(prepared.length, 0);
  assert.equal(runs.length, 0);
  assert.equal(batches.length, 0);
});

test("historical closed assignment does not create a new access grant", async () => {
  const { db, runs, batches } = fakeDatabase();
  let planned = 0;
  const service = new D1CollaborationService(db, {
    async plan() {
      planned += 1;
      return "read_share";
    },
  });

  await service.assign("demo", actor, "Purchase Order", "PO-1", {
    assigned_to: "buyer@example.test",
    status: "Closed",
  }, now);

  assert.equal(planned, 0);
  assert.equal(runs.length, 1);
  assert.equal(batches.length, 0);
});
