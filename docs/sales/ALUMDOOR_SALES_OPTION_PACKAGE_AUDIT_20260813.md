# Audit Sales Option / Sales Package Alumdoor — 13/08/2026

## Phạm vi

Đối chiếu chuỗi `Item → Item Price → Sales Option → Sales Package` cho các nhóm cửa đang bán:

- Cửa CN Đức;
- Cửa tấm liền Úc;
- Cửa Đài Loan và Cửa Đài Loan Inox;
- Cửa Lưới;
- Cửa siêu trường;
- các phụ kiện/ray/trục/motor bán độc lập.

Nguồn quyết định là danh mục và bảng giá 31/07/2026 trong `docs/source-data`, cộng với business-case matrix trong `docs/sales`. Không suy giá mới và không sao chép BOM vào Sales Package.

## Kết quả audit trước migration 0125–0126

1. Chỉ có 15 Package cửa Đức tặng ray; các Option theo từng Item đã từng bị khóa trong khi Option nhóm chung không có Package lại được bật.
2. Các Option Úc, Đài Loan và Lưới là prototype phạm vi nhóm, không gắn Package và đang bị khóa.
3. Danh mục hiện tại vẫn dùng SKU riêng cho `TRỌN BỘ` và `TÁCH MÓN`; Item Price của các SKU này đều dùng biến thể `STANDARD`.
4. Cửa Úc có tám SKU thành phẩm. Bảng giá ghi giá cửa hoàn thiện đã gồm phụ kiện; phụ kiện bán rời đã có Item Price riêng.
5. Cửa siêu trường đang là lá/cửa và phụ kiện tách riêng, chưa có SKU trọn bộ được chứng minh bởi nguồn.
6. `HH-CUAKEODL` thuộc nhóm Cửa kéo Đài Loan nhưng nguồn không có giá bán và không đánh dấu trọn bộ/tách món.
7. Hai SKU `CỬA ĐỨC KÉO TAY AL70` nằm trong nhóm Cửa tấm liền Úc có Item Price hợp lệ nhưng không phải SKU trọn bộ.

## Quy tắc được áp dụng

| Trường hợp | Sales Option | Sales Package |
| --- | --- | --- |
| Cửa Đức chỉ lá | `DUC-CHI-LA` hiện có | Không Package |
| Cửa Đức tặng ray đủ điều kiện | `DUC-TANG-RAY` dùng chung cấp nhóm | `PKG-DUC-TANG-RAY` dùng chung; cửa lấy động từ dòng đơn hàng + ray tặng |
| Cửa Úc thành phẩm có tên `CỬA ÚC` | `Trọn bộ` theo từng Item | `PKG-UC-FULL` dùng chung, lấy động đúng SKU đã chọn |
| Đài Loan có tên `TRỌN BỘ` | `Trọn bộ` theo từng Item | `PKG-DL-FULL` dùng chung, lấy động đúng SKU đã chọn |
| Lưới có tên `TRỌN BỘ` | `Trọn bộ` theo từng Item | `PKG-LUOI-FULL` dùng chung, lấy động đúng SKU đã chọn |
| Đài Loan/Lưới có tên `TÁCH MÓN` hoặc lá rời | `Tách món` theo từng Item | Không Package |
| Đài Loan Inox/Siêu trường | `Tách món` theo từng Item | Không Package |
| Đức kéo tay AL70 trong nhóm Úc | `Kéo tay` theo từng Item | Không Package |
| `HH-CUAKEODL` | Không cho chọn bán đến khi có giá và cách bán được duyệt | Không Package |
| Ray, trục, motor, khóa và phụ kiện bán riêng | Giá `STANDARD` của chính Item | Không Package |

Package của SKU trọn bộ chỉ chứa chính SKU được chọn qua `$SOURCE_ITEM`. Đây là chủ ý: Package mô tả nghĩa vụ giao thương hiện hành, còn vật tư tiêu hao/cấu kiện sản xuất thuộc BOM. Khi có bảng BOM đã chuẩn hóa theo từng SKU, BOM được bổ sung độc lập và không chép vào Package.

## Bất biến sau migration 0126

