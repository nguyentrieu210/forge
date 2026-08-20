/**
 * Đưa GIÁ NHẬP · ĐVT NHẬP · HỆ SỐ QUY ĐỔI · NCC từ nguồn vào payload Item.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ĐÂY LÀ MẮT XÍCH ĐANG CHẶN CỨNG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/ALUMDOOR-AUDIT-VONG-2-KET-QUA.md` §8: ba chỗ chặn cứng của chuỗi mua→nhập kho là
 * **giá nhập · hệ số quy đổi · lô kho**. Hai chỗ đầu nằm ở đây.
 *
 * Cụ thể chỗ chặn: mặt hàng mua theo Kg mà tồn theo Mét, không có hệ số thì phiếu nhập kho
 * không quy đổi được, và `assertCanonicalItemPayload` trong `alumdoor-item-import-policy.mjs`
 * từ chối luôn payload:
 *
 *     is_purchase_item && stock_uom !== default_purchase_uom
 *       ⇒ BẮT BUỘC có một dòng uom_conversions với uom === default_purchase_uom
 *
 * Nghĩa là **ĐVT mua và hệ số phải đi cùng nhau hoặc không đi cái nào**. Gán một mình ĐVT mua
 * là biến mặt hàng chạy được thành mặt hàng chặn cả lượt nhập. Hàm dưới cưỡng chế đúng luật đó:
 * thiếu hệ số thì bỏ luôn ĐVT mua và ghi lý do vào báo cáo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO KHÔNG DÙNG `field_overrides` CỦA FILE QUYẾT ĐỊNH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/alumdoor-catalog-decisions.json` có sẵn `field_overrides`, nhưng nó so bằng
 * `String(next[field]) === String(value)` — với mảng `uom_conversions` thì phép so đó luôn ra
 * `"[object Object]" === "[object Object]"`, tức là **không bao giờ ghi được**. Và quan trọng
 * hơn: quyết định là thứ NGƯỜI chốt, còn hệ số quy đổi là thứ NGUỒN nói. Trộn hai loại vào một
 * file thì sau này không phân biệt được cái nào sửa được bằng cách sửa nguồn, cái nào phải hỏi
 * chủ xưởng.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LUẬT GỘP: NGUỒN KHÔNG SỞ HỮU SỰ VẮNG MẶT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `uom_conversions` có HAI người ghi: nguồn xưởng và `import-alumdoor-bom-rule-local.mjs`
 * (comment ở `import-alumdoor-item-master-local.mjs:106-118` ghi lại đúng vụ này — 9 mặt hàng
 * có hệ số do BOM Rule tạo bị báo xung đột giả khi so bằng-hệt-nhau).
 *
 * Nên ở đây chỉ **thêm hoặc sửa dòng cho ĐVT mà nguồn có nói**, không xoá dòng nào. Dòng đã có
 * mà nguồn nói khác thì báo `conflict` chứ không đè — hai người ghi cùng một ô là chuyện phải
 * thấy, không phải chuyện để một bên thắng lặng lẽ.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { parseAlumdoorIndexedMarkdownRows, readAlumdoorCell } from "./alumdoor-source-markdown.mjs";
import { parseConversionNote, toStockConversions } from "./alumdoor-uom-conversion-parser.mjs";
import { canonicalAlumdoorUom, ALUMDOOR_UOM_CATALOG } from "./alumdoor-uom-catalog.mjs";

const CANONICAL_UOMS = new Set(ALUMDOOR_UOM_CATALOG.map((entry) => entry.name));
const clean = (value) => String(value ?? "").trim();

/** Chỉ số cột của bảng SẢN PHẨM trong `DANH-MỤC.md`. Xem `extract-alumdoor-danh-muc-source.mjs`. */
const COL = Object.freeze({
  FIRST_DATA_ROW: 4,
  SALES_CODE: 6,
  PURCHASE_CODE: 7,
  PURCHASE_PRICE: 8,
  PURCHASE_UOM: 9,
  SUPPLIER: 12,
  NOTE: 13,
});

function canonicalUomOrNull(raw) {
  const text = clean(raw);
  if (!text) return null;
  const canonical = canonicalAlumdoorUom(text);
  return CANONICAL_UOMS.has(canonical) ? canonical : null;
}

