import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { translateVietnameseUiSource } from "../dist/packages/frappe-api/src/vietnamese-enum-translations.js";
import { D1TranslationStore } from "../dist/packages/frappe-api/src/translations.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const payProfilePath = path.join(here, "..", "apps-src", "alumdoor-attendance", "doctypes", "alumdoor-pay-profile.json");

function fakeDb(rows = []) {
  return {
    withSession() { return this; },
    prepare() {
      return {
        bind() {
          return {
            async all() { return { results: rows }; },
            async run() { return { meta: { changes: 0 } }; },
          };
        },
      };
    },
    async batch() { return []; },
  };
}

test("enum-style Vietnamese labels translate common case and underscore variants", () => {
  const expected = {
    MONTHLY: "Theo tháng",
    DAILY: "Theo ngày",
    draft: "Nháp",
    approved: "Đã duyệt",
    retired: "Ngừng áp dụng",
    IN_PROGRESS: "Đang xử lý",
    NOT_STARTED: "Chưa bắt đầu",
    ON_HOLD: "Tạm giữ",
    PARTLY_PAID: "Thanh toán một phần",
    complete: "Hoàn tất",
    exception: "Ngoại lệ",
    locked: "Đã khóa",
    Revoked: "Đã thu hồi",
    missing_in: "Thiếu giờ vào",
    missing_out: "Thiếu giờ ra",
    corrected: "Đã hiệu chỉnh",
    INPUT: "Nhập liệu",
    CALCULATED: "Tự tính",
    INFO: "Thông tin",
    WIDTH: "Chiều rộng",
    HEIGHT: "Chiều cao",
    LENGTH: "Chiều dài",
    SHIFT1: "Ca 1",
    SHIFT2: "Ca 2",
    SHIFT3: "Ca 3",
  };
  for (const [source, translated] of Object.entries(expected)) {
    assert.equal(translateVietnameseUiSource(source), translated, source);
  }

  // Unknown technical enum/code stays untouched rather than receiving a guessed translation.
  assert.equal(translateVietnameseUiSource("ALU_PAY_MODE_V2"), "ALU_PAY_MODE_V2");
});

test("first-party AlumDoor technical DocType names have Vietnamese display titles", () => {
  const expected = {
    "AlumDoor Attendance Day": "Ngày công",
    "AlumDoor Attendance Device": "Thiết bị chấm công",
    "AlumDoor Attendance Policy": "Chính sách chấm công",
    "AlumDoor Attendance Segment": "Đoạn ca chấm công",
    "AlumDoor HR Lite Settings": "Cấu hình nhân sự và lương",
    "AlumDoor Pay Profile": "Hồ sơ lương",
    "AlumDoor QR Station": "Trạm chấm công QR",
  };
  for (const [source, translated] of Object.entries(expected)) {
    assert.equal(translateVietnameseUiSource(source), translated, source);
  }
  assert.equal(`Tạo ${translateVietnameseUiSource("AlumDoor Pay Profile").toLocaleLowerCase("vi")}`, "Tạo hồ sơ lương");
});

test("AlumDoor Pay Profile keeps raw stored enum values while Vietnamese display labels are localised", async () => {
  const meta = JSON.parse(await fs.readFile(payProfilePath, "utf8"));
  const payMode = meta.fields.find((field) => field.fieldname === "pay_mode");
  const status = meta.fields.find((field) => field.fieldname === "status");

  assert.equal(payMode.options, "MONTHLY\nDAILY");
  assert.equal(payMode.default, "MONTHLY");
  assert.equal(status.options, "draft\napproved\nretired");
  assert.equal(status.default, "draft");

  assert.deepEqual(
    payMode.options.split("\n").map((value) => [value, translateVietnameseUiSource(value)]),
    [["MONTHLY", "Theo tháng"], ["DAILY", "Theo ngày"]],
  );
  assert.deepEqual(
    status.options.split("\n").map((value) => [value, translateVietnameseUiSource(value)]),
    [["draft", "Nháp"], ["approved", "Đã duyệt"], ["retired", "Ngừng áp dụng"]],
  );
});

test("translation store exposes translated UI labels under their original raw keys", async () => {
  const store = new D1TranslationStore(fakeDb());
  const translated = await store.translate("demo", "vi", [
    "AlumDoor Pay Profile", "MONTHLY", "DAILY", "draft", "approved", "retired", "SHIFT1", "missing_out",
  ]);
  assert.deepEqual(translated, {
    "AlumDoor Pay Profile": "Hồ sơ lương",
    MONTHLY: "Theo tháng",
    DAILY: "Theo ngày",
    draft: "Nháp",
    approved: "Đã duyệt",
    retired: "Ngừng áp dụng",
    SHIFT1: "Ca 1",
    missing_out: "Thiếu giờ ra",
  });
});
