import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BriefError, compileBrief, compileWorkflow, parseField, parsePermission } from "../scripts/lib/compile-brief.mjs";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";

/**
 * The brief compiler turns ~70 lines of description into a whole app. Two classes of test
 * matter here and they are different:
 *
 *   - the mini-language parses what it claims to (fields, permissions, workflows);
 *   - the DERIVED policy is safe by default. That second one is the point of compiling at
 *     all: separation of duties, read-implied rights, and a reachable landing screen are
 *     things a hand-written package gets wrong silently.
 */

const field = (input) => parseField(input, 0, "T");

// ---- field mini-language -----------------------------------------------------

test("a field carries its type, label and modifiers", () => {
  assert.deepEqual(field("lead_name:Data! Tên khách"), {
    fieldname: "lead_name", label: "Tên khách", fieldtype: "Data", required: true,
  });
  assert.deepEqual(field("serial_no:Data*"), {
    // No label given, so one is titleized rather than left blank.
    fieldname: "serial_no", label: "Serial No", fieldtype: "Data", unique: true,
  });
  assert.deepEqual(field("total:Currency~ Tổng"), {
    fieldname: "total", label: "Tổng", fieldtype: "Currency", read_only: true,
  });
});

test("a two-word type is not truncated to its first word", () => {
  // Splitting on the first space would read this as a type called "Small" — and Frappe has
  // enough two-word types that this is the common case, not an edge one.
  assert.equal(field("notes:Small Text Ghi chú").fieldtype, "Small Text");
  assert.equal(field("notes:Small Text Ghi chú").label, "Ghi chú");
  assert.equal(field("body:Text Editor Nội dung").fieldtype, "Text Editor");
  assert.equal(field("photo:Attach Image Ảnh").fieldtype, "Attach Image");
  // Longest match wins, or `Text Editor` would silently resolve to `Text` — a different
  // renderer AND different print escaping.
  assert.equal(field("note:Text Ghi chú").fieldtype, "Text");
});

test("Select options keep their internal spaces and become newline-separated", () => {
  const parsed = field("status:Select(Mới,Đang liên hệ,Đủ điều kiện) Trạng thái");
  assert.equal(parsed.options, "Mới\nĐang liên hệ\nĐủ điều kiện");
  assert.equal(parsed.label, "Trạng thái");
});

test("a default may contain spaces when parenthesised", () => {
  assert.equal(field("status:Select(Mới,Đang liên hệ)=(Đang liên hệ) Trạng thái").default, "Đang liên hệ");
  assert.equal(field("qty:Int=1 Số lượng").default, "1");
  // Without the parenthesis rule the label and the default are indistinguishable, and the
  // field would silently take the first word of its label as its value.
  assert.equal(field("status:Select(Mới,Đang liên hệ)=Mới Trạng thái").label, "Trạng thái");
});

test("a Link or Select with no options is refused", () => {
  // The two ways to produce a field that renders but can never hold a valid value.
  assert.throws(() => field("company:Link Công ty"), /needs options/);
  assert.throws(() => field("status:Select"), /needs options/);
});

test("unreadable fields are refused rather than guessed", () => {
  assert.throws(() => field("Bad_Name:Data"), /not a valid fieldname/);
  assert.throws(() => field("x:Whatever"), /unknown type "Whatever"/);
  assert.throws(() => field("x"), /has no type/);
  assert.throws(() => field("x:Data="), /"=" with no default/);
});

// ---- permissions -------------------------------------------------------------

test("reading implies the rights that follow from reading", () => {
  const permission = parsePermission("Sales", "rw", "T");
  // Withholding these is a specific, unusual policy; making it the default produces apps
  // whose print button silently does nothing.
  for (const right of ["print", "email", "report", "export"]) assert.equal(permission[right], true, right);
  assert.equal(permission.create, undefined);
});

test("a role with no read gets none of the read-implied rights", () => {
  const permission = parsePermission("Bot", "c", "T");
  assert.equal(permission.print, undefined);
  assert.equal(permission.create, true);
});

test("the delete letter is REFUSED, because there is no delete right to withhold", () => {
  // Deleting is a write-class action in this kernel. Accepting `d` would let an author
  // write "rwc" believing it withholds deletion when that role can in fact delete.
  assert.throws(() => parsePermission("Sales", "rwcd", "T"), /write-class action/);
  assert.throws(() => parsePermission("Sales", "rwq", "T"), /unknown letter "q"/);
});

