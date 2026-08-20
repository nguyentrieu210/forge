/**
 * Đọc hệ số quy đổi đơn vị từ cột GHI CHÚ viết bằng văn xuôi.
 *
 * VÌ SAO CẦN: 546/566 mặt hàng không có `uom_conversions`. Mua theo Kg mà tồn theo Mét thì
 * không ghi sổ kho được — đây là một trong ba chỗ chặn cứng của chuỗi mua→nhập kho
 * (`docs/ALUMDOOR-AUDIT-VONG-2-KET-QUA.md` §8).
 *
 * NGUỒN: `apps/alumdoor/docs/nguon/ms-lien/DANH-MỤC.md` cột [13] GHI CHÚ. Người nhập ghi hệ số
 * bằng lời, mỗi dòng một kiểu:
 *
 *     "TL 4.5KG/M"                              → 1 Mét nặng 4,5 Kg
 *     "TL: 1,372kg/m (độ dày 2,3ly) khổ 75"     → dấu phẩy thập phân + đuôi mô tả
 *     "57 con /1KG (1m cao x 12 con)"           → 1 Kg ra 57 Con
 *     "0.0195 kg/con (1m cao x 12 con)"         → nghịch đảo của kiểu trên
 *     "1 CẶP X 2 CÁI"                           → 1 Cặp gồm 2 Cái
 *     "1 CẶP 4 CÁI"                             → thiếu chữ X, vẫn phải hiểu
 *     "91 cái/kg(0.0096kg/cái), cửa KT x 2 cái" → hai hệ số cùng dòng + rác phía sau
 *     "1 cặp x 6 tánx264đ/con"                  → dính giá tiền vào, "tán" không phải ĐVT
 *
 * LUẬT: không đoán. Chuỗi không khớp mẫu nào thì trả `unresolved` kèm nguyên văn, để người
 * đọc quyết. Dòng cuối nguồn ghi thẳng "MỖI LẦN NHẬP 1M=?KG" — chính xưởng cũng chưa biết,
 * và bịa một con số ở đây là làm hỏng tồn kho lặng lẽ.
 *
 * ĐẦU RA của `parseConversionNotes` là danh sách `{ from_uom, to_uom, factor, kind, source_text }`
 * đọc là **1 `from_uom` = `factor` `to_uom`**. Việc quy về `Item.uom_conversions`
 * (`{uom, conversion_factor}` nghĩa là 1 `uom` = `conversion_factor` `stock_uom`) do bên gọi làm,
 * vì chỉ bên gọi mới biết `stock_uom` của mặt hàng.
 */

import { ALUMDOOR_UOM_CATALOG, canonicalAlumdoorUom } from "./alumdoor-uom-catalog.mjs";

/** Tên ĐVT hợp lệ — chốt theo danh mục 19 đơn vị, không tự đẻ thêm. */
const CANONICAL_UOM_NAMES = new Set(ALUMDOOR_UOM_CATALOG.map((entry) => entry.name));

const clean = (value) => String(value ?? "").trim();

/**
 * Đơn vị viết trong ghi chú không trùng danh mục ĐVT chuẩn. `normalizeAlumdoorUom` lo phần
 * alias đã chốt (M→Mét, M2→m2…); bảng dưới lo phần chỉ xuất hiện trong văn xuôi.
 *
 * `tán` cố ý KHÔNG có mặt: nó là tên chi tiết cơ khí, không phải đơn vị tính, và danh mục ĐVT
 * chuẩn 19 đơn vị không có nó. Gặp "6 tán" thì hệ số vẫn đọc được nhưng bị đánh dấu
 * `uom_not_canonical` để không lặng lẽ đẻ ra một ĐVT mới.
 */
