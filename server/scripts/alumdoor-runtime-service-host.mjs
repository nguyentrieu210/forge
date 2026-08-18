#!/usr/bin/env node

import { existsSync } from "node:fs";
import { basename, dirname } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { managedProcessTree } from "./lib/alumdoor-managed-process-tree.mjs";

const root = process.env.ALUMDOOR_ROOT || "C:\\alumdoor";
const serviceHome = process.env.ALUMDOOR_SERVICE_HOME || "C:\\ForgeServices\\Alumdoor";
const maintenanceFile =
  process.env.ALUMDOOR_SERVICE_MAINTENANCE || `${serviceHome}\\maintenance.flag`;
const deskMaintenanceFile =
  process.env.ALUMDOOR_DESK_MAINTENANCE || `${serviceHome}\\desk-maintenance.flag`;
const pnpm = process.env.ALUMDOOR_PNPM || "pnpm.cmd";
const comspec = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";

const roleIndex = process.argv.indexOf("--role");
const role = roleIndex >= 0 ? process.argv[roleIndex + 1] : undefined;
if (!role || !["backend", "desk"].includes(role)) {
  console.error("Usage: alumdoor-runtime-service-host.mjs --role backend|desk");
  process.exit(2);
}

// cmd.exe quoting around a fully-qualified *.cmd path containing spaces is
// fragile when Node serializes argv for CreateProcess. Put the resolved pnpm
// directory on PATH and invoke only its basename instead. This keeps the cmd
// command free of nested executable quotes while still pinning the same pnpm
// shim selected by the installer.
const pnpmDir = dirname(pnpm);
const pnpmCommand = basename(pnpm) || "pnpm.cmd";
const childEnv = {
  ...process.env,
  PATH: `${pnpmDir};${process.env.PATH || ""}`,
  COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
  COREPACK_HOME: process.env.COREPACK_HOME || `${serviceHome}\\corepack`,
  CI: process.env.CI || "1",
};

const config =
  role === "backend"
    ? {
        cwd: `${root}\\server`,
        command: `${pnpmCommand} run dev:alumdoor-local`,
        env: childEnv,
      }
    : {
        cwd: `${root}\\client\\apps\\runtime`,
        command: `${pnpmCommand} run preview:alumdoor-local`,
        env: {
          ...childEnv,
          VITE_FORGE_BACKEND: "http://127.0.0.1:8799",
        },
      };

let child = null;
let shuttingDown = false;
let stoppingChild = false;
let reconciling = false;

function maintenanceEnabled() {
  return existsSync(maintenanceFile) || (role === "desk" && existsSync(deskMaintenanceFile));
}

function processSnapshot() {
  const script =
    "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress";
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true, encoding: "utf8" },
  );
  if (result.status !== 0) {
    const output = `${result.stderr || ""}${result.stdout || ""}`.trim();
    throw new Error(`managed process snapshot failed: ${output || `exit=${result.status}`}`);
  }
  const text = String(result.stdout || "").trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function stopManagedTree(pid, reason) {
  if (!pid) return;
  let tree;
  try {
    tree = managedProcessTree(processSnapshot(), pid);
  } catch (error) {
    console.error(`[${role}] managed tree inspection pid=${pid} failed: ${error.message}`);
    return;
  }
  if (tree.length === 0) {
    console.log(`[${role}] managed tree already absent root=${pid} reason=${reason}`);
    return;
  }

  console.log(
    `[${role}] managed tree stop root=${pid} reason=${reason} pids=${tree.map((entry) => entry.id).join(",")}`,
  );
  for (const processInfo of tree) {
    try {
      process.kill(processInfo.id, "SIGTERM");
      console.log(
        `[${role}] managed process terminated pid=${processInfo.id} parent=${processInfo.parentId} name=${processInfo.name || "unknown"}`,
      );
    } catch (error) {
      if (error?.code === "ESRCH") continue;
      console.error(
        `[${role}] managed process terminate failed pid=${processInfo.id} parent=${processInfo.parentId} name=${processInfo.name || "unknown"}: ${error.message}`,
      );
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
  const next = spawn(comspec, ["/d", "/c", config.command], {
    cwd: config.cwd,
    env: config.env,
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
  console.log(`[${role}] stopping managed root pid=${child.pid} reason=${reason}`);
  stopManagedTree(child.pid, reason);
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
  if (child) stopManagedTree(child.pid, `service-host-${signal}`);
  setTimeout(() => process.exit(0), 100).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGHUP", () => shutdown("SIGHUP"));
process.on("exit", () => {
  if (child?.pid) stopManagedTree(child.pid, "service-host-exit");
});

console.log(
  `[${role}] service host ready root=${root} maintenance=${maintenanceFile} deskMaintenance=${deskMaintenanceFile} pnpm=${pnpm} corepack_prompt=disabled`,
);
await reconcile();
setInterval(reconcile, 1000).unref();

// Keep the wrapper process alive even while maintenance mode intentionally has
// no child process running.
setInterval(() => {}, 60_000);
