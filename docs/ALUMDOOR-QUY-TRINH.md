# ALUMDOOR — Quy trình & những chỗ còn thiếu

> Tài liệu này **chỉ mô tả và hỏi**, không phải kế hoạch code. Mục đích: anh đọc một lượt,
> thấy chỗ nào em hiểu sai thì sửa, chỗ nào thiếu số liệu thì bổ sung.
>
> Trạng thái ghi theo ba mức, và ba mức này **rất khác nhau**:
>
> | Ký hiệu | Nghĩa |
> |---|---|
> | ✅ **CHẠY THẬT** | Đã chạy trên `alu.kairo.vn` với dữ liệu thật, có phép thử tự động chặn hồi quy |
> | 🟡 **ĐÃ KHAI, CHƯA CHỨNG MINH** | Cấu trúc có rồi nhưng chưa chạy thử end-to-end — **chưa được tin** |
> | ⛔ **CHƯA CÓ** | Chưa làm gì |

---

## 1. Bức tranh tổng thể

```
        MUA                          BÁN                        LÀM
   ┌─────────────┐            ┌──────────────┐         ┌──────────────────┐
   │ NCC (kg)    │            │ Báo giá      │         │ Lệnh sản xuất    │
   │   ↓         │            │   ↓ khách OK │         │   ↓              │
   │ Nhập nhôm   │            │ Đơn hàng     │────────▶│ Cắt nhôm (lá)    │
   │   ↓         │            │   ↓          │         │   ↓              │
   │ TỒN: số LÁ  │───────────▶│ Xuất kho     │         │ Sơn (THÔ→màu)    │
   │ theo khổ    │            │   ↓          │         │   ↓              │
   └─────────────┘            │ Hoá đơn      │         │ Lắp ráp          │
         │                    │   ↓          │         └──────────────────┘
   Công nợ PHẢI TRẢ           │ Thu tiền     │
                              └──────────────┘
                              Công nợ PHẢI THU
```

Ba dòng chảy, và **hai trong ba đã chạy được**. Dòng MUA là dòng còn hở nhiều nhất.

---

## 2. Dòng BÁN — ✅ chạy thật

| Bước | Trạng thái | Ghi chú |
|---|---|---|
| Báo giá (BG-) | ✅ | Có workflow Nháp → Đã gửi → Khách đồng ý/từ chối. "Đã gửi" vẫn **sửa được** vì khách còn mặc cả |
| Báo giá → Đơn hàng | ✅ | Chép nguyên số đo/màu/mô tơ. Bấm nhiều lần vẫn ra **đúng một đơn** |
| Đơn hàng (DH-) | ✅ | |
| Bảng giá bán | ✅ | Chọn bảng giá thì **server quyết giá**, ghi đè giá gõ tay. Để trống thì gõ tay như cũ |
| Phiếu xuất kho (PXK-) | ✅ | Trừ tồn thật, **từ chối khi không đủ** |
| Hoá đơn (HD-) | ✅ | Lên công nợ phải thu |
| Phiếu thu (PT-) | ✅ | Trừ công nợ |
| In hoá đơn / báo giá | ✅ | Có dòng hàng, tiền có dấu phân cách |

### Còn thiếu ở dòng bán

**2.1 — Bảng giá BÁN chưa có số.** Cơ chế chạy rồi nhưng chưa có một dòng giá thật nào.
Anh nói *"tính theo m² và tùy trường hợp"*. Em cần biết **"tùy trường hợp"** là tùy theo cái gì:

- Tùy **loại cửa**? (Đức / Úc / Đài Loan / siêu trường — mỗi loại một giá/m²)
- Tùy **khách**? (đại lý rẻ hơn khách lẻ bao nhiêu %)
- Tùy **diện tích**? (cửa nhỏ có giá tối thiểu, vd dưới 6 m² tính tròn 6 m²)
- Tùy **màu / có dập hay không**?

