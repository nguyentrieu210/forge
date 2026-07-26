/**
 * check-hook-order — bắt hook React gọi SAU một câu `return` sớm trong cùng một component.
 *
 * Vì sao cần máy kiểm riêng: đây là lỗi đã HAI LẦN đẩy màn hình trắng lên production trong dự án
 * này (React error #310), và không công cụ nào hiện có bắt được — `tsc` thấy hợp lệ hoàn toàn,
 * `check-native-ui` chỉ soi JSX. Lỗi cũng không tái hiện mỗi lần chạy: chỉ nổ khi nhánh return
 * sớm ĐỔI trạng thái giữa hai lần render, nên test tay rất dễ bỏ lọt.
 *
 * Cách nhận biết: trong thân một hàm component (tên viết hoa) hoặc hook (use*), nếu gặp `return`
 * ở cấp thụt lề gốc rồi SAU đó còn gọi useState/useEffect/useMemo/… thì báo lỗi.
 *
 * Có bỏ sót không? Có — đây là phép quét văn bản, không phải phân tích cú pháp. Nó bắt đúng dạng
 * phổ biến nhất (guard đầu hàm) chứ không phải mọi biến thể. Bắt được dạng đó đã đủ chặn cả hai
 * lần hỏng đã xảy ra.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SCAN = ["packages", "apps/demo/src", "apps/kho/src", "apps/kho-vn/src"];
const SKIP_DIR = /node_modules|dist|\.selfcheck/;
const HOOK = /\b(useState|useEffect|useLayoutEffect|useMemo|useCallback|useRef|useReducer|useContext|useT|useQuery|useMutation|useForm|useVirtualizer)\s*\(/;

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

if (files.length === 0) {
  console.error("✗ check-hook-order: không quét được file .tsx nào — coi như FAIL.");
  process.exit(2);
}

const violations = [];
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  const rel = relative(ROOT, f);
  let inComponent = false;
  let sawEarlyReturn = 0;

  lines.forEach((line, i) => {
    // Bắt đầu một component/hook: `function Ten(` hoặc `export function Ten(` ở cấp gốc
    if (/^(export\s+)?function\s+(use[A-Z]|[A-Z])/.test(line)) {
      inComponent = true;
      sawEarlyReturn = 0;
      return;
    }
    // Kết thúc hàm ở cấp gốc
    if (/^}/.test(line)) { inComponent = false; sawEarlyReturn = 0; return; }
    if (!inComponent) return;

    // `return` ở thụt lề 2 space = nhánh thoát sớm của chính component (không phải trong callback)
    // `return useX(...)` KHÔNG phải vi phạm: hook được gọi TRONG chính câu return, nên không có
    // hook nào chạy sau nó. Chỉ tính câu return KHÔNG chứa lời gọi hook.
    if (/^ {2}(if\s*\(.*\)\s*)?return\b/.test(line) && !HOOK.test(line)) sawEarlyReturn = i + 1;

    // Gọi hook ở thụt lề 2 space SAU khi đã có return sớm
    if (sawEarlyReturn && /^ {2}(const|let|var)?\s*.*/.test(line) && HOOK.test(line)) {
      violations.push([`${rel}:${i + 1}`, line.trim().slice(0, 76), sawEarlyReturn]);
      sawEarlyReturn = 0; // báo một lần cho mỗi hàm, tránh ngập
    }
  });
}

console.log(`\n== check-hook-order: quét ${files.length} file .tsx → ${violations.length} vi phạm ==`);
for (const [at, snip, retLine] of violations) {
  console.log(`\n${at}  (return sớm ở dòng ${retLine})`);
  console.log(`  ${snip}`);
}
if (violations.length) {
  console.log(`\nSửa: chuyển MỌI hook lên TRƯỚC câu return sớm đầu tiên của hàm.`);
  console.log(`React yêu cầu số hook không đổi giữa các lần render (lỗi #310 = màn hình trắng).`);
}
process.exit(violations.length > 0 ? 1 : 0);
