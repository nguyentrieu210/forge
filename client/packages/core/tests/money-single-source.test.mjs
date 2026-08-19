import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { formatMoney } from "../dist/i18n/money.js";

/**
 * Định dạng tiền phải có đúng MỘT luật trong cả client.
 *
 * Trước test này, mười màn tự viết `money()` riêng dù `@metaforge/core` đã có sẵn
 * `formatCurrency` — y hệt chuyện `sha256Hex` bên server. Và chúng đã trôi dạt thật: cùng
 * một con số hiện ra bốn kiểu (`1.234.567 ₫`, `1.234.567₫`, `1.234.567 đ`, `1.234.567`),
 * kèm ba cách xử lý giá trị hỏng khác nhau.
 *
 * Test ghim hai điều: đầu ra của từng kiểu, và việc mọi `money()` còn sót lại chỉ được là
 * lớp bọc gọi `formatMoney` — không ai được viết lại luật lần thứ mười một.
 */

const CLIENT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const SCANNED = ["apps", "packages"];

// Mười nơi còn giữ hàm `money()` cục bộ; tất cả PHẢI gọi formatMoney.
const ADAPTERS = [
  "apps/runtime/src/experiences/AlumdoorAttendanceOperations.tsx",
  "apps/runtime/src/experiences/DailyDetailedLedger.tsx",
  "apps/runtime/src/experiences/SocialCommerce.tsx",
  "apps/runtime/src/storefront/Storefront.tsx",
  "apps/runtime/src/website/WebsiteSite.tsx",
  "apps/warehouse-mobile/src/PurchaseFundingScreen.tsx",
  "apps/warehouse-mobile/src/SalesMobileScreens.tsx",
  "packages/vertical-alumdoor/src/AlumdoorPurchaseOrderCreateStable.tsx",
  "packages/vertical-alumdoor/src/AlumdoorPurchaseOrderItemsGrid.tsx",
  "packages/vertical-alumdoor/src/sales-order-v2/model.ts",
];

const DECLARATION = /^\s*(?:export )?function money\(/;

function sourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (["node_modules", "dist", "vendor", ".vite"].includes(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        files.push(path.join(dir, entry.name));
      }
    }
  };
  for (const top of SCANNED) walk(path.join(CLIENT_ROOT, top));
  return files;
}

test("chỉ còn ba kiểu, mỗi kiểu một ngữ cảnh", () => {
  assert.equal(formatMoney(1234567), "1.234.567", "mặc định plain — dùng trong bảng/lưới");
  assert.equal(formatMoney(1234567, { style: "dong" }), "1.234.567 ₫", "đứng một mình thì có đơn vị");
  assert.match(formatMoney(1234567, { style: "currency" }), /1\.234\.567/);
  assert.equal(formatMoney(-2500, { style: "dong" }), "-2.500 ₫");
  assert.equal(formatMoney(1234.6), "1.235", "không giữ phần thập phân, làm tròn nửa-lên");
});

test("hai kiểu trôi dạt đã bỏ hẳn, không lặng lẽ rơi về plain", () => {
  // `dong-tight` và `dong-lower` chỉ khác `dong` một dấu cách và một chữ cái. Nếu ai đó gọi
  // lại tên cũ, TypeScript chặn ở compile — còn ở runtime chúng KHÔNG được âm thầm cho ra
  // đúng chuỗi cũ, vì như thế thì kiểu đã bỏ vẫn sống tiếp mà không ai thấy.
  assert.equal(formatMoney(1234567, { style: "dong-tight" }), "1.234.567");
  assert.equal(formatMoney(1234567, { style: "dong-lower" }), "1.234.567");
});

test("invalid input follows the caller's fallback", () => {
  assert.equal(formatMoney("abc"), "—");
  assert.equal(formatMoney(Number.NaN), "—");
  assert.equal(formatMoney(Number.NaN, { invalid: "chưa có" }), "chưa có");
  assert.equal(formatMoney(0, { style: "dong" }), "0 ₫", "số 0 là giá trị hợp lệ, không phải lỗi");
});

test("chỗ trống không được dựng thành số 0", () => {
  // ĐỔI HÀNH VI CÓ CHỦ Ý (xem docs/REFACTOR-FORGE-20260819.md mục 5 câu 3).
  //
  // Trước: Number(null) và Number("") ra 0 nên "chưa có số" hiện thành "0", còn undefined
  // ra "—" — bất đối xứng thừa hưởng từ cả mười bản `money()` cũ.
  //
  // Nay cả ba đều là "chưa có số". Lý do là nghiệp vụ chứ không phải thẩm mỹ: trong ERP,
  // 0 là một giá trị THẬT (đã trả đủ, số dư bằng không, chiết khấu bằng không). Dựng nó lên
  // từ chỗ trống khiến người dùng đọc một con số mà hệ thống chưa từng có.
  assert.equal(formatMoney(null), "—");
  assert.equal(formatMoney(""), "—");
  assert.equal(formatMoney("   "), "—");
  assert.equal(formatMoney(undefined), "—");
  assert.equal(formatMoney(0), "0", "số 0 khai tường minh vẫn là 0");
});

test("an unknown currency code still renders instead of throwing", () => {
  const rendered = formatMoney(1000, { style: "currency", currency: "XYZ" });
  assert.ok(rendered.includes("1.000"), `mã tiền lạ phải vẫn đọc được: ${rendered}`);
});

test("no screen writes its own money rule again", () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    if (!text.split("\n").some((line) => DECLARATION.test(line))) continue;
    const rel = path.relative(CLIENT_ROOT, file).split(path.sep).join("/");
    if (!ADAPTERS.includes(rel)) {
      offenders.push(`${rel}: định nghĩa money() mới — gọi formatMoney của @metaforge/core thay vì viết lại.`);
      continue;
    }
    if (!text.includes("formatMoney")) {
      offenders.push(`${rel}: money() không còn gọi formatMoney — luật đã tách đôi trở lại.`);
    }
  }
  assert.deepEqual(offenders, []);
});
