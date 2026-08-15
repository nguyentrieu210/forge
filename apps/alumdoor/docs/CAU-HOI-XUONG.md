# Câu hỏi cần xưởng trả lời — danh mục sản xuất

> Lập 2026-08-15, sau khi dựng danh mục sản xuất từ sheet `ĐM` (2.115 dòng).
>
> Mọi câu dưới đây đều **chặn một phần nghiệp vụ chạy đúng**. Không câu nào hỏi cho đủ thủ tục.
> Chỗ nào suy đoán được thì tôi đã suy và ghi rõ **mức tin cậy** — anh/chị chỉ cần xác nhận
> hoặc sửa, không phải điền từ đầu.

## Tình trạng hiện tại

| | Số | Ghi chú |
|---|---|---|
| Thành phẩm trong sheet ĐM | **351** | |
| Đã dựng được định mức | **233** | vào máy ở trạng thái NHÁP |
| Hàng mua về bán lại — không có định mức là ĐÚNG | **107** | PULY, CÒI, TRỤC, HỆ THỐNG TỰ DỪNG… |
| **Thiếu định mức thật** | **11** | bảng C dưới |
| Dòng vật tư dựng được | **948** / 1.620 | |
| Mã vật tư bổ sung mới | **287** | Item master cũ chỉ có 278, sheet ĐM cần 517 |

⇒ Phủ được **340/351 = 97%** thành phẩm. Phần còn thiếu gọn trong 11 mục.

---

## A. Ba tham số chưa có trong bất kỳ tài liệu nào

| Mã | Câu hỏi | Tôi đang tạm dùng | Sai thì hỏng gì |
|---|---|---|---|
| **A1** | Lưỡi cắt ăn mất bao nhiêu mm mỗi nhát? | **3 mm** (chuẩn ngành 2–4) | Cây 6 m cắt 5 nhát lệch ~15 mm — đủ để miếng cuối không vừa |
| **A2** | Đầu thừa ngắn hơn bao nhiêu mét thì bỏ hẳn? | **Để trống — máy CHẶN không cho cắt** | Bản cũ tự đặt 0,25 m rồi tự ghi *"con số đó em bịa"*. Vứt nhôm còn dùng được, hoặc giữ rác |
| **A3** | Giữ chỗ tồn từ lúc nào — duyệt đơn hay phát lệnh sản xuất? | **Phát lệnh sản xuất** | Giữ sớm thì khoá hàng oan; giữ muộn thì hứa trùng cho hai khách |

A1 và A3 đang chạy được bằng mặc định. **A2 cố ý chặn** — không dám bịa lần thứ hai.

---

## B. Chín câu về "định mức nhân theo cái gì"

Sheet ĐM có cột `CÔNG THỨC TÍNH` nhưng chỉ điền **27/2.115 dòng**. Với 262 dòng còn lại tôi suy
từ đơn vị tính. Suy được thì ghi `suy luận`, không suy được thì để **Cố định** và hỏi ở đây.

Câu hỏi chung cho mỗi dòng: *lượng vật tư này có thay đổi theo kích thước cửa không, và theo chiều nào?*

| # | Đơn vị | Số dòng | Tôi đang đặt | Mức tin | Ví dụ vật tư |
|---|---|---:|---|---|---|
| B1 | `M` | **80** | Cố định | ❓ chưa rõ | SẮT VUÔNG 3X6M |
| B2 | `KG/M` | **78** | Theo chiều **cao** | ⚠ suy luận | Ron đáy đức · Ron nhựa đáy ray |
| B3 | `KG/M` | **49** | Theo chiều **rộng** | ⚠ suy luận | TRỤC 34 · V ĐÁY (thanh đáy Úc) |
| B4 | `M` | **33** | Theo chiều **cao** | ⚠ suy luận | Lông nheo nhỏ |
| B5 | `KG/M` | **15** | Cố định | ❓ chưa rõ | Lá đầu + Bộ 03 lá đáy · CÂY KÉO CỬA · TI INOX |
| B6 | `m` | 3 | Cố định | ❓ chưa rõ | Dây điện · LÁ YẾM · BÁT bắt lá yếm |
| B7 | `M` | 2 | Theo chiều **rộng** | ⚠ suy luận | TRỤC 114_1.8LY |
| B8 | `CÂY` | 1 | Cố định | ❓ chưa rõ | CÂY KÉO CỬA |
| B9 | `bọ` | 1 | Cố định | ❓ chưa rõ | BỌ MẮT VÕNG |

