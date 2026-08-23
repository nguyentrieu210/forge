# BOM màn bán: tách lớp CẤU KIỆN khỏi lớp TIÊU HAO KHO

Ngày 23/08/2026. Base `9ec028cc4`.

## 1. Semantic cũ sai ở đâu

Màn bán xổ định mức cửa Đài Loan 3 m × 3 m ra thế này:

| Mã | SL | ĐVT | Khối lượng |
|---|---|---|---|
| TON_DLM_1LY_K124 | 1 | m2 | 8,91 |
| RT_RAY_U70_RON | 2 | Mét | 5,8 |
| PKC_V4_STD | 2 | Cây… thực tế hiện Mét | 5,94 |
| RT_TR114_1.8 | 1 | Mét | 2,95 |

Ba chỗ hỏng, cùng một gốc:

1. **Cột SL đọc `component.set_count`**, mà `set_count` được server gán bằng `result.qty_per_set`
   (`bom-rule-sales-preview.ts`, comment "compatibility projection"). Với dòng tôn, `qty_per_set = 1`
   là hằng của luật diện tích — **con số 1 đó không phải một lá nào cả**.
2. **Cột ĐVT đọc `component.uom`**, mà server ghi đè `uom = result.consumption_uom` → "Mét"/"m2".
   Dòng BOM gốc khai `uom: "Cây"` / `uom: "Lá"` nhưng bị đè mất.
3. **Cột Khối lượng đọc `component.qty` = `consumption_qty`** = tổng tiêu hao. Thợ nhìn "5,8" phải
   tự chia đôi mới ra chiều dài cắt mỗi cây; khi số cây khác 2 thì phép chia nhẩm đó sai.

Điểm mấu chốt: **dữ liệu BOM vốn đã đúng**. `DM-2026-0001` lưu sẵn `uom: "Cây"`, `qty: "2"`,
`qty_basis: "Theo số lá"`, kèm ghi chú do chính chủ xưởng duyệt 22/08:

> "SL = số cấu kiện (2 Cây); chiều dài mỗi cái do Quy tắc BOM tính (PB_CAO - 0,1)."
> "lá ruột — số lá do công thức chia lá tính, không phải số cố định. Diện tích m² là lượng tôn tiêu hao."

Chỉ tầng enrichment làm mất semantic đó. Không phải lỗi dữ liệu, không cần re-import.

## 2. Contract mới

Mỗi cấu kiện nay mang hai lớp tách bạch:

```
LỚP CẤU KIỆN VẬT LÝ (màn bán + xưởng đọc)
  component_count        số cây / lá / cái phải cắt, ĐÃ nhân số bộ
  component_count_uom    "Cây" / "Lá" / "Cái" — lấy từ dòng BOM
  cut_length_each_m      chiều dài (hoặc rộng cắt) MỖI cái
  leaf_count             số lá MỖI BỘ, chỉ có ở dòng chia lá
  component_count_error  lý do chưa xác định được số cấu kiện

LỚP TIÊU HAO KHO (kho + giá thành đọc)
  stock_consumption_qty  tổng mét / m² / kg
  stock_consumption_uom
  stock_qty / stock_uom  sau quy đổi ĐVT tồn
```

`qty`, `uom`, `set_count` vẫn được phát để bảng BOM cũ không vỡ, nhưng **không còn là authority**.

## 3. `component_count` lấy từ đâu

Rẽ theo `qty_basis` của chính dòng BOM, không đoán theo tên mã:

- `qty_basis = "Theo số lá"` → `leaf_count × số bộ`.
- còn lại → `rule.qty_per_set × số bộ` (Quy tắc BOM là authority về "mấy cái mỗi bộ";
  `qty` trên dòng BOM chỉ dùng khi luật chưa khai).

`component_count_uom` lấy từ `component.uom` của dòng BOM — **không** lấy `result_uom` của luật.

## 4. `cut_length_each_m` lấy từ đâu

- Luật `result_kind = LENGTH` → `result_per_piece` (đã là chiều dài một cây, chưa nhân số cây).
- Luật `result_kind = AREA` dạng tích hai vế có một vế là chiều cao → **vế còn lại**.
  Với tôn: `Cao PB × (Rộng ray − 0,03)` → rộng cắt mỗi lá = `Rộng ray − 0,03` = 2,97 m.
  Đúng vật lý: mỗi nan lá chạy hết bề rộng cửa.

## 5. Số lá lấy từ đâu

