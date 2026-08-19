/**
 * Dọn file mồ côi trong dist/ — vế giữ an toàn cho biên dịch tăng dần.
 *
 * Bỏ `npm run clean` khỏi vòng lặp chỉ đúng khi chuyện này còn đúng: file sinh ra mà nguồn
 * đã biến mất thì phải biến mất theo. Nếu không, bộ test vẫn import được một module đã xoá
 * và vẫn xanh — đúng nhóm "test trỏ vào code không còn tồn tại" đang nằm trong mốc refactor.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, rm, mkdir, access } from "node:fs/promises";
import path from "node:path";

const run = promisify(execFile);
const serverRoot = path.resolve(import.meta.dirname, "..");
const script = path.join(serverRoot, "scripts", "prune-stale-dist.mjs");

const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

test("xoá sản phẩm không còn nguồn, giữ nguyên sản phẩm còn nguồn", async () => {
  const junkDir = path.join(serverRoot, "dist", "packages", "core", "src");
  await mkdir(junkDir, { recursive: true });
  const orphan = path.join(junkDir, "__prune-probe.js");
  const orphanMap = path.join(junkDir, "__prune-probe.js.map");
  const live = path.join(junkDir, "numeric.js");

  await writeFile(orphan, "export const gone = 1;\n");
  await writeFile(orphanMap, "{}\n");

  try {
    assert.ok(await exists(live), "dist/ chưa được dựng — chạy npm run build trước");
    await run(process.execPath, [script], { cwd: serverRoot });

    assert.equal(await exists(orphan), false, "file .js không còn nguồn .ts phải bị xoá");
    assert.equal(await exists(orphanMap), false, "source map đi kèm cũng phải bị xoá");
    assert.ok(await exists(live), "file còn nguồn thì không được đụng tới");
  } finally {
    await rm(orphan, { force: true });
    await rm(orphanMap, { force: true });
  }
});
