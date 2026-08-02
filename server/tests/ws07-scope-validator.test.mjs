import test from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/apps-src/ws07-worker/src/entry.js";

function encodeIdentity(userId, roles) {
  const raw = JSON.stringify({ actor: { user_id: userId, roles } });
  return Buffer.from(raw, "utf8").toString("base64url");
}

function platformFetcher(records = {}) {
  const data = new Map(Object.entries(records));
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const parts = url.pathname.replace(/^\/+/, "").split("/");
      if (parts[0] !== "resource" || parts.length < 3) return Response.json({ message: "not found" }, { status: 404 });
      const doctype = decodeURIComponent(parts[1]);
      const name = decodeURIComponent(parts.slice(2).join("/"));
      const record = data.get(`${doctype}:${name}`);
      return record ? Response.json({ data: record }) : Response.json({ message: "not found" }, { status: 404 });
    },
  };
}

async function validate({ app, user, roles, doctype, payload, action = "save", name = "DOC-1", records = {} }) {
  const request = new Request("https://ws07.test/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-app": app,
      "x-cloudforge-callback": "https://platform.test/",
      "x-cloudforge-identity": encodeIdentity(user, roles),
    },
    body: JSON.stringify({ doctype, name, action, payload }),
  });
  return worker.fetch(request, { PLATFORM: platformFetcher(records) }, { waitUntil() {}, passThroughOnException() {} });
}

async function message(response) {
  return String((await response.clone().json()).message ?? "");
}

test("scope validator rejects missing authenticated identity", async () => {
  const request = new Request("https://ws07.test/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-app": "projects",
      "x-cloudforge-callback": "https://platform.test/",
    },
    body: JSON.stringify({ doctype: "Project Task", name: "TASK-1", action: "save", payload: { progress_percent: 10 } }),
  });
  const response = await worker.fetch(request, { PLATFORM: platformFetcher() }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 422);
  assert.match(await message(response), /danh tính/i);
});

test("maintenance technician can update only service orders assigned through technician master", async () => {
  const records = {
    "Service Order:SO-1": {
      technician: "TECH-A",
      scheduled_start: "2026-08-03 09:00:00",
      scheduled_end: "2026-08-03 10:00:00",
      workflow_state: "Đang thực hiện",
    },
    "Service Technician:TECH-A": { user: "tech-a@example.com" },
  };
  const allowed = await validate({
    app: "maintenance",
    user: "tech-a@example.com",
    roles: ["Maintenance Technician"],
    doctype: "Service Order",
    payload: { completion_note: "Đã kiểm tra" },
    name: "SO-1",
    records,
  });
  assert.equal(allowed.status, 200, await message(allowed));

  const denied = await validate({
    app: "maintenance",
    user: "tech-b@example.com",
    roles: ["Maintenance Technician"],
    doctype: "Service Order",
    payload: { completion_note: "Không phải việc của tôi" },
    name: "SO-1",
    records,
  });
  assert.equal(denied.status, 422);
  assert.match(await message(denied), /được phân công/i);
});

test("warranty claim technician scope follows linked service order assignment", async () => {
  const records = {
    "Warranty Claim:WC-1": {
      service_order: "SO-1",
      workflow_state: "Đang xử lý",
      eligibility_result: "Đủ điều kiện",
    },
    "Service Order:SO-1": { technician: "TECH-A" },
    "Service Technician:TECH-A": { user: "tech-a@example.com" },
  };
  const allowed = await validate({
    app: "maintenance",
    user: "tech-a@example.com",
    roles: ["Maintenance Technician"],
    doctype: "Warranty Claim",
    payload: { resolution: "Đã kiểm tra" },
    name: "WC-1",
    records,
  });
  assert.equal(allowed.status, 200, await message(allowed));

  const denied = await validate({
    app: "maintenance",
    user: "tech-b@example.com",
    roles: ["Maintenance Technician"],
    doctype: "Warranty Claim",
    payload: { resolution: "Không được sửa" },
    name: "WC-1",
    records,
  });
  assert.equal(denied.status, 422);
  assert.match(await message(denied), /Lệnh dịch vụ liên quan/i);
});

test("project user can mutate only tasks assigned to that user", async () => {
  const records = {
    "Project Task:TASK-1": {
      assignee: "alice@example.com",
      planned_start: "2026-08-03 09:00:00",
      planned_end: "2026-08-03 10:00:00",
      progress_percent: 10,
      dependencies: [],
    },
  };
  const allowed = await validate({
    app: "projects",
    user: "alice@example.com",
    roles: ["Project User"],
    doctype: "Project Task",
    payload: { progress_percent: 20 },
    name: "TASK-1",
    records,
  });
  assert.equal(allowed.status, 200, await message(allowed));

  const denied = await validate({
    app: "projects",
    user: "bob@example.com",
    roles: ["Project User"],
    doctype: "Project Task",
    payload: { progress_percent: 30 },
    name: "TASK-1",
    records,
  });
  assert.equal(denied.status, 422);
  assert.match(await message(denied), /được giao việc/i);
});

test("support user can mutate only assigned tickets while managers bypass assignment scope", async () => {
  const records = {
    "Support Ticket:TKT-1": {
      assignee: "agent-a@example.com",
      workflow_state: "Đang xử lý",
      resolution: "",
    },
  };
  const allowed = await validate({
    app: "support",
    user: "agent-a@example.com",
    roles: ["Support User"],
    doctype: "Support Ticket",
    payload: { description: "Đang xử lý" },
    name: "TKT-1",
    records,
  });
  assert.equal(allowed.status, 200, await message(allowed));

  const denied = await validate({
    app: "support",
    user: "agent-b@example.com",
    roles: ["Support User"],
    doctype: "Support Ticket",
    payload: { description: "Không thuộc queue của tôi" },
    name: "TKT-1",
    records,
  });
  assert.equal(denied.status, 422);
  assert.match(await message(denied), /agent được phân công/i);

  const manager = await validate({
    app: "support",
    user: "manager@example.com",
    roles: ["Support Manager"],
    doctype: "Support Ticket",
    payload: { priority: "P1" },
    name: "TKT-1",
    records,
  });
  assert.equal(manager.status, 200, await message(manager));
});
