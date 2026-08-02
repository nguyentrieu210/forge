import test from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/apps-src/ws07-worker/src/index.js";

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

async function validate(app, doctype, payload, { action = "create", name = "NEW", records = {} } = {}) {
  const request = new Request("https://ws07.test/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-app": app,
      "x-cloudforge-callback": "https://platform.test/",
    },
    body: JSON.stringify({ doctype, name, action, payload }),
  });
  return worker.fetch(request, { PLATFORM: platformFetcher(records) });
}

async function message(response) {
  return String((await response.clone().json()).message ?? "");
}

test("WS07 worker refuses requests from apps outside its ownership", async () => {
  const response = await validate("unknown", "Project", {}, { name: "P1" });
  assert.equal(response.status, 403);
});

test("service contract rejects inverted dates and invalid response target", async () => {
  const dates = await validate("maintenance", "Service Contract", {
    effective_from: "2026-08-10",
    effective_to: "2026-08-01",
    response_hours: 4,
    resolution_hours: 24,
    visits_included: 0,
  });
  assert.equal(dates.status, 422);
  assert.match(await message(dates), /kết thúc không được trước/i);

  const target = await validate("maintenance", "Service Contract", {
    effective_from: "2026-08-01",
    effective_to: "2027-08-01",
    response_hours: 48,
    resolution_hours: 24,
    visits_included: 0,
  });
  assert.equal(target.status, 422);
  assert.match(await message(target), /phản hồi không được lớn hơn/i);
});

test("service contract partial save merges current record before validation", async () => {
  const current = {
    effective_from: "2026-08-01",
    effective_to: "2027-08-01",
    response_hours: 4,
    resolution_hours: 24,
    visits_included: 2,
    covered_items: [],
  };
  const response = await validate("maintenance", "Service Contract", { response_hours: 30 }, {
    action: "save",
    name: "SC-1",
    records: { "Service Contract:SC-1": current },
  });
  assert.equal(response.status, 422);
  assert.match(await message(response), /phản hồi không được lớn hơn/i);
});

test("warranty claim state must agree with entitlement result", async () => {
  const response = await validate("maintenance", "Warranty Claim", {
    workflow_state: "Đủ điều kiện",
    eligibility_result: "Chưa xác minh",
  });
  assert.equal(response.status, 422);
  assert.match(await message(response), /Đủ điều kiện/i);

  const rejected = await validate("maintenance", "Warranty Claim", {
    workflow_state: "Từ chối",
    eligibility_result: "Đủ điều kiện",
  });
  assert.equal(rejected.status, 422);
  assert.match(await message(rejected), /Không đủ điều kiện/i);
});

test("service order rejects bad schedule and incomplete completion evidence", async () => {
  const schedule = await validate("maintenance", "Service Order", {
    scheduled_start: "2026-08-03 10:00:00",
    scheduled_end: "2026-08-03 09:00:00",
  });
  assert.equal(schedule.status, 422);
  assert.match(await message(schedule), /kết thúc không được trước/i);

  const incomplete = await validate("maintenance", "Service Order", {
    scheduled_start: "2026-08-03 09:00:00",
    scheduled_end: "2026-08-03 10:00:00",
    workflow_state: "Chờ xác nhận",
    checklist: [],
  });
  assert.equal(incomplete.status, 422);
  assert.match(await message(incomplete), /checklist/i);
});

test("service order accepts complete structured evidence", async () => {
  const response = await validate("maintenance", "Service Order", {
    scheduled_start: "2026-08-03 09:00:00",
    scheduled_end: "2026-08-03 10:00:00",
    actual_start: "2026-08-03 09:05:00",
    actual_end: "2026-08-03 09:55:00",
    workflow_state: "Chờ xác nhận",
    checklist: [{ check_item: "Nguồn điện", result: "Đạt" }],
    overall_checklist_result: "Đạt",
    work_performed: "Kiểm tra và hiệu chỉnh",
    resolution: "Hoạt động bình thường",
    parts_used: [{ item: "PART-1", qty: 1, uom: "Cái" }],
  });
  assert.equal(response.status, 200, await message(response));
});

