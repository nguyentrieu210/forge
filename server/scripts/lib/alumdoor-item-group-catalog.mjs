/**
 * Canonical Alumdoor Item Group tree.
 *
 * One authority for stable group names used by Item, color scopes and local seed data.
 * Legacy source labels are aliases only; they must never create a second active group.
 */
export const ALUMDOOR_ITEM_GROUP_CATALOG = Object.freeze([
  { name: "Tất cả mặt hàng", parent: null, isGroup: true },

  { name: "Cửa thành phẩm", parent: "Tất cả mặt hàng", isGroup: true },
  { name: "Motor & điện", parent: "Tất cả mặt hàng", isGroup: true },
  { name: "Phụ kiện & vật tư", parent: "Tất cả mặt hàng", isGroup: true },

  { name: "Cửa CN Đức", parent: "Cửa thành phẩm", isGroup: false },
  { name: "Cửa tấm liền Úc", parent: "Cửa thành phẩm", isGroup: false },
  { name: "Cửa Đài Loan", parent: "Cửa thành phẩm", isGroup: false },
  { name: "Cửa Đài Loan Inox", parent: "Cửa thành phẩm", isGroup: false },
  { name: "Cửa Siêu Trường", parent: "Cửa thành phẩm", isGroup: false },
  { name: "Cửa Lưới", parent: "Cửa thành phẩm", isGroup: false },
  { name: "Cửa kéo Đài Loan", parent: "Cửa thành phẩm", isGroup: false },

  { name: "Motor", parent: "Motor & điện", isGroup: false },
  { name: "Bình lưu điện", parent: "Motor & điện", isGroup: false },
  { name: "Điều khiển & phụ kiện điện", parent: "Motor & điện", isGroup: false },
  { name: "Linh kiện motor", parent: "Motor & điện", isGroup: false },

  { name: "Nan/lá cửa", parent: "Phụ kiện & vật tư", isGroup: false },
  { name: "Ray và trục", parent: "Phụ kiện & vật tư", isGroup: false },
  { name: "Phụ kiện chung", parent: "Phụ kiện & vật tư", isGroup: false },
  { name: "Phụ kiện CN Đức", parent: "Phụ kiện & vật tư", isGroup: false },
  // Source MS explicitly calls out "phụ kiện cần sơn tĩnh điện" as an STĐ scope.
  // Keep it as a leaf so Surface Finish can link to an exact business group instead of free text.
  { name: "Phụ kiện cần sơn tĩnh điện", parent: "Phụ kiện & vật tư", isGroup: false },
]);

const normalizeKey = (value) => String(value ?? "")
  .replace(/\s+/g, " ")
  .trim()
  .normalize("NFC")
  .toLocaleUpperCase("vi");

const canonicalByKey = new Map(
  ALUMDOOR_ITEM_GROUP_CATALOG.map((entry) => [normalizeKey(entry.name), entry.name]),
);

export const ALUMDOOR_ITEM_GROUP_ALIASES = Object.freeze(new Map([
  [normalizeKey("Cửa siêu trường"), "Cửa Siêu Trường"],
  [normalizeKey("Phụ kiện"), "Phụ kiện chung"],
  [normalizeKey("Mô tơ"), "Motor"],
  [normalizeKey("Bộ lưu điện"), "Bình lưu điện"],
  [normalizeKey("Remote và điều khiển"), "Điều khiển & phụ kiện điện"],
]));

/** Normalize a known canonical/legacy Alumdoor Item Group. Unknown values remain trimmed. */
export function canonicalAlumdoorItemGroup(value) {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  const key = normalizeKey(raw);
  return ALUMDOOR_ITEM_GROUP_ALIASES.get(key) ?? canonicalByKey.get(key) ?? raw;
}

export function alumdoorItemGroupByName(name) {
  const canonical = canonicalAlumdoorItemGroup(name);
  return ALUMDOOR_ITEM_GROUP_CATALOG.find((entry) => entry.name === canonical);
}
