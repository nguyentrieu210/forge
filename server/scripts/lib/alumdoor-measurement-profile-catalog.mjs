export const MEASUREMENT_PROFILES = Object.freeze([
  Object.freeze({ name: "Hàng thường", inventoryMode: "Hàng thường", stockUom: "Cái", trackDimensionLot: false, requireColor: false, requireCondition: false, requireLength: false, requireWidth: false, requirePieceQty: false, trackBundleQty: false }),
  Object.freeze({ name: "Nhôm cây/lá", inventoryMode: "Nhôm cây/lá", stockUom: "Cây", trackDimensionLot: true, requireColor: true, requireCondition: true, requireLength: true, requireWidth: false, requirePieceQty: true, trackBundleQty: true, weightTolerancePct: 13, note: "Cây/Lá là đơn vị tồn; Kg là catch weight và đơn vị mua/định giá khi áp dụng." }),
  Object.freeze({ name: "Ống/trục", inventoryMode: "Nhôm cây/lá", stockUom: "Kg", trackDimensionLot: true, requireColor: false, requireCondition: true, requireLength: true, requireWidth: false, requirePieceQty: true, trackBundleQty: true, weightTolerancePct: 13, note: "Mua và tồn theo Kg; chiều dài/số cây là đại lượng theo dõi giao nhận." }),
  Object.freeze({ name: "Tấm/Kính", inventoryMode: "Tấm/Kính", stockUom: "Tấm", trackDimensionLot: true, requireColor: false, requireCondition: false, requireLength: true, requireWidth: true, requirePieceQty: true, trackBundleQty: false }),
  Object.freeze({ name: "Cuộn", inventoryMode: "Cuộn", stockUom: "Kg", trackDimensionLot: true, requireColor: false, requireCondition: false, requireLength: false, requireWidth: true, requirePieceQty: false, trackBundleQty: false }),
  Object.freeze({ name: "Lô/Serial", inventoryMode: "Lô/Serial", stockUom: "Cái", trackDimensionLot: false, requireColor: false, requireCondition: false, requireLength: false, requireWidth: false, requirePieceQty: false, trackBundleQty: false }),
  Object.freeze({ name: "Thành phẩm theo m2", inventoryMode: "Thành phẩm theo m2", stockUom: "Bộ", trackDimensionLot: false, requireColor: true, requireCondition: false, requireLength: true, requireWidth: true, requirePieceQty: false, trackBundleQty: false, note: "Tồn theo Bộ; kích thước bán/geometry không thuộc Measurement Profile." }),
]);

export const MEASUREMENT_PROFILE_NAMES = Object.freeze(MEASUREMENT_PROFILES.map((row) => row.name));

export function measurementProfileByName(name) {
  return MEASUREMENT_PROFILES.find((row) => row.name === name) ?? null;
}

export function measurementProfilePayload(row) {
  return Object.freeze({
    profile_name: row.name,
    inventory_mode: row.inventoryMode,
    stock_uom: row.stockUom,
    track_dimension_lot: Boolean(row.trackDimensionLot),
    require_color: Boolean(row.requireColor),
    require_condition: Boolean(row.requireCondition),
    require_length: Boolean(row.requireLength),
    require_width: Boolean(row.requireWidth),
    require_piece_qty: Boolean(row.requirePieceQty),
    track_bundle_qty: Boolean(row.trackBundleQty),
    ...(Number.isFinite(row.weightTolerancePct) ? { weight_tolerance_pct: row.weightTolerancePct } : {}),
    ...(row.note ? { note: row.note } : {}),
    disabled: false,
    _migration_source: "alumdoor-measurement-profile-canonical-2026-08-16",
  });
}
