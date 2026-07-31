from pathlib import Path

worker = Path("server/apps-src/alumdoor-worker/src/index.ts")
text = worker.read_text(encoding="utf-8")
start = text.index("async function validateItemMaster(")
end_marker = "\n}\n\n/**\n * Nhôm của xưởng có hai lớp số liệu:"
end = text.index(end_marker, start) + 2
replacement = r'''async function validateItemMaster(call: PlatformCall, subject: ValidatorSubject): Promise<Response> {
  const current = subject.action === "save" ? await readMaster(call, "Item", subject.name) : null;
  const doc = { ...(current ?? {}), ...(subject.payload ?? {}) };
  const code = String(doc.item_code ?? subject.name ?? "").trim();
  const groupName = String(doc.item_group ?? "").trim();
  const nature = String(doc.item_nature ?? "").trim();
  const stage = String(doc.material_stage ?? "").trim();
  const supply = String(doc.supply_type ?? "").trim();
  const mode = String(doc.inventory_mode ?? "Hàng thường").trim() || "Hàng thường";
  const stockUom = String(doc.stock_uom ?? "").trim();

  if (!code || !groupName) return refuse("Mặt hàng phải có mã và Nhóm hàng.");
  const group = await readMaster(call, "Item Group", groupName);
  if (!group || checked(group.disabled)) return refuse(`Nhóm hàng ${groupName} không tồn tại hoặc đã ngừng dùng.`);
  if (checked(group.is_group)) return refuse(`Nhóm hàng ${groupName} là nhóm chứa; hãy chọn một nhóm lá.`);

  const allowedColors = colorNames(doc);
  const duplicateColors = allowedColors.filter((color, index) => allowedColors.indexOf(color) !== index);
  if (duplicateColors.length) {
    return refuse(`${code}: mã màu ${[...new Set(duplicateColors)].join(", ")} đang bị khai lặp trong Các màu được phép.`);
  }
  const defaultColor = String(doc.default_color ?? "").trim();
  const invalidColor = await assertActiveColors(call, [...allowedColors, defaultColor].filter(Boolean), code);
  if (invalidColor) return invalidColor;
  if (defaultColor && allowedColors.length && !allowedColors.includes(defaultColor)) {
    return refuse(`${code}: Màu mặc định ${defaultColor} chưa nằm trong Các màu được phép.`);
  }

  if (!["Hàng tồn kho", "Dịch vụ", "Tài sản"].includes(nature)) {
    return refuse(`${code}: cần chọn đúng Bản chất mặt hàng.`);
  }
  if (nature === "Dịch vụ") {
    if (checked(doc.is_stock_item)) return refuse(`${code}: dịch vụ không được bật Quản lý tồn kho.`);
    if (checked(doc.include_item_in_manufacturing)) return refuse(`${code}: dịch vụ không được tham gia sản xuất.`);
    if (mode !== "Hàng thường" || doc.measurement_profile) {
      return refuse(`${code}: dịch vụ không dùng kiểu quản lý tồn hoặc bộ quy cách kho.`);
    }
    const reorderLevels = Array.isArray(doc.reorder_levels) ? doc.reorder_levels : [];
    if (stockUom || String(doc.default_warehouse ?? "").trim() || reorderLevels.length) {
      return refuse(`${code}: dịch vụ không được giữ ĐVT tồn, kho mặc định hoặc mức đặt lại.`);
    }
    if (checked(doc.has_batch_no) || checked(doc.has_serial_no)) {
      return refuse(`${code}: dịch vụ không theo dõi lô/serial.`);
    }
    return accept();
  }

  if (!checked(doc.is_stock_item)) return refuse(`${code}: hàng tồn kho/tài sản phải bật Quản lý tồn kho.`);
  if (!stockUom) return refuse(`${code}: cần Đơn vị tồn kho.`);
  if (nature === "Hàng tồn kho" && (!stage || !supply)) {
    return refuse(`${code}: cần Giai đoạn vật tư và Nguồn cung.`);
  }
  if (stage && !["Nguyên vật liệu", "Vật tư tiêu hao", "Bán thành phẩm", "Thành phẩm", "Hàng hoá"].includes(stage)) {
    return refuse(`${code}: Giai đoạn vật tư ${stage} không hợp lệ.`);
  }
  if (supply && !["Mua ngoài", "Tự sản xuất", "Mua hoặc sản xuất"].includes(supply)) {
    return refuse(`${code}: Nguồn cung ${supply} không hợp lệ.`);
  }
  if ((supply === "Mua ngoài" || supply === "Mua hoặc sản xuất") && !checked(doc.is_purchase_item)) {
    return refuse(`${code}: Nguồn cung ${supply} phải bật Được phép mua.`);
  }
  const manufacturedStage = stage === "Bán thành phẩm" || stage === "Thành phẩm";
  const manufacturedSupply = supply === "Tự sản xuất" || supply === "Mua hoặc sản xuất";
  if ((manufacturedStage || manufacturedSupply) && !checked(doc.include_item_in_manufacturing)) {
    return refuse(`${code}: mặt hàng bán thành phẩm/thành phẩm hoặc tự sản xuất phải bật Dùng trong sản xuất.`);
  }

  const profileName = String(doc.measurement_profile ?? "").trim();
  const defaultWarehouse = String(doc.default_warehouse ?? "").trim();
  const transactionUoms = [
    checked(doc.is_purchase_item) ? String(doc.default_purchase_uom ?? "").trim() : "",
    checked(doc.is_sales_item) ? String(doc.default_sales_uom ?? "").trim() : "",
  ].filter(Boolean);
  const uomNames = [...new Set([stockUom, ...transactionUoms])];
  const [profile, warehouse, ...uomRows] = await Promise.all([
    profileName ? readMaster(call, "Measurement Profile", profileName) : Promise.resolve(null),
    defaultWarehouse ? readMaster(call, "Warehouse", defaultWarehouse) : Promise.resolve(null),
    ...uomNames.map((uom) => readMaster(call, "UOM", uom)),
  ]);
  const uomMasters = new Map(uomNames.map((uom, index) => [uom, uomRows[index]]));

  const stockUomMaster = uomMasters.get(stockUom);
  if (!stockUomMaster || checked(stockUomMaster.disabled)) {
    return refuse(`${code}: Đơn vị tồn kho ${stockUom} không tồn tại hoặc đã ngừng dùng.`);
  }
  if (defaultWarehouse) {
    if (!warehouse || checked(warehouse.disabled)) {
      return refuse(`${code}: Kho mặc định ${defaultWarehouse} không tồn tại hoặc đã ngừng dùng.`);
    }
    if (checked(warehouse.is_group)) {
      return refuse(`${code}: Kho mặc định ${defaultWarehouse} là kho nhóm; hãy chọn kho lá.`);
    }
  }
  if (mode !== "Hàng thường") {
    if (!profileName) return refuse(`${code}: kiểu ${mode} phải có Bộ quy cách.`);
    if (!profile || checked(profile.disabled)) return refuse(`${code}: Bộ quy cách ${profileName} không tồn tại hoặc đã ngừng dùng.`);
    if (String(profile.inventory_mode ?? "") !== mode) {
      return refuse(`${code}: Bộ quy cách ${profileName} không thuộc kiểu ${mode}.`);
    }
  }

  const conversions = Array.isArray(doc.uom_conversions) ? doc.uom_conversions : [];
  for (const fieldname of ["default_purchase_uom", "default_sales_uom"]) {
    if (fieldname === "default_purchase_uom" && !checked(doc.is_purchase_item)) continue;
    if (fieldname === "default_sales_uom" && !checked(doc.is_sales_item)) continue;
    const uom = String(doc[fieldname] ?? "").trim();
    if (!uom) continue;
    const uomMaster = uomMasters.get(uom);
    if (!uomMaster || checked(uomMaster.disabled)) {
      return refuse(`${code}: Đơn vị giao dịch ${uom} không tồn tại hoặc đã ngừng dùng.`);
    }
    if (uom === stockUom) continue;
    const dynamicSquareMetreToSet = mode === "Thành phẩm theo m2"
      && ["m2", "m²", "sqm"].includes(normalizedUom(uom))
      && ["bộ", "bo", "set"].includes(normalizedUom(stockUom));
    if (dynamicSquareMetreToSet) continue;
    const converted = conversions.some((row) =>
      Boolean(row) && typeof row === "object" && !Array.isArray(row)
      && String((row as Record<string, unknown>).uom ?? "") === uom
      && positive((row as Record<string, unknown>).conversion_factor));
    if (!converted) {
      return refuse(`${code}: ${uom} khác ĐVT tồn ${stockUom} nhưng chưa có hệ số quy đổi.`);
    }
  }
  return accept();
}'''
text = text[:start] + replacement + text[end:]
worker.write_text(text, encoding="utf-8")