`leaf_count` do `calculateLeafPlan` (`sales-production-core.ts`) tính, đầu vào là **Cutting Policy**:
`leaf_divisor_const`, `leaf_height_deduction_m`, `leaf_rounding`, `leaf_round_threshold`.
Nó đi từ client lên qua `cleanLine` (field `leaf_count` có khai trên `Sales Order Item`) rồi vào
`geometryValues(args)`.

Cửa Đài Loan: divisor `0,077`, trừ cao `0`, làm tròn `Ngưỡng trừ-một-lá` → cửa cao 3 m ra **38 lá**.

**Fail-closed**: thiếu `leaf_count` thì `component_count = null` kèm `component_count_error`, màn bán
hiện `?` đỏ. Không có đường lui về 1 — một dòng lá ghi "1" là nói dối thợ.

## 6. `SL` trong công thức nguồn nghĩa là gì — đính chính

`C*(R-0,03)*SL*6,32kg/m2`. Audit dữ liệu nguồn cho thấy **`SL` = SỐ LƯỢNG BỘ CỬA, không phải số lá**:

- Cùng khối BOM `CUC_UC_KT_4D`, dòng ĐM liền kề viết đủ chữ:
  `"ray = (chiều cao - 10cm) x số lượng bộ cửa x 2 x1.78"` — *số bộ cửa* và *x 2* là **hai thừa số
  tách biệt**, nên thừa số này không phải số cây/số lá của cấu kiện.
- Cùng cấu kiện xốp, hai cách viết song song: `"...*2 x SL"` (ĐM 695) và `"...*2x số lượng"` (ĐM 720).
- Chỗ nào chủ xưởng muốn nói lá thì viết thẳng `LÁ`: `"1 LÁ x (Rpbray -30)"`, `"(CAO LÁ/75)-1 LÁ YẾM"`.

⇒ Việc engine ánh xạ `C → PB_CAO` (cao cả cửa) là **đúng**, và `8,91 m²` cho một bộ là **đúng**.
Số lá là đại lượng suy ra độc lập từ công thức chia lá, không nằm trong công thức diện tích này.

Nguồn cũng **không có** công thức dạng `số_lá × rộng_cắt_lá` cho tôn — nên `component_count × cut_length_each_m`
là cách trình bày phục vụ xưởng, còn số liệu ghi sổ vẫn là diện tích.

## 7. Tồn đọng — KHÔNG sửa trong đợt này

- **`TON_DLM_1LY_K124` vs `LA_DLK_1LY`**: cả hai đều `Bán thành phẩm`, nhóm `Nan/lá cửa`, tên gần
  như nhau ("TP LÁ ĐÀI LOAN 1LY" / "LÁ ĐÀI LOAN 1LY"), và **cả hai đang được dùng làm cấu kiện**
  (`LA_DLK_1LY` ở 5 BOM, `TON_DLM_1LY_K124` ở 3 BOM). Chưa đủ bằng chứng để chọn mã canonical.
  Cần chủ xưởng chốt trước khi gộp.
- **V4 mấy cây**: nguồn mâu thuẫn — `BOM-RULE-de-xuat.json` có cả hệ số `2.0` (`"(rpbray-30)x2xTL"`)
  lẫn `1` (`"Rộng pbray -50"`) cho cùng họ mã V4. Fixture đang chạy dùng 2; tài liệu quy cách không
  ghi số cây.
- **Ray U70 có ron**: tài liệu quy cách không ghi số cây (chỉ Ray hộp TD và U70 không ron có "2 cây").
- **Rộng cắt lá có nhiều nhánh chưa cài**: Đức `−0,08` / PB nhựa `−0,02`, bắn bướm `−0,035`,
  theo loại ray `−0,05` / `−0,08`. Hiện chỉ dùng nhánh mặc định.
- **Cửa Đức thiếu `leaf_divisor_const`** trong Cutting Policy (bản lá là thuộc tính của mã nhôm,
  23 giá trị, chưa có chỗ lưu) → dòng lá cửa Đức sẽ rơi vào nhánh fail-closed.

## 8. Self-reference

Đã quét toàn bộ BOM trong D1: **không có** dòng nào `parent_item === component_item`.
Vẫn thêm guard trong `enrichSalesBomPreviewWithRules` — loại dòng trùng mã cha và trả
`bom_self_reference_warning`, vì một BOM tự tham chiếu sẽ nổ định mức vô hạn mà nhìn không ra.

## 9. Local D1

**Không cần re-import BOM / BOM Rule.** Thay đổi thuần ở tầng code; dữ liệu `uom`/`qty`/`qty_basis`
đã đúng từ đợt sửa 22/08.
