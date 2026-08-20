# Alumdoor — hợp đồng payload màn bán hàng (làn A → làn B)

> 2026-08-21 · nhánh `feat/ban-hang-danh-muc`.
>
> **Luật số một của hợp đồng này: mọi trường dưới đây là OPTIONAL và THÊM MỚI.**
> Không trường cũ nào đổi nghĩa, không trường cũ nào bị xoá. Đọc theo kiểu
> *"có thì hiện, không có thì ẩn"* là đúng và an toàn.
>
> **Luật số hai: `null` ≠ vắng mặt ≠ `0`.**
> - khoá **vắng mặt** = server chưa đo được / không áp dụng cho mã này → **ẩn ô đi**;
> - khoá có mặt, giá trị **`null`** = **CHƯA KHAI trong danh mục** → **hiện trạng thái "chưa khai"
>   kèm chỉ đường sửa**, tuyệt đối không thay bằng 0 hay 1;
> - `0` là số thật.
>
> Đây không phải chuyện hình thức. 33 mã `RT_` đang **cố ý** chưa có hệ số quy đổi Mét→Cây; vẽ
> `null` thành `1` là ghi sai tồn của cả nhóm ray/trục.

---

## A. `alumdoor.sales.item_context`

`POST method/alumdoor.sales.item_context`

### A.0 Tham số vào

| Tham số | Kiểu | Cũ/Mới | Ý nghĩa |
|---|---|---|---|
| `item_code` | string | cũ | bắt buộc |
| `uom` | string | cũ | ĐVT dòng đang chọn; trống → `default_sales_uom` → `stock_uom` |
| `price_list` | string | cũ | trống → không tra bảng giá |
| `currency` | string | cũ | mặc định `VND` |
| `warehouse` | string | cũ | kho của dòng/chứng từ |
| **`qty`** | number | **MỚI** | SL đang gõ trên dòng, theo `uom`. Có thì server trả `shortage`; không có thì bỏ qua |
| **`include_color_scope`** | boolean | **MỚI** | mặc định **`true`**. Đặt `false` để bỏ hẳn khâu màu (tiết kiệm ~30 lượt đọc) |

### A.1 Trường CŨ — giữ nguyên 100%

`item_code` · `item_group` · `door_type` · `inventory_mode` · `measurement_profile` ·
`min_area_sqm` · `purchase_kg_per_m2` · `leaf_divisor_m` · `default_color` · `selected_uom` ·
`allowed_uoms` · `uom_options` · `conversion_factor` · `stock_uom` · `warehouse` ·
`managed_stock` · `available_stock_qty` · `available_qty` · `availability_status` · `rate` ·
`currency` · `item_price` · `price_missing` · `price_error` · `stock_read_error`

> ⚠️ `default_color` **luôn `null` trên brief v2** — trường `Item.default_color` đã bị gỡ khỏi
> `alumdoor-v2.json`. Giữ lại chỉ để không phá hợp đồng cũ. **Dùng `color_scope` thay cho nó.**

### A.2 `uom_ladder` — thang ĐVT thật (mua / tồn / bán) 🟥 P0

```jsonc
"uom_ladder": {
  "purchase_uom": "Kg",          // string | null
  "stock_uom": "Cây",
  "sales_uom": "Mét",            // Item.default_sales_uom
  "selected_uom": "Mét",
  "catch_weight": true,          // Item.has_catch_weight — tiền theo Kg, tồn theo cây
  "weight_uom": "Kg",            // string | null
  "entries": [
    { "uom": "Cây", "roles": ["stock"],    "conversion_factor": 1,    "declared": true,  "factor_source": "stock_uom" },
    { "uom": "Mét", "roles": ["sales","selected"], "conversion_factor": null, "declared": false, "factor_source": null },
    { "uom": "Kg",  "roles": ["purchase"], "conversion_factor": null, "declared": false, "factor_source": "catch_weight" }
  ],
  "missing_factors": [
    {
      "uom": "Mét",
      "roles": ["sales"],
      "reason": "Chưa khai hệ số quy đổi Mét → Cây.",
      "fix_where": "Danh mục → Mặt hàng → RT_TRUC114_18 → Đơn vị quy đổi khác"
    }
  ]
}
```

