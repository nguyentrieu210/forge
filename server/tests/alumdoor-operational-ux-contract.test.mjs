import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { compileBrief } from "../scripts/lib/compile-brief-app-factory.mjs";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const briefPath = path.resolve(here, "../briefs/alumdoor-v2.json");
const shellPath = path.resolve(here, "../../client/packages/shell/src/WorkspaceAppShellV2.tsx");
const runtimeProfilePath = path.resolve(here, "../../client/apps/runtime/src/experience-registry.tsx");
const hrmPath = path.resolve(here, "../apps-src/hrm/app.json");

const STOCK_KEYS = [
  "Stock Entry",
  "action:de-xuat-lo-cat",
  "action:cat-nhom",
  "action:chot-so-so-kiem-ke",
  "Stock Reconciliation",
  "action:duyet-kiem-ke",
];

const MANUFACTURING_KEYS = [
  "action:don-hang-thanh-san-xuat",
  "Work Order",
  "action:lap-tai-san-xuat",
];

const DEBT_KEYS = ["Payment Entry"];

const WARRANTY_KEYS = [
  "action:mo-ho-so-bao-hanh",
  "Warranty Claim",
  "action:xac-nhan-bu-tru-bao-hanh",
];

const HR_KEYS = [
  "Employee",
  "Employment Contract",
  "Leave Application",
  "Attendance",
  "Employee Advance",
  "Additional Salary",
  "payroll-entry",
  "salary-slip",
  "Salary Bank Batch",
];

test("Alumdoor 2.3.1 exposes action-first operational strips beyond Sales and Purchase", async () => {
  const brief = await readBriefSource(briefPath);
  const pkg = compileBrief(brief);

  assert.equal(brief.version, "2.3.1");
  assert.equal(pkg.version, "2.3.1");

  const keysFor = (group) => pkg.nav.filter((entry) => entry.group === group).map((entry) => entry.key);
  assert.deepEqual(keysFor("Kho"), STOCK_KEYS);
  assert.deepEqual(keysFor("Sản xuất"), MANUFACTURING_KEYS);
  assert.deepEqual(keysFor("Công nợ"), DEBT_KEYS);
  assert.deepEqual(keysFor("Bảo hành"), WARRANTY_KEYS);

  const navByKey = new Map(pkg.nav.map((entry) => [entry.key, entry]));
  for (const hidden of [
    "Cut Order",
    "Stock Reservation",
    "Bill of Materials",
    "Production Standard",
    "action:hoan-cat",
    "action:tra-hang",
    "action:giu-cho",
    "action:nha-giu-cho",
  ]) assert.equal(navByKey.has(hidden), false, `${hidden} must stay installed but outside the daily strip`);

  for (const installed of ["hoan-cat", "tra-hang", "giu-cho", "nha-giu-cho"]) {
    assert.ok(pkg.actions.some((entry) => entry.name === installed), `${installed} remains directly callable`);
  }
  for (const installed of ["Cut Order", "Stock Reservation", "Bill of Materials", "Production Standard"]) {
    assert.ok(pkg.doctypes.some((entry) => entry.name === installed), `${installed} remains installed`);
  }
});

test("Operational report affinity is app-composition data, not shared-shell business knowledge", async () => {
  const [shell, profile] = await Promise.all([
    readFile(shellPath, "utf8"),
    readFile(runtimeProfilePath, "utf8"),
  ]);
  for (const [key, workspace] of [
    ["report:Stock Balance", "Kho"],
    ["report:Stock Ledger", "Kho"],
    ["report:Lệnh sản xuất theo mặt hàng", "Sản xuất"],
    ["report:Work Order Progress", "Sản xuất"],
    ["report:Công nợ theo khách hàng", "Công nợ"],
    ["report:Accounts Receivable", "Công nợ"],
    ["report:Accounts Payable", "Công nợ"],
  ]) {
    assert.ok(profile.includes(`"${key}": ["${workspace}"]`), `${key} must stay near ${workspace} in the app composition policy`);
    assert.equal(shell.includes(key), false, `${key} must not leak into the shared shell`);
  }
  assert.match(shell, /workspaceNavigationPolicy\?\.reportAffinities/);
});

test("Alumdoor projects core HR and payroll through app policy without shrinking shared HRM", async () => {
  const [shell, profile, hrmRaw] = await Promise.all([
    readFile(shellPath, "utf8"),
    readFile(runtimeProfilePath, "utf8"),
    readFile(hrmPath, "utf8"),
  ]);
  const hrm = JSON.parse(hrmRaw);
  const installedKeys = new Set(hrm.nav.map((entry) => entry.key));

  for (const key of HR_KEYS) assert.ok(installedKeys.has(key), `${key} must come from canonical HRM navigation`);
  assert.match(profile, /const ALUMDOOR_HR_WORKSPACE = "Nhân sự & Tiền lương"/);
  for (const key of HR_KEYS) {
    const encoded = /^[A-Za-z]+$/.test(key) ? `${key}: ALUMDOOR_HR_WORKSPACE` : `"${key}": ALUMDOOR_HR_WORKSPACE`;
    assert.ok(profile.includes(encoded), `${key} must be projected into the Alumdoor HR/payroll workspace`);
  }
  assert.equal(shell.includes("ALUMDOOR_HR_WORKSPACE"), false, "shared shell must not own the Alumdoor HR workspace");
  assert.equal(shell.includes("Nhân sự & Tiền lương"), false, "shared shell must stay vertical-neutral");

  const hrProjectionBlock = profile.slice(profile.indexOf("const ALUMDOOR_HR_GROUP_BY_KEY"), profile.indexOf("const ALUMDOOR_REPORT_WORKSPACES"));
  for (const excluded of ["Job Applicant", "Interview", "Appraisal", "Training Event", "Talent Pool"]) {
    assert.ok(installedKeys.has(excluded), `${excluded} remains installed in shared HRM`);
    assert.equal(hrProjectionBlock.includes(`"${excluded}"`), false, `${excluded} must not enter Alumdoor daily HR/payroll sidebar`);
  }
});
