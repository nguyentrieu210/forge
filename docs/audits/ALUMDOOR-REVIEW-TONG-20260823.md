# ALUMDOOR — Review toàn hệ thống trên UI (23/08/2026)

Môi trường: `http://localhost:5173`, tenant local, `dev@example.com`.
Test thủ công bằng trình duyệt, đối chiếu `docs/ALUMDOOR-QUY-TRINH.md`,
`docs/sales/SALES_GOLDEN_FLOW_AND_TEST_PLAN.md`, `docs/ALUMDOOR-MUA-HANG-HDSD.md`.

Bản này gộp 4 đợt test: **Bán hàng · Mua hàng · QR chấm công · Kho / Sản xuất / Công nợ / Quỹ**.
Ba báo cáo chi tiết trước đó vẫn nằm cạnh file này trong `docs/audits/`.

---

## 0. Hai điều phải đọc trước

**a) Tenant đang bị nhiều tiến trình cùng ghi.** Trong lúc em test, số chứng từ nhảy quãng
(`HD-2026-0008 → 0010 → 0013`, mất 0009/0011/0012) và xuất hiện `HD-2026-0013` lúc 20:07 mà em
không tạo. Cùng lúc đó, nút trên màn Đơn hàng đổi từ *Sản xuất · In · Đóng* thành
*Sản xuất · **Xuất kho** · **Huỷ duyệt để sửa** · In · Đóng* — đúng phần code đang dở trong
working tree. Nghĩa là **có người/agent khác sửa repo và ghi dữ liệu song song với em**. Vài
quan sát dưới đây có thể đã bị dữ liệu đổi giữa chừng; chỗ nào em còn nghi, em ghi rõ.

**b) Đính chính một kết luận cũ của em.** Trong báo cáo Bán hàng em viết *"hoá đơn tạo từ đơn
hàng đánh rơi VAT"*. **Sai một nửa.** Đọc lại cả hai hoá đơn cùng sinh từ `DH-2026-0001`:

| Hoá đơn | `taxes` | grand_total | docstatus |
|---|---|---|---|
| `HD-2026-0010` | `[]` | 2.360.000 (thiếu 188.800) | 0 — nháp |
| `HD-2026-0013` | `[{VAT, On Net Total, 8%, 188.800}]` | 2.548.800 ✓ | 2 — đã huỷ |

Cùng đơn nguồn, cùng endpoint `invoice_from_order`, **hai lần chạy ra hai kết quả khác nhau**.
Vậy đúng hơn phải nói: *hoá đơn **có lúc** không sinh dòng thuế* — lỗi không xác định, khó bắt
hơn và nguy hiểm hơn lỗi luôn-sai.

---

## 1. Xếp theo mức ưu tiên

### P0 — sổ không khớp chứng từ (mất tiền, mất hàng, không ai kêu)

| # | Lỗi | Bằng chứng |
|---|---|---|
| 1 | **Nhập kho ghi sổ nhưng sổ kho rỗng** | 7 `Purchase Receipt` `docstatus=1`, mỗi phiếu 100 Kg `RT_RAYHOP` vào `Kho xưởng` = 700 Kg. Báo cáo **Xuất nhập tồn: 0 dòng**. **Sổ chi tiết kho: 0 dòng**. Bộ lọc kho `selection: {}` — không phải do lọc |
| 2 | **Phiếu thu ghi sổ nhưng không trừ nợ, không lên sổ quỹ** | `PT-2026-0015` thu 9.180.000 của CỬA CUỐN MINH ĐỨC, `docstatus=1`. Báo cáo **Công nợ theo khách hàng** vẫn ghi khách đó nợ **9.180.000**. **Lưu chuyển tiền tệ: 0 dòng** |
| 3 | **Công nợ cộng cả hoá đơn nháp** | `HD-2026-0010` `docstatus=0`, `outstanding_amount=0`, nhưng báo cáo công nợ ghi ANH MINH TUẤN nợ **2.360.000** — nợ ảo |
| 4 | **Hoá đơn có lúc rơi mất dòng VAT** | §0b |

Ba lỗi đầu là đúng thứ mà `ALUMDOOR-QUY-TRINH.md` phụ lục cảnh báo:
> *"chứng từ ghi thành công vẫn có thể chẳng động vào sổ nào, và đó là kiểu hỏng im lặng nguy hiểm nhất."*

Hệ quả dây chuyền: mọi con số 0 trên bảng tổng quan Mua hàng, lỗi
`Insufficient stock for CDL_DLM_1LY in K36` khi giao hàng, và báo cáo Đơn mua chưa nhận đủ sai
— đều là bóng của lỗi #1.

### P1 — luồng chính đứt

