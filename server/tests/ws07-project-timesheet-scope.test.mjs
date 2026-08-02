import test from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/apps-src/ws07-worker/src/entry.js";

const identity = (user, roles) => Buffer.from(JSON.stringify({ actor: { user_id: user, roles } }), "utf8").toString("base64url");

function platform(records) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const [, doctype, ...nameParts] = url.pathname.replace(/^\/+/, "").split("/");
      const key = `${decodeURIComponent(doctype)}:${decodeURIComponent(nameParts.join("/"))}`;
      const record = records[key];
      return record ? Response.json({ data: record }) : Response.json({ message: "not found" }, { status: 404 });
    },
  };
}

async function save(user, roles, records, payload) {
  const request = new Request("https://ws07.test/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-app": "projects",
      "x-cloudforge-callback": "https://platform.test/",
      "x-cloudforge-identity": identity(user, roles),
    },
    body: JSON.stringify({ doctype: "Project Timesheet", name: "PTS-1", action: "save", payload }),
  });
  return worker.fetch(request, { PLATFORM: platform(records) }, { waitUntil() {}, passThroughOnException() {} });
}

test("project user cannot edit another user's timesheet but manager can", async () => {
  const records = {
    "Project Timesheet:PTS-1": {
      user: "alice@example.com",
      employee: "EMP-1",
      project: "PROJ-1",
      period_start: "2026-08-01",
      period_end: "2026-08-07",
      details: [{ task: "TASK-1", from_time: "2026-08-03 09:00:00", to_time: "2026-08-03 10:00:00", hours: 1 }],
    },
  };

  const alice = await save("alice@example.com", ["Project User"], records, { employee_note: "own" });
  assert.equal(alice.status, 200);

  const bob = await save("bob@example.com", ["Project User"], records, { employee_note: "other" });
  assert.equal(bob.status, 422);
  assert.match(String((await bob.json()).message), /người lập tương ứng/i);

  const manager = await save("manager@example.com", ["Project Manager"], records, { approval_note: "ok" });
  assert.equal(manager.status, 200);
});
