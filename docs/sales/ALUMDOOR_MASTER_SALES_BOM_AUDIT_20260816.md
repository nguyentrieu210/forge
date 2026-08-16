# Alumdoor — Audit Master → Sales → BOM → Production

**Ngày audit:** 2026-08-16  
**Trạng thái hiện hành:** Alumdoor **không còn dùng `Sales Option` / `Sales Package`**.  
**Mốc xóa:** commit `46cff2132f4d3af27f44d3196bbfbca2e2c1335b`, merge bằng `356c847c6a2adbee019ab5348203a0654a64988b`, dọn nốt client bằng `dd06bbc4277acc09f0e04f0d5eeb18023920c9ab`.

> Tài liệu này sửa lại audit trước đó đã đọc nhầm tài liệu/index lịch sử và lôi `Sales Package` quay lại mô hình Alumdoor. Với Alumdoor hiện tại, mọi kết luận forward phải bắt đầu từ code/brief sau chuỗi commit xóa nêu trên.

---

## 0. Kết luận hiện hành

Alumdoor hiện bán **thẳng theo Item + Item Price**, với `price_variant = STANDARD` trong luồng đã được đóng ngày 14/08/2026.

Không được đưa lại các lớp sau vào thiết kế Alumdoor:

- `Sales Option` / “Cách bán”;
- `Sales Package` / “Gói bán hàng”;
- package resolver / package split-pricing;
- package component snapshot như một authority của Alumdoor;
- mapping cấu hình sản phẩm quay ngược về `Sales Option` legacy.

Các file migration/doc cũ còn chữ `Sales Option` / `Sales Package` chỉ là **lịch sử đã từng triển khai**, không phải current authority của Alumdoor.

Target flow cần tiếp tục audit là:

```text
Master sản phẩm / Item
        ↓
Input cấu hình + kích thước của dòng bán
        ↓
Geometry / Cutting Policy
        ↓
Geometry snapshot
        ↓
Item Price STANDARD + Pricing Rule
        ↓
Commercial snapshot
        ↓
Sales Order line
        ↓
BOM resolution
        ↓
Production / Material Requirement
        ↓
Stock reservation / allocation
        ↓
Cut Order / Paint / Assembly
```

---

# 1. Current Sales authority của Alumdoor

## 1.1 Item

`Item` là identity chính của dòng bán hiện tại.

Nó giữ các fact ổn định như:

- `item_code`, `item_group`;
- `door_type`;
- Measurement Profile / UOM;
- màu và các giới hạn danh mục;
- `cutting_policy` / các metadata sản phẩm liên quan;
- cờ mua/bán/tồn kho;
- các thông số ổn định dùng cho sản xuất hoặc dự toán.

Không được dùng `Sales Option` hay `Sales Package` để bù cho fact thiếu trên Item/cấu hình dòng bán.

## 1.2 Item Price

Sau đợt xóa 14/08, Alumdoor định giá thẳng theo `Item Price`; biến thể giá hiện hành được ép về `STANDARD` trong luồng Alumdoor đã đóng.

Nếu về sau cần nhiều điều kiện thương mại, phải giải quyết bằng authority giá hiện hành (`Item Price` / `Pricing Rule` / fact đầu vào rõ nghĩa), không tái tạo “Cách bán” như một master trung gian.

## 1.3 Pricing Rule

`Pricing Rule` tiếp tục là nơi phù hợp cho discount/surcharge/override có điều kiện.

Nó không được quyết định BOM hoặc hình học cắt.

---

# 2. Geometry audit — việc cần làm tiếp

`door-formulas.ts` hiện vẫn mang dấu vết thiết kế cũ khi `customer_group` tham gia chọn `dealer_width_basis` / `retail_width_basis` và số trừ tương ứng trước khi tính `cut_width`.

Nguồn xưởng cho thấy cần phân biệt rõ:

1. **measurement basis / geometry input** — người dùng đang nhập rộng theo PB ray, PB nhựa hay basis vật lý nào;
2. **geometry result** — rộng cắt, số lá, chiều cao tính chia lá, quy cách sản xuất;
3. **billing measure** — số lượng/m² dùng để tính tiền;
4. **customer/pricing context** — đại lý/lẻ, bảng giá, discount, surcharge.

