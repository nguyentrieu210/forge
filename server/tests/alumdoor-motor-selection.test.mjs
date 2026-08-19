import test from "node:test";
import assert from "node:assert/strict";
import { motorLoadKg, suggestMotor, suggestUps } from "../dist/apps-src/alumdoor-worker/src/motor-selection.js";

/**
 * Bảng ngưỡng chọn motor — `BANG-GIA-CHINH-THUC-31-07-2026 §6`.
 *
 * Nguồn nói rõ vì sao luật này phải nằm trong phần mềm: lò xo thì để thợ tự chọn, còn motor
 * "CÓ LUẬT RÕ RÀNG nên app tra được". Chọn dư một cấp là khách trả thừa vài triệu; chọn thiếu
 * một cấp là motor kéo quá tải rồi hỏng trong hạn bảo hành.
 */

const MOTORS = [
  { rule_code: "MOTO-TANKER-400", item_code: "TP-MT-TANKER400KG", selection_basis: "Diện tích cửa", max_area_sqm: 15, includes: "Motor + Lắc 32 + Bộ ĐK", sort_order: 10, disabled: 0 },
  { rule_code: "MOTO-TANKER-800", item_code: "TP-MT-TANKER800KG", selection_basis: "Diện tích cửa", max_area_sqm: 27, includes: "Motor + Lắc 38 + Bộ ĐK", sort_order: 30, disabled: 0 },
  { rule_code: "MOTO-JG-1500", item_code: "TP-MT-JG1500KG", selection_basis: "Diện tích cửa", max_area_sqm: 55, includes: "Motor + Lắc 40 + Bộ ĐK", sort_order: 110, disabled: 0 },
];
const UPS = [
  { rule_code: "PIN-E800", item_code: "TP-UPS-E800", selection_basis: "Tải motor", max_motor_kg: 600, includes: "9 AH", sort_order: 160, disabled: 0 },
  { rule_code: "PIN-E1000", item_code: "TP-UPS-E1000", selection_basis: "Tải motor", max_motor_kg: 1000, includes: "12 AH", sort_order: 170, disabled: 0 },
];
const ALL = [...MOTORS, ...UPS];

test("chọn motor nhỏ nhất còn kéo nổi diện tích đó", () => {
  assert.equal(suggestMotor(ALL, 12)?.rule_code, "MOTO-TANKER-400");
  assert.equal(suggestMotor(ALL, 20)?.rule_code, "MOTO-TANKER-800");
  assert.equal(suggestMotor(ALL, 40)?.rule_code, "MOTO-JG-1500");
});

test("cận trên MỞ — cửa đúng 15 m² KHÔNG dùng motor mức 15", () => {
  // Nguồn ghi `<15m²`, không phải `≤15m²`. Đảo chiều là lệch một cấp ở mọi đơn nằm ở mép, mà
  // đơn ở mép thì nhiều vì người ta hay làm tròn số.
  assert.equal(suggestMotor(ALL, 14.99)?.rule_code, "MOTO-TANKER-400");
  assert.equal(suggestMotor(ALL, 15)?.rule_code, "MOTO-TANKER-800", "đúng 15 phải lên cấp trên");
});

test("vượt mức cao nhất thì trả về không có, KHÔNG lấy bừa cái to nhất", () => {
  // Thà nói "không tra được" còn hơn gợi ý một motor mà bảng chưa từng bảo là đủ.
  assert.equal(suggestMotor(ALL, 60), null);
});

test("motor đã ngừng dùng thì không được gợi ý", () => {
  const retired = ALL.map((row) => (row.rule_code === "MOTO-TANKER-400" ? { ...row, disabled: 1 } : row));
  assert.equal(suggestMotor(retired, 12)?.rule_code, "MOTO-TANKER-800");
});

test("bình lưu điện tra theo TẢI MOTOR, không theo diện tích", () => {
  // Hai luật khác nhau nên không được gộp: một cửa nhỏ lắp motor khoẻ vẫn cần bình theo motor.
  assert.equal(suggestUps(ALL, 400)?.rule_code, "PIN-E800");
  assert.equal(suggestUps(ALL, 800)?.rule_code, "PIN-E1000");
  assert.equal(suggestUps(ALL, 600)?.rule_code, "PIN-E1000", "đúng 600 phải lên cấp trên");
});

test("dòng motor không lọt vào kết quả tra bình, và ngược lại", () => {
  assert.equal(suggestUps(MOTORS, 400), null, "không có dòng nào tra theo tải motor");
  assert.equal(suggestMotor(UPS, 12), null, "không có dòng nào tra theo diện tích");
});

test("suy tải motor từ mã luật, và TỪ CHỐI khi không suy được", () => {
  assert.equal(motorLoadKg("MOTO-JG-800"), 800);
  assert.equal(motorLoadKg("MOTO-YHLD-1000"), 1000);
  // Đoán bừa ở đây là chọn nhầm bình; nhầm về phía nhỏ thì bình không kéo nổi motor lúc mất điện.
  assert.throws(() => motorLoadKg("MOTO-KHONG-SO"), /Không suy được tải motor/);
  assert.throws(() => motorLoadKg(""), /Không suy được tải motor/);
});

test("diện tích vô lý thì từ chối chứ không trả bừa", () => {
  assert.throws(() => suggestMotor(ALL, 0), /Diện tích cửa phải là số dương/);
  assert.throws(() => suggestMotor(ALL, Number.NaN), /Diện tích cửa phải là số dương/);
  assert.throws(() => suggestUps(ALL, -1), /Tải motor phải là số dương/);
});
