# Bán hàng Alumdoor — những gì cần anh chốt

Ngày: **14/08/2026**. Nhánh: `feat/alumdoor-sales-o2c-complete`.

Tài liệu này gom **hai loại**: câu hỏi cũ trong `ALUMDOOR-QUY-TRINH.md` chưa được trả lời, và
câu hỏi **mới phát sinh** từ đợt đóng kín chuỗi bán hàng. Mỗi mục ghi rõ *hiện máy đang làm gì*
để anh chỉ cần nói đúng/sai, chứ không phải mô tả lại từ đầu.

---

## 0. Đã sửa xong, không cần anh quyết

| Việc | Trạng thái |
|---|---|
| Báo giá lên thanh bên (trước đây không ai tạo được) | ✅ đã chạy thật |
| Hoá đơn bán lên thanh bên (trước đây thu tiền được mà không lập được hoá đơn) | ✅ đã chạy thật |
| Thao tác `Báo giá → Đơn hàng` bấm được | ✅ đã chạy thật |
| Thao tác `Đơn hàng → Phiếu xuất` bấm được | ✅ đã chạy thật |
| Thao tác `Đơn hàng → Hoá đơn` (hoàn toàn mới) | ✅ đã chạy thật |
| Lỗi `Báo giá → Đơn hàng` bị nhân từ chối vì thiếu khóa dòng | ✅ đã sửa + có phép thử |
| Giấy báo Có KH (giảm công nợ phải thu khi khách trả hàng) | ✅ đã chạy thật trên sổ |

Bằng chứng chạy thật, đọc **SỔ** chứ không chỉ đọc chứng từ:

```
Báo giá BG-2026-0007 → Đơn DH-2026-0018 → Hoá đơn HD-2026-0003 (ghi sổ, còn nợ 540.000)
  → Giấy báo Có GBC-2026-0002 (180.000)  →  công nợ còn 360.000, hoá đơn "Partly Paid"
  → xuất hoá đơn lần hai: TỪ CHỐI ("đã xuất hoá đơn đủ")
  → giấy báo Có vượt số còn nợ: TỪ CHỐI ("exceeds Sales Invoice outstanding")
```

---

## 1. Câu hỏi MỚI từ đợt này

### 1.1 — Xuất hoá đơn có được vượt số ĐÃ GIAO không?

**Máy đang làm:** hoá đơn lấy phần *chưa xuất hoá đơn* của đơn, **không** chặn theo số đã giao.
Màn xem trước có hiện cột "đã giao" bên cạnh để người lập tự thấy mình đang thu trước hay thu sau.

**Vì sao để vậy:** báo giá của xưởng có điều khoản `Cọc 50%`, nên xuất hoá đơn trước khi giao là
việc bình thường. Chặn cứng theo số đã giao sẽ chặn luôn việc thu cọc.

> ❓ **Cần anh chốt:** giữ nguyên (cho phép thu trước), hay chặn không cho xuất hoá đơn quá phần
> đã giao? Nếu chặn thì cọc ghi bằng chứng từ nào?

### 1.2 — Khách trả hàng thì nhập lại vào kho nào?

**Máy đang làm:** nhân bắt buộc nhập lại **đúng kho đã xuất** trên phiếu giao gốc, và từ chối
trả quá số đã giao.

**Chỗ chưa chắc:** cửa đã lắp ở công trình rồi khách trả lại thì hàng thường không còn nguyên
như lúc xuất — hàng lỗi, hàng tháo ra.

> ❓ **Cần anh chốt:** hàng khách trả có nhập thẳng về `K36`/`K12` như hàng tốt không, hay cần
> một kho riêng kiểu "hàng khách trả chờ kiểm"? *(Tài liệu quy trình đã ghi nguyên tắc: chỉ thêm
> kho con khi thật sự cần kiểm đếm riêng — nên đây đúng là một trong các ca đó hay không.)*

### 1.3 — Màn Báo giá: dùng form thường hay đầu tư dùng chung màn với Đơn hàng?

**Hiện trạng:** Đơn bán hàng có màn nghiệp vụ riêng (`AlumdoorSalesOrderCreate`, 2.816 dòng) biết
xổ cách bán theo từng mặt hàng, bung món tách, gọi máy chủ định giá từng dòng. **Báo giá dùng form
thường.**

Form thường **không rỗng** — nó đã khai đủ ô (mã hàng, cách bán, màu, rộng/cao, số bộ, ĐVT, SL,
giá, chiết khấu) và có gọi máy chủ xem trước tiền từng dòng. Nhưng nó thiếu một thứ: ô **"Phương
án bán"** liệt kê *toàn bộ* cách bán, không lọc theo mặt hàng đang chọn. Chọn sai thì máy chủ từ
chối lúc lưu ("Cách bán X không áp dụng cho mặt hàng Y") — không hỏng dữ liệu, nhưng mất công.

**Vì sao không lọc bằng cấu hình được:** cách bán của **Cửa Đức** khai ở cấp **NHÓM**
(`DUC-CHI-LA`, `DUC-TANG-RAY`), còn Úc / Đài Loan / Lưới khai ở cấp **MÃ HÀNG**. Một bộ lọc tĩnh
chỉ diễn đạt được một trong hai; lọc theo mã hàng sẽ **giấu mất** hai cách bán của Cửa Đức. Đó
đúng là lý do màn đơn hàng phải hỏi máy chủ.