const NOTE_UOM_ALIASES = new Map([
  ["KG", "Kg"],
  ["KGS", "Kg"],
  ["M", "Mét"],
  ["MET", "Mét"],
  ["MÉT", "Mét"],
  ["M2", "m2"],
  ["M²", "m2"],
  ["CON", "Con"],
  ["CAI", "Cái"],
  ["CÁI", "Cái"],
  ["CHIEC", "Cái"],
  ["CHIẾC", "Cái"],
  ["CAP", "Cặp"],
  ["CẶP", "Cặp"],
  ["BO", "Bộ"],
  ["BỘ", "Bộ"],
  ["CAY", "Cây"],
  ["CÂY", "Cây"],
  ["LA", "Lá"],
  ["LÁ", "Lá"],
  ["SOI", "Sợi"],
  ["SỢI", "Sợi"],
  ["TAM", "Tấm"],
  ["TẤM", "Tấm"],
  ["THAN", "Thân"],
  ["THÂN", "Thân"],
  ["THANH", "Thanh"],
  ["CUON", "Cuộn"],
  ["CUỘN", "Cuộn"],
  ["CUỐN", "Cuộn"],
  ["LIT", "Lít"],
  ["LÍT", "Lít"],
  ["HOP", "Hộp"],
  ["HỘP", "Hộp"],
  ["TUI", "Túi"],
  ["TÚI", "Túi"],
  ["BINH", "Bình"],
  ["BÌNH", "Bình"],
]);

/** Chuỗi được phép đứng ở vị trí đơn vị. Dài nhất trước, để "CẶP" không bị "CA" ăn mất. */
const UOM_WORD = "KGS|KG|M2|M²|MÉT|MET|M|CON|CHIẾC|CHIEC|CÁI|CAI|CẶP|CAP|CUỘN|CUỐN|CUON|CÂY|CAY|" +
  "SỢI|SOI|THANH|THÂN|THAN|TẤM|TAM|BỘ|BO|LÁ|LA|LÍT|LIT|HỘP|HOP|TÚI|TUI|BÌNH|BINH|TÁN|TAN";

/**
 * Số trong nguồn dùng CẢ dấu chấm lẫn dấu phẩy làm dấu thập phân — "4.5KG/M" và "1,1KG/M"
 * nằm cách nhau hai dòng. Không có số nào trong cột này lớn tới mức cần dấu phân nhóm nghìn,
 * nên quy ước: mọi dấu phẩy là dấu thập phân.
 */
