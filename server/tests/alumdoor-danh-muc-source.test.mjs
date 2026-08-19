import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseAlumdoorIndexedMarkdownRows } from "../scripts/lib/alumdoor-source-markdown.mjs";
import {
  parseConversionNote,
  toStockConversions,
  invertFactor,
} from "../scripts/lib/alumdoor-uom-conversion-parser.mjs";
import {
  PARTNER,
  PRODUCT,
  EXPECTED_PARTNER_HEADER,
  EXPECTED_PRODUCT_HEADER,
  SOURCE_PATH,
  assertHeader,
  extractPartners,
  extractProducts,
  splitSuppliers,
  summarize,
  normalizeUom,
  parseMoney,
} from "../scripts/extract-alumdoor-danh-muc-source.mjs";
import {
  readDanhMucFactors,
  readAluminiumWeights,
  readPurchaseBarem,
} from "../scripts/build-alumdoor-uom-conversion-catalog.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function sourceRows() {
  return parseAlumdoorIndexedMarkdownRows(await readFile(SOURCE_PATH, "utf8"));
}

/* ───────────────────────── Bộ đọc hệ số từ văn xuôi ───────────────────────── */

test("hệ số: trọng lượng trên mét, cả dấu chấm lẫn dấu phẩy thập phân", () => {
  for (const [note, expected] of [
    ["TL 4.5KG/M", 4.5],
    ["TL 1,1KG/M", 1.1],
    ["0,1425 KG/M", 0.1425],
    ["TL: 1,372kg/m (độ dày 2,3ly) khổ 75", 1.372],
  ]) {
    const parsed = parseConversionNote(note);
    assert.equal(parsed.factors.length, 1, note);
    assert.deepEqual(
      { from: parsed.factors[0].from_uom, to: parsed.factors[0].to_uom },
      { from: "Mét", to: "Kg" },
      note,
    );
    assert.equal(parsed.factors[0].factor, expected, note);
  }
});

test("hệ số: số lượng trên đơn vị, mẫu số ghi rõ hoặc ngầm hiểu là 1", () => {
  const explicit = parseConversionNote("57 con /1KG (1m cao x 12 con)");
  assert.equal(explicit.factors.length, 1);
  assert.equal(explicit.factors[0].from_uom, "Kg");
  assert.equal(explicit.factors[0].to_uom, "Con");
  assert.equal(explicit.factors[0].factor, 57);

  const implied = parseConversionNote("91 cái/kg(0.0096kg/cái), cửa KT x 2 cái, MTT x 4 cái");
  const pairs = implied.factors.map((row) => `${row.from_uom}→${row.to_uom}=${row.factor}`);
  // Nguồn khai CẢ HAI chiều trong cùng một ô; giữ cả hai để đối chiếu được.
  assert.deepEqual(pairs.sort(), ["Cái→Kg=0.0096", "Kg→Cái=91"]);
});

test("hệ số: bao gói, chữ X có thể thiếu", () => {
  assert.equal(parseConversionNote("1 CẶP X 2 CÁI").factors[0].factor, 2);
  const noX = parseConversionNote("1 CẶP 4 CÁI");
  assert.equal(noX.factors.length, 1, "dòng nguồn thiếu chữ X vẫn phải đọc được");
  assert.equal(noX.factors[0].factor, 4);
  assert.equal(noX.factors[0].from_uom, "Cặp");
  assert.equal(noX.factors[0].to_uom, "Cái");
});

test("hệ số: chỗ không chắc thì BÁO, không đoán", () => {
  // Chính xưởng còn để dấu hỏi — bịa số ở đây là làm sai tồn kho lặng lẽ.
  const unknown = parseConversionNote("TẤT CẢ QUY VỀ SỐ M, MỖI LẦN NHẬP 1M=?KG");
  assert.equal(unknown.factors.length, 0);
  assert.equal(unknown.unresolved, true);

  // "tán" là tên chi tiết cơ khí, không phải ĐVT trong danh mục 19 đơn vị.
  const tan = parseConversionNote("1 cặp x 6 tánx264đ/con");
  assert.equal(tan.factors.length, 0, "không được đẻ ra ĐVT mới tên 'tán'");
  assert.equal(tan.unresolved, true);

  // Ghi chú không nói gì về quy đổi thì không phải là "chưa đọc được".
  const plain = parseConversionNote("hàng đặt riêng");
  assert.equal(plain.unresolved, false);
});