| Khoá | Kiểu | Ý nghĩa |
|---|---|---|
| `entries[].conversion_factor` | `number \| null` | **`null` = CHƯA KHAI.** Không được coi là 1 |
| `entries[].declared` | boolean | `false` ⇔ `conversion_factor === null` |
| `entries[].factor_source` | `"stock_uom" \| "uom_conversions" \| "dynamic_area" \| "catch_weight" \| null` | `"dynamic_area"` = cửa bán m² tồn Bộ, hệ số theo TỪNG dòng, không tĩnh. `"catch_weight"` = **cố ý không có hệ số** (xem A.7) |
| `missing_factors` | array | rỗng = đủ. Mỗi phần tử có `fix_where` — hiện nguyên văn cho người bán |

### A.3 `uom_gap` — vì sao ĐVT này không dùng được 🟥 P0

Có mặt **cả trong thân 422** của lỗi `ĐVT "…" chưa được khai`.

```jsonc
"uom_gap": {
  "uom": "Mét",
  "kind": "MISSING_CONVERSION",   // "MISSING_CONVERSION" | "UNDECLARED_UOM"
  "message": "Mặt hàng bán theo Mét nhưng chưa khai hệ số quy đổi Mét → Cây.",
  "fix_where": "Danh mục → Mặt hàng → RT_TRUC114_18 → Đơn vị quy đổi khác",
  "intentional": true             // true = danh mục CỐ Ý để trống, chờ chủ xưởng chốt
}
```

`uom_gap: null` khi ĐVT dùng được. `intentional: true` ⇒ đừng vẽ như lỗi hệ thống; đây là ô chờ
chủ xưởng điền.

### A.4 `stock_snapshot` — tồn theo đúng ĐVT tồn VÀ ĐVT bán, kèm cân 🟥 P0

```jsonc
"stock_snapshot": {
  "warehouse": "K36",
  "stock_uom": "Cây",
  "stock_qty": 42,                        // number | null — theo ĐVT TỒN
  "selected_uom": "Mét",
  "selected_qty": null,                   // number | null — theo ĐVT BÁN
  "selected_qty_blocked_reason": "Chưa khai hệ số quy đổi Mét → Cây.",
  "weight_uom": "Kg",
  "weight_qty": 1381.5,                   // number | null — TRỤC TIỀN, song song với stock_qty
  "batch_tracked": true,
  "batch_count": 7,
  "batches": [
    { "batch_no": "LO-0001", "qty": 6, "weight_kg": 197.4, "length_m": 5.85,
      "color": null, "condition": "Thô", "is_offcut": false, "warehouse": "K36" }
  ],
  "source": "Batch Stock Balance",        // "Stock Balance" | "Batch Stock Balance" | null
  "read_error": null
}
```

- **`stock_qty` và `weight_qty` là hai con số song song trên một dòng** — đúng luật nhóm `RT_`:
  tiền theo Kg, tồn theo cây. Đừng cộng, đừng quy đổi lẫn nhau.
- `batches` tối đa **12 lô** (sắp giảm dần theo `length_m`); `batch_count` là số lô THẬT.
- `read_error` khác `null` ⇒ người bán **không có quyền đọc báo cáo kho** (`Batch Stock Balance`
  đòi vai `Stock Manager`/`Stock User`) hoặc báo cáo lỗi. Hiện "chưa đọc được tồn", **không** hiện 0.

### A.5 `shortage` — bán vượt tồn 🟥 P0

Chỉ có mặt khi truyền `qty`.

```jsonc
"shortage": {
  "requested_qty": 120, "requested_uom": "Mét",
  "available_qty": 42,  "available_uom": "Cây",
  "short_by": null,                    // number | null — null khi không cùng trục
  "severity": "unknown",               // "ok" | "over" | "unknown"
  "message": "Không so được: tồn theo Cây, dòng bán theo Mét mà chưa có hệ số quy đổi."
}
```

`severity`: `"ok"` đủ hàng · `"over"` thiếu (`short_by` > 0) · `"unknown"` **không so được** —
vẽ màu cảnh báo, KHÔNG vẽ màu "đủ".

### A.6 `spec_context` — quy cách / bản lá / hình học áp cho đúng mã này 🟨 P1

