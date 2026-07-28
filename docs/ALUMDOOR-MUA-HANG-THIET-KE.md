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
| `against_purchase_order` | `Link(Purchase Order)` | ✅ chỉ là **mặc định** cho dòng | ⬜ | Đã bỏ bắt buộc — §6a |
| ↳ `purchase_order` (trên DÒNG) | `Link(Purchase Order)` | ✅ `orderOf()` đọc dòng TRƯỚC, không có mới lấy đầu phiếu | ✅ (một trong hai) | Chỗ giải bài toán gộp đơn — §6a |
| `items` | `Table(Purchase Receipt Item)!` | ✅ mỗi dòng cần `warehouse` | ✅ | |
| `supplier_invoice_no` | `Data` | ⬜ | ⬜ | Số phiếu giao của NCC |
| `stock_account` | `Link(Account)=(Hàng tồn kho)` | ✅ `ledger()` ghi Nợ | — | §6b — đã sửa |
| `stock_received_but_not_billed` | `Link(Account)=(Hàng nhận chưa có hoá đơn)` | ✅ `ledger()` ghi Có | — | §6b — đã sửa |

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

## 7. Ngoài phạm vi ĐỢT 1 — **đã làm hết ở đợt 2, xem §9**

- ~~Trả hàng mua~~ → §9.4
- ~~Yêu cầu mua · Báo giá NCC~~ → §9.2
- ~~Quy đổi đơn vị (kg ↔ cây ↔ mét)~~ → §9.1
- ~~Giá vốn hàng bán bên BÁN đang bằng 0~~ → §9.5

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

---

# ĐỢT 2 — phần còn lại của phân hệ

Đợt 1 dựng chuỗi lõi (đơn mua → phiếu nhập → hoá đơn → phiếu chi). Đợt 2 làm nốt bốn thứ đã
ghi "ngoài phạm vi", cộng một lỗi tiền đang sống.

## 9.1 — QUY ĐỔI ĐƠN VỊ · thứ bắt buộc, và thứ dễ hỏng nhất

Ray mua theo **cây**, tồn và bán theo **mét** (165.000 đ/m). Nan nhôm mua theo **kg**, tính
theo **m²**. Không có quy đổi thì mua 20 cây ray thành *"tồn 20 mét"* — sai gần sáu lần, và
sai **lặng lẽ**: sổ vẫn cân, báo cáo vẫn ra số, chỉ có kho là không khớp thực tế.

    stock_qty = qty × conversion_factor

`qty` và `rate` giữ nguyên **đơn vị mua** — đó là thứ in trên hoá đơn NCC và là thứ người mua
đối chiếu. Chỉ **sổ kho** và **hạn mức đặt/nhận** chạy theo `stock_qty`.

### Ba quy tắc, theo đúng thứ tự (`clouderp-core/src/uom.ts`)

| # | Điều kiện | Hệ số | Vì sao |
|---|---|---|---|
| 1 | Dòng tự khai `conversion_factor` | dùng luôn | Cây nhôm không phải lúc nào cũng đúng 5,85 m |
| 2 | Không khai `uom`, hoặc `uom` = đơn vị tồn | `1` | Đường của **mọi dòng đang chạy hôm nay** → bật lên không lệch sổ cũ |
| 3 | Còn lại | tra `Item.uom_conversions` | Không có thì **TỪ CHỐI** |

Quy tắc 3 **từ chối** thay vì lặng lẽ lấy `1` là điểm chính của cả tính năng. Người dùng đã
nói rõ *"dòng này tính bằng đơn vị khác"* — lấy `1` lúc đó là ghi đè ý họ bằng một con số
bịa, và cái sai chỉ lộ ra khi kiểm kho vài tháng sau.

### Ba con số phải đúng CÙNG LÚC

| Con số | Công thức | Sai thì sao |
|---|---|---|
| Số lượng vào kho | `qty × cf` | Tồn sai gần 6× |
| Giá trị vào kho | `qty × rate` — **KHÔNG nhân cf** | Tồn kho phình so với tiền đã trả |
| Giá vốn 1 đơn vị tồn | `giá trị ÷ stock_qty` | `117 mét × giá-một-cây` |