**Quy tắc target:** customer/pricing context không được âm thầm đổi geometry vật lý. Nếu hai nhóm khách nhập hai basis khác nhau thì basis đó phải là fact rõ ràng của dòng/configuration, không suy ngược chỉ từ `customer_group`.

---

# 3. BOM hiện tại

`build-alumdoor-bom-import.mjs` dựng BOM từ sheet `ĐM`, nhưng chính script đã phân loại `qty_basis` thành:

- `chac_chan`;
- `suy_luan`;
- `chua_ro`.

BOM import được để **NHÁP** vì còn nhiều dòng suy luận/chưa rõ. Đây là quyết định đúng và phải giữ.

Vì vậy:

- không dùng BOM draft để tự động trừ kho sản xuất;
- không “xổ BOM” lên Sales rồi coi đó là cấu phần thương mại;
- không đoán `qty_basis` mới từ tên vật tư nếu nguồn không đủ;
- chỉ activate/submit BOM sau khi line basis đã được xác nhận hoặc thay bằng rule có provenance rõ.

---

# 4. Master audit hiện hành

| Master / authority | Quyết định | Vai trò |
|---|---|---|
| **Item** | GIỮ | Identity chính của hàng/vật tư/thành phẩm và dòng bán hiện tại |
| **Item Group** | GIỮ | Phân loại/filter/report; không làm authority công thức nếu có fact rõ hơn |
| **UOM** | GIỮ | ĐVT canonical |
| **Measurement Profile** | GIỮ | Quy cách đo/tồn kho ổn định |
| **Item Color** | GIỮ | Màu/finish master + applicability |
| **Cutting Policy** | GIỮ NHƯNG TÁCH BOUNDARY | Geometry phải tách khỏi customer/pricing semantics |
| **Item Price** | GIỮ | Base price; Alumdoor hiện dùng STANDARD |
| **Pricing Rule** | GIỮ | Commercial adjustment authority |
| **Sales Option** | **ĐÃ XÓA KHỎI ALUMDOOR** | Không đưa lại |
| **Sales Package** | **ĐÃ XÓA KHỎI ALUMDOOR** | Không đưa lại |
| **Bill of Materials** | GIỮ | Manufacturing consumption authority |
| **BOM import 15/08** | GIỮ LÀ DRAFT/EVIDENCE | Chưa authoritative khi còn `suy_luan/chua_ro` |
| **Production Request / Work Order** | GIỮ | Nhu cầu và thực thi sản xuất |
| **Stock Reservation** | GIỮ | Giữ chỗ sau khi material requirement rõ |
| **Aluminium Batch / Stock Ledger** | GIỮ | Tồn thực theo lô/cây/lá |
| **Cut Order** | GIỮ | Allocation/cắt trên stock thực tế |
| **Geometry Snapshot** | CẦN CỦNG CỐ | Đóng băng input + rule/version + kết quả geometry |
| **BOM Resolution Snapshot** | CẦN CỦNG CỐ | Đóng băng BOM/revision dùng cho đúng dòng sản xuất |

---

# 5. Những dấu vết cũ không được hiểu là current design

Repo vẫn có thể còn:

- migration `0119`, `0125`, `0126`, `0130`, `0131`;
- audit 13/08;
- docs shared architecture 11/08;
- dead client branches cho split/package;
- generic platform metadata/control có chữ Sales Option/Package cho tenant khác.

Chúng **không chứng minh Alumdoor hiện còn dùng Sales Package**.

Current Alumdoor truth phải ưu tiên:

1. commit xóa `46cff213...`;
2. merge `356c847...`;
3. client cleanup `dd06bbc...`;
4. current `server/briefs/alumdoor-v2.json` + exact current code/tests;
5. raw workshop source khi audit nghiệp vụ.

---

# 6. Việc làm tiếp

Thứ tự đúng để tiếp tục:

1. audit `Item` + `Measurement Profile` + `Cutting Policy` theo từng dòng cửa;
2. sửa boundary geometry để không phụ thuộc ngầm vào customer group;
3. xác định input/configuration facts thực sự cần trên Quotation/Sales Order line;
4. chuẩn hóa BOM draft theo từng family, giải quyết dần `suy_luan/chua_ro`;
5. nối Sales line → BOM revision → Production Request/Work Order;
6. sau cùng mới tối ưu form/UI.

**Không có bước nào dựng lại Sales Package cho Alumdoor.**