test("project and task schedule invariants reject impossible planning", async () => {
  const project = await validate("projects", "Project", {
    planned_start: "2026-09-01",
    planned_end: "2026-08-01",
    resources: [],
  });
  assert.equal(project.status, 422);

  const task = await validate("projects", "Project Task", {
    planned_start: "2026-08-01 08:00:00",
    planned_end: "2026-08-01 09:00:00",
    progress_percent: 10,
    parent_task: "TASK-1",
    dependencies: [],
  }, { name: "TASK-1" });
  assert.equal(task.status, 422);
  assert.match(await message(task), /cha của chính nó/i);
});

test("project template and portfolio reject broken hierarchy and duplicates", async () => {
  const template = await validate("projects", "Project Template", {
    tasks: [
      { task_key: "A", subject: "A", duration_days: 1 },
      { task_key: "B", subject: "B", parent_task_key: "MISSING", duration_days: 1 },
    ],
  });
  assert.equal(template.status, 422);
  assert.match(await message(template), /không tồn tại trong mẫu/i);

  const portfolio = await validate("projects", "Project Portfolio", {
    projects: [{ project: "P1" }, { project: "P1" }],
  });
  assert.equal(portfolio.status, 422);
  assert.match(await message(portfolio), /hai lần/i);
});

test("capacity and timesheet reject negative or inverted effort", async () => {
  const capacity = await validate("projects", "Project Capacity Plan", {
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    resources: [{ available_hours: 160, planned_hours: -1 }],
  });
  assert.equal(capacity.status, 422);
  assert.match(await message(capacity), /không được âm/i);

  const timesheet = await validate("projects", "Project Timesheet", {
    period_start: "2026-08-01",
    period_end: "2026-08-07",
    details: [{ task: "T1", from_time: "2026-08-03 10:00:00", to_time: "2026-08-03 09:00:00", hours: 1 }],
  });
  assert.equal(timesheet.status, 422);
  assert.match(await message(timesheet), /kết thúc không được trước/i);
});

test("acceptance requires signed evidence at confirmed state", async () => {
  const response = await validate("projects", "Project Acceptance Certificate", {
    progress_percent: 100,
    workflow_state: "Đã xác nhận",
    signed_document: "",
  });
  assert.equal(response.status, 422);
  assert.match(await message(response), /biên bản ký/i);
});

test("SLA policy rejects duplicate priorities and invalid business hours", async () => {
  const duplicate = await validate("support", "Support SLA Policy", {
    active_from: "2026-08-01",
    priorities: [
      { priority: "P1", response_minutes: 10, resolution_minutes: 60, escalation_minutes: 30 },
      { priority: "P1", response_minutes: 20, resolution_minutes: 90, escalation_minutes: 45 },
    ],
    workdays: [{ weekday: "Thứ Hai", start_time: "08:00", end_time: "17:00" }],
  });
  assert.equal(duplicate.status, 422);
  assert.match(await message(duplicate), /không được trùng/i);

  const hours = await validate("support", "Support SLA Policy", {
    active_from: "2026-08-01",
    priorities: [{ priority: "P1", response_minutes: 10, resolution_minutes: 60, escalation_minutes: 30 }],
    workdays: [{ weekday: "Thứ Hai", start_time: "17:00", end_time: "08:00" }],
  });
  assert.equal(hours.status, 422);
  assert.match(await message(hours), /giờ kết thúc phải sau/i);
});

test("support ticket cannot progress unassigned or close without resolution", async () => {
  const unassigned = await validate("support", "Support Ticket", { workflow_state: "Đang xử lý", assignee: "" });
  assert.equal(unassigned.status, 422);
  assert.match(await message(unassigned), /phân công/i);

  const close = await validate("support", "Support Ticket", { workflow_state: "Đóng", assignee: "agent@example.com", resolution: "" });
  assert.equal(close.status, 422);
  assert.match(await message(close), /chưa có kết quả/i);
});