> **Cần anh cho:** một bảng giá bán mẫu, kiểu
> `AL548N · màu · khách lẻ · 1.450.000 đ/m² · tối thiểu 6 m²`

Và vì cửa Đức **bán tách món được** (xem mục 3.1b), bảng giá thực ra có **hai tầng**:

| Bán gì | Đơn vị tính tiền |
|---|---|
| Trọn bộ cửa | đ/m² phủ bì |
| Lá rời | ❓ đ/lá hay đ/mét dài hay đ/kg — **chưa biết** |
| Mô tơ, ray, remote, trục | đ/cái · đ/bộ · đ/cây |

Hai tầng này **không suy ra nhau được**: giá m² đã gộp cả nhôm lẫn ray lẫn mô tơ lẫn công
lắp, nên không thể chia ngược ra giá một cái lá.

**2.2 — Diện tích m² chưa tự tính.** Dòng đơn hàng có Rộng (mm), Cao (mm), Số bộ, và
Số lượng tính tiền. Hiện **phải gõ tay** số m².

> **Cần anh xác nhận công thức:** `m² = (rộng × cao × số bộ) ÷ 1.000.000` — hay xưởng
> tính theo **phủ bì** (cộng thêm mỗi bên bao nhiêu mm)? Có làm tròn không?

---

## 3. Dòng LÀM (sản xuất) — 🟡 một nửa

| Bước | Trạng thái | Ghi chú |
|---|---|---|
| Công thức chia lá | ✅ | 19 mã, có 11 phép thử lấy từ chính ví dụ của xưởng |
| Tồn nhôm theo lô | ✅ | 1.256 lô, 43.601 lá đã nạp từ file Excel |
| Cắt nhôm | ✅ | Chọn **khổ nhỏ nhất còn đủ dài** để ít phế nhất; từ chối kèm số lá còn thiếu |
| Hoàn cắt (ghi nhầm) | ✅ | Lá về đúng lô cũ, nguyên khổ. Hoàn lần hai bị chặn |
| Trả hàng (đã cắt) | ✅ | Vào lô khổ MỚI, đánh dấu ngày nhập lại |
| Định mức vật tư (BOM) | 🟡 | **Doctype có, số liệu KHÔNG có dòng nào** |
| Lệnh sản xuất | 🟡 | Đã nối vào BOM nhưng **chưa chạy thử** |
| Phiếu sản xuất (trừ vật tư) | 🟡 | Nền tảng có sẵn, **chưa chứng minh** |
| In phiếu sản xuất | ✅ | Số đo in TO, có bảng vật tư cần |
| Sơn / lò sơn | ⛔ | |
| Lịch sản xuất / tăng ca | ⛔ | |
| Danh sách lỗi | ⛔ | |

### Còn thiếu ở dòng làm

**3.1 — ĐỊNH MỨC (BOM) chưa có số nào.** Đây là chỗ **thiếu nặng nhất** của cả app.

Bảng định mức trả lời: *một bộ cửa ăn hết những gì*. Ví dụ em hình dung:

| Bộ cửa AL548N, 4,2 m × 2,8 m | Số lượng |
|---|---|
| Lá AL548N | 51 lá (đã tính được từ công thức chia lá ✅) |
| Lá đáy | 1 |
| Lá đầu | 1 |
| Ray hộp U100 | 2 cây × 2,8 m |
| Mô tơ | 1 bộ (loại nào theo cân nặng cửa?) |
| Trục | 1 |
| Bộ 3 lá đáy | ? |
| Ron đáy | ? mét |
| Phụ kiện (pát, ốc, lò xo…) | ? |

> **Cần anh cho:** với **một** bộ cửa mẫu (chọn loại hay bán nhất), liệt kê hết vật tư và
> số lượng. Chỉ cần **một bộ** — em suy ra công thức theo kích thước rồi anh kiểm lại.
>
> Riêng phần **lá thì em tính được rồi**, chỉ thiếu ray / mô tơ / trục / phụ kiện.

