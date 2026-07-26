#!/usr/bin/env node
/**
 * Sinh THẬT 1 app mới bằng create-metaforge-app vào thư mục tạm trong workspace (apps/* nằm trong
 * pnpm-workspace glob) → install → typecheck → build → dọn sạch. Dùng bởi CI (ci.yml) và local.
 * Review độc lập (checkpoint 453d322): trước đây CI chỉ rebuild sample-wms/sample-sales đã sinh sẵn —
 * không chạy CLI thật nên regression trong scaffold()/template có thể lọt.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const NAME = "ci-generated-smoke";
const DIR = join("apps", NAME);

// Gọi qua "corepack pnpm@<version từ packageManager>" thay vì bare "pnpm" — hoạt động cả trên máy KHÔNG
// chạy được `corepack enable` (cần quyền ghi thư mục cài Node, xem docs/history/BUILD_REPORT-gate0-baseline.md)
// lẫn trên CI (đã `corepack enable`), không cần biết trước môi trường nào.
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const PM = pkg.packageManager ?? "pnpm@9.15.0";

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

function pnpm(args) {
  run(`corepack ${PM} ${args}`);
}

function cleanup() {
  if (existsSync(join(ROOT, DIR))) rmSync(join(ROOT, DIR), { recursive: true, force: true });
  try {
    execSync("git checkout -- pnpm-lock.yaml", { stdio: "inherit", cwd: ROOT });
  } catch {
    // best-effort — nếu lockfile không đổi thì lệnh này no-op/lỗi vô hại
  }
}

try {
  run(`node packages/create-metaforge-app/dist/cli.js ${NAME} --name "CI Smoke" --home ToDo --dir ${DIR} --force`);
  pnpm("install --no-frozen-lockfile");
  pnpm(`--filter ${NAME} run typecheck`);
  pnpm(`--filter ${NAME} run build`);
  console.log("✓ generator smoke test OK — app mới sinh install+typecheck+build thành công");
} finally {
  cleanup();
}
