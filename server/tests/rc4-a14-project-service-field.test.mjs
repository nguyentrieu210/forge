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

function serviceContract(overrides = {}) {
  return {
    effective_from: "2026-08-01",
    effective_to: "2027-08-01",
    response_hours: 4,
    resolution_hours: 24,
    visits_included: 2,
    covered_items: [
      { item: "ITEM-1", coverage_type: "Bảo hành toàn phần", coverage_start: "2026-08-01", coverage_end: "2027-08-01" },
    ],
    ...overrides,
  };
}

function serviceOrder(overrides = {}) {
  return {
    scheduled_start: "2026-08-03 09:00:00",
    scheduled_end: "2026-08-03 10:00:00",
    actual_start: "2026-08-03 09:05:00",
    actual_end: "2026-08-03 09:55:00",
    workflow_state: "Chờ xác nhận",
    checklist: [{ check_item: "Nguồn điện", result: "Đạt" }],
    overall_checklist_result: "Đạt",
    work_performed: "Kiểm tra và hiệu chỉnh",
    resolution: "Hoạt động bình thường",
    parts_used: [],
    ...overrides,
  };
}

test("service contract coverage is non-empty bounded unique and cancellation-audited", async () => {
  const empty = await validate("maintenance", "Service Contract", serviceContract({ covered_items: [] }));
  assert.equal(empty.status, 422);
  assert.match(await message(empty), /ít nhất một/i);

  const outside = await validate("maintenance", "Service Contract", serviceContract({
    covered_items: [{ item: "ITEM-1", coverage_type: "Bảo hành toàn phần", coverage_start: "2026-07-01", coverage_end: "2027-08-01" }],
  }));
  assert.equal(outside.status, 422);
  assert.match(await message(outside), /trước hiệu lực/i);

  const duplicate = await validate("maintenance", "Service Contract", serviceContract({
    covered_items: [
      { item: "ITEM-1", serial_no: "SN-1", coverage_type: "Bảo hành toàn phần" },
      { item: "ITEM-1", serial_no: "SN-1", coverage_type: "Bảo hành toàn phần" },
    ],
  }));
  assert.equal(duplicate.status, 422);
  assert.match(await message(duplicate), /khai báo trùng/i);

  const cancelled = await validate("maintenance", "Service Contract", serviceContract({ workflow_state: "Hủy", cancel_reason: "" }));
  assert.equal(cancelled.status, 422);
  assert.match(await message(cancelled), /lý do/i);
});

test("warranty and service completion require terminal evidence", async () => {
  const warranty = await validate("maintenance", "Warranty Claim", {
    workflow_state: "Hoàn tất",
    eligibility_result: "Đủ điều kiện",
    eligibility_reason: "Còn hiệu lực",
    service_order: "SO-1",
    resolution_date: "2026-08-03 10:00:00",
    resolution: "Đã xử lý",
    customer_confirmed_by: "",
  });
  assert.equal(warranty.status, 422);
  assert.match(await message(warranty), /xác nhận phía khách hàng/i);

  const missingActual = await validate("maintenance", "Service Order", serviceOrder({ actual_start: "", actual_end: "" }));
  assert.equal(missingActual.status, 422);
  assert.match(await message(missingActual), /thời gian bắt đầu và kết thúc thực tế/i);

  const completed = await validate("maintenance", "Service Order", serviceOrder({ workflow_state: "Hoàn tất", customer_confirmed_by: "" }));
  assert.equal(completed.status, 422);
  assert.match(await message(completed), /xác nhận phía khách hàng/i);
});

test("project template rejects multi-node parent cycles", async () => {
  const response = await validate("projects", "Project Template", {
    tasks: [
      { task_key: "A", subject: "A", parent_task_key: "C", duration_days: 1 },
      { task_key: "B", subject: "B", parent_task_key: "A", duration_days: 1 },
      { task_key: "C", subject: "C", parent_task_key: "B", duration_days: 1 },
    ],
  });
  assert.equal(response.status, 422);
  assert.match(await message(response), /vòng lặp/i);
});

test("project task requires valid unique dependencies and terminal evidence", async () => {
  const duplicate = await validate("projects", "Project Task", {
    planned_start: "2026-08-01 08:00:00",
    planned_end: "2026-08-01 17:00:00",
    progress_percent: 50,
    dependencies: [
      { depends_on: "TASK-A", dependency_type: "Finish-to-Start" },
      { depends_on: "TASK-A", dependency_type: "Start-to-Start" },
    ],
  }, { name: "TASK-B" });
  assert.equal(duplicate.status, 422);
  assert.match(await message(duplicate), /khai báo trùng/i);

  const incomplete = await validate("projects", "Project Task", {
    planned_start: "2026-08-01 08:00:00",
    planned_end: "2026-08-01 17:00:00",
    progress_percent: 90,
    completion_note: "Đã làm phần lớn",
    workflow_state: "Chờ xác nhận",
    dependencies: [],
  }, { name: "TASK-B" });
  assert.equal(incomplete.status, 422);
  assert.match(await message(incomplete), /100%/i);
});