test("hệ số: quy về stock_uom đúng chiều, nghịch đảo khi cần", () => {
  const parsed = parseConversionNote("TL 4.5KG/M");
  // Tồn theo Mét, mua theo Kg ⇒ 1 Kg = 1/4,5 Mét.
  const toMet = toStockConversions(parsed.factors, "Mét");
  assert.deepEqual(toMet.map((row) => row.uom), ["Kg"]);
  assert.ok(Math.abs(toMet[0].conversion_factor - 1 / 4.5) < 1e-9);

  // Tồn theo Kg ⇒ 1 Mét = 4,5 Kg, giữ nguyên chiều nguồn.
  const toKg = toStockConversions(parsed.factors, "Kg");
  assert.deepEqual(toKg, [{ uom: "Mét", conversion_factor: 4.5, note: "TL 4.5KG/M" }]);

  // stock_uom trùng chính nó thì không sinh dòng — hệ số 1 là vô nghĩa và gây nhiễu.
  assert.deepEqual(toStockConversions(parsed.factors, "Con"), []);
});

test("hệ số: nghịch đảo giữ nguyên bằng chứng nguồn", () => {
  const [factor] = parseConversionNote("TL 1,1KG/M").factors;
  const inverted = invertFactor(factor);
  assert.equal(inverted.from_uom, "Kg");
  assert.equal(inverted.to_uom, "Mét");
  assert.equal(inverted.source_text, factor.source_text);
});

/* ───────────────────────── Bố cục nguồn DANH-MỤC.md ───────────────────────── */

test("nguồn: hai bảng nằm cạnh nhau, cùng số dòng KHÔNG phải cùng bản ghi", async () => {
  const rows = await sourceRows();

  // Dòng 3 vừa là dữ liệu của bảng đối tác, vừa là tiêu đề của bảng sản phẩm.
  const row3 = rows.find((row) => row.source_row === 3);
  assert.equal(row3.cells[PARTNER.NAME], "AN KHANG WINDOW");
  assert.equal(row3.cells[PRODUCT.SALES_CODE], "MÃ XUẤT");

  // Dòng 4: đối tác và mặt hàng hoàn toàn không liên quan.
  const row4 = rows.find((row) => row.source_row === 4);
  assert.equal(row4.cells[PARTNER.NAME], "ANH HIẾU CẦN THƠ");
  assert.equal(row4.cells[PRODUCT.SALES_CODE], "BẮN BƯỚM INOX - ĐÀI LOAN");

  const partners = extractPartners(rows);
  const products = extractProducts(rows);
  // Nếu ai đó đọc hai bảng thành một, hai mảng này sẽ dài bằng nhau.
  assert.notEqual(partners.length, products.length);
  assert.ok(partners.length > 300, "bảng đối tác chạy hết sheet");
  assert.ok(products.length < 100, "bảng sản phẩm dừng sớm hơn nhiều");
});

test("nguồn: bố cục cột đổi thì chết ngay, không đọc lệch", async () => {
  const rows = await sourceRows();
  assert.doesNotThrow(() => assertHeader(rows, PARTNER.HEADER_ROW, EXPECTED_PARTNER_HEADER, "đối tác"));
  assert.doesNotThrow(() => assertHeader(rows, PRODUCT.HEADER_ROW, EXPECTED_PRODUCT_HEADER, "sản phẩm"));

  assert.throws(
    () => assertHeader(rows, PRODUCT.HEADER_ROW, { ...EXPECTED_PRODUCT_HEADER, [PRODUCT.PURCHASE_PRICE]: "GIÁ MUA" }, "sản phẩm"),
    /bố cục cột đã đổi/u,
  );
});

test("nguồn: quy mô thật của bảng sản phẩm — 63 dòng, không phải 540", async () => {
  const rows = await sourceRows();
  const products = extractProducts(rows);
  const summary = summarize(extractPartners(rows), products);

  // Con số neo. Kế hoạch đợt A từng ghi "~540 mặt hàng"; nguồn không có chừng đó dòng.
  assert.equal(summary.product_row_count, 63);
  assert.equal(summary.product_with_note, 20);
  assert.equal(summary.conversion_factor_count, 19);

  // 16/31 bản ghi có ĐVT mua khác ĐVT bán — con số này của bản audit thì ĐÚNG.
  assert.equal(summary.product_with_split_uom, 16);
});

test("nguồn: giữ nguyên dòng chỉ có ghi chú mà không có mã", async () => {
  const products = extractProducts(await sourceRows());
  const openQuestion = products.find((row) => row.source_row === 69);
  assert.ok(openQuestion, "dòng 69 phải còn — nó là bằng chứng hệ số CHƯA TỪNG có");
  assert.equal(openQuestion.conversion_unresolved, true);
  assert.match(openQuestion.note, /1M=\?KG/u);
});

test("nguồn: ĐVT ngoài danh mục bị đánh dấu, không lặng lẽ tạo mới", async () => {
  const summary = summarize([], extractProducts(await sourceRows()));
  // THÙNG đã bị gỡ khỏi danh mục 19 ĐVT (E07) nhưng nguồn vẫn còn dùng.
  assert.deepEqual(summary.non_canonical_uoms, ["THÙNG"]);
  assert.equal(normalizeUom("THÙNG").uom, null);
  assert.equal(normalizeUom("M").uom, "Mét");
  assert.equal(normalizeUom("M2").uom, "m2");
});

