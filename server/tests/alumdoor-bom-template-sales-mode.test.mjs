import test from "node:test";
import assert from "node:assert/strict";
import { bomFingerprint, parseBomTemplateRecord } from "../dist/apps-src/alumdoor-worker/src/bom-template-materializer.js";
import { resolveBomTemplateComposition } from "../dist/apps-src/alumdoor-worker/src/bom-template-core.js";
import { previewDraftSalesBomRequirements } from "../dist/apps-src/alumdoor-worker/src/sales-production-core.js";
import {
  buildSalesBomCompositionTemplates,
  resolveSalesMode,
  salesBomCompositionSignature,
  salesModeTemplateCode,
  salesModeTemplateKeys,
  bomTemplateMetaCompositionGaps,
  SALES_BOM_COMPOSITION_STATUS,
} from "../scripts/lib/alumdoor-sales-bom-composition.mjs";
import { buildCodeMapping, structuralDrops } from "../scripts/lib/alumdoor-item-code-convention.mjs";
import { parseAlumdoorIndexedMarkdownRows } from "../scripts/lib/alumdoor-source-markdown.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Một mặt hàng, hai định mức: trọn bộ và tách món.
 *
 * Đo trên D1 2026-08-19: `TP-LUOI-SN13x26-STD - TRONBO` có BOM Template **5 cấu phần** còn
 * `- TACHMON` chỉ có **1**. Hai bộ cấu phần khác nhau thật — nhưng chúng là HAI MẶT HÀNG, vì
 * khi `Sales Package` bị khai tử ở `46cff213` thì fact "phạm vi cấu phần được giao" không còn
 * chỗ nào trên dòng bán nên nó bò vào mã hàng.
 *
 * Cột `BOM Template.sales_mode` là đường về: một mặt hàng giữ được hai định mức, và luật chọn
 * template sẵn có (specificity → priority → modified) tự phân giải.
 */

const template = (over = {}) => ({
  name: "BT-1",
  template_code: "BT-1",
  item_code: "LUOI-SN13X26",
  component_rules: [],
  ...over,
});

test("cột sales_mode trở thành một điều kiện, không phải cơ chế thứ hai", () => {
  const parsed = parseBomTemplateRecord(template({ sales_mode: "Trọn bộ" }));
  assert.deepEqual(parsed.conditions, { sales_mode: "Trọn bộ" });
});

test("bỏ trống thì áp cho mọi cách giao — giữ nguyên hành vi cũ", () => {
  assert.deepEqual(parseBomTemplateRecord(template()).conditions, {});
  assert.deepEqual(parseBomTemplateRecord(template({ sales_mode: "" })).conditions, {});
});

test("bản khai rõ cách giao có specificity cao hơn bản chung", () => {
  // Luật chọn template xếp theo số điều kiện; nhờ vậy bản trọn bộ thắng bản chung mà không
  // cần thêm luật riêng nào.
  const specific = parseBomTemplateRecord(template({ sales_mode: "Tách món" }));
  const generic = parseBomTemplateRecord(template());
  assert.ok(Object.keys(specific.conditions).length > Object.keys(generic.conditions).length);
});

test("cột và conditions_json khai lệch nhau thì TỪ CHỐI, không đoán", () => {
  // Hai chỗ khai cùng một luật là mầm trôi dạt; ở đây nó bị bắt ngay lúc đọc.
  assert.throws(
    () => parseBomTemplateRecord(template({
      sales_mode: "Trọn bộ",
      conditions_json: JSON.stringify({ sales_mode: "Tách món" }),
    })),
    /cách giao khai hai nơi lệch nhau/,
  );
});

