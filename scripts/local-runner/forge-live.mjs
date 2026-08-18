#!/usr/bin/env node

import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
import { Socket } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const runtimeDir = join(repoRoot, "client", "apps", "runtime");
const runtimeDist = join(runtimeDir, "dist");
const runtimeNext = join(runtimeDir, "dist.deploy-next");
const runtimePrevious = join(runtimeDir, "dist.deploy-previous");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const branch = process.env.FORGE_LIVE_BRANCH || "agent-live";
const services = ["ForgeAlumdoorBackend", "ForgeAlumdoorDesk"];
const command = process.argv[2] || "deploy-local";

if (process.argv.some((arg) => arg === "--remote" || arg.startsWith("--remote="))) {
  throw new Error("REMOTE_MUTATION_GUARD: forge-live is local-only");
}
if (command !== "deploy-local") {
  console.error("Usage: forge-live deploy-local");
  process.exit(2);
}
if (process.platform !== "win32") {
  throw new Error("DEPLOY_LOCAL_WINDOWS_REQUIRED: Alumdoor runtime services are Windows services");
}

function run(program, args, { cwd = repoRoot, env, capture = false, allowFailure = false } = {}) {
  const windowsCommandShim = process.platform === "win32" && /\.(?:cmd|bat)$/i.test(program);
  const result = spawnSync(program, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsHide: true,
    // Node cannot execute Windows .cmd/.bat shims directly on every supported
    // Windows/Node combination (it can return EINVAL before the child starts).
    // Only those shims go through ComSpec; native executables such as git.exe
    // and sc.exe remain direct child processes.
    shell: windowsCommandShim,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    const detail = capture ? `${result.stderr || ""}${result.stdout || ""}`.trim() : "";
    throw new Error(`${program} ${args.join(" ")} failed exit=${result.status}${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function capture(program, args, options = {}) {
  return String(run(program, args, { ...options, capture: true }).stdout || "").trim();
}

function serviceQuery(name) {
  const result = run("sc.exe", ["query", name], { capture: true, allowFailure: true });
  if (result.status !== 0) return { installed: false, state: null, output: `${result.stdout || ""}${result.stderr || ""}` };
  const output = String(result.stdout || "");
  const match = output.match(/STATE\s*:\s*(\d+)\s+(\w+)/i);
  return { installed: true, state: match ? Number(match[1]) : null, output };
}

async function waitService(name, wantedState, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = serviceQuery(name);
    if (info.installed && info.state === wantedState) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`SERVICE_STATE_TIMEOUT service=${name} wanted=${wantedState}`);
}

async function stopService(name) {
  const info = serviceQuery(name);
  if (!info.installed) throw new Error(`LOCAL_RUNTIME_SERVICE_MISSING=${name}`);
  if (info.state === 1) return;
  const result = run("sc.exe", ["stop", name], { capture: true, allowFailure: true });
  if (result.status !== 0) {
    const text = `${result.stdout || ""}${result.stderr || ""}`;
    if (!/1062|service has not been started/i.test(text)) {
      throw new Error(`SERVICE_STOP_FAILED service=${name}: ${text.trim()}`);
    }
  }
  await waitService(name, 1);
}

async function startService(name) {
  const info = serviceQuery(name);
  if (!info.installed) throw new Error(`LOCAL_RUNTIME_SERVICE_MISSING=${name}`);
  if (info.state === 4) return;
  const result = run("sc.exe", ["start", name], { capture: true, allowFailure: true });
  if (result.status !== 0) {
    const text = `${result.stdout || ""}${result.stderr || ""}`;
    if (!/1056|already running/i.test(text)) {
      throw new Error(`SERVICE_START_FAILED service=${name}: ${text.trim()}`);
    }
  }
  await waitService(name, 4);
}

function portOpen(port) {
  return new Promise((resolvePort) => {
    const socket = new Socket();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePort(value);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, "127.0.0.1");
  });
}

async function waitPort(port, wantedOpen, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await portOpen(port)) === wantedOpen) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`PORT_STATE_TIMEOUT port=${port} wanted=${wantedOpen ? "open" : "closed"}`);
}

async function requestStatus(url, accepted, timeoutMs = 10_000) {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "application/json, text/html;q=0.9, */*;q=0.8" },
  });
  if (!accepted(response.status)) {
    const body = (await response.text()).slice(0, 300).replace(/\s+/g, " ");
    throw new Error(`HTTP_HEALTH_FAILED url=${url} status=${response.status} body=${body}`);
  }
  return response.status;
}

function removeTree(path) {
  rmSync(path, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}

function swapRuntimeDist() {
  if (!existsSync(runtimeNext)) throw new Error(`DESK_BUILD_OUTPUT_MISSING=${runtimeNext}`);
  removeTree(runtimePrevious);

  if (existsSync(runtimeDist)) {
    renameSync(runtimeDist, runtimePrevious);
  }

  try {
    // Renaming a freshly-built directory is intermittently denied on Windows
    // by Defender/indexers even after Vite has exited. Copying its contents to
    // a new dist directory is much more reliable while preserving the old dist
    // as an immediate rollback target.
    cpSync(runtimeNext, runtimeDist, {
      recursive: true,
      force: true,
      errorOnExist: false,
      preserveTimestamps: false,
    });
    removeTree(runtimeNext);
  } catch (error) {
    removeTree(runtimeDist);
    if (existsSync(runtimePrevious) && !existsSync(runtimeDist)) {
      renameSync(runtimePrevious, runtimeDist);
    }
    throw error;
  }

  removeTree(runtimePrevious);
}

function alignLiveBranch() {
  const trackedDirty = capture("git", ["status", "--porcelain", "--untracked-files=no"]);
  if (trackedDirty) {
    throw new Error(`DEPLOY_LOCAL_TRACKED_CHANGES_PRESENT: commit/stash tracked edits first\n${trackedDirty}`);
  }

  // Match the permanent live-sync contract: origin/agent-live is the live code
  // authority, while untracked local state (notably Wrangler D1) is preserved.
  run("git", ["fetch", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
  const currentBranch = capture("git", ["branch", "--show-current"]);
  if (currentBranch === branch) return currentBranch;

  const localBranch = run("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
    capture: true,
    allowFailure: true,
  });
  if (localBranch.status === 0) {
    run("git", ["switch", branch]);
  } else {
    run("git", ["switch", "-c", branch, "--track", `origin/${branch}`]);
  }
  console.log(`LOCAL_BRANCH_ALIGN_STATUS=PASS from=${currentBranch || "DETACHED"} to=${branch}`);
  return currentBranch;
}

let servicesStopped = false;
let deploySucceeded = false;

try {
  alignLiveBranch();

  for (const name of services) {
    if (!serviceQuery(name).installed) throw new Error(`LOCAL_RUNTIME_SERVICE_MISSING=${name}`);
  }

  const before = capture("git", ["rev-parse", "HEAD"]);

  // Stop the actual service hosts, not only their children. This guarantees the
  // hosts reload any pulled service-command changes when they start again.
  servicesStopped = true;
  await stopService("ForgeAlumdoorDesk");
  await stopService("ForgeAlumdoorBackend");
  await Promise.all([waitPort(5173, false, 45_000), waitPort(8799, false, 45_000)]);
  console.log("LOCAL_RUNTIME_STOP_STATUS=PASS");

  run("git", ["merge", "--ff-only", `origin/${branch}`]);
  const after = capture("git", ["rev-parse", "HEAD"]);
  console.log(`PULL_STATUS=PASS branch=${branch} before=${before.slice(0, 12)} after=${after.slice(0, 12)}`);

  const lockChanged = before !== after && capture("git", ["diff", "--name-only", before, after, "--", "pnpm-lock.yaml"]) === "pnpm-lock.yaml";
  if (!existsSync(join(repoRoot, "node_modules", ".pnpm")) || lockChanged) {
    run(pnpm, ["install", "--frozen-lockfile"]);
    console.log(`DEPENDENCY_INSTALL_STATUS=PASS reason=${lockChanged ? "lock_changed" : "node_modules_missing"}`);
  } else {
    console.log("DEPENDENCY_INSTALL_STATUS=SKIP reason=lock_unchanged");
  }

  run(pnpm, ["--filter", "cloudforge", "run", "build"]);
  console.log("SERVER_BUILD_STATUS=PASS");

  // Rebuild only Runtime's workspace dependencies, then build Runtime itself to
  // a staging directory so a failed Vite build never destroys the last good UI.
  run(pnpm, ["--filter", "runtime^...", "run", "--if-present", "build"]);
  removeTree(runtimeNext);
  run(pnpm, ["exec", "tsc", "-b"], { cwd: runtimeDir });
  run(pnpm, ["exec", "vite", "build", "--outDir", "dist.deploy-next", "--emptyOutDir"], {
    cwd: runtimeDir,
    env: { VITE_FORGE_BACKEND: "http://127.0.0.1:8799" },
  });
  swapRuntimeDist();
  console.log("DESK_BUILD_STATUS=PASS mode=vite_preview");

  await startService("ForgeAlumdoorBackend");
  await startService("ForgeAlumdoorDesk");
  servicesStopped = false;
  await Promise.all([waitPort(8799, true), waitPort(5173, true)]);
  console.log("LOCAL_RUNTIME_START_STATUS=PASS");

  const backendStatus = await requestStatus(
    "http://127.0.0.1:8799/api/method/metaforge.api.get_boot",
    (status) => status === 200 || status === 403,
  );
  console.log(`BACKEND_HEALTH_STATUS=PASS http=${backendStatus}`);

  const deskStatus = await requestStatus("http://127.0.0.1:5173/", (status) => status >= 200 && status < 400);
  const proxyStatus = await requestStatus(
    "http://127.0.0.1:5173/api/method/metaforge.api.get_boot",
    (status) => status === 200 || status === 403,
  );
  console.log(`DESK_HEALTH_STATUS=PASS http=${deskStatus} api_proxy=${proxyStatus}`);

  deploySucceeded = true;
  console.log(`DEPLOY_LOCAL_STATUS=PASS commit=${after}`);
} catch (error) {
  console.error(`DEPLOY_LOCAL_STATUS=FAIL error=${String(error?.message || error).replace(/\r?\n/g, " | ")}`);
  process.exitCode = 1;
} finally {
  removeTree(runtimeNext);
  if (servicesStopped) {
    // Best effort: a failed pull/build must not intentionally leave the local
    // machine stopped. Health remains FAIL, but the services get a chance to
    // come back on the last available build.
    for (const name of ["ForgeAlumdoorBackend", "ForgeAlumdoorDesk"]) {
      try {
        await startService(name);
      } catch (error) {
        console.error(`LOCAL_RUNTIME_RECOVERY_FAILED service=${name} error=${error?.message || error}`);
      }
    }
  }
  if (!deploySucceeded && existsSync(runtimePrevious) && !existsSync(runtimeDist)) {
    try {
      renameSync(runtimePrevious, runtimeDist);
    } catch {
      // Keep the original deployment failure as the primary error.
    }
  }
}
