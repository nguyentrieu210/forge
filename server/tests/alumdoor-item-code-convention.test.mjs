import test from "node:test";
import assert from "node:assert/strict";
import {
  ALUMDOOR_CODE_MAX_LENGTH,
  ALUMDOOR_CODE_PREFIXES,
  buildCodeMapping,
  canonicalItemCode,
  normalizeCodeText,
  resolveCodePrefix,
  violatesCodeConvention,
} from "../scripts/lib/alumdoor-item-code-convention.mjs";

/**
 * Mọi con số và ví dụ dưới đây lấy từ `docs/ALUMDOOR-QUY-UOC-MA.md` (chốt 2026-07-29) hoặc từ
 * mã thật đang chạy trên D1 local — không phải chạy code rồi chép kết quả ra.
 */

const item = (over) => ({
  item_code: "X", item_name: "X", item_group: "Phụ kiện chung", item_nature: "Hàng tồn kho", ...over,
});

test("mười tiền tố, đúng như §2", () => {
  assert.deepEqual([...ALUMDOOR_CODE_PREFIXES],
    ["NHOM", "CUA", "RAY", "TRUC", "MOTO", "PIN", "LUOI", "PK", "VT", "DV"]);
  assert.equal(ALUMDOOR_CODE_MAX_LENGTH, 24);
});

test("chuẩn hoá về bảng chữ cho phép, GIỮ dấu chấm trong số đo", () => {
  assert.equal(normalizeCodeText("TP-UC KT 4.6D XN-VK"), "TP-UC-KT-4.6D-XN-VK");
  assert.equal(normalizeCodeText("NVL-TRUC114_2.4LY"), "NVL-TRUC114-2.4LY");
  assert.equal(normalizeCodeText("TP-TD-AL70 (2 LỚP)"), "TP-TD-AL70-2-LOP");
  // "đổi 4.6D thành 46D là bắt người ta dịch lại trong đầu mỗi lần"
  assert.match(normalizeCodeText("CUA-KT-4.6D"), /4\.6D/);
});

test("màu rời khỏi mã — cả viết tắt cũ lẫn dạng slug", () => {
  const of = (code, group = "Nan/lá cửa") => canonicalItemCode(item({ item_code: code, item_name: code, item_group: group })).code;
  assert.equal(of("NVL-AL595-GS"), "NHOM-AL595");
  assert.equal(of("NVL-AL595-VK"), "NHOM-AL595");
  assert.equal(of("NVL-AL595-THO"), "NHOM-AL595");
  assert.equal(of("NVL-AL595-XANH_NGOC"), "NHOM-AL595");
});

test("năm mã cũ của AL595 gộp về đúng một mã — ví dụ chốt ở §5", () => {
  const rows = ["AL595", "TD-AL595", "NVL-AL595-GS", "NVL-AL595-VK", "NVL_TDAL595THO"]
    .map((code) => item({ item_code: code, item_name: "AL595", item_group: "Nan/lá cửa" }));
  const mapping = buildCodeMapping(rows);
  assert.equal(mapping.summary.source_count, 5);
  assert.equal(mapping.summary.canonical_count, 1);
  assert.ok(mapping.families.has("NHOM-AL595"));
});

test("cách bán và bậc diện tích rời khỏi mã", () => {
  const of = (code) => canonicalItemCode(item({ item_code: code, item_name: code, item_group: "Cửa Đài Loan" })).code;
  // Nhồi TRONBO vào mã là dựng lại Sales Option qua cửa sau.
  assert.equal(of("TP-CUADL1LY XN-VK_TRONBO_4-5m²"), "CUA-CUADL1LY");
  assert.equal(of("TP-CUADL1LY XN-VK_TRONBO>10m²"), "CUA-CUADL1LY");
  assert.equal(of("TP-CUADL1LY XN-XLC_TRONBO_3-4m²"), "CUA-CUADL1LY");
});

test("token nhà cung cấp rời khỏi mã — §2 luật 4", () => {
  // "tiền tố nói món đó LÀ GÌ, không nói nó đến từ đâu hay ai bán"
  const of = (code, group) => canonicalItemCode(item({ item_code: code, item_name: code, item_group: group })).code;
  assert.equal(of("TP-TD-AL70 GS", "Cửa CN Đức"), "CUA-AL70");
  assert.equal(of("TP-ALD-548N GS", "Cửa CN Đức"), "CUA-548N");
});

test("dòng sản phẩm THẮNG gợi ý vật liệu trong tên", () => {
  // TP-TOLEKEM124 là CỬA thành phẩm bán theo m², chỉ tình cờ làm bằng tôn.
  const door = item({ item_code: "TP-TOLEKEM124_6D", item_name: "CỬA TÔN KẼM 124", item_group: "Cửa Đài Loan" });
  assert.equal(resolveCodePrefix(door).prefix, "CUA");
  // Cùng chữ TOLE nhưng nằm ở nhóm cấu kiện thì là vật tư.
  const sheet = item({ item_code: "NVL-TOLEKEM124", item_name: "TÔN KẼM 124", item_group: "Nan/lá cửa" });
  assert.equal(resolveCodePrefix(sheet).prefix, "VT");
});

