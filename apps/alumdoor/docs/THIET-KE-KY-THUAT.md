# Thiết kế kỹ thuật — Alumdoor trên forge-core

> PHA 3. Artifact chính là **Field Ledger** ở §3: mỗi bảng một sổ, mỗi trường một dòng.
> PHA 5 chỉ được code đúng theo ledger — trường không có trong ledger thì không được code;
> muốn thêm trường thì quay lại sửa ledger trước.
>
> Đọc cùng [BRD.md](BRD.md). Chỗ nào lệch nhau thì BRD thắng về *nghiệp vụ*, file này thắng về
> *cách hiện thực*.
>
> **Ba chỗ file này cố ý ghi đè BRD** (đã sửa BRD cho khớp, ghi lại để không ai "sửa ngược"):
>
> | BRD nói | Đây chốt | Vì sao |
> |---|---|---|
> | §4.5 `Cua Loi` là *"view lọc của chứng từ, không phải bảng riêng"* | **DocType riêng** (§3.8) | Nó cần `nhom_nguyen_nhan`, `ben_chiu_trach_nhiem`, `chi_phi_uoc_tinh` — ba trường chứng từ không có; và §3.7 bắt sinh bản ghi khi `so_la_hong > 0` |
> | §4.5 *"9 giá trị → **6** người thật"* | **5 người** | BRD §3 liệt kê đủ 9 chuỗi → 5 người. Sai số này làm hỏng báo cáo doanh thu theo nhân viên |
> | §3.14 công nợ *"dựng thành Query Report của lõi"* | **Denormalize + đối soát** (§3.14, §7.2) | Report của lõi chỉ đọc được một doctype |
>
> **Cảnh báo tài liệu nền tảng:** `docs/APP_FACTORY.md` đã cũ hơn code — nó ghi brief chưa khai
> được print format, và không nhắc `kanban`/`gantt`. Cả ba đều đã có trong
> `server/briefs/brief.schema.json`. **Đọc schema và `compile-brief.mjs`, đừng đọc mô tả.**

---

## 1. Nền tảng: khác gì so với khuôn AppWeb

Khuôn `app-factory` mặc định là React + Hono + D1 + Zod. App này chạy trên **forge-core** —
engine DocType. Quy đổi:

| Khuôn AppWeb | Trên forge-core |
|---|---|
| Bảng SQL + migration viết tay | **DocType** khai trong brief JSON; lõi tự dựng bảng |
| Zod schema | `fieldtype` + `reqd` + `options` — lõi tự validate ở `generic-controller.ts` |
| Control React chọn tay | `fieldtype` quyết định control; Desk tự render |
| Middleware `scopeWhere` | `MetadataPermissionService` + User Permission (row-level có sẵn) |
| `audit_logs` tự xây | Versions + audit của lõi |
| Counter cấp mã tự xây | Counter của lõi, cấp số nguyên tử qua Durable Object |

⇒ **Không viết migration SQL tay, không viết Zod, không viết middleware quyền.** Việc của app
là khai đúng DocType và viết controller cho phần lõi không biết: chia lá, quy đổi kích thước,
xổ dòng, trừ tồn theo cây.

### 1.1 Ba cái bẫy của lõi — phải biết trước khi khai ledger

Đọc từ `server/packages/frappe-model/src/generic-controller.ts`:

| Bẫy | Thực tế | Hệ quả cho ledger |
|---|---|---|
| **`Currency`/`Float`/`Percent` lưu dạng CHUỖI** | `return typeof value === "number" ? String(value) : value` | Mọi phép tính tiền phải qua **`packages/money`** (`toScaledInt` · `addMinor` · `multiplyScaled` · `percentOfMinor`), **không `parseFloat`** — VAT 8% và chiết khấu 15% trên số thực là chỗ sinh ra đồng lẻ không đối soát nổi. Cấm so sánh chuỗi |
| **`Rating` là phân số 0–1** | không phải số sao | Không dùng `Rating` cho thang điểm 1–5 |
| **`Duration` tính bằng giây** | số nguyên ≥ 0 | Định mức giờ công phải quy ra giây, hoặc dùng `Float` |

`Select` được lõi kiểm giá trị theo `options` (mỗi dòng một giá trị) — nên **mọi enum trong
ledger đều khai `Select` kèm danh sách**, không dùng `Data` rồi tự kiểm.

### 1.2 Nền này là bản đã BÓC LÕI — và có một Alumdoor đời trước

Commit `741caeb7` (14/08/2026) gỡ **~36.000 dòng tầng nghiệp vụ** khỏi R6: `clouderp-core` ·
`clouderp-erpnext` · `clouderp-pricing` · `clouderp-selling` · `clouderp-stock`, 12 brief app, và
cả `server/apps-src/alumdoor-worker` (**11.430 dòng**) lẫn `client/.../vertical/alumdoor`
(3.695 dòng).

⇒ **Không còn `Item`, `Customer`, `Sales Order`, `Price List`, sổ kho chuẩn nào để dùng lại.**
Lời khuyên của `docs/APP_FACTORY.md` — *"đừng làm danh mục riêng, hãy thêm `customFields` vào `Item`
chuẩn"* — **không áp dụng được trên nhánh này**: không có `Item` chuẩn nữa. Đó là lý do §3 khai
danh mục riêng bằng tiếng Việt, và nó là lựa chọn duy nhất, không phải sở thích.

**Lõi GIỮ lại** (dùng được, đừng viết lại): `document-kernel` · `frappe-api` · `frappe-model` ·
`app-registry` · `semantic` · `migration` · `query` · `auth` · `contracts` · `policy` ·
**`money`** · **`ledger`** · `outbox`.

**Alumdoor đời trước vẫn còn dấu vết đọc được** — `server/imports/alumdoor-1.27.0.manifest.json`
(62 DocType kiểu ERPNext, 7 báo cáo, 8 action, 13 validator, 54 fixture) và 4 file audit nhập liệu
tháng 7. **Không cài lại được** (worker đã bị gỡ), nhưng là **tư liệu đối chiếu**:

| Trong manifest cũ | Đối chiếu với thiết kế này |
|---|---|
| fixture `Cửa Đức/Úc/Lưới/Đài Loan/Siêu Trường — công thức chuẩn` | Kiểm chéo §3.2 `Chinh Sach Cat` |
| fixture `Cửa Đức — đại lý` / `— khách lẻ` | Xác nhận §3.2 tách hai cơ sở tính tiền là đúng |
| fixture kho `K36` · `K12` | §3.13 hai kho |
| action `tinh-cong-thuc-cua` · `cat-nhom` · `hoan-cat` · `doc-anh-chung-tu` | §6.4 — `hoan-cat` (hoàn lá thừa) là thứ §6.4 còn thiếu |
| DocType `Cutting Policy` · `Measurement Profile` · `Aluminium Lot` · `Aluminium Cut` | §3.2 · §3.3 · §3.7 |

**PHA 5 mở manifest cũ ra đối chiếu trước khi khai fixture.** Nó là bản ghi của một hệ đã chạy
thật trên dữ liệu xưởng; ledger §3 đúng hơn về nghiệp vụ, nhưng nó đúng hơn về *những gì xưởng đã
từng bấm*.

### 1.3 Fieldtype lõi thật sự hỗ trợ

```
chuỗi     Data · Small Text · Text · Long Text · Code · Read Only · Autocomplete
          Text Editor · Markdown Editor · HTML Editor · Password
tham chiếu Link · Dynamic Link · Table · Table MultiSelect · Select
số        Int · Float · Currency · Percent · Duration(giây) · Rating(0–1)
thời gian Date(YYYY-MM-DD) · Datetime(ISO) · Time(HH:MM[:SS])
khác      Check · Phone · Color · Geolocation(GeoJSON) · JSON
tệp/ảnh   Attach · Attach Image · Image · Signature · Barcode · Icon
```

Ngoài danh sách này là **không có** — đừng khai `money`, `address-vn`, `code-auto` như khuôn
AppWeb; chúng map thành `Currency`, `Data`, `Data`+counter.

Danh sách này lấy từ `generic-controller.ts`; §1.2 giải thích vì sao không mượn được fieldtype nào
của tầng nghiệp vụ cũ.

## 2. Trường hệ thống — không khai lại ở từng ledger

Lõi tự có: `name` (PK) · `owner` · `creation` · `modified` · `modified_by` · `docstatus` ·
`idx`. Optimistic lock qua `expected_version` trên `MutationCommand`.

App thêm theo nhóm bảng:

| Nhóm | Trường thêm |
|---|---|
| Mọi bảng nghiệp vụ | `deleted_at` (Datetime, soft-delete) |
| Bảng chứng từ | `so_ct` (Data, UNIQUE, counter) · `trang_thai` (Select) · `so_ct_goc` (Data, số của Excel cũ khi nhập liệu) |
| Bảng có dữ liệu mẫu | `is_demo` (Check) |

## 3. FIELD LEDGER

### 3.1 `Quy Cach Cua` — bản lá, bảng sinh tử

Nguồn: `image2.png` (19 dòng) + `GHI CHÚ` (23 mã). **Chỉ Giám đốc sửa.**

| Field | Kiểu | Ràng buộc | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|
| `ma` | Data | PK, UNIQUE, NOT NULL | Data `*` | in hoa, không dấu cách | — | mọi role xem / **chỉ GĐ** sửa | `AL548N`, `AL71C` |
| `dong_cua` | Select | NOT NULL | Select `*` | thuộc 6 giá trị | — | " | `Đức\nÚc\nĐài Loan\nLưới\nSiêu Trường\nTấm liền Úc` |
| `doi` | Select | NOT NULL | Select `*` | `CŨ\nMỚI` | mặc định `MỚI` | " | Quyết định bước lá; chênh tới 10% |
| **`buoc_la_m`** | Float | NOT NULL, > 0 | Float `*` | `0 < x < 1` — "Bước lá phải là số mét, ví dụ 0,055" | — | " | **Ước số CHIA.** Nguồn: `25.07.26 DDH - CÔNG THỨC CHIA LÁ.pdf` |
| **`be_rong_nan_mm`** | Int | nullable | Int | 40–120 | — | " | **Chỉ nhận diện mã + tra giá.** Nguồn: cột `Bản lá` bảng giá 31/07. **CẤM dùng để chia** |
| **`rong_toi_da_mm`** | Int | NOT NULL, > 0 | Int `*` | 3.000–8.000 | — | " | **Chặn bán** cửa rộng hơn |
| `trong_luong_kg_m2` | Float | nullable | Float | > 0 | — | " | ±8%. Dùng cho công thức mua vào |
| `tru_mot_la` | Check | DEFAULT 1 | Check | — | bật | " | **Tắt cho ĐÚNG BỐN mã**: `AL71N` · `AL71 (CŨ)` · `AL70 (2 LỚP)` · `AL70 (1 LỚP)`. 15 mã còn lại đều trừ |
| `nguon` | Small Text | NOT NULL | Small Text `*` | không rỗng | — | " | Ghi rõ file/ảnh nào |
| `ghi_chu` | Small Text | — | Small Text | — | — | " | Ngoại lệ, cảnh báo |

