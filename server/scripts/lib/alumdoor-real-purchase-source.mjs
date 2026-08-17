import { createHash } from "node:crypto";
import { parseAlumdoorIndexedMarkdownRows, readAlumdoorCell } from "./alumdoor-source-markdown.mjs";

const clean = (v) => String(v ?? "").normalize("NFC").trim();
const fold = (v) => clean(v).normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/Đ/g, "D").replace(/\s+/g, " ");
const number = (v) => { const s = clean(v); if (!s) return null; const n = Number(s.replace(/,/g, ".")); return Number.isFinite(n) ? n : null; };
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

export const PURCHASE_SOURCE = "apps/alumdoor/docs/nguon/ms-lien/chi-tiết-nhập-hàng-ngày.md";

export const APPROVED_PURCHASE_SUPPLIERS = Object.freeze({
  "CÔNG TY TNHH TMSX DƯƠNG HỒ": "keep_source_ncc",
  "CÔNG TY TNHH  LOGISTICS APM": "keep_source_ncc",
  "CTY NAM PHÁT": "keep_source_ncc",
  "CÔNG TY TNHH VẬN TẢI SQS THIÊN ÂN": "keep_source_ncc",
  "TIẾN ĐẠT": "bind_existing_canonical_supplier",
  "ANH HIẾU CẦN THƠ": "ensure_supplier_same_name_preserve_customer_dual_role",
  "PHÁT AN KHANG": "ensure_supplier_from_exact_purchase_party",
  "VIỆT ĐÔNG HƯNG": "ensure_supplier_from_exact_purchase_party",
});

export const APPROVED_PURCHASE_ITEM_UOMS = Object.freeze({
  "CROMATE 3+": "KG",
  "TẨY NHÔM": "KG",
  "TP_UPS-E800i": "CÁI",
  "TP-TD326": "M",
  "TP-TD325": "M",
  "MŨI MÀI HỘP KIM": "CÁI",
  "TP-RAYHOP": "KG",
  "NVL-VDAY-TDU-KTD": "KG",
  "NVL-V4-KEM_TOLE75_STD": "KG",
});

// Exact, source-lineaged dispositions only. No fuzzy matching and no guessed quantity.
// - 534-537: ĐM proves TP-TD325/326 are meter-based; journal supplies length + piece count.
// - 538: journal says NVL-BO1VIS AL71, but canonical Gate A 587 has no exact code and no approved alias.
//        Multiple AL71 variants exist, so selecting one would be guesswork; retain the row as evidence only.
// - 539: source item label "TP RAY HỘP TD" resolves exactly through ĐM to TP-RAYHOP.
// - 543/544: source quantities are not trustworthy enough to persist; retain as explicit exclusions.
export const PURCHASE_SOURCE_DISPOSITIONS = Object.freeze({
  534: { quantity_rule: "LENGTH_M_X_PIECE_COUNT", evidence: "ĐM:TP-TD326:M" },
  535: { quantity_rule: "LENGTH_M_X_PIECE_COUNT", evidence: "ĐM:TP-TD326:M" },
  536: { quantity_rule: "LENGTH_M_X_PIECE_COUNT", evidence: "ĐM:TP-TD325:M" },
  537: { quantity_rule: "LENGTH_M_X_PIECE_COUNT", evidence: "ĐM:TP-TD325:M" },
  538: { exclude: true, reason: "SOURCE_ITEM_IDENTITY_NOT_CANONICAL_587", evidence: "GateA587:no_exact_NVL-BO1VIS_AL71" },
  539: { canonical_item_code: "TP-RAYHOP", canonical_uom: "KG", evidence: "ĐM:TP-RAYHOP" },
  543: { exclude: true, reason: "SOURCE_QUANTITY_OUTLIER_2834000_KG_UNPROVEN" },
  544: { exclude: true, reason: "SOURCE_QUANTITY_MISSING" },
});

function dateOf(row) {
  const d = number(readAlumdoorCell(row, 0));
  const m = number(readAlumdoorCell(row, 1));
  const y = number(readAlumdoorCell(row, 2));
  if (![d, m, y].every(Number.isInteger)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function canonicalize(base) {
  const disposition = PURCHASE_SOURCE_DISPOSITIONS[base.source_row] ?? {};
  const sourceQuantity = base.quantity;
  let canonicalQuantity = sourceQuantity;
  if (disposition.quantity_rule === "LENGTH_M_X_PIECE_COUNT") {
    canonicalQuantity = Number(base.length_or_height) * Number(sourceQuantity);
  }
  const canonicalItemCode = clean(disposition.canonical_item_code ?? base.item_code);
  const canonicalUom = clean(disposition.canonical_uom ?? base.uom);
  return {
    ...base,
    source_item_code: base.item_code,
    source_quantity: sourceQuantity,
    canonical_item_code: canonicalItemCode,
    canonical_uom: canonicalUom,
    canonical_quantity: Number.isFinite(canonicalQuantity) ? canonicalQuantity : null,
    source_disposition: disposition,
    excluded: disposition.exclude === true,
    exclusion_reason: clean(disposition.reason),
    classification: disposition.exclude === true ? "SOURCE_DEFECT_EXCLUDED" : "PURCHASE_RECEIPT",
  };
}

export function extractRealPurchaseRows(markdown) {
  return parseAlumdoorIndexedMarkdownRows(markdown)
    .filter((row) => fold(readAlumdoorCell(row, 7)).startsWith("MUA HANG"))
    .map((row) => {
      const raw = {
        source: PURCHASE_SOURCE,
        source_row: row.source_row,
        date: dateOf(row),
        source_voucher: clean(readAlumdoorCell(row, 4)),
        supplier: clean(readAlumdoorCell(row, 5)),
        description: clean(readAlumdoorCell(row, 6)),
        document_type: clean(readAlumdoorCell(row, 7)),
        item_name: clean(readAlumdoorCell(row, 8)),
        item_code: clean(readAlumdoorCell(row, 9)),
        uom: clean(readAlumdoorCell(row, 10)),
        length_or_height: number(readAlumdoorCell(row, 14)),
        quantity: number(readAlumdoorCell(row, 16)),
        area_or_weight: number(readAlumdoorCell(row, 17)),
        rate: number(readAlumdoorCell(row, 18)),
        pre_tax_amount: number(readAlumdoorCell(row, 19)),
        total_payment: number(readAlumdoorCell(row, 23)),
        transaction_type: clean(readAlumdoorCell(row, 26)),
        owner: clean(readAlumdoorCell(row, 27)),
      };
      const base = canonicalize(raw);
      return { ...base, source_fingerprint: hash(raw), canonical_fingerprint: hash(base) };
    });
}

export function purchaseDocumentKey(row) {
  return [row.date ?? "INVALID_DATE", row.source_voucher, row.supplier].join("|");
}

export function purchaseFingerprint(value) { return hash(value); }
export function foldPurchaseValue(value) { return fold(value); }