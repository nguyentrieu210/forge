# Mua hàng — hướng dẫn dùng

> Cho người ở xưởng, không cho lập trình viên. Bản kỹ thuật:
> [ALUMDOOR-MUA-HANG-THIET-KE.md](ALUMDOOR-MUA-HANG-THIET-KE.md).

Menu **Mua hàng** có 8 chứng từ, xếp đúng thứ tự việc chạy trong thực tế, cộng một màn chụp ảnh:

```
Yêu cầu vật tư → Yêu cầu báo giá → Báo giá NCC → Đơn mua hàng
                                                      │
                                          ┌───────────┴───────────┐
                                     Phiếu nhập mua          Hoá đơn mua
                                     (hàng về kho)        (công nợ phải trả)
                                          │                     │
                                   Trả hàng NCC          Giấy báo Nợ NCC
                                                                │
                                                          Phiếu chi
```

Không bắt buộc đi hết. **Mua quen thì bắt đầu thẳng ở Đơn mua hàng.**

---

## 1. Việc thường ngày: đặt hàng và nhận hàng

### Đặt hàng

**Mua hàng → Đơn mua hàng → Tạo mới.** Chọn nhà cung cấp, ngày hẹn giao, thêm dòng hàng, rồi
**Ghi sổ**.

In gửi NCC: mở đơn → **In** → *Đơn mua hàng ALUMDOOR*.

### Hàng về

**Mở đơn mua → nút "Đơn mua → Phiếu nhập".**

Nút này chỉ đề xuất **phần còn thiếu**, và tạo ra một phiếu **NHÁP** — chưa vào kho.

> **Việc của thủ kho là sửa lại số THỰC ĐẾM trước khi ghi sổ.** Số trên đơn là số *đặt*; số
> vào kho phải là số *đếm được*. Hàng về thiếu vài cây, hay một cây móp phải trả lại ngay tại
> xe, là chuyện thường ngày.

Đếm xong bấm **Ghi sổ** → tồn kho tăng thật.

### Một chuyến xe chở hàng của HAI đơn

Không phải tách hai phiếu. Trên **từng dòng** của phiếu nhập có ô **"Đơn mua của dòng này"** —
điền đơn tương ứng cho mỗi dòng. Một chuyến xe, một biên bản giao nhận của NCC, **một phiếu**.

### Hàng về làm nhiều đợt

Cứ tạo phiếu nhập mỗi lần hàng về. Hệ thống cộng dồn và **từ chối khi nhận vượt số đã đặt**.

---

## 2. Đơn vị tính: mua CÂY, bán MÉT

Đây là phần dễ sai nhất, và sai thì **không có gì báo**.

### Khai một lần ở hồ sơ hàng hoá

**Danh mục → Hàng hoá/Vật tư →** mở mặt hàng:

| Ô | Điền gì | Ví dụ ray U100 |
|---|---|---|
| **Đơn vị TỒN KHO** | đơn vị dùng để **đếm tồn và bán** | `Mét` |
| **Quy đổi đơn vị** → `Đơn vị giao dịch` | đơn vị **mua vào** | `Cây` |
| **Quy đổi đơn vị** → `1 đơn vị này = ? đơn vị tồn` | chiều dài một cây | `5.85` |

Khai xong: mua **20 cây** → sổ kho ghi **117 mét**, tiền vẫn là tiền của 20 cây.

### Trên chứng từ

- Ô **Đơn vị mua** để **trống** = mua đúng bằng đơn vị tồn. Đây là trường hợp thường gặp.
- Chọn đơn vị khác (`Cây`, `Kg`…) → hệ thống tự tra bảng quy đổi ở trên.
- Cột **"Quy ra"** hiện ngay số sẽ vào kho — **nhìn cột này trước khi ghi sổ.**

### Nếu gặp thông báo *"chưa có quy đổi từ … sang …"*

Hệ thống **cố ý** từ chối, không tự đoán hệ số 1. Hai cách xử lý:

1. Vào hồ sơ mặt hàng khai dòng quy đổi (cách đúng, khai một lần dùng mãi), **hoặc**
2. Điền thẳng ô **Hệ số quy đổi** trên dòng — dùng khi chuyến này cây dài khác thường
   (cây 6 m thay vì 5,85 m). **Hệ số trên dòng luôn thắng bảng.**

---

## 3. Khi cần so giá nhiều nhà cung cấp

Dùng khi mua món lớn, hoặc muốn có bằng chứng đã hỏi đủ nơi.

1. **Yêu cầu báo giá →** viết rổ hàng **một lần**, chọn các NCC muốn hỏi.
2. **In → Yêu cầu báo giá ALUMDOOR** — tờ này cố ý **để trống cột giá**, gửi NCC điền vào.
3. NCC trả lời → nhập vào **Báo giá NCC** (mỗi NCC một phiếu, trỏ về yêu cầu ở bước 1).
4. **Báo cáo mua hàng → So sánh báo giá NCC** — mỗi NCC một dòng, sắp theo giá thấp nhất.
5. Chọn xong → mở báo giá đó → nút **"Báo giá NCC → Đơn mua"**.

Không gõ lại dòng nào. Bấm nút hai lần cũng **không** tạo hai đơn.

> NCC không có trong danh sách mời thì không nhập báo giá vào được — để bảng so giá không có
> cột nào không giải thích được.

---

## 4. Khi tổ sản xuất báo hết vật tư

**Yêu cầu vật tư** thay cho tin nhắn Zalo.

Tổ lắp/tổ sản xuất tự tạo, ghi cần gì, bao nhiêu, cần trước ngày nào, và **ai yêu cầu**.

Chủ xưởng xem **Báo cáo mua hàng → Yêu cầu vật tư theo tổ** để **gộp đơn**, thay vì mua lẻ ba
lần trong một tuần.

Khi đặt mua, điền ô **"Theo yêu cầu vật tư"** trên đơn mua → hệ thống **từ chối đặt quá số đã
yêu cầu**, cộng dồn qua tất cả các đơn.

---

## 5. Công nợ nhà cung cấp

| Việc | Vào đâu |
|---|---|
| NCC gửi hoá đơn | **Hoá đơn mua** → công nợ phải trả tăng |
| Trả tiền NCC | **Phiếu thu / chi**, chọn `Pay`, phân bổ vào hoá đơn |
| Xem còn nợ ai bao nhiêu | **Báo cáo mua hàng → Công nợ phải trả** |

**Hàng về trước, hoá đơn về sau** là bình thường và sổ vẫn cân: phiếu nhập ghi vào tài khoản
*"Hàng nhận chưa có hoá đơn"*, hoá đơn về thì chuyển sang *"Phải trả người bán"*.

---

## 6. Trả hàng nhà cung cấp

Nhôm sai màu, ray cong, mô tơ lỗi — **hai bước, hai chứng từ**:

| Bước | Chứng từ | Kết quả |
|---|---|---|
| 1. Trả **HÀNG** | **Trả hàng nhà cung cấp** (theo phiếu nhập) | Tồn kho giảm |
| 2. Trả **TIỀN** | **Giấy báo Nợ NCC** (theo hoá đơn mua) | Công nợ phải trả giảm |

Hàng thường đi về trước, hoá đơn điều chỉnh của NCC về sau — nên hai bước tách rời, làm bước 1
trước cũng được.

Hệ thống **từ chối**: trả quá số đã nhập · trả về kho khác kho đã nhập · giảm trừ vượt số còn
nợ trên hoá đơn.

---

## 7. Chụp ảnh thay cho gõ

**Mua hàng → Chụp ảnh → chứng từ mua.**

Chụp bảng giá NCC gửi qua Zalo, phiếu giao hàng lúc hàng về, hay hoá đơn NCC — máy đọc thành
dòng hàng.

| Ô | Điền gì |
|---|---|
| **Ảnh chụp** | ảnh hoặc bản chụp màn hình |
| **Đọc thành chứng từ gì** | Báo giá NCC · Đơn mua hàng · Phiếu nhập mua · Hoá đơn mua |
| **Nhà cung cấp** | bắt buộc — máy không đoán NCC từ ảnh |
| **Kho** | bắt buộc khi tạo phiếu nhập |

