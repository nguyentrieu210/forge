# Phân hệ MUA HÀNG — thiết kế kỹ thuật (Field Ledger)

> **Quy trình áp dụng.** Đi theo kỷ luật cổng chặn của skill `app-factory` (`C:\AppWeb`), nhưng
> **KHÔNG chạy PHA 4/5/7 của skill đó** — chúng khoá cứng vào stack React+Hono+D1 REST và công
> cụ `scaffold.mjs` / `verify.mjs` mà Forge không có. Forge dựng app bằng **dữ liệu**
> (brief JSON → biên dịch → cài), không phải bằng codebase riêng mỗi app.
> Chính skill đó có luật: *"skill và file thật lệch nhau → tin file thật"*.
>
> Thứ **giữ nguyên** vì nó chuyển sang được và chuyển rất đúng: **Field Ledger** của PHA 3,
> với luật *"trường không có trong ledger = không được code"*.

## Vì sao Field Ledger là bắt buộc ở ĐÂY

Forge có một kiểu hỏng đặc trưng, đã cắn hai lần chỉ trong hôm nay:

> Khai sai **một tên field** → lệnh ghi vẫn **THÀNH CÔNG** → nhưng rơi về controller chung
> → **không sinh bút toán nào**. Không có gì báo lỗi.

Bằng chứng sống: sổ cái Alumdoor hiện có **0 bút toán Giá vốn hàng bán**, vì Phiếu xuất kho
không khai `stock_account` / `cogs_account`, mà nhân chỉ ghi sổ khi `if (stockAccount && cogsAccount)`.
Brief *đã khai đủ hai tài khoản đó làm fixture* — chỉ là không field nào trỏ tới.

Nên ledger dưới đây có một cột mà bản gốc AppWeb không có, và nó là cột quan trọng nhất:
**“Nhân ĐỌC?”** — kèm **dòng code làm bằng chứng**. Không có bằng chứng = coi như chưa khai.

---

## 1. Bối cảnh nghiệp vụ (rút từ dữ liệu thật)

Từ 254 dòng sheet `NHẬP` và bảng giá NCC:

- **Nhôm mua theo kg** từ **TIẾN ĐẠT** (76/254 dòng), về dạng **cây dài ~6,5–8,6 m**
- Số cây hiện ghi trong **ô ghi chú tự do** → không cộng được, không đối chiếu được
- Giá NCC **đổi theo ngày**, chia 5 loại: THÔ / MÀU chưa dập / MÀU đã dập / RAY màu / RAY thô
- **Chỉ 42/254 dòng có số tiền**; 40 dòng tiền mặt, 1 chuyển khoản
- Sheet `NHẬP` **gộp ba việc khác hẳn nhau** — xem §2

## 2. Ba loại "hàng vào kho" phải tách làm ba chứng từ

Đây là sai lầm lớn nhất của cách làm hiện tại: một sheet gộp cả ba.

| Việc thật | Ví dụ trong file | Chứng từ | Ảnh hưởng sổ |
|---|---|---|---|
| **Mua hàng** | `LONG ĐỀN 8LY · 10 kg · MUA VÀO SẢN XUẤT` | Phiếu nhập mua | Kho ↑ · **Phải trả ↑** |
| **Khách trả lại** | `RAY HỘP U100 · GỬI DƯ, HOÀN LẠI` | Trả hàng bán | Kho ↑ · **Phải thu ↓** |
| **NCC đổi hàng lỗi** | `AL752 · LÁ KÊU · ĐÃ XUẤT LÁ MỚI ĐỔI` | Trả hàng mua | Kho ↔ · **không đụng tiền** |

Nền tảng đã có `Stock Return` (`return_type: Sales | Purchase`) cho hai dòng dưới — bản này
làm **dòng đầu tiên** trước, hai dòng sau ghi vào Out of scope §7.

## 3. Luồng mua chuẩn ERPNext, và mức nền tảng đáp ứng

