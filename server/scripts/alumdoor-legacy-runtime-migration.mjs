#!/usr/bin/env node
/**
 * One-time, fail-closed migration from the legacy Alumdoor NSSM/console runtime
 * to the canonical Forge Windows services.
 *
 * Security boundary:
 * - this file does nothing unless a local request file exists;
 * - only a process descending from the running ForgeAlumdoorBackend service may act;
 * - the legacy backend service must be exactly ForgeAlumdoorWorker, LocalSystem,
 *   NSSM-backed, configured for C:\alumdoor, and own the 8799 listener ancestry;
 * - the legacy Desk tree must own port 5173 and include the exact
 *   C:\alumdoor\client\apps\runtime path;
 * - no Cloudflare/D1 mutation is performed here.
 */
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = "C:\\alumdoor";
const DEFAULT_SERVICE_HOME = "C:\\ForgeServices\\Alumdoor";
const REQUEST_FORMAT = "forge-alumdoor-legacy-runtime-migration/v1";
const MANAGED_BACKEND = "ForgeAlumdoorBackend";
const MANAGED_DESK = "ForgeAlumdoorDesk";
const LEGACY_BACKEND = "ForgeAlumdoorWorker";

function normalizeWin(value) {
  return String(value ?? "")
    .replace(/\//g, "\\")
    .replace(/\\+/g, "\\")
    .toLowerCase();
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function service(snapshot, name) {
  return asArray(snapshot.services).find((entry) => entry?.Name === name) ?? null;
}

export function ancestorChain(snapshot, startPid) {
  const byId = new Map(
    asArray(snapshot.processes)
      .map((entry) => ({ ...entry, ProcessId: Number(entry.ProcessId), ParentProcessId: Number(entry.ParentProcessId) }))
      .filter((entry) => Number.isInteger(entry.ProcessId) && entry.ProcessId > 0)
      .map((entry) => [entry.ProcessId, entry]),
  );
  const result = [];
  const seen = new Set();
  let current = Number(startPid);
  while (Number.isInteger(current) && current > 0 && !seen.has(current)) {
    seen.add(current);
    const row = byId.get(current);
    if (!row) break;
    result.push(row);
    current = row.ParentProcessId;
  }
  return result;
}

export function isManagedBackendAuthority(snapshot, currentPid = process.pid) {
  const backend = service(snapshot, MANAGED_BACKEND);
  if (!backend) return false;
  if (String(backend.State).toLowerCase() !== "running") return false;
  if (String(backend.StartName).toLowerCase() !== "localsystem") return false;
  if (!normalizeWin(backend.PathName).includes("\\forgealumdoorbackend.exe")) return false;
  const servicePid = Number(backend.ProcessId);
  if (!Number.isInteger(servicePid) || servicePid <= 0) return false;
  return ancestorChain(snapshot, currentPid).some((entry) => entry.ProcessId === servicePid);
}

function listener(snapshot, port) {
  return asArray(snapshot.listeners).find((entry) => Number(entry?.LocalPort) === port) ?? null;
}

export function classifyLegacyBackend(snapshot, repoRoot = DEFAULT_ROOT) {
  const legacy = service(snapshot, LEGACY_BACKEND);
  if (!legacy) return { action: "none", reason: "service_absent" };
  if (String(legacy.State).toLowerCase() === "stopped") {
    return { action: "disable", reason: "service_already_stopped", service: legacy };
  }
  if (String(legacy.StartName).toLowerCase() !== "localsystem") {
    return { action: "block", reason: "unexpected_service_account" };
  }
  if (!/(?:^|[\\/])nssm\.exe(?:\s|$|\")/i.test(String(legacy.PathName ?? ""))) {
    return { action: "block", reason: "not_nssm" };
  }

  const target = normalizeWin(
    [snapshot.legacyParams?.Application, snapshot.legacyParams?.AppDirectory, snapshot.legacyParams?.AppParameters]
      .filter(Boolean)
      .join(" "),
  );
  const expectedRoot = normalizeWin(repoRoot);
  if (!target.includes(expectedRoot)) {
    return { action: "block", reason: "legacy_target_not_canonical_repo" };
  }

  const port = listener(snapshot, 8799);
  if (!port) return { action: "stop-disable", reason: "service_without_listener", service: legacy };
  const servicePid = Number(legacy.ProcessId);
  const owned = ancestorChain(snapshot, Number(port.OwningProcess)).some((entry) => entry.ProcessId === servicePid);
  if (!owned) return { action: "block", reason: "8799_not_owned_by_legacy_service" };
  return { action: "stop-disable", reason: "verified_legacy_backend", service: legacy };
}

export function findLegacyDeskRoot(snapshot, repoRoot = DEFAULT_ROOT) {
  const port = listener(snapshot, 5173);
  if (!port) return { action: "none", reason: "listener_absent" };

  const chain = ancestorChain(snapshot, Number(port.OwningProcess));
  const managed = service(snapshot, MANAGED_DESK);
  const managedPid = Number(managed?.ProcessId);
  if (Number.isInteger(managedPid) && managedPid > 0 && chain.some((entry) => entry.ProcessId === managedPid)) {
    return { action: "none", reason: "already_managed" };
  }

  const runtimeRoot = `${normalizeWin(repoRoot)}\\client\\apps\\runtime`;
  const candidates = chain.filter((entry) => {
    const command = normalizeWin(entry.CommandLine);
    const name = String(entry.Name ?? "").toLowerCase();
    return ["cmd.exe", "node.exe"].includes(name)
      && command.includes(runtimeRoot)
      && (/\bpnpm(?:\.cmd|\.js)?\b/.test(command) || /\bvite(?:\.js)?\b/.test(command));
  });
  if (!candidates.length) return { action: "block", reason: "5173_unverified_legacy_tree" };

  // Ancestor order is listener -> root. Kill the highest verified runtime node so
  // pnpm/cmd cannot immediately respawn Vite.
  return { action: "kill", reason: "verified_legacy_desk", pid: candidates.at(-1).ProcessId };
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.error) throw new Error(`${label} failed to start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed exit=${result.status}: ${output}`);
  return output;
}

function powershell(script) {
  return run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    "PowerShell runtime snapshot",
  );
}

function runtimeSnapshot() {
  const script = String.raw`
$services = @('ForgeAlumdoorBackend','ForgeAlumdoorDesk','ForgeAlumdoorWorker') | ForEach-Object {
  Get-CimInstance Win32_Service -Filter ("Name='" + $_ + "'") -ErrorAction SilentlyContinue |
    Select-Object Name,State,StartName,ProcessId,PathName
}
$processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Select-Object ProcessId,ParentProcessId,Name,CommandLine,ExecutablePath)
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in @(8799,5173) } |
  Select-Object LocalPort,OwningProcess)
$params = $null
$key = 'HKLM:\SYSTEM\CurrentControlSet\Services\ForgeAlumdoorWorker\Parameters'
if (Test-Path $key) {
  $raw = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
  $params = [ordered]@{ Application=$raw.Application; AppDirectory=$raw.AppDirectory; AppParameters=$raw.AppParameters }
}
[ordered]@{ services=@($services); processes=$processes; listeners=$listeners; legacyParams=$params } |
  ConvertTo-Json -Depth 6 -Compress
`;
  const output = powershell(script);
  return JSON.parse(output);
}

function gitHead(repoRoot) {
  return run("git", ["-C", repoRoot, "rev-parse", "HEAD"], "git rev-parse HEAD").trim();
}

function waitForLegacyBackendStopped(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = service(runtimeSnapshot(), LEGACY_BACKEND)?.State;
    if (!state || String(state).toLowerCase() === "stopped") return;
    const pause = spawnSync("powershell.exe", ["-NoProfile", "-Command", "Start-Sleep -Milliseconds 500"], { windowsHide: true });
    if (pause.error) throw pause.error;
  }
  throw new Error(`${LEGACY_BACKEND} did not reach Stopped state`);
}

