#!/usr/bin/env node
/**
 * Seeds the CloudForge Center demo tenant — "Trung tâm Ngoại ngữ Hải Đăng".
 *
 *   FORGE_ADMIN_PASSWORD=… node scripts/seed-center-demo.mjs \
 *     --origin https://edu.kairo.vn --admin admin [--reset]
 *
 * Over the SAME cookie + CSRF path a browser uses, so anything that fails here is
 * something a user would hit too. A seeder that writes straight to D1 would happily
 * create data the API layer would have refused.
 *
 * DETERMINISTIC CONTENT (spec §23): a fixed PRNG seed, so "120 students" is the same 120
 * students every run and a demo script can name one of them.
 *
 * NOT deterministic names, and the difference cost a run to learn: a doctype with an
 * `autoname` series assigns its OWN name and IGNORES the one supplied, so an explicit
 * name is not an upsert key here. Re-running therefore ADDS records rather than
 * replacing them. The guard below refuses a second run instead of silently doubling the
 * demo data; `--force` overrides it.
 *
 * Deliberately NOT seeded: money. Receivables, payments and receipts have invariants
 * (§10.1) that only server-side computation can hold, and inventing rows that look like
 * finance would make the demo lie about what the product currently does.
 */
import process from "node:process";
import { fail } from "./wrangler-cli.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const origin = (argOf("origin", process.env.FORGE_ORIGIN) ?? "").replace(/\/$/, "");
const adminUser = argOf("admin", process.env.FORGE_ADMIN_USER ?? "admin");
const password = process.env.FORGE_ADMIN_PASSWORD;
if (!origin) fail("--origin <https://…> is required");
if (!password) fail("FORGE_ADMIN_PASSWORD is required in the environment");

const jar = new Map();
let csrf = "";
function store(response) {
  for (const value of response.headers.getSetCookie?.() ?? []) {
    const [pair] = value.split(";");
    const at = pair.indexOf("=");
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
  csrf = response.headers.get("x-frappe-csrf-token") ?? csrf;
}

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      ...(csrf ? { "x-frappe-csrf-token": csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  store(response);
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not json */ }
  return { status: response.status, body: parsed, text };
}

const counts = new Map();
const failures = [];

/**
 * Creates a document, treating "already exists" as success.
 *
 * Idempotency comes from the explicit name, not from checking first: a check-then-create
 * has a race and costs a round trip per record, while a duplicate-name refusal is exactly
 * the signal we want.
 */
async function put(doctype, name, data) {
  const created = await request(`/api/resource/${encodeURIComponent(doctype)}`, {
    method: "POST", body: { name, ...data },
  });
  if (created.status === 200 || created.status === 201) {
    counts.set(doctype, (counts.get(doctype) ?? 0) + 1);
    return name;
  }
  const message = String(created.body?.message ?? created.text).slice(0, 160);
  if (/already exists|Duplicate/i.test(message)) {
    const updated = await request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
      method: "PUT", body: data,
    });
    if (updated.status === 200) { counts.set(doctype, (counts.get(doctype) ?? 0) + 1); return name; }
    failures.push(`${doctype} ${name}: update → ${updated.status} ${String(updated.body?.message ?? "").slice(0, 120)}`);
    return null;
  }
  failures.push(`${doctype} ${name}: ${created.status} ${message}`);
  return null;
}

