type Json = Record<string, unknown>;

export type PurchaseRuntimeCall = (path: string, init?: RequestInit) => Promise<Response>;
export type PurchaseRuntimeSurface = "order" | "receipt";
export type PurchaseRuntimeSource =
  | "measurement_profile"
  | "material_specification"
  | "item"
  | "calculated"
  | "receipt_actual"
  | "legacy";

export interface PurchaseRuntimeField {
  fieldname: string;
  label: string;
  source: PurchaseRuntimeSource;
  visible: boolean;
  required: boolean;
  read_only: boolean;
  sequence: number;
}

export interface PurchaseMeasurementRuntime {
  name: string;
  inventory_mode: string | null;
  stock_uom: string | null;
  track_dimension_lot: boolean;
  require_color: boolean;
  require_condition: boolean;
  require_length: boolean;
  require_width: boolean;
  require_piece_qty: boolean;
  track_bundle_qty: boolean;
  weight_tolerance_pct: number | null;
}

export interface PurchaseMaterialRuntime {
  name: string;
  spec_code: string | null;
  spec_type: string | null;
  profile_system: string | null;
  section_code: string | null;
  theoretical_kg_per_m: number | null;
  thickness_mm: number | null;
  width_m: number | null;
  effective_width_m: number | null;
  scrap_threshold_m: number | null;
}

export interface PurchaseItemRuntimeContract {
  item_code: string;
  surface: PurchaseRuntimeSurface;
  purchase_uom: string | null;
  stock_uom: string | null;
  measurement_profile: PurchaseMeasurementRuntime | null;
  material_specification: PurchaseMaterialRuntime | null;
  tracking: {
    batch: boolean;
    serial: boolean;
    catch_weight: boolean;
    dimension_lot: boolean;
  };
  fields: PurchaseRuntimeField[];
  warnings: Array<{ code: string; label: string; where: string }>;
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function on(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value: unknown): number | null {
  const parsed = finite(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

async function readResource(call: PurchaseRuntimeCall, doctype: string, name: string): Promise<Json | null> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Json }).data ?? null;
}

function field(
  fieldname: string,
  label: string,
  source: PurchaseRuntimeSource,
  visible: boolean,
  required: boolean,
  readOnly: boolean,
  sequence: number,
): PurchaseRuntimeField {
  return { fieldname, label, source, visible, required, read_only: readOnly, sequence };
}

/**
 * Resolve Item → Measurement Profile → Material Specification thành contract chung cho PO/Receipt.
 *
 * Measurement Profile sở hữu dữ kiện vật lý phải nhập. Material Specification chỉ cung cấp facts
 * kỹ thuật. Item sở hữu UOM/tracking. Receipt được thêm lớp actual; React không được suy lại bằng
 * tên profile, Item Group hay inventory_mode.
 */