| # | Lỗi | Bằng chứng |
|---|---|---|
| 5 | **Không đặt mua được nhôm cây** | `Dòng 1 (NHOM_AL71): hệ số quy đổi phải là 0.3570408454727221 theo Item, không nhập tuỳ ý trên chứng từ.` Item khai `1 Kg = 1 Cây` kèm ghi chú tự thú *"CHƯA CÂN, SỐ NÀY SAI"*. HDSD §2 nói *"Hệ số trên dòng luôn thắng bảng"* — server làm ngược |
| 6 | **Không tạo được báo giá cho cửa trọn bộ** | Đơn hàng giải giá qua variant `TRON_BO` → 540.000 đ/m² chạy tốt; báo giá giải qua `STANDARD` → `Item Price ... does not exist for variant STANDARD`. Vi phạm INV-01, chặn cả GF-01→GF-08 |
| 7 | **Không phát được lệnh sản xuất từ đơn** | `Đơn hàng → Sản xuất` với `DH-2026-0003` → **`Cao lưới phải lớn hơn 0.`** Màn bán hàng không bắt buộc ô Cao lưới nên đơn ghi sổ được; khâu sản xuất mới chặn |
| 8 | **Không thu hồi được QR chấm công** | `rotate_station_qr` → `417: Field is server-controlled: secret_version`. Doctype khai `serverEnforced: true`, mà hàm rotate lại ghi bằng `action:"save"` → trường tự chặn con đường duy nhất được phép ghi nó |
| 9 | **Không lưu được cấu hình HR Lite** | `App alumdoor returned 422`; payload gửi `"company": ""` dù `<select>` có `value="ALUMDOOR"` — state React khởi tạo rỗng, `onChange` chưa chạy. Chạm vào dropdown là lưu được |
| 10 | **Chiết khấu ngoài chuẩn vẫn ghi sổ** | UI báo *"cần duyệt"* nhưng đơn ra `docstatus=1`; `Sales Order` không có trường approval nào. Vi phạm PA-14 — **đã sửa, xem §3** |

### P2 — chặn muộn, thiếu lối vào, sai hiển thị

| # | Lỗi |
|---|---|
| 11 | `received_percentage`: document trả `100.00`, list-view trả `0.00` → cột "Đã nhận (%)" và báo cáo *Đơn mua chưa nhận đủ* liệt kê cả 7 đơn đã nhận đủ |
| 12 | Thiếu nút **"Đơn mua → Phiếu nhập"** và nút **In** trên đơn mua đã ghi sổ (chỉ có Đóng · Tính lại) |
| 13 | Nút **"Sản xuất"** trên đơn bán chỉ mở danh sách Yêu cầu sản xuất đã lọc — rỗng, không có nút tạo |
| 14 | Đơn bán ghi sổ được khi dòng **chưa có Kho xuất**; tới màn giao hàng mới chặn |
| 15 | Menu Mua hàng chỉ 3/8 chứng từ; `Material Request`, `Request for Quotation`, `Supplier Quotation`, `Purchase Invoice`, `Debit Note` đều tồn tại nhưng không có lối vào. Báo cáo 2/6 |
| 16 | Màn **QR trạm chấm công** không có trên menu Nhân sự (phải gõ URL `/x/alumdoor-attendance:kiosk`); không có danh sách trạm — chỉ nhớ 1 trạm trong `localStorage` |
| 17 | KPI Tổng quan Mua hàng quy mọi thứ ra **"cây"** → mặt hàng mua theo Kg luôn ra 0, mà trạng thái vẫn xanh "Đã giao đủ" |
| 18 | Danh sách Kho có `K36`, `Kho đầu thừa`, `Kho xưởng` — **thiếu `K12`** so với chuẩn kho mục 0.1 |
| 19 | Báo cáo *Đơn mua chưa nhận đủ* **không có cột mã đơn** — 7 dòng giống hệt nhau |
| 20 | Lỗi lộ raw tiếng Anh ra người dùng: `HTTP 417: Insufficient stock…`, `Valid till is required`, `App alumdoor returned 422`, `Field is server-controlled: secret_version` |
| 21 | Bảng preview `Đơn hàng → Hoá đơn` toàn tiếng Anh, tiêu đề ghi nhầm **"Dòng phiếu nhập sẽ tạo"** (đang tạo hoá đơn bán) |
| 22 | `Tạo hoá đơn nháp` treo ~40 s rồi tự reload trang, không báo gì |
| 23 | Console error `Each child in a list should have a unique "key" prop` — `AlumdoorPurchaseOrderItemsGrid.tsx:199` |
| 24 | Thiếu ô **Sai số GPS tối đa** trên màn QR (doctype đã có `max_gps_accuracy_m`). Đo tại chỗ: trình duyệt máy tính trả toạ độ sai số **113 m** > bán kính 50 m |
| 25 | `window.confirm` / `window.print` ở màn QR (`AlumdoorAttendanceOperations.tsx:215`) — cả app còn lại dùng Dialog component |

---

## 2. Chỗ làm tốt, nên giữ nguyên

- **Panel "VÌ SAO RA CON SỐ NÀY"** trên dòng bán hàng: dòng giá, bậc diện tích, công thức cửa,
  rộng cắt lá, diễn giải phép tính, ghi chú giá. Gần như đã là bằng chứng mà PA-15 đòi.