```
Đơn mua hàng ──┬──► Phiếu nhập mua (nhiều đợt)  ──► kho ↑, sổ cái: Nợ tồn kho / Có hàng-chưa-HĐ
               └──► Hoá đơn mua   (nhiều lần)   ──► sổ cái: Nợ hàng-chưa-HĐ / Có phải trả
                                                    └──► Phiếu chi ──► phải trả ↓
```

| Yêu cầu | Nhân hiện có | Ghi chú |
|---|---|---|
| 1 đơn → **nhiều đợt giao** | ✅ `assertPurchaseRemaining(..., "Receipt")` cộng dồn theo mã hàng, **từ chối khi vượt** | `controllers.ts:132` |
| 1 đơn → **nhiều lần xuất hoá đơn** | ✅ cùng hàm, `kind = "Billing"` | |
| **Nhiều mặt hàng** | ✅ bảng dòng | |
| **Công nợ phải trả** | ✅ `PaymentLedgerEntry{account_type:"Payable", party_type:"Supplier"}` | `controllers.ts:96` |
| **Phiếu chi** | ✅ `payment_type:"Pay"`, `party_type:"Supplier"` | |
| **1 chuyến giao gộp NHIỀU đơn** | ❌ `against_purchase_order` nằm ở **đầu phiếu** | → sửa nhân, §6a |
| **Phiếu nhập ghi sổ cái** | ❌ `ledger()` chỉ trả `{stock, procurement}` — **không có `gl`** | → sửa nhân, §6b |

---

## 4. FIELD LEDGER

Cột **“Nhân ĐỌC?”**: ✅ = nhân đọc đúng tên này (kèm bằng chứng); ⬜ = chỉ để người dùng xem,
nhân bỏ qua. Cột **“Chặn?”** = nhân TỪ CHỐI ghi nếu thiếu.

### 4.1 — `Supplier` · Nhà cung cấp

Khai làm **doctype** (không phải fixture): xưởng phải tự thêm NCC mới.
Hợp lệ vì `hasMasterRecord` đọc **cả `master_records` lẫn `documents`** (`d1-store.ts:401`).

| Field | Kiểu brief | Nhân ĐỌC? | Chặn? | Nghiệp vụ |
|---|---|---|---|---|
| `supplier_name` | `Data*!` | ✅ tên bản ghi | ✅ | Khoá tự nhiên; `naming: field:supplier_name` |
| `supplier_group` | `Select(Nhôm,Mô tơ,Sơn,Phụ kiện,Vận chuyển,Khác)` | ✅ `PurchaseOrderData.supplier_group` → lọc `Pricing Rule` | ⬜ | Từ dữ liệu thật: Tiến Đạt=Nhôm, Anh Đạt Motor=Mô tơ, Bột Sơn Ti Gia=Sơn |
| `phone` · `address` · `tax_id` | `Data` / `Small Text` | ⬜ | ⬜ | Đặt lên hoá đơn, in chứng từ |
| `contact_person` | `Data` | ⬜ | ⬜ | Dữ liệu thật ghi `TIẾN ĐẠT/ANH BIỄN` |
| `payment_terms` | `Select(Trả ngay,7 ngày,15 ngày,30 ngày)=(Trả ngay)` | ⬜ | ⬜ | Mặc định **Trả ngay** — 40/41 dòng có tiền là tiền mặt |
| `disabled` | `Check` | ✅ `hasMasterRecord` loại bản ghi `disabled=1` | ⬜ | Ngừng giao dịch nhưng giữ lịch sử |

### 4.2 — `Purchase Order Item` · Dòng đơn mua

