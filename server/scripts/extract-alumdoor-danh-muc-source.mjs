#!/usr/bin/env node
/**
 * Trích `apps/alumdoor/docs/nguon/ms-lien/DANH-MỤC.md` — sheet DANH MỤC của `MS LIÊN BS.xlsx`.
 *
 * VÌ SAO CÓ FILE NÀY: tới 19/08/2026 chưa script nào đọc nguồn này (`grep -rl "DANH-MỤC"` trên
 * `server/`, `scripts/`, `apps/` ra rỗng). Nó là nơi duy nhất trong toàn bộ 4 file gốc có
 * GIÁ NHẬP · ĐVT NHẬP · NCC theo từng mã, và là một trong hai nơi có hệ số quy đổi ghi bằng lời.
 *
 * ĐỌC-CHỈ. Không ghi D1, không sửa nguồn.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BẪY LỚN NHẤT: SHEET NÀY CHỨA HAI BẢNG NẰM CẠNH NHAU, KHÔNG LIÊN QUAN GÌ NHAU
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *     dòng 2 | [0] MST · [1] NCC/TÊN KH · [2] NGƯỜI PHỤ TRÁCH · [3] KH/NCC · [5] DANH MỤC SẢN PHẨM
 *     dòng 3 | [1] AN KHANG WINDOW · [2] LƯ CHÍ CƯỜNG · [3] KH · [5] NGÀY GIÁ · [6] MÃ XUẤT · …
 *     dòng 4 | [1] ANH HIẾU CẦN THƠ · … · [6] BẮN BƯỚM INOX · [8] 7000.0 · [9] CON · …
 *
 * Dòng 2 là tiêu đề bảng ĐỐI TÁC (cột 0-3) và đồng thời là nhãn nhóm cho bảng SẢN PHẨM.
 * Dòng 3 vừa là **dòng dữ liệu đầu tiên** của bảng đối tác, vừa là **dòng tiêu đề** của bảng
 * sản phẩm. Từ dòng 4 trở đi hai bảng chạy song song, mỗi bảng một nhịp riêng.
 *
 * Nghĩa là: đối tác ở dòng 4 (`ANH HIẾU CẦN THƠ`) KHÔNG mua mặt hàng ở dòng 4
 * (`BẮN BƯỚM INOX`). Chúng chỉ tình cờ cùng số dòng trong bảng tính.
 *
 * Đọc hai bảng như một bảng sẽ ra kết luận "bảng giá gắn theo tên khách hàng" — đó là ảo giác
 * bố cục, và `docs/ALUMDOOR-AUDIT-VONG-2-KET-QUA.md` §3 mục 3 đã mắc đúng bẫy này. Cùng loại
 * lỗi mà chính vòng 2 cảnh báo ở §0: kết luận rút từ hình dạng bản trích, không từ nguồn.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUY MÔ THẬT — CON SỐ, KHÔNG ƯỚC LƯỢNG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Bảng đối tác chạy hết 388 dòng. Bảng sản phẩm **dừng ở dòng 69**: 64 mã, trong đó 20 có
 * GHI CHÚ và 20 có NCC.
 *
 * `ALUMDOOR-AUDIT-VONG-2-KET-QUA.md` §6 đợt A ghi *"DANH-MỤC.md → uom_conversions cho ~540 mặt
 * hàng"*. Nguồn không có 540 dòng để cho. Con số 540 là ĐỘ LỚN CỦA LỖ HỔNG (546/566 mặt hàng
 * thiếu hệ số), không phải lượng nguồn cung cấp — hai thứ bị lẫn vào nhau.
 *
 * Bộ trích này in ra số đếm thật mỗi lần chạy, chính là để kế hoạch không đứng trên một con số
 * suy ra từ chỗ khác nữa.
 *
 * Dùng:
 *     node server/scripts/extract-alumdoor-danh-muc-source.mjs <out.json> [report.json]
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import {
  parseAlumdoorIndexedMarkdownRows,
  readAlumdoorCell,
} from "./lib/alumdoor-source-markdown.mjs";
import { parseConversionNote } from "./lib/alumdoor-uom-conversion-parser.mjs";
import { canonicalAlumdoorUom } from "./lib/alumdoor-uom-catalog.mjs";

// Neo theo vị trí file, không theo cwd — bốn adapter gọi từ bốn thư mục khác nhau.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");
const SOURCE_PATH = resolve(
  REPO_ROOT,
  "apps/alumdoor/docs/nguon/ms-lien/DANH-MỤC.md",
);

/** Bảng ĐỐI TÁC — cột 0-3. Tiêu đề ở dòng 2, dữ liệu từ dòng 3. */
const PARTNER = Object.freeze({
  HEADER_ROW: 2,
  FIRST_DATA_ROW: 3,
  TAX_ID: 0,
  NAME: 1,
  ACCOUNT_MANAGER: 2,
  KIND: 3,
});