// ---- workflow: the safe default ---------------------------------------------

const roles = new Set(["Nhân viên", "Quản lý"]);

test("self-approval is blocked by default on any transition that raises docstatus", () => {
  const workflow = compileWorkflow("Req", {
    states: { "Nháp": 0, "Chờ duyệt": 0, "Đã duyệt": 1 },
    transitions: [
      ["Nháp", "Gửi duyệt", "Chờ duyệt", "Nhân viên"],
      ["Chờ duyệt", "Duyệt", "Đã duyệt", "Quản lý"],
    ],
  }, roles, "T");
  const submit = workflow.transitions.find((entry) => entry.action === "Gửi duyệt");
  const approve = workflow.transitions.find((entry) => entry.action === "Duyệt");
  // Separation of duties is what an approval workflow is FOR; a hand-written workflow that
  // omits the flag silently lets the raiser approve their own request.
  assert.equal(approve.allow_self_approval, false);
  // Not applied where it means nothing: submitting your own draft is not self-approval,
  // and 0 → 0 does not raise docstatus.
  assert.equal(submit.allow_self_approval, undefined);
});

test("self-approval can be asked for explicitly, in writing", () => {
  const workflow = compileWorkflow("Req", {
    states: { "Chờ duyệt": 0, "Đã duyệt": 1 },
    transitions: [["Chờ duyệt", "Duyệt", "Đã duyệt", "Quản lý", "self"]],
  }, roles, "T");
  assert.equal(workflow.transitions[0].allow_self_approval, true);
});

test("a workflow that cannot work is refused", () => {
  const build = (overrides) => compileWorkflow("Req", { states: { "A": 0, "B": 1 }, transitions: [["A", "Go", "B", "Quản lý"]], ...overrides }, roles, "T");
  assert.throws(() => build({ transitions: [["A", "Go", "Z", "Quản lý"]] }), /enters undefined state "Z"/);
  assert.throws(() => build({ transitions: [["Z", "Go", "B", "Quản lý"]] }), /leaves undefined state "Z"/);
  assert.throws(() => build({ transitions: [["A", "Go", "B", "Ai đó"]] }), /which the brief does not declare/);
  assert.throws(() => build({ transitions: [] }), /at least one transition/);
  assert.throws(() => build({ states: { "A": 7 } }), /must be 0 \(draft\), 1 \(submitted\) or 2 \(cancelled\)/);
});

// ---- whole brief -------------------------------------------------------------

const minimal = () => ({
  id: "crm", name: "CRM",
  doctypes: [{
    name: "Lead",
    fields: ["lead_name:Data! Tên"],
    permissions: { "Sales": "rwc" },
  }],
});

test("a minimal brief compiles into a package the server accepts", () => {
  const pkg = compileBrief(minimal());
  // The server's own parser, so a brief that compiles cannot fail install for shape.
  const manifest = parseAppManifest(pkg);
  assert.equal(manifest.id, "crm");
  assert.equal(manifest.doctypes.length, 1);
  assert.deepEqual(manifest.roles, [{ role: "Sales", desk_access: true }]);
  // Home falls back to the only nav entry rather than being left unset.
  assert.deepEqual(manifest.client.home, { doctype: "Lead" });
  // No dimensions unless asked for: an app given the default set blocks on a scope
  // selector it never uses.
  assert.deepEqual(manifest.client.dimensions, []);
});

test("a child doctype is installed but never exposed as a standalone menu item", () => {
  const brief = minimal();
  brief.doctypes.push({
    name: "Lead Item",
    child: true,
    fields: ["description:Data! Nội dung"],
    permissions: { Sales: "rwc" },
  });
  const pkg = compileBrief(brief);
  const child = pkg.doctypes.find((doctype) => doctype.name === "Lead Item");
  assert.equal(child.is_child, true);
  assert.deepEqual(pkg.nav.map((item) => item.key), ["Lead"]);
  assert.doesNotThrow(() => parseAppManifest(pkg));
});