> **Bản trước của chính file này ghi sai dòng `tru_mot_la`** — nó nói *"`AL70` CÓ trừ"*, trong
> khi công thức gốc trong ảnh là `(CPB-130)/68`, **không có `-1`**, và BRD §10 đã chốt "AL70 không
> trừ 1 lá". Nguồn `nguon/ANH-DA-CHEP.md` còn nêu đích danh đây là một trong **hai** lần bản chép
> tay thắng sheet Excel. Bốn mã không trừ, không phải hai. Sai chỗ này là lệch một lá mỗi bộ trên
> hai mã bán chạy nhất (AL70 là mã rẻ nhất bảng giá).

> **Bẫy chết người thứ hai của app này** (sau bẫy U75/U100): `be_rong_nan_mm` và `buoc_la_m`
> lệch nhau 1–2 mm ở 5 mã. Bảng giá gọi `AL70` là "bản lá 70" nhưng chia lá phải dùng `0,068`.
> Lấy nhầm ⇒ lệch 2 lá mỗi bộ. **Validate ở server: cấm gán `be_rong_nan_mm/1000` vào
> `buoc_la_m`.**

**Công thức (controller, không phải trường) — trả về BA số, không phải một:**

```
raw          = (CPB_mm − 130) / (buoc_la_m × 1000)   ← BƯỚC LÁ, cấm dùng be_rong_nan_mm
so_la_ruot   = round(raw − 1)   nếu tru_mot_la       ← lệnh cắt dùng số này
             = round(raw)       nếu không
so_la_nhom   = so_la_ruot + 1                        ← phiếu SX cột (6), đã gồm lá đầu
bo_3_la_day  = 3                                     ← phiếu SX cột (13), riêng
```

`Dong Don Hang` lưu **cả `so_la_ruot` và `so_la_nhom`** — hai màn hình khác nhau đọc hai số
khác nhau, tính lại ở tầng hiển thị là chỗ để lệch.

Bất biến kiểm được trong test: với mã có `tru_mot_la`, `so_la_nhom == round(raw)`.

Mã không có bản ghi ⇒ **ném lỗi, cấm đoán**: *"Chưa có công thức chia lá cho `<mã>`"*.

### 3.2 `Chinh Sach Cat` — quy đổi kích thước

Một bản ghi cho mỗi cặp (dòng cửa × loại ray). Lưu **hằng số**, không lưu công thức dạng chữ.

| Field | Kiểu | Ràng buộc | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|
| `dong_cua` | Select | NOT NULL | Select `*` | 6 giá trị | — | xem: all / sửa: **GĐ** | |
| `loai_ray` | Select | NOT NULL | Select `*` | `U75\nU100` | mặc định `U75` | " | **Bắt buộc** — đổi ray là đổi mọi kích thước |
| `co_so_dai_ly` | Select | NOT NULL | Select `*` | `RPBN\nRPBR\nRCL` | Đức→RPBN · Úc→RPBR · ĐL/ST→RCL | " | Cơ sở tính tiền cho **ĐẠI LÝ** |
| `co_so_khach_le` | Select | NOT NULL | Select `*` | `RPBN\nRPBR\nRCL` | **luôn RPBR** | " | Cơ sở tính tiền cho **KHÁCH LẺ** |
| `cpb_offset_mm` | Int | NOT NULL DEFAULT 500 | Int `*` | 0–1000 | 500 | " | `CPB = CLL + 500` — khớp chuẩn ngành |
| `rpbr_tu_rll_mm` | Int | NOT NULL | Int `*` | | U75 Đức 150 · Úc 140 · ĐL 140<br>U100 mọi dòng 200 | " | `RPBR = RLL + n` |
| `rpbn_tu_rpbr_mm` | Int | nullable | Int | | U75 −60 · U100 −70 | " | Chỉ cửa Đức. Số ÂM |
| `rcl_tu_rpbr_mm` | Int | nullable | Int | | −30 | " | Úc · Đài Loan · Lưới · Siêu Trường. Số ÂM |
| `rcl_ban_buom_mm` | Int | nullable | Int | | −35 | " | Thay `rcl_tu_rpbr_mm` khi đơn **có bắn bướm** |
| `chia_la_kieu` | Select | NOT NULL | Select `*` | `Đức\nÚc\nĐài Loan\nSiêu Trường` | | " | Đức `(CPB−130)/bước lá` · Úc `CPB/0,465 + hệ số` · ĐL `CPB/0,077` · ST `CPB/0,100` |

> **Cửa Siêu Trường đã có đủ dữ liệu** — nguồn là sheet `CT TT-SX` của `QUY CÁCH`, không phải
> `GHI CHÚ` (sheet đó chỉ có 3 mục nên tôi từng tưởng thiếu):
>
> ```
> RCL = RPBR − 0,03   (có bắn bướm: − 0,035)
> tính tiền: ĐẠI LÝ = CPB × RCL     KHÁCH LẺ = CPB × RPBR
> bước lá  = 0,100   (lá Đài Loan BẢN 100)
> ```
>
> **`VIPST500`/`VIPST700` KHÔNG phải cửa Siêu Trường** — chúng là hai mã trong dòng **cửa Đức
> khe thoáng** (bảng giá 31/07 xếp chúng ở đó, bước lá 0,053 và 0,05). Nhầm hai thứ này là
> lấy sai cả bước lá lẫn công thức quy đổi.

> **Cơ sở tính tiền phụ thuộc ĐẠI LÝ / KHÁCH LẺ** — cùng một bộ cửa, hai loại khách tính trên
> hai chiều rộng khác nhau. Nên `co_so_tinh_tien` phải tách làm **hai trường**:
>
> | Dòng cửa | Đại lý | Khách lẻ |
> |---|---|---|
> | Đức | `RPBN` | `RPBR` |
> | Úc | `RPBR` | `RPBR` |
> | Đài Loan · Lưới | tách món `RCL` · trọn bộ `RPBR` | `RPBR` |
> | Siêu Trường | `RCL` | `RPBR` |
>
> **Khách lẻ luôn tính trên `RPBR`** — rộng nhất, tức đắt nhất.

> **Engine luôn đi `RLL → RPBR → (RPBN | RCL)`.** Cấm đường tắt `RPBN = RLL + 90` — nó chỉ đúng
> với U75; sang U100 lệch 40mm (RPBN) và 60mm (RCL).

### 3.3 `Cay Nhom Ton` — tồn nhôm theo CÂY

Nguồn: `TỒN NHÔM 2026 NEW.xlsx`, 17 sheet = **một bảng**, không phải 17.

| Field | Kiểu | Ràng buộc | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|
| `ma_nhom` | Link→`Quy Cach Cua` | NOT NULL | Link `*` | mã tồn tại | — | all xem / thủ kho ghi | AL75, AL548… |
| `mau` | Link→`Mau Son` | NOT NULL | Link `*` | | — | " | |
| `tinh_trang` | Select | NOT NULL | Select `*` | `CŨ\nMỚI` | `MỚI` | " | **Quyết định bản lá khi cắt cây này** |
| `kho_m` | Float | NOT NULL, > 0 | Float `*` | 0 < x ≤ 12 — "Khổ cây phải từ 0 đến 12 m" | — | " | Khổ cây |
| **`so_la_ban_dau`** | Int | NOT NULL, ≥ 0 | Int `*` — nhập **một lần lúc tạo** | ≥ 0 | gợi ý = `so_la` | " | **Mốc neo của phép đối soát kho §7.2.** Không có nó thì `Σ đã cắt + còn lại = ?` không có vế phải, và bài đối soát bắt buộc của cổng CRITICAL không chạy được |

> **Không khai trường này là `~` (chỉ đọc).** Bản trước làm vậy và cài xong thì **không ai tạo
> nổi một cây nhôm**: lõi từ chối với `Field is read-only: so_la_ban_dau`, mà trường lại NOT NULL
> và không có mặc định — form không có đường nào nộp được. Bất biến "không đổi sau khi tạo" phải
> do **validator** giữ (§5.1), không phải do cờ chỉ-đọc, vì cờ đó chặn luôn cả lần ghi đầu tiên.
| `so_la` | Int | NOT NULL, ≥ 0 | Int `*` | ≥ 0 | — | " | Số lá **còn** trên cây |
| `kho_hoan_m` | Float | nullable | Float | ≥ 0 | — | " | Đầu thừa sau cắt |
| `so_la_hoan` | Int | nullable | Int | ≥ 0 | — | " | Lá thừa trả về |
| `ngay_kiem` | Date | nullable | Date | không tương lai | hôm nay khi kiểm kê | " | Lần kiểm kê gần nhất |
| `trang_thai` | Select | NOT NULL DEFAULT `Còn` | Select | `Còn\nĐã dùng hết\nKhoá` | `Còn` | " | `Khoá` = đang giữ cho một lệnh cắt |

### 3.4 `Don Hang`