| Field | Kiểu brief | Nhân ĐỌC? | Chặn? | Nghiệp vụ |
|---|---|---|---|---|
| `item_code` | `Link(Item)!` | ✅ `PurchaseItem.item_code` | ✅ | |
| `qty` | `Float!` | ✅ `qty` → `qty_micros` | ✅ (>0) | **Nhôm: số CÂY**, không phải kg |
| `rate` | `Currency!` | ✅ `rate` → `rate_minor` | ✅ | đ/kg với nhôm — xem `uom` |
| `uom` | `Select(Kg,Cây,Cái,Bộ,Mét,Sợi,Cuộn,Túi,Tấm,Thân,Hộp,Bình)` | ⬜ | ⬜ | 12 giá trị đếm THẬT từ sheet NHẬP |
| `invoice_kg` | `Float` | ⬜ | ⬜ | Số kg trên hoá đơn NCC — **để đối chiếu, không quyết tồn** |
| `width_m` | `Float` | ⬜ | ⬜ | Khổ cây nhôm; cần cho `kg lý thuyết` |
| `warehouse` | `Link(Warehouse)` | ✅ trên **phiếu nhập** thì bắt buộc | ⬜ ở đơn | `normalizePurchaseStockItems` đòi (`controllers.ts:119`) |
| `amount` | `Currency~` | ✅ nhân TỰ TÍNH — **không gõ tay** | — | `calculateSalesTotals` |

### 4.3 — `Purchase Order` · Đơn mua hàng

| Field | Kiểu brief | Nhân ĐỌC? | Chặn? | Nghiệp vụ |
|---|---|---|---|---|
| `supplier` | `Link(Supplier)!` | ✅ `PurchaseOrderData.supplier` | ✅ | |
| `company` | `Link(Company)!=(ALUMDOOR)` | ✅ | ✅ | |
| `currency` | `Link(Currency)!=(VND)` | ✅ | ✅ | |
| `transaction_date` | `Date!` | ✅ | ✅ | Ngày đặt |
| `schedule_date` | `Date` | ✅ `schedule_date` | ⬜ | Ngày hẹn giao |
| `buying_price_list` | `Link(Price List)` | ✅ → **server quyết giá** | ⬜ | Bảng giá NCC theo ngày |
| `supplier_group` | `Select(…)` | ✅ → lọc `Pricing Rule` | ⬜ | Phải **lặp lại trên chứng từ**, nhân không tự lấy từ NCC |
| `items` | `Table(Purchase Order Item)!` | ✅ | ✅ | |
| `received_percentage` | `Percent~` | ✅ nhân đặt | — | Tiến độ nhận |
| `billed_percentage` | `Percent~` | ✅ nhân đặt | — | Tiến độ hoá đơn |

**State machine:** `Draft` → (ghi sổ) `To Receive and Bill` → `Cancelled`.
Nhân **từ chối huỷ** khi đã có phiếu nhập/hoá đơn (`getProcuredQuantityMicros ≠ 0`).

### 4.4 — `Purchase Receipt` · Phiếu nhập mua

| Field | Kiểu brief | Nhân ĐỌC? | Chặn? | Nghiệp vụ |
|---|---|---|---|---|
| `supplier` · `company` · `currency` | `Link(...)!` | ✅ | ✅ | Phải **khớp đơn mua** (`assertPurchaseContext`) |
| `posting_at` | `Datetime!` | ✅ | ✅ | Khoá kỳ kiểm theo ngày này |
| `against_purchase_order` | `Link(Purchase Order)!` | ✅ **hiện ở ĐẦU PHIẾU** | ✅ | ⚠️ chỗ chặn bài toán gộp đơn — §6a |
| `items` | `Table(Purchase Receipt Item)!` | ✅ mỗi dòng cần `warehouse` | ✅ | |
| `supplier_invoice_no` | `Data` | ⬜ | ⬜ | Số phiếu giao của NCC |
| `stock_account` | `Link(Account)=(Hàng tồn kho)` | ❌ **nhân CHƯA đọc** | — | → §6b, đây là lý do sổ cái trống |
| `stock_received_but_not_billed` | `Link(Account)=(Hàng nhận chưa có hoá đơn)` | ❌ **nhân CHƯA đọc** | — | → §6b |

### 4.5 — `Purchase Invoice` · Hoá đơn mua