test("cột và conditions_json khai TRÙNG nhau thì chấp nhận", () => {
  const parsed = parseBomTemplateRecord(template({
    sales_mode: "Trọn bộ",
    conditions_json: JSON.stringify({ sales_mode: "Trọn bộ", door_type: "Cửa Lưới" }),
  }));
  assert.deepEqual(parsed.conditions, { sales_mode: "Trọn bộ", door_type: "Cửa Lưới" });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * BỐN ĐIỂM CHẶN trên đường "gộp 100 mã, chuyển cách giao lên dòng bán"
 *
 * Cột `sales_mode` đứng một mình không gộp được mã nào. Đo trên nguồn gốc `ms-lien/ĐM.md`
 * (2.115 dòng, 358 mã cha phân biệt, 235 mã cấu phần, 569 mã kể cả `app-vat-tu/BaoCao.md`):
 *
 *  100/358  mã cha nhồi cách giao vào mã: 94 `TRONBO` + 2 `TACHMON` + 4 hậu tố ` - TM`
 *    0/235  mã CẤU PHẦN nhồi cách giao — không có mã nào
 *    6      họ mã có ĐỦ CẢ HAI biến thể — gộp mà không có `sales_mode` là mất một bộ cấu phần
 *   13 → 7  số họ bị chặn gộp, trước và sau khi trục cách giao được mở
 *
 * Ba con số đầu KHÔNG còn nằm trong lời bình suông: bài "SỐ ĐO NGUỒN" ở cuối file đọc thẳng
 * `ĐM.md` và assert chúng, vì bản trước ghi 86/355, 5 họ, 12→7 mà cả bộ kiểm vẫn xanh.
 *
 * Mỗi bài dưới đây khoá đúng một điểm chặn.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

const composition = (boms) => buildSalesBomCompositionTemplates({
  format: "alumdoor-canonical-bom-importable/v2",
  source: { workbook: "ms-lien/ĐM.md" },
  boms,
});

test("CHẶN 2 · cách giao đọc từ TRƯỜNG KHAI, không phải từ chuỗi trong mã", () => {
  // Đây là cả mục đích của việc gộp mã: mã sạch token thì cách bới chuỗi trả về rỗng và toàn
  // bộ danh sách cấu thành biến mất im lặng. Trường khai báo phải đủ để dựng template.
  const templates = composition([
    { item: "LUOI-SN13X26", sales_mode: "Trọn bộ", lines: [{ item_code: "NVL-TRUC114_1.8LY" }] },
  ]);
  assert.equal(templates.length, 1);
  assert.equal(resolveSalesMode({ item: "LUOI-SN13X26", sales_mode: "Trọn bộ" }).evidence, "khai trên bản ghi");
  // Nhưng KHÔNG ghi cột: mặt hàng này chỉ có một định mức, xem bài "MỘT ĐỊNH MỨC" bên dưới.
  assert.equal("sales_mode" in templates[0], false);
});

test("MỘT ĐỊNH MỨC · không khai cách giao lên bản ghi, vì khai là tự chặn chính mình", () => {
  /**
   * Đây là lỗi CHẶN VẬN HÀNH mà bài này khoá lại.
   *
   * Ghi cột `sales_mode` lên mọi mã có cách giao thì `parseBomTemplateRecord` gộp cột vào
   * `conditions`, và dòng bán để trống Cách giao được worker bơm "Trọn bộ" — nên 6 mã TÁCH MÓN
   * mất sạch template. Chạy thật: dựng BOM cho `- TACHMON` NÉM "không khớp cấu hình".
   *
   * Mặt hàng chỉ có MỘT định mức thì điều kiện thêm vào chỉ có thể LOẠI, không bao giờ chọn
   * đúng hơn — nên để trống.
   */
  const [split] = composition([
    { item: "TP-LUOI-SN13x26-STD - TACHMON", lines: [{ item_code: "TP-LUOISN13x26_STD" }] },
  ]);
  assert.equal("sales_mode" in split, false);
  assert.deepEqual(JSON.parse(split.conditions_json), { item_code: "TP-LUOI-SN13x26-STD - TACHMON" });

  const parsed = parseBomTemplateRecord({ name: "BT-TM", ...split });
  assert.deepEqual(parsed.conditions, { item_code: "TP-LUOI-SN13x26-STD - TACHMON" });
  // Dòng bán để trống Cách giao ⇒ worker bơm "Trọn bộ". Template vẫn phải xổ được.
  const components = resolveBomTemplateComposition({
    templates: [parsed],
    context: { item_code: "TP-LUOI-SN13x26-STD - TACHMON", sales_mode: "Trọn bộ" },
  }).components.map((row) => row.item_code);
  assert.deepEqual(components, ["TP-LUOISN13x26_STD"]);
});

test("CHẶN 2 · hậu tố ` - TM` cũng là TÁCH MÓN — nguồn viết ba kiểu cho một fact", () => {
  // Đo trên 569 mã của `ĐM.md` + `app-vat-tu/BaoCao.md`: 4 mã chỉ dùng ` - TM`, không viết
  // `TACHMON`. Bỏ sót thì 4 định mức tách món không bao giờ sinh ra template.
  assert.equal(resolveSalesMode({ item: "TP-LUOI-MV-STD - TM" }).mode, "Tách món");
  assert.equal(resolveSalesMode({ item: "TP-LUOIMV-INOX- TM" }).mode, "Tách món");
  assert.equal(resolveSalesMode({ item: "TP-LUOI-SN13x26-STD - TACHMON" }).mode, "Tách món");
  assert.equal(resolveSalesMode({ item: "TP-LUOI-SN13x26-STD - TRONBO" }).mode, "Trọn bộ");
  // `TM` chỉ tính ở CUỐI mã — hai chữ quá ngắn để nhận ở giữa.
  assert.equal(resolveSalesMode({ item: "NVL-TM-RAYHOP" }).mode, null);
});

test("CHẶN 2 · trường khai lệch với mã thì TỪ CHỐI, không chọn bên nào", () => {
  assert.throws(
    () => resolveSalesMode({ item: "TP-LUOI-SN13x26-STD - TRONBO", sales_mode: "Tách món" }),
    /cách giao khai hai nơi lệch nhau/,
  );
  assert.throws(() => resolveSalesMode({ item: "X", sales_mode: "Trọn gói" }), /không thuộc/);
});

test("CHẶN 2 · bản TÁCH MÓN cũng được dựng template, không chỉ bản TRỌN BỘ", () => {
  // Trước đây bộ dựng chỉ giữ mã có chuỗi `TRONBO`, nên 6 định mức tách món của nguồn không
  // có template nào. Gộp mã trong tình trạng đó = mất hẳn phần tách món.
  const templates = composition([
    { item: "TP-LUOI-SN13x26-STD - TACHMON", lines: [{ item_code: "TP-LUOISN13x26_STD" }] },
  ]);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].item_code, "TP-LUOI-SN13x26-STD - TACHMON");
  assert.equal(resolveSalesMode({ item: "TP-LUOI-SN13x26-STD - TACHMON" }).mode, "Tách món");
});