### FIELD LEDGER — `UOM Conversion` (bảng con của `Item`)

| Field | Kiểu | Nhân ĐỌC? | Chặn? | Nghiệp vụ |
|---|---|---|---|---|
| `uom` | `Select(13 đơn vị)!` | ✅ `factorFromMaster()` so **đúng chuỗi này** | ✅ | Đơn vị giao dịch |
| `conversion_factor` | `Float!` | ✅ `> 0` mới nhận | ✅ | 1 cây = 5,85 mét |

> ⚠️ **Danh sách đơn vị phải GIỐNG HỆT nhau ở mọi nơi.** `Item.stock_uom` từng có
> `(m2,Bộ,Cái,Mét,Kg,Thanh)` còn dòng mua có `(Kg,Cây,Cái,…,Thân,…)`. Hai danh sách lệch nghĩa
> là `"Cây"` **vĩnh viễn không bao giờ bằng** `"Thanh"`, nên quy tắc 2 không bao giờ khớp và
> mọi dòng đều rơi xuống quy tắc 3. Nay dùng chung **một** danh sách 13 giá trị.

### Ba nơi cùng một luật — phải sửa cả ba

Đây là kiểu lỗi *"luật viết hai lần rồi trôi dạt"*, và test bắt được đúng nó:

| Nơi | Tệp | Đọc gì |
|---|---|---|
| Nhân (từ chối trước, thông báo đọc được) | `clouderp-core/src/controllers.ts` `assertPurchaseRemaining` | `stockQtyMicros()` |
| Kho lưu in-memory (test chạy trên đây) | `document-kernel/src/in-memory-store.ts` `assertProcurementInvariants` | `stock_qty_micros ?? qty_micros` |
| **Trigger SQLite — chốt thật lúc chạy** | `migrations/tenant/0023_purchase_stock_uom.sql` | `COALESCE(stock_qty_micros, qty_micros)` |

Chỉ sửa nhân thì SQLite vẫn `RAISE(ABORT)` ở tầng dưới, và người dùng nhận một mã lỗi không
đọc được. Test unit **đã fail đúng chỗ này** trước khi có migration 0023.

## 9.2 — YÊU CẦU VẬT TƯ → HỎI GIÁ → BÁO GIÁ NCC

Ba chứng từ **không ghi sổ nào cả**, và đó là đúng: chưa cam kết tiền, chưa động vào kho. Giá
trị nằm ở hai câu hỏi mà một đơn mua đứng một mình không trả lời được — *"ai yêu cầu cái
này"* và *"đã đặt mua đủ chưa"*.

| Doctype | Nhân canh gì | Thông báo khi vi phạm |
|---|---|---|
| `Material Request` | Đơn mua trỏ về **không được đặt quá số đã yêu cầu** | `exceeds Material Request …` |
| `Request for Quotation` | **Không mời trùng** một NCC hai lần | `Supplier X appears twice` |
| `Supplier Quotation` | NCC **không được mời** thì không gửi giá vào được | `was not invited to …` |

**Số đã đặt được ĐẾM LẠI từ chính các đơn mua đã ghi sổ**
(`sumSubmittedChildQuantityMicros`), không đọc một cột `%đã đặt` nào. Cột tổng hợp là thứ
trôi dạt khi có người sửa hay huỷ đơn; đếm lại từ chứng từ thì không.

Hạn mức này cũng chạy theo **đơn vị tồn**: yêu cầu 117 mét, đặt 20 cây → vừa đủ.

## 9.3 — Hai nút bấm (worker)

| Nút | Method | Điểm cần chú ý |
|---|---|---|
| Báo giá NCC → Đơn mua | `alumdoor.purchase.order_from_quotation` | **Bấm lại chỉ ra MỘT đơn** |
| Đơn mua → Phiếu nhập | `alumdoor.purchase.receipt_from_order` | Chỉ phần **CÒN LẠI**, và dừng ở **NHÁP** |

