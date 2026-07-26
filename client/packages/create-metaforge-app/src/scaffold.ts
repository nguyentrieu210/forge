/** scaffold — ghi map templates ra thư mục (fs). Tách khỏi renderTemplates (thuần) để test dễ. */
import { mkdir, writeFile, rename, rm } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { renderTemplates, type ScaffoldOptions } from "./templates.js";

/** writeTemplates — ghi TRỰC TIẾP (không transactional) — dùng khi caller tự quản lý an toàn (vd
 * scaffold() bên dưới ghi vào thư mục tạm trước). Export riêng để test đơn giản không cần fs thật. */
export async function writeTemplates(targetDir: string, files: Record<string, string>): Promise<string[]> {
  const written: string[] = [];
  for (const [rel, content] of Object.entries(files)) {
    const full = join(targetDir, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
    written.push(rel);
  }
  return written;
}

/**
 * scaffold — TRANSACTIONAL (P2-CLI-01, review độc lập): ghi TOÀN BỘ template vào thư mục TẠM cạnh
 * targetDir trước; chỉ khi ghi xong KHÔNG lỗi mới xoá targetDir cũ (nếu có, caller đã xác nhận --force)
 * rồi đổi tên tạm → targetDir. Lỗi giữa chừng (disk đầy, quyền, …) KHÔNG để lại targetDir nửa-vời —
 * dọn thư mục tạm, targetDir giữ nguyên trạng thái TRƯỚC khi gọi (rỗng/không tồn tại, đã bị caller
 * xoá nếu force — xem cli.ts gọi theo đúng thứ tự: validate trước, xoá/scaffold sau).
 */
export async function scaffold(targetDir: string, opts: ScaffoldOptions): Promise<string[]> {
  const files = renderTemplates(opts);
  const tmpDir = join(dirname(targetDir), `.mf-scaffold-tmp-${basename(targetDir)}-${process.pid}-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  try {
    const written = await writeTemplates(tmpDir, files);
    await rm(targetDir, { recursive: true, force: true });
    await rename(tmpDir, targetDir);
    return written;
  } catch (e) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}
