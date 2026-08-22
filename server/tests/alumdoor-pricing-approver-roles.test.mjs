import test from "node:test";
import assert from "node:assert/strict";
import { PRICING_APPROVER_ROLES } from "../dist/packages/clouderp-selling/src/controllers.js";

/**
 * Vai được duyệt giá/chiết khấu ngoài chính sách.
 *
 * Trước 23/08/2026 danh sách chỉ có `Sales Manager` và `System Manager` — hai vai KHÔNG tồn tại
 * trong tenant Alumdoor. Hệ quả kép: ở xưởng thì không ai duyệt nổi nên chiết khấu tắc vĩnh
 * viễn, còn người test đăng nhập bằng Administrator lại thấy đơn ghi sổ trơn tru rồi kết luận
 * "cảnh báo cần duyệt chỉ là trang trí". Cả hai đều sai lệch từ cùng một danh sách.
 */
test("chủ xưởng và giám đốc duyệt được giá ngoài chính sách", () => {
  for (const vai of ["Chủ xưởng", "Giám đốc", "Director"]) {
    assert.ok(PRICING_APPROVER_ROLES.has(vai), `${vai} phải duyệt được`);
  }
});

test("người bán KHÔNG tự duyệt chiết khấu của chính mình", () => {
  for (const vai of ["Kinh doanh", "Thủ kho", "Sản xuất", "Kế toán"]) {
    assert.equal(PRICING_APPROVER_ROLES.has(vai), false, `${vai} không được nằm trong danh sách duyệt`);
  }
});

test("vẫn giữ hai vai của nền tảng để app khác không gãy", () => {
  for (const vai of ["Sales Manager", "System Manager"]) {
    assert.ok(PRICING_APPROVER_ROLES.has(vai), `${vai} phải còn`);
  }
});

test("mọi vai trong danh sách đều có thật trong brief Alumdoor hoặc là vai nền tảng", async () => {
  const { readFile } = await import("node:fs/promises");
  const brief = JSON.parse(await readFile(new URL("../briefs/alumdoor-v2.json", import.meta.url), "utf8"));
  const cuaNenTang = new Set(["Sales Manager", "System Manager"]);
  const cuaBrief = new Set(brief.roles ?? []);
  for (const vai of PRICING_APPROVER_ROLES) {
    assert.ok(
      cuaNenTang.has(vai) || cuaBrief.has(vai),
      `"${vai}" không có trong brief lẫn nền tảng — khai một vai không tồn tại là chặn quá tay mà không ai biết`,
    );
  }
});