test("CHẶN 3 · conditions_json mang sales_mode khi — và chỉ khi — có hai định mức", () => {
  const templates = composition([
    { item: "LUOI-SN13X26", sales_mode: "Trọn bộ", lines: [{ item_code: "NVL-TRUC114_1.8LY" }] },
    { item: "LUOI-SN13X26", sales_mode: "Tách món", lines: [{ item_code: "TP-LUOISN13x26_STD" }] },
  ]);
  const full = templates.find((row) => row.sales_mode === "Trọn bộ");
  assert.deepEqual(JSON.parse(full.conditions_json), {
    item_code: "LUOI-SN13X26",
    sales_mode: "Trọn bộ",
  });
  // Materializer ném lỗi khi cột và conditions_json lệch; qua được nghĩa là hai chỗ khớp.
  const parsed = parseBomTemplateRecord({ name: "BT-9", ...full });
  assert.deepEqual(parsed.conditions, { item_code: "LUOI-SN13X26", sales_mode: "Trọn bộ" });
  // Hai điều kiện ⇒ specificity 2, thắng bản chung khai `conditions` rỗng.
  assert.equal(Object.keys(parsed.conditions).length, 2);
  assert.deepEqual(JSON.parse(full.required_context_fields_json), ["item_code", "sales_mode"]);
});

test("CHẶN 3 · chữ ký phân biệt hai cách giao của CÙNG mặt hàng", () => {
  // Chữ ký cũ chỉ tính (mã, cấu phần). Hai template cùng mặt hàng, cùng cấu phần, khác cách
  // giao sẽ TRÙNG chữ ký — bộ nhập coi là một và cho một bản nghỉ hưu nhầm.
  // Phải dựng CHUNG một lô: cách giao chỉ lên bản ghi khi mặt hàng có đủ hai định mức.
  const [full, split] = composition([
    { item: "LUOI-SN13X26", sales_mode: "Trọn bộ", lines: [{ item_code: "NVL-A" }] },
    { item: "LUOI-SN13X26", sales_mode: "Tách món", lines: [{ item_code: "NVL-A" }] },
  ]);
  assert.notEqual(salesBomCompositionSignature(full), salesBomCompositionSignature(split));
  // Cấu phần y hệt nhau, nên chữ ký chỉ khác được nhờ cách giao + khoá tách.
  assert.deepEqual(
    [full, split].map((row) => JSON.parse(row.deferred_components_json)[0].item_code),
    ["NVL-A", "NVL-A"],
  );
});

test("CHẶN 4 · một mặt hàng, hai template, hai template_code khác nhau", () => {
  // Khoá cũ bằng đúng mã hàng là 1-1 với mặt hàng, nên hai định mức của một mã rơi vào cùng
  // một rổ `existingByCode` của bộ nhập và phép kiểm cuối đòi ĐÚNG MỘT bản ⇒ bản thứ hai luôn
  // bị đọc là trùng. Đó là lý do 6 họ mã ở trên không gộp được — KHÔNG phải vì nền tảng từ
  // chối: cờ `unique` của `Data*!` chỉ được phân tích, không chỗ nào trong `packages/` ép nó.
  const templates = composition([
    { item: "LUOI-SN13X26", sales_mode: "Trọn bộ", lines: [{ item_code: "NVL-TRUC114_1.8LY" }] },
    { item: "LUOI-SN13X26", sales_mode: "Tách món", lines: [{ item_code: "TP-LUOISN13x26_STD" }] },
  ]);
  assert.equal(templates.length, 2);
  assert.equal(new Set(templates.map((row) => row.item_code)).size, 1);
  assert.equal(new Set(templates.map((row) => row.template_code)).size, 2);
  assert.deepEqual(templates.map((row) => row.template_code).sort(), [
    "LUOI-SN13X26#TACHMON",
    "LUOI-SN13X26#TRONBO",
  ]);
});