test("nguồn: tiền giữ nguyên độ chính xác, ô NCC tách được nhiều tên", () => {
  assert.equal(parseMoney("7000.0"), 7000);
  assert.equal(parseMoney("3600000.0"), 3600000);
  assert.equal(parseMoney(""), null);
  assert.deepEqual(splitSuppliers("VIỆT ĐÔNG HƯNG, PHÚ XUÂN VIỆT"), [
    "VIỆT ĐÔNG HƯNG",
    "PHÚ XUÂN VIỆT",
  ]);
  assert.deepEqual(splitSuppliers(""), []);
});

/* ───────────────────────── Danh mục hệ số gom ba nguồn ───────────────────────── */

test("danh mục hệ số: ba nguồn tách bạch, không trộn hai đại lượng", async () => {
  const danhMuc = await readDanhMucFactors();
  const weights = await readAluminiumWeights();
  const barem = await readPurchaseBarem();

  assert.equal(danhMuc.factors.length, 19);
  assert.equal(danhMuc.unresolved.length, 2);
  assert.equal(weights.factors.length, 12, "12 bản ghi đã khớp được về mã trong app");
  assert.equal(weights.needsMapping.length, 28, "28 bản ghi còn chờ khớp mã — nguồn dặn không đoán");
  assert.equal(barem.length, 15, "đúng 15 mã cửa Đức của §1, không nuốt bảng §2..§6");

  // kg/m² của cửa thành phẩm KHÔNG được xếp vào nhóm quy đổi ĐVT.
  for (const row of barem) assert.equal(row.basis, "purchase_barem");
  for (const row of [...danhMuc.factors, ...weights.factors]) {
    assert.equal(row.basis, "uom_conversion");
    assert.notEqual(row.to_uom, "m2");
  }
});

test("danh mục hệ số: tổng nguồn cung 31, còn xa 546 chỗ đang thiếu", async () => {
  const danhMuc = await readDanhMucFactors();
  const weights = await readAluminiumWeights();
  const total = danhMuc.factors.length + weights.factors.length;
  assert.equal(total, 31);
  // Neo lại sự thật: nguồn KHÔNG đủ để lấp 546 mặt hàng thiếu hệ số. Chỗ còn lại phải hỏi
  // xưởng hoặc suy từ quy cách, không có đường nạp tự động nào.
  assert.ok(total < 100, "đừng để ai viết lại kế hoạch dựa trên con số 540");
});

test("danh mục hệ số: barem giữ được dung sai và bản lá", async () => {
  const barem = await readPurchaseBarem();
  const al595 = barem.find((row) => row.profile === "AL595");
  assert.deepEqual(
    { kg: al595.kg_per_sqm, leaf: al595.leaf_width_mm, tol: al595.tolerance_pct },
    { kg: 7.7, leaf: 60, tol: 8 },
  );
  // 🆕 trong ô mã là nhãn trang trí, không được dính vào tên profile.
  for (const row of barem) assert.doesNotMatch(row.profile, /🆕/u);
});

test("nguồn: trục 114 hai độ dày ghi CÙNG một trọng lượng", async () => {
  // `ALUMDOOR-AUDIT-VONG-2-KET-QUA.md` §2 nói hai độ dày có hệ số khác nhau (4,4 và 4,7 kg/m).
  // Nguồn gốc ghi cả hai là "TL 4.5KG/M". Không sửa nguồn ở đây — neo lại chỗ lệch để người
  // đọc thấy, đúng luật §5.1 "nguồn gốc thắng bản trích".
  const products = extractProducts(await sourceRows());
  const truc = products.filter((row) => row.sales_code?.startsWith("TP-TRỤC 114"));
  assert.equal(truc.length, 2);
  for (const row of truc) {
    assert.equal(row.conversion_factors.length, 1);
    assert.equal(row.conversion_factors[0].factor, 4.5);
  }
  // Giá bán thì khác thật — đó mới là bằng chứng "hai vật tư khác nhau" của §2.
  assert.deepEqual(truc.map((row) => row.sales_price), [180000, 200000]);
});

test("nguồn: file nguồn nằm trong 4 file gốc, không phải bản trích trung gian", async () => {
  const text = await readFile(resolve(REPO_ROOT, "apps/alumdoor/docs/nguon/00-MUC-LUC.md"), "utf8");
  assert.match(text, /## MS LIÊN BS\.xlsx/u);
  assert.match(text, /`ms-lien\/DANH-MỤC\.md`/u);
});
