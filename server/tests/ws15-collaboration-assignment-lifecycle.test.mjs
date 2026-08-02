import test from "node:test";
import assert from "node:assert/strict";

import { D1CollaborationService } from "../dist/packages/frappe-model/src/services.js";

function databaseWithAssignmentRows(rows) {
  const queries = [];
  const database = {
    prepare(sql) {
      queries.push(sql);
      return {
        bind() {
          return {
            async all() {
              if (sql.includes("FROM assignments")) {
                // Simulate the database predicate rather than filtering in the assertion:
                // if the service forgets the lifecycle guard, cancelled rows come back.
                return {
                  results: sql.includes("status='Open'")
                    ? rows.filter((row) => row.status === "Open")
                    : rows,
                };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
  return { database, queries };
}

test("document context exposes only open assignments", async () => {
  const rows = [
    {
      assignment_id: "assign-open",
      doctype: "Purchase Order",
      name: "PO-0001",
      assigned_to: "buyer@example.com",
      status: "Open",
      owner: "manager@example.com",
      created_at: "2026-08-03T00:00:00.000Z",
      modified_at: "2026-08-03T00:00:00.000Z",
    },
    {
      assignment_id: "assign-cancelled",
      doctype: "Purchase Order",
      name: "PO-0001",
      assigned_to: "old-buyer@example.com",
      status: "Cancelled",
      owner: "manager@example.com",
      created_at: "2026-08-02T00:00:00.000Z",
      modified_at: "2026-08-03T01:00:00.000Z",
    },
  ];
  const { database, queries } = databaseWithAssignmentRows(rows);
  const service = new D1CollaborationService(database);

  const timeline = await service.listTimeline("tenant-a", "Purchase Order", "PO-0001");

  assert.deepEqual(timeline.assignments.map((row) => row.assignment_id), ["assign-open"]);
  const assignmentQuery = queries.find((sql) => sql.includes("FROM assignments"));
  assert.ok(assignmentQuery, "listTimeline must query assignments");
  assert.match(assignmentQuery, /status='Open'/, "current assignment context must exclude closed/cancelled history in SQL");
});