### 3.1b — Bán TÁCH MÓN, không bắt buộc trọn bộ ⚠️ điều này đổi cả cách làm định mức

Anh cho biết cửa Đức **bán tách món được**, không nhất thiết trọn bộ. Đây không phải chi
tiết nhỏ — nó quyết định định mức là **thứ bắt buộc** hay chỉ là **gợi ý**.

Nếu định mức là bắt buộc, bán một cái mô tơ rời sẽ bị app đòi đủ ray, đủ lá, đủ trục. Nên
định mức phải là **bản mẫu để gợi ý**, không phải cái khoá.

Em hiểu xưởng có **ba kiểu bán**, và ba kiểu đi ba đường khác nhau:

| Kiểu bán | Ví dụ | Đường đi trong app | Cần lệnh SX? |
|---|---|---|---|
| **Trọn bộ** | 1 bộ cửa Đức 4,2 × 2,8 | định mức nổ ra vật tư → cắt lá → lắp ráp → giao | Có |
| **Lá rời** | 51 lá AL548N khổ 3,5 m | chỉ **cắt** rồi giao, không lắp | Không — chỉ phiếu cắt |
| **Phụ kiện rời** | 1 mô tơ, 2 cây ray, 1 remote | xuất thẳng từ kho | Không |

Cách em định làm: **định mức chỉ điền sẵn, người bán xoá được từng dòng.** Bán trọn bộ thì
chọn bộ cửa, app điền đủ vật tư; bán tách món thì gõ thẳng món cần, không đụng tới định mức.

