import test from "node:test";
import assert from "node:assert/strict";
import { createSourceCodeResolver, simplifyCode, translateSourceRecords } from "../scripts/lib/alumdoor-source-code-resolver.mjs";

/**
 * Bản trích nguồn là BẰNG CHỨNG — không sửa. Nhưng danh mục đã qua hai đợt đổi mã, nên
 * 1.834/2.168 dòng nguồn mang mã không còn tồn tại. Chạy lại chuỗi import mà không dịch là tạo
 * lại toàn bộ mã cũ bên cạnh mã mới, xoá sổ cả hai đợt đổi mã, và không có gì báo.
 */

const conventionMap = new Map([
  ["TP-CON LĂN", "PK-CON-LAN"],
  ["TD-AL595 GS", "TD-AL595-GS"],
  ["NVL-CU", "NVL-MOI"],
]);
const liveCodes = new Set(["PK-CON-LAN", "TD-AL595-GS", "NVL-DA-CO", "TP-UC-KT-4.6D-XN-VK"]);
const resolve = createSourceCodeResolver({ conventionMap, liveCodes });

test("mã chưa từng đổi thì trúng ngay bước đầu", () => {
  assert.equal(resolve("NVL-DA-CO"), "NVL-DA-CO");
});

test("mã đổi theo quy ước thì tra qua bảng ánh xạ", () => {
  assert.equal(resolve("TP-CON LĂN"), "PK-CON-LAN");
});

test("mã chỉ bị rút gọn dấu cách thì tra bằng phép rút gọn", () => {
  // `TP-UC KT 4.6D XN-VK` thuộc họ gộp chưa duyệt nên KHÔNG có trong bảng quy ước; nó chỉ đi qua
  // đợt rút gọn. Thiếu bước này là 70 mã như vậy tra không ra.
  assert.equal(resolve("TP-UC KT 4.6D XN-VK"), "TP-UC-KT-4.6D-XN-VK");
});

test("mã đi qua CẢ HAI đợt cũng tra được", () => {
  assert.equal(resolve("TD-AL595 GS"), "TD-AL595-GS");
});

test("tra không ra thì trả null, KHÔNG đoán", () => {
  // Đoán mã hàng là đoán xem một dòng định mức nói về vật tư nào — sai thì sai vật tư cả lô.
  assert.equal(resolve("NVL-CU"), null, "map ra NVL-MOI nhưng NVL-MOI không tồn tại");
  assert.equal(resolve("KHONG-CO-THAT"), null);
  assert.equal(resolve(""), null);
  assert.equal(resolve(null), null);
});

test("rút gọn chỉ đụng khoảng trắng, không đụng gì khác", () => {
  assert.equal(simplifyCode("TP-UC KT 4.6D"), "TP-UC-KT-4.6D");
  assert.equal(simplifyCode("A  B   C"), "A-B-C", "khoảng trắng liền nhau gộp thành một gạch");
  assert.equal(simplifyCode(" X "), "X", "gạch thừa ở hai đầu bị cắt");
  assert.equal(simplifyCode("GIỮ-nguyên-Hoa-thường"), "GIỮ-nguyên-Hoa-thường");
});

test("dịch bản ghi thì GIỮ đường truy ngược về dòng bảng tính", () => {
  const source = [
    { source_sheet: "ĐM", source_row: 7, item_code: "TP-CON LĂN", qty: 2 },
    { source_sheet: "ĐM", source_row: 8, item_code: "NVL-DA-CO", qty: 1 },
    { source_sheet: "ĐM", source_row: 9, item_code: "KHONG-CO-THAT", qty: 5 },
  ];
  const out = translateSourceRecords(source, resolve);
  assert.equal(out.changed, 1);
  assert.equal(out.records[0].item_code, "PK-CON-LAN");
  assert.equal(out.records[0].source_item_code_original, "TP-CON LĂN", "mất đường truy ngược là mất lý do tin vào con số");
  assert.equal(out.records[0].qty, 2, "các trường khác giữ nguyên");
  assert.equal(out.records[1].source_item_code_original, undefined, "không đổi thì không thêm trường thừa");
  assert.equal(out.records[2].item_code, "KHONG-CO-THAT", "tra không ra thì để nguyên, báo lên trên");
  assert.equal(out.unresolved.get("KHONG-CO-THAT"), 1);
});

test("bản ghi không có mã thì đi qua nguyên vẹn", () => {
  const out = translateSourceRecords([{ source_sheet: "ĐM", note: "dòng trống" }], resolve);
  assert.equal(out.changed, 0);
  assert.equal(out.records[0].note, "dòng trống");
});