function performMigration(snapshot, repoRoot) {
  const backend = classifyLegacyBackend(snapshot, repoRoot);
  if (backend.action === "block") {
    throw new Error(`Legacy backend ownership rejected: ${backend.reason}`);
  }
  if (backend.action === "stop-disable") {
    const result = spawnSync("sc.exe", ["stop", LEGACY_BACKEND], { encoding: "utf8", windowsHide: true });
    const output = `${result.stdout || ""}${result.stderr || ""}`;
    if (result.error) throw new Error(`sc stop ${LEGACY_BACKEND} failed to start: ${result.error.message}`);
    if (result.status !== 0 && !/service.*not.*started|1062/i.test(output)) {
      throw new Error(`sc stop ${LEGACY_BACKEND} failed exit=${result.status}: ${output.trim()}`);
    }
    waitForLegacyBackendStopped();
    console.log(`LEGACY_BACKEND_STOP=PASS service=${LEGACY_BACKEND}`);
  }
  if (["stop-disable", "disable"].includes(backend.action)) {
    run("sc.exe", ["config", LEGACY_BACKEND, "start=", "disabled"], `disable ${LEGACY_BACKEND}`);
    console.log(`LEGACY_BACKEND_DISABLE=PASS service=${LEGACY_BACKEND}`);
  }

  const refreshed = runtimeSnapshot();
  const desk = findLegacyDeskRoot(refreshed, repoRoot);
  if (desk.action === "block") throw new Error(`Legacy Desk ownership rejected: ${desk.reason}`);
  if (desk.action === "kill") {
    run("taskkill.exe", ["/PID", String(desk.pid), "/T", "/F"], `stop legacy Desk pid=${desk.pid}`);
    console.log(`LEGACY_DESK_STOP=PASS pid=${desk.pid}`);
  }

  const finalState = runtimeSnapshot();
  const remainingBackend = classifyLegacyBackend(finalState, repoRoot);
  if (remainingBackend.action === "stop-disable") {
    throw new Error("Legacy backend still active after verified stop");
  }
  const remainingDesk = findLegacyDeskRoot(finalState, repoRoot);
  if (remainingDesk.action === "kill") {
    throw new Error("Legacy Desk listener still active after verified stop");
  }
  return { backend: remainingBackend.reason, desk: remainingDesk.reason };
}

export async function reconcileLegacyRuntimeMigration({
  repoRoot = process.env.ALUMDOOR_ROOT || DEFAULT_ROOT,
  serviceHome = process.env.ALUMDOOR_SERVICE_HOME || DEFAULT_SERVICE_HOME,
  currentPid = process.pid,
} = {}) {
  const requestPath = path.join(serviceHome, "legacy-runtime-migration.request.json");
  if (!existsSync(requestPath)) return { status: "not-requested" };
  if (process.platform !== "win32") throw new Error("Legacy runtime migration is Windows-only");

  const request = JSON.parse(readFileSync(requestPath, "utf8"));
  if (request.format !== REQUEST_FORMAT || !/^[0-9a-f]{40}$/i.test(String(request.expected_sha ?? ""))) {
    throw new Error("Invalid legacy runtime migration request");
  }

  const snapshot = runtimeSnapshot();
  if (!isManagedBackendAuthority(snapshot, currentPid)) {
    console.log("ALUMDOOR_LEGACY_RUNTIME_MIGRATION_SKIP authority=not-managed-backend");
    return { status: "skipped-authority" };
  }

  const actual = gitHead(repoRoot);
  if (actual !== request.expected_sha) {
    throw new Error(`Migration SHA mismatch expected=${request.expected_sha} actual=${actual}`);
  }

  const result = performMigration(snapshot, repoRoot);
  const donePath = path.join(serviceHome, "legacy-runtime-migration.done.json");
  writeFileSync(
    donePath,
    `${JSON.stringify({
      format: REQUEST_FORMAT,
      run_id: request.run_id ?? "",
      expected_sha: request.expected_sha,
      completed_at: new Date().toISOString(),
      ...result,
    }, null, 2)}\n`,
    "utf8",
  );
  unlinkSync(requestPath);
  console.log(`ALUMDOOR_LEGACY_RUNTIME_MIGRATION_PASS sha=${actual}`);
  return { status: "migrated", ...result };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  reconcileLegacyRuntimeMigration().catch((error) => {
    console.error(error?.stack ?? error);
    process.exit(1);
  });
}