export async function readPurchaseItemRuntime(
  call: PurchaseRuntimeCall,
  itemCode: string,
  surface: PurchaseRuntimeSurface,
  suppliedItem?: Json | null,
): Promise<PurchaseItemRuntimeContract | null> {
  const code = text(itemCode);
  if (!code) return null;
  const item = suppliedItem ?? await readResource(call, "Item", code);
  if (!item) return null;

  const profileName = text(item.measurement_profile);
  const specName = text(item.material_specification);
  const [profile, specification] = await Promise.all([
    profileName ? readResource(call, "Measurement Profile", profileName).catch(() => null) : Promise.resolve(null),
    specName ? readResource(call, "Material Specification", specName).catch(() => null) : Promise.resolve(null),
  ]);

  const measurement: PurchaseMeasurementRuntime | null = profile
    ? {
      name: profileName,
      inventory_mode: text(profile.inventory_mode) || null,
      stock_uom: text(profile.stock_uom) || null,
      track_dimension_lot: on(profile.track_dimension_lot),
      require_color: on(profile.require_color),
      require_condition: on(profile.require_condition),
      require_length: on(profile.require_length),
      require_width: on(profile.require_width),
      require_piece_qty: on(profile.require_piece_qty),
      track_bundle_qty: on(profile.track_bundle_qty),
      weight_tolerance_pct: finite(profile.weight_tolerance_pct),
    }
    : null;

  const material: PurchaseMaterialRuntime | null = specification
    ? {
      name: specName,
      spec_code: text(specification.spec_code ?? specification.name) || null,
      spec_type: text(specification.spec_type) || null,
      profile_system: text(specification.profile_system) || null,
      section_code: text(specification.section_code) || null,
      theoretical_kg_per_m: positive(specification.theoretical_kg_per_m),
      thickness_mm: positive(specification.thickness_mm),
      width_m: positive(specification.width_m),
      effective_width_m: positive(specification.effective_width_m),
      scrap_threshold_m: finite(specification.scrap_threshold_m),
    }
    : null;

  const catchWeight = on(item.has_catch_weight);
  const dimensionLot = Boolean(measurement?.track_dimension_lot);
  const purchaseUom = text(item.default_purchase_uom) || text(item.stock_uom) || null;
  const stockUom = text(item.stock_uom) || measurement?.stock_uom || null;
  const hasKgPerM = Boolean(material?.theoretical_kg_per_m);
  const canCalculateTheoreticalKg = Boolean(
    hasKgPerM && measurement?.require_length && measurement?.require_piece_qty,
  );

  const fields: PurchaseRuntimeField[] = [
    field("material_specification", "Quy cách", "material_specification", Boolean(specName), false, true, 10),
    field("color", "Màu", "measurement_profile", Boolean(measurement?.require_color), Boolean(measurement?.require_color), false, 20),
    field("condition", "Tình trạng", "measurement_profile", Boolean(measurement?.require_condition), Boolean(measurement?.require_condition), false, 30),
    field("length_m", "Dài một cây/đoạn (m)", "measurement_profile", Boolean(measurement?.require_length), Boolean(measurement?.require_length), false, 40),
    field("width_m", "Rộng (m)", "measurement_profile", Boolean(measurement?.require_width), Boolean(measurement?.require_width), false, 50),
    field("qty_bar", "Số cây/lá/tấm", "measurement_profile", Boolean(measurement?.require_piece_qty), Boolean(measurement?.require_piece_qty), false, 60),
    field("qty_bundle", "Số bó", "measurement_profile", Boolean(measurement?.track_bundle_qty), false, false, 70),
    field("theoretical_kg_per_m", "Kg/m", "material_specification", hasKgPerM, false, true, 80),
    field("theoretical_kg", surface === "receipt" ? "Kg barem" : "Kg đặt", "calculated", canCalculateTheoreticalKg, false, true, 90),
    field("actual_weight_kg", "Kg thực cân", "receipt_actual", surface === "receipt" && catchWeight, surface === "receipt" && catchWeight, false, 100),
    field("actual_kg_per_m", "Kg/m thực", "receipt_actual", surface === "receipt" && catchWeight && Boolean(measurement?.require_length), false, true, 110),
    field("actual_kg_per_sqm", "Kg/m² thực", "receipt_actual", surface === "receipt" && Boolean(measurement?.require_length) && Boolean(measurement?.require_width), false, true, 120),
    field("total_length_m", "Tổng chiều dài (m)", "calculated", surface === "receipt" && Boolean(measurement?.require_length), false, true, 130),
    // Chưa có cờ semantic riêng cho Dập trong Measurement Profile. Giữ compatibility theo
    // track_dimension_lot thay vì tên "Nhôm cây/lá"; source=legacy để audit nhìn thấy debt này.
    field("is_stamped", "Dập", "legacy", dimensionLot && Boolean(measurement?.require_piece_qty), false, false, 140),
    // SO NCC là tham chiếu giao nhận, không phải measurement. Hiện khi dòng được theo dõi theo lô/kích thước.
    field("so_no", "Số SO NCC", "legacy", dimensionLot, false, false, 150),
    field("qty", catchWeight ? (surface === "receipt" ? "SL tính giá (Kg thực)" : "SL tính giá (Kg)") : "Số lượng", catchWeight ? "calculated" : "item", !catchWeight, !catchWeight, catchWeight, 200),
    field("uom", "ĐVT", "item", true, true, true, 210),
    field("rate", "Đơn giá (VNĐ)", "item", true, true, false, 220),
    field("amount", "Thành tiền (VNĐ)", "calculated", true, false, true, 230),
  ].sort((left, right) => left.sequence - right.sequence || left.fieldname.localeCompare(right.fieldname));

  const warnings: PurchaseItemRuntimeContract["warnings"] = [];
  if (!profileName) {
    warnings.push({
      code: "MEASUREMENT_PROFILE_MISSING",
      label: "Mặt hàng chưa gắn Bộ theo dõi vật tư; Purchase chỉ dùng các trường giao dịch cơ bản.",
      where: `Danh mục → Mặt hàng → ${code} → Bộ theo dõi vật tư`,
    });
  } else if (!profile) {
    warnings.push({
      code: "MEASUREMENT_PROFILE_UNREADABLE",
      label: `Không đọc được Bộ theo dõi vật tư ${profileName}.`,
      where: `Danh mục → Bộ theo dõi vật tư → ${profileName}`,
    });
  }
  if (specName && !specification) {
    warnings.push({
      code: "MATERIAL_SPECIFICATION_UNREADABLE",
      label: `Không đọc được Quy cách kỹ thuật ${specName}.`,
      where: `Danh mục → Quy cách kỹ thuật vật tư → ${specName}`,
    });
  }
  if (measurement?.require_length && measurement?.require_piece_qty && !hasKgPerM && catchWeight) {
    warnings.push({
      code: "KG_PER_M_MISSING",
      label: "Dòng cân thực tế cần đối chiếu barem nhưng Quy cách kỹ thuật chưa có Kg/m.",
      where: specName ? `Danh mục → Quy cách kỹ thuật vật tư → ${specName} → Kg/m` : `Danh mục → Mặt hàng → ${code} → Quy cách kỹ thuật`,
    });
  }

  return {
    item_code: code,
    surface,
    purchase_uom: purchaseUom,
    stock_uom: stockUom,
    measurement_profile: measurement,
    material_specification: material,
    tracking: {
      batch: on(item.has_batch_no),
      serial: on(item.has_serial_no),
      catch_weight: catchWeight,
      dimension_lot: dimensionLot,
    },
    fields,
    warnings,
  };
}