tests = Path("server/tests/alumdoor-item-validator.test.mjs")
test_text = tests.read_text(encoding="utf-8")
old = 'const leafGroup = { "Item Group:Nguyên vật liệu": { item_group_name: "Nguyên vật liệu", is_group: 0 } };'
new = '''const leafGroup = {
  "Item Group:Nguyên vật liệu": { item_group_name: "Nguyên vật liệu", is_group: 0 },
  "UOM:Kg": { uom_name: "Kg" },
};'''
if old not in test_text:
    raise SystemExit("leafGroup anchor not found")
test_text = test_text.replace(old, new, 1)
if 'test("Item validator rejects service manufacturing configuration"' not in test_text:
    test_text += r'''

test("Item validator rejects service manufacturing configuration", async () => {
  const response = await validateItem({
    item_code: "SERVICE-MFG",
    item_group: "Nguyên vật liệu",
    item_nature: "Dịch vụ",
    is_stock_item: 0,
    include_item_in_manufacturing: 1,
    inventory_mode: "Hàng thường",
  }, { masters: leafGroup });
  assert.equal(response.status, 422);
  assert.match(await message(response), /dịch vụ không được tham gia sản xuất/i);
});

test("Item validator rejects service warehouse and reorder configuration", async () => {
  const response = await validateItem({
    item_code: "SERVICE-STOCK-CONFIG",
    item_group: "Nguyên vật liệu",
    item_nature: "Dịch vụ",
    is_stock_item: 0,
    inventory_mode: "Hàng thường",
    stock_uom: "Giờ",
    default_warehouse: "K36",
    reorder_levels: [{ warehouse: "K36", reorder_level: 1 }],
  }, { masters: leafGroup });
  assert.equal(response.status, 422);
  assert.match(await message(response), /không được giữ ĐVT tồn, kho mặc định hoặc mức đặt lại/i);
});

test("Item validator requires purchase eligibility for externally supplied stock", async () => {
  const response = await validateItem({ ...validRawItem(), is_purchase_item: 0 }, { masters: leafGroup });
  assert.equal(response.status, 422);
  assert.match(await message(response), /Nguồn cung Mua ngoài phải bật Được phép mua/i);
});

test("Item validator requires manufacturing eligibility for produced items", async () => {
  const response = await validateItem({
    item_code: "FG",
    item_group: "Thành phẩm",
    item_nature: "Hàng tồn kho",
    material_stage: "Thành phẩm",
    supply_type: "Tự sản xuất",
    is_stock_item: 1,
    is_sales_item: 1,
    include_item_in_manufacturing: 0,
    inventory_mode: "Hàng thường",
    stock_uom: "Cái",
    default_sales_uom: "Cái",
  }, {
    masters: {
      "Item Group:Thành phẩm": { item_group_name: "Thành phẩm", is_group: 0 },
      "UOM:Cái": { uom_name: "Cái" },
    },
  });
  assert.equal(response.status, 422);
  assert.match(await message(response), /phải bật Dùng trong sản xuất/i);
});

test("Item validator rejects a group node as the Item leaf group", async () => {
  const response = await validateItem(validRawItem(), {
    masters: {
      ...leafGroup,
      "Item Group:Nguyên vật liệu": { item_group_name: "Nguyên vật liệu", is_group: 1 },
    },
  });
  assert.equal(response.status, 422);
  assert.match(await message(response), /là nhóm chứa/i);
});

test("Item validator rejects a group warehouse as default warehouse", async () => {
  const response = await validateItem({ ...validRawItem(), default_warehouse: "Kho Tổng" }, {
    masters: {
      ...leafGroup,
      "Warehouse:Kho Tổng": { warehouse_name: "Kho Tổng", is_group: 1 },
    },
  });
  assert.equal(response.status, 422);
  assert.match(await message(response), /là kho nhóm/i);
});

test("Item validator rejects an unknown or disabled stock UOM", async () => {
  const response = await validateItem({ ...validRawItem(), stock_uom: "Kg lỗi", default_purchase_uom: "Kg lỗi" }, {
    masters: leafGroup,
  });
  assert.equal(response.status, 422);
  assert.match(await message(response), /Đơn vị tồn kho Kg lỗi không tồn tại hoặc đã ngừng dùng/i);
});
'''
tests.write_text(test_text, encoding="utf-8")
