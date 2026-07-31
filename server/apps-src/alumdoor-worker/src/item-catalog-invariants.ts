interface ValidatorSubject {
  doctype: string;
  name: string;
  action: string;
  payload: Record<string, unknown>;
}

const accept = () => Response.json({ ok: true });
const refuse = (message: string) => Response.json({ message }, { status: 422 });

function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  const normalized = String(value ?? "").trim().toLocaleLowerCase("vi");
  return normalized === "có" || normalized === "co" || normalized === "yes" || normalized === "true";
}

/**
 * Các invariant bổ sung không cần đọc mạng. Validator lịch sử vẫn chịu trách nhiệm cho
 * Item Group, màu, Measurement Profile và UOM conversion; lớp này khóa những tổ hợp field
 * vốn có thể lọt qua API trực tiếp và làm hỏng readiness của kho/sản xuất.
 */
export async function validateItemCatalogInvariants(request: Request): Promise<Response> {
  const subject = await request.json() as ValidatorSubject;
  if (subject.doctype !== "Item") return accept();

  const doc = subject.payload ?? {};
  const code = String(doc.item_code ?? subject.name ?? "").trim() || "Item";
  const nature = String(doc.item_nature ?? "").trim();
  const stage = String(doc.material_stage ?? "").trim();
  const supply = String(doc.supply_type ?? "").trim();

  if (nature === "Dịch vụ") {
    if (checked(doc.include_item_in_manufacturing)) {
      return refuse(`${code}: dịch vụ không được tham gia sản xuất.`);
    }
    const reorderLevels = Array.isArray(doc.reorder_levels) ? doc.reorder_levels : [];
    if (String(doc.stock_uom ?? "").trim()
      || String(doc.default_warehouse ?? "").trim()
      || reorderLevels.length) {
      return refuse(`${code}: dịch vụ không được giữ ĐVT tồn, kho mặc định hoặc mức đặt lại.`);
    }
    return accept();
  }

  const allowedStages = new Set([
    "Nguyên vật liệu",
    "Vật tư tiêu hao",
    "Bán thành phẩm",
    "Thành phẩm",
    "Hàng hoá",
  ]);
  const allowedSupplies = new Set(["Mua ngoài", "Tự sản xuất", "Mua hoặc sản xuất"]);

  if (stage && !allowedStages.has(stage)) {
    return refuse(`${code}: Giai đoạn vật tư ${stage} không hợp lệ.`);
  }
  if (supply && !allowedSupplies.has(supply)) {
    return refuse(`${code}: Nguồn cung ${supply} không hợp lệ.`);
  }
  if ((supply === "Mua ngoài" || supply === "Mua hoặc sản xuất")
    && !checked(doc.is_purchase_item)) {
    return refuse(`${code}: Nguồn cung ${supply} phải bật Được phép mua.`);
  }

  const produced = supply === "Tự sản xuất" || supply === "Mua hoặc sản xuất";
  const productionStage = stage === "Bán thành phẩm" || stage === "Thành phẩm";
  if ((produced || productionStage) && !checked(doc.include_item_in_manufacturing)) {
    return refuse(`${code}: mặt hàng bán thành phẩm/thành phẩm hoặc tự sản xuất phải bật Dùng trong sản xuất.`);
  }
  return accept();
}
