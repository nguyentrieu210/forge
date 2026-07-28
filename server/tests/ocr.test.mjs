/**
 * Đọc bảng giá bằng ảnh: hai phần mô hình KHÔNG được phép quyết.
 *
 * Đọc số sai là sai TIỀN, và sai lặng lẽ — 98.000 đọc thành 98 thì sổ vẫn cân, chỉ có
 * công nợ NCC là sai một nghìn lần. Khớp mã sai còn tệ hơn: chứng từ trông hợp lệ, hàng
 * vào nhầm mã, tồn kho lệch hai chiều và không truy ngược được.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRows, extractJson, matchItem, normaliseKey, normaliseUom, parseVietnameseNumber, stripDiacritics,
} from "../dist/apps-src/alumdoor-worker/src/ocr.js";

test("dấu chấm theo sau ĐÚNG ba chữ số là phân nhóm, không phải thập phân", () => {
  // Đây là cái bẫy chính của bảng giá Việt Nam.
  assert.equal(parseVietnameseNumber("98.000"), 98000);
  assert.equal(parseVietnameseNumber("165.000"), 165000);
  assert.equal(parseVietnameseNumber("1.234.567"), 1234567);
  assert.equal(parseVietnameseNumber("98,000"), 98000);
});

test("dấu theo sau ít hơn ba chữ số là thập phân", () => {
  assert.equal(parseVietnameseNumber("3,5"), 3.5);
  assert.equal(parseVietnameseNumber("5.85"), 5.85);
  assert.equal(parseVietnameseNumber("1,419"), 1419); // ba chữ số → phân nhóm, đúng luật
  assert.equal(parseVietnameseNumber("0,75"), 0.75);
});

test("có CẢ hai dấu thì dấu đứng SAU là thập phân — đọc được cả hai lối viết", () => {
  assert.equal(parseVietnameseNumber("1.234,56"), 1234.56);
  assert.equal(parseVietnameseNumber("1,234.56"), 1234.56);
  assert.equal(parseVietnameseNumber("12.345.678,90"), 12345678.9);
});

test("ký hiệu tiền tệ và khoảng trắng không làm hỏng con số", () => {
  assert.equal(parseVietnameseNumber("98.000 đ"), 98000);
  assert.equal(parseVietnameseNumber("165.000đ/m"), 165000);
  assert.equal(parseVietnameseNumber(" 1 200 000 "), 1200000);
  assert.equal(parseVietnameseNumber("107.000 VNĐ"), 107000);
});

test("số đọc không ra thì trả null, KHÔNG trả 0", () => {
  // 0 là một con số hợp lệ; trả 0 cho thứ không đọc được là biến "không biết" thành
  // "miễn phí", và một dòng giá 0 đi thẳng vào chứng từ mà không ai thắc mắc.
  assert.equal(parseVietnameseNumber(""), null);
  assert.equal(parseVietnameseNumber("liên hệ"), null);
  assert.equal(parseVietnameseNumber(null), null);
  assert.equal(parseVietnameseNumber("—"), null);
});

test("bỏ dấu tiếng Việt, kể cả chữ đ", () => {
  assert.equal(stripDiacritics("Nhôm Đức"), "Nhom Duc");
  assert.equal(normaliseKey("Ray hộp U100 — màu GS"), "rayhopu100maugs");
});

const CATALOG = [
  { item_code: "AL548", item_name: "Nan nhôm AL548" },
  { item_code: "AL752", item_name: "Nan nhôm AL752" },
  { item_code: "RHU100", item_name: "Ray hộp U100" },
  { item_code: "MT-500", item_name: "Mô tơ 500kg" },
];

test("khớp mã hàng: đúng mã, rồi đúng tên, rồi chứa nhau", () => {
  assert.deepEqual(matchItem("AL548", CATALOG), { item_code: "AL548", confidence: "code" });
  assert.deepEqual(matchItem("al 548", CATALOG), { item_code: "AL548", confidence: "code" });
  assert.deepEqual(matchItem("Nan nhôm AL752", CATALOG), { item_code: "AL752", confidence: "name" });
  assert.deepEqual(matchItem("RAY HỘP U100 màu GS", CATALOG), { item_code: "RHU100", confidence: "contains" });
});

test("khớp mơ hồ thì TRẢ VỀ KHÔNG KHỚP, không đoán bừa", () => {
  // Hai ứng viên = không biết chọn cái nào. Một ô trống là câu hỏi cho người soát;
  // một mã đoán bừa là câu trả lời sai mà không ai đọc lại.
  assert.equal(matchItem("nan nhôm", CATALOG), null);
  assert.equal(matchItem("mã lạ hoắc", CATALOG), null);
  assert.equal(matchItem("", CATALOG), null);
});

test("mã quá ngắn không được khớp kiểu chứa nhau", () => {
  // "S2" nằm trong gần như mọi chuỗi; để nó khớp là mọi dòng đều thành mã đó.
  const catalog = [{ item_code: "S2", item_name: "Ốc vít" }, { item_code: "AL548" }];
  assert.equal(matchItem("thanh nhôm S2000 loại dày", catalog), null);
});

test("đơn vị lạ bị bỏ, không bịa ra đơn vị mới", () => {
  assert.equal(normaliseUom("cây"), "Cây");
  assert.equal(normaliseUom("KG"), "Kg");
  assert.equal(normaliseUom("m"), "Mét");
  assert.equal(normaliseUom("thùng"), undefined);
});

test("dựng dòng hàng: số đọc được thì điền, mã không chắc thì để TRỐNG", () => {
  const rows = buildRows({
    items: [
      { item: "AL548", qty: "20", uom: "cây", rate: "98.000" },
      { item: "hàng gì đó không có trong danh mục", qty: "5", rate: "1.500.000" },
      { item: "Ray hộp U100", qty: "2,5", uom: "m", rate: "165.000" },
    ],
  }, CATALOG);

  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { raw_text: "AL548", item_code: "AL548", confidence: "code", qty: 20, uom: "Cây", rate: 98000, note: "AL548" });
  // Không khớp được mã → KHÔNG có item_code, nhưng chữ gốc và số vẫn giữ để người soát dùng.
  assert.equal(rows[1].item_code, undefined);
  assert.equal(rows[1].rate, 1500000);
  assert.equal(rows[1].raw_text, "hàng gì đó không có trong danh mục");
  assert.equal(rows[2].item_code, "RHU100");
  assert.equal(rows[2].qty, 2.5);
});

test("dòng không đọc được tên hàng thì bỏ hẳn, không tạo dòng rỗng", () => {
  const rows = buildRows({ items: [{ qty: "3", rate: "1.000" }, { item: "  " }, { item: "AL548" }] }, CATALOG);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].item_code, "AL548");
});

test("JSON bọc trong ``` hoặc kèm lời dẫn vẫn lôi ra được", () => {
  assert.deepEqual(extractJson('```json\n[{"item":"AL548"}]\n```'), [{ item: "AL548" }]);
  assert.deepEqual(extractJson('Đây là kết quả:\n{"items":[]}'), { items: [] });
  // Không có gì đọc được → null, để nơi gọi báo một câu tử tế thay vì ném lỗi cú pháp.
  assert.equal(extractJson("xin lỗi tôi không đọc được ảnh"), null);
  assert.equal(extractJson(""), null);
});