Tính bất biến của nút thứ nhất không phải để cho đẹp: bản **bán** đã hỏng đúng chỗ đó — thao
tác vượt hạn giờ, người dùng thấy *"hết giờ"* nên bấm lại, lần thứ hai tạo đơn thứ hai. Phía
mua thì đơn thứ hai nghĩa là NCC **giao gấp đôi** và **công nợ gấp đôi**. Chốt nằm ở câu hỏi
*"đã có đơn nào trỏ về báo giá này chưa"*, đúng ở mọi thời điểm kể cả khi lần trước chết giữa
chừng — **không** nằm ở một dấu ghi sau.

Nút thứ hai dừng ở **nháp**, cố ý: số trên đơn là số **ĐẶT**, số vào kho phải là số **ĐẾM
ĐƯỢC**. Hàng về thiếu vài cây là chuyện thường ngày; ghi sổ hộ thủ kho là đưa vào kho một con
số chưa ai nhìn thấy.

Số đã nhận rót vào các dòng **theo thứ tự, hết dòng này mới sang dòng sau** — vì một đơn có
thể có hai dòng cùng mã hàng (hai khổ, hai màu), mà sổ tiến độ chỉ đếm theo mã.

## 9.4 — TRẢ HÀNG NCC: hai nửa, hai chứng từ

| Chứng từ | Trả cái gì | Sổ nào động |
|---|---|---|
| `Stock Return` (`return_type: Purchase`) | **HÀNG** | Kho ↓ |
| `Debit Note` | **TIỀN** | Phải trả ↓ |

Tách ra là đúng chứ không phải rườm rà — hàng đi về trước, hoá đơn điều chỉnh của NCC về sau,
hệt như lúc nhập. Nhân **từ chối** trả quá số đã nhập, **từ chối** trả về kho khác kho đã
nhập, và **từ chối** giảm trừ vượt số còn nợ trên hoá đơn gốc.

Giá vốn xuất trả lấy theo **giá vốn thật đang có trong kho** (`deriveOutgoingValuation`),
không lấy giá trên phiếu nhập — nếu không, trả hàng thành chỗ nặn ra lãi.

## 9.5 — GIÁ VỐN HÀNG BÁN = 0 · lỗi tiền đang sống

Sổ cái có doanh thu, **không có giá vốn**, nên lãi gộp hiện đúng **100%** trên mọi báo cáo.
Sổ vẫn **CÂN** — đó là lý do nó sống được nhiều tháng mà không ai thấy.

Chỗ sửa **không** phải nơi tài liệu đợt 1 đoán. Phiếu xuất kho **không** đọc `stock_account` /
`cogs_account` trên chính nó. Nhân tra theo thứ tự:

    Item.inventory_account  →  Company.default_inventory_account
    Item.cogs_account       →  Company.default_cogs_account

`clouderp-selling/src/controllers.ts:232-235`, và chỉ ghi khi có **đủ cả hai**.

Khai hai field đó trên phiếu xuất — như bản thiết kế đợt 1 định làm — là khai một thứ **không
ai đọc**: đúng kiểu hỏng mà Field Ledger sinh ra để chặn. Chỗ đúng là **fixture Công ty**, hai
khoá, và đó là toàn bộ bản sửa.

## 9.6 — Scorecard đợt 2

| # | Tiêu chí | Đạt | Bằng chứng |
|---|---|---|---|
| 1 | Doctype mới có ledger đủ cột — **11/11** | ✅ | §9.1, brief `alumdoor.json` |
| 2 | Mọi field khai rõ nhân có đọc không | ✅ | cột "Nhân ĐỌC?" |
| 3 | Luật lặp ở nhiều tầng đã đồng bộ **cả ba** | ✅ | §9.1, bảng ba nơi |
| 4 | Không phá app đang chạy | ✅ | quy tắc 2 (hệ số 1) + `COALESCE` ở cả hai kho lưu |
| 5 | Khẳng định về nhân đều đã đọc file thật | ✅ | §9.5 — bản đoán ban đầu **SAI**, đã grep rồi sửa |
| 6 | Test bắt được lỗi thật, không chỉ xanh cho vui | ✅ | 11 unit; bản đầu **fail** ở trigger SQLite |
| 7 | Kiểm bằng SỔ, không bằng chứng từ | ✅ | `verify-alumdoor-mua.mjs` |
| 8 | Bản in cho khách/NCC có đủ | ✅ | 3 mẫu in mới |