test("CHẶN 4 · mã không có cách giao thì GIỮ NGUYÊN khoá cũ", () => {
  // 258/358 mã cha không mang cách giao. Đổi khoá của chúng là churn trên bản ghi đã khai.
  assert.equal(salesModeTemplateCode("NVL-RAYHOP", null), "NVL-RAYHOP");
  assert.equal(salesModeTemplateCode("LUOI-SN13X26", "Tách món"), "LUOI-SN13X26#TACHMON");
});

test("CHẶN 4 · cùng mặt hàng + cùng cách giao khai hai lần vẫn bị chặn", () => {
  assert.throws(
    () => composition([
      { item: "LUOI-SN13X26", sales_mode: "Trọn bộ", lines: [{ item_code: "NVL-A" }] },
      { item: "LUOI-SN13X26", sales_mode: "Trọn bộ", lines: [{ item_code: "NVL-B" }] },
    ]),
    /duplicate parent Item/,
  );
});

test("ĐƯỜNG THÔNG · một mã, dòng bán chọn cách giao nào thì ra bộ cấu phần ấy", () => {
  // Bài quan trọng nhất: chứng minh sau khi gộp mã, hai định mức vẫn phân giải được.
  // Số liệu nguồn `ĐM.md`: khối `CỬA LƯỚI SN PHI 13x26 STĐ - TRỌN BỘ` có 7 cấu phần con,
  // bản `- TÁCH MÓN` có 1. Ở đây rút gọn còn 2 và 1 để bài đọc được, quan hệ nhiều/ít giữ nguyên.
  const templates = composition([
    {
      item: "LUOI-SN13X26",
      sales_mode: "Trọn bộ",
      lines: [{ item_code: "NVL-TRUC114_1.8LY" }, { item_code: "NVL-V4-KEM_TOLE75_STD" }],
    },
    { item: "LUOI-SN13X26", sales_mode: "Tách món", lines: [{ item_code: "TP-LUOISN13x26_STD" }] },
  ]).map((row, index) => parseBomTemplateRecord({ name: `BT-${index + 1}`, ...row }));

  const componentsFor = (salesMode) => resolveBomTemplateComposition({
    templates,
    context: { item_code: "LUOI-SN13X26", sales_mode: salesMode },
  }).components.map((row) => row.item_code);

  assert.deepEqual(componentsFor("Trọn bộ"), ["NVL-TRUC114_1.8LY", "NVL-V4-KEM_TOLE75_STD"]);
  assert.deepEqual(componentsFor("Tách món"), ["TP-LUOISN13x26_STD"]);
});

test("ĐƯỜNG THÔNG · thiếu cách giao trên ngữ cảnh thì NÉM, không lấy bừa bản trọn bộ", () => {
  // Sáu chỗ trong worker còn `?? "Trọn bộ"` khi dòng bán để trống (index.ts 666/3471,
  // sales-production-core.ts 784/967/1200, door-formulas.ts 332). Chúng chặn ngữ cảnh rỗng
  // TRƯỚC khi tới đây; nhưng nếu chỗ nào lọt, luật chọn template phải kêu chứ không đoán.
  const templates = composition([
    { item: "LUOI-SN13X26", sales_mode: "Trọn bộ", lines: [{ item_code: "NVL-A" }] },
    { item: "LUOI-SN13X26", sales_mode: "Tách món", lines: [{ item_code: "NVL-B" }] },
  ]).map((row, index) => parseBomTemplateRecord({ name: `BT-${index + 1}`, ...row }));

  assert.throws(
    () => resolveBomTemplateComposition({ templates, context: { item_code: "LUOI-SN13X26" } }),
    /không khớp cấu hình/,
  );
});