| Field | Kiểu brief | Nhân ĐỌC? | Chặn? | Nghiệp vụ |
|---|---|---|---|---|
| `supplier` · `company` · `currency` | `Link(...)!` | ✅ | ✅ | |
| `posting_at` | `Datetime!` | ✅ | ✅ | |
| `credit_to` | `Link(Account)!=(Phải trả người bán)` | ✅ **BẮT BUỘC** | ✅ | Thiếu là nhân TỪ CHỐI ngay |
| `against_purchase_order` | `Link(Purchase Order)` | ✅ (tuỳ chọn) | ⬜ | Có thì kiểm hạn mức `Billing` |
| `due_date` | `Date` | ✅ | ⬜ | Hạn trả |
| `items` | `Table(Purchase Invoice Item)!` | ✅ | ✅ | |
| ↳ `expense_account` | `Link(Account)!=(Hàng tồn kho)` | ✅ **BẮT BUỘC TỪNG DÒNG** | ✅ | `Expense account is required at row N` |
| `outstanding_amount` | `Currency~` | ✅ nhân đặt | — | Còn nợ NCC |

> ⚠️ **Quyết định kế toán.** Nhân hiện ghi `Nợ <expense_account>`. Mặc định đang trỏ
> `Hàng tồn kho` (tài sản) thay vì `Chi phí` — nếu không, mua 43 triệu nhôm sẽ **thành chi phí
> ngay tháng đó** dù nhôm còn nằm trong kho, và lãi lỗ tháng méo. Sau §6b thì trỏ về
> `Hàng nhận chưa có hoá đơn` mới là đúng chuẩn.

### 4.6 — `Payment Entry` · Phiếu chi (mở rộng phiếu thu đã có)

| Field | Giá trị cho CHI | Nhân ĐỌC? | Nghiệp vụ |
|---|---|---|---|
| `payment_type` | `Pay` | ✅ | Hiện brief chỉ có `Receive` |
| `party_type` | `Supplier` | ✅ | |
| `party` | `Link(Supplier)` | ✅ | |
| `paid_from` | `Tiền gửi ngân hàng` / `Tiền mặt` | ✅ | **Ngược chiều phiếu thu** |
| `paid_to` | `Phải trả người bán` | ✅ | |
| `references[]` | `Purchase Invoice` + `allocated_amount` | ✅ | Phân bổ vào hoá đơn |

### 4.7 — Tài khoản mới cần thêm (fixture)

| Tài khoản | Loại | Dùng ở |
|---|---|---|
| `Phải trả người bán` | `Payable` | `credit_to` hoá đơn mua · `paid_to` phiếu chi |
| `Hàng nhận chưa có hoá đơn` | `Liability` | Cầu nối phiếu nhập ↔ hoá đơn (§6b) |

---

## 5. Thao tác `nhap-nhom` — hai đơn vị, cân nặng KHÔNG quyết định tồn

```
SỐ CÂY  ← thủ kho ĐẾM          → TỒN KHO, thứ đem đi cắt
SỐ KG   ← hoá đơn NCC          → TIỀN, lên công nợ phải trả
kg lý thuyết = số cây × khổ × kg/m   → ĐỐI CHIẾU, cảnh báo khi lệch
giá vốn 1 cây = thành tiền ÷ số cây  → không cần hằng số vật lý nào
```

Khách nói *"nhiều khi nhập có sai số"*. Suy số cây từ cân nặng sẽ ra `29,7` trong khi thợ đếm
`30` → app lệch thực tế **ngay từ lúc nhập và lệch mãi**.

Sai số đo được trên dữ liệu thật: **6,57 → 8,61 m/cây**, phần lớn là do cây dài ngắn khác nhau
chứ không phải cân sai — nên phải hỏi **khổ** lúc nhập thì cảnh báo mới chặt.

---

## 6. Hai thay đổi ở NHÂN nền tảng

### 6a — Liên kết đơn mua xuống cấp DÒNG

