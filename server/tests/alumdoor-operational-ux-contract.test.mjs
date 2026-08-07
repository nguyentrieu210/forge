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

test("Alumdoor 2.3.2 keeps canonical operational capabilities after UI reset", async () => {
  const brief = await readBriefSource(briefPath);
  const pkg = compileBrief(brief);

  assert.equal(brief.version, "2.3.2");
  assert.equal(pkg.version, "2.3.2");

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

test("shared runtime has no Alumdoor report or workspace composition policy", async () => {
  const [shell, registry] = await Promise.all([
    readFile(shellPath, "utf8"),
    readFile(runtimeProfilePath, "utf8"),
  ]);

  for (const literal of [
    "report:Stock Balance",
    "report:Stock Ledger",
    "report:Lệnh sản xuất theo mặt hàng",
    "report:Work Order Progress",
    "report:Công nợ theo khách hàng",
    "report:Accounts Receivable",
    "report:Accounts Payable",
    "ALUMDOOR_HR_WORKSPACE",
    "Nhân sự & Tiền lương",
  ]) {
    assert.equal(registry.includes(literal), false, `${literal} must not be hard-coded in runtime registry`);
  }

  for (const literal of ["ALUMDOOR_HR_WORKSPACE", "Nhân sự & Tiền lương", "report:Stock Ledger"]) {
    assert.equal(shell.includes(literal), false, `${literal} must not leak into shared shell`);
  }
});

test("shared HRM remains complete without Alumdoor-specific runtime projection", async () => {
  const [registry, hrmRaw] = await Promise.all([
    readFile(runtimeProfilePath, "utf8"),
    readFile(hrmPath, "utf8"),
  ]);
  const hrm = JSON.parse(hrmRaw);
  const installedKeys = new Set(hrm.nav.map((entry) => entry.key));

  for (const key of HR_KEYS) assert.ok(installedKeys.has(key), `${key} must remain installed in canonical HRM`);
  for (const key of ["Job Applicant", "Interview", "Appraisal", "Training Event", "Talent Pool"]) {
    assert.ok(installedKeys.has(key), `${key} remains installed in shared HRM`);
  }

  assert.equal(registry.includes("ALUMDOOR_HR_GROUP_BY_KEY"), false);
  assert.equal(registry.includes("ALUMDOOR_REPORT_WORKSPACES"), false);
  assert.equal(registry.includes("workspaceNavigationPolicy"), false);
});
