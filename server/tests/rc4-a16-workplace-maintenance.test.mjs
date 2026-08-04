import test from "node:test";
import assert from "node:assert/strict";

import {
  WORKPLACE_ALERT_EVENTS,
  scheduledAlertsForDocument,
} from "../dist/packages/frappe-api/src/workplace-maintenance.js";

const NOW = "2026-08-04T06:30:00.000Z";

function row(doctype, payload, overrides = {}) {
  return {
    doctype,
    name: overrides.name ?? "DOC-1",
    owner: overrides.owner ?? "owner@example.test",
    payload,
  };
}

test("due task reminder targets owner and assignee without duplicating the same user", () => {
  const alerts = scheduledAlertsForDocument(row("Workplace Task", {
    subject: "Chốt biên bản họp",
    status: "In Progress",
    reminder_at: "2026-08-04T06:00:00.000Z",
    assigned_to: "assignee@example.test",
  }), NOW);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].event_key, WORKPLACE_ALERT_EVENTS.taskReminder);
  assert.equal(alerts[0].anchor, "2026-08-04T06:00:00.000Z");
  assert.deepEqual(alerts[0].recipient_hints, ["owner@example.test", "assignee@example.test"]);
  assert.match(alerts[0].subject, /Chốt biên bản họp/);

  const ownerOnly = scheduledAlertsForDocument(row("Workplace Task", {
    subject: "Tự xử lý",
    status: "Open",
    reminder_at: "2026-08-04T06:00:00.000Z",
    assigned_to: "owner@example.test",
  }), NOW);
  assert.deepEqual(ownerOnly[0].recipient_hints, ["owner@example.test"]);
});

test("completed or not-yet-due tasks do not produce reminders", () => {
  assert.deepEqual(scheduledAlertsForDocument(row("Workplace Task", {
    subject: "Đã xong",
    status: "Done",
    reminder_at: "2026-08-04T05:00:00.000Z",
  }), NOW), []);

  assert.deepEqual(scheduledAlertsForDocument(row("Workplace Task", {
    subject: "Chưa tới giờ",
    status: "Open",
    reminder_at: "2026-08-04T07:00:00.000Z",
  }), NOW), []);
});

test("submitted managed document produces one expiry alert at or after expiry", () => {
  const alerts = scheduledAlertsForDocument(row("Managed Document", {
    title: "Quy trình mua hàng",
    expiry_date: "2026-08-04",
  }), NOW);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].event_key, WORKPLACE_ALERT_EVENTS.documentExpiry);
  assert.equal(alerts[0].anchor, "2026-08-04");
  assert.match(alerts[0].subject, /Quy trình mua hàng/);

  assert.deepEqual(scheduledAlertsForDocument(row("Managed Document", {
    title: "Còn hiệu lực",
    expiry_date: "2026-08-05",
  }), NOW), []);
});

test("contract renewal notice is derived from end date and notice days, then expiry is distinct", () => {
  const dueForRenewal = scheduledAlertsForDocument(row("Contract", {
    contract_title: "Dịch vụ bảo trì",
    end_date: "2026-08-20",
    renewal_notice_days: 30,
    renewal_status: "None",
  }), NOW);
  assert.equal(dueForRenewal.length, 1);
  assert.equal(dueForRenewal[0].event_key, WORKPLACE_ALERT_EVENTS.contractRenewal);
  assert.equal(dueForRenewal[0].anchor, "2026-07-21");

  const expired = scheduledAlertsForDocument(row("Contract", {
    contract_title: "Dịch vụ đã tới hạn",
    end_date: "2026-08-04",
    renewal_notice_days: 30,
    renewal_status: "Due",
  }), NOW);
  assert.deepEqual(expired.map((alert) => alert.event_key), [
    WORKPLACE_ALERT_EVENTS.contractRenewal,
    WORKPLACE_ALERT_EVENTS.contractExpiry,
  ]);

  assert.deepEqual(scheduledAlertsForDocument(row("Contract", {
    contract_title: "Đã gia hạn",
    end_date: "2026-08-04",
    renewal_notice_days: 30,
    renewal_status: "Renewed",
  }), NOW), []);
});

test("open contract obligation alerts both document owner and responsible user", () => {
  const alerts = scheduledAlertsForDocument(row("Contract Obligation", {
    obligation: "Nộp hồ sơ nghiệm thu",
    due_date: "2026-08-03",
    status: "In Progress",
    owner_user: "responsible@example.test",
  }), NOW);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].event_key, WORKPLACE_ALERT_EVENTS.obligationDue);
  assert.deepEqual(alerts[0].recipient_hints, ["owner@example.test", "responsible@example.test"]);

  assert.deepEqual(scheduledAlertsForDocument(row("Contract Obligation", {
    obligation: "Đã hoàn tất",
    due_date: "2026-08-03",
    status: "Done",
    owner_user: "responsible@example.test",
  }), NOW), []);
});