> ❓ **Cần anh chốt:** báo giá dùng form thường như hiện tại (chấp nhận ô cách bán chưa lọc), hay
> cho báo giá **dùng chung màn với đơn hàng**?
>
> Nếu chọn dùng chung: đó là sửa 45 chỗ đang ghi cứng `"Sales Order"` trong màn đơn hàng thành
> tham số. **Em không tự làm** vì đây đúng là màn anh đã chốt là TỐT, và sửa 45 chỗ trên một màn
> đã chốt là chỗ dễ làm trôi mất thứ đang chạy đúng.

### 1.4 — Nhánh MUA còn hai thao tác bị giấu y hệt

Cùng một lỗi với nhánh bán, em **chưa sửa** vì anh đặt phạm vi là bán hàng:

| Thao tác | Trạng thái |
|---|---|
| `Đơn mua → Phiếu nhập` | vẫn bị ẩn khỏi thanh bên |
| `Chụp ảnh → chứng từ mua` | vẫn bị ẩn khỏi thanh bên |

> ❓ **Cần anh cho biết:** có mở luôn hai cái này không? Sửa mỗi cái đúng một dòng.

### 1.5 — Có cần hộp thư "Xử lý báo giá" không?

**Máy đang làm:** em tắt hộp thư duyệt của báo giá (`inbox: false`), vì bật lên sẽ đẻ ra một nhóm
thanh bên mới ("Tác nghiệp") không có trong danh sách nhóm anh đã duyệt. Nút chuyển trạng thái
vẫn nằm ngay trên chứng từ báo giá.

> ❓ **Cần anh cho biết:** kinh doanh có cần một danh sách riêng "báo giá đã gửi, đang chờ khách
> trả lời" không? Nếu có, em xếp nó vào nhóm **Bán hàng** chứ không tạo nhóm mới.

---

## 2. Câu hỏi CŨ vẫn đang chặn

Lấy từ `docs/ALUMDOOR-QUY-TRINH.md` mục 9. Chưa thấy câu trả lời ở đâu trong repo.

| # | Cần gì | Vì sao chặn |
|---|---|---|
| 1 | **Giá LÁ RỜI** — theo lá, mét dài, hay kg? | Đoán sai là sai tiền. Ray và trục bán theo **mét**, nên nghi lá cũng vậy |
| 2 | **Mốc giữ chỗ tồn kho** — từ đơn hàng hay từ lệnh sản xuất? | Không có nó thì không tính được **tồn khả dụng**, và kinh doanh sẽ hứa trùng hàng |
| 3 | **Số người mỗi tổ** | Định mức giờ đã đủ; có số người là chạy được lịch sản xuất + tăng ca |
| 4 | **Bảng chọn mô tơ** theo m² hoặc kg cửa | App tự tính được cân nặng cửa, chỉ thiếu ngưỡng |
| 5 | **12 mã ray / lá đáy / thanh đáy** — xác nhận tạo mới trong danh mục | Sheet `NHẬP` cho thấy chúng được mua thật theo kg từ Tiến Đạt |
| 6 | **Cùng mã nhôm mua được cả thô lẫn màu?** | Quyết định "thô/màu" có phải hai trạng thái tồn kho không |
| 7 | **Khoá Google service account** | Chặn phần đổ Google Sheet |

Kèm các câu xác nhận ngắn (đúng/sai là đủ):

- Cách tính m² ở cửa lưới — `RỘNG PBRAY` là tổng cả 2 cánh?
- Puly lớn lúc 4, lúc 5, lúc 6 — theo chiều rộng cửa hay theo cân nặng?
- Trục dài hơn rộng phủ bì bao nhiêu; ray ngắn hơn cao phủ bì bao nhiêu?
- **Kế toán** là người bấm phát lệnh sản xuất?
- NCC có ghi **khổ từng cây** lúc giao không, hay xưởng tự đo?
- Có cần theo dõi **công nợ phải trả** không, hay mua tới đâu trả tới đó?
- Tồn nhôm chia hai xưởng thế nào?
- Đoạn nhôm thừa ngắn hơn **bao nhiêu mét** thì coi là bỏ hẳn? *(đang tự đặt 0,25 m)*
- Tồn khả dụng của nhôm đọc **theo bảng khổ** có đúng cách xưởng nghĩ không?

---

## 3. Việc chưa chứng minh được, cần chạy thử trước khi lên thật

| Việc | Vì sao chưa chứng minh |
|---|---|
| **Khách trả hàng — nửa HIỆN VẬT** (nhập lại kho theo phiếu xuất) | Bản dữ liệu cách ly **không có tồn kho nào** nên không dựng nổi một phiếu xuất đã ghi sổ để trả theo. Phần luật đã có phép thử, nhưng đường chạy thật thì chưa. |
| **Ghi sổ phiếu xuất** | Cùng lý do — nhân từ chối đúng ("Insufficient stock"), nhưng đó là chặn vì thiếu tồn chứ không phải đã chạy qua |

Hai việc này phải chạy thử trên dữ liệu có tồn thật trước khi đưa ra production.
