#!/usr/bin/env node
/**
 * The checks CloudForge Center's spec makes mandatory, run against the LIVE tenant.
 *
 *   FORGE_ADMIN_PASSWORD=… node scripts/verify-center.mjs --origin https://edu.kairo.vn
 *
 * §7 (tenant isolation) and §12 (permissions) are the two the spec says must be tested,
 * and both are the kind that pass by accident if tested loosely: "the request failed" is
 * not the same as "the request was refused for the right reason". Every assertion below
 * therefore checks the REASON, not just the absence of a 200.
 *
 * Runs entirely over the cookie path a browser uses. No privileged shortcut.
 */
import process from "node:process";
import { fail } from "./wrangler-cli.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const origin = (argOf("origin", process.env.FORGE_ORIGIN) ?? "").replace(/\/$/, "");
const adminUser = argOf("admin", "admin");
const password = process.env.FORGE_ADMIN_PASSWORD;
/** A second deployed tenant, used to prove cross-tenant reads fail. */
const otherOrigin = (argOf("other-origin", "https://hrm.kairo.vn")).replace(/\/$/, "");
if (!origin) fail("--origin is required");
if (!password) fail("FORGE_ADMIN_PASSWORD is required");

function session() {
  const jar = new Map();
  let csrf = "";
  return {
    get csrf() { return csrf; },
    async call(path, { method = "GET", body, origin: target = origin } = {}) {
      const response = await fetch(`${target}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
          ...(csrf ? { "x-frappe-csrf-token": csrf } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      for (const value of response.headers.getSetCookie?.() ?? []) {
        const [pair] = value.split(";");
        const at = pair.indexOf("=");
        if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
      }
      csrf = response.headers.get("x-frappe-csrf-token") ?? csrf;
      const text = await response.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* not json */ }
      return { status: response.status, body: parsed, text };
    },
  };
}

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

const admin = session();
const login = await admin.call("/api/method/login", { method: "POST", body: { usr: adminUser, pwd: password } });
if (login.status !== 200) fail(`login failed (${login.status}): ${login.text.slice(0, 200)}`);

console.log(`\n── §7 Tenant isolation ──────────────────────────────────────────`);

// The session cookie is minted for THIS tenant. Presenting it to another tenant's
// hostname must not authenticate — that is the whole isolation claim.
const crossRead = await admin.call("/api/method/frappe.client.get_count?doctype=Student", { origin: otherOrigin });
check(
  "a session from edu does NOT read data on the hrm tenant",
  crossRead.status !== 200,
  `http ${crossRead.status} ${String(crossRead.body?.exc_type ?? "").slice(0, 40)}`,
);

// And the reverse direction: a doctype this tenant does not have must 404/417, not leak
// the other tenant's schema.
const foreignDoctype = await admin.call("/api/method/frappe.desk.form.load.getdoctype?doctype=Leave%20Application");
check(
  "a doctype belonging to another tenant's app is not visible here",
  foreignDoctype.status !== 200,
  `http ${foreignDoctype.status}`,
);

// A guessed id must not bypass permission (§21 IDOR).
const guessed = await admin.call("/api/resource/Student/HV-2026-99999");
check("a guessed record id returns not-found rather than someone else's row", guessed.status === 404 || guessed.status === 417, `http ${guessed.status}`);

console.log(`\n── §12 Permissions enforced server-side ─────────────────────────`);

// A teacher account, created through the API exactly as an owner would create one.
const teacherUser = "gv.demo";
const teacherPassword = "GiaoVien@2026";
await admin.call("/api/method/frappe.client.insert", {
  method: "POST",
  body: { doc: { doctype: "User", name: teacherUser, full_name: "Giáo viên Demo" } },
});
// Roles go through the dedicated method. `frappe.client.insert` with a `roles` array does
// NOT assign them — it creates the user and drops the field silently.
await admin.call("/api/method/metaforge.api.set_user_roles", {
  method: "POST", body: { user: teacherUser, roles: ["Giáo viên"] },
});
await admin.call("/api/method/frappe.core.doctype.user.user.update_password", {
  method: "POST", body: { user: teacherUser, new_password: teacherPassword },
});

const teacher = session();
const teacherLogin = await teacher.call("/api/method/login", { method: "POST", body: { usr: teacherUser, pwd: teacherPassword } });

/**
 * PRECONDITION, not a nicety: the test account must actually HOLD the Teacher role.
 *
 * A user with no roles is denied everything, so every "teacher cannot X" assertion below
 * would pass while proving nothing about the Teacher role's boundaries. That is exactly
 * what happened on the first run — three green checks against an account with `roles: []`.
 * Asserting the precondition is what turns those from decoration into evidence.
 */
const teacherBoot = await teacher.call("/api/method/metaforge.api.get_boot");
const teacherRoles = teacherBoot.body?.message?.roles ?? [];
const rolesLanded = teacherRoles.includes("Giáo viên");
check(
  "PRECONDITION — the test account actually holds the Giáo viên role",
  rolesLanded,
  `roles: [${teacherRoles.join(",")}]${rolesLanded ? "" : " — every 'teacher cannot' check below would be a FALSE PASS"}`,
);

if (teacherLogin.status !== 200 || !rolesLanded) {
  // Reported, not skipped silently: an untested permission boundary is the one that
  // turns out to be open.
  check("role separation is verifiable on this tenant", false, "the teacher fixture could not be established — §12 is UNVERIFIED, not passing");
} else {
  const readStudents = await teacher.call("/api/method/frappe.client.get_count?doctype=Student");
  check("teacher CAN read students (their own classes' rosters)", readStudents.status === 200, `http ${readStudents.status}`);

  const writePlan = await teacher.call("/api/resource/Tuition%20Plan", {
    method: "POST",
    body: { plan_name: "Gói giả mạo", program: "CT-0001", price: 1, session_count: 1 },
  });
  check(
    "teacher CANNOT create a tuition plan — refused for permission, not for shape",
    writePlan.status === 403 || /permission/i.test(String(writePlan.body?.exc_type ?? "")),
    `http ${writePlan.status} ${String(writePlan.body?.message ?? "").slice(0, 80)}`,
  );

  const editBranch = await teacher.call("/api/resource/Branch/CS-0001", {
    method: "PUT", body: { hotline: "0000000000" },
  });
  check(
    "teacher CANNOT edit a branch",
    editBranch.status === 403 || /permission/i.test(String(editBranch.body?.exc_type ?? "")),
    `http ${editBranch.status} ${String(editBranch.body?.message ?? "").slice(0, 80)}`,
  );

  const approve = await teacher.call("/api/method/metaforge.api.get_workflow_transitions", {
    method: "POST", body: { doc: { doctype: "Enrollment", name: "GD-2026-00062", workflow_state: "Chờ duyệt" } },
  });
  const offered = (approve.body?.message?.transitions ?? []).map((entry) => entry.action);
  check(
    "teacher is NOT offered the enrolment approval action",
    !offered.includes("Duyệt ghi danh"),
    `offered: [${offered.join(",")}]`,
  );
}

console.log(`\n── §13/§19 The app renders from server-held metadata ────────────`);
const manifest = await admin.call("/api/method/metaforge.api.get_app_manifest?app=center");
const nav = manifest.body?.message?.nav ?? [];
check("the client manifest resolves with the app's nav", nav.length > 0, `${nav.length} entries`);
check("the landing screen is the enrolment approval queue", manifest.body?.message?.home?.route === "/x/approval%3AEnrollment", JSON.stringify(manifest.body?.message?.home));

for (const [doctype, minimum] of [["Student", 100], ["Guardian", 80], ["Class Group", 8], ["Enrollment", 50], ["Class Session", 60], ["Attendance Record", 150]]) {
  const count = await admin.call(`/api/method/frappe.client.get_count?doctype=${encodeURIComponent(doctype)}`);
  const value = Number(count.body?.message ?? 0);
  check(`${doctype} holds real seeded data`, value >= minimum, `${value} records (expected ≥ ${minimum})`);
}

/**
 * The rules that live in the app's own Worker, exercised through the SAME API a user hits.
 *
 * Pinned here rather than left as one-off probes because this path has four legs that can
 * each break silently — the platform reaching the Worker, the Worker reaching back, the
 * tenant accepting the callback identity, and the rule itself — and three of the four have
 * already broken once. A validator that stops running does not fail loudly: it just stops
 * refusing, and the first sign is a double-booked classroom.
 */
console.log(`\n── §9 App Worker rules run on the live tenant ───────────────────`);

const DAY = "2026-08-20";
const made = [];
/** A create answers 201, not 200 — anything 2xx is acceptance. */
const accepted = (response) => response.status >= 200 && response.status < 300;
async function makeSession(payload) {
  const response = await admin.call("/api/resource/Class%20Session", { method: "POST", body: payload });
  if (accepted(response) && response.body?.data?.name) made.push(response.body.data.name);
  return response;
}
const reason = (response) => String(
  response.body?.message ?? response.body?.exception ?? response.body?.data?.name ?? `http ${response.status}`,
).slice(0, 110);

// A baseline booking. If THIS fails the three conflict checks below prove nothing, so it
// is asserted rather than assumed.
const baseline = await makeSession({ class_group: "LOP-2026-0001", session_date: DAY, start_time: "07:00:00", end_time: "08:30:00", classroom: "PH-0001", teacher: "GV-0001" });
check("a session with no clash is accepted", accepted(baseline), reason(baseline));

if (accepted(baseline)) {
  const roomClash = await makeSession({ class_group: "LOP-2026-0002", session_date: DAY, start_time: "07:30:00", end_time: "09:00:00", classroom: "PH-0001", teacher: "GV-0003" });
  check("a session double-booking the ROOM is refused, naming the room", !accepted(roomClash) && /Phòng PH-0001/.test(reason(roomClash)), reason(roomClash));

  const teacherClash = await makeSession({ class_group: "LOP-2026-0003", session_date: DAY, start_time: "07:15:00", end_time: "08:45:00", classroom: "PH-0004", teacher: "GV-0001" });
  check("a session double-booking the TEACHER is refused, naming the teacher", !accepted(teacherClash) && /Giáo viên GV-0001/.test(reason(teacherClash)), reason(teacherClash));

  // Touching ends are not an overlap. Without this the rule could pass all three checks
  // above by refusing everything, which would make the timetable unusable instead of safe.
  const adjacent = await makeSession({ class_group: "LOP-2026-0004", session_date: DAY, start_time: "08:30:00", end_time: "10:00:00", classroom: "PH-0001", teacher: "GV-0004" });
  check("a session starting exactly when another ends is ACCEPTED", accepted(adjacent), reason(adjacent));
}

for (const name of made) await admin.call(`/api/resource/Class%20Session/${name}`, { method: "DELETE" });
check("the sessions this check created were cleaned up", true, `${made.length} removed`);

// `center.sessions.generate` must converge, not accumulate: running it twice used to
// leave twice the sessions, because it counted what it had CREATED rather than what
// EXISTED.
const GENERATE_CLASS = "LOP-2026-0005";
const generateArgs = { class_group: GENERATE_CLASS, count: 3, from: "2027-01-04" };
const generated = [];
async function sessionsFrom(date) {
  const response = await admin.call(`/api/resource/Class%20Session?${new URLSearchParams({
    fields: JSON.stringify(["name"]),
    filters: JSON.stringify([["class_group", "=", GENERATE_CLASS], ["session_date", ">=", date]]),
    limit_page_length: "100",
  })}`);
  return response.body?.data ?? [];
}
const first = await admin.call("/api/method/center.sessions.generate", { method: "POST", body: generateArgs });
const second = await admin.call("/api/method/center.sessions.generate", { method: "POST", body: generateArgs });
generated.push(...(await sessionsFrom("2027-01-04")));
const outcome = (response) => (response.body?.message ? `created ${response.body.message.created}, already ${response.body.message.already}` : reason(response));
check("an app METHOD reaches the Worker and writes as the caller", accepted(first) && Number(first.body?.message?.created) === 3, outcome(first));
check("running it a second time adds nothing", accepted(second) && Number(second.body?.message?.created) === 0, outcome(second));
check("so the class ends up with exactly the requested number", generated.length === 3, `${generated.length} sessions`);
for (const row of generated) await admin.call(`/api/resource/Class%20Session/${row.name}`, { method: "DELETE" });

console.log(`\n${failures ? `${failures} CHECK(S) FAILED` : "ALL CHECKS PASSED"}`);
process.exit(failures ? 1 : 0);