function parseMoney(raw) {
  const text = clean(raw).replace(/\s+/g, "").replace(/,/g, "");
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function splitSuppliers(value) {
  return clean(value).split(/\s*,\s*/u).map(clean).filter(Boolean);
}

/**
 * Đọc bảng sản phẩm của `DANH-MỤC.md` về dạng tra cứu theo mã.
 *
 * Một dòng nguồn có tới hai mã (MÃ XUẤT và MÃ NHẬP) và cả hai đều có thể là mã trong app —
 * đăng ký cả hai làm khoá tra. Trùng khoá thì giữ bản đầu và ghi vào `duplicate_keys`;
 * im lặng ghi đè là để một dòng nguồn nuốt mất dòng khác.
 */
export function indexDanhMucPurchaseRows(markdownText) {
  const rows = parseAlumdoorIndexedMarkdownRows(markdownText);
  const byCode = new Map();
  const entries = [];
  const duplicateKeys = [];

  for (const row of rows) {
    if (row.source_row < COL.FIRST_DATA_ROW) continue;
    const salesCode = readAlumdoorCell(row, COL.SALES_CODE);
    const purchaseCode = readAlumdoorCell(row, COL.PURCHASE_CODE);
    if (!salesCode && !purchaseCode) continue;

    const note = readAlumdoorCell(row, COL.NOTE);
    const entry = {
      source_row: row.source_row,
      sales_code: salesCode || null,
      purchase_code: purchaseCode || null,
      purchase_price: parseMoney(readAlumdoorCell(row, COL.PURCHASE_PRICE)),
      purchase_uom: canonicalUomOrNull(readAlumdoorCell(row, COL.PURCHASE_UOM)),
      purchase_uom_source: readAlumdoorCell(row, COL.PURCHASE_UOM) || null,
      suppliers: splitSuppliers(readAlumdoorCell(row, COL.SUPPLIER)),
      note: note || null,
      factors: parseConversionNote(note).factors,
    };
    entries.push(entry);
    for (const key of [salesCode, purchaseCode]) {
      if (!key) continue;
      if (byCode.has(key)) {
        duplicateKeys.push({ key, kept_row: byCode.get(key).source_row, dropped_row: row.source_row });
        continue;
      }
      byCode.set(key, entry);
    }
  }
  return { byCode, entries, duplicateKeys };
}

/** Hệ số kg/mét-dài đã khớp được về mã trong app, từ `data/trong-luong-nhom.json`. */
export function indexAluminiumWeights(weightJson) {
  const byCode = new Map();
  for (const row of weightJson?.weights ?? []) {
    const itemCode = clean(row.item_code);
    const kgPerM = Number(row.kg_per_m);
    if (!itemCode || !Number.isFinite(kgPerM) || kgPerM <= 0) continue;
    if (byCode.has(itemCode)) continue;
    byCode.set(itemCode, {
      from_uom: "Mét",
      to_uom: "Kg",
      factor: kgPerM,
      kind: "weight_per_length",
      source_text: `${row.supplier_code} = ${kgPerM} kg/m (data/trong-luong-nhom.json)`,
    });
  }
  return byCode;
}

export async function loadPurchaseCatalog(repoRoot) {
  const danhMucPath = resolve(repoRoot, "apps/alumdoor/docs/nguon/ms-lien/DANH-MỤC.md");
  const weightPath = resolve(repoRoot, "data/trong-luong-nhom.json");
  const danhMuc = existsSync(danhMucPath)
    ? indexDanhMucPurchaseRows(await readFile(danhMucPath, "utf8"))
    : { byCode: new Map(), entries: [], duplicateKeys: [] };
  const weights = existsSync(weightPath)
    ? indexAluminiumWeights(JSON.parse(await readFile(weightPath, "utf8")))
    : new Map();
  return { danhMuc, weights, available: existsSync(danhMucPath) || existsSync(weightPath) };
}

/**
 * Gộp một dòng nguồn vào một Item của payload.
 *
 * @returns {{item: object, changes: string[], blocked: object|null, conflicts: object[]}}
 */
function mergeOne(item, entry, weightFactor) {
  const changes = [];
  const conflicts = [];
  const stockUom = clean(item.stock_uom);
  const factors = [...(entry?.factors ?? [])];
  if (weightFactor) factors.push(weightFactor);

  const sourceConversions = toStockConversions(factors, stockUom);
  const existing = Array.isArray(item.uom_conversions) ? item.uom_conversions : [];
  const existingByUom = new Map(existing.map((row) => [clean(row.uom), row]));

  const merged = [...existing];
  for (const row of sourceConversions) {
    const current = existingByUom.get(row.uom);
    if (!current) {
      merged.push(row);
      changes.push(`+uom_conversions[${row.uom}]`);
      continue;
    }
    const drift = Math.abs(Number(current.conversion_factor) - row.conversion_factor) /
      Math.max(Number(current.conversion_factor) || 1, 1e-12);
    if (drift > 0.005) {
      // Hai người ghi cùng một ô và nói khác nhau. Báo, không đè.
      conflicts.push({
        item_code: item.item_code,
        uom: row.uom,
        existing_factor: Number(current.conversion_factor),
        source_factor: row.conversion_factor,
        source_text: row.note,
      });
    }
  }

  let next = merged.length === existing.length ? item : { ...item, uom_conversions: merged };

  // ĐVT mua chỉ được gán KHI ĐÃ có hệ số cho nó — xem đoạn đầu file.
  const purchaseUom = entry?.purchase_uom || null;
  if (purchaseUom && purchaseUom !== clean(next.default_purchase_uom)) {
    const hasFactor = purchaseUom === stockUom ||
      (next.uom_conversions ?? []).some((row) => clean(row.uom) === purchaseUom);
    if (hasFactor) {
      next = { ...next, default_purchase_uom: purchaseUom };
      changes.push(`default_purchase_uom=${purchaseUom}`);
    } else {
      return {
        item: next,
        changes,
        conflicts,
        blocked: {
          item_code: item.item_code,
          reason: "purchase_uom_without_conversion",
          stock_uom: stockUom,
          purchase_uom: purchaseUom,
          note: entry?.note ?? null,
          detail:
            "Nguồn khai ĐVT mua khác ĐVT tồn nhưng không khai hệ số quy đổi. Gán một mình ĐVT " +
            "mua sẽ làm assertCanonicalItemPayload chặn cả lượt nhập.",
        },
      };
    }
  }

  return { item: next, changes, conflicts, blocked: null };
}

/**
 * Áp danh mục mua lên toàn bộ payload Item.
 *
 * @param {object[]} items          payload.items đã dịch mã xong
 * @param {object} catalog          kết quả `loadPurchaseCatalog`
 * @param {(code: string) => string|null} resolveCode  dịch mã nguồn → mã đang dùng
 */
/**
 * Chuẩn hoá TÊN hàng để đối chiếu.
 *
 * Cột MÃ XUẤT của nguồn phần lớn KHÔNG phải mã — nó là tên gọi ở xưởng (`PULY 140`,
 * `CÒI BÁO ĐỘNG`, `BẮN BƯỚM INOX - ĐÀI LOAN`). Tra bằng mã thì 20 dòng có NCC không dòng nào
 * khớp, và `Supplier Item` vẫn rỗng đúng như trước.
 *
 * Bỏ dấu tiếng Việt và gộp khoảng trắng, nhưng KHÔNG bỏ dấu gạch/ngoặc — `PULY 114 LỚN` và
 * `PULY 114 NHỎ` chỉ khác nhau ở chữ cuối, làm mạnh tay hơn là gộp nhầm hai vật tư.
 */
function normalizeName(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/đ/gu, "d")
    .replace(/Đ/gu, "D")
    .toUpperCase()
    .replace(/\s+/gu, " ");
}