> **Cần anh xác nhận 3 điều:**
>
> **a) Có kiểu "trọn bộ nhưng bỏ bớt" không?** Ví dụ khách tự có mô tơ, mua bộ cửa không mô
> tơ — lúc đó giá tính thế nào? Trừ đúng giá mô tơ, hay có bảng giá riêng?
>
> **b) Lá rời tính tiền theo gì?** Đây là chỗ em **không đoán được**:
> - đ/**lá** (theo số lá, không quan tâm dài ngắn)?
> - đ/**mét dài** (51 lá × 3,5 m = 178,5 m)?
> - đ/**kg** (như mua vào, cộng lãi)?
> - đ/**m² phủ bì** (như bán trọn bộ)?
>
> **c) Giá tách món có đắt hơn giá trong trọn bộ không?** Thường bán lẻ đắt hơn bán theo bộ.
> Nếu có thì chênh bao nhiêu — theo % hay theo bảng giá riêng?

**3.2 — Mô tơ chọn theo gì?** Cửa nặng thì mô tơ khoẻ. Em thấy trong file có nhiều loại
(motor trong, motor ngoài, motor ngoài tự dừng…).

> **Cần anh cho:** bảng chọn mô tơ, kiểu `cửa dưới 12 m² → mô tơ 500kg; 12–18 m² → 800kg…`

**3.3 — Công đoạn SƠN chưa có trong app.** File của xưởng có phân biệt rõ
`THÔ` / `MÀU - CHƯA DẬP` / `MÀU - ĐÃ DẬP`, và bảng giá NCC cũng tính giá khác nhau cho từng
loại. Nghĩa là **sơn là một công đoạn có tồn kho riêng**: nhôm thô nằm chờ sơn.

> **Cần anh mô tả:** sơn làm ở đâu (lò sơn của xưởng hay thuê ngoài)? Nhôm đi sơn có phải
> làm phiếu không? Sơn xong có hao hụt không? "Dập" là công đoạn gì, trước hay sau sơn?

**3.4 — Lịch sản xuất / tăng ca.** Sheet `LỊCH SẢN XUẤT` trong file anh gửi **đang rỗng**.

> **Cần anh cho hai con số:**
> 1. **Định mức giờ** mỗi bộ cửa theo nhóm (ÚC · LƯỚI · ĐỨC · ĐÀI LOAN · SIÊU TRƯỜNG · LÒ SƠN)
> 2. **Số người mỗi tổ**
>
> Có hai cái đó em tính được: tổng giờ cần ÷ (số người × 8 giờ) → biết ngày nào phải tăng ca.

**3.5 — Danh sách lỗi.** File có sheet `DANH SÁCH LỖI` nhưng em chưa mở kỹ.

> **Cần anh cho biết:** lỗi ghi nhận ở công đoạn nào? Ai ghi? Ghi xong thì làm gì tiếp
> (làm lại, bù hàng, trừ lương tổ)? Có phân loại lỗi không?

---

## 4. Dòng MUA — ⛔ đây là chỗ hở lớn nhất

**Hiện tại app KHÔNG có đường nhập nhôm.** 1.256 lô đang có là do em nạp thẳng từ Excel một
lần, không qua chứng từ nào. Nghĩa là:

- Không có phiếu nhập → không biết lô nào mua ngày nào, của ai, giá bao nhiêu
- **Không có công nợ phải trả** cho nhà cung cấp
- **Không có giá vốn nhôm** → lãi/lỗ mỗi bộ cửa không tính được

### 4.1 — Đơn vị tính: hiểu đúng mới làm đúng

Từ file `NHẬP` của xưởng, ĐVT thực tế có **5 loại**: `LÁ · CÂY · BỘ · SỢI · KG`.

Và anh vừa cho biết: **hoá đơn NCC ghi theo kg**, còn xưởng **đếm và cắt theo lá**.

Đây là **hai đơn vị cho cùng một thứ**, và em đề xuất xử lý thế này:

```
SỐ LÁ   ← thủ kho ĐẾM        → là TỒN KHO, là thứ đem đi cắt
SỐ KG   ← hoá đơn NCC        → là TIỀN, là thứ lên công nợ phải trả
KG lý thuyết = số lá × khổ × trọng lượng(kg/m)   → chỉ để ĐỐI CHIẾU
```

**Vì sao không lấy kg chia ra số lá:** anh nói *"nhiều khi nhập có sai số"*. Nếu suy số lá từ
cân nặng thì mỗi lô ra một số lẻ kiểu `29,7 lá` trong khi thợ đếm được `30` — app và thực tế
lệch nhau **ngay từ lúc nhập, và lệch mãi**. Nên cân nặng không được phép quyết định tồn kho;
nó chỉ làm chứng cho tiền và cho cảnh báo.

**Giá vốn mỗi lá** thì đơn giản và không cần hằng số nào:
`giá vốn 1 lá = thành tiền hoá đơn ÷ số lá thực nhận`

### 4.2 — ⚠️ Đơn vị trọng lượng: em nghĩ bảng của anh là **kg/mét dài**, không phải kg/m²

Anh nói kg/m². Nhưng chính bảng anh gửi bác lại điều đó, ở hai chỗ:

**Bằng chứng 1 — dòng ray.** `RHU100 = 1,419` là *ray hộp U100*. Ray là thanh thẳng,
chỉ đo theo **mét dài**. Không ai tính ray theo m².

**Bằng chứng 2 — thử ngược ra cân nặng cửa.** `AL548N = 0,425`, bản lá `0,055 m`:

| Nếu hiểu con số là | 1 m² cửa cuốn sẽ nặng |
|---|---|
| kg/**mét dài** | 0,425 ÷ 0,055 = **7,7 kg/m²** ← đúng tầm cửa cuốn thật |
| kg/**m²** | **0,425 kg/m²** ← nhẹ hơn một tờ bìa cứng |

> **Cần anh xác nhận** hoặc cứ để em làm rồi tự kiểm: em sẽ cho app **hiện kg lý thuyết
> cạnh kg hoá đơn**, nên ngay lô nhập đầu tiên anh sẽ thấy nó khớp hay lệch mười lần.
> Đó là cách kiểm rẻ nhất, không cần tranh luận.

Bảng trọng lượng anh gửi em đã lưu (40 dòng). **28 dòng khớp được mã nhôm**; 12 dòng còn lại
là ray / lá đáy / lá yếm / thanh đáy:

```
TD325 · TD326 · TD327 · A282 · TD-TG-ALD · RHM8 · RHU100
TD87A1 · RHM8(2.4MM) · CQ-VM111 · TDU26 · AL-YST
```

> **Cần anh cho:** 12 mã trên tương ứng mã hàng nào trong app (hoặc chúng là mã riêng, cần
> tạo mới trong danh mục vật tư).

### 4.3 — Bảng giá NCC theo ngày

Bảng `GIÁ 2026` anh gửi có hình dạng rất rõ: **đ/kg, đổi theo ngày, chia 5 loại hàng**.

| Loại hàng | 11/12/2025 | 11/03 | 08/04 | 07/05 | 25/06 | 01/07 | 13/07 |
|---|---|---|---|---|---|---|---|
| THÔ | 96.000 | 106.000 | 109.000 | 108.000 | 105.000 | 103.000 | 98.000 |
| MÀU – chưa dập | 103.000 | 113.000 | 116.000 | 115.000 | 112.000 | 110.000 | 105.000 |
| MÀU – đã dập | 104.000 | 114.000 | 117.000 | 116.000 | 113.000 | 111.000 | 106.000 |
| RAY MÀU | 105.000 | 115.000 | 118.000 | 117.000 | 114.000 | 112.000 | 107.000 |
| RAY THÔ | 98.000 | 108.000 | 111.000 | 110.000 | 107.000 | 105.000 | 100.000 |

Nền tảng đã có sẵn `Bảng giá` + `Chính sách giá` có **hiệu lực từ/đến**, nạp thẳng vào được.

> **Cần anh cho:** mã nhôm nào thuộc loại nào. Ví dụ `AL548N` là "MÀU – đã dập" hay
> "MÀU – chưa dập"? Hay cùng một mã có thể mua ở cả 3 dạng (thô / màu chưa dập / màu đã dập)
> tuỳ lần mua?
>
> Nếu là vế sau thì **"thô" và "màu" phải là hai trạng thái tồn kho khác nhau** của cùng một
> mã — và đó chính là chỗ nối với công đoạn sơn ở mục 3.3.

### 4.4 — Công nợ phải trả chưa có

App hiện chỉ có **công nợ phải thu** (khách nợ mình). Chưa có phía **phải trả** (mình nợ NCC).

> **Cần anh cho biết:** có cần theo dõi công nợ NCC trong app không, hay kế toán đang làm
> ngoài? Nếu cần thì thanh toán NCC thường theo hình thức nào (tiền mặt / chuyển khoản /
> gối đầu bao nhiêu ngày)?

---

## 5. Những thứ khác chưa làm

| Việc | Trạng thái | Cần gì |
|---|---|---|
| **Bảo hành** | ⛔ | File có sheet `DS BẢO HÀNH`. Cần biết: bảo hành bao lâu, theo bộ cửa hay theo đơn, ai tiếp nhận, quy trình xử lý |
| **Đổ dữ liệu sang Google Sheet** | ⛔ | Chờ **khoá service account** của Google. Anh tạo ở console rồi gửi file JSON |
| **Lắp đặt / đội lắp** | 🟡 | Phiếu xuất kho có ô đội lắp + ngày lắp, đã có báo cáo theo đội. Chưa có lịch lắp đặt |
| **Vận chuyển** | 🟡 | Phiếu xuất có ô lái xe + biển số. Chưa có gì hơn |
| **Nhiều đơn vị tính (CÂY/BỘ/SỢI)** | ⛔ | Hiện ĐVT chỉ là **cái nhãn** — máy không quy đổi. Ray mua theo cây, dùng theo mét thì cần khai "1 cây = mấy mét" |
| **Hai kho (Xưởng 1 / Xưởng 2)** | 🟡 | Chọn kho đã chạy. Nhưng 1.256 lô nhôm hiện **đang để hết ở Kho 1** vì file tồn không có cột kho |

> **Cần anh cho biết:** tồn nhôm thực tế chia thế nào giữa Xưởng 1 và Xưởng 2? Hay để hết
> một chỗ rồi chuyển kho bằng phiếu khi cần?

---

## 6. Dữ liệu rác cần dọn

Trên `alu.kairo.vn` hiện có dữ liệu thử của em trong quá trình kiểm:

| Bảng | Số bản ghi | Xử lý đề xuất |
|---|---|---|
| Đơn hàng, Phiếu xuất, Hoá đơn, Phiếu thu | ~140 | **Xoá hết** |
| Kho | 45 (hầu hết tên kiểu `Kho nhôm 19697`) | Xoá rác, giữ Xưởng 1 + Xưởng 2 |
| Khách hàng | 35 | Xoá rác |
| Hàng hoá | 59 | Giữ **17 mã nhôm thật**, xoá phần còn lại |
| Công ty | 3 (`ALUMDOOR`, `Sáu Hồng`, `Xưởng`) | Giữ **ALUMDOOR**, xoá 2 cái kia |
| **Lô nhôm tồn** | **1.256** | ⚠️ **GIỮ NGUYÊN** — đây là dữ liệu thật |

> Anh gật một tiếng là em dọn. Xoá không hoàn lại được nên em không tự làm.

---

## 7. Tóm tắt: 9 thứ cần anh bổ sung

Xếp theo mức độ chặn việc — **1, 2 và 3 đang chặn nhiều nhất**:

1. **Định mức một bộ cửa** — ray, mô tơ, trục, phụ kiện hết bao nhiêu (lá thì em tính được rồi)
2. **Giá bán TÁCH MÓN** — lá rời tính theo lá / mét / kg? có đắt hơn giá trong trọn bộ không?
   (mục 3.1b — đây là chỗ em không đoán được, đoán sai là sai tiền)
3. **12 mã ray / lá đáy / thanh đáy** ứng với mã hàng nào trong app
4. **Mã nhôm nào thuộc loại giá nào** (THÔ / MÀU chưa dập / MÀU đã dập / RAY)
5. **Bảng giá bán m²** — và "tùy trường hợp" là tùy theo cái gì
6. **Công đoạn sơn** — làm ở đâu, có phiếu không, "dập" là gì
7. **Định mức giờ + số người mỗi tổ** (cho lịch sản xuất / tăng ca)
8. **Bảng chọn mô tơ** theo kích thước hoặc cân nặng cửa
9. **Khoá Google service account** (cho phần đổ Sheet)

Ngoài ra ba câu hỏi ngắn:
- đơn vị trọng lượng là **kg/mét dài** phải không (mục 4.2)
- có kiểu **"trọn bộ nhưng bỏ bớt món"** không, và trừ tiền thế nào (mục 3.1b)
- tồn nhôm chia hai kho thế nào (mục 5)

---

## Phụ lục — những gì đã chứng minh chạy trên tenant thật

Chạy lại bất cứ lúc nào:

```bash
FORGE_ADMIN_PASSWORD=… node scripts/verify-alumdoor.mjs --origin https://alu.kairo.vn
```

Phép thử này đọc **SỔ** (sổ kho, sổ công nợ), không đọc chứng từ — vì một chứng từ ghi thành
công vẫn có thể chẳng động vào sổ nào, và đó đúng là kiểu hỏng im lặng nguy hiểm nhất.

Hiện bao gồm: nhập kho · đơn hàng · xuất kho trừ tồn · chặn xuất quá tồn · chặn xuất quá đơn ·
hoá đơn lên công nợ · phiếu thu trừ nợ · đề xuất cắt · cắt thật · cắt từ nhiều lô ·
từ chối khi thiếu nhôm · hoàn cắt · chặn hoàn hai lần · trả hàng · bảng giá server quyết ·
chặn thiếu giá · báo giá → đơn hàng · chặn chuyển hai lần.