| Field | Kiểu | Ràng buộc | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|
| `so_ct` | Data | UNIQUE NOT NULL | Read Only | — | counter, cấp lúc LƯU | all xem / không ai sửa | Huỷ vẫn giữ số |
| `so_ct_goc` | Data | — | Data | — | — | all / kế toán | Số của Excel cũ khi nhập liệu |
| `khach_hang` | Link→`Khach Hang` | NOT NULL | Link `*` | tồn tại | — | all / sale+ | Chọn xong bật autofill loại khách |
| `nguoi_phu_trach` | Link→`Nhan Vien` | NOT NULL | Link `*` | tồn tại | **user đang đăng nhập** | all / QLBH+ | **Cấm nhập tay** — sổ cũ có 9 cách gõ cho 5 người |
| `loai_khach` | Select | NOT NULL | Select `*` | `Đại lý\nKhách lẻ` | từ `Khach Hang` | all / sale+ | Quyết định cơ sở tính rộng |
| `ngay_dat` | Date | NOT NULL | Date `*` | không tương lai | hôm nay | all / sale+ | |
| `ngay_giao_du_kien` | Date | — | Date | ≥ `ngay_dat` | — | all / sale+ | |
| `hinh_thuc_tt` | Select | NOT NULL | Select `*` | `Trả ngay\nĐặt cọc\nTrả sau` | `Trả sau` | all / sale+ | §10.2 BRD |
| `so_tien_coc` | Currency | ≥ 0 | Currency | ≥ 0 | 0 | all / kế toán | **Có cọc > 0 là cho sản xuất, không đặt ngưỡng** |
| `trang_thai` | Select | NOT NULL DEFAULT `Nháp` | Read Only (đổi qua action) | state machine §4 | `Nháp` | all / theo action | |
| `tong_tien` | Currency | — | Read Only | — | tính từ dòng | all / không | Lưu **chuỗi**, parse trước khi cộng |
| **`da_thu`** | Currency | NOT NULL DEFAULT 0 | Read Only | — | **worker cộng từ `Phieu Thu Chi`** | all / **không ai sửa tay** | §3.14 — không có nó thì không có báo cáo công nợ |
| **`con_lai`** | Currency | NOT NULL DEFAULT 0 | Read Only | — | **worker**: `tong_tien − da_thu` | " | Cột để gộp báo cáo tuổi nợ |
| `ngay_thu_cuoi` | Date | — | Read Only | — | worker | " | Mốc tính tuổi nợ |
| `ghi_chu` | Small Text | — | Small Text | — | — | all / sale+ | vd "Dập 3 hàng lỗ thoáng" |
| `deleted_at` | Datetime | — | ẩn | — | — | GĐ | Soft-delete, cấm xoá cứng — chặn bằng **validator action `delete`**, không phải bằng chữ quyền |

### 3.5 `Dong Don Hang` (child table)

| Field | Kiểu | Ràng buộc | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|
| `ma_hang` | Link→`Vat Tu` | NOT NULL | Link `*` | tồn tại | — | all / sale+ | |
| `cach_ban` | Select | NOT NULL | Select `*` | `Trọn bộ\nTách món\nTặng ray` | theo dòng cửa | all / sale+ | Quyết định có xổ dòng không |
| `loai_ray` | Select | NOT NULL | Select `*` | `U75\nU100` | `U75` | all / sale+ | Tham số bắt buộc của quy đổi |
| **`bien_the`** | Select | NOT NULL | Select `*` | theo dòng cửa (xem dưới) | rẻ nhất của dòng | all / sale+ | **Khoá tra giá thứ hai.** Đức `Chỉ lá\|Tặng ray` · Úc `Kéo tay\|Motor ngoài` · Lưới `Chưa phụ kiện\|Có phụ kiện` |
| **`mau`** | Link→`Mau Son` | NOT NULL | Link `*` | tồn tại | màu bán chạy nhất | all / sale+ | **Phụ thu `SON_VAN_GO`/`HANG_THO` (§3.6b) đọc từ đây**, và lò sơn gom mẻ theo nó (§3.12) |
| **`co_ban_buom`** | Check | DEFAULT 0 | Check | — | tắt | all / sale+ | Bật ⇒ quy đổi dùng `rcl_ban_buom_mm` thay `rcl_tu_rpbr_mm` (§3.2). **Không có ô này thì trường `rcl_ban_buom_mm` vĩnh viễn không ai chạm tới** |
| `cll_mm` | Int | > 0 | Int `*` | 500–6000 — "Cao lọt lòng phải từ 0,5 đến 6 m" | — | all / sale+ | **Khách đo** |
| `rll_mm` | Int | > 0 | Int `*` | 500–8000 | — | all / sale+ | **Khách đo** |
| `cpb_mm` | Int | — | Read Only | — | `cll_mm + cpb_offset` | all / không | Tính |
| `rpbr_mm` | Int | — | Read Only | — | `rll_mm + rpbr_tu_rll_mm` | all / không | Tính |
| `rpbn_mm` | Int | — | Read Only | — | `rpbr_mm + rpbn_tu_rpbr_mm` | all / không | Tính, chỉ cửa Đức |
| `rcl_mm` | Int | — | Read Only | — | `rpbr_mm + rcl_tu_rpbr_mm` | all / không | Tính — **xưởng cắt theo cái này** |
| `so_bo` | Int | NOT NULL, > 0 | Int `*` | ≥ 1 | 1 | all / sale+ | |
| `so_la_ruot` | Float | — | Read Only | — | engine chia lá | all / không | **Float** vì cửa Úc có nửa lá (8,3 · 8,7). Lệnh cắt dùng số này |
| `so_la_nhom` | Float | — | Read Only | — | `so_la_ruot + 1` | all / không | Phiếu SX cột (6), đã gồm lá đầu |
| `dien_tich_m2` | Float | — | Read Only | — | `CPB × cơ_sở_rộng × so_bo` | all / không | Cơ sở theo `Chinh Sach Cat` |
| `don_gia` | Currency | ≥ 0 | Currency | ≥ 0 | tra `Bang Gia Bac` | all / sale+ | |
| `khoa_don_gia` | Check | DEFAULT 0 | Read Only | — | 1 khi là dòng xổ ra | all / không | **Dòng xổ ra = 0đ và khoá** |
| `chiet_khau_pct` | Percent | 0–100 | Percent | ≤ 15 tự duyệt, > 15 chờ GĐ | 0 | all / sale+ | 15% trên **giá chỉ lá** |
| `phu_thu` | Currency | ≥ 0 | Read Only | — | engine tính (7 khoản §3.6b) | all / không | Cộng/trừ ngoài giá gốc |
| `thanh_tien` | Currency | — | Read Only | — | tính, **chưa VAT** | all / không | |
| `kho` | Link→`Kho` | NOT NULL | Link `*` | tồn tại | kho mặc định của user | all / thủ kho | Hai kho |
| `dong_cha` | Data | — | ẩn | — | — | all / không | Trỏ về dòng cửa chính nếu là dòng xổ ra |

> **Khoá tra `Bang Gia` — bốn mảnh, thiếu một mảnh là không ra dòng giá nào:**
>
> | `kieu_tra` của dòng cửa | Khoá lấy từ đâu |
> |---|---|
> | `Theo mã` (Đức) | `ma_hang` + `bien_the` |
> | `Theo độ dày` (Úc · ĐL tách món · Siêu Trường) | `Vat Tu.do_day` (theo `ma_hang`) + `bien_the` |
> | `Theo bậc diện tích` | `dien_tich_m2` rơi vào `[dt_tu, dt_den)` + `bien_the` |
> | `Theo chất liệu` (Lưới) | `Vat Tu.chat_lieu` + `bien_the` |
>
> `do_day` và `chat_lieu` là **thuộc tính sản phẩm** nên nằm ở `Vat Tu` (§3.9), suy ra qua
> `ma_hang`. `bien_the` và `mau` là **lựa chọn lúc bán** nên phải nằm ở dòng đơn — cùng một mã
> hàng, hai khách chọn khác nhau, hai giá khác nhau.
>
> Tra không ra dòng giá ⇒ **ném lỗi nêu đủ bốn mảnh đã dùng**, cấm lấy dòng giá gần đúng.

### 3.6 Bảng giá — NĂM cấu trúc, không phải một

Sai lầm bản trước: coi mọi dòng cửa đều tra giá theo bậc diện tích. Thực tế mỗi dòng một kiểu.
Dùng **một DocType `Bang Gia`** với `kieu_tra` phân nhánh, thay vì năm bảng rời:

| Field | Kiểu | Nghiệp vụ |
|---|---|---|
| `dong_cua` | Select `*` | 6 giá trị |
| `kieu_tra` | Select `*` | **`Theo mã` · `Theo độ dày` · `Theo bậc diện tích` · `Theo chất liệu`** |
| `ma_hang` | Link→`Vat Tu` | khi `Theo mã` (cửa Đức, 15 mã) |
| `do_day` | Select | khi `Theo độ dày` (Úc, ĐL tách món, Siêu Trường) |
| `dt_tu_m2` · `dt_den_m2` | Float | khi `Theo bậc`. **`dt_tu` MỞ, `dt_den` ĐÓNG**; `dt_den` rỗng = bậc trên cùng |
| `chat_lieu` | Select | khi `Theo chất liệu` (Lưới): `Sắt sơn tĩnh điện
Inox 304` |
| `bien_the` | Select | Cột giá thứ hai: `Chỉ lá
Tặng ray` (Đức) · `Kéo tay
Motor ngoài` (Úc) · `Chưa phụ kiện
Có phụ kiện` (Lưới) |
| `don_gia` | Currency `*` | đ/m² hoặc đ/bộ |
| `hieu_luc_tu` | Date `*` | **31/07/2026** cho hầu hết; ĐL trọn bộ vẫn 07/07/2026 |

### 3.6b `Phu Thu` — bảy khoản cộng/trừ

Bảng dữ liệu, không hardcode:

| `ma` | `dieu_kien` | `gia_tri` | `don_vi` | Áp cho |
|---|---|---|---|---|
| `CUA_NHO` | `S < 7` | +300.000 | đ/bộ | mọi dòng |
| `NGANG_6_75` | `6 < ngang < 7,5` | +40.000 | đ/m² | mọi dòng |
| `NGANG_75_9` | `7,5 < ngang < 9` | +60.000 | đ/m² | mọi dòng |
| `LO_XO_KEO_TAY` | cách bán = kéo tay | +20.000 | đ/m² | Đài Loan |
| `SON_VAN_GO` | màu = vân gỗ | +360.000 | đ/m² | Đức |
| `VAN_CHUYEN_NHO` | `S < 8` | +300.000 | đ/bộ | Đức |
| `HANG_THO` | không sơn | **−70.000** | đ/m² | Lưới |

### 3.6c Thứ tự tính tiền — engine phải làm ĐÚNG thứ tự này

