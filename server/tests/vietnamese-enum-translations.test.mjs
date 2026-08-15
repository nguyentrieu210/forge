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
  };
  for (const [source, translated] of Object.entries(expected)) {
    assert.equal(translateVietnameseUiSource(source), translated, source);
  }

  // Unknown technical enum/code stays untouched rather than receiving a guessed translation.
  assert.equal(translateVietnameseUiSource("ALU_PAY_MODE_V2"), "ALU_PAY_MODE_V2");
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

test("translation store exposes translated enum labels under their original raw keys", async () => {
  const store = new D1TranslationStore(fakeDb());
  const translated = await store.translate("demo", "vi", ["MONTHLY", "DAILY", "draft", "approved", "retired"]);
  assert.deepEqual(translated, {
    MONTHLY: "Theo tháng",
    DAILY: "Theo ngày",
    draft: "Nháp",
    approved: "Đã duyệt",
    retired: "Ngừng áp dụng",
  });
});