test("a role named only in a permissions map is still declared", () => {
  // Otherwise every role has to be written twice, and the DocPerm that names an
  // undeclared role matches nobody.
  const pkg = compileBrief(minimal());
  assert.deepEqual(pkg.roles.map((role) => role.role), ["Sales"]);
});

test("a workflow adds its own read-only state field", () => {
  const brief = minimal();
  brief.doctypes[0].workflow = { states: { "Nháp": 0, "Xong": 1 }, transitions: [["Nháp", "Xong", "Xong", "Sales"]] };
  brief.doctypes[0].list = ["lead_name", "workflow_state"];
  const pkg = compileBrief(brief);
  const state = pkg.doctypes[0].fields.find((entry) => entry.fieldname === "workflow_state");
  assert.ok(state, "the state field is added, not demanded from the author");
  assert.equal(state.fieldtype, "Select");
  assert.equal(state.options, "Nháp\nXong");
  // A form that lets a user pick the state directly bypasses every transition rule.
  assert.equal(state.read_only, true);
  // Added before validation, so `list` may name it without declaring it twice.
  assert.equal(state.in_list_view, true);
  // A workflow with a submitted state makes the doctype submittable, or submit can never
  // happen and the transition is dead.
  assert.equal(pkg.doctypes[0].is_submittable, true);
});

test("a workflow gives the doctype an operational inbox, and it becomes home", () => {
  const brief = minimal();
  brief.doctypes[0].workflow = { states: { "Nháp": 0, "Xong": 1 }, transitions: [["Nháp", "Xong", "Xong", "Sales"]] };
  const pkg = compileBrief(brief);
  assert.deepEqual(pkg.nav.map((item) => item.key), ["approval:Lead", "Lead"]);
  // The encoded route, computed rather than hand-written: getting `%3A` wrong is a
  // redirect loop nobody spots by reading.
  assert.deepEqual(pkg.client.home, { route: "/x/approval%3ALead" });
  assert.doesNotThrow(() => parseAppManifest(pkg));
});

test("an explicit home must name a nav entry that exists", () => {
  const brief = { ...minimal(), home: "Nothing" };
  assert.throws(() => compileBrief(brief), /does not match any nav key/);
  assert.deepEqual(compileBrief({ ...minimal(), home: "Lead" }).client.home, { doctype: "Lead" });
});

test("a brief that names fields it does not define is refused", () => {
  const bad = (patch) => () => compileBrief({ ...minimal(), doctypes: [{ ...minimal().doctypes[0], ...patch }] });
  assert.throws(bad({ list: ["nope"] }), /list names "nope"/);
  assert.throws(bad({ title: "nope" }), /title "nope" is not a field/);
  assert.throws(bad({ search: ["nope"] }), /search names "nope"/);
});

test("a brief with nothing to show is refused", () => {
  assert.throws(() => compileBrief({ id: "x", name: "X", doctypes: [] }), /at least one doctype/);
  assert.throws(() => compileBrief({ id: "X", name: "X", doctypes: [{}] }), /lowercase letters/);
  assert.throws(() => compileBrief({ id: "x", doctypes: [{}] }), /name is required/);
  // A doctype nobody may read is invisible; better to say so than to install it.
  assert.throws(() => compileBrief({ id: "x", name: "X", roles: ["A"], doctypes: [{ name: "D", fields: ["a:Data"] }] }), /needs a permissions map/);
  assert.ok(new BriefError("x") instanceof Error);
});

// ---- the shipped brief -------------------------------------------------------

test("the assets brief in briefs/ compiles and validates, so it cannot rot unnoticed", async () => {
  const brief = JSON.parse(await readFile(new URL("../briefs/assets.json", import.meta.url), "utf8"));
  const manifest = parseAppManifest(compileBrief(brief));
  assert.equal(manifest.id, "assets");
  assert.equal(manifest.doctypes.length, 2);
  assert.equal(manifest.workflows.length, 1);
  // The approving transition blocks self-approval — the one property of this app that
  // would be a real control failure if it regressed.
  const approve = manifest.workflows[0].transitions.find((entry) => entry.action === "Duyệt");
  assert.equal(approve.allow_self_approval, false);
});