Bấm **Đọc thử ảnh** trước: nó chỉ đọc, chưa tạo gì. Xem đủ dòng chưa rồi mới bấm **Tạo chứng
từ nháp**.

### Ba điều phải biết trước khi dùng

**1. Luôn ra bản NHÁP, và đó là cố ý.** Máy đọc ảnh là để khỏi *gõ*, không phải để khỏi
*nhìn*. Một chữ số đọc nhầm ở cột đơn giá là sai công nợ với NCC, và **không sổ nào kêu lên**.
Soát lại từng số so với ảnh rồi mới bấm Ghi sổ.

**2. Dòng nào máy không chắc mã hàng thì để TRỐNG**, kèm nguyên chữ đọc được trong ô ghi chú.
Máy **không đoán bừa**: một ô trống là câu hỏi để anh chọn, còn một mã đoán sai là hàng vào
nhầm mã mà chứng từ vẫn trông hợp lệ. Bảng kết quả ghi rõ *"đọc được N dòng, khớp được mã M"*.

**3. Dòng thiếu mã hoặc thiếu số lượng không vào chứng từ nháp** — nếu đưa vào, cả phiếu bị từ
chối và anh mất luôn những dòng đã đọc đúng. Chúng vẫn hiện trên bảng kết quả và trong ô ghi
chú của phiếu, để anh thêm tay.

### Chụp thế nào cho máy đọc được

Đủ sáng · thẳng góc với tờ giấy · lấy trọn bảng, đừng cắt mất cột đơn giá · ảnh dưới 4 MB.
Bảng viết tay chữ xấu thì máy đọc kém — chỗ đó gõ tay vẫn nhanh hơn sửa.

---

## 8. Báo cáo

| Báo cáo | Trả lời câu gì |
|---|---|
| **Mua hàng theo nhà cung cấp** | Tháng này mua của ai bao nhiêu |
| **Đơn mua chưa nhận đủ** | Còn đơn nào hàng chưa về — sắp theo ngày hẹn giao |
| **So sánh báo giá NCC** | Ai chào rẻ nhất |
| **Yêu cầu vật tư theo tổ** | Ai đang xin gì |
| **Giảm trừ theo nhà cung cấp** | NCC nào hay giao hàng lỗi |
| **Công nợ phải trả** | Còn nợ ai bao nhiêu |

Sáu cái đầu đọc **chứng từ**. **Công nợ phải trả** đọc **sổ cái** — khi hai bên lệch nhau, tin
sổ cái.

---

## 9. Ba lỗi hay gặp

**"chưa có quy đổi từ X sang Y"** — xem §2. Hệ thống cố ý không đoán.

**"exceeds Purchase Order quantity"** — nhận vượt số đã đặt. Hàng về nhiều hơn đơn thì **sửa
đơn mua trước** (hoặc tạo đơn mới), đừng ép phiếu nhập.

**"Expense account is required at row N"** — hoá đơn mua thiếu tài khoản ghi nợ ở một dòng.
Để mặc định **Hàng tồn kho**; chỉ đổi sang tài khoản chi phí khi mua thứ dùng luôn, không nhập
kho (ví dụ cước vận chuyển).

---

## 10. Ai làm được gì

| | Chủ xưởng | Kế toán | Thủ kho | Sản xuất | Kinh doanh |
|---|:---:|:---:|:---:|:---:|:---:|
| Yêu cầu vật tư | sửa | xem | sửa | **sửa** | xem |
| Yêu cầu báo giá · Báo giá NCC | sửa | sửa | xem | xem | xem |
| Đơn mua hàng | sửa | sửa | xem | xem | xem |
| Phiếu nhập mua | sửa | sửa | **sửa** | — | xem |
| Hoá đơn mua · Giấy báo Nợ | sửa | **sửa** | xem | — | xem |
| Trả hàng NCC | sửa | sửa | **sửa** | — | xem |
