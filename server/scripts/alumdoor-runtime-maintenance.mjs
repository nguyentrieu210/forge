#!/usr/bin/env node

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

const serviceHome = process.env.ALUMDOOR_SERVICE_HOME || "C:\\ForgeServices\\Alumdoor";
const maintenanceFile =
  process.env.ALUMDOOR_SERVICE_MAINTENANCE || `${serviceHome}\\maintenance.flag`;
const deskMaintenanceFile =
  process.env.ALUMDOOR_DESK_MAINTENANCE || `${serviceHome}\\desk-maintenance.flag`;

const action = (process.argv[2] || "status").toLowerCase();
const scope = (process.argv[3] || "all").toLowerCase();
const managedServices = ["ForgeAlumdoorBackend", "ForgeAlumdoorDesk"];

function installed() {
  return existsSync(serviceHome);
}

function statusLine() {
  return `ALUMDOOR_RUNTIME_MAINTENANCE installed=${installed()} backend=${existsSync(maintenanceFile)} desk=${existsSync(deskMaintenanceFile)} home=${serviceHome}`;
}

function recycleManagedServicesUnderMaintenance() {
  if (process.platform !== "win32") return;

  // The service hosts normally notice the flag and terminate their managed
  // children themselves. If a descendant (notably workerd) survives that
  // transition, the bootstrap runner cannot safely quiesce the D1 runtime.
  // Recycle only the two known WinSW services while the maintenance flags are
  // already present. On restart the hosts see maintenance immediately and do
  // not respawn Worker/Desk children until the matching flag is removed.
  const names = managedServices.map((name) => `'${name}'`).join(",");
  const script = [
    `$names=@(${names})`,
    "foreach($name in $names){",
    "  $svc=Get-Service -Name $name -ErrorAction SilentlyContinue",
    "  if(-not $svc){ continue }",
    "  if($svc.Status -ne 'Stopped') {",
    "    Stop-Service -Name $name -Force -ErrorAction Stop",
    "    (Get-Service -Name $name).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(30))",
    "  }",
    "  Start-Service -Name $name -ErrorAction Stop",
    "  (Get-Service -Name $name).WaitForStatus('Running',[TimeSpan]::FromSeconds(30))",
    "  Write-Output ('RECYCLED ' + $name)",
    "}",
  ].join("; ");

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) {
    const output = `${result.stderr || ""}${result.stdout || ""}`.trim();
    console.error(
      `ALUMDOOR_RUNTIME_MAINTENANCE_RECYCLE_FAILED ${output || `exit=${result.status}`}`,
    );
    process.exit(result.status || 1);
  }
  const evidence = String(result.stdout || "").trim().replace(/\r?\n/g, " | ");
  if (evidence) console.log(`ALUMDOOR_RUNTIME_MAINTENANCE_RECYCLE ${evidence}`);
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
  recycleManagedServicesUnderMaintenance();
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