export function applyPurchaseCatalog(items, catalog, resolveCode = (code) => code) {
  const byItemCode = new Map();
  for (const [sourceCode, entry] of catalog.danhMuc.byCode) {
    const resolved = resolveCode(sourceCode) || sourceCode;
    if (!byItemCode.has(resolved)) byItemCode.set(resolved, entry);
  }

  /**
   * Chỉ nhận đối chiếu theo tên khi tên đó DUY NHẤT ở cả hai phía. Tên trùng thì bỏ qua và
   * ghi vào `ambiguous_name_matches` — `docs/ALUMDOOR-SOAT-MA-TRUNG.md` đã đếm 25 nhóm trùng
   * tên, gán bừa một trong số đó là gán giá nhập cho nhầm vật tư.
   */
  const itemsByName = new Map();
  for (const item of items) {
    const key = normalizeName(item.item_name);
    if (!key) continue;
    if (itemsByName.has(key)) itemsByName.set(key, null);
    else itemsByName.set(key, item.item_code);
  }
  const sourceNames = new Map();
  for (const entry of catalog.danhMuc.entries) {
    for (const raw of [entry.sales_code, entry.purchase_code]) {
      const key = normalizeName(raw);
      if (!key) continue;
      if (sourceNames.has(key)) sourceNames.set(key, null);
      else sourceNames.set(key, entry);
    }
  }
  const byName = new Map();
  const ambiguousNameMatches = [];
  for (const [key, entry] of sourceNames) {
    const itemCode = itemsByName.get(key);
    if (itemCode === undefined) continue;
    if (itemCode === null || entry === null) {
      ambiguousNameMatches.push({
        name: key,
        reason: itemCode === null ? "item_name_duplicated" : "source_row_duplicated",
      });
      continue;
    }
    if (!byItemCode.has(itemCode) && !byName.has(itemCode)) byName.set(itemCode, entry);
  }

  const weightByItemCode = new Map();
  for (const [sourceCode, factor] of catalog.weights) {
    const resolved = resolveCode(sourceCode) || sourceCode;
    if (!weightByItemCode.has(resolved)) weightByItemCode.set(resolved, factor);
  }

  const matched = new Set();
  const blocked = [];
  const conflicts = [];
  const purchasePrices = [];
  const supplierItems = [];
  let changeCount = 0;

  const nextItems = items.map((item) => {
    const entry = byItemCode.get(item.item_code) ?? byName.get(item.item_code) ?? null;
    const weightFactor = weightByItemCode.get(item.item_code) ?? null;
    if (!entry && !weightFactor) return item;
    matched.add(item.item_code);

    const result = mergeOne(item, entry, weightFactor);
    changeCount += result.changes.length;
    if (result.blocked) blocked.push(result.blocked);
    conflicts.push(...result.conflicts);

    if (entry?.purchase_price) {
      // Giá nhập KHÔNG thuộc doctype Item (Item không có trường giá nào). Xuất riêng để
      // bước sau dựng `Supplier Item.last_purchase_rate`, đừng nhét bừa vào Item.
      purchasePrices.push({
        item_code: item.item_code,
        rate: entry.purchase_price,
        uom: entry.purchase_uom,
        source_row: entry.source_row,
      });
    }
    for (const supplier of entry?.suppliers ?? []) {
      supplierItems.push({
        supplier,
        item_code: item.item_code,
        supplier_item_code: entry.purchase_code || entry.sales_code || item.item_code,
        last_purchase_rate: entry.purchase_price ?? null,
        source_row: entry.source_row,
      });
    }
    return result.item;
  });

  const unmatchedSourceCodes = [...byItemCode.keys()].filter((code) => !matched.has(code));

  return {
    items: nextItems,
    report: {
      source_row_count: catalog.danhMuc.entries.length,
      weight_row_count: catalog.weights.size,
      matched_item_count: matched.size,
      matched_by_name_count: byName.size,
      ambiguous_name_match_count: ambiguousNameMatches.length,
      ambiguous_name_matches: ambiguousNameMatches,
      change_count: changeCount,
      blocked_count: blocked.length,
      conflict_count: conflicts.length,
      purchase_price_count: purchasePrices.length,
      supplier_item_count: supplierItems.length,
      duplicate_source_key_count: catalog.danhMuc.duplicateKeys.length,
      unmatched_source_code_count: unmatchedSourceCodes.length,
      unmatched_source_codes: unmatchedSourceCodes.sort((a, b) => a.localeCompare(b, "vi")),
      blocked,
      conflicts,
      duplicate_source_keys: catalog.danhMuc.duplicateKeys,
    },
    purchase_prices: purchasePrices,
    supplier_items: supplierItems,
  };
}

export const __testing = { mergeOne, canonicalUomOrNull, parseMoney, splitSuppliers, normalizeName, COL };