/** Bảng SẢN PHẨM — cột 5-14. Tiêu đề ở dòng 3, dữ liệu từ dòng 4. */
const PRODUCT = Object.freeze({
  HEADER_ROW: 3,
  FIRST_DATA_ROW: 4,
  PRICE_DATE: 5,
  SALES_CODE: 6,
  PURCHASE_CODE: 7,
  PURCHASE_PRICE: 8,
  PURCHASE_UOM: 9,
  SALES_PRICE: 10,
  SALES_UOM: 11,
  SUPPLIER: 12,
  NOTE: 13,
  COST_PRICE: 14,
});

/**
 * Tiêu đề kỳ vọng của bảng sản phẩm. Kiểm khít từng ô: nguồn là bảng tính người ta còn sửa,
 * chèn một cột là mọi chỉ số cột lệch đi một và bộ trích sẽ đọc GIÁ NHẬP vào ô ĐVT mà không
 * báo gì. Thà chết ngay còn hơn nạp sai.
 */
const EXPECTED_PRODUCT_HEADER = Object.freeze({
  [PRODUCT.PRICE_DATE]: "NGÀY GIÁ",
  [PRODUCT.SALES_CODE]: "MÃ XUẤT",
  [PRODUCT.PURCHASE_CODE]: "MÃ NHẬP",
  [PRODUCT.PURCHASE_PRICE]: "GIÁ NHẬP",
  [PRODUCT.PURCHASE_UOM]: "ĐVT",
  [PRODUCT.SALES_PRICE]: "GIÁ BÁN",
  [PRODUCT.SALES_UOM]: "ĐVT",
  [PRODUCT.SUPPLIER]: "NCC",
  [PRODUCT.NOTE]: "GHI CHÚ",
  [PRODUCT.COST_PRICE]: "GIÁ VỐN",
});

const EXPECTED_PARTNER_HEADER = Object.freeze({
  [PARTNER.TAX_ID]: "MST",
  [PARTNER.NAME]: "NCC/TÊN KH",
  [PARTNER.ACCOUNT_MANAGER]: "NGƯỜI PHỤ TRÁCH",
  [PARTNER.KIND]: "KH/NCC",
});

const clean = (value) => String(value ?? "").trim();

/**
 * Tiền trong nguồn xuất ra từ bảng tính nên mang đuôi `.0` (`"7000.0"`). Giữ nguyên dạng số,
 * không làm tròn — giá nhập là dữ liệu kế toán.
 */