test("một nhóm hai tiền tố: Ray và trục tách theo tên", () => {
  const ray = item({ item_code: "TP-RAYHOP", item_name: "RAY HỘP TD U76", item_group: "Ray và trục" });
  const truc = item({ item_code: "NVL-TRUC114_2.4LY", item_name: "TRỤC 114 2.4LY", item_group: "Ray và trục" });
  assert.equal(resolveCodePrefix(ray).prefix, "RAY");
  // `\b` giữa chữ và số KHÔNG khớp — mã viết liền số từng lọt qua đúng chỗ này.
  assert.equal(resolveCodePrefix(truc).prefix, "TRUC");
});

test("token trùng nghĩa với tiền tố bị bỏ — ví dụ chốt MOTO-TANKER-600", () => {
  const motor = item({ item_code: "TP-MT-TANKER600KG", item_name: "MOTOR TANKER 600KG", item_group: "Motor" });
  assert.equal(canonicalItemCode(motor).code, "MOTO-TANKER600");
});

test("dịch vụ và phụ thu đi vào DV", () => {
  const fee = item({ item_code: "PHUTHU_SONRAY_MSK", item_name: "Phụ thu sơn ray", item_group: "Phụ kiện chung" });
  assert.equal(resolveCodePrefix(fee).prefix, "DV");
  const service = item({ item_code: "CONGLAP", item_name: "Công lắp đặt", item_nature: "Dịch vụ" });
  assert.equal(resolveCodePrefix(service).prefix, "DV");
});

test("bộ dò vi phạm bắt đủ bốn luật cứng", () => {
  assert.deepEqual(violatesCodeConvention("CUA-KT-4.6D"), []);
  assert.ok(violatesCodeConvention("CUA KT").includes("có khoảng trắng"));
  assert.ok(violatesCodeConvention("cua-kt").some((p) => p.includes("chữ thường")));
  assert.ok(violatesCodeConvention("CUA_KT").some((p) => p.includes("_")));
  assert.ok(violatesCodeConvention("CUA-ĐỨC").some((p) => p.includes("dấu tiếng Việt")));
  assert.ok(violatesCodeConvention("TP-ABC").some((p) => p.includes("ngoài 10 tiền tố")));
  assert.ok(violatesCodeConvention(`CUA-${"A".repeat(30)}`).some((p) => p.includes("dài")));
});

test("không suy được tiền tố thì TRẢ NULL, không chọn bừa", () => {
  // Mã hàng là khoá bản ghi; đoán sai một tiền tố là gán sai danh tính vĩnh viễn.
  const orphan = item({ item_code: "ABC123", item_name: "ABC123", item_group: "" });
  const resolved = resolveCodePrefix(orphan);
  assert.equal(resolved.prefix, null);
  assert.match(resolved.why, /không có nhóm hàng/);
  assert.equal(canonicalItemCode(orphan).code, null);
});

test("mã quá dài được BÁO chứ không bị cắt bừa", () => {
  const long = item({
    item_code: "TP-BO 2VIS AL50-VIP50-AL548-ST500",
    item_name: "BỌ 2VIS", item_group: "Nan/lá cửa",
  });
  const result = canonicalItemCode(long);
  assert.ok(result.code.length > ALUMDOOR_CODE_MAX_LENGTH);
  assert.ok(result.warnings.some((w) => w.startsWith("dài ")));
});

test("TD ở ĐUÔI là TỰ DỪNG, không phải nhà cung cấp — không được gộp", () => {
  // Bảng ánh xạ 19/08 bắt được: `...CRON+TD` bị gộp vào `...CRON`, mất hẳn một biến thể.
  const withStop = item({
    item_code: "NVL-TOLE1.4x270x1.4ly-CRON+TD",
    item_name: "RAY SẮT U100-1.4ly (CÓ RON+TỰ DỪNG)", item_group: "Ray và trục",
  });
  const withoutStop = item({
    item_code: "NVL-TOLE1.4x270x1.4ly-CRON",
    item_name: "RAY SẮT U100-1.4ly (CÓ RON)", item_group: "Ray và trục",
  });
  assert.notEqual(canonicalItemCode(withStop).code, canonicalItemCode(withoutStop).code);
  assert.match(canonicalItemCode(withStop).code, /TD$/);
  // Nhưng TD ở ĐẦU vẫn phải rời đi.
  const supplier = item({ item_code: "TP-TD-AL595", item_name: "AL595", item_group: "Nan/lá cửa" });
  assert.equal(canonicalItemCode(supplier).code, "NHOM-AL595");
});
