const clean = (value) => String(value ?? "").trim();
const fold = (value) => clean(value)
  .normalize("NFD")
  .replace(/\p{M}/gu, "")
  .toLocaleUpperCase("vi")
  .replace(/[Đ]/g, "D")
  .replace(/\s+/g, " ")
  .trim();

/**
 * Explicit evidence-backed exceptions where the physical stock sheet carries a
 * finish/specification dimension that is not represented by a separate source
 * business Item code.
 *
 * These rules never invent Item codes. They only attach a stock row to an Item
 * identity that already exists in the canonical MS LIÊN BS / Trang tính29 data,
 * while the raw lot color/profile remains on Aluminium Lot.
 */
const LOT_ITEM_EVIDENCE = Object.freeze([
  Object.freeze({
    source_sheet: "AL70 - 1 LỚP",
    lot_color: "XF",
    canonical_item_code: "NVL-AL70(1LOP)-VK",
    reason: "Trang tính29 row 114 identifies NVL-AL70(1LOP)-VK as AL70 (1 LỚP) with source color XINGFA; TỒN NHÔM uses XF as the lot color abbreviation.",
    evidence: "apps/alumdoor/docs/nguon/ms-lien/Trang-tính29.md#row-114",
  }),
  Object.freeze({
    source_sheet: "AL70 1.5MM",
    lot_color: "THÔ",
    canonical_item_code: "NVL-AL70(1LOP)-THO",
    reason: "No separate AL70 1.5MM business Item code exists in the extracted catalog/transactions; Trang tính29 row 115 is the source-coded AL70 (1 LỚP) THÔ identity. The 1.5MM distinction is preserved on the physical lot profile instead of creating a synthetic Item code.",
    evidence: "apps/alumdoor/docs/nguon/ms-lien/Trang-tính29.md#row-115 + apps/alumdoor/docs/nguon/ton-nhom/AL70-15MM.md",
  }),
  Object.freeze({
    source_sheet: "AL752",
    lot_color: "9512 ( TRẮNG )",
    canonical_item_code: "NVL-AL752-THO",
    reason: "Trang tính29 exposes only source-coded AL752 material identities GS/VK/THÔ and no white-specific business code. 9512 (TRẮNG) is therefore retained as a lot finish dimension and linked to the source-coded neutral/raw AL752 profile identity instead of inventing AL752-TRANG.",
    evidence: "apps/alumdoor/docs/nguon/ms-lien/Trang-tính29.md#rows-94-96 + apps/alumdoor/docs/nguon/ton-nhom/AL752.md",
  }),
  Object.freeze({
    source_sheet: "VIPST700",
    lot_color: "4004.0",
    canonical_item_code: "NVL-ALVIPST700-THO",
    reason: "Trang tính29 exposes VIPST700 only as GS/VK/THÔ source-coded identities; no business Item code for finish 4004 exists. The source row is a paint-error physical lot, so 4004 remains raw lot finish/provenance while the lot links to the source-coded neutral/raw VIPST700 profile identity.",
    evidence: "apps/alumdoor/docs/nguon/ms-lien/Trang-tính29.md#rows-106-108 + apps/alumdoor/docs/nguon/ton-nhom/VIPST700.md#row-55",
  }),
]);

export function resolveAlumdoorLotItemEvidence({ source_sheet, color }) {
  const sheet = fold(source_sheet);
  const lotColor = fold(color);
  const match = LOT_ITEM_EVIDENCE.find((entry) => (
    fold(entry.source_sheet) === sheet && fold(entry.lot_color) === lotColor
  ));
  return match ?? null;
}

export function listAlumdoorLotItemEvidence() {
  return LOT_ITEM_EVIDENCE;
}
