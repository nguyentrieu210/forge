import assert from "node:assert/strict";
import test from "node:test";
import {
  CAN_KHO_NHAP,
  CAN_KHO_XUAT,
  LOAI_PHIEU_KHO,
  kiemTraPhieuKho,
} from "../dist/stock-entry-kiem-tra.js";

const dongTot = [{ item_code: "PKC_V4_STD", qty: "5" }];
const base = {
  purpose: "Material Issue",
  company: "ALUMDOOR",
  sourceWarehouse: "Kho xưởng",
  targetWarehouse: "",
  rows: dongTot,
};

test("phiếu xuất vật tư đủ ô thì lưu được", () => {
  assert.equal(kiemTraPhieuKho(base), "");
});

test("thiếu công ty thì nói thẳng thiếu công ty", () => {
  assert.match(kiemTraPhieuKho({ ...base, company: "" }), /công ty/i);
});

test("xuất vật tư mà không có kho xuất thì chặn", () => {
  assert.match(kiemTraPhieuKho({ ...base, sourceWarehouse: "" }), /kho xuất/i);
});

test("nhập kho đòi kho NHẬP chứ không đòi kho xuất", () => {
  const nhap = { ...base, purpose: "Material Receipt", sourceWarehouse: "", targetWarehouse: "Kho xưởng" };
  assert.equal(kiemTraPhieuKho(nhap), "");
  assert.match(kiemTraPhieuKho({ ...nhap, targetWarehouse: "" }), /kho nhập/i);
});

test("chuyển kho mà hai kho trùng nhau thì chặn — chuyển đi đâu cả", () => {
  const chuyen = { ...base, purpose: "Material Transfer", sourceWarehouse: "Kho xưởng", targetWarehouse: "Kho xưởng" };
  assert.match(kiemTraPhieuKho(chuyen), /trùng/i);
  assert.equal(kiemTraPhieuKho({ ...chuyen, targetWarehouse: "Kho đầu thừa" }), "");
});

test("phiếu không có dòng nào thì chặn", () => {
  assert.match(kiemTraPhieuKho({ ...base, rows: [] }), /dòng vật tư/i);
  assert.match(kiemTraPhieuKho({ ...base, rows: [{ item_code: "   ", qty: "5" }] }), /dòng vật tư/i);
});

test("số lượng không hợp lệ thì chỉ đích danh dòng nào", () => {
  for (const qty of ["", "0", "-3", "abc"]) {
    const loi = kiemTraPhieuKho({ ...base, rows: [{ item_code: "RT_TR114_1.8", qty }] });
    assert.match(loi, /RT_TR114_1\.8/, `qty=${JSON.stringify(qty)} phải bị chặn`);
  }
});

/**
 * Chốt chặn thật sự của test này: DocType khai NĂM loại nhưng server chỉ thi hành bốn, và
 * "Điều chỉnh tồn" là loại luôn nổ. Nếu ai đó thêm nó vào danh sách mà chưa làm phía server thì
 * test đỏ ngay, thay vì để chủ xưởng bấm rồi ăn lỗi khó hiểu.
 */
test("Điều chỉnh tồn và Manufacture KHÔNG lập tay được ở màn này", () => {
  for (const purpose of ["Điều chỉnh tồn", "Manufacture"]) {
    assert.equal(LOAI_PHIEU_KHO.some((entry) => entry.ma === purpose), false, `${purpose} không được nằm trong danh sách`);
    assert.match(kiemTraPhieuKho({ ...base, purpose }), /không lập tay được/);
  }
});

test("bảng kho xuất/kho nhập khớp với danh sách loại phiếu", () => {
  for (const entry of LOAI_PHIEU_KHO) {
    assert.ok(
      CAN_KHO_XUAT.has(entry.ma) || CAN_KHO_NHAP.has(entry.ma),
      `${entry.ma} không đòi kho nào cả — phiếu kho mà không có kho thì ghi vào đâu`,
    );
  }
});
