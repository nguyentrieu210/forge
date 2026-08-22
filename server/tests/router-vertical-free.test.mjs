import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { VERTICAL_METHODS } from "../dist/packages/frappe-api/src/vertical-methods.js";

/**
 * Lõi định tuyến không được biết tên khách hàng nào.
 *
 * `router.ts` từng có 63 chỗ nhắc "alumdoor": sáu method chấm công/bảng lương nằm thẳng
 * trong switch, bốn hook khai trong kiểu context của nền tảng, một doctype tiếng Việt nằm
 * cứng ở hai nhánh `if`, và luật chiết khấu thương mại của một xưởng nhôm nằm trong đúng
 * khối import của lõi. Mỗi lần thêm một dòng như vậy đều có lý do hợp lý tại thời điểm đó —
 * đó chính là cách 4530 dòng hình thành.
 *
 * Nay tất cả nằm trong các module `alumdoor-*.ts` và được ráp qua `VERTICAL_METHODS`.
 * Test này giữ ranh giới đó: lõi tra bảng, không gọi tên.
 */

const SRC = path.resolve(import.meta.dirname, "..", "packages", "frappe-api", "src");

// Module lõi — không file nào trong đây được nhắc tên một vertical.
// `vertical-methods.ts` và `vertical-display.ts` KHÔNG nằm đây: chúng chính là chỗ ráp, gọi
// tên vertical là việc của chúng. Bất biến thật nằm ở lõi định tuyến và lớp đọc-ghi.
const CORE_FILES = ["router.ts", "document-access.ts"];

// Cửa vertical: chỉ những file này được mang tên khách hàng.
const VERTICAL_FILES = ["alumdoor-methods.ts", "alumdoor-display.ts", "alumdoor-commercial.ts"];

test("the shared router names no vertical", () => {
  for (const file of CORE_FILES) {
    const text = readFileSync(path.join(SRC, file), "utf8");
    const hits = text
      .split("\n")
      .map((line, index) => [index + 1, line])
      .filter(([, line]) => /alumdoor/i.test(line));
    assert.deepEqual(
      hits.map(([line, text_]) => `${file}:${line} ${text_.trim()}`),
      [],
      `${file}: luật của vertical phải nằm trong ${VERTICAL_FILES.join(" / ")}, không nằm trong lõi.`,
    );
  }
});

test("every vertical method is reachable only through the registry", () => {
  const registered = Object.keys(VERTICAL_METHODS).sort();
  assert.deepEqual(registered, [
    "metaforge.api.approve_alumdoor_payroll",
    "metaforge.api.commit_alumdoor_attendance_scan",
    "metaforge.api.commit_alumdoor_attendance_station_lite",
    "metaforge.api.commit_alumdoor_employee_lite",
    "metaforge.api.commit_alumdoor_hr_lite_settings",
    "metaforge.api.commit_alumdoor_pay_profile_lite",
    "metaforge.api.get_alumdoor_attendance_qr_config",
    "metaforge.api.get_alumdoor_hr_lite_organization",
    "metaforge.api.preview_sales_commercial_line",
    "metaforge.api.review_alumdoor_attendance_correction",
    "metaforge.api.rotate_alumdoor_attendance_station_qr",
    "metaforge.api.submit_alumdoor_attendance_correction",
  ]);
  for (const [name, handler] of Object.entries(VERTICAL_METHODS)) {
    assert.equal(typeof handler, "function", `${name} phải trỏ tới một handler`);
  }
  // Không method nào của vertical được còn sót lại dưới dạng `case` trong switch chung.
  const router = readFileSync(path.join(SRC, "router.ts"), "utf8");
  for (const name of registered) {
    assert.ok(!router.includes(`case "${name}"`), `${name} vẫn còn nhánh case trong router.ts`);
  }
});

test("the vertical modules exist and are the only place naming a customer", () => {
  const present = readdirSync(SRC).filter((name) => /^alumdoor-/.test(name)).sort();
  assert.deepEqual(present, [...VERTICAL_FILES].sort());
});