- 8 Option Úc trọn bộ dùng `PKG-UC-FULL`; 56 Option Đài Loan trọn bộ dùng `PKG-DL-FULL`; 6 Option cửa lưới trọn bộ dùng `PKG-LUOI-FULL`.
- Ba Package trọn bộ dùng `$SOURCE_ITEM`, nên snapshot vẫn ghi đúng mã hàng của dòng đơn dù cấu hình Package được dùng chung.
- Mỗi Option `Tách món` không có `sales_package`.
- Không Option nào chọn biến thể giá chưa tồn tại; dữ liệu hiện tại dùng `STANDARD` cho SKU trọn bộ/tách món lịch sử.
- Sáu Option prototype phạm vi nhóm của Úc/Đài Loan/Lưới đã được loại khỏi master data; không còn lựa chọn mơ hồ chồng lên SKU lịch sử.
- Các Package `PKG-FULL:<item_code>` trùng lặp đã được loại bỏ.
- Cửa Đức chỉ còn hai Option cấp nhóm: `DUC-CHI-LA` và `DUC-TANG-RAY`; 15 Option và Package tặng ray theo từng mã được loại bỏ.
- `DUC-TANG-RAY` chỉ hiện khi diện tích tính giá đạt 8 m² và Item đang chọn có Item Price `WITH_RAIL` trong bảng giá hiện hành.
- Package chung dùng `$SOURCE_ITEM` để đóng băng đúng mã cửa của dòng đơn hàng, đồng thời thêm `PK_TANGRAY` theo hai lần chiều cao.
- Hai SKU Đức kéo tay AL70 có Option `Kéo tay`, dùng giá `STANDARD` và không bung Package.
- `HH-CUAKEODL` được giữ trong dữ liệu kho nhưng đặt `is_sales_item = false` cùng trạng thái `PRICE_AND_MODE_REQUIRED` cho đến khi nguồn nghiệp vụ bổ sung đủ giá/cách bán.
- Sau khi áp local: không còn Package cũ theo từng mã và không có Sales Option đang bật tham chiếu Package thiếu/khóa.
- Phụ kiện bán riêng luôn ghi thành dòng Sales Order độc lập và lấy Item Price của chính phụ kiện.

## Bổ sung migration 0127 — Cách bán đổi đúng mã hàng

Nguồn đối chiếu xác nhận các mã `TRỌN BỘ`/`TÁCH MÓN` và các bậc diện tích là biến thể thương mại của cùng một sản phẩm, không phải lựa chọn bị khóa theo SKU. Vì dữ liệu lịch sử vẫn lưu giá trên các SKU riêng, migration 0127 bổ sung cầu nối an toàn thay vì tạo nhãn giả:

- Úc: 4 cặp `Kéo tay ↔ Motor ngoài` theo cùng độ dày.
- Cửa lưới: 6 cặp `Trọn bộ ↔ Tách món` theo cùng kiểu lưới/vật liệu.
- Đài Loan: 56 SKU trọn bộ có thể đổi về 7 SKU tách món; từ SKU tách món, diện tích tính giá chọn đúng một trong 8 bậc SKU trọn bộ.
- Cửa Đức: `Chỉ lá` và `Tặng ray từ 8 m²` vẫn giữ cùng Item; lựa chọn tặng ray hiện trong ô chọn nhưng máy chủ tiếp tục chặn nếu diện tích hoặc biến thể giá chưa hợp lệ.
- Khi người dùng đổi cách bán, giao diện đổi `item_code`, tải lại Item Price, Sales Option và Sales Package. Dòng Sales Order lưu mã hàng cuối cùng, không lưu một nhãn cách bán không khớp giá.

Hai trường điều hướng `target_item_code` và `target_item_rules` chỉ phục vụ thao tác chọn nhanh. Máy chủ vẫn xác thực tổ hợp cuối `Item + Sales Option + Item Price + Sales Package` trước khi lưu.

## Chốt lại cơ chế `Tách món` — triển khai migration 0130

Quyết định nghiệp vụ mới thay thế đề xuất `Sales Line Template` trước đó:

- `Sales Package` là nguồn cấu hình duy nhất cho danh sách món thuộc một bộ và công thức số lượng; không tạo thêm master trung gian;
- dòng chính luôn giữ mã hàng chuẩn/trọn bộ, không đổi `item_code` sang SKU tách món;
- khi Sales Option có `sales_mode = Tách món`, Package phải dùng `selection_mode = SELECTABLE` và giao diện xổ các component ngay dưới dòng chi tiết;
- món được tích vẫn đi qua Item Price/Pricing Rule của chính mã món để lấy giá, chiết khấu và phụ thu hiện hành;
- món được tích là **child thương mại** của dòng bộ qua `sales_package_group_key`, `sales_package_parent_key` và `sales_package_component_key`, không phải một dòng rời không có nguồn gốc;
- Package không lưu đơn giá. Snapshot chỉ đóng băng thành phần, ĐVT, công thức số lượng, chính sách chọn và phiên bản cấu hình.
- Từng component tự khai có kế thừa màu, kích thước và số bộ từ dòng cha hay không; client chỉ đồng bộ các trường đã bật và server đối chiếu lại trước khi lưu.