test("CHẶN 1 · cửa gộp mã MẶC ĐỊNH ĐÓNG, và mở ra thì mở đúng trục cách giao", () => {
  // Không được gỡ `bỏ cách bán` khỏi tập chặn chỉ vì cột `sales_mode` đã tồn tại — phải có
  // bằng chứng BOM Template đã khai giá trị. Nên cửa mặc định đóng.
  assert.equal(structuralDrops().has("bỏ cách bán"), true);
  assert.equal(structuralDrops({ salesModeOnBomTemplate: true }).has("bỏ cách bán"), false);
  // Trục BẬC DIỆN TÍCH không có cửa nào ở đây — nó do luật giá theo bậc lo.
  assert.equal(structuralDrops({ salesModeOnBomTemplate: true }).has("bỏ bậc diện tích"), true);

  const item = (code) => ({ item_code: code, item_name: code, item_group: "Cửa Lưới" });
  const pair = ["TP-LUOI-MV-STD - TRONBO", "TP-LUOI-MV-STD - TM"].map(item);
  assert.equal(buildCodeMapping(pair).summary.unsafe_merges, 1, "cửa đóng: họ này chưa được gộp");
  assert.equal(
    buildCodeMapping(pair).summary.unsafe_merges_unlocked_by_sales_mode, 1,
    "và nó nằm trong phần `sales_mode` mở khoá được",
  );
  assert.equal(buildCodeMapping(pair, { salesModeOnBomTemplate: true }).summary.unsafe_merges, 0);
  // Số họ mở khoá được phải ĐỌC ĐƯỢC Ở CẢ HAI trạng thái cửa. Bản trước tính nó bằng cách so
  // tập của NGƯỜI GỌI với tập mở, nên khi cửa mở thì vị từ thành `!p && p` và trường luôn trả
  // 0 — đúng lúc cần đọc thì nó nói ngược sự thật, và không bài nào bắt được vì chỉ kiểm ở
  // trạng thái cửa đóng.
  assert.equal(
    buildCodeMapping(pair, { salesModeOnBomTemplate: true }).summary.unsafe_merges_unlocked_by_sales_mode, 1,
    "cửa mở vẫn phải đếm đúng 1 họ được mở khoá",
  );

  // Bậc diện tích vẫn chặn dù cửa cách giao đã mở — hai trục, hai người lo.
  const tiers = ["TP-CUADL6D XN-VK_TRONBO_3-4m²", "TP-CUADL6D XN-VK_TRONBO_4-5m²"].map(item);
  assert.equal(buildCodeMapping(tiers, { salesModeOnBomTemplate: true }).summary.unsafe_merges, 1);
  assert.equal(
    buildCodeMapping(tiers).summary.unsafe_merges_unlocked_by_sales_mode, 0,
    "họ bị chặn vì bậc diện tích KHÔNG được tính là `sales_mode` mở khoá được",
  );
});