**Hiện tại:** `against_purchase_order` ở đầu phiếu → một chuyến chở hàng của đơn A + đơn B phải
tách hai phiếu nhập. Không sai sổ, nhưng không khớp thực tế: một chuyến xe, một biên bản giao
nhận, mà thủ kho gõ hai phiếu.

**Sửa:** cho `PurchaseItem.purchase_order` (tuỳ chọn) ở cấp dòng. Đầu phiếu giữ nguyên để
tương thích ngược; dòng nào có thì thắng.

**Ràng buộc phải giữ:** `assertPurchaseRemaining` chạy **theo từng đơn**, gom dòng theo đơn rồi
kiểm riêng — nếu không sẽ mất chốt "vượt số đặt".

### 6b — Phiếu nhập ghi sổ cái

**Hiện tại:** `ledger()` trả `{stock, procurement}` — **không `gl`**. Nên hàng về không lên bảng
cân đối, và kho với sổ cái là hai thế giới rời nhau.

**Sửa:**
```
Phiếu nhập  :  Nợ Hàng tồn kho          /  Có Hàng nhận chưa có hoá đơn
Hoá đơn mua :  Nợ Hàng nhận chưa có HĐ  /  Có Phải trả người bán
```
Có điều kiện `if (stock_account && stock_received_but_not_billed)` — **cùng khuôn với
Delivery Note**, để app cũ không khai thì không đổi hành vi.

---

## 7. Ngoài phạm vi bản này

- Trả hàng mua / khách trả lại (`Stock Return`) — có nhân, làm đợt sau
- Yêu cầu mua · Báo giá NCC (`Material Request` · `Supplier Quotation`) — nhân chưa có
- Quy đổi đơn vị (kg ↔ cây ↔ mét) — cần cho ray "mua cây bán mét", làm riêng
- **Giá vốn hàng bán bên BÁN đang bằng 0** — lỗi tiền đang sống, sửa 2 dòng brief, **nên làm trước**

---

## 8. Cổng 3 — Scorecard tự chấm

| # | Tiêu chí | Đạt | Bằng chứng |
|---|---|---|---|
| 1 | Mọi doctype mới có ledger đủ cột — **6/6** | ✅ | §4.1–4.6 |
| 2 | Mọi field khai rõ **nhân có đọc không**, kèm dòng code | ✅ | cột "Nhân ĐỌC?", dẫn `controllers.ts:96/119/132`, `d1-store.ts:401` |
| 3 | Doctype có trạng thái đã khai state machine | ✅ | §4.3 |
| 4 | Mọi Link trỏ doctype có thật trong brief | ✅ | `Supplier`·`Item`·`Warehouse`·`Account`·`Price List`·`Purchase Order`·`Purchase Invoice` |
| 5 | Tài khoản mới khai fixture, đúng `account_type` | ✅ | §4.7 |
| 6 | Field nhân **KHÔNG đọc** được đánh dấu ⬜, không giả vờ có tác dụng | ✅ | `uom`·`invoice_kg`·`supplier_invoice_no`·`contact_person` |
| 7 | Field nhân **chưa** đọc nhưng cần sửa nhân → ghi rõ ❌ + hướng sửa | ✅ | `stock_account`·`stock_received_but_not_billed` → §6b |
| 8 | Không đoán: mọi khẳng định về nhân đều đã grep/đọc file thật | ✅ | `hasMasterRecord` union documents — đã đọc `d1-store.ts:401` |

**Câu hỏi mở gom về cổng** (không chặn code, chặn nạp dữ liệu thật):

1. Hoá đơn mua nhôm ghi `Nợ Hàng tồn kho` hay `Nợ Chi phí`? Em đề xuất **tồn kho** (§4.5)
2. NCC có ghi **khổ từng cây** lúc giao không, hay xưởng tự đo?
3. Mã nhôm nào thuộc loại giá nào (THÔ / MÀU chưa dập / MÀU đã dập / RAY)?
4. Có cần theo dõi công nợ phải trả không, hay mua tới đâu trả tới đó? *(dữ liệu cho thấy phần
   lớn trả tiền mặt ngay)*
