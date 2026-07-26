import test from "node:test";
import assert from "node:assert/strict";
import {
  dueSchedules,
  isCompleted,
  nextScheduleDate,
  notificationsFor,
  parseAutoRepeat,
  parseNotificationRule,
} from "../dist/packages/frappe-model/src/index.js";

// ---- notification rules ------------------------------------------------------

function rule(overrides = {}) {
  return parseNotificationRule({
    name: "Leave submitted",
    document_type: "Leave Application",
    event: "submitted",
    recipients: [{ kind: "field", value: "approver" }],
    subject: "{{ employee }} xin nghỉ {{ total_days }} ngày",
    ...overrides,
  });
}

test("a rule with an unparseable condition is refused when it is SAVED", () => {
  // Deferring to runtime would store a rule that quietly never fires — and a
  // notification that never arrives is not a visible failure, it is an absence nobody
  // reports until something has gone unapproved for a week.
  assert.throws(() => rule({ condition: "eval:doc.total_days ** 2 > 4" }));
  assert.doesNotThrow(() => rule({ condition: "eval:doc.total_days > 5" }));
});

test("a rule with nobody to tell is refused", () => {
  // It does nothing at all, and looks configured.
  assert.throws(() => parseNotificationRule({
    name: "R", document_type: "X", event: "submitted", recipients: [],
  }), /at least one recipient/);
});

test("a matching event notifies the user named by a document field", () => {
  // "Notify the approver" without a person's name baked into the rule.
  const pending = notificationsFor([rule()], "submitted", "Leave Application", {
    employee: "NV-1", approver: "manager@example.com", total_days: 3,
  });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].for_user, "manager@example.com");
  assert.equal(pending[0].subject, "NV-1 xin nghỉ 3 ngày");
});

test("the condition decides, and a different doctype or event never matches", () => {
  const conditional = [rule({ condition: "eval:doc.total_days > 5" })];
  assert.equal(notificationsFor(conditional, "submitted", "Leave Application", { approver: "m", total_days: 3 }).length, 0);
  assert.equal(notificationsFor(conditional, "submitted", "Leave Application", { approver: "m", total_days: 9 }).length, 1);
  assert.equal(notificationsFor([rule()], "submitted", "Attendance", { approver: "m" }).length, 0);
  assert.equal(notificationsFor([rule()], "cancelled", "Leave Application", { approver: "m" }).length, 0);
});

test("a disabled rule is inert", () => {
  assert.equal(notificationsFor([rule({ enabled: false })], "submitted", "Leave Application", { approver: "m" }).length, 0);
});

test("an Email rule is recorded as skipped, never as delivered", () => {
  // No mail transport exists here. Claiming delivery would be a promise about something
  // the user believes reached a person — the same reason the email method is refused
  // outright rather than stubbed.
  const pending = notificationsFor([rule({ channel: "Email" })], "submitted", "Leave Application", { approver: "m" });
  assert.equal(pending.length, 1);
  assert.match(pending[0].skipped_reason ?? "", /no mail transport/i);
});

test("a recipient field that is empty produces no phantom notification", () => {
  const pending = notificationsFor([rule()], "submitted", "Leave Application", { approver: "" });
  assert.equal(pending.length, 0);
});

// ---- auto repeat -------------------------------------------------------------

function schedule(overrides = {}) {
  return parseAutoRepeat({
    name: "AR-1",
    reference_doctype: "Sales Order",
    reference_name: "SO-1",
    frequency: "Monthly",
    start_date: "2026-01-31",
    ...overrides,
  });
}

test("a new schedule first runs on its start date, not the period after", () => {
  assert.equal(schedule().next_schedule_date, "2026-01-31");
});

test("monthly arithmetic CLAMPS to the end of the target month", () => {
  // Naive date maths turns 31 January + 1 month into 3 March, silently moving the run
  // into the wrong month. Frappe clamps; a tenant moving data between the two would
  // otherwise watch the day drift.
  assert.equal(nextScheduleDate("2026-01-31", "Monthly"), "2026-02-28");
  assert.equal(nextScheduleDate("2028-01-31", "Monthly"), "2028-02-29", "and a leap year keeps the 29th");
  assert.equal(nextScheduleDate("2026-03-31", "Monthly"), "2026-04-30");
  assert.equal(nextScheduleDate("2026-12-15", "Monthly"), "2027-01-15", "and it rolls the year");
});

test("daily, weekly and yearly advance as expected across boundaries", () => {
  assert.equal(nextScheduleDate("2026-02-28", "Daily"), "2026-03-01");
  assert.equal(nextScheduleDate("2026-12-28", "Weekly"), "2027-01-04");
  assert.equal(nextScheduleDate("2028-02-29", "Yearly"), "2029-02-28", "a leap day clamps rather than skipping a year");
});

test("only active and due schedules run", () => {
  const rules = [
    schedule({ name: "due", start_date: "2026-01-01" }),
    schedule({ name: "future", reference_name: "SO-2", start_date: "2026-12-01" }),
    schedule({ name: "stopped", reference_name: "SO-3", start_date: "2026-01-01", status: "Stopped" }),
  ];
  assert.deepEqual(dueSchedules(rules, "2026-06-01").map((entry) => entry.name), ["due"]);
});

test("a period that was missed is still owed, not skipped", () => {
  // The window closed months ago and the document was never produced. Running it late
  // is the deliberate consequence of only advancing the date AFTER a successful
  // creation: a failure, an outage or a restart must retry the SAME period rather than
  // lose it. Nobody notices a document that was never created — they notice a quarter
  // later, when the totals are short.
  const missed = schedule({ start_date: "2026-01-01", end_date: "2026-01-05" });
  assert.deepEqual(dueSchedules([missed], "2026-06-01").map((entry) => entry.name), ["AR-1"]);
});

test("a schedule whose next date is past its end no longer runs", () => {
  // Once the period itself is out of bounds there is nothing left to owe.
  const finished = schedule({ start_date: "2026-01-01", end_date: "2026-01-05", next_schedule_date: "2026-02-01" });
  assert.deepEqual(dueSchedules([finished], "2026-06-01"), []);
});

test("the oldest due period runs first", () => {
  const rules = [
    schedule({ name: "newer", reference_name: "SO-9", start_date: "2026-05-01" }),
    schedule({ name: "older", reference_name: "SO-8", start_date: "2026-01-01" }),
  ];
  assert.deepEqual(dueSchedules(rules, "2026-06-01").map((entry) => entry.name), ["older", "newer"]);
});

test("a schedule finishes once its next date passes its end", () => {
  const bounded = schedule({ start_date: "2026-01-01", end_date: "2026-03-01" });
  assert.equal(isCompleted(bounded, "2026-02-01"), false);
  assert.equal(isCompleted(bounded, "2026-04-01"), true);
});

test("an end date before the start is refused", () => {
  // It would never fire, and would look configured.
  assert.throws(() => schedule({ start_date: "2026-05-01", end_date: "2026-01-01" }), /cannot be before/);
});