test("CHẶN 4 · bộ nhập DEFERRED cũng tách khoá, và bắt đụng khoá TRƯỚC khi ghi", () => {
  // Bộ nhập là script chạy thẳng nên kiểm qua tiến trình con, ở chế độ `--validate-only`:
  // không đăng nhập, không chạm D1, không ra mạng.
  const script = fileURLToPath(new URL("../scripts/import-alumdoor-bom-template-local.mjs", import.meta.url));
  const runValidateOnly = (boms) => {
    const payloadPath = path.join(mkdtempSync(path.join(tmpdir(), "alumdoor-bom-")), "payload.json");
    writeFileSync(payloadPath, JSON.stringify({ format: "alumdoor-canonical-bom-importable/v2", boms }));
    return execFileSync(process.execPath, [script, payloadPath, "/dev/null", "--validate-only"], { encoding: "utf8" });
  };

  // Hai định mức của CÙNG một mã hàng đã gộp — đúng cảnh sau khi gộp 6 họ mã.
  const out = runValidateOnly([
    { item: "LUOI-SN13X26", sales_mode: "Trọn bộ", pending_lines: [{ item_code: "NVL-A", source_row: 1 }] },
    { item: "LUOI-SN13X26", sales_mode: "Tách món", pending_lines: [{ item_code: "NVL-B", source_row: 2 }] },
    { item: "NVL-RAYHOP", pending_lines: [{ item_code: "NVL-C", source_row: 3 }] },
  ]);
  assert.match(out, /templates=3 component_rules=3 sales_mode=2/);

  // Khoá `template_code` là DUY NHẤT trên nền tảng; đụng khoá phải nổ ở đây, không nổ giữa
  // đợt ghi khi một phần bản ghi đã vào D1.
  assert.throws(
    () => runValidateOnly([
      { item: "LUOI-SN13X26", sales_mode: "Trọn bộ", pending_lines: [{ item_code: "NVL-A", source_row: 1 }] },
      { item: "LUOI-SN13X26", sales_mode: "Trọn bộ", pending_lines: [{ item_code: "NVL-B", source_row: 2 }] },
    ]),
    /BOM Template code trùng/,
  );
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * SỐ ĐO NGUỒN — đọc thẳng `apps/alumdoor/docs/nguon/ms-lien/ĐM.md`, không tin lời bình.
 *
 * Vì sao phải có: bản trước ghi "86/355 mã cha, 5 họ, 12 → 7" ngay trên một bộ kiểm 18/18
 * xanh, và không bài nào chạm tới nguồn gốc nên con số sai sống sót nguyên vẹn. Số họ được gộp
 * là con số quyết định người ta gộp mã nào — sai một họ là mất một bộ cấu phần.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

const SOURCE_DM = fileURLToPath(new URL("../../apps/alumdoor/docs/nguon/ms-lien/ĐM.md", import.meta.url));

/** Mã cha = ô [3] của dòng có ô [1] (STT). Mã cấu phần = ô [3] của dòng không có STT. */
function sourceParentAndChildCodes() {
  const rows = parseAlumdoorIndexedMarkdownRows(readFileSync(SOURCE_DM, "utf8"));
  const clean = (value) => String(value ?? "").normalize("NFC").trim();
  const parents = new Map();
  const children = new Set();
  for (const row of rows) {
    const code = clean(row.cells[3]);
    if (!code) continue;
    if (clean(row.cells[1])) {
      if (!parents.has(code)) parents.set(code, clean(row.cells[2]) || code);
    } else children.add(code);
  }
  return { parents, children };
}

test("SỐ ĐO NGUỒN · 100/358 mã cha nhồi cách giao, 0/235 mã cấu phần", () => {
  const { parents, children } = sourceParentAndChildCodes();
  assert.equal(parents.size, 358, "số mã cha phân biệt trong ĐM.md");
  assert.equal(children.size, 235, "số mã cấu phần phân biệt trong ĐM.md");

  const withMode = [...parents.keys()].filter((code) => resolveSalesMode({ item: code }).mode);
  assert.equal(withMode.length, 100, "mã cha nhồi cách giao");
  assert.equal(
    withMode.filter((code) => resolveSalesMode({ item: code }).mode === "Trọn bộ").length, 94,
  );
  assert.equal(
    withMode.filter((code) => resolveSalesMode({ item: code }).mode === "Tách món").length, 6,
  );
  assert.equal(parents.size - withMode.length, 258, "mã cha KHÔNG mang cách giao");

  // Bốn mã chỉ dùng hậu tố ` - TM`, không viết `TACHMON`. Bản trước liệt kê ba và bỏ sót
  // `TP-LUOI-SNPHI19-INOX - TM` — đúng cái mã làm lệch số họ gộp được.
  const tmSuffix = withMode.filter((code) => /TM$/.test(
    code.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
  ));
  assert.deepEqual(tmSuffix.sort(), [
    "TP-LUOI-MV-STD - TM",
    "TP-LUOI-SN-STD - TM",
    "TP-LUOI-SNPHI19-INOX - TM",
    "TP-LUOIMV-INOX- TM",
  ]);

  // Cách giao KHÔNG bò xuống mã cấu phần. Nên "86 mã cha vs 100 kể cả cấu phần" là hai lần
  // đếm cùng một tập, không phải hai tập khác nhau.
  assert.equal([...children].filter((code) => resolveSalesMode({ item: code }).mode).length, 0);
});

test("SỐ ĐO NGUỒN · 6 họ mã được `sales_mode` mở khoá, 13 → 7 họ bị chặn", () => {
  const { parents } = sourceParentAndChildCodes();
  // `item_group` cố định để phép suy tiền tố không phụ thuộc dữ liệu Item master — bài này đo
  // TRỤC CÁCH GIAO, không đo luật tiền tố.
  const items = [...parents.entries()].map(([code, name]) => ({
    item_code: code, item_name: name, item_group: "Cửa Lưới",
  }));
  const closed = buildCodeMapping(items);
  const opened = buildCodeMapping(items, { salesModeOnBomTemplate: true });

  assert.equal(closed.summary.unsafe_merges, 13, "họ bị chặn gộp khi cửa cách giao còn đóng");
  assert.equal(opened.summary.unsafe_merges, 7, "còn lại bị chặn vì BẬC DIỆN TÍCH");
  assert.equal(closed.summary.unsafe_merges_unlocked_by_sales_mode, 6);
  assert.equal(opened.summary.unsafe_merges_unlocked_by_sales_mode, 6, "đọc được ở cả hai trạng thái cửa");

  // Sáu họ, không phải năm. Họ thứ sáu là LUOI-SNPHI19-INOX: bản `- TRONBO` có 6 cấu phần,
  // bản `- TM` có 1 — gộp mà không mở `sales_mode` là mất hẳn một bộ.
  assert.deepEqual(closed.unlockedBySalesMode.map(([code]) => code).sort(), [
    "LUOI-LUOIMV-INOX",
    "LUOI-MV",
    "LUOI-SN",
    "LUOI-SN13X26",
    "LUOI-SN13X26-INOX",
    "LUOI-SNPHI19-INOX",
  ]);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * BỐN CHỖ NGOÀI BỘ DỰNG mà cùng một khoá đi qua. Lệch một chỗ là đứt cả luồng.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

test("BỘ KIỂM D1 · tính khoá template GIỐNG HỆT bộ nhập, không khoá cứng mã hàng", () => {
  /**
   * `verify-alumdoor-bom-local-d1.mjs` chạy NGAY sau bước ghi trong `bom-adapter.mjs`. Bản
   * trước khoá cứng `clean(bom.item)`, nên chỉ cần bộ nhập tách khoá là bộ kiểm báo thiếu và
   * adapter `bom` chết ở stage VERIFY_D1 — không rollback, mọi lượt sau chết lại đúng chỗ đó.
   *
   * Bài này khoá điều kiện DUY NHẤT giữ hai bên khớp: cùng gọi `salesModeTemplateKeys`.
   */
  const verifier = readFileSync(
    fileURLToPath(new URL("../scripts/verify-alumdoor-bom-local-d1.mjs", import.meta.url)), "utf8",
  );
  assert.match(verifier, /salesModeTemplateKeys/, "bộ kiểm phải dùng chung hàm tính khoá với bộ nhập");
  assert.doesNotMatch(
    verifier,
    /expectedTemplateCodes\s*=\s*payload\.boms[\s\S]{0,200}?map\(\(bom\)=>clean\(bom\.item\)\)/,
    "không được khoá cứng bom.item nữa",
  );

  // Và hàm đó phải cho đúng khoá bộ nhập ghi, ở cả hai cảnh.
  const merged = [
    { item: "LUOI-SN13X26", sales_mode: "Trọn bộ" },
    { item: "LUOI-SN13X26", sales_mode: "Tách món" },
    { item: "TP-LUOI-SN13x26-STD - TACHMON" },
  ];
  const keys = salesModeTemplateKeys(merged);
  assert.deepEqual(merged.map((bom) => keys.templateCode(bom)), [
    "LUOI-SN13X26#TRONBO",
    "LUOI-SN13X26#TACHMON",
    "TP-LUOI-SN13x26-STD - TACHMON",
  ]);
});

test("VÂN TAY BOM · đổi khoá theo cách giao KHÔNG làm mất dấu BOM đã ghi sổ", () => {
  /**
   * `bomFingerprint` là thứ `existingGeneratedBom` tra để biết định mức đã ghi sổ chưa. Nếu
   * hậu tố `#TRONBO` lọt vào hash thì mọi BOM ghi sổ của mặt hàng đó mất dấu, hệ thống ghi sổ
   * thêm một bản trùng nội dung, và bản cũ KHÔNG XOÁ ĐƯỢC (quyền `Bill of Materials` không có
   * `delete`). Vân tay phải bỏ qua hậu tố.
   */
  const base = {
    company: "Alumdoor",
    source_warehouse: "KHO-CHINH",
    output_qty: 1,
    resolved: {
      template_code: "TP-LUOI-SN-STD - TRONBO",
      item_code: "TP-LUOI-SN-STD - TRONBO",
      components: [{ component_key: "K1", item_code: "NVL-A", stock_uom: "Kg", qty: 2, source_rule: "R1" }],
      applied_rules: ["R1"],
    },
  };
  const renamed = { ...base, resolved: { ...base.resolved, template_code: "TP-LUOI-SN-STD - TRONBO#TRONBO" } };
  assert.equal(bomFingerprint(base), bomFingerprint(renamed));

  // Nhưng CẤU PHẦN khác nhau thì vân tay vẫn phải khác — hậu tố không phải thứ phân biệt, cấu
  // phần mới là.
  const otherComponents = {
    ...renamed,
    resolved: {
      ...renamed.resolved,
      components: [{ component_key: "K1", item_code: "NVL-B", stock_uom: "Kg", qty: 2, source_rule: "R1" }],
    },
  };
  assert.notEqual(bomFingerprint(base), bomFingerprint(otherComponents));
});

test("BRIEF · `COMPOSITION` phải là một lựa chọn đã khai của source_status", () => {
  /**
   * `generic-controller.ts` TỪ CHỐI giá trị Select ngoài options, kể cả Administrator. Bộ dựng
   * ghi `source_status: 'COMPOSITION'`, nên thiếu lựa chọn này là MỌI template cấu thành bị
   * nền tảng từ chối — và bộ kiểm cũ không thấy vì nó chỉ so chuỗi trong bộ nhớ.
   */
  const brief = JSON.parse(readFileSync(
    fileURLToPath(new URL("../briefs/alumdoor-v2.json", import.meta.url)), "utf8",
  ));
  const bomTemplate = brief.doctypes.find((entry) => entry.name === "BOM Template");
  const sourceStatus = bomTemplate.fields.find((entry) => typeof entry === "string"
    && entry.startsWith("source_status:"));
  assert.ok(sourceStatus, "BOM Template phải khai source_status");
  const options = sourceStatus.match(/Select\(([^)]*)\)/)[1].split(",").map((entry) => entry.trim());
  assert.ok(options.includes(SALES_BOM_COMPOSITION_STATUS), `options thiếu ${SALES_BOM_COMPOSITION_STATUS}: ${options.join(", ")}`);
  assert.ok(options.includes("DEFERRED"), "DEFERRED vẫn phải còn — bộ nhập template sản xuất lọc theo nó");
});

test("CỔNG BÁN HÀNG · mặt hàng TÁCH MÓN cũng xổ được cấu thành", async () => {
  /**
   * Cổng cũ dò chuỗi `TRONBO` trong MÃ HÀNG, nên 6 template tách món vừa dựng ra là hàng chết,
   * và sau khi gộp mã thì 100% cửa lưới bị từ chối. Cổng mới hỏi CÁCH GIAO trên dòng bán trước,
   * rồi mới lui về dò mã (cả trọn bộ lẫn tách món) cho 100 mã chưa gộp.
   */
  const answerFor = async (args) => {
    const call = async (path) => {
      if (path.startsWith("resource/Item/")) {
        return new Response(JSON.stringify({ data: { item_code: decodeURIComponent(path.slice("resource/Item/".length)), item_group: "Cửa Lưới" } }),
          { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`ĐỌC THÊM: ${path}`);
    };
    const response = await previewDraftSalesBomRequirements(call, args);
    // Cổng từ chối thì trả 200 kèm `bom_applicable:false` mà KHÔNG đọc gì thêm; qua cổng thì
    // nó đi đọc BOM và mock ở trên ném — đó chính là tín hiệu phân biệt.
    if (response.status !== 200) return { passedGate: true };
    const body = await response.json();
    return { passedGate: body.bom_applicable !== false, reason: body.reason };
  };

  assert.equal((await answerFor({ item_code: "TP-LUOI-SN13x26-STD - TACHMON" })).passedGate, true);
  assert.equal((await answerFor({ item_code: "TP-LUOI-MV-STD - TM" })).passedGate, true);
  assert.equal((await answerFor({ item_code: "TP-LUOI-SN13x26-STD - TRONBO" })).passedGate, true);
  // Mã đã gộp sạch token: chỉ CÁCH GIAO trên dòng bán mới mở cổng.
  assert.equal((await answerFor({ item_code: "LUOI-SN13X26", sales_mode: "Tách món" })).passedGate, true);
  // Không cách giao, mã cũng không nói gì ⇒ vẫn đóng, và nói rõ vì sao.
  const closed = await answerFor({ item_code: "NVL-RAYHOP" });
  assert.equal(closed.passedGate, false);
  assert.match(closed.reason, /Cách giao/);
});

test("CHỐT CHẶN · bộ nhập cấu thành TỪ CHỐI chạy khi D1 chưa có cột/lựa chọn cần thiết", () => {
  /**
   * Bộ nhập cấu thành XOÁ SẠCH Bill of Materials + BOM Template rồi mới POST lại. Nền tảng thì
   * TỪ CHỐI chứ không nuốt, nên một cột chưa deploy = D1 còn 0 template và 0 định mức. Chốt
   * chặn phải chạy TRƯỚC lệnh xoá đầu tiên, và phải kiểm được — nên nó là hàm thuần.
   */
  const brief = JSON.parse(readFileSync(
    fileURLToPath(new URL("../briefs/alumdoor-v2.json", import.meta.url)), "utf8",
  ));
  const declared = brief.doctypes.find((entry) => entry.name === "BOM Template").fields;
  const nameOf = (entry) => (typeof entry === "string" ? entry.split(":", 1)[0].trim() : entry.fieldname);
  const optionsOf = (entry) => (typeof entry === "string"
    ? (entry.match(/Select\(([^)]*)\)/)?.[1] ?? "").split(",").map((value) => value.trim()).join("\n")
    : String(entry.options ?? ""));
  const metaFromBrief = { fields: declared.map((entry) => ({ fieldname: nameOf(entry), options: optionsOf(entry) })) };

  // Brief hiện tại phải đủ — nếu bài này đỏ thì brief và bộ dựng đã lệch nhau.
  assert.deepEqual(bomTemplateMetaCompositionGaps(metaFromBrief), []);

  // D1 cũ chưa có cột `sales_mode`.
  assert.deepEqual(
    bomTemplateMetaCompositionGaps({ fields: metaFromBrief.fields.filter((f) => f.fieldname !== "sales_mode") }),
    ["thiếu cột `sales_mode`"],
  );
  // D1 cũ chưa có lựa chọn COMPOSITION.
  const staleStatus = metaFromBrief.fields.map((f) => (f.fieldname === "source_status"
    ? { ...f, options: "READY\nREADY_WITH_ACTUALS\nDEFERRED" } : f));
  assert.deepEqual(bomTemplateMetaCompositionGaps({ fields: staleStatus }), [
    "`source_status` chưa có lựa chọn `COMPOSITION` (đang có: READY, READY_WITH_ACTUALS, DEFERRED)",
  ]);
  // Không đọc được meta thì cũng phải chặn, không được đi tiếp.
  assert.deepEqual(bomTemplateMetaCompositionGaps({}), ["không đọc được meta của BOM Template"]);
});