test("every doctype gets a System Manager row, so the UI agrees with the server", () => {
  // The server lets a System Manager write anything; the client decides editability from
  // DocPerm rows alone. Without this row the two disagree, and the visible result is a
  // create form whose every field is read-only while the API accepts the same document.
  const pkg = compileBrief(minimal());
  const admin = pkg.doctypes[0].permissions.find((entry) => entry.role === "System Manager");
  assert.ok(admin, "System Manager row is added even though the brief never mentions it");
  for (const right of ["read", "write", "create", "submit", "cancel", "amend"]) assert.equal(admin[right], true, right);
  // Read-implied rights come along too, so the print and export buttons work for an admin.
  for (const right of ["print", "email", "report", "export"]) assert.equal(admin[right], true, right);
});

test("a brief that names System Manager itself is left alone", () => {
  // An author narrowing the platform admin deliberately must not be silently overridden.
  const brief = minimal();
  brief.doctypes[0].permissions = { Sales: "rwc", "System Manager": "r" };
  const admin = compileBrief(brief).doctypes[0].permissions.filter((entry) => entry.role === "System Manager");
  assert.equal(admin.length, 1, "exactly one row, not a duplicate");
  assert.equal(admin[0].write, undefined);
});

// ---- thao tác dạng form (actions) --------------------------------------------

/**
 * Một action là MÀN HÌNH khai bằng dữ liệu. Nó chạy method ghi thật, nên mỗi phép thử dưới
 * đây chốt một cách nó có thể hỏng mà không ai thấy: mục menu mở màn không dựng được,
 * một nút gọi method không có Worker nào phục vụ, hay một màn không có chốt quyền nào.
 */
const withAction = (patch = {}) => ({
  ...minimal(),
  worker: "cloudforge-app-crm",
  actions: [{
    name: "gui-bao-gia",
    label: "Gửi báo giá",
    permission: "Lead",
    fields: ["lead:Link(Lead)! Khách", "amount:Currency! Số tiền"],
    preview: "crm.quote.preview | Xem trước",
    commit: "crm.quote.send | Gửi | Gửi báo giá cho khách?",
    resultTable: "lines",
    ...patch,
  }],
});

test("action biên dịch thành màn hình + mục menu, và server nhận", () => {
  const manifest = parseAppManifest(compileBrief(withAction()));
  assert.equal(manifest.actions.length, 1);
  const action = manifest.actions[0];
  assert.equal(action.commit.method, "crm.quote.send");
  assert.equal(action.commit.confirm, "Gửi báo giá cho khách?");
  assert.equal(action.preview.label, "Xem trước");
  assert.equal(action.result_table, "lines");
  // Field dùng chung ngôn ngữ với field của doctype — không có cú pháp thứ hai.
  assert.deepEqual(action.fields[0], { fieldname: "lead", label: "Khách", fieldtype: "Link", options: "Lead", required: true });

  // Mục menu lấy chốt quyền TỪ CHÍNH action, nên menu và màn không thể lệch nhau.
  const nav = manifest.nav.find((item) => item.key === "action:gui-bao-gia");
  assert.equal(nav.kind, "experience");
  assert.equal(nav.permission_doctype, "Lead");
});

test("action không có Worker bị TỪ CHỐI — nút bấm sẽ chỉ trả 404", () => {
  const brief = withAction();
  delete brief.worker;
  assert.throws(() => compileBrief(brief), /actions.*worker|worker.*action/i);
});

test("action chặn quyền theo doctype app không khai thì bị từ chối", () => {
  // Chốt không đánh giá được nghĩa là màn hoặc mở cho tất cả, hoặc không cho ai — im lặng cả hai.
  assert.throws(() => compileBrief(withAction({ permission: "Khong Ton Tai" })), /không khai/);
});

test("action không có ô nhập nào, hoặc không có nút chạy, đều bị từ chối", () => {
  assert.throws(() => compileBrief(withAction({ fields: [] })), /ô nhập/);
  const noCommit = withAction();
  delete noCommit.actions[0].commit;
  assert.throws(() => compileBrief(noCommit), /commit/);
});

test("nav trỏ tới action không tồn tại bị server từ chối", () => {
  // Không phải chuyện thẩm mỹ: mục menu cài sạch rồi mở ra một màn không dựng được.
  const pkg = compileBrief(withAction());
  pkg.nav.push({ key: "action:khong-co", label: "Ma", kind: "experience" });
  assert.throws(() => parseAppManifest(pkg), /does not declare/);
});