```
1. S = CPB × (cơ sở rộng theo Chinh Sach Cat)        ← RPBN | RPBR | RCL, tuỳ Đại lý/Khách lẻ
2. nếu S < 4      → đơn giá = giá trọn gói theo BỘ, BỎ QUA bước 3
   ngược lại      → đơn giá = tra Bang Gia theo kieu_tra của dòng cửa
3. tiền gốc = đơn giá × S × số bộ
4. − chiết khấu   (≤15% sale tự duyệt; >15% chặn chờ GĐ)
5. ± bảy khoản Phu Thu
6. + VAT 8%                                          ← CỘNG SAU CÙNG
```

**Chặn trước khi tính:** `rll_mm > rong_toi_da_mm` của mã ⇒ từ chối lưu, báo
*"AL595 chỉ bán được tới 4 m, đơn này 4,2 m"*.

### 3.7 `Lenh San Xuat` / `Phieu Cat`

`Lenh San Xuat`: `so_ct` (counter) · `don_hang` (Link, NOT NULL) · `to_san_xuat` (Link→`To`) ·
`trang_thai` (Select, §4.2) · `ngay_bat_dau` · `ngay_hoan_thanh` (Date)

`Phieu Cat` (child): `cay_nhom` (Link→`Cay Nhom Ton`, NOT NULL) · `loai_la` (Select
`Lá ruột\nLá đầu\nLá yếm\nLá trung gian\nLá đáy lớn`) · `so_la_cat` (Int > 0) ·
`chieu_dai_cat_mm` (Int) · `so_la_hong` (Int ≥ 0, DEFAULT 0) · `ghi_chu`

> `so_la_hong > 0` ⇒ **bắt buộc** sinh bản ghi `Cua Loi`. Đây là chỗ chặn nỗi đau #2
> (*"thợ cắt hỏng không báo"*).

### 3.8 `Cua Loi`

| Field | Kiểu | Ràng buộc | UI | Autofill | Nghiệp vụ |
|---|---|---|---|---|---|
| `nhom_nguyen_nhan` | Select `*` | NOT NULL | Select | — | `Sản xuất\nVật tư\nBán hàng\nKhách` |
| `nguyen_nhan` | Select `*` | NOT NULL | Select | lọc theo nhóm | 12 giá trị, BRD §10.1 |
| `ben_chiu_trach_nhiem` | Select `*` | NOT NULL | Select | suy từ nhóm | `Xưởng\nNhà cung cấp\nSale\nKhách hàng` |
| `chi_phi_uoc_tinh` | Currency | ≥ 0 | Currency | từ giá vốn cây nhôm | Trả lời *"tháng này mất bao nhiêu vì cắt sai"* |
| `don_hang` / `lenh_san_xuat` | Link | — | Link | từ ngữ cảnh | |

### 3.9 `Vat Tu` — và đường nối sang bản lá

Mẫu chung của bảng master: `ma` (Data UNIQUE, counter) · `ten` (Data NOT NULL) ·
`dien_thoai` (Phone) · `dia_chi` (Small Text) · `ghi_chu` · `disabled` (Check) · `deleted_at`.

`Vat Tu` thêm:

| Field | Kiểu | Ràng buộc | Nghiệp vụ |
|---|---|---|---|
| `nhom` | Select | NOT NULL | `Thành phẩm cửa\nNhôm cây\nPhụ kiện\nRon\nLò xo\nRay\nTrục\nVật tư khác` |
| `quy_cach_cua` | **Link→`Quy Cach Cua`** | **NOT NULL khi `nhom = Thành phẩm cửa`** | **Đường nối sống còn** — thiếu nó thì bán `ĐỨC AL548 - GS` mà máy không biết tra bản lá `AL548N` |
| `do_day` | Select | nullable | `6D\n7D\n8D\n1LY\n8D STĐ\n1LY STĐ\n1.2LY STĐ` — khoá tra `Bang Gia` khi `kieu_tra = Theo độ dày` |
| `chat_lieu` | Select | nullable | `Sắt sơn tĩnh điện\nInox 304` — khoá tra `Bang Gia` khi `kieu_tra = Theo chất liệu` (cửa Lưới) |
| `dvt_nhap` / `dvt_ban` | Data | | Sổ có mã nhập KG nhưng bán M2 |
| `he_so_quy_doi` | Float | > 0 | Khi hai ĐVT khác nhau |

> Không có `quy_cach_cua` thì toàn bộ engine chia lá vô dụng. Validate ở server: lưu
> `Vat Tu` nhóm `Thành phẩm cửa` mà bỏ trống trường này ⇒ **từ chối**.

`Nhan Vien` thêm `user` (Link→User) để `nguoi_phu_trach` tự điền theo người đăng nhập.

### 3.10 `Dinh Muc` (BOM) — 363 thành phẩm

Nguồn: sheet `ĐM`. **534/1.572 dòng NVL trống định mức = phải chọn lúc lên đơn**, không phải
dữ liệu thiếu (8 loại lò xo, puly, xốp — thợ chọn theo cỡ cửa).

| Field | Kiểu | Ràng buộc | UI | Autofill | Nghiệp vụ |
|---|---|---|---|---|---|
| `thanh_pham` | Link→`Vat Tu` | NOT NULL | Link `*` | — | Một BOM cho một thành phẩm |
| `hieu_luc_tu` | Date | NOT NULL | Date `*` | hôm nay | Đổi định mức không sửa bản cũ, tạo bản mới |
| `dong` | Table→`Dong Dinh Muc` | | | | |

`Dong Dinh Muc` (child):

| Field | Kiểu | Ràng buộc | Nghiệp vụ |
|---|---|---|---|
| `vat_tu` | Link→`Vat Tu` | NOT NULL | |
| `dvt` | Data | | `KG` · `M` · `CÁI` · `KG/M` · `KG/M2` · `KG/CẶP` |
| `dinh_muc` | Float | nullable | **Trống = dòng PHẢI CHỌN lúc lên đơn** |
| `phai_chon` | Check | DEFAULT 0 | Bật khi `dinh_muc` trống. Nhóm các dòng cùng loại để thợ chọn 1 |
| `nhom_chon` | Data | nullable | vd `LÒ XO` — 8 dòng cùng nhóm, chọn đúng 1 |
| `cong_thuc` | Select | nullable | `SL_X_DM\nM_X_ĐM\nCAO_CONG_0.15_X_SL\nM_X_2` — ngôn ngữ tiêu hao xưởng tự nghĩ, mới điền ~27 dòng khối Đức |

> `cong_thuc` là chỗ **chưa hoàn chỉnh trong chính file gốc**. Bản 1 chỉ hiện thực 4 mã đã thấy;
> mã lạ thì cảnh báo và để thợ nhập tay, **không đoán**.

### 3.11 `Bao Hanh` — 4 chặng, mỗi chặng ngày + số lượng riêng

| Field | Kiểu | Ràng buộc | Nghiệp vụ |
|---|---|---|---|
| `so_ct` | Data | UNIQUE | counter |
| `ngay_dat_hang` | Date | NOT NULL | |
| `ngay_nhap_loi` · `sl_nhap_loi` | Date · Int | | Khách báo hỏng |
| `ngay_xuat_doi` · `sl_xuat_doi` | Date · Int | | Đổi ngay cho khách |
| `ngay_gui_bh` · `sl_gui_bh` | Date · Int | | Gửi cái hỏng cho NCC |
| `ngay_tra_bh` · `sl_tra_bh` | Date · Int | | NCC trả về |
| `nha_cung_cap` | Link→`Nha Cung Cap` | NOT NULL | |
| `khach_hang` | Link→`Khach Hang` | | |
| `loai_hang` | Link→`Vat Tu` | NOT NULL | Bình lưu điện, motor… |
| `han_bao_hanh` | Date | | Tính từ ngày giao + 12 tháng |
| `che_do_bh` | Select | | `Đổi mới 12 tháng`<br>`3 tháng đổi mới + 9 tháng sửa chữa` (motor JG) |

**Số lượng bốn chặng có thể lệch nhau** — đổi cho khách 3 cái nhưng chỉ gửi NCC 2 cái là hợp lệ.
Không ràng buộc bằng nhau.

### 3.12 `Dinh Muc Gio` — ba kiểu định mức

| Field | Kiểu | Nghiệp vụ |
|---|---|---|
| `bo_phan` | Select `*` | `Úc\nLưới\nĐài Loan\nSiêu Trường\nĐức\nLò sơn` |
| `kieu_dinh_muc` | Select `*` | **`Theo diện tích` · `Theo bộ` · `Theo công đoạn` · `Theo mẻ`** |
| `cong_doan` | Data | Chỉ khi `Theo công đoạn`: `cắt dập` · `hoàn thiện` · `lấy nhôm` |
| `phut` | Int `*` | Số phút |
| `tren_bao_nhieu` | Float | 12 (m²) · 9 (m²) · 1 (bộ) · 1 (mẻ) |
| `suc_chua_me` | Int | Chỉ lò sơn: 345 lá |
| `chieu_dai_me_m` | Float | Chỉ lò sơn: 11,5 m |

> **Lò sơn là ràng buộc gom nhóm, không phải định mức thường.** Mỗi mẻ 3 tiếng chỉ chạy **một
> màu**. Bộ xếp lịch phải gom đơn cùng màu vào một mẻ. Đây là ràng buộc lập lịch nặng nhất và
> là thứ Excel không làm được — chỗ app thắng rõ nhất.

### 3.13 `Kho` và `Dot Giao Hang`

`Kho`: `ma` · `ten` · `dia_chi` — hiện có **2 kho** (cột `KHO (1-2)` trong sổ điều độ).
Mọi `Phieu Cat`, phiếu nhập, phiếu xuất **bắt buộc** có `kho`.

`Dot Giao Hang` (child của `Don Hang`): `dot` (Int) · `lo` (Data) · `so_luong` (Int) ·
`da_xuat` (Int) · `ngay_giao` (Date) · `phieu_xuat_kho` (Link).

> Đơn lớn giao nhiều đợt — sheet `HOÀNG LAI`: `ĐỢT 1 - 95 BỘ ĐÃ GIAO HÀNG 2 BỘ`. Trạng thái đơn
> `Đã giao` chỉ bật khi `Σ da_xuat = Σ so_luong`.

### 3.14 Công nợ và thu chi

Sổ gốc gộp tất cả vào một `chi tiết nhập hàng ngày` 29 cột với `Loại chứng từ` phân biệt.
Trên forge-core tách làm hai DocType, vì luồng duyệt và quyền khác nhau.

`Phieu Thu Chi`:

| Field | Kiểu | Ràng buộc | Autofill | Nghiệp vụ |
|---|---|---|---|---|
| `so_ct` | Data | UNIQUE | counter | Huỷ giữ số |
| `loai` | Select | NOT NULL | — | 6 giá trị nguyên văn sổ: `Bán hàng chưa thu tiền\nThu công nợ\nMua hàng chưa thanh toán\nCác khoản chi khác\nTrả sản phẩm lỗi nhà cung cấp\nChuyển quỹ` |
| `doi_tuong` | Dynamic Link | NOT NULL | — | Khách hàng hoặc NCC |
| `tai_khoan` | Link→`Tai Khoan` | NOT NULL | nhớ lần trước | 8 giá trị sổ = 6 TK ngân hàng + tiền mặt + công nợ |
| `so_tien` | Currency | > 0 | từ số còn nợ | **Lưu chuỗi — parse trước khi cộng** |
| `ngay` | Date | NOT NULL | hôm nay | |
| `don_hang` | Link→`Don Hang` | nullable | từ ngữ cảnh | Nối tiền về đơn ⇒ tính được lãi/lỗ từng đơn — nỗi đau #3 |
| `chung_tu_anh` | Attach Image | | | Bằng chứng chi |

`Tai Khoan` — ledger đầy đủ ở **§3.15**, không chép lại ở đây (luật viết hai lần là luật sẽ trôi dạt).

**Công nợ không phải bảng riêng** — sheet `CHI TIẾT CNO KH` (433 dòng) và `CNO NCC` (111) chỉ là
bảng tổng hợp, không phải sổ gốc.

> **Nhưng nó cũng KHÔNG dựng được bằng report của lõi.** `compileReport`
> (`server/scripts/lib/compile-brief.mjs:105-134`) bắt buộc `doctype` là **đúng một** doctype app
> khai; không có join. Tuổi nợ cần `Don Hang` (phải thu) **và** `Phieu Thu Chi` (đã thu) — hai
> doctype, nên report khai thẳng là không biên dịch được.
>
> **Cách làm: dồn về một doctype.** `Phieu Thu Chi` khi ghi/huỷ thì worker cập nhật luôn
> `Don Hang.da_thu` · `con_lai` · `ngay_thu_cuoi` (§3.4). Công nợ khách thành report một doctype
> `Don Hang`, gộp theo `khach_hang`. Công nợ NCC gộp trên chính `Phieu Thu Chi` theo `doi_tuong`.
>
> Đổi lại là **hai nguồn cho một con số**, nên §7 bắt buộc có bài đối soát:
> `Σ Phieu Thu Chi(don_hang=X, docstatus=1)` phải bằng `Don Hang[X].da_thu`. Lệch một đồng là hỏng
> — và đó chính là bằng chứng `reconciliation` mà `VALIDATION_GATES.md` đòi ở lớp CRITICAL.

**`lai_lo` không phải report khai được** — nó cần giá vốn cây nhôm đã cắt cho từng đơn, tức đọc
`Phieu Cat` → `Cay Nhom Ton` → `Don Hang`. Ba doctype, nên nó là **method**
`alumdoor.bao_cao.lai_lo` (BRD §6), hiện qua màn `screen:dieu-hanh`, không phải mục Báo cáo.

### 3.15 Sáu bảng danh mục — ledger đầy đủ

Bản trước chỉ có một dòng "mẫu chung của bảng master" ở §3.9. Không đủ: chúng là **đích của Link
bắt buộc** ở khắp §3, và một trong số đó giữ trường quyết định tiền.

**Mẫu chung** (mọi bảng dưới đây có, không kê lại từng bảng): `ma` (Data, UNIQUE NOT NULL,
counter, Read Only) · `ten` (Data, NOT NULL) · `ghi_chu` (Small Text) · `disabled` (Check,
DEFAULT 0 — **khoá thay vì xoá**, vì bản ghi cũ vẫn trỏ tới) · `deleted_at` (Datetime, ẩn).

#### `Khach Hang`

| Field | Kiểu | Ràng buộc | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|
| **`loai_khach`** | Select | **NOT NULL** | Select `*` | `Đại lý\nKhách lẻ` | `Khách lẻ` | xem all / sửa sale+ | **TRƯỜNG QUYẾT ĐỊNH TIỀN.** `Don Hang.loai_khach` copy từ đây (§3.4), rồi §3.2 dùng nó chọn `co_so_dai_ly` hay `co_so_khach_le`. Đặt sai một khách = sai giá mọi đơn của khách đó |
| `dien_thoai` | Phone | — | Phone | — | — | " | Tìm theo 4 số cuối |
| `dia_chi` | Small Text | — | Small Text | — | — | " | |
| `ma_so_thue` | Data | — | Data | — | — | all / kế toán | Đại lý mới cần |
| `cong_no_toi_da` | Currency | ≥ 0 | Currency | ≥ 0 | 0 | all / **GĐ** | 0 = không giới hạn. Cảnh báo khi lên đơn vượt, **không chặn** |
| `nguoi_phu_trach` | Link→`Nhan Vien` | — | Link | tồn tại | user đang đăng nhập | all / QLBH+ | Sale mặc định khi tạo đơn |

> **Mặc định `Khách lẻ` là cố ý**: khách lẻ luôn tính trên `RPBR` — rộng nhất, đắt nhất (§3.2).
> Quên đặt loại thì báo giá **cao hơn** thực tế, khách sẽ hỏi lại; mặc định ngược lại thì báo giá
> **thấp hơn**, và xưởng chỉ biết sau khi đã cắt.

#### `Nha Cung Cap`

Mẫu chung + `dien_thoai` (Phone) · `dia_chi` (Small Text) · `ma_so_thue` (Data) ·
`mat_hang` (Small Text — nhôm cây / phụ kiện / sơn) · `che_do_bh_mac_dinh` (Select, cùng danh sách
`Bao Hanh.che_do_bh` §3.11, autofill khi lập phiếu bảo hành).

#### `Nhan Vien`

| Field | Kiểu | Ràng buộc | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|
| `user` | Link→`User` | UNIQUE, nullable | Link | tồn tại | — | all / **GĐ** | Để `Don Hang.nguoi_phu_trach` tự điền theo người đăng nhập (§3.4) và để row-level của Sale hoạt động |
| `bo_phan` | Select | NOT NULL | Select `*` | `Bán hàng\nKế toán\nKho\nSản xuất\nQuản lý` | — | " | |
| `to` | Link→`To` | nullable | Link | tồn tại | — | " | Chỉ bộ phận Sản xuất |
| `ten_khac` | Small Text | — | Small Text | — | — | " | **Các cách gõ cũ trong sổ Excel.** Script nhập liệu tra cột này để gộp 9 chuỗi về 5 người |

> `user` rỗng là hợp lệ (thợ không có tài khoản), nhưng **`nguoi_phu_trach` của đơn thì bắt buộc
> trỏ tới bản ghi có `user`** — không thì không ai đăng nhập được để sửa đơn của chính mình.

#### `Mau Son`

Mẫu chung + `nhom_mau` (Select `Sơn thường\nVân gỗ\nAnode\nHàng thô`) · `ma_son_ncc` (Data) ·
`phu_thu_ma` (Link→`Phu Thu`, nullable).

> `nhom_mau = Vân gỗ` phải nối tới khoản `SON_VAN_GO` (+360.000 đ/m², §3.6b) và `Hàng thô` tới
> `HANG_THO` (−70.000). Nối bằng **dữ liệu**, không bằng `if` trong controller — thêm màu vân gỗ
> mới thì không ai phải sửa code.
>
> Đây cũng là bảng **lò sơn gom mẻ** theo (§3.12): một mẻ 3 tiếng chỉ chạy một `Mau Son`.

#### `To` (tổ sản xuất)

Mẫu chung + `bo_phan` (Select, cùng 6 giá trị `Dinh Muc Gio.bo_phan` §3.12) ·
`to_truong` (Link→`Nhan Vien`) · `suc_chua_ngay_m2` (Float, ≥ 0 — năng lực ngày, để xếp lịch).

#### `Tai Khoan`

| Field | Kiểu | Ràng buộc | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|
| `loai` | Select | NOT NULL | Select `*` | `Tiền mặt\nNgân hàng\nCông nợ` | — | xem kế toán+GĐ / sửa **GĐ** | 8 giá trị sổ = 6 TK ngân hàng + tiền mặt + công nợ |
| `so_tk` | Data | — | Data | — | — | " | Chỉ khi `Ngân hàng` |
| `ngan_hang` | Data | — | Data | — | — | " | |
| `chu_tk` | Data | — | Data | — | — | " | |
| `so_du_dau` | Currency | NOT NULL DEFAULT 0 | Currency | — | 0 | " | **Lưu chuỗi — parse trước khi cộng** (§1.1) |

> `Tai Khoan` **không** cho Sale và Tổ trưởng đọc: bỏ role ra khỏi `permissions` là không thấy gì
> cả, chặt hơn mọi cách ẩn nút.

## 4. Máy trạng thái

### 4.1 `Don Hang`

```
Nháp ──duyệt──> Chờ duyệt ──duyệt──> Đã duyệt ──lên lệnh──> Đang sản xuất
                    │                     │                        │
                 từ chối                 huỷ                    huỷ (ghi lý do)
                    ↓                     ↓                        ↓
                 Nháp                   Huỷ                      Huỷ
                                                                  │
Đang sản xuất ──hoàn thành──> Chờ giao ──giao──> Đã giao ──thu đủ──> Đã thu tiền
```

| Trạng thái | Nút hiện | Ai bấm | Chặn |
|---|---|---|---|
| Nháp | Gửi duyệt · Xoá | Sale | |
| Chờ duyệt | Duyệt · Từ chối | QLBH, GĐ | Sale bấm → **403** |
| Đã duyệt | Lên lệnh SX · Huỷ | Thủ kho, QLBH | Chặn nếu `hinh_thuc_tt = Đặt cọc` mà `so_tien_coc = 0` |
| Đang sản xuất | Hoàn thành · Huỷ | Tổ trưởng | **Chặn sửa dòng đơn** |
| Chờ giao | Giao hàng | Thủ kho | |
| Đã giao | Ghi thu | Kế toán | |

**`allow_self_approval` — khai RÕ, không để mặc định tự quyết.** Lõi đặt cờ này **false** trên mọi
transition làm tăng `docstatus`, tức người tạo đơn không tự duyệt được đơn của mình.