```jsonc
"spec_context": {
  "measurement_profile": {
    "name": "Ống/trục", "inventory_mode": "Nhôm cây/lá", "stock_uom": "Cây",
    "track_dimension_lot": true, "require_color": false, "require_condition": true,
    "require_length": true, "require_width": false, "require_piece_qty": true,
    "track_bundle_qty": false, "weight_tolerance_pct": 13
  },
  "geometry_profile": { "code": "GP-RAY", "name": "Ray/trục", "fields": ["length_m","qty_bar"] },
  "material_specification": {
    "spec_code": "QC-TRUC114-18", "spec_type": "Ống/trục",
    "standard_length_m": null,          // ← Chiều dài cây chuẩn — CỐ Ý TRỐNG
    "theoretical_kg_per_m": null,       // ← Kg/m lý thuyết — CỐ Ý TRỐNG
    "thickness_mm": 1.8, "width_m": null, "effective_width_m": null,
    "scrap_threshold_m": null, "profile_system": null, "section_code": "114"
  },
  "door_spec": null,                    // bản ghi `Quy cách cửa` khớp mã nhôm, nếu có
  "leaf_divisor_m": null,
  "leaf_divisor_source": null,          // "Item.leaf_divisor_m" | "Quy cách cửa" | null
  "coverage_gaps": [
    { "code": "SPEC_MISSING_STANDARD_LENGTH", "label": "Chiều dài cây chuẩn chưa khai",
      "where": "Danh mục → Quy cách kỹ thuật vật tư → QC-TRUC114-18 → Chiều dài chuẩn (m)" },
    { "code": "GEOMETRY_PROFILE_MISSING", "label": "Mã hàng chưa có bộ quy cách hình học",
      "where": "Danh mục → Mặt hàng → … → Bộ quy cách hình học" }
  ],
  "read_error": null
}
```

Mã `coverage_gaps[].code` ổn định (dùng làm khoá i18n/icon):

`SPEC_NOT_LINKED` · `SPEC_MISSING_STANDARD_LENGTH` · `SPEC_MISSING_KG_PER_M` ·
`GEOMETRY_PROFILE_MISSING` · `MEASUREMENT_PROFILE_MISSING` · `DOOR_SPEC_MISSING` ·
`LEAF_DIVISOR_MISSING`

### A.7 `color_scope` — màu theo PHẠM VI, không phải danh sách phẳng 🟨 P1

Đúng kết quả của `alumdoor.catalog.finish_color_context` với `usage_scope: "sales"`, gộp sẵn vào
một lời gọi.

```jsonc
"color_scope": {
  "item_group": "Ray hộp TD U76",
  "requires_color": false,           // suy từ Measurement Profile.require_color
  "allowed_finishes": [ { "code": "STD", "name": "Sơn tĩnh điện", "requires_color": true } ],
  "allowed_colors": ["KEM", "VAN_GO"],
  "colors_by_finish": { "STD": ["KEM", "VAN_GO"] }
},
"color_scope_error": null
```

- `color_scope: null` + `color_scope_error: "<lý do>"` khi không dựng được → **đừng mở combobox
  màu với danh sách rỗng**, hiện lý do.
- `allowed_finishes` rỗng mà không có lỗi = **fail-closed thật**: nhóm hàng này chưa Bề mặt nào
  khai áp dụng. Chặn, đừng cho chọn bừa.
- Bỏ hẳn khâu này bằng `include_color_scope: false` (lúc đó khoá `color_scope` **vắng mặt**, không
  phải `null`).

### A.8 `price_explain` — vì sao ra con số đó 🟥 P0

```jsonc
"price_explain": {
  "price_list": "BẢNG GIÁ ĐẠI LÝ",
  "item_price": "BẢNG GIÁ ĐẠI LÝ:CUA-AL70:m2",
  "resolution": "exact_uom",     // xem bảng dưới
  "price_uom": "m2",
  "price_rate": 640000,          // đơn giá NHƯ ĐANG LƯU trên Item Price
  "converted_from_uom": null,    // ≠ null ⇒ giá đã nhân chéo hệ số, con số khác giá niêm yết
  "conversion_applied": 1,
  "rate": 640000,                // đơn giá theo ĐVT ĐANG BÁN (= trường `rate` cũ)
  "currency": "VND",
  "area_tier": "MOI-DIEN-TICH",
  "price_variant": "STANDARD",
  "note": "Giá lấy từ Item Price BẢNG GIÁ ĐẠI LÝ:CUA-AL70:m2 (m2), bậc MOI-DIEN-TICH."
}
```

