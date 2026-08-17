#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const root = process.env.ALUMDOOR_ROOT || "C:\\alumdoor";
const serviceHome = process.env.ALUMDOOR_SERVICE_HOME || "C:\\ForgeServices\\Alumdoor";
const maintenanceFile =
  process.env.ALUMDOOR_SERVICE_MAINTENANCE || `${serviceHome}\\maintenance.flag`;
const deskMaintenanceFile =
  process.env.ALUMDOOR_DESK_MAINTENANCE || `${serviceHome}\\desk-maintenance.flag`;
const pnpm = process.env.ALUMDOOR_PNPM || "pnpm";
const comspec = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";

const roleIndex = process.argv.indexOf("--role");
const role = roleIndex >= 0 ? process.argv[roleIndex + 1] : undefined;
if (!role || !["backend", "desk"].includes(role)) {
  console.error("Usage: alumdoor-runtime-service-host.mjs --role backend|desk");
  process.exit(2);
}

const config =
  role === "backend"
    ? {
        cwd: `${root}\\server`,
        command: `"${pnpm}" run dev:alumdoor-local`,
      }
    : {
        cwd: `${root}\\client\\apps\\runtime`,
        command: `set "VITE_FORGE_BACKEND=http://127.0.0.1:8799" && "${pnpm}" run dev`,
      };

let child = null;
let shuttingDown = false;
let stoppingChild = false;
let reconciling = false;

function maintenanceEnabled() {
  return existsSync(maintenanceFile) || (role === "desk" && existsSync(deskMaintenanceFile));
}

function killTree(pid) {
  if (!pid) return;
  const result = spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
    windowsHide: true,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const output = `${result.stderr || ""}${result.stdout || ""}`.trim();
    if (output && !/not found|no running instance|not exist/i.test(output)) {
      console.error(`[${role}] taskkill pid=${pid} failed: ${output}`);
    }
  }
}

function startChild() {
  if (shuttingDown || child || maintenanceEnabled()) return;
  if (!existsSync(config.cwd)) {
    console.error(`[${role}] working directory missing: ${config.cwd}`);
    return;
  }

  console.log(`[${role}] starting: ${config.command}`);
  const next = spawn(comspec, ["/d", "/s", "/c", config.command], {
    cwd: config.cwd,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  child = next;

  next.once("error", (error) => {
    console.error(`[${role}] spawn error: ${error.message}`);
  });
  next.once("exit", (code, signal) => {
    if (child === next) child = null;
    stoppingChild = false;
    console.log(`[${role}] child exit code=${code ?? "null"} signal=${signal ?? "none"}`);
  });
}

function stopChild(reason) {
  if (!child || stoppingChild) return;
  stoppingChild = true;
  console.log(`[${role}] stopping pid=${child.pid} reason=${reason}`);
  killTree(child.pid);
}

async function reconcile() {
  if (reconciling || shuttingDown) return;
  reconciling = true;
  try {
    if (maintenanceEnabled()) {
      stopChild("maintenance");
    } else if (!child) {
      startChild();
    }
  } finally {
    reconciling = false;
  }
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[${role}] service host shutting down signal=${signal}`);
  if (child) killTree(child.pid);
  setTimeout(() => process.exit(0), 100).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGHUP", () => shutdown("SIGHUP"));
process.on("exit", () => {
  if (child?.pid) killTree(child.pid);
});

console.log(
  `[${role}] service host ready root=${root} maintenance=${maintenanceFile} deskMaintenance=${deskMaintenanceFile} pnpm=${pnpm}`,
);
await reconcile();
setInterval(reconcile, 1000).unref();

// Keep the wrapper process alive even while maintenance mode intentionally has
// no child process running.
setInterval(() => {}, 60_000);
