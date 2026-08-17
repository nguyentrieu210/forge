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
  "NVL-BO1VIS AL71": "KG",
  "MŨI MÀI HỘP KIM": "CÁI",
  "NVL-VDAY-TDU-KTD": "KG",
  "NVL-V4-KEM_TOLE75_STD": "KG",
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

export function extractRealPurchaseRows(markdown) {
  return parseAlumdoorIndexedMarkdownRows(markdown)
    .filter((row) => fold(readAlumdoorCell(row, 7)).startsWith("MUA HANG"))
    .map((row) => {
      const base = {
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
        classification: "PURCHASE_RECEIPT",
      };
      return { ...base, source_fingerprint: hash(base) };
    });
}

export function purchaseDocumentKey(row) {
  return [row.date ?? "INVALID_DATE", row.source_voucher, row.supplier].join("|");
}

export function purchaseFingerprint(value) { return hash(value); }
export function foldPurchaseValue(value) { return fold(value); }
