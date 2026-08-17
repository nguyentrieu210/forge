#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  ancestorChain,
  classifyLegacyBackend,
  classifyMigrationSha,
  findLegacyDeskRoot,
  isManagedBackendAuthority,
} from "./alumdoor-legacy-runtime-migration.mjs";

function baseSnapshot() {
  return {
    services: [
      { Name: "ForgeAlumdoorBackend", State: "Running", StartName: "LocalSystem", ProcessId: 100, PathName: '"C:\\ForgeServices\\Alumdoor\\ForgeAlumdoorBackend.exe"' },
      { Name: "ForgeAlumdoorDesk", State: "Running", StartName: "LocalSystem", ProcessId: 200, PathName: '"C:\\ForgeServices\\Alumdoor\\ForgeAlumdoorDesk.exe"' },
      { Name: "ForgeAlumdoorWorker", State: "Running", StartName: "LocalSystem", ProcessId: 300, PathName: "C:\\Tools\\nssm.exe" },
    ],
    legacyParams: {
      Application: "C:\\Windows\\System32\\cmd.exe",
      AppDirectory: "C:\\alumdoor\\server",
      AppParameters: "/d /c pnpm.cmd run dev:alumdoor-local",
    },
    listeners: [
      { LocalPort: 8799, OwningProcess: 301 },
      { LocalPort: 5173, OwningProcess: 401 },
    ],
    processes: [
      { ProcessId: 501, ParentProcessId: 500, Name: "node.exe", CommandLine: "node ensure-alumdoor-local-vars.mjs" },
      { ProcessId: 500, ParentProcessId: 100, Name: "node.exe", CommandLine: "node alumdoor-runtime-service-host.mjs" },
      { ProcessId: 100, ParentProcessId: 4, Name: "ForgeAlumdoorBackend.exe", CommandLine: "" },
      { ProcessId: 301, ParentProcessId: 302, Name: "workerd.exe", CommandLine: "workerd" },
      { ProcessId: 302, ParentProcessId: 300, Name: "cmd.exe", CommandLine: "C:\\alumdoor\\server\\start-worker.cmd" },
      { ProcessId: 300, ParentProcessId: 4, Name: "nssm.exe", CommandLine: "" },
      { ProcessId: 401, ParentProcessId: 402, Name: "node.exe", CommandLine: 'node "C:\\alumdoor\\client\\apps\\runtime\\node_modules\\vite\\bin\\vite.js"' },
      { ProcessId: 402, ParentProcessId: 403, Name: "node.exe", CommandLine: 'pnpm run dev C:\\alumdoor\\client\\apps\\runtime' },
      { ProcessId: 403, ParentProcessId: 999, Name: "cmd.exe", CommandLine: 'cmd.exe /d /c cd /d C:\\alumdoor\\client\\apps\\runtime && pnpm.cmd run dev' },
    ],
  };
}

{
  const snapshot = baseSnapshot();
  assert.deepEqual(ancestorChain(snapshot, 501).map((row) => row.ProcessId), [501, 500, 100]);
  assert.equal(isManagedBackendAuthority(snapshot, 501), true);
  assert.equal(isManagedBackendAuthority(snapshot, 401), false);
}

{
  const snapshot = baseSnapshot();
  assert.equal(classifyLegacyBackend(snapshot).action, "stop-disable");
  snapshot.legacyParams.AppDirectory = "C:\\other-repo";
  assert.deepEqual(classifyLegacyBackend(snapshot), { action: "block", reason: "legacy_target_not_canonical_repo" });
}

{
  const snapshot = baseSnapshot();
  const desk = findLegacyDeskRoot(snapshot);
  assert.equal(desk.action, "kill");
  assert.equal(desk.pid, 403);
}

{
  const snapshot = baseSnapshot();
  snapshot.processes.push(
    { ProcessId: 410, ParentProcessId: 200, Name: "node.exe", CommandLine: 'node "C:\\alumdoor\\client\\apps\\runtime\\node_modules\\vite\\bin\\vite.js"' },
    { ProcessId: 200, ParentProcessId: 4, Name: "ForgeAlumdoorDesk.exe", CommandLine: "" },
  );
  snapshot.listeners = snapshot.listeners.map((row) => row.LocalPort === 5173 ? { ...row, OwningProcess: 410 } : row);
  assert.deepEqual(findLegacyDeskRoot(snapshot), { action: "none", reason: "already_managed" });
}

{
  const current = "c63699a7ec8ebbc92ece15c7b74aa8d82c5a225b";
  assert.deepEqual(classifyMigrationSha(current.toUpperCase(), current), {
    status: "match",
    expected_sha: current,
    actual_sha: current,
  });
  assert.deepEqual(classifyMigrationSha("948e9bdb2b4bf479766221a5178631be2d05da3b", current), {
    status: "stale-request",
    expected_sha: "948e9bdb2b4bf479766221a5178631be2d05da3b",
    actual_sha: current,
  });
}

console.log("ALUMDOOR_LEGACY_RUNTIME_MIGRATION_TEST_PASS");