## 9.7 — ẨN CÔNG TY VÀ TIỀN TỆ · và vì sao ẩn ≠ bỏ

Xưởng có **một** công ty và tiêu **một** loại tiền. Hai ô đó trên mọi chứng từ là hai ô luôn
đúng một giá trị: chúng chỉ làm form dài ra và bắt người nhập lướt qua thứ không bao giờ đổi.

Nhưng **nhân BẮT BUỘC cả hai** — bỏ field đi là mọi chứng từ bị từ chối. Nên phải là *ẩn*,
không phải *bỏ*: `blankDoc` gieo giá trị mặc định cho **mọi** field kể cả field ẩn, và
`serializeCreateDocument` gửi cả document chứ không chỉ ô đã chạm. Giá trị vẫn lên server
như thường, chỉ không hiện ra mắt.

Cả chuỗi `hidden` **đã có sẵn** từ trước — `validate.ts:132`, `toFrappeDocField`,
`resolver.ts:86`, `columns.ts`. Thiếu đúng **một** mắt xích: ngôn ngữ brief không nói được.
Nay có dấu `-`, cạnh `!` `*` `~`:

    company:Link(Company)-!=(ALUMDOOR) Công ty

### Hai chốt đi kèm, cả hai đều chặn một mâu thuẫn IM LẶNG

| Chốt | Nếu lọt thì sao |
|---|---|
| **ẩn + bắt buộc + không mặc định** → từ chối lúc biên dịch | Server từ chối vì thiếu giá trị, mà ô đang thiếu thì người dùng KHÔNG NHÌN THẤY để điền. Thông báo lỗi nêu tên một field không có trên màn hình. |
| **field ẩn khai làm cột `list`** → từ chối lúc biên dịch | Client lọc cột theo `hidden !== 1`: brief nói có cột, bảng không có cột, không gì báo. |

Chốt thứ hai bắt được ngay hai chỗ thật trong chính brief này — `Bảng giá` và
`Đơn giá theo bảng giá` đều đang liệt `currency` làm cột danh sách.

## 9.8 — ĐỌC ẢNH BẰNG AI · và ba thứ mô hình KHÔNG được phép quyết

NCC gửi bảng giá qua Zalo; thợ chụp phiếu giao lúc hàng về. Màn **Chụp ảnh → chứng từ mua**
đọc ảnh thành dòng hàng cho cả bốn chứng từ mua.

### Đường đi của tấm ảnh — và một lỗ hổng phải vá ở nền tảng

App Worker gọi ngược qua `/_app/…`, và cổng **rewrite thành `/api/…`** một cách cố ý, để app
chỉ chạm được bề mặt API chứ không phải đường bất kỳ trên tenant. Hệ quả: `/files/<id>` nằm
ngoài tầm với, nên app cầm `file_url` do ô đính kèm trả về mà **không có cách nào đọc**.

Thêm `forge.files.content`, dùng **đúng** chốt quyền của `serveFile` — file riêng tư được
kiểm lại theo chứng từ nó gắn vào, và danh tính là **người bấm nút**, không phải app. Viết
một chốt thứ hai lỏng hơn ở đây là trao cho mọi app quyền đọc mọi tệp đính kèm.

Cũng phải nới `ACTION_FIELDTYPES` cho `Attach Image`: màn thao tác vốn đã dùng chung registry
control với form và đã truyền `services`, nên không có gì mới phải dựng — chỉ là chưa được
phép.

### Ba thứ để cho LUẬT quyết, không cho mô hình

