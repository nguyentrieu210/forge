/**
 * check-native-ui — quét JSX tìm "browser default" (reviewer #10, máy kiểm).
 * Cho phép: packages/ui (nơi bọc primitive), style động allowlist (grid/gantt %).
 * Báo cáo vi phạm per-file. Dùng làm GATE cuối Pha 1 (re-skin xong mới sạch).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
// Quét cả app thật, không chỉ demo — app sinh ra cho khách cũng phải theo design system.
const SCAN = ["packages", "apps/demo/src", "apps/kho/src", "apps/kho-vn/src", "apps/runtime/src"];
const SKIP_DIR = /node_modules|dist|\.selfcheck|packages[\\/]ui[\\/]/;
// style động cho phép (bố cục tính runtime): grid cols, gantt bar width/left, %
// style động cho phép (bố cục tính runtime): grid cols, gantt bar %, chiều cao động (virtualize/gantt), transform.
const ALLOW_STYLE = /gridTemplateColumns|width:\s*`?\$\{|left:\s*`?\$\{|height:|paddingLeft|minHeight|--mf|transform:/;

const files = [];
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (SKIP_DIR.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(p)) files.push(p);
  }
}
for (const s of SCAN) walk(join(ROOT, s));

// Gate quét rỗng = gate PASS GIẢ. Nếu đường dẫn SCAN sai (đổi tên thư mục, chạy sai cwd) thì
// walk() không tìm được file nào và CI vẫn xanh — hỏng lặng lẽ, đúng loại lỗi nguy hiểm nhất ở
// máy kiểm. Dừng ngay thay vì báo "0 vi phạm" cho một lần quét không đọc gì cả.
if (files.length === 0) {
  console.error(`\n✗ check-native-ui: KHÔNG quét được file .tsx nào (SCAN=${SCAN.join(", ")}).`);
  console.error(`  ROOT=${ROOT} — kiểm tra đường dẫn SCAN hoặc cwd. Coi như FAIL, không phải "sạch".`);
  process.exit(2);
}

const violations = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const rel = relative(ROOT, f);
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    if (/style=\{\{/.test(line) && !ALLOW_STYLE.test(line)) violations.push([at, "inline style", line.trim().slice(0, 80)]);
    // \b bắt cả element multi-line (<input\n…) — component viết hoa (<Input) KHÔNG khớp (case-sensitive).
    if (/<(button|input|select|table|textarea|option|datalist)\b/.test(line)) violations.push([at, "native element", line.trim().slice(0, 80)]);
    if (/(icon|nav).*[🔍📝📋🗂️🌳📅📊📈📑🖨️🛠️🔀🧾📐]/.test(line)) violations.push([at, "emoji icon", line.trim().slice(0, 60)]);
  });
}

// Social Commerce là trung tâm điều hành desktop, không phải một màn app-mode độc lập.
// Giữ cổng này để nó không quay lại màn tự dựng toàn viewport chỉ vì route `/x/*`
// vẫn hỗ trợ những experience touch-first khác.
const runtimeMain = readFileSync(join(ROOT, "apps/runtime/src/main.tsx"), "utf8");
const socialBranchAt = runtimeMain.indexOf('if (kind === "social-commerce")');
const socialBranch = socialBranchAt >= 0 ? runtimeMain.slice(socialBranchAt, socialBranchAt + 1_800) : "";
if (!/<Shell[\s\S]*<SocialCommerce/.test(socialBranch)) {
  violations.push(["apps/runtime/src/main.tsx", "shell", "Social Commerce KHÔNG nằm trong AppShell chuẩn"]);
}
const socialScreen = readFileSync(join(ROOT, "apps/runtime/src/experiences/SocialCommerce.tsx"), "utf8");
for (const primitive of ["Tabs", "StatusBadge", "Skeleton", "Table"]) {
  if (!new RegExp(`<${primitive}\\b`).test(socialScreen)) {
    violations.push(["apps/runtime/src/experiences/SocialCommerce.tsx", "design-system", `Social Commerce KHÔNG dùng ${primitive} từ UI kit`]);
  }
}

// LiveApp phải dùng AppShell + CommandPalette (qua DemoShell)
const live = readFileSync(join(ROOT, "apps/demo/src/LiveApp.tsx"), "utf8");
if (!/DemoShell/.test(live)) violations.push(["apps/demo/src/LiveApp.tsx", "shell", "LiveApp KHÔNG dùng DemoShell/AppShell"]);

const byFile = {};
for (const [at, kind, snip] of violations) {
  const file = at.split(":")[0];
  (byFile[file] ??= []).push(`  ${at.split(":")[1]}  [${kind}] ${snip}`);
}
const total = violations.length;
console.log(`\n== check-native-ui: quét ${files.length} file .tsx → ${total} vi phạm trong ${Object.keys(byFile).length} file ==`);
for (const [file, v] of Object.entries(byFile).sort()) {
  console.log(`\n${file} (${v.length}):`);
  console.log(v.slice(0, 6).join("\n"));
  if (v.length > 6) console.log(`  … +${v.length - 6}`);
}
console.log(`\nTOTAL ${total}. Gate Pha 1: phải = 0 (trừ allowlist).`);
// GATE CỨNG: re-skin xong (Pha 1) → vi phạm = fail CI.
process.exit(total > 0 ? 1 : 0);