- **Panel "CÒN THIẾU ĐỂ CHỐT ĐƯỢC DÒNG NÀY"**: nói đúng thiếu gì *và sửa ở đâu*.
- **Barem nhôm chính xác tuyệt đối**: `7,2 × 0,389 × 200 = 560,16 kg`, `× 62.000 = 34.729.920 đ`.
- **Giá bậc diện tích đúng cả ở biên**: 9 m² rơi đúng bậc `DT-8-9M2`; 8,96 và 17,92 m² đều đúng tiền.
- **Client không áp được giá tay** khi đã chọn bảng giá (gõ 111.000 vào Đơn giá bị bỏ qua).
- **Fail-closed đúng chỗ**: thiếu Item Price thì báo lỗi, không fallback 0.
- **Màn Theo dõi giao hàng NCC** (4 tab, tách theo mã + chiều dài + màu + dập, "Kiểm tra cả chuyến")
  và **màn QR trạm** — cả hai giàu hơn tài liệu mô tả. Ở hai chỗ này tài liệu đang cũ hơn code.
- Bán theo mét / tồn theo kg có hệ số quy đổi thật (`Mét → Kg`, factor 1,419).

---

## 3. Ba chỗ em đã sửa trong màn Đơn hàng (đã verify chạy)

Hai file: `client/packages/vertical-alumdoor/src/AlumdoorMotorSuggestPanel.tsx` và
`.../sales-order-v2/AlumdoorSalesOrderWorkbenchComplete.tsx`.

1. **Số float thô** — thêm `measure()`, `vì cửa 8.959999999999999 m²` → `vì cửa 8,96 m²`.
2. **PA-14 gate duyệt** — `submitOrder()` chặn khi còn dòng cần duyệt; nút *Ghi sổ đơn* tự tắt
   kèm tooltip; badge đổi thành *"… cần duyệt — chưa ghi sổ được"*. **Lưu nháp vẫn giữ override**,
   đúng ranh giới hợp đồng nghiệm thu.
3. **Validate chỉ được chỗ sửa** — `validate()` trả `{message, focus}`, `persistDraft` cuộn tới
   và focus đúng ô. Dùng `setTimeout(160ms)` chứ không `rAF`, vì Radix Dialog + toast giành
   focus trong nhịp kế tiếp (đo được: `activeElement` thành `div[id^="radix-"]`).

Đã verify từng cái trên trình duyệt. `tsc` cú pháp sạch. **Chưa commit** — file
`AlumdoorSalesOrderWorkbenchComplete.tsx` đang có sẵn thay đổi chưa commit của người khác
(khối *"Phiếu xuất kho còn hiệu lực"*, import `Lock/Truck/Undo2`), commit cả file là quét luôn
việc đang dở của họ. Working tree còn 3 file khác cũng đang sửa dở mà em không đụng.

Đính chính: em từng nói phải build `dist` thì sửa mới ăn — **sai**. Vite phục vụ
`vertical-alumdoor` thẳng từ `src` qua `/@fs/`. Build chỉ cần cho typecheck và production.

---

## 4. Chưa đánh giá được (không có dữ liệu)

| Phân hệ | Trạng thái |
|---|---|
| Bảo hành | `Warranty Claim` = 0 bản ghi |
| Vòng đời nhân sự · Chấm công | `Employee` = **0** — nên "Công hôm nay" luôn trống |
| Sản xuất | `Work Order` = 0, `Production Request` = 0, `BOM` doctype 404 |
| Kiểm kê kho | `Stock Reconciliation` = 0 |
| Giữ chỗ tồn | 0 bản ghi — màn và báo cáo *đã có đúng mô hình* (mã · màu · **khổ tối thiểu** · số lá, cột Tổng/Đã giữ/Khả dụng) nhưng ghi sổ đơn hàng không sinh giữ chỗ nào. Câu hỏi mục 5.4 *"giữ chỗ từ lúc nào"* vẫn treo |

---

## 5. Thứ tự em đề nghị làm

1. **#1 và #2** — sổ kho và sổ quỹ. Mọi báo cáo tồn kho, công nợ, mua hàng đều đang nói dối vì
   hai lỗi này. Sửa xong thì #11, #17 và một phần #3 tự hết.
2. **#3, #4** — nợ ảo từ hoá đơn nháp, và dòng VAT lúc có lúc không. Đây là tiền.
3. **#5, #6, #7** — ba mắt xích đứt: mua nhôm, báo giá cửa, phát lệnh sản xuất.
4. **#9 rồi #8** — sửa `company` rỗng trước (1 dòng), rồi mở đường ghi `secret_version`.
5. **#14, #7** cùng gốc: bổ sung ràng buộc ở màn bán hàng cho những ô mà khâu sau bắt buộc
   (Kho xuất, Cao lưới) — chặn sớm thay vì chặn muộn.
6. Còn lại là i18n, lối vào menu, và nhãn đơn vị.

## Phụ lục — chứng từ test còn lại trên tenant

`DH-2026-0002`, `DH-2026-0003`, `HD-2026-0010` (nháp), `BG-2026-0005`, trạm QR `ST-C258FB2048`.
Nên dọn trước khi tin lại các con số.