**Cách suy của tôi:** ron/lông/ray chạy dọc hai cạnh cửa nên ăn theo **chiều cao**; trục/thanh nằm
ngang nên ăn theo **chiều rộng**. Khớp với 27 dòng xưởng đã điền công thức. Nhưng đó là suy luận —
xin xác nhận, nhất là **B1 (80 dòng)** và **B2/B3** vì cùng đơn vị `KG/M` mà tôi tách hai hướng.

---

## C. Mười một thành phẩm chưa có định mức

Có liệt kê vật tư nhưng ô **định mức để trống**, nên máy chưa biết mỗi bộ ăn bao nhiêu:

| Thành phẩm | Số dòng vật tư trống |
|---|---:|
| RAY HỘP TD U76 | 3 |
| RAY ĐƠN TD U76 | 3 |
| RAY HỘP TD U100 | 3 |
| LÁ YẾM | 1 |
| LÁ TRUNG GIAN | 1 |
| LÁ ĐÁY LỚN | 1 |
| BỘ BA LÁ ĐÁY | 1 |
| CỬA LƯỚI SN PHI 13x26 INOX — TÁCH MÓN | 1 |
| *(3 mục còn lại xem `imports/alumdoor-bom-2026-08-15.audit.json`)* | |

> **Bốn mục lá có thể không cần hỏi.** Bảng `CHI TIẾT SƠN` đã cho bản lá: lá yếm **0,02 m**,
> lá trung gian **0,05 m**, lá đáy lớn **0,09 m**, và bộ 3 lá đáy = tổng ba cái = **0,16 m**.
> Xin xác nhận lấy theo bảng đó là đủ, hay còn vật tư khác đi kèm.

Ngoài ra có **56 dòng không ghi mã vật tư**, trong đó một dòng là lỗi Excel `#REF!` — xin xác nhận
bỏ được.

---

## D. 287 mã vật tư mới — xin duyệt cách xếp

Sheet ĐM dùng 517 mã nhưng danh mục hàng hoá cũ chỉ có 278, nên tôi tạo thêm 287 mã. Tên và mã
lấy nguyên từ sheet ĐM; **nhóm hàng và đơn vị tồn thì tôi suy** từ tên + đơn vị:

| Nhóm hàng | Số mã | | Đơn vị tồn | Số mã |
|---|---:|---|---|---:|
| Phụ kiện chung | 92 | | m2 | 149 |
| Phụ kiện CN Đức | 62 | | Cái | 68 |
| Cửa CN Đức | 37 | | Mét | 29 |
| Cửa tấm liền Úc | 32 | | Kg | 23 |
| Linh kiện motor | 21 | | Bộ | 12 |
| Cửa Lưới | 21 | | Con | 4 |
| Ray và trục | 13 | | Cặp | 2 |
| Điều khiển & phụ kiện điện | 4 | | | |
| Cửa Đài Loan | 3 | | | |
| Motor | 2 | | | |

**Chỗ tôi ngờ nhất: 149 mã để đơn vị `m2`.** Nhiều mã trong đó là vật tư mua theo kg hoặc theo
cây, không phải theo m². Xin soát nhóm này trước.

Danh sách đầy đủ 287 mã kèm mã gốc trong sheet: `server/imports/alumdoor-bom-2026-08-15.audit.json`,
mục `item_bo_sung.danh_sach`.

**172 mã bị đổi ký tự** vì có khoảng trắng hoặc dấu tiếng Việt — ví dụ `TP-CON LĂN` → `TP-CON-LAN`,
`NVL-BO1VIS AL70` → `NVL-BO1VIS-AL70`. Mã gốc vẫn lưu lại nên tra ngược được. Lý do đổi: mã có dấu
và khoảng trắng làm hỏng đường dẫn, tìm kiếm và file xuất.

---

## E. Hai câu còn treo từ trước

| # | Câu hỏi | Chặn cái gì |
|---|---|---|
| E1 | Mã màu `4004` có phải **ĐỎ ĐÔ** không? | Mã màu cuối chưa gỡ được |
| E2 | Mỗi tổ có bao nhiêu người (Đức / Úc / Lưới / Đài Loan / Siêu Trường)? | Không tính được tăng ca và năng lực ngày |

---

## Vì sao chưa cho chạy thật

Toàn bộ 233 định mức và 287 mã hàng đang nằm ở trạng thái **NHÁP**. Cho chạy thật nghĩa là cho máy
tự trừ kho theo những con số này. Còn 262 dòng chưa xác nhận ở bảng B mà cho chạy thì máy sẽ xuất
sai vật tư — đúng cái xưởng đang đau nhất.

Trả lời xong bảng A và B là bật chạy thật được.