test("project timesheet requires rows, activity provenance and return evidence", async () => {
  const empty = await validate("projects", "Project Timesheet", {
    period_start: "2026-08-01",
    period_end: "2026-08-07",
    details: [],
  });
  assert.equal(empty.status, 422);
  assert.match(await message(empty), /ít nhất một dòng/i);

  const missingActivity = await validate("projects", "Project Timesheet", {
    period_start: "2026-08-01",
    period_end: "2026-08-07",
    details: [{ task: "TASK-1", activity_type: "", from_time: "2026-08-03 08:00:00", to_time: "2026-08-03 09:00:00", hours: 1 }],
  });
  assert.equal(missingActivity.status, 422);
  assert.match(await message(missingActivity), /loại hoạt động/i);

  const returned = await validate("projects", "Project Timesheet", {
    period_start: "2026-08-01",
    period_end: "2026-08-07",
    workflow_state: "Trả lại",
    rejection_reason: "",
    details: [{ task: "TASK-1", activity_type: "Thi công", from_time: "2026-08-03 08:00:00", to_time: "2026-08-03 09:00:00", hours: 1 }],
  });
  assert.equal(returned.status, 422);
  assert.match(await message(returned), /trả lại phải có lý do/i);
});

test("change order and acceptance require explicit exception evidence", async () => {
  const change = await validate("projects", "Project Change Order", { workflow_state: "Từ chối", rejection_reason: "" });
  assert.equal(change.status, 422);
  assert.match(await message(change), /từ chối phải có lý do/i);

  const acceptance = await validate("projects", "Project Acceptance Certificate", {
    progress_percent: 80,
    acceptance_result: "Chấp nhận có điều kiện",
    condition_note: "",
    workflow_state: "Chờ xác nhận",
  });
  assert.equal(acceptance.status, 422);
  assert.match(await message(acceptance), /điều kiện hoặc tồn tại/i);
});

test("SLA policy requires executable target tables and coherent escalation windows", async () => {
  const empty = await validate("support", "Support SLA Policy", { active_from: "2026-08-01", priorities: [], workdays: [] });
  assert.equal(empty.status, 422);
  assert.match(await message(empty), /mục tiêu theo mức ưu tiên/i);

  const escalation = await validate("support", "Support SLA Policy", {
    active_from: "2026-08-01",
    priorities: [{ priority: "P1", response_minutes: 30, escalation_minutes: 10, resolution_minutes: 60 }],
    workdays: [{ weekday: "Thứ Hai", start_time: "08:00", end_time: "17:00" }],
  });
  assert.equal(escalation.status, 422);
  assert.match(await message(escalation), /leo thang/i);

  const defaults = await validate("support", "Support SLA Policy", {
    active_from: "2026-08-01",
    priorities: [
      { priority: "P1", response_minutes: 10, escalation_minutes: 20, resolution_minutes: 60, is_default: 1 },
      { priority: "P2", response_minutes: 20, escalation_minutes: 30, resolution_minutes: 90, is_default: true },
    ],
    workdays: [{ weekday: "Thứ Hai", start_time: "08:00", end_time: "17:00" }],
  });
  assert.equal(defaults.status, 422);
  assert.match(await message(defaults), /một mức ưu tiên mặc định/i);
});

test("support cancellation and CSAT follow-up are server validated", async () => {
  const cancelled = await validate("support", "Support Ticket", { workflow_state: "Hủy", cancel_reason: "" });
  assert.equal(cancelled.status, 422);
  assert.match(await message(cancelled), /hủy phải có lý do/i);

  const rating = await validate("support", "Support Feedback", { rating: "6", followup_required: 0 });
  assert.equal(rating.status, 422);
  assert.match(await message(rating), /1 đến 5/i);

  const followup = await validate("support", "Support Feedback", { rating: "4", followup_required: 1, followup_note: "" });
  assert.equal(followup.status, 422);
  assert.match(await message(followup), /ghi chú theo dõi/i);

  const accepted = await validate("support", "Support Feedback", { rating: "5", followup_required: 0 });
  assert.equal(accepted.status, 200, await message(accepted));
});