### Công thức tiền

Máy chủ tính và kiểm lại theo thứ tự:

```text
Giá gộp dòng cha = giá chuẩn trọn bộ × SL tính giá của dòng cha
Giá gộp child = giá hiện hành của Item child × SL theo quy cách Package
Giá còn lại dòng cha = Giá gộp dòng cha − tổng Giá gộp child có deduct_from_parent
Tổng cụm = Giá còn lại dòng cha sau chính sách + tổng child sau chính sách riêng
```

`deduct_from_discount_basis` khai trên từng component để xử lý đúng chính sách như Cửa Đức: món nào thuộc cơ sở chiết khấu của bộ thì khi tách phải trừ khỏi cơ sở đó; món không thuộc cơ sở giữ nguyên cơ sở chiết khấu. Client chỉ preview, server là nguồn quyết định.

### Dữ liệu được materialize an toàn

Migration 0130 tạo Package `SELECTABLE` cho các cầu nối full-set → split SKU đã có bằng chứng trong Sales Option 0127. Mỗi Package ban đầu chứa đúng component đã được chứng minh bởi `target_item_code`; không suy thêm ray/trục/motor/khóa theo tên.

Các SKU tách trực tiếp chưa có mã bộ cha đã chứng minh vẫn bán như dòng trực tiếp hiện hành và chưa xổ component. Khi bổ sung đủ ma trận món, chỉ cần thêm component vào Sales Package; không sửa TypeScript.

### Giao diện và lưu chứng từ

- Dòng `Món tách` nằm ngay dưới dòng `Chi tiết`, cùng màu với bản ghi cha.
- Tích món sẽ xem ngay ĐVT, số lượng theo Package, đơn giá, chiết khấu, phụ thu và thành tiền.
- Mở lại đơn sẽ gom child về đúng dòng cha theo khóa nhóm.
- Đổi mặt hàng hoặc đổi từ Tách món sang cách bán khác khi đang có child phải xác nhận trước khi bỏ lựa chọn.
- Tổng cuối màn cộng phần còn lại của cha và tất cả child, cùng logic với máy chủ.

### Điều kiện nghiệm thu

- chọn Tách món không đổi mã dòng cha;
- chỉ xổ component thuộc Sales Package của đúng dòng cha;
- tích món nào thì món đó được tính giá/chính sách hiện hành và lưu làm child;
- giá cha không âm và không tính trùng doanh thu với child;
- component không thuộc Package, sai Item/UOM/số lượng hoặc sai chính sách bán bị máy chủ từ chối;
- không suy component từ BOM hoặc từ tên danh mục;
- lưu rồi mở lại vẫn giữ đúng cụm cha–child và snapshot Package.

## Audit lại sau migration 0130 và sửa picker — migration 0131

Đối chiếu trực tiếp database local sau khi materialize Package:

- 62 Item trọn bộ có đúng 62 Sales Option `Tách món` và 62 Package `SELECTABLE`;
- 62 Package dùng 13 Item child đã được chứng minh từ dữ liệu nguồn;
- không có Package thiếu Item child, thiếu Item Price, sai Item cha hoặc trùng Option `Tách món` trên cùng Item cha;
- mọi Item cha đều có cách bán trọn bộ tương ứng và có Item Price đang hoạt động;
- 27 Option `Tách món` không có Package là các SKU bán rời/component (6 Lưới, 7 Đài Loan, 10 Siêu trường, 4 Đài Loan Inox), không phải dòng bộ cha để xổ tiếp.

Lỗi giao diện là picker `Mặt hàng` vẫn gợi ý 13 Item component làm dòng chính. Ví dụ
`NVL-TON-DL5.2Dx124-XNVK — TP LÁ ĐÀI LOAN 6D` là child của các mã cửa Đài Loan 6D trọn bộ;
chọn trực tiếp mã này rồi chọn `Tách món` không thể xổ thêm món con.

Migration 0131 bổ sung cờ nội bộ `Item.is_sales_package_component`, đánh dấu đúng 13 Item đang
được tham chiếu bởi Package `SELECTABLE`. Màn Sales Order lọc cờ này bằng `0`, nên:

- picker chỉ gợi ý Item chính/trọn bộ làm dòng cha;
- Item component vẫn hoạt động và vẫn lấy Item Price/Pricing Rule của chính nó khi sinh làm child;
- nếu một chứng từ cũ hoặc dữ liệu stale đưa component vào dòng cha, màn hình báo rõ phải chọn mã cửa
  trọn bộ thay vì im lặng hiển thị cách bán không có gì để xổ;
- việc phân loại dựa trên quan hệ Package, không dựa vào chuỗi tên hoặc hard-code mã hàng.
