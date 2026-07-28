import test from "node:test";
import assert from "node:assert/strict";
import { slatCount, australianSlatCount, profileKey, SLAT_PROFILES } from "../dist/apps-src/alumdoor-worker/src/slats.js";

/**
 * Số lá là chỗ sai một đơn vị thì hỏng một bộ nhôm, và nhôm đã cắt không nối lại được.
 *
 * Mọi con số kỳ vọng dưới đây lấy TỪ TÀI LIỆU CỦA XƯỞNG, không phải từ việc chạy code rồi
 * chép kết quả ra — nếu không thì test chỉ chứng minh code làm đúng thứ nó đang làm.
 */

test("cửa Đức: ví dụ AL548 của xưởng ra đúng 51 lá", () => {
  // "((3 − 0,13)/0,055) − 1 = 52,18 − 1 = 51 lá" — nguyên văn đặc tả.
  const result = slatCount("AL548", "mới", 3);
  assert.equal(result.slats, 51);
  assert.equal(result.key, "AL548N");
  assert.equal(result.divisor, 0.055);
});

test("luật làm tròn khớp cả ba ví dụ xưởng đưa", () => {
  // Xưởng mô tả ngưỡng theo số TRƯỚC khi trừ 1: "52,6 thì là 52", "<52,5 thì là 51".
  // Trừ 1 rồi làm tròn thường tái lập đúng cả ba, nên đó là luật — không cần luật riêng.
  const at = (raw) => Math.round(raw - 1);
  assert.equal(at(52.18), 51);
  assert.equal(at(52.6), 52);
  assert.equal(at(52.4), 51);
});

test("AL548 đời CŨ chia bản lá khác, ra số lá khác hẳn", () => {
  // Bản lá 0,055 và 0,05 chênh 10% — cùng chiều cao ra 51 với 56 lá. Đây là lý do cột
  // TÌNH TRẠNG phải vào khoá tra công thức, không chỉ mã hàng.
  assert.equal(slatCount("AL548", "cũ", 3).slats, 56);
  assert.notEqual(slatCount("AL548", "cũ", 3).slats, slatCount("AL548", "mới", 3).slats);
});

test("AL70 KHÔNG trừ 1 — 42 lá, theo đặc tả chứ không theo bảng PDF", () => {
  /**
   * Hai tài liệu của xưởng nói khác nhau ở đúng mã này: PDF ghi `−1` (ra 41), đặc tả quy
   * trình nêu 42 ở ba chỗ độc lập (ví dụ gốc; "1 + 41"; "38 + 4"). Chọn 42.
   *
   * Test này tồn tại để nếu ai đó "sửa cho khớp PDF" thì nó gãy và buộc phải đọc lại lý do,
   * chứ không lặng lẽ đổi số lá của mọi bộ cửa AL70.
   */
  assert.equal(slatCount("AL70 (2 LỚP)", "mới", 3).slats, 42);
  assert.equal(slatCount("AL70 (1 LỚP)", "mới", 3).slats, 42);
});

test("mã không có công thức thì TỪ CHỐI, không đoán bản lá", () => {
  // AL70 1.5MM có trong kho nhưng không có trong bảng công thức. Đoán một bản lá gần đúng
  // sẽ ra một số lá trông hợp lý và cắt hỏng cả lô.
  assert.throws(() => slatCount("AL70 1.5MM", "mới", 3), /Chưa có công thức chia lá/);
});

test("chiều cao vô lý bị từ chối thay vì trả số âm", () => {
  assert.throws(() => slatCount("AL548", "mới", 0.1), /Chiều cao phủ bì/);
  assert.throws(() => slatCount("AL548", "mới", Number.NaN), /Chiều cao phủ bì/);
});

test("khoá tra công thức ghép mã với đời sản phẩm", () => {
  assert.equal(profileKey("AL548", "mới"), "AL548N");
  assert.equal(profileKey("AL548", "cũ"), "AL548 (CŨ)");
  // Mã chỉ có một đời thì dùng thẳng, không bịa ra hậu tố N.
  assert.equal(profileKey("AL75", "mới"), "AL75");
  assert.equal(profileKey("AL652", "cũ"), "AL652");
});

test("cả 19 mã trong bảng của xưởng đều tính được", () => {
  for (const key of Object.keys(SLAT_PROFILES)) {
    const spec = SLAT_PROFILES[key];
    const raw = (3 - 0.13) / spec.divisor - (spec.subtractOne ? 1 : 0);
    assert.ok(Math.round(raw) > 10, `${key} ra số lá vô lý: ${raw}`);
  }
  assert.equal(Object.keys(SLAT_PROFILES).length, 19);
});

// ---- cửa Úc: luật làm tròn hoàn toàn khác ----------------------------------

test("cửa Úc làm tròn về 0 / 0,3 / 0,7 / 1 — đúng tám ví dụ của xưởng", () => {
  // Motor trong & kéo tay: +2
  assert.equal(australianSlatCount("motor trong", 2.8), 8);    // 8,02 → 8
  assert.equal(australianSlatCount("motor trong", 2.9), 8.3);  // 8,23 → 8,3
  assert.equal(australianSlatCount("motor trong", 3.0), 8.7);  // 8,45 → 8,7
  assert.equal(australianSlatCount("motor trong", 3.2), 9);    // 8,88 → 9
  // Motor ngoài không tự dừng: +1,5
  assert.equal(australianSlatCount("motor ngoài", 2.6), 7);    // 7,09 → 7
  assert.equal(australianSlatCount("motor ngoài", 2.7), 7.3);  // 7,31 → 7,3
  assert.equal(australianSlatCount("motor ngoài", 2.8), 7.7);  // 7,52 → 7,7
  assert.equal(australianSlatCount("motor ngoài", 3.0), 8);    // 7,95 → 8
});

test("cửa Úc motor ngoài có tự dừng dùng hệ số riêng 1,3", () => {
  assert.equal(australianSlatCount("motor ngoài tự dừng", 3.15), 8);   // 8,07 → 8
  assert.equal(australianSlatCount("motor ngoài tự dừng", 3.2), 8.3);  // 8,18 → 8,3
  assert.equal(australianSlatCount("motor ngoài tự dừng", 3.4), 8.7);  // 8,61 → 8,7
  assert.equal(australianSlatCount("motor ngoài tự dừng", 3.5), 9);    // 8,83 → 9
});

test("cửa Úc: loại cửa lạ bị từ chối", () => {
  assert.throws(() => australianSlatCount("cửa gì đó", 3), /không nhận ra/);
});