function parseMoney(raw) {
  const text = clean(raw).replace(/\s+/g, "").replace(/,/g, "");
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function parseDate(raw) {
  const text = clean(raw);
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : text;
}

/**
 * ĐVT trong nguồn viết hoa không dấu (`CON`, `M2`, `CÁI`). Quy về danh mục 19 đơn vị; giữ lại
 * nguyên văn để truy nguồn khi không khớp.
 */
function normalizeUom(raw) {
  const text = clean(raw);
  if (!text) return { uom: null, source_uom: null, canonical: false };
  const canonical = canonicalAlumdoorUom(text);
  // `canonicalAlumdoorUom` trả nguyên văn khi không biết — so lại để biết có khớp thật không.
  const known = canonical !== text || /^(Cái|Bộ|Kg|Mét|m2|Cây|Lá|Thân|Thanh|Sợi|Cuộn|Tấm|Túi|Hộp|Bình|Lít|Cặp|Con)$/u.test(canonical);
  return { uom: known ? canonical : null, source_uom: text, canonical: known };
}

function assertHeader(rows, rowNumber, expected, label) {
  const row = rows.find((entry) => entry.source_row === rowNumber);
  if (!row) throw new Error(`${label}: không tìm thấy dòng tiêu đề ${rowNumber}`);
  const mismatches = [];
  for (const [index, want] of Object.entries(expected)) {
    const got = readAlumdoorCell(row, Number(index));
    if (got !== want) mismatches.push({ column: Number(index), expected: want, actual: got });
  }
  if (mismatches.length > 0) {
    throw new Error(
      `${label}: bố cục cột đã đổi — ${JSON.stringify(mismatches)}. ` +
        "Sửa hằng số cột trong extract-alumdoor-danh-muc-source.mjs, đừng nới lỏng phép kiểm.",
    );
  }
}

/** Bảng đối tác: cột 1 (tên) là cột duy nhất bắt buộc. */
function extractPartners(rows) {
  const out = [];
  for (const row of rows) {
    if (row.source_row < PARTNER.FIRST_DATA_ROW) continue;
    const name = readAlumdoorCell(row, PARTNER.NAME);
    if (!name) continue;
    out.push({
      source_row: row.source_row,
      partner_name: name,
      account_manager: readAlumdoorCell(row, PARTNER.ACCOUNT_MANAGER) || null,
      partner_kind: readAlumdoorCell(row, PARTNER.KIND) || null,
      tax_id: readAlumdoorCell(row, PARTNER.TAX_ID) || null,
    });
  }
  return out;
}

/**
 * Bảng sản phẩm: MÃ XUẤT là cột định danh. Dòng chỉ có GHI CHÚ mà không có mã (dòng 69,
 * `"TẤT CẢ QUY VỀ SỐ M, MỖI LẦN NHẬP 1M=?KG"`) vẫn giữ lại — nó là câu hỏi bỏ ngỏ của chính
 * xưởng, và mất nó thì mất luôn bằng chứng rằng hệ số đó CHƯA TỪNG tồn tại.
 */
function extractProducts(rows) {
  const out = [];
  for (const row of rows) {
    if (row.source_row < PRODUCT.FIRST_DATA_ROW) continue;
    const salesCode = readAlumdoorCell(row, PRODUCT.SALES_CODE);
    const note = readAlumdoorCell(row, PRODUCT.NOTE);
    const purchaseCode = readAlumdoorCell(row, PRODUCT.PURCHASE_CODE);
    if (!salesCode && !purchaseCode && !note) continue;

    const purchaseUom = normalizeUom(readAlumdoorCell(row, PRODUCT.PURCHASE_UOM));
    const salesUom = normalizeUom(readAlumdoorCell(row, PRODUCT.SALES_UOM));
    const conversion = parseConversionNote(note);

    out.push({
      source_row: row.source_row,
      sales_code: salesCode || null,
      purchase_code: purchaseCode || null,
      price_date: parseDate(readAlumdoorCell(row, PRODUCT.PRICE_DATE)),
      purchase_price: parseMoney(readAlumdoorCell(row, PRODUCT.PURCHASE_PRICE)),
      purchase_uom: purchaseUom.uom,
      purchase_uom_source: purchaseUom.source_uom,
      sales_price: parseMoney(readAlumdoorCell(row, PRODUCT.SALES_PRICE)),
      sales_uom: salesUom.uom,
      sales_uom_source: salesUom.source_uom,
      supplier_name: readAlumdoorCell(row, PRODUCT.SUPPLIER) || null,
      cost_price: parseMoney(readAlumdoorCell(row, PRODUCT.COST_PRICE)),
      note: note || null,
      conversion_factors: conversion.factors,
      conversion_conflicts: conversion.conflicts,
      conversion_unresolved: conversion.unresolved,
    });
  }
  return out;
}

/**
 * Một NCC có thể phục vụ nhiều mã, và ô NCC đôi khi ghi hai tên ngăn bằng dấu phẩy
 * (`"VIỆT ĐÔNG HƯNG, PHÚ XUÂN VIỆT"`). Tách ra để bên gọi dựng `Supplier Item` được;
 * KHÔNG tự chọn nhà cung cấp ưu tiên — nguồn không nói ai ưu tiên.
 */
function splitSuppliers(value) {
  return clean(value)
    .split(/\s*,\s*/u)
    .map(clean)
    .filter(Boolean);
}

function summarize(partners, products) {
  const withPurchasePrice = products.filter((row) => row.purchase_price !== null);
  const withPurchaseUom = products.filter((row) => row.purchase_uom_source);
  const withSalesUom = products.filter((row) => row.sales_uom_source);
  const splitUom = products.filter(
    (row) => row.purchase_uom_source && row.sales_uom_source &&
      row.purchase_uom_source !== row.sales_uom_source,
  );
  const withFactors = products.filter((row) => row.conversion_factors.length > 0);
  const unresolved = products.filter((row) => row.conversion_unresolved);
  const suppliers = new Set();
  for (const row of products) for (const name of splitSuppliers(row.supplier_name)) suppliers.add(name);
  const nonCanonicalUoms = new Set();
  for (const row of products) {
    if (row.purchase_uom_source && !row.purchase_uom) nonCanonicalUoms.add(row.purchase_uom_source);
    if (row.sales_uom_source && !row.sales_uom) nonCanonicalUoms.add(row.sales_uom_source);
  }

  return {
    partner_row_count: partners.length,
    partner_with_kind: partners.filter((row) => row.partner_kind).length,
    partner_with_account_manager: partners.filter((row) => row.account_manager).length,
    product_row_count: products.length,
    product_with_sales_code: products.filter((row) => row.sales_code).length,
    product_with_purchase_code: products.filter((row) => row.purchase_code).length,
    product_with_purchase_price: withPurchasePrice.length,
    product_with_purchase_uom: withPurchaseUom.length,
    product_with_sales_uom: withSalesUom.length,
    product_with_split_uom: splitUom.length,
    product_with_supplier: products.filter((row) => row.supplier_name).length,
    product_with_cost_price: products.filter((row) => row.cost_price !== null).length,
    product_with_note: products.filter((row) => row.note).length,
    conversion_factor_rows: withFactors.length,
    conversion_factor_count: withFactors.reduce((sum, row) => sum + row.conversion_factors.length, 0),
    conversion_unresolved_rows: unresolved.length,
    conversion_conflict_rows: products.filter((row) => row.conversion_conflicts.length > 0).length,
    distinct_supplier_count: suppliers.size,
    non_canonical_uoms: [...nonCanonicalUoms].sort((a, b) => a.localeCompare(b, "vi")),
  };
}

async function main() {
  const [outPath, reportPath] = process.argv.slice(2);
  if (!outPath) {
    throw new Error(
      "Usage: node server/scripts/extract-alumdoor-danh-muc-source.mjs <out.json> [report.json]",
    );
  }

  const text = await readFile(SOURCE_PATH, "utf8");
  const rows = parseAlumdoorIndexedMarkdownRows(text);

  assertHeader(rows, PARTNER.HEADER_ROW, EXPECTED_PARTNER_HEADER, "Bảng đối tác");
  assertHeader(rows, PRODUCT.HEADER_ROW, EXPECTED_PRODUCT_HEADER, "Bảng sản phẩm");

  const partners = extractPartners(rows);
  const products = extractProducts(rows);
  const summary = summarize(partners, products);

  const payload = {
    format: "alumdoor-danh-muc-source/v1",
    source_file: "apps/alumdoor/docs/nguon/ms-lien/DANH-MỤC.md",
    source_workbook: "MS LIÊN BS.xlsx",
    source_sheet: "DANH MỤC",
    layout_note:
      "Hai bảng độc lập cạnh nhau: đối tác cột 0-3 (dữ liệu từ dòng 3), sản phẩm cột 5-14 " +
      "(dữ liệu từ dòng 4). Cùng số dòng KHÔNG có nghĩa là cùng bản ghi.",
    summary,
    partners,
    products,
  };

  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  if (reportPath) {
    await writeFile(
      reportPath,
      `${JSON.stringify({ format: "alumdoor-danh-muc-source-report/v1", summary }, null, 2)}\n`,
      "utf8",
    );
  }

  console.log(
    `ALUMDOOR_DANH_MUC_EXTRACT_PASS partners=${summary.partner_row_count} ` +
      `products=${summary.product_row_count} purchase_price=${summary.product_with_purchase_price} ` +
      `split_uom=${summary.product_with_split_uom} factors=${summary.conversion_factor_count} ` +
      `unresolved=${summary.conversion_unresolved_rows} suppliers=${summary.distinct_supplier_count}`,
  );
}

// Chỉ chạy khi được gọi trực tiếp — test import các hàm thuần bên dưới.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export {
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
};