| `resolution` | Nghĩa |
|---|---|
| `exact_uom` | trúng bản ghi tên đủ `<bảng giá>:<mã>:<ĐVT>` |
| `legacy_name` | trúng tên cũ `<bảng giá>:<mã>` và ĐVT của nó khớp dòng |
| `field_lookup` | phải quét theo trường mới thấy |
| `base_uom_fallback` | **không có giá cho ĐVT dòng**; lấy giá ĐVT gốc rồi nhân chéo — `converted_from_uom` cho biết từ đâu |
| `standard_rate` | không truyền `price_list`; lấy `Item.standard_rate` *(trường này không còn trong brief v2 — thực tế gần như luôn ra `manual`)* |
| `manual` | không có bảng giá và không có giá định mức → nhập tay |
| `disabled` | bản ghi giá tồn tại nhưng đã ngừng áp dụng |
| `not_found` | chưa khai giá cho ĐVT này |
| `error` | tra giá lỗi — chi tiết ở `price_error` (trường cũ) |

`base_uom_fallback` là trạng thái **phải hiện rõ**: đó là lúc con số trên màn khác con số người
khai giá đã gõ.

### A.9 `readiness` — sẵn sàng của MÃ HÀNG, biết trước khi hứa với khách 🟥 P0

```jsonc
"readiness": {
  "ready": false,
  "blocking": [
    { "code": "UOM_FACTOR_MISSING", "label": "Chưa khai hệ số quy đổi Mét → Cây",
      "where": "Danh mục → Mặt hàng → RT_TRUC114_18 → Đơn vị quy đổi khác" }
  ],
  "warnings": [
    { "code": "SPEC_MISSING_KG_PER_M", "label": "Kg/m lý thuyết chưa khai",
      "where": "Danh mục → Quy cách kỹ thuật vật tư → QC-TRUC114-18" }
  ]
}
```

- `ready === false` ⇔ `blocking.length > 0` ⇒ **chặn**, hoặc ít nhất bắt xác nhận trước khi lưu.
- `warnings` không chặn nhưng phải hiện.

Mã `blocking[].code` ổn định: `UOM_FACTOR_MISSING` · `UOM_UNDECLARED` · `PRICE_MISSING` ·
`PRICE_ERROR` · `STOCK_SHORT` · `COLOR_SCOPE_EMPTY` · `ITEM_NOT_SELLABLE`.
Mã `warnings[].code`: mọi mã của `coverage_gaps` (A.6) cộng `STOCK_UNREADABLE` ·
`PRICE_CONVERTED_FROM_BASE_UOM` · `COLOR_SCOPE_UNREADABLE` · `STOCK_UNKNOWN_VS_REQUESTED`.

### A.10 Thân lỗi 422 cũng được làm giàu

Hai đường 422 cũ (`Cần chọn mặt hàng bán` / `ĐVT … chưa được khai`) **giữ nguyên `message`,
`allowed_uoms` và mã trạng thái**. Đường ĐVT nay kèm thêm: `item_code` · `uom_ladder` ·
`uom_gap` · `readiness`. Không có lượt đọc `Item Price` hay báo cáo kho nào được thêm vào đường
này — nó vẫn từ chối trước khi tra giá.

---

## B. `metaforge.api.preview_sales_commercial_line`

`POST method/metaforge.api.preview_sales_commercial_line`

### B.1 Trường CŨ — giữ nguyên 100%

Toàn bộ `ResolvedCommercialLine` (`item_price`, `price_variant`, `base_rate`, `selling_rate`,
`priced_qty`, `gross_amount`, `discount_*`, `adjustment_*`, `net_before_tax*`, `pricing_as_of`,
`pricing_rule_snapshots`, `applied_adjustments`) cộng `benefit_items`, `rate`, `amount`,
`net_amount`.

### B.2 `price_explain` — giải trình đơn giá 🟥 P0