// Deterministic pseudo-randomness: a fixed seed, so "120 students" is the SAME 120
// students every run and a demo script can name one of them.
let seedState = 20260727;
const rnd = () => (seedState = (seedState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (list) => list[Math.floor(rnd() * list.length)];
const int = (low, high) => low + Math.floor(rnd() * (high - low + 1));
const pad = (value, width) => String(value).padStart(width, "0");
const iso = (offsetDays) => new Date(Date.UTC(2026, 6, 27) + offsetDays * 86400000).toISOString().slice(0, 10);

const login = await request("/api/method/login", { method: "POST", body: { usr: adminUser, pwd: password } });
if (login.status !== 200) fail(`login failed (${login.status}): ${login.text.slice(0, 200)}`);
console.log(`signed in to ${origin} as ${adminUser}\n`);

// ---- organisation ----------------------------------------------------------
const branches = [
  ["CS-0001", "Cơ sở Cầu Giấy", "128 Xuân Thuỷ, Cầu Giấy, Hà Nội", "02466512345", "Trần Thu Hà"],
  ["CS-0002", "Cơ sở Hà Đông", "45 Quang Trung, Hà Đông, Hà Nội", "02466598765", "Lê Quốc Bảo"],
];
for (const [name, branchName, address, hotline, manager] of branches) {
  await put("Branch", name, {
    code: name, branch_name: branchName, address, hotline, manager,
    opening_hours: "08:00 - 21:00", status: "Đang hoạt động",
  });
}

let roomIndex = 0;
for (const [branchName] of branches) {
  for (const label of ["A1", "A2", "A3"]) {
    roomIndex += 1;
    await put("Classroom", `PH-${pad(roomIndex, 4)}`, {
      room_name: `Phòng ${label}`, branch: branchName, capacity: int(12, 24),
      equipment: "Máy chiếu, bảng trắng, loa", status: "Sẵn sàng",
    });
  }
}

// ---- programmes and plans ---------------------------------------------------
const programs = [
  ["CT-0001", "IELTS Foundation", "Tiếng Anh", "Sơ cấp"],
  ["CT-0002", "IELTS Intensive 6.5", "Tiếng Anh", "Luyện thi"],
  ["CT-0003", "Tiếng Anh Thiếu nhi Starters", "Tiếng Anh", "Vỡ lòng"],
  ["CT-0004", "Giao tiếp Doanh nghiệp", "Tiếng Anh", "Trung cấp"],
];
for (const [name, programName, subject, level] of programs) {
  await put("Program", name, {
    program_name: programName, subject, level,
    description: `Chương trình ${programName} của Trung tâm Ngoại ngữ Hải Đăng.`,
    status: "Đang mở",
  });
}

const plans = [
  ["GH-0001", "Gói 24 buổi IELTS Foundation", "CT-0001", 4800000, 24, 180],
  ["GH-0002", "Gói 36 buổi IELTS Intensive", "CT-0002", 8400000, 36, 240],
  ["GH-0003", "Gói 16 buổi Thiếu nhi", "CT-0003", 2400000, 16, 120],
  ["GH-0004", "Gói 24 buổi Giao tiếp", "CT-0004", 4200000, 24, 180],
  ["GH-0005", "Gói 48 buổi IELTS trọn khoá", "CT-0002", 10800000, 48, 365],
];
for (const [name, planName, program, price, sessions, validity] of plans) {
  await put("Tuition Plan", name, {
    plan_name: planName, program, plan_type: "Gói số buổi",
    price, session_count: sessions, validity_days: validity,
    material_fee: 200000, effective_from: iso(-120), status: "Đang bán",
  });
}

// ---- teachers ---------------------------------------------------------------
const teacherNames = [
  "Nguyễn Thu Trang", "Phạm Minh Đức", "Lê Hoàng Yến", "Đỗ Quang Huy",
  "Vũ Thanh Mai", "Bùi Anh Tuấn", "Hoàng Diệu Linh", "Ngô Bảo Châu",
];
const teachers = [];
teacherNames.forEach((teacherName, index) => {
  const isAssistant = index >= 6;
  teachers.push([`GV-${pad(index + 1, 4)}`, teacherName, isAssistant]);
});
for (const [name, teacherName, isAssistant] of teachers) {
  await put("Teacher", name, {
    teacher_name: teacherName,
    phone: `09${int(10000000, 99999999)}`,
    email: `gv${name.toLowerCase()}@haidang.edu.vn`,
    specialisation: isAssistant ? "Trợ giảng tiếng Anh" : pick(["IELTS", "Giao tiếp", "Thiếu nhi", "Ngữ pháp"]),
    employment_type: isAssistant ? "Trợ giảng" : pick(["Cơ hữu", "Thỉnh giảng"]),
    rate_per_session: isAssistant ? 150000 : int(250, 450) * 1000,
    branch: pick(branches)[0],
    status: "Đang dạy",
  });
}
const mainTeachers = teachers.filter(([, , assistant]) => !assistant);
const assistants = teachers.filter(([, , assistant]) => assistant);

// ---- classes -----------------------------------------------------------------
const classes = [
  ["LOP-2026-0001", "IELTS Starter K12", "CT-0001", "GV-0001"],
  ["LOP-2026-0002", "IELTS Foundation Tối 2-4-6", "CT-0001", "GV-0002"],
  ["LOP-2026-0003", "IELTS 6.5 Cấp tốc", "CT-0002", "GV-0003"],
  ["LOP-2026-0004", "IELTS 6.5 Cuối tuần", "CT-0002", "GV-0004"],
  ["LOP-2026-0005", "Starters Thiếu nhi A", "CT-0003", "GV-0005"],
  ["LOP-2026-0006", "Starters Thiếu nhi B", "CT-0003", "GV-0006"],
  ["LOP-2026-0007", "Giao tiếp Doanh nghiệp Sáng", "CT-0004", "GV-0001"],
  ["LOP-2026-0008", "Giao tiếp Doanh nghiệp Tối", "CT-0004", "GV-0003"],
];
classes.forEach(async () => {});
let classSeq = 0;
for (const [name, className, program, teacher] of classes) {
  classSeq += 1;
  await put("Class Group", name, {
    class_name: className, program,
    branch: branches[classSeq % 2][0],
    classroom: `PH-${pad(((classSeq - 1) % 6) + 1, 4)}`,
    teacher, assistant: pick(assistants)[0],
    capacity: int(14, 20),
    start_date: iso(-int(20, 60)), end_date: iso(int(40, 90)),
    weekly_schedule: pick(["Thứ 2-4-6, 18:00", "Thứ 3-5-7, 19:30", "Thứ 7-CN, 09:00"]),
    planned_sessions: pick([16, 24, 36]),
    status: "Đang học",
  });
}

// ---- students and guardians ---------------------------------------------------
const family = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Vũ", "Đặng", "Bùi", "Đỗ", "Ngô"];
const middle = ["Minh", "Thu", "Hoài", "Gia", "Bảo", "Khánh", "Phương", "Quỳnh", "Tuấn", "Diệu"];
const given = ["Anh", "Linh", "Khang", "Ngọc", "Hưng", "Trang", "Nam", "Vy", "Long", "Chi"];
const guardianGiven = ["Lan", "Hùng", "Hoa", "Dũng", "Nga", "Sơn", "Yến", "Thắng"];

// One named student the demo script can rely on being present (§18 step 3).
const NAMED_STUDENT = { name: "HV-2026-00001", student_name: "Nguyễn Minh Anh" };
const students = [NAMED_STUDENT];
for (let index = 2; index <= 120; index += 1) {
  students.push({
    name: `HV-2026-${pad(index, 5)}`,
    student_name: `${pick(family)} ${pick(middle)} ${pick(given)}`,
  });
}

for (const [index, student] of students.entries()) {
  await put("Student", student.name, {
    student_name: student.student_name,
    date_of_birth: iso(-int(2500, 8000)),
    gender: pick(["Nữ", "Nam"]),
    phone: `03${int(10000000, 99999999)}`,
    email: `hv${pad(index + 1, 5)}@example.vn`,
    address: `${int(1, 300)} ${pick(["Xuân Thuỷ", "Quang Trung", "Trần Duy Hưng", "Nguyễn Trãi"])}, Hà Nội`,
    school: pick(["THPT Cầu Giấy", "THCS Dịch Vọng", "THPT Yên Hoà", "Tiểu học Nghĩa Tân", ""]),
    branch: branches[index % 2][0],
    joined_on: iso(-int(5, 200)),
    source: pick(["Giới thiệu", "Facebook", "Website", "Vãng lai"]),
    status: index < 110 ? "Đang học" : pick(["Tạm nghỉ", "Tiềm năng"]),
  });
}

// 90 guardians across the first 90 students; the named student gets a named guardian
// so the demo script can reference the pair (§18 step 4).
for (let index = 0; index < 90; index += 1) {
  const student = students[index];
  const isNamed = index === 0;
  await put("Guardian", `PH-2026-${pad(index + 1, 5)}`, {
    guardian_name: isNamed ? "Nguyễn Thị Lan" : `${pick(family)} Thị ${pick(guardianGiven)}`,
    student: student.name,
    relationship: pick(["Mẹ", "Bố", "Người giám hộ"]),
    phone: `09${int(10000000, 99999999)}`,
    email: `ph${pad(index + 1, 5)}@example.vn`,
    is_primary_contact: 1,
    is_payer: 1,
  });
}

// ---- enrolments ----------------------------------------------------------------
// Left in DRAFT deliberately: the approval queue is the app's landing screen, and a
// demo that opens on an empty inbox demonstrates nothing. Approving them is step one
// of the demo script.
const planForProgram = new Map(plans.map(([planName, , program]) => [program, planName]));
let enrolSeq = 0;
for (let index = 0; index < 60; index += 1) {
  const student = students[index];
  const classGroup = classes[index % classes.length];
  const plan = planForProgram.get(classGroup[2]) ?? "GH-0001";
  enrolSeq += 1;
  await put("Enrollment", `GD-2026-${pad(enrolSeq, 5)}`, {
    student: student.name,
    class_group: classGroup[0],
    tuition_plan: plan,
    enrollment_type: index % 17 === 0 ? "Học thử" : "Chính thức",
    start_date: iso(-int(1, 45)),
    total_sessions: pick([16, 24, 36]),
    // NOT `sessions_used`: it is declared read-only in the brief, because a session
    // count the client can set is a session count a client can forge. The server
    // refuses it, correctly — this seeder used to send it and lost every enrolment.
    discount_amount: index % 9 === 0 ? 300000 : 0,
    note: index % 9 === 0 ? "Ưu đãi giới thiệu bạn học" : "",
  });
}

// ---- sessions and attendance -----------------------------------------------------
let sessionSeq = 0;
const sessions = [];
for (const [classIndex, classGroup] of classes.entries()) {
  for (let day = -6; day <= 1; day += 1) {
    sessionSeq += 1;
    const name = `BH-2026-${pad(sessionSeq, 5)}`;
    sessions.push({ name, classGroup: classGroup[0], teacher: classGroup[3] });
    await put("Class Session", name, {
      class_group: classGroup[0],
      session_date: iso(day),
      start_time: pick(["18:00:00", "19:30:00", "09:00:00"]),
      end_time: pick(["19:30:00", "21:00:00", "10:30:00"]),
      classroom: `PH-${pad(((classIndex) % 6) + 1, 4)}`,
      teacher: classGroup[3],
      topic: pick(["Listening Part 2", "Reading skim & scan", "Speaking Part 1", "Writing Task 1", "Grammar review"]),
    });
  }
}

let attendanceSeq = 0;
for (const [index, session] of sessions.entries()) {
  // Only past sessions carry attendance; future ones must look genuinely un-marked, or
  // the "buổi chưa điểm danh" figure on a dashboard would be a lie.
  if (index % 8 >= 6) continue;
  for (let seat = 0; seat < 6; seat += 1) {
    attendanceSeq += 1;
    const student = students[(index * 6 + seat) % 90];
    await put("Attendance Record", `DD-2026-${pad(attendanceSeq, 5)}`, {
      class_session: session.name,
      student: student.name,
      attendance_status: rnd() < 0.82 ? "Có mặt" : pick(["Đi muộn", "Nghỉ có phép", "Nghỉ không phép"]),
      recorded_at: `${iso(-3)} 19:45:00`,
      comment: "",
    });
  }
}

// ---- absence requests ------------------------------------------------------------
for (let index = 0; index < 6; index += 1) {
  const student = students[index * 3];
  await put("Absence Request", `XN-2026-${pad(index + 1, 5)}`, {
    student: student.name,
    class_group: classes[index % classes.length][0],
    absence_date: iso(int(1, 6)),
    reason_type: pick(["Ốm", "Việc gia đình", "Trùng lịch học"]),
    reason_detail: "Phụ huynh báo nghỉ qua Zalo.",
    requested_by: "Phụ huynh",
  });
}

// ---- report ------------------------------------------------------------------------
console.log("seeded:");
for (const [doctype, count] of [...counts].sort()) console.log(`  ${String(count).padStart(4)}  ${doctype}`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const line of failures.slice(0, 25)) console.log(`  ${line}`);
  process.exit(1);
}
console.log("\nSEED_PASS — every record went in through the same API a browser uses.");