| Transition | `allow_self_approval` | Vì sao |
|---|---|---|
| Nháp → Chờ duyệt (Sale) | *(không tăng docstatus, không áp dụng)* | |
| **Chờ duyệt → Đã duyệt (Quản lý bán hàng)** | **false** | Đây là lý do workflow tồn tại. QLBH tự lên đơn thì phải nhờ GĐ duyệt |
| **Chờ duyệt → Đã duyệt (Giám đốc)** | **true** | GĐ là chốt cuối; để false thì đơn GĐ tự lập **kẹt vĩnh viễn** vì không còn ai cao hơn duyệt. Ghi rõ chuỗi `"…,\"Giám đốc\",\"self\""` trong brief |
| Chờ duyệt → Nháp (từ chối) | *(giảm/giữ docstatus)* | |

> Cặp false/true này là **cố ý bất đối xứng** và phải có test: Sale lập → QLBH duyệt (OK);
> QLBH lập → QLBH duyệt (**403**); GĐ lập → GĐ duyệt (OK). Thiếu dòng cuối thì app cài xong,
> giám đốc lập đơn đầu tiên, và không ai trong xưởng mở khoá được nó.

### 4.2 `Lenh San Xuat`

```
Mới → Đang cắt → Đang sơn → Đang lắp → Hoàn thành
                     └──> Báo lỗi (sinh Cua Loi, quay lại Đang cắt)
```

## 5. API

Lõi đã có sẵn CRUD/list/report qua `frappe.client.*` và `frappe.desk.*`. App thêm **15 method**
cho phần lõi không biết. **Đây là danh sách DUY NHẤT** — §6.4 và BRD §6 chỉ được trỏ về đây, không
kê lại tên method, vì tên viết hai chỗ là tên sẽ trôi.

| Method | Vào | Ra | Quyền | Ghi? |
|---|---|---|---|---|
| `alumdoor.tinh.kich_thuoc` | `dong_cua, loai_ray, cll_mm, rll_mm, co_ban_buom` | `cpb, rpbr, rpbn, rcl` | mọi role đăng nhập | |
| `alumdoor.tinh.so_la` | `ma, doi, cpb_mm` | `so_la_ruot, so_la_nhom, raw, buoc_la, nguon` | " | |
| `alumdoor.tinh.don_gia` | `dong_cua, do_day, dien_tich, loai_khach` | `don_gia, bac, phu_thu[]` | " | |
| `alumdoor.tinh.bao_gia` | cả 3 cái trên + `so_bo` | **số lá + kích thước + tiền + cây khả dụng** | " | |
| `alumdoor.don_hang.xo_dong` | `don_hang, dong` | dòng nảy ra (đơn giá 0, khoá) | sale+ | ✍ |
| `alumdoor.don_hang.tao_tu_bao_gia` | kết quả `tinh.bao_gia` + `khach_hang` | `Don Hang` nháp | sale+ | ✍ |
| `alumdoor.don_hang.duyet_chiet_khau` | `dong, chiet_khau_pct` | dòng đã mở khoá | **chỉ GĐ** | ✍ |
| `alumdoor.kho.xem_truoc_cat` | `lenh_san_xuat, cay_nhom[]` | lá cắt được, đầu thừa | thủ kho | |
| `alumdoor.kho.giu_cay` | `lenh_san_xuat, cay_nhom[]` | biên nhận, cây → `Khoá` | thủ kho | ✍ |
| `alumdoor.kho.cat_va_tru_ton` | `lenh_san_xuat, cay_nhom[], so_la, so_la_hong` | phiếu cắt + tồn mới (+ `Cua Loi` nếu hỏng) | thủ kho | ✍ |
| `alumdoor.kho.hoan_cat` | `phieu_cat, kho_hoan_m, so_la_hoan` | cây cập nhật đầu thừa | thủ kho | ✍ |
| `alumdoor.kho.dao_cat` | `phieu_cat, ly_do` | lá nguyên khổ về **đúng cây cũ** | thủ kho | ✍ |
| `alumdoor.kho.nhap_tra` | `don_hang, so_la, kho_m` | lá **đã cắt** vào cây khổ mới | thủ kho | ✍ |
| `alumdoor.kho.kiem_ke` | `kho, dong[]` | chênh lệch kiểm kê | thủ kho, GĐ | ✍ |
| `alumdoor.tai_chinh.ghi_thu` | `don_hang, so_tien, tai_khoan` | phiếu thu + `da_thu` mới | kế toán | ✍ |
| `alumdoor.tai_chinh.dao_phieu` | `phieu_thu_chi, ly_do` | phiếu đảo (§7.1) | kế toán, GĐ | ✍ |
| `alumdoor.bao_cao.lai_lo` | `tu_ngay, den_ngay` | lãi/lỗ từng đơn | **chỉ GĐ** | |
| `alumdoor.bao_cao.doi_soat` | `tu_ngay, den_ngay` | danh sách lệch (§7.2) | GĐ, kế toán | |

Bốn method `tinh.*` là **thuần số học, không đọc tenant** — test được không cần DB, giống
`slats.ts` cũ nhưng lần này **đọc bản lá từ DocType chứ không hardcode**.

> BRD §6 gọi phương thức tạo phiếu cắt là `alumdoor.san_xuat.tao_phieu_cat`; tên chốt là
> **`alumdoor.kho.cat_va_tru_ton`** — cùng một việc, nhưng tên mới nói ra cái nguy hiểm nó làm
> (trừ tồn), chứ không chỉ cái vô hại (tạo phiếu).

### 5.1 Validator — chặn ở đường GHI, không phải ở nút

`validators` chỉ biên dịch khi brief có `worker` (`compile-brief.mjs:1272`). Action hợp lệ:
`create · save · submit · cancel · amend · delete`.

| DocType | Action | Chặn cái gì |
|---|---|---|
| `Quy Cach Cua` | save | **Cấm gán `be_rong_nan_mm/1000` vào `buoc_la_m`** (§3.1). Hai số lệch 1–2 mm ở 5 mã |
| `Vat Tu` | create, save | `nhom = Thành phẩm cửa` mà trống `quy_cach_cua` ⇒ từ chối (§3.9) |
| `Don Hang` | save, submit | `rll_mm > rong_toi_da_mm`; đơn `Đặt cọc` mà `so_tien_coc = 0`; sửa dòng khi đang sản xuất |
| `Dong Don Hang` | save | `chiet_khau_pct > 15` chưa có duyệt GĐ; sửa dòng có `khoa_don_gia = 1` |
| `Cay Nhom Ton` | save | `so_la` âm; sửa cây đang `Khoá` bởi lệnh khác |
| `Phieu Thu Chi` | submit, cancel | `so_tien > con_lai` của đơn; huỷ phiếu đã đối soát |
| **mọi bảng nghiệp vụ** | **delete** | **Xoá cứng ⇒ từ chối, buộc đi `deleted_at`.** Chữ quyền không có `d` (xoá đi đường `write`), nên đây là **chỗ duy nhất** chặn được |

## 6. Mặt brief — thứ PHA 5 phải khai mà ledger không nói

Ledger tả **dữ liệu**. Gói app còn một nửa nữa: quyền, thanh bên, màn, in, báo cáo. Chốt ở đây để
PHA 5 không phải nghĩ ra.

### 6.1 Vai trò → chữ quyền từng DocType

`r` đọc (kéo theo print/email/report/export) · `w` ghi · `c` tạo · `s` submit · `x` cancel ·
`a` amend. **Không có `d`** — xoá đi đường `write`, nên "rwc mà tưởng chặn xoá" là sai; chặn xoá ở
validator §5.1. **Role không có mặt trong `permissions` = không thấy gì cả.**

| DocType | Sale | QL bán hàng | Kế toán | Thủ kho | Tổ trưởng | Giám đốc |
|---|---|---|---|---|---|---|
| `Quy Cach Cua` · `Chinh Sach Cat` · `Bang Gia` · `Phu Thu` | r | r | r | r | r | rwc |
| `Vat Tu` · `Dinh Muc` · `Dinh Muc Gio` | r | rwc | r | r | r | rwc |
| `Khach Hang` | rwc | rwc | r | — | — | rwc |
| `Nha Cung Cap` | r | r | rwc | rwc | — | rwc |
| `Nhan Vien` · `To` · `Kho` · `Mau Son` | r | r | r | r | r | rwc |
| `Tai Khoan` | — | — | rw | — | — | rwc |
| **`Don Hang`** | **rwc** | **rwcsxa** | rw | rw | r | **rwcsxa** |
| `Lenh San Xuat` | r | r | r | rwc | rw | rwcsxa |
| `Cay Nhom Ton` | r | r | r | rwc | r | rwcsxa |
| `Cua Loi` | r | rwc | r | rwc | rwc | rwcsxa |
| `Bao Hanh` | rw | rw | rwc | rwc | — | rwcsxa |
| **`Phieu Thu Chi`** | r | r | **rwcsx** | — | — | **rwcsxa** |

Bảng con (`Dong Don Hang` · `Dot Giao Hang` · `Phieu Cat` · `Dong Dinh Muc`) theo quyền bảng cha.

**Ba chỗ dễ khai sai:**

- **Sale không có `s` trên `Don Hang`.** "Gửi duyệt" là transition của workflow, còn `s` là quyền
  đẩy `docstatus` lên 1 — tức duyệt. Cho Sale chữ `s` là mở toang cả cái workflow.
- **Kế toán có `x` (cancel) trên `Phieu Thu Chi` nhưng không có `a` (amend).** Huỷ để đảo bút toán
  thì được; sửa lại phiếu cũ thành số khác thì không — đó là xoá dấu vết.
- **Thủ kho và Tổ trưởng không có mặt ở `Phieu Thu Chi`/`Tai Khoan`.**

**Row-level**: Sale chỉ thấy đơn mình phụ trách — làm bằng **User Permission** trên `Nhan Vien`
(lõi có sẵn), không viết `scopeWhere` tay. Các role khác không giới hạn (BRD §3).

### 6.2 Thanh bên, màn chính, ngôn ngữ hiển thị

```json
"brand": "zinc",
"design": { "density": "compact", "radius": "square", "contentWidth": "wide" },
"home": "approval:Don Hang",
"navigation": { "groups": ["Tác nghiệp","Bán hàng","Sản xuất","Kho","Tài chính","Báo cáo","Danh mục","Cấu hình"] },
"locale": { "currency": "VND", "dateFormat": "dd/MM/yyyy" }
```