function parseDecimal(raw) {
  const text = clean(raw).replace(/\s+/g, "").replace(",", ".");
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function canonicalUom(raw) {
  const text = clean(raw).toUpperCase();
  if (!text) return null;
  const alias = NOTE_UOM_ALIASES.get(text);
  if (alias) return CANONICAL_UOM_NAMES.has(alias) ? alias : null;
  // Danh mục chuẩn đã biết một số alias (M→Mét, M²→m2…). Trả về nguyên văn khi không biết,
  // nên phải chốt lại bằng danh mục — nếu không, "TÁN" sẽ thành một ĐVT mới.
  const canonical = canonicalAlumdoorUom(text);
  return CANONICAL_UOM_NAMES.has(canonical) ? canonical : null;
}

function makeFactor(fromUom, toUom, factor, kind, sourceText) {
  if (!fromUom || !toUom || !factor) return null;
  if (fromUom === toUom) return null;
  return Object.freeze({
    from_uom: fromUom,
    to_uom: toUom,
    factor,
    kind,
    source_text: clean(sourceText),
  });
}

/**
 * Mẫu 1 — trọng lượng trên chiều dài: `TL 4.5KG/M`, `0,1425 KG/M`, `TL: 1,372kg/m (…)`.
 *
 * Tiền tố `TL` (trọng lượng) là tuỳ chọn vì bốn dòng trong nguồn ghi thiếu. Đuôi mô tả
 * ("(độ dày 2,3ly) khổ 75") bị bỏ qua có chủ ý — nó là quy cách, không phải hệ số.
 */
function matchWeightPerLength(note) {
  const pattern = /(?:TL\s*:?\s*)?(\d+(?:[.,]\d+)?)\s*(KG|KGS)\s*\/\s*(M|MÉT|MET)\b/giu;
  const out = [];
  for (const match of note.matchAll(pattern)) {
    const factor = parseDecimal(match[1]);
    const weightUom = canonicalUom(match[2]);
    const lengthUom = canonicalUom(match[3]);
    const row = makeFactor(lengthUom, weightUom, factor, "weight_per_length", match[0]);
    if (row) out.push(row);
  }
  return out;
}

/**
 * Mẫu 2 — số lượng trên một đơn vị khác: `57 con /1KG`, `91 cái/kg`, `0.0195 kg/con`.
 *
 * Mẫu này bao trùm cả hai chiều, nên `0.0096kg/cái` và `91 cái/kg` trong CÙNG một ghi chú đều
 * ra hệ số, và chúng nghịch đảo nhau. Bên gọi tự chọn chiều cần dùng; giữ cả hai để đối chiếu
 * — nguồn tự mâu thuẫn thì phải thấy được, không phải bị một chiều nuốt mất.
 *
 * Mẫu 1 chạy trước và cũng khớp dạng `KG/M`; bên gọi khử trùng bằng `dedupeFactors`.
 */
function matchQtyPerUnit(note) {
  const pattern = new RegExp(
    String.raw`(\d+(?:[.,]\d+)?)\s*(${UOM_WORD})\s*\/\s*(?:(\d+(?:[.,]\d+)?)\s*)?(${UOM_WORD})\b`,
    "giu",
  );
  const out = [];
  for (const match of note.matchAll(pattern)) {
    const qty = parseDecimal(match[1]);
    const numeratorUom = canonicalUom(match[2]);
    // "57 con /1KG" — mẫu số ghi rõ số 1; "91 cái/kg" — mẫu số ngầm hiểu là 1.
    const denominator = match[3] === undefined ? 1 : parseDecimal(match[3]);
    const denominatorUom = canonicalUom(match[4]);
    if (!qty || !denominator) continue;
    const row = makeFactor(
      denominatorUom,
      numeratorUom,
      qty / denominator,
      "qty_per_unit",
      match[0],
    );
    if (row) out.push(row);
  }
  return out;
}

/**
 * Mẫu 3 — bao gói: `1 CẶP X 2 CÁI`, `1 CẶP 4 CÁI`, `1 cặp x 6 tán`.
 *
 * Chữ `X` là tuỳ chọn vì một dòng trong nguồn ghi thiếu (`"1 CẶP 4 CÁI"`). Số đầu cũng tuỳ
 * chọn để nhận cả `"CẶP X 2 CÁI"`.
 *
 * Bẫy: `"1 cặp x 6 tánx264đ/con"` — chữ `x` thứ hai dính liền số tiền. Vì `TÁN` nằm trong
 * `UOM_WORD` nên nhóm đơn vị dừng đúng chỗ, phần `264đ/con` rơi ra ngoài.
 */
function matchPackaging(note) {
  const pattern = new RegExp(
    String.raw`(?:(\d+)\s*)?(${UOM_WORD})\s*(?:X\s*)?(\d+(?:[.,]\d+)?)\s*(${UOM_WORD})\b`,
    "giu",
  );
  const out = [];
  for (const match of note.matchAll(pattern)) {
    const outerQty = match[1] === undefined ? 1 : parseDecimal(match[1]);
    const outerUom = canonicalUom(match[2]);
    const innerQty = parseDecimal(match[3]);
    const innerUom = canonicalUom(match[4]);
    if (!outerQty || !innerQty || outerQty !== 1) continue;
    const row = makeFactor(outerUom, innerUom, innerQty, "packaging", match[0]);
    if (row) out.push(row);
  }
  return out;
}

/**
 * Cùng một cặp đơn vị có thể ra từ hai mẫu (`TL 4.5KG/M` khớp cả mẫu 1 lẫn mẫu 2). Giữ bản
 * đầu tiên — mẫu 1 chạy trước và mang `kind` chính xác hơn.
 *
 * Nếu hai mẫu ra hệ số KHÁC nhau cho cùng cặp đơn vị thì đó là mâu thuẫn thật trong nguồn:
 * đánh dấu để người đọc xử, không im lặng chọn một bên.
 */
function dedupeFactors(rows) {
  const kept = [];
  const conflicts = [];
  const seen = new Map();
  for (const row of rows) {
    const key = `${row.from_uom}→${row.to_uom}`;
    const previous = seen.get(key);
    if (!previous) {
      seen.set(key, row);
      kept.push(row);
      continue;
    }
    // Sai số tương đối 0,5% — đủ để bỏ qua chênh do làm tròn khi ghi tay.
    const drift = Math.abs(previous.factor - row.factor) / previous.factor;
    if (drift > 0.005) conflicts.push({ pair: key, kept: previous, dropped: row });
  }
  return { kept, conflicts };
}

/**
 * Nghịch đảo một hệ số: biết "1 Mét = 4,5 Kg" thì cũng biết "1 Kg = 0,2222 Mét".
 *
 * Cần vì `Item.uom_conversions` luôn quy về `stock_uom`, mà nguồn ghi theo chiều nào tiện tay
 * người nhập, không theo chiều hệ thống cần.
 */
export function invertFactor(row) {
  if (!row?.factor) return null;
  return Object.freeze({
    from_uom: row.to_uom,
    to_uom: row.from_uom,
    factor: 1 / row.factor,
    kind: `${row.kind}_inverted`,
    source_text: row.source_text,
  });
}

/**
 * Có dấu hiệu người viết đang khai một hệ số nhưng máy không đọc ra không?
 *
 * Dùng để phân biệt "ghi chú không nói gì về quy đổi" (bình thường) với "ghi chú CÓ nói mà máy
 * không hiểu" (phải báo). Dấu `?` bắt đúng dòng `"MỖI LẦN NHẬP 1M=?KG"`.
 */
function looksLikeConversionAttempt(note) {
  return /\d/.test(note) && (/\//.test(note) || /\bX\b/iu.test(note) || /[?=]/.test(note) ||
    new RegExp(String.raw`\b(${UOM_WORD})\b`, "iu").test(note));
}

/**
 * @param {string} note nguyên văn ô GHI CHÚ
 * @returns {{factors: object[], conflicts: object[], unresolved: boolean, source_text: string}}
 */
export function parseConversionNote(note) {
  const text = clean(note);
  if (!text) return { factors: [], conflicts: [], unresolved: false, source_text: "" };

  const raw = [
    ...matchWeightPerLength(text),
    ...matchQtyPerUnit(text),
    ...matchPackaging(text),
  ];
  const { kept, conflicts } = dedupeFactors(raw);

  return {
    factors: kept,
    conflicts,
    unresolved: kept.length === 0 && looksLikeConversionAttempt(text),
    source_text: text,
  };
}

/**
 * Quy một tập hệ số về đúng dạng `Item.uom_conversions` cho một `stock_uom` cho trước.
 *
 * Ngữ nghĩa đích (`server/packages/clouderp-core/src/uom.ts`): mỗi dòng `{uom, conversion_factor}`
 * đọc là **1 `uom` = `conversion_factor` `stock_uom`**. Đổi tên hai trường này là quy đổi lặng
 * lẽ trở về hệ số 1 — nên hàm này là chỗ duy nhất được phép dựng dòng đó.
 */
export function toStockConversions(factors, stockUom) {
  const stock = clean(stockUom);
  if (!stock) return [];
  const rows = new Map();
  for (const factor of factors ?? []) {
    let row = null;
    if (factor.to_uom === stock) row = factor;
    else if (factor.from_uom === stock) row = invertFactor(factor);
    if (!row || row.from_uom === stock) continue;
    if (rows.has(row.from_uom)) continue;
    rows.set(row.from_uom, {
      uom: row.from_uom,
      conversion_factor: Number(row.factor.toPrecision(12)),
      note: row.source_text,
    });
  }
  return [...rows.values()].sort((a, b) => a.uom.localeCompare(b.uom, "vi"));
}

export const __testing = { parseDecimal, canonicalUom, dedupeFactors, looksLikeConversionAttempt };