```jsonc
"price_explain": {
  "price_list": "BẢNG GIÁ ĐẠI LÝ",
  "item_price": "BẢNG GIÁ ĐẠI LÝ:CUA-AL70:m2",
  "price_variant": "STANDARD",
  "line_uom": "m2",
  "price_uom": "m2",             // ĐVT bản ghi Item Price khai
  "converted_from_uom": null,    // ≠ null ⇒ giá đã nhân chéo hệ số quy đổi
  "price_rate": "640000",        // đơn giá NHƯ ĐANG LƯU
  "base_rate": "640000",         // đơn giá engine chốt trước Pricing Rule
  "selling_rate": "640000",
  "rate_changed_by_rule": false, // base_rate ≠ selling_rate
  "area_tier": "4-5",            // Item Price.area_tier của bản ghi ĐÃ TRÚNG
  "area_tier_basis_sqm": 4.5,    // diện tích MỘT BỘ dùng để tra bậc
  "area_tier_bounds": { "min_area_sqm": 4, "max_area_sqm": 5 },
  "posting_date": "2026-08-21",
  "currency": "VND",
  "note": "Bậc 4-5 tra theo 4,5 m²/bộ; đơn giá 640000 VND/m2 từ BẢNG GIÁ ĐẠI LÝ:CUA-AL70:m2."
}
```

`price_explain` có thể **vắng mặt** nếu không đọc lại được bản ghi `Item Price` (không có quyền,
bản ghi biến mất giữa chừng). Việc đó **không** làm hỏng preview — mọi trường tiền cũ vẫn đúng.

> `area_tier_basis_sqm` là **diện tích MỘT BỘ**, không phải cả dòng. Đây là chỗ đã cắn một lần:
> 2 bộ × 4,5 m² tra nhầm bậc 8-9 thay vì 4-5, hụt 540.000 đ/dòng.

### B.3 `pricing_scope_by_rule` — vì sao luật giá này lọt vào dòng 🟨 P1

```jsonc
"pricing_scope_by_rule": { "PR-RAY-VAN-GO": "RAY TD ÁP DỤNG PHỤ THU SƠN" }
```

Chỉ chứa luật **đã áp** mà có khai `pricing_scope`. Ghép với `pricing_rule_snapshots` /
`applied_adjustments` theo `rule_name`. Vắng khoá = luật đó không đi qua phạm vi nào.

### B.4 `catalog_context` — ngữ cảnh danh mục của dòng 🟨 P1

```jsonc
"catalog_context": {
  "item_group": "Cửa CN Đức",
  "door_type": "Cửa Đức",
  "inventory_mode": "Thành phẩm theo m2",
  "measurement_profile": "Thành phẩm theo m2",
  "material_specification": "QC-AL70",
  "min_area_sqm": 4,
  "min_area_applied": true      // diện tích/bộ đang BẰNG mức tối thiểu ⇒ tiền đang bị kéo lên
}
```

`min_area_applied: true` nghĩa là **diện tích tính tiền đã bị nâng lên mức tối thiểu của mã** —
người bán phải thấy, vì khách sẽ hỏi tại sao cửa nhỏ mà tiền không giảm thêm.
`min_area_applied` là `null` khi không có `min_area_sqm` hoặc không suy được diện tích một bộ.

### B.5 `catalog_warnings` 🟨 P1

```jsonc
"catalog_warnings": [
  { "code": "PRICE_CONVERTED_FROM_BASE_UOM",
    "label": "Đơn giá quy đổi từ ĐVT m2, không phải giá khai cho Mét",
    "where": "Danh mục → Đơn giá theo bảng giá → BẢNG GIÁ ĐẠI LÝ:CUA-AL70:m2" }
]
```

Mã dùng chung với A.9. Mảng rỗng = không có cảnh báo (khác với vắng mặt = chưa đo).

---

## C. Ghi chú thi hành cho làn B

1. **Đừng thay `null` bằng `0`/`1`.** Ba nhóm số ở `uom_ladder.missing_factors`,
   `material_specification.standard_length_m`, `material_specification.theoretical_kg_per_m` đang
   **cố ý trống** chờ chủ xưởng. Hiện đúng chữ "chưa khai" + `fix_where`.
2. **`readiness.blocking` là cổng chặn thật**, không phải trang trí.
3. `alumdoor.catalog.allowed_colors` **vẫn chạy y như cũ**. Nhưng nó là danh sách phẳng — chuyển
   sang `color_scope` trong cùng một lời gọi `item_context` thì bớt được một vòng gọi và có thêm
   `colors_by_finish`.
4. `default_color` luôn `null` trên brief v2. Đừng dựng UI quanh nó.
5. `stock_snapshot.stock_qty` và `stock_snapshot.weight_qty` là **hai trục khác nhau**. Với nhóm
   `RT_`: tiền theo Kg, tồn theo Cây. Hiện song song, đừng gộp.
6. `price_explain.resolution === "base_uom_fallback"` là trạng thái đáng nghi — hiện rõ, đừng nuốt.