| Chọn | Vì sao |
|---|---|
| `zinc` | Xưởng nhôm; app dùng dưới đèn xưởng và trên máy văn phòng, màu trung tính đọc số nhanh nhất |
| `compact` + `square` | Màn tạo đơn hơn 20 ô, bảng tồn nhôm 9 cột. Bo góc và khoảng thở ăn mất một dòng dữ liệu mỗi màn |
| `wide` | Bảng `Cay Nhom Ton` và `Dong Don Hang` không co được nữa |
| `home = approval:Don Hang` | **Cả 6 role đều có `r` trên `Don Hang`** nên không role nào mở app ra màn trắng — đây đúng là bước kiểm 4 của lệnh cài |
| `dimensions: []` | **Cố ý không dùng dimension `warehouse`.** BRD §3 cho Thủ kho thấy *toàn bộ* kho, nên dimension chỉ thêm một selector bắt buộc; và dimension thiếu master data là bước kiểm 5 chặn cài. Hai kho đi bằng Link `kho` |

`externalDocTypes`: `[{ "name": "User", "kind": "system", "app": "forge-core" }]` — vì
`Nhan Vien.user` Link tới nó (§3.15).

### 6.3 Màn vận hành

| Khai gì | Trên DocType | Ra màn |
|---|---|---|
| `workflow` (§4.1) | `Don Hang` | `approval:Don Hang` — hàng đợi duyệt, **tự sinh**, là `home` |
| `kanban: { "stageField": "trang_thai" }` | `Lenh San Xuat` | Kanban theo công đoạn cắt→sơn→lắp (BRD §7) |
| `gantt: { "startField": "ngay_bat_dau", "endField": "ngay_hoan_thanh" }` | `Lenh San Xuat` | Lịch xưởng, để gom mẻ lò sơn cùng màu (§3.12) |
| `calendar: { "startField": "ngay_giao_du_kien" }` | `Don Hang` | Lịch giao hàng |

`screens` chỉ nhận ba block `metric` · `list` · `action` (`compile-brief.mjs:258-300`) — **không có
HTML tự do**:

- **`screen:dieu-hanh`** (permission `Don Hang`, 3 cột, group *Tác nghiệp*): metric đơn chờ duyệt ·
  metric đơn đang sản xuất · metric cửa lỗi tháng này (tone `danger`) · metric công nợ quá hạn ·
  list 8 đơn mới nhất · action `bao-gia-nhanh`.
- **`screen:ban-kho`** (permission `Cay Nhom Ton`, `mode: "touch"`, group *Kho*): metric cây khả
  dụng · list cây sắp hết · action `cat-nhom`.

### 6.4 `actions` — chỗ giải bài toán "hiện số lá ngay lúc nhập"

BRD §7 đòi màn Tạo đơn hiện **số lá và cây nhôm sẽ cắt ngay lúc nhập số đo** — *"toàn bộ lý do app
tồn tại"*. Block `metric`/`list` không làm được. `actions` thì làm được, vì nó có `preview` (method
**chỉ đọc**, xem trước điều sắp xảy ra) tách khỏi `commit` (method ghi thật):

| Action | Fields | `preview` | `commit` |
|---|---|---|---|
| `bao-gia-nhanh` | `khach_hang:Link(Khach Hang)!` · `ma_hang:Link(Vat Tu)!` · `loai_ray:Select!` · `bien_the:Select!` · `mau:Link(Mau Son)!` · `cll_mm:Int!` · `rll_mm:Int!` · `so_bo:Int!` · `co_ban_buom:Check` | `alumdoor.tinh.bao_gia` → **số lá ruột/lá nhôm, kích thước quy đổi, tiền tạm tính, cây khả dụng** | `alumdoor.don_hang.tao_tu_bao_gia` |
| `cat-nhom` | `lenh_san_xuat:Link!` · `cay_nhom:Link!` · `so_la:Int!` · `so_la_hong:Int` | `alumdoor.kho.xem_truoc_cat` | `alumdoor.kho.cat_va_tru_ton \| Cắt thật \| Cắt và trừ tồn?` |
| `hoan-cat` | `phieu_cat:Link!` · `kho_hoan_m:Float` · `so_la_hoan:Int` | đầu thừa sẽ trả về cây nào | `alumdoor.kho.hoan_cat` |
| `ghi-thu` | `don_hang:Link!` · `so_tien:Currency!` · `tai_khoan:Link!` | số còn nợ hiện tại | `alumdoor.tai_chinh.ghi_thu` |
| `dao-phieu` | `phieu_thu_chi:Link!` · `ly_do:Small Text!` | phiếu sẽ đảo | `alumdoor.tai_chinh.dao_phieu \| Đảo phiếu \| Ghi bút toán ngược?` |

`resultTable` trỏ vào mảng dòng để hiện bảng. `permission` của mỗi action là doctype dùng chặn
quyền vào màn — `bao-gia-nhanh` chặn theo `Don Hang`, `cat-nhom` theo `Cay Nhom Ton`,
hai action tiền theo `Phieu Thu Chi`.

### 6.5 In — khai được, đừng làm tay

Schema `prints` (`brief.schema.json:645`) nhận `html` + `css`, lặp dòng `{{#each items}}`, tiền
`{{ tong_tien | money }}`, ngày `{{ ngay_dat | date }}`.

| Mẫu | DocType | Phải có |
|---|---|---|
| `phieu-san-xuat` | `Lenh San Xuat` | **Cột (6) `so_la_nhom`** (đã gồm lá đầu) và **cột (13) bộ 3 lá đáy** — hai số khác nhau, §3.1 |
| `phieu-cat` | `Lenh San Xuat` | Theo từng cây: mã nhôm, màu, khổ, số lá cắt, chiều dài cắt |
| `xac-nhan-don` | `Don Hang` | Kích thước quy đổi, tiền bằng chữ, khu chữ ký, số CT |
| `phieu-thu-chi` | `Phieu Thu Chi` | Loại, đối tượng, tài khoản, số tiền bằng chữ, chữ ký |

> `docs/APP_FACTORY.md` ghi *"Brief chưa khai được print format"* — **đã cũ**. `compilePrint`
> (`compile-brief.mjs:1170`) và schema `prints` đã có. Cùng chỗ đó ghi thiếu cả `kanban`/`gantt`.
> Đọc code, đừng đọc mô tả.

### 6.6 Báo cáo và biểu đồ

Mỗi report đúng **một** doctype; có cột gộp thì **bắt buộc** `groupBy`; cột trần phải chính là
field gộp; `Link` phải nêu doctype đích; `count(name)` mới là đếm bản ghi.

| Report | DocType | groupBy | Cột |
|---|---|---|---|
| `doanh-thu-nhan-vien` | `Don Hang` | `nguoi_phu_trach` | `nguoi_phu_trach:Link(Nhan Vien)` · `count(name):Int` · `sum(tong_tien):Currency` |
| `cong-no-khach` | `Don Hang` | `khach_hang` | `khach_hang:Link(Khach Hang)` · `sum(tong_tien)` · `sum(da_thu)` · `sum(con_lai):Currency` |
| `cong-no-ncc` | `Phieu Thu Chi` | `doi_tuong` | `doi_tuong:Data` · `sum(so_tien):Currency` |
| `cua-loi-nguyen-nhan` | `Cua Loi` | `nguyen_nhan` | `nguyen_nhan:Data` · `count(name):Int` · `sum(chi_phi_uoc_tinh):Currency` |
| `ton-nhom` | `Cay Nhom Ton` | `ma_nhom` | `ma_nhom:Link(Quy Cach Cua)` · `count(name):Int` · `sum(so_la):Int` |

`charts` tối đa 3, luôn lấy từ report đã khai: doanh thu theo NV (`Bar`) · cửa lỗi theo nguyên nhân
(`Pie`) · công nợ khách (`Bar`, `roles: ["Kế toán","Giám đốc"]`).

### 6.7 `fixtures` — và vì sao KHÔNG đủ để app chạy được

> **`fixtures` đi vào một KHO KHÁC với DocType — biết chỗ đó thì dùng đúng, không biết thì
> tưởng mất dữ liệu.**
>
> Installer ghi fixtures vào bảng **`master_records`** (`app-registry/src/installer.ts:272`),
> không phải bảng `documents`. Hai kho, hai đường đọc:
>
> | Đọc bằng | Thấy `master_records`? | Dùng ở đâu |
> |---|---|---|
> | `getMasterRecordData` · `listMasterRecordData` · `listMasterRecords` (`d1-store.ts:569-670`) | **có** (union cả hai kho) | Link picker · kiểm tồn tại của Link · kernel giá và kho |
> | `frappe.client.get_list` → `/api/resource/<doctype>` | **không** — chỉ `documents` | Màn danh sách và CRUD của Desk |
>
> Đo trên tenant thật: cài báo `34 fixtures`, `master_records` đủ 34 dòng, mà
> `GET /api/resource/Quy Cach Cua` trả **rỗng**. Router còn ghi chú đúng chuyện này ở dòng 3245:
> *"Historical app fixtures also live in master_records, but they are not rows in the Warehouse
> screen."*
>
> **Alumdoor 1.x chạy được chính nhờ đường thứ nhất** — `Cutting Policy` và `Measurement Profile`
> của nó là fixture, và engine đọc chúng qua API master-record chứ không qua màn danh sách.
>
> ⇒ Với app này thì **vẫn phải vật chất hoá thành bản ghi thật**, vì hai lý do:
> `docs.ts` đọc bằng `frappe.client.get_list`, và Giám đốc phải **sửa được bản lá trên Desk**
> (§6.1 cho `Quy Cach Cua` quyền `rwc`) — mà màn đó không thấy fixture.
> `server/scripts/import-alumdoor.mjs` đọc thẳng mảng `fixtures` của brief rồi `POST` qua
> `/api/resource/...`. Đọc từ brief chứ không chép lại số liệu — bản lá viết hai lần là bản lá
> sẽ trôi.

Bốn bảng dưới là **cấu hình không có thì engine ném lỗi**, không phải dữ liệu mẫu:

| Fixture | Số bản ghi | Nguồn |
|---|---|---|
| `Quy Cach Cua` | 23 | `image2.png` + `GHI CHÚ` |
| `Chinh Sach Cat` | 6 dòng cửa × 2 ray | §3.2 + sheet `CT TT-SX` |
| `Phu Thu` | 7 | §3.6b |
| `Kho` | 2 | cột `KHO (1-2)` |
| `Tai Khoan` | 8 | sổ `TTTT` |

## 7. Rủi ro CRITICAL — bằng chứng bắt buộc trước khi gọi là xong

`docs/VALIDATION_GATES.md` §1.5–1.6: thay đổi chạm **finance, stock, payroll luôn là CRITICAL**, và
finance/stock CRITICAL **bắt buộc** có bằng chứng đảo/sửa sai **và** đối soát. App này chạm cả hai:
tiền (`Phieu Thu Chi`, cọc, chiết khấu, VAT) và kho (trừ tồn theo cây).

⇒ Profile validation của PHA 6 phải khai:

```json
{
  "changeId": "alumdoor-v1",
  "risk": "CRITICAL",
  "domains": ["finance", "stock"],
  "touches": { "authoritativeMutation": true, "tenantBoundary": true, "ui": true, "mobile": true, "migration": true }
}
```

### 7.1 Đảo / sửa sai (`correction_reversal`) — **dùng lõi, cấm viết lại**

**Không sửa số, không xoá — ghi bút toán ngược.** `alumdoor.tai_chinh.dao_phieu` sinh một
`Phieu Thu Chi` mới, số tiền âm ngược lại, `so_ct` mới, trỏ về phiếu gốc; phiếu gốc chuyển
`docstatus = 2`, **giữ nguyên số**. Cùng luật cho kho: cắt nhầm thì ghi phiếu cắt đảo trả lá về
cây, không sửa `so_la` của cây.

> **`packages/ledger` có `reverseGl` · `reverseStock` · `reversePayment` — nhưng KHÔNG dùng
> thẳng được, và bản trước của file này nói ngược.** Ba hàm đó nhận `GeneralLedgerEntry` /
> `StockLedgerEntry` / `PaymentLedgerEntry`: **dòng của bảng `gl_entries` và
> `stock_ledger_entries`**, tức sổ cái của tầng `clouderp-*` đã bị gỡ ở `741caeb7`. App này ghi
> `Phieu Thu Chi` — một DocType, không phải dòng sổ cái. Ép kiểu qua lại chỉ tạo ra một lớp dịch
> mà không ai bảo trì.
>
> **Dùng cái thật sự dùng lại được:**
>
> | Của lõi | Dùng cho |
> |---|---|
> | `packages/money`: `toScaledInt` · `addMinor` · `negateMinor` · `percentOfMinor` | MỌI phép tiền. Đây mới là chỗ `parseFloat` giết người |
> | Quy ước `REV-<khoá gốc>` của `reverseGl` | Đặt tên phiếu đảo, để đọc log là biết ngay dòng nào đảo dòng nào |
> | `assertBalancedGl` | Chỉ khi nào app thật sự sinh bút toán kép — bản 1 chưa |
>
> Bài học vẫn giữ nguyên: **số học tiền không viết tay**. Nhưng "gọi thẳng hàm đảo của lõi" là
> một câu sai, và một câu sai trong tài liệu thiết kế thì tốn của PHA 5 nửa ngày mới biết.

Test: ghi thu 10tr → đảo → `da_thu` về đúng số cũ, và **sổ còn đủ hai dòng**.

**Kho có BA nghiệp vụ trả lá, không phải một** — worker đời trước tách đúng, bản thiết kế này từng
gộp nhầm thành một `hoan_cat`:

| Method | Tình huống | Lá về đâu |
|---|---|---|
| `alumdoor.kho.hoan_cat` | Cắt xong còn **đầu thừa** | Cây cũ, ghi `kho_hoan_m`/`so_la_hoan` (§3.3) |
| `alumdoor.kho.dao_cat` | **Ghi nhầm phiếu cắt** | Lá **nguyên khổ** về đúng cây cũ — đảo sạch |
| `alumdoor.kho.nhap_tra` | **Khách trả hàng** | Lá **đã cắt** vào cây khổ mới, không nhập lại cây cũ |

Gộp ba cái làm một là cách chắc chắn để tồn kho đúng tổng nhưng sai khổ — và khổ mới là thứ quyết
định lần cắt sau có dùng được không.

### 7.2 Đối soát (`reconciliation`)

**Đọc trước khi viết:** tenant migration còn nguyên bốn bài đối soát của bản cũ —
`0110_rc023_cash_bank_reconciliation` · `0111_rc020_finance_gl_scope_reconciliation` ·
`0112_rc021_finance_ar_reconciliation` · `0110_rc020_finance_posting_period_integrity`, và
`packages/query/src/finance-stock-control.ts` có sẵn report *Stock Valuation Reconciliation*.
PHA 5 **phải kiểm xem bài nào dùng lại được** trước khi viết `alumdoor.bao_cao.doi_soat`; chỉ viết
phần lõi không có.

Hai phép riêng của app này, cả hai phải bằng 0:

| Đối soát | Công thức | Lệch nghĩa là |
|---|---|---|
| Tiền | `Σ Phieu Thu Chi(don_hang=X, docstatus=1).so_tien` − `Don Hang[X].da_thu` | Denormalize §3.14 đã trôi |
| Kho | `Σ Phieu Cat(cay=Y).so_la_cat` + `Cay Nhom Ton[Y].so_la` − số lá ban đầu | Trừ tồn hụt hoặc trừ hai lần |

### 7.3 Tranh chấp khi hai người cắt cùng một cây

`tru-ton-cay.ts` là **check-then-act**: đọc `so_la`, trừ, ghi. Hai lệnh cắt cùng lúc trên một cây
thì cả hai đều đọc thấy đủ lá.

Chốt cách chặn — **hai lớp, không chọn một**:

1. `alumdoor.kho.giu_cay` đặt `trang_thai = Khoá` **trước** khi mở màn cắt; cây đã `Khoá` thì lệnh
   khác không giữ được (validator §5.1).
2. Mọi lệnh ghi lên `Cay Nhom Ton` đi kèm `expected_version` (§2). Sai version ⇒ **409**, màn cắt
   nạp lại số thật thay vì ghi đè.

Test bắt buộc: hai lời gọi song song trên cùng một cây ⇒ đúng **một** thành công, một nhận 409, và
`so_la` cuối cùng trừ **đúng một lần**. Đây chính là món "idempotency/retry" của bảng gate — và là
lỗi mà sổ tay Forge ghi *"chỉ lộ ở lần chạy thứ hai, và chỉ khi có người đếm"*.

### 7.4 Còn phải có

`tenant_isolation` (mọi query lọc `tenant_id` ở tham số thứ nhất) · `migration_replay` (chạy lại
migration hai lần) · `browser E2E` desktop + **mobile** (thủ kho quét mã trên điện thoại) ·
`production_release_marker` khớp đúng head SHA nếu tuyên bố DEPLOYED.

## 8. Việc phải làm ở PHA 5

1. Brief JSON khai **24 DocType** theo ledger §3 — 18 ở §3.1–§3.14 + 6 danh mục ở §3.15, trong đó
   **4 là bảng con** (`Dong Don Hang` · `Phieu Cat` · `Dong Dinh Muc` · `Dot Giao Hang`, khai
   `"child": true`, không lên menu) — kèm toàn
   bộ mặt brief §6: `permissions` · `workflow` + `allow_self_approval` · `kanban` · `gantt` ·
   `calendar` · `screens` · `actions` · `prints` · `reports` · `charts` · `fixtures` · `locale` ·
   `externalDocTypes`
2. Controller `chia-la.ts` — đọc `Quy Cach Cua` + `Chinh Sach Cat`, **không hardcode bản lá**
3. Controller `xo-dong.ts` — luật trọn bộ, đơn giá 0 + khoá
4. Controller `tru-ton-cay.ts` — trừ tồn theo cây, **giữ cây + `expected_version`** (§7.3), bắt
   buộc sinh `Cua Loi` khi có lá hỏng
5. Controller `tai-chinh.ts` — ghi thu, cập nhật `da_thu`/`con_lai`, đảo phiếu **bằng
   `reverseGl`/`reversePayment` của `packages/ledger`** và cộng tiền bằng `packages/money`, không
   tự viết (§7.1)
6. Validator theo §5.1, **gồm cả `delete` cho mọi bảng nghiệp vụ**
7. Script nhập dữ liệu cũ: 4 file gốc → DocType, **gộp 9 chuỗi tên về 5 người** qua
   `Nhan Vien.ten_khac`
8. **Trước khi khai fixture**: mở `server/imports/alumdoor-1.27.0.manifest.json` đối chiếu 54
   fixture của bản cũ (§1.2) — nhất là 5 bản ghi `— công thức chuẩn`, `Cửa Đức — đại lý/khách lẻ`,
   và hai kho `K36`/`K12`
9. **Trước khi viết `doi_soat`**: đọc 4 migration đối soát còn sót và `finance-stock-control.ts`
   (§7.2), chỉ viết phần lõi không có
10. Test theo `testing-contract`: sinh từ ledger + 4 ví dụ chia lá của xưởng + test quyền bypass
    API + ba bài của §7 (đảo, đối soát, cắt song song)

## 9. Câu chờ xưởng

**Không còn câu nào chặn.** Câu Siêu Trường ở bản trước đã **tự trả lời trong chính tài liệu**:
sheet `CT TT-SX` của `QUY CÁCH` có đủ chuỗi quy đổi, cơ sở tính tiền và bước lá — chép ở §3.2.
Xoá khỏi danh sách chờ, engine **tính bình thường** cho dòng Siêu Trường.

> Đây là lần thứ **sáu** một câu "phải hỏi xưởng" hoá ra đã nằm trong tài liệu (BRD §9 ghi năm câu
> trước). Luật rút ra: đọc hết ảnh nhúng, PDF rời và mọi sheet trước khi mở một dòng "chờ xưởng".

Còn hai chỗ **cố ý không đoán**, và cả hai đã có đường đi không cần hỏi:

| Chỗ | Xử lý |
|---|---|
| Mã tiêu hao ngoài 4 mã `cong_thuc` đã biết (§3.10) | Cảnh báo, để thợ nhập tay |
| Mã nhôm chưa có bản ghi `Quy Cach Cua` | Ném lỗi *"Chưa có công thức chia lá cho `<mã>`"* — cấm mượn công thức mã khác |
