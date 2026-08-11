#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileBrief } from "./lib/compile-brief.mjs";
import { readBriefSource } from "./lib/read-brief-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");

const DEFAULT_PLAN = path.join(serverRoot, "briefs", "alumdoor-ui-rec-02-navigation.plan.json");
const DEFAULT_BRIEF = path.join(serverRoot, "briefs", "alumdoor-v2.json");
const DEFAULT_ATTENDANCE = path.join(serverRoot, "apps-src", "alumdoor-attendance", "app.json");
const DEFAULT_OUTPUT = path.join(serverRoot, "briefs", "alumdoor-ui-rec-02-sidebar.json");

function fail(message) {
  throw new Error(`UI_REC_02_NAV: ${message}`);
}

function withGroup(item, group) {
  const next = { ...item, group };
  if ((next.kind ?? "doctype") === "doctype" && !next.permission_doctype) {
    next.permission_doctype = next.key;
  }
  return next;
}

function resolvePlannedItem(key, group, sources) {
  const existing = sources.currentNav.get(key);
  if (existing) return withGroup(existing, group);

  const attendance = sources.attendanceNav.get(key);
  if (attendance) return withGroup(attendance, group);

  const migrated = sources.plan.migrationMasters?.[key];
  if (migrated) {
    return {
      key,
      label: migrated.label ?? key,
      kind: "doctype",
      permission_doctype: migrated.permission_doctype ?? key,
      ...(migrated.icon ? { icon: migrated.icon } : {}),
      group,
    };
  }

  if (key.startsWith("action:")) {
    const name = key.slice("action:".length);
    const action = sources.actions.get(name);
    if (!action) fail(`planned action is not installed: ${key}`);
    return {
      key,
      label: action.label ?? name,
      kind: "experience",
      permission_doctype: action.permission_doctype,
      ...(action.icon ? { icon: action.icon } : {}),
      group,
    };
  }

  if (key.startsWith("report:")) {
    const name = key.slice("report:".length);
    const report = sources.reports.get(name);
    if (!report) fail(`planned report is not installed: ${key}`);
    return {
      key,
      label: report.label ?? name,
      kind: "route",
      permission_doctype: report.doctype,
      route: `/report/${encodeURIComponent(name)}`,
      icon: "bar-chart-3",
      group,
    };
  }

  const doctype = sources.doctypes.get(key);
  if (doctype) {
    if (doctype.is_child || doctype.kind === "child_table") fail(`child DocType cannot be navigable: ${key}`);
    return {
      key,
      label: doctype.label ?? key,
      kind: "doctype",
      permission_doctype: key,
      group,
    };
  }

  fail(`planned key is not backed by AlumDoor, attendance, action, report or migration metadata: ${key}`);
}

export async function buildAlumdoorUiRec02Sidebar(options = {}) {
  const planPath = path.resolve(options.planPath ?? DEFAULT_PLAN);
  const briefPath = path.resolve(options.briefPath ?? DEFAULT_BRIEF);
  const attendancePath = path.resolve(options.attendancePath ?? DEFAULT_ATTENDANCE);

  const [planRaw, brief, attendanceRaw] = await Promise.all([
    readFile(planPath, "utf8"),
    readBriefSource(briefPath),
    readFile(attendancePath, "utf8"),
  ]);
  const plan = JSON.parse(planRaw);
  const attendance = JSON.parse(attendanceRaw);
  const manifest = compileBrief(brief);

  if (manifest.id !== plan.id) fail(`plan targets ${plan.id}, compiled brief is ${manifest.id}`);
  if (manifest.version !== plan.baseVersion) {
    fail(`base version drift: plan=${plan.baseVersion}, compiled=${manifest.version}; re-audit before releasing navigation`);
  }
  if (!Array.isArray(plan.groupOrder) || !plan.groupOrder.length) fail("groupOrder is required");
  if (!plan.groups || typeof plan.groups !== "object") fail("groups are required");

  const declaredGroups = Object.keys(plan.groups);
  if (JSON.stringify(declaredGroups) !== JSON.stringify(plan.groupOrder)) {
    fail("groups must be declared in exactly groupOrder order");
  }

  const sources = {
    plan,
    currentNav: new Map((manifest.nav ?? []).map((item) => [item.key, item])),
    attendanceNav: new Map((attendance.nav ?? []).map((item) => [item.key, item])),
    doctypes: new Map((manifest.doctypes ?? []).map((doctype) => [doctype.name, doctype])),
    actions: new Map((manifest.actions ?? []).map((action) => [action.name, action])),
    reports: new Map((manifest.reports ?? []).map((report) => [report.name, report])),
  };

  const nav = [];
  const seen = new Set();
  for (const group of plan.groupOrder) {
    const keys = plan.groups[group];
    if (!Array.isArray(keys)) fail(`${group}: group definition must be an array`);
    for (const key of keys) {
      if (seen.has(key)) fail(`duplicate planned key: ${key}`);
      seen.add(key);
      nav.push(resolvePlannedItem(key, group, sources));
    }
  }

  for (const excluded of plan.excludedKeys ?? []) {
    if (seen.has(excluded)) fail(`superseded/internal key leaked into navigation: ${excluded}`);
  }
  for (const item of nav) {
    if ((item.kind ?? "doctype") !== "doctype") continue;
    const own = sources.doctypes.get(item.key);
    if (own?.is_child || own?.kind === "child_table") fail(`child DocType leaked into navigation: ${item.key}`);
  }

  return {
    id: plan.id,
    version: plan.version,
    nav,
  };
}

async function main() {
  const output = path.resolve(process.argv[2] ?? DEFAULT_OUTPUT);
  const result = await buildAlumdoorUiRec02Sidebar();
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    output,
    app: `${result.id}@${result.version}`,
    nav: result.nav.length,
    groups: [...new Set(result.nav.map((item) => item.group))],
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
