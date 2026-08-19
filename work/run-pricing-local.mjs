import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = "C:\\alumdoor";
const lockPath = path.join(root, "local-locks", "local-d1-mutation.lock");
const payload = path.resolve(process.argv[2]);
const preimage = path.resolve(process.argv[3]);
const runId = `pricing-local-${Date.now()}`;
if (!existsSync(payload) || !existsSync(preimage)) throw new Error("pricing payload/preimage missing");
if (existsSync(lockPath)) throw new Error(`active local D1 lock exists: ${lockPath}`);

const fd = openSync(lockPath, "wx");
writeFileSync(fd, `${JSON.stringify({
  format: "forge-local-d1-lock/v2",
  run_id: runId,
  adapter: "pricing",
  pid: process.pid,
  hostname: os.hostname(),
  started_at: new Date().toISOString(),
  workflow: "manual-agent-live",
  command: process.argv.join(" "),
}, null, 2)}\n`, "utf8");
closeSync(fd);

const importer = path.join(root, "server", "scripts", "import-alumdoor-pricing-local.mjs");
const env = {
  ...process.env,
  FORGE_ORIGIN: process.env.FORGE_ORIGIN || "http://127.0.0.1:8799",
  FORGE_ADMIN_USER: process.env.FORGE_ADMIN_USER || "dev@example.com",
  FORGE_ADMIN_PASSWORD: process.env.FORGE_ADMIN_PASSWORD || "local-dev-password-1",
};
try {
  for (const flags of [["--apply"], ["--apply", "--expect-idempotent"]]) {
    const result = spawnSync(process.execPath, [importer, payload, preimage, ...flags], {
      cwd: root,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`pricing importer failed with exit=${result.status}`);
  }
  console.log(`ALUMDOOR_PRICING_SCOPED_APPLY_PASS run_id=${runId}`);
} finally {
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    if (lock.run_id === runId) unlinkSync(lockPath);
  }
}
