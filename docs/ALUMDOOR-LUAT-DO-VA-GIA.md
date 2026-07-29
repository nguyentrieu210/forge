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

## 4. Bảng công thức đầy đủ — nguồn chốt ngày 2026-07-29

Ảnh bảng công thức chủ xưởng gửi ngày 2026-07-29 thay phần hằng số còn treo trong BRD cũ.
Mỗi loại cửa có một chính sách duy nhất, sinh ra ba kết quả từ cùng số đo.

| Loại cửa | Rộng cắt lá | Mua vào | Đại lý bán | Khách lẻ bán |
|---|---|---|---|---|
| Cửa Đức | Đại lý: PB nhựa − 0,02; Lẻ: PB ray − 0,08 | Kg thực tế × đơn giá | Cao PB × PB nhựa | Cao PB × PB ray |
| Cửa Úc | PB ray − 0,03 | Barem kg/m² × Cao PB × Rộng cắt × đơn giá | Cao PB × PB ray | Cao PB × PB ray |
| Cửa Lưới | PB ray − 0,03; có bản bướm − 0,035 | Barem kg/m² × Cao lưới × Rộng cắt × đơn giá | Tách món: Cao PB × Rộng cắt; trọn bộ: Cao PB × PB ray | Cao PB × PB ray |
| Cửa Đài Loan | PB ray − 0,03; có bản bướm − 0,035 | Barem kg/m² × Cao lưới × Rộng cắt × đơn giá | Tách món: Cao PB × Rộng cắt; trọn bộ/kéo tay: Cao PB × PB ray | Cao PB × PB ray |
| Cửa Siêu Trường | PB ray − 0,03; có bản bướm − 0,035 | Barem kg/m² × Cao lưới × Rộng cắt × đơn giá | Cao PB × Rộng cắt | Cao PB × PB ray |

Các công thức trong bảng là công thức **một bộ**. Tổng chứng từ nhân thêm `Số bộ`. Nếu một
dòng đang ghi bề rộng tổng của nhiều cánh thì `Số bộ` phải là 1; không được vừa cộng bề rộng
vừa nhân số bộ lần nữa.

## 5. Hệ quả cho hệ thống

Nhóm khách chảy vào **hai tầng**, và trước nay chỉ có tầng một:

**Tầng đơn giá** — đã có đủ cơ chế (Chính sách giá theo khách / nhóm / mặt hàng / dải số lượng
/ thời gian, ra giá cố định hoặc % giảm, có độ ưu tiên). Chỉ chưa khai bản ghi nào.

**Tầng cách tính lượng** — nằm trong `Cutting Policy` (giao diện: **Công thức cửa**). Một bản
ghi chứa cả nhánh đại lý/lẻ, tách món/trọn bộ, bản bướm, mua barem và rộng cắt để ba luồng
không thể dùng ba bảng số khác nhau.

Bốn chỗ phải sửa cùng một lượt, nếu không sẽ mâu thuẫn nhau:

1. **Dòng bán** giữ `rộng`, `cao`, `số bộ`, `cách bán`, `có bản bướm`; cơ sở rộng đến từ nhóm
   khách và chính sách, không cho người lập tự chọn.
2. **Máy chủ** đọc Item + Công thức cửa, tính lại diện tích và từ chối payload ghi thẳng nếu
   `qty` lệch. Cửa không thuộc năm loại trên vẫn đi công thức m² chung.
3. **Máy tính Công thức cửa** cho xem trước rộng cắt, m² bán và kg mua dự toán từ đúng một luật.
4. **Bậc giá theo m²** phải tính trên diện tích tính tiền do Worker trả ra, không phải diện tích
   hình học mặc định.

## 6. Còn treo

- **439 khách chưa phân loại đáng tin.** Hiện 321 mang giá trị mặc định "Đại lý", 114 để "Khác",
  chỉ 4 là "Khách lẻ". Phân loại này giờ quyết định **cả tiền lẫn kích thước cắt**, nên không
  dùng lại số đang có được.
- Cần điền `Item.purchase_kg_per_m2` cho cửa Úc, Lưới, Đài Loan và Siêu Trường trước khi dùng
  dự toán mua. Worker cố ý từ chối khi thiếu barem, không lấy một số gần đúng từ mặt hàng khác.