| Việc | Ai làm | Hỏng thế nào nếu để mô hình làm |
|---|---|---|
| **Đọc số** | `parseVietnameseNumber` | `98.000` là chín mươi tám nghìn, `3,5` là ba phẩy năm — cùng dấu chấm phẩy, hai nghĩa ngược. Sai là **sai tiền**, và sổ vẫn cân nên không gì kêu. |
| **Khớp mã hàng** | `matchItem`, ba tầng, tầng cuối chỉ nhận khi có **đúng một** ứng viên | Đoán ra mã không tồn tại thì nhân từ chối — ồn ào nhưng an toàn. Nguy hiểm là đoán trúng một mã **có thật nhưng SAI**: hàng vào nhầm mã, tồn lệch hai chiều, chứng từ trông hợp lệ. |
| **Dừng ở NHÁP** | `applyOcr` không bao giờ ghi sổ | Máy đọc ảnh là để khỏi **gõ**, không phải khỏi **nhìn**. |

Luật đọc số, viết ra để người sau khỏi phải suy lại:

| Ảnh viết | Đọc ra | Luật |
|---|---|---|
| `98.000` | 98000 | một dấu, theo sau **đúng ba** chữ số → phân nhóm |
| `1.234.567` | 1234567 | một loại dấu, lặp → phân nhóm |
| `3,5` · `5.85` | 3,5 · 5,85 | theo sau **ít hơn ba** chữ số → thập phân |
| `1.234,56` · `1,234.56` | 1234,56 | có **cả hai** dấu → dấu đứng **sau** là thập phân |
| `liên hệ` · `—` | `null` | **không** trả 0 — 0 là "miễn phí", `null` là "không biết" |

Chỗ mơ hồ còn lại: `1.500` đọc thành 1500, không phải 1,5. Với tiền luôn đúng; với hệ số quy
đổi thì không ai viết `1.500` để chỉ 1,5. Ghi ra đây để người sau biết chỗ này đã cân nhắc
chứ không phải bỏ sót.

**Dòng không khớp được mã thì để TRỐNG, giữ nguyên chữ đọc được.** Một ô trống là câu hỏi cho
người soát; một mã đoán bừa là câu trả lời sai mà không ai đọc lại. Và dòng thiếu mã **không**
được đưa vào chứng từ: `item_code` bắt buộc, gửi rỗng thì cả phiếu bị từ chối và người dùng
mất luôn những dòng đã đọc đúng.

### Model

`@cf/mistralai/mistral-small-3.1-24b-instruct`, lui về `@cf/meta/llama-3.2-11b-vision-instruct`.
Hỏng cả hai thì **TỪ CHỐI** — không có đường lui nào là "đoán bừa vài dòng".

Workers AI chứ không phải API ngoài: **khách chọn**, và nó không cần thêm khoá nào. Đánh đổi
đã nói rõ với khách — model thị giác ở đây đọc tiếng Việt có dấu và bảng kẻ tay kém hơn model
lớn, nên chất lượng thực tế cần đo trên ảnh thật của xưởng trước khi tin.

### Rủi ro còn lại: hạn giờ

`alumdoor.ocr.apply` chạy lại toàn bộ bước đọc (ảnh + danh mục + mô hình) rồi mới ghi, vì màn
thao tác chỉ gửi giá trị form chứ không gửi kèm kết quả xem trước. Cộng lại có thể chạm hạn 10
giây của một lời gọi app với ảnh lớn. Chưa gặp, nhưng là chỗ cần đo — nếu chạm, cách sửa là
cho `apply` nhận lại các dòng đã đọc thay vì đọc lần hai.

## 9.9 — Vẫn còn thiếu so với ERPNext

| Thứ | Vì sao chưa làm |
|---|---|
| `Supplier Scorecard` | ERPNext dựng nó thành doctype có kỳ đánh giá + biến số + công thức. Thay bằng **báo cáo** `Giảm trừ theo nhà cung cấp` — đo chất lượng NCC bằng số tiền phải giảm trừ, đọc thẳng từ sổ. |
| `Subcontracting` (gia công ngoài) | Cần chuỗi riêng: xuất NVL cho bên gia công, kho "hàng gửi gia công", nhận lại bán thành phẩm. Xưởng có sơn tĩnh điện ngoài — **cần hỏi khách** có muốn theo dõi trong app không. |
| Báo cáo mua theo **MẶT HÀNG** | Báo cáo app hiện chỉ gộp được trên field của chứng từ CHA, không gộp được trên dòng. Cần mở rộng `AppReportService`. |
