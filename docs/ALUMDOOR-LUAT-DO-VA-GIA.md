# ALUMDOOR — LUẬT ĐO VÀ TÍNH TIỀN THEO NHÓM KHÁCH

> Chốt với chủ xưởng ngày **2026-07-29**.
> Nguồn: `C:\Users\Admin\Downloads\25.7 QUY TRÌNH.docx` + xác nhận trực tiếp.
> Khi tài liệu cũ nói khác, **file này là nguồn đúng**.

## 1. Hai nhóm khách, không phải bốn

Danh mục khách trước đây có bốn nhóm (Lẻ · Đại lý · Công trình · Nhà thầu). Chủ xưởng chốt:
**Công trình và Nhà thầu tính như KHÁCH LẺ.** Chỉ còn hai nhóm có ý nghĩa nghiệp vụ.

| | Đại lý | Lẻ *(gồm công trình, nhà thầu)* |
|---|---|---|
| Rộng đo theo | **PB nhựa** | **PB ray** |
| Trừ khi cắt lá (cửa Đức) | **0,02 m** | **0,08 m** |

## 2. PB ray = PB nhựa + 0,06 — suy ra, chưa được nói thẳng

Không tài liệu nào ghi khoảng cách giữa hai cách đo. Nó suy ra từ chính hai công thức cắt,
dựa trên một điều không thể khác: **cùng một bộ cửa thì miếng nhôm cắt ra phải y hệt nhau**,
dù người mua là đại lý hay khách lẻ — thợ không cắt khác đi vì khách là ai.

```
PB nhựa − 0,02 = PB ray − 0,08
⇒ PB ray = PB nhựa + 0,06
```

Kiểm bằng ví dụ của chính BRD, cửa cao 3 m · PB nhựa 4,00 m:

| | Rộng khai | Diện tích tính tiền | Rộng cắt lá |
|---|---|---|---|
| Đại lý | 4,00 (nhựa) | 12,00 m² | 3,98 |
| Lẻ | 4,06 (ray) | 12,18 m² | 3,98 |

Cắt trùng khớp; tiền chênh 1,5%.

**Đây là suy luận, không phải lời khách.** Nếu sau này đo thực tế ra khoảng cách khác 6 cm thì
một trong hai hằng số trừ đang sai, và phải sửa ở đây trước khi sửa bất kỳ chỗ nào khác.

## 3. Vì sao con số 0,98 không được dùng

Xưởng có lúc báo hệ số **0,98** cho khách lẻ. Nó KHÔNG phải luật, và đây là lý do:

```
PB ray × 0,98 = PB ray − 0,08  ⇔  PB ray = 4,00 m
```

Hai cách tính **trùng nhau đúng tại 4,00 m** — đúng cỡ cửa phổ biến nhất, nên dùng lẫn nhau
nhiều năm không ai thấy sai. Nhưng chúng rẽ ra ở hai đầu:

| PB ray | × 0,98 | − 0,08 | Lệch |
|---:|---:|---:|---:|
| 2,00 | 1,96 | 1,92 | 4 cm |
| 4,00 | 3,92 | 3,92 | 0 |
| 6,00 | 5,88 | 5,92 | 4 cm |

Khe hở giữa lá và ray là khoảng cách cơ khí **cố định** do profile ray quyết định — nó không nở
ra theo bề rộng cửa. Nhân hệ số nghĩa là cửa 6 m có khe 12 cm còn cửa 2 m có khe 4 cm, dùng
cùng một loại ray. Nên **trừ cố định 0,08** là luật; 0,98 là mẹo tính nhẩm đúng quanh 4 m.

Chủ xưởng đã xác nhận **0,08**.

## 4. Các hằng số trừ khác trong BRD — khác sản phẩm, khác điều kiện

Không được lẫn với hai số trên: chúng thuộc sản phẩm khác và phụ thuộc **loại ray**, không
phụ thuộc loại khách.

| Sản phẩm | Điều kiện | Đo theo | Trừ |
|---|---|---|---|
| Cửa Đức | khách đại lý | PB nhựa | 0,02 |
| Cửa Đức | khách lẻ | PB ray | 0,08 |
| Cửa Úc | — | PB ray | 0,03 |
| Đức kéo tay | ray sắt U70 | PB ray | 0,05 |
| Đức kéo tay | ray hộp/đơn U76 | PB ray | 0,08 |

Con số 0,08 xuất hiện ở **hai dòng khác nhau vì hai lý do khác nhau** — đây chính là chỗ đã gây
nhầm giữa 0,06 và 0,08 khi đọc BRD.

## 5. Hệ quả cho hệ thống

Nhóm khách chảy vào **hai tầng**, và trước nay chỉ có tầng một:

**Tầng đơn giá** — đã có đủ cơ chế (Chính sách giá theo khách / nhóm / mặt hàng / dải số lượng
/ thời gian, ra giá cố định hoặc % giảm, có độ ưu tiên). Chỉ chưa khai bản ghi nào.

**Tầng cách tính lượng** — chưa có chỗ nào chứa. "Đo theo PB ray hay PB nhựa" đổi **diện tích
tính tiền**, tức đổi *lượng* chứ không đổi *đơn giá*; và cùng luật đó còn quyết định **rộng cắt
lá**, tức chảy sang cả lệnh sản xuất nơi Chính sách giá không với tới.

Ba chỗ phải sửa cùng một lượt, nếu không sẽ mâu thuẫn nhau:

1. **Dòng bán** lưu `rộng` kèm **cơ sở đo**, không chỉ một con số trần.
2. **Máy chủ** hiện tự tính lại `diện tích = rộng × cao × số bộ` rồi **từ chối nếu lệch**. Phép
   kiểm đó chưa biết gì về cơ sở đo; thêm luật mà không sửa nó thì hoặc mọi đơn đại lý bị chặn,
   hoặc phải tắt kiểm — mà tắt kiểm là mở đường cho gọi API ghi thẳng diện tích sai.
3. **Bậc giá theo m²** phải tính trên **diện tích tính tiền**, không phải diện tích vật lý. Cửa
   sát mép bậc sẽ rơi vào hai bậc khác nhau giữa lẻ và đại lý — đúng, nhưng phải cố ý.

## 6. Còn treo

- **439 khách chưa phân loại đáng tin.** Hiện 321 mang giá trị mặc định "Đại lý", 114 để "Khác",
  chỉ 4 là "Khách lẻ". Phân loại này giờ quyết định **cả tiền lẫn kích thước cắt**, nên không
  dùng lại số đang có được.
- **Hai bảng phân loại chưa hợp nhất:** hồ sơ khách dùng `customer_type` (Đại lý · Khách lẻ ·
  Khác), đơn hàng dùng `customer_group` (Lẻ · Đại lý · Công trình · Nhà thầu). Định giá đọc cái
  ghi **trên đơn**, không đọc hồ sơ khách — nên sale chọn nhầm là sai cả tiền lẫn cắt, không ai
  chặn.
