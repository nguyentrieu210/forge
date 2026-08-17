#!/usr/bin/env node

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const serviceHome = process.env.ALUMDOOR_SERVICE_HOME || "C:\\ForgeServices\\Alumdoor";
const maintenanceFile =
  process.env.ALUMDOOR_SERVICE_MAINTENANCE || `${serviceHome}\\maintenance.flag`;
const deskMaintenanceFile =
  process.env.ALUMDOOR_DESK_MAINTENANCE || `${serviceHome}\\desk-maintenance.flag`;

const action = (process.argv[2] || "status").toLowerCase();
const scope = (process.argv[3] || "all").toLowerCase();

function installed() {
  return existsSync(serviceHome);
}

function statusLine() {
  return `ALUMDOOR_RUNTIME_MAINTENANCE installed=${installed()} backend=${existsSync(maintenanceFile)} desk=${existsSync(deskMaintenanceFile)} home=${serviceHome}`;
}

if (action === "status") {
  console.log(statusLine());
  process.exit(0);
}

if (!installed()) {
  // The repository must remain usable before the optional Windows services are
  // installed. In that mode run-local.bat falls back to the existing console
  // launch path and stop-local-dev.mjs owns process cleanup.
  console.log(`ALUMDOOR_RUNTIME_SERVICES_ABSENT action=${action} scope=${scope}`);
  process.exit(0);
}

if (action === "on") {
  mkdirSync(dirname(maintenanceFile), { recursive: true });
  const payload = `maintenance requested ${new Date().toISOString()} pid=${process.pid}\n`;
  writeFileSync(maintenanceFile, payload, "utf8");
  writeFileSync(deskMaintenanceFile, payload, "utf8");
  console.log(`ALUMDOOR_RUNTIME_MAINTENANCE_ON backend=${maintenanceFile} desk=${deskMaintenanceFile}`);
  process.exit(0);
}

if (action === "off") {
  if (!["all", "backend", "desk"].includes(scope)) {
    console.error(`Unknown off scope '${scope}'. Use all, backend, or desk.`);
    process.exit(2);
  }
  if (scope === "all" || scope === "backend") {
    rmSync(maintenanceFile, { force: true });
  }
  if (scope === "all" || scope === "desk") {
    rmSync(deskMaintenanceFile, { force: true });
  }
  console.log(`ALUMDOOR_RUNTIME_MAINTENANCE_OFF scope=${scope}`);
  process.exit(0);
}

console.error(`Unknown action '${action}'. Use on, off, or status.`);
process.exit(2);
