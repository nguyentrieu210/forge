#!/usr/bin/env node
/**
 * Safely fast-forward the local checkout to the exact GitHub commit of the active live branch.
 *
 * Supported branches: main, agent-live.
 * This script intentionally does NOT run a destructive reset. It refuses when
 * the checkout is dirty, when the local branch has commits GitHub does not have,
 * or when the remote history cannot be fast-forwarded.
 *
 * Modes:
 * - --check: only discover whether origin/<branch> is ahead (never modifies Git).
 * - --apply (or no mode): fast-forward the current supported branch to origin/<branch>.
 *
 * Exit status: 0 = already current, 10 = update available/applied, 1 = safe refusal/error.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");
const supportedBranches = new Set(["main", "agent-live"]);

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) throw new Error(`Không chạy được git: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(" ")} thất bại`).trim());
  }
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

function fail(message) {
  console.error(`LOCAL_SYNC_REFUSED: ${message}`);
  process.exit(1);
}

const modes = process.argv.filter((value) => value === "--check" || value === "--apply");
if (modes.length > 1) fail("chỉ dùng một chế độ: --check hoặc --apply");
const checkOnly = modes[0] === "--check";

if (process.argv.includes("--help")) {
  console.log("Dùng: node server/scripts/sync-local-from-github.mjs [--check|--apply]");
  console.log("Đồng bộ nhánh hiện tại (main hoặc agent-live) khi working tree sạch và có thể fast-forward an toàn.");
  process.exit(0);
}

try {
  const branch = git(["branch", "--show-current"]).stdout;
  if (!supportedBranches.has(branch)) {
    fail(`đang ở nhánh '${branch || "detached"}', chỉ hỗ trợ main hoặc agent-live`);
  }
  const remoteRef = `origin/${branch}`;

  const dirty = git(["status", "--porcelain"]).stdout;
  if (dirty) fail("working tree đang có thay đổi; hãy commit hoặc cất thay đổi trước khi tự đồng bộ");

  git(["fetch", "--quiet", "origin", branch]);
  const counts = git(["rev-list", "--left-right", "--count", `HEAD...${remoteRef}`]).stdout.split(/\s+/).map(Number);
  const [ahead = 0, behind = 0] = counts;
  if (ahead > 0) fail(`${branch} local có commit chưa có trên GitHub; không tự ghi đè`);
  if (behind === 0) {
    console.log(`LOCAL_SYNC_NO_CHANGE branch=${branch} commit=${git(["rev-parse", "HEAD"]).stdout}`);
    process.exit(0);
  }

  if (checkOnly) {
    console.log(`LOCAL_SYNC_UPDATE_AVAILABLE branch=${branch} from=${git(["rev-parse", "HEAD"]).stdout} to=${git(["rev-parse", remoteRef]).stdout}`);
    process.exit(10);
  }

  git(["merge", "--ff-only", remoteRef]);
  console.log(`LOCAL_SYNC_UPDATED branch=${branch} commit=${git(["rev-parse", "HEAD"]).stdout}`);
  process.exit(10);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
