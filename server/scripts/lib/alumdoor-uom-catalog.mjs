/**
 * Canonical Alumdoor UOM catalogue.
 *
 * This is the single source for stable UOM records. Source typos/aliases are normalized
 * before persistence; they must never become separate UOM masters because that would split
 * stock and commercial quantities across duplicate units.
 */
export const ALUMDOOR_UOM_CATALOG = Object.freeze([
  { name: "Cái", mustBeWholeNumber: true },
  { name: "Bộ", mustBeWholeNumber: true },
  { name: "Kg", mustBeWholeNumber: false },
  { name: "Mét", mustBeWholeNumber: false },
  { name: "m2", mustBeWholeNumber: false },
  { name: "Cây", mustBeWholeNumber: true },
  { name: "Lá", mustBeWholeNumber: true },
  { name: "Thân", mustBeWholeNumber: true },
  { name: "Thanh", mustBeWholeNumber: true },
  { name: "Sợi", mustBeWholeNumber: true },
  { name: "Cuộn", mustBeWholeNumber: true },
  { name: "Tấm", mustBeWholeNumber: true },
  { name: "Túi", mustBeWholeNumber: true },
  { name: "Hộp", mustBeWholeNumber: true },
  /**
   * `Thùng` KHÔNG được tạo — E07 (`docs/brd-v2/brd-entities/danh-muc-nho.md`) xếp nó cùng
   * `BĂNG` · `BẢNG` · `VỈ` vào nhóm "xem lại, mỗi thứ dùng đúng 1 lần": nhiều khả năng là quy
   * cách đóng gói của một lần mua lẻ, không phải đơn vị tồn. Đo trên D1 local 2026-08-19 xác
   * nhận đúng một lần dùng. Không tạo cho tới khi thấy dùng lại.
   */
  { name: "Bình", mustBeWholeNumber: true },
  { name: "Lít", mustBeWholeNumber: false },
  { name: "Cặp", mustBeWholeNumber: true },
  { name: "Con", mustBeWholeNumber: true },
]);

const normalizeKey = (value) => String(value ?? "")
  .replace(/\s+/g, " ")
  .trim()
  .normalize("NFC")
  .toLocaleUpperCase("vi");

export const ALUMDOOR_UOM_ALIASES = Object.freeze(new Map([
  ["M", "Mét"],
  ["MÉT", "Mét"],
  ["M2", "m2"],
  ["M²", "m2"],
  ["CUỐN", "Cuộn"],
  ["TÂM", "Tấm"],
]));

const canonicalByKey = new Map(
  ALUMDOOR_UOM_CATALOG.map((entry) => [normalizeKey(entry.name), entry.name]),
);

/** Normalize a known Alumdoor UOM or source alias. Unknown values are returned trimmed. */
export function canonicalAlumdoorUom(value) {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  const key = normalizeKey(raw);
  return ALUMDOOR_UOM_ALIASES.get(key) ?? canonicalByKey.get(key) ?? raw;
}
