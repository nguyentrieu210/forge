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
const validScopes = new Set(["all", "backend", "desk"]);

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

if (!validScopes.has(scope)) {
  console.error(`Unknown ${action} scope '${scope}'. Use all, backend, or desk.`);
  process.exit(2);
}

if (!installed()) {
  // The repository must remain usable before the optional Windows services are
  // installed. In that mode the caller is responsible for its own process lifecycle.
  console.log(`ALUMDOOR_RUNTIME_SERVICES_ABSENT action=${action} scope=${scope}`);
  process.exit(0);
}

if (action === "on") {
  const payload = `maintenance requested ${new Date().toISOString()} pid=${process.pid}\n`;
  if (scope === "all" || scope === "backend") {
    mkdirSync(dirname(maintenanceFile), { recursive: true });
    writeFileSync(maintenanceFile, payload, "utf8");
  }
  if (scope === "all" || scope === "desk") {
    mkdirSync(dirname(deskMaintenanceFile), { recursive: true });
    writeFileSync(deskMaintenanceFile, payload, "utf8");
  }
  console.log(`ALUMDOOR_RUNTIME_MAINTENANCE_ON scope=${scope} backend=${maintenanceFile} desk=${deskMaintenanceFile}`);
  process.exit(0);
}

if (action === "off") {
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
