import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SOURCE = resolve(ROOT, "server/briefs/alumdoor.json");
const GENERATED = resolve(ROOT, "server/briefs/alumdoor-v2.json");
const GENERATOR = resolve(ROOT, "server/scripts/build-alumdoor-v2-brief.mjs");
const nameOf = (field) => typeof field === "string" ? field.split(":", 1)[0].trim() : field.fieldname;
const doc = (brief, name) => brief.doctypes.find((entry) => entry.name === name);
const field = (brief, doctype, fieldname) => doc(brief, doctype)?.fields?.find((entry) => nameOf(entry) === fieldname);

test("bộ sinh brief chỉ lệch đúng phần đã kiểm kê, và vẫn giữ nguyên hợp đồng runtime", (t) => {
  // Sinh ra thư mục tạm: test KHÔNG được ghi đè brief trong cây làm việc. Bản cũ ghi thẳng
  // vào `briefs/alumdoor-v2.json`, nên một lần chạy là mất phần sửa tay chưa có trong bộ sinh
  // (màn "Kho giao hàng nhiều đơn", các trường PB ray/nhựa của Quotation Item...) mà vẫn xanh
  // ở lần chạy kế tiếp vì lúc đó nó so với chính bản nó vừa ghi.
  const workspace = mkdtempSync(resolve(tmpdir(), "alumdoor-v2-brief-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const out = resolve(workspace, "alumdoor-v2.json");
  const committed = readFileSync(GENERATED, "utf8");
  execFileSync(process.execPath, [GENERATOR, "--out", out], { cwd: ROOT, stdio: "pipe" });
  const after = readFileSync(out, "utf8");
  /*
   * Trước đây chỗ này đòi "không lệch một byte". Đòi thế là nói dối: bộ sinh đã tụt lại 73 mục
   * so với brief soạn tay, và nó đỏ suốt mà không ai đọc ra nó đỏ vì CÁI GÌ. Tệ hơn: một cái
   * đỏ triền miên thì người ta thôi nhìn, nên lệch MỚI cũng chìm luôn.
   *
   * Nay đối chiếu với bản kiểm kê `alumdoor-v2.generator-drift.json`. Lệch đang biết thì im;
   * lệch MỚI — thêm fixture mà quên bộ sinh, hay bộ sinh đẻ ra thứ brief không có — là đỏ ngay,
   * kèm tên cụ thể. Danh sách kiểm kê phải TEO DẦN: chuyển được mục nào vào bộ sinh thì xoá đi.
   *
   * Chừng nào còn mục trong đó thì chạy bộ sinh rồi ghi đè `briefs/alumdoor-v2.json` là MẤT
   * đúng từng ấy quyết định.
   */
  const generated = JSON.parse(after);
  const authored = JSON.parse(committed);
  const drift = JSON.parse(readFileSync(resolve(ROOT, "server/briefs/alumdoor-v2.generator-drift.json"), "utf8"));
  const key = (entry) => `${entry.type}|${entry.name}`;
  const genFix = new Map(generated.fixtures.map((entry) => [key(entry), entry]));
  const authFix = new Map(authored.fixtures.map((entry) => [key(entry), entry]));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  assert.deepEqual(
    [...authFix.keys()].filter((k) => !genFix.has(k)).sort(),
    drift.fixtures_brief_co_generator_khong_sinh,
    "fixture trong brief mà bộ sinh không đẻ ra — lệch mới thì thêm vào bộ sinh, đừng thêm vào kiểm kê",
  );
  assert.deepEqual(
    [...genFix.keys()].filter((k) => !authFix.has(k)).sort(),
    drift.fixtures_generator_sinh_brief_khong_co,
    "bộ sinh đẻ ra fixture brief không có",
  );
  assert.deepEqual(
    [...authFix.keys()].filter((k) => genFix.has(k) && !same(genFix.get(k), authFix.get(k))).sort(),
    drift.fixtures_hai_ben_khac_noi_dung,
    "fixture hai bên khác nội dung",
  );
  const genDoc = new Map(generated.doctypes.map((entry) => [entry.name, entry]));
  assert.deepEqual(
    authored.doctypes.filter((d) => !same(genDoc.get(d.name), d)).map((d) => d.name).sort(),
    drift.doctypes_khac,
    "doctype hai bên khác nhau",
  );
  assert.deepEqual(
    [...new Set([...Object.keys(generated), ...Object.keys(authored)])]
      .filter((k) => !["fixtures", "doctypes"].includes(k) && !same(generated[k], authored[k])).sort(),
    drift.khoa_cap_mot_khac,
    "khoá cấp một hai bên khác nhau",
  );
  for (const required of ["Tỉnh Thành", "Phường Xã", "Địa chỉ giao lắp", "Tài khoản ngân hàng", "Credit Note", "Credit Note Item"])
    assert.ok(doc(generated, required), `missing regenerated ${required}`);
  for (const required of [
    ["Customer", "install_province"], ["Customer", "install_ward"], ["Customer", "install_address_line1"],
    ["Price List", "customer_group"], ["Sales Order Item", "discount_percentage"],
    ["Sales Order", "bank_account"], ["Sales Order", "contact_person"], ["Sales Order", "phone"],
    ["Sales Order", "install_province"], ["Sales Order", "install_ward"], ["Sales Order", "shipping_note"],
    ["Cutting Policy", "geometry_profile"], ["Cutting Policy", "geometry_rules"], ["Cut Order Item", "source_batch_no"],
  ]) assert.ok(field(generated, ...required), `missing regenerated ${required.join(".")}`);

  for (const lineDoctype of ["Quotation Item", "Sales Order Item"]) {
    assert.ok(field(generated, lineDoctype, "width_pb_ray_m"), `${lineDoctype} missing width_pb_ray_m`);
    assert.ok(field(generated, lineDoctype, "width_pb_nhua_m"), `${lineDoctype} missing width_pb_nhua_m`);
    const rate = field(generated, lineDoctype, "rate");
    assert.equal(rate?.read_only, true, `${lineDoctype}.rate must stay read-only`);
    assert.equal(rate?.serverEnforced, true, `${lineDoctype}.rate must stay server-enforced`);
  }
  assert.equal(field(generated, "Item", "gift_rail_min_area_sqm")?.default, 8);
  assert.equal(field(generated, "Item", "gift_rail_area_operator")?.default, "GT");

  const fixture = (type, name) => generated.fixtures.find((entry) => entry.type === type && entry.name === name);
  assert.equal(fixture("Ngưỡng chọn Motor", "MOTO-TANKER-400")?.data.item_code, "MT_TANKER400KG");
  assert.equal(fixture("Ngưỡng chọn Motor", "MOTO-TANKER-800")?.data.item_code, "MT_TANKE800KG");
  assert.equal(fixture("Ngưỡng chọn Motor", "PIN-E800")?.data.item_code, "BLD_UPS_E800I");
  const giftRail = fixture("BOM Rule", "BOMR-RAY-HOP-TD-DUC");
  assert.equal(giftRail?.data.applicability?.[0]?.min_area_sqm, 8);
  assert.equal(giftRail?.data.applicability?.[0]?.min_area_operator, "GT");
  const batchCustomFields = generated.customFields?.Batch ?? [];
  const batchCustomNames = batchCustomFields.map((entry) => nameOf(typeof entry === "object" && entry?.field ? entry.field : entry));
  for (const alumdoorField of ["color", "condition", "length_m", "is_offcut"]) {
    assert.ok(batchCustomNames.includes(alumdoorField), `Batch.${alumdoorField} must remain an Alumdoor custom field`);
  }
  for (const dt of generated.doctypes) {
    /**
     * `sales_option` vẫn bị cấm; `sales_mode` thì KHÔNG — hai thứ khác nhau.
     *
     * Commit 46cff213 khai tử DANH MỤC "Cách bán" (`Sales Option`/`Sales Package`) cùng package
     * resolver và split-pricing. Nó không nói gì về `sales_mode`, và `SALES-BOM-SOURCE-MAP §5`
     * nói ngược lại: "trọn bộ / chỉ lá / tách món quyết định PHẠM VI CẤU PHẦN được giao/sinh
     * ra, không được mặc định đồng nhất với một danh mục cách bán".
     *
     * Bản cũ của test này gộp cả hai. Hệ quả đo được: cách giao không có chỗ trên dòng bán nên
     * nó bò vào MÃ HÀNG — 94 mặt hàng mang `TRONBO`/`TACHMON` ngay trong mã, mỗi biến thể một
     * BOM Template riêng. Đó chính là `Sales Package` quay lại ở tầng khó gỡ nhất.
     *
     * Từ 2026-08-19 `sales_mode` là Select hai giá trị trên dòng bán, mặc định "Trọn bộ", KHÔNG
     * Link tới doctype nào. Doctype khai tử vẫn phải vắng mặt — dòng dưới giữ nguyên.
     */
    assert.ok(!["Sales Option", "Sales Package"].includes(dt.name), `deprecated doctype ${dt.name}`);
    for (const f of dt.fields ?? []) assert.ok(nameOf(f) !== "sales_option", `deprecated ${dt.name}.${nameOf(f)}`);
    for (const f of dt.list ?? []) assert.ok(f !== "sales_option", `deprecated ${dt.name}.list:${f}`);
    for (const f of dt.search ?? []) assert.ok(f !== "sales_option", `deprecated ${dt.name}.search:${f}`);
  }
  const stockReturn = doc(generated, "Stock Return");
  for (const required of ["party_doctype", "party", "return_against_doctype", "return_against"])
    assert.ok(stockReturn.fields.some((entry) => nameOf(entry) === required), `Stock Return missing ${required}`);
  assert.ok(generated.actions.some((entry) => entry.name === "don-ban-thanh-hoa-don"));
  assert.ok(generated.validators.some((entry) => entry.doctype === "Stock Return"));
});

test("alumdoor source owns tấm liền Úc and canonical Item Color keys", () => {
  const source = JSON.parse(readFileSync(SOURCE, "utf8"));
  const policy = source.fixtures.find((entry) => entry.type === "Cutting Policy" && entry.name === "Cửa tấm liền Úc — công thức chuẩn");
  assert.ok(policy);
  assert.equal(policy.data.leaf_formula, "Kiểu tấm liền Úc");
  assert.equal(policy.data.leaf_divisor_const, 0.068);
  for (const color of source.fixtures.filter((entry) => entry.type === "Item Color")) {
    assert.ok(!Object.hasOwn(color.data, "finish"), `${color.name} still uses legacy finish key`);
    assert.ok(Object.hasOwn(color.data, "surface_finish"), `${color.name} missing surface_finish`);
  }
});
