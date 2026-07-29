# MỤC 0 — PHIÊN 29/07/2026: 1.20.1 → 1.27.0

Chèn vào `ALUMDOOR-HANDOFF.md` như mục 0. Ghi những gì vừa đổi, **vì sao**, và những chỗ cố ý
bỏ ngỏ chờ chủ xưởng. Mục 1–10 của file bàn giao vẫn đúng trừ những chỗ dưới đây nói khác.

---

## 0.1 Việc lớn nhất: lỗi quá hạn 2 giây đã hết

**Trước:** không lưu nổi một chứng từ mua nào có nhiều dòng.
`alumdoor could not check this change: timed out after 2000ms`

**Sau:** đơn mua 3 dòng nhôm (đúng phiếu Tiến Đạt 22/7) lưu được — `DMH-2026-0076`, 503,4 kg.

Đây là lỗi chặn lâu nhất của dự án, và nó **không phải** do app chậm. Ba nguyên nhân chồng lên:

1. **Ba bộ kiểm cùng đọc lại một dữ liệu.** Một phiếu mua chạy qua `validateTransactionLines`
   → `validatePurchaseMeasurement` → `validateDocumentColors`, cả ba đều bắt đầu bằng đọc Item
   của từng dòng. Phiếu 3 dòng tốn 9 lượt đọc Item thay vì 3.
   → Vá: `masterCache` trong `apps-src/alumdoor-worker/src/index.ts`, `WeakMap` khoá theo chính
   hàm `call` (tạo mới mỗi request nên cache sống đúng một lượt kiểm). **Nhớ lời hứa chứ không
   nhớ kết quả** — hai bộ kiểm hỏi cùng lúc chỉ bắn ra một lượt gọi thật. Lỗi mạng thì xoá khỏi
   cache, không để một lời hứa hỏng làm hỏng cả lượt.

2. **Ba đợt chờ nối đuôi.** Cache bỏ được lượt trùng nhưng không đổi được thứ tự.
   → Vá: `warmMasters()` đọc trước, song song: Item và Item Color đi cùng lúc (không phụ thuộc
   nhau); chỉ Measurement Profile phải đợi vì tên profile nằm trong bản ghi Item. Còn 2 đợt.

3. **Hạn mức 2 000 ms không phản ánh thực tế nền tảng.**
   `VALIDATOR_TIMEOUT_MS` trong `packages/app-registry/src/validation.ts` → **5 000 ms**.

   > App Worker cố ý KHÔNG có binding dữ liệu nào. Mọi master nó cần đều đi ngược qua gateway
   > dưới danh tính người gọi: một lượt đọc = app → gateway → tenant → về. Con số 2 000 ms được
   > đặt cho bộ kiểm chỉ *tính*. Đo thật: 2 800 ms. **Một hạn mức mà không bộ kiểm đúng nào đạt
   > được thì không bảo vệ gì cả** — nó chỉ làm tính năng trông như hỏng, và nó đã chặn MỌI
   > chứng từ kể từ ngày cơ chế validator ra đời.

**Không hạ lại 2 000 ms.** Nếu thấy chậm thì gộp lời gọi ở phía app (xem `warmMasters`), đừng
siết hạn mức — hạn mức không phải chỗ hấp thụ một bộ kiểm chưa gộp.

---

## 0.2 Lỗi nền tảng đã sửa (ảnh hưởng MỌI tenant, không riêng Alumdoor)

### `link_filters` chưa từng tới được client

`toFrappeDocField()` trong `packages/frappe-api/src/meta-shape.ts` chỉ gửi ra một danh sách
thuộc tính cố định, và `link_filters` không có trong đó. Kernel vẫn lưu đầy đủ, client vẫn có
`buildLinkFilters` để đọc — nhưng con số không bao giờ đi hết đoạn đường.

Hậu quả: **mọi ô Link trên toàn nền tảng bỏ qua bộ lọc của nó**, im lặng. Ô vẫn mở, vẫn tìm
được, chỉ là hiện cả bản ghi không được phép chọn. Không lỗi nào hiện ra cho tới khi ai đó lập
phiếu mua một mặt hàng không mua được.

Đúng loại lỗi mà chính doc-comment của file ấy đã cảnh báo về `depends_on`/`fetch_from`.

### Check muốn lọc được thì phải `in_standard_filter`

`filterFields` dựng từ: `name`, `docstatus`, `status`, tree parent, **mọi Link**, cộng field có
`in_list_view` hoặc `in_standard_filter`. Một `Check` không đánh dấu thì mọi truy vấn theo nó bị
từ chối — kể cả `link_filters` của chính ô Link cần nó.
→ `is_purchase_item` / `is_sales_item` trên Item giờ có `in_standard_filter: true`.

---

## 0.3 Bảng con: chế độ bảng lớn kiểu Excel

`client/packages/views/src/form/ChildGrid.tsx` — nút **Mở bảng lớn**.

| | |
|---|---|
| Cột | Mã hàng · Màu · Cao (m) · Rộng (m) · SL · Số cây/lá · ĐVT mua · Đơn giá · Thành tiền · **TL trung bình** · Ghi chú |
| Bàn phím | ↑↓←→ · Enter xuống dòng · Tab sang phải |
| Excel | **Ctrl+V** dán vào (tự nối thêm dòng, đọc `1.234,5`) · **Ctrl+C** chép cả bảng ra |
| Nút | Thêm 10 dòng · Nhân bản dòng · Điền xuống · Đọc phiếu bằng ảnh · Cột về mặc định |
| Cột | kéo mép phải để giãn · kéo tiêu đề để đổi chỗ · nhớ trong `localStorage` theo doctype + chế độ |

### Bốn cái bẫy đã gỡ — đừng dựng lại

1. **Đơ khi mở.** Bản đầu vẽ MỌI field của dòng (26 cột trên phiếu nhôm), mỗi ô Link tự đi hỏi
   danh mục. Giờ dùng bộ cột cố định `BIG_COLUMNS`.
2. **Bảng đè ra ngoài hộp thoại.** Con flex thiếu `min-w-0` nên phình theo nội dung, đẩy cả nút
   "Lưu và quay lại" ra khỏi mép. Mặc định của flex là rộng tối thiểu bằng nội dung.
3. **Dán vào chỉ được mã hàng trơ trọi.** `onPasteGrid` ghi thẳng giá trị mà không chạy
   `fillItemDefaults`, nên tên hàng/ĐVT/giá đứng im — đúng thứ dán-từ-Excel sinh ra để khỏi làm.
   Nặng hơn: `fillItemDefaults` cũ tự gọi `onChange` với bản chụp `rows` riêng, nên bắn 40 lượt
   song song thì lượt về sau cùng đè hết. → Tách `computeItemPatch` (tính) khỏi phần ghi, thêm
   `fillItemDefaultsMany` gom một lần.
4. **Bảng trông như bị khoá cứng.** `depends_on` của các field quy cách đọc `inventory_mode` —
   thứ chỉ có SAU khi chọn mã hàng. Dòng còn trống thì gần như mọi cột hiện `—`, và **ô không
   tồn tại thì dán vào cũng không có chỗ mà vào**. Giờ bảng lớn luôn vẽ ô nhập; bảng gọn giữ `—`.

---

## 0.4 Đổi đơn vị: milimét → MÉT

`width_mm` → `width_m`, `height_mm` → `height_m`, kiểu `Int` → `Float`.
Công thức m² bỏ phép chia 1 000 000, ở **cả hai** nơi:
`packages/clouderp-core/src/uom.ts` và `ChildGrid.withComputed`.

Đổi được sạch vì lúc chuyển **chưa có chứng từ nào** (0 đơn mua, 0 phiếu nhập, 0 đơn bán). Nếu
sau này phải đổi đơn vị nữa thì đã là bài toán nắn dữ liệu, không còn đổi tên field là xong.

Xưởng đo và báo giá theo mét (RCL 4 900 mm = 4,9 m). Bắt nhập milimét là bắt nhân nhẩm 1000 mỗi
dòng, và quên một số 0 thì diện tích lệch mười lần mà chứng từ vẫn hợp lệ.

**Lưu ý cột "Rộng":** trên phiếu có HAI field cùng nghĩa bề rộng — `length_m` (khổ cây nhôm, số
chia trong công thức kg/m) và `width_m` (rộng cửa, số nhân trong công thức m²). Đã có một vòng
gộp chúng thành một cột và chọn sai bên: người nhập gõ khổ 8,5 vào ô rộng cửa, kg/m không bao
giờ ra số. **Để riêng hai cột.**

---

## 0.5 TL trung bình — chỉ tính từ nguồn kg thật

`actual_kg_per_m`, nhãn **"TL trung bình (kg/m · kg/cái)"**. Nguồn tử số được chốt như sau:

- ĐVT giao dịch là `Kg`: `qty` chính là tổng kg thực cân.
- ĐVT là `Bộ/Cái/Cây/...`: **không** được coi `qty` là kg; chỉ tính khi người dùng nhập riêng
  `actual_weight_kg` (**Tổng kg thực cân**).

Sau khi có tổng kg thật, lấy bậc mẫu số đầu tiên dùng được:

| Có gì trên dòng | Chia cho | Ra | Ví dụ |
|---|---|---|---|
| kg + khổ + số cây | khổ × số cây | kg/m | `191,4 ÷ (8,5 × 51)` = 0,442 |
| kg + khổ | khổ | kg/m | `12 ÷ 50` = 0,240 |
| kg + số cây | số cây | kg/cái | `30 ÷ 120` = 0,250 |
| tổng kg riêng + số lượng Bộ/Cái | số lượng giao dịch | kg/ĐVT | `25 ÷ 10 Bộ` = 2,5 |
| không có nguồn tổng kg thật | — | (trống) | `222 Bộ` không còn tự sinh `0,10` |

Bản 1.26.2 lấy `qty` làm kg cho mọi ĐVT, nên một dòng mô tơ/combo bán theo Bộ có thể sinh ra
một trọng lượng vô nghĩa. Bản 1.27.0 thêm `actual_weight_kg` cho ba bảng mua và xoá kết quả cũ
ngay khi không còn đủ nguồn kg/mẫu số. Bảng lớn cũng tôn trọng `depends_on`, nên cột quy cách
nhôm không còn hiện trên hàng thường chỉ vì mở chế độ toàn màn hình.

Đây là số để **đối chiếu**, không vào sổ: lệch nhiều so với kg/m danh nghĩa nghĩa là cân sai
hoặc ghi nhầm khổ — biết lúc đang gõ thì sửa được, biết sau khi ghi sổ thì phải huỷ phiếu.

---

## 0.6 Trợ lý AI + đọc phiếu bằng ảnh

`apps/tenant-worker/src/ai-assistant.ts` · binding `AI` (Workers AI, cùng tài khoản Cloudflare —
không có khoá ngoài nào phải phát cho từng tenant, và ảnh phiếu không rời ranh giới tài khoản).

| Đường | Việc |
|---|---|
| `POST /api/method/metaforge.ai.ask` | Hỏi đáp về màn hình đang mở |
| `POST /api/method/metaforge.ai.read_receipt` | Đọc ảnh phiếu giao → các dòng hàng đề xuất |

**Hai nguyên tắc đóng cứng:**
- **AI không ghi.** Chỉ trả đề xuất; người dùng soát trên form rồi mới bấm lưu — chỗ đó mọi
  quyền và mọi luật vẫn chạy như thường.
- **AI không bịa mã hàng.** Nó đọc chữ trên giấy; việc quy về mã là do server đối chiếu danh mục
  (`purchasableItems` đọc thẳng D1). Không khớp thì **để trống ô mã** và ghi nguyên văn vào ghi
  chú. Khớp mờ bị cấm: "AL548" và "AL558" chỉ khác một ký tự nhưng là hai cây nhôm khác nhau.

Bối cảnh hỏi đáp do CLIENT gửi lên và chỉ gồm thứ đang xem — trợ lý không tự quét cơ sở dữ liệu,
nên quyền xem của người dùng vẫn là ranh giới duy nhất.

### Bốn lỗi đã gỡ, ghi lại để khỏi mất công lần nữa

1. **401.** Đặt ở `/api/v1/…` (đòi bearer JWT) trong khi trình duyệt xác thực bằng cookie.
   → Chuyển sang đường `/api/method/…`, sau khi phiên đã dựng.
2. **CSRF token is missing.** Phiên cookie thì lời gọi ghi phải kèm `x-frappe-csrf-token`.
   → `aiHeaders()` đọc `globalThis.csrf_token` (bộ điều hợp đặt sẵn khi đăng nhập).
3. **`Internal error`.** Lỗi mô hình bị nuốt thành một chữ vô nghĩa. → `guard()` trả lỗi thật.
4. **`5028: deprecated`.** `llama-3.1-8b-instruct` ngừng phục vụ 30/05/2026.
   → **Danh sách mô hình theo thứ tự ưu tiên**, gặp lỗi ngừng-phục-vụ thì sang cái kế; lỗi thật
   (ảnh hỏng, quá hạn mức) vẫn ném ra chứ không che. *Chốt một tên mô hình vào mã nguồn là hẹn
   trước một lần hỏng, vào một ngày không ai nhớ.*
5. **HTTP 200 với `answer` rỗng — thành công giả.** Llama 4 Scout gói câu trả lời khác họ Llama 3.
   → `textOf()` bóc mọi hình dạng đã biết (`{response}`, `{result:{response}}`,
   `{choices[0].message.content}`, mảng khối multimodal); rỗng thì trả 502 kèm hình dạng thật.

Kiểm chứng: hỏi *"Tổng tiền bao nhiêu?"* với bối cảnh `grand_total: 44000000` → trả `44000000`.

---

## 0.7 Những thứ nhỏ hơn đã sửa

| Chỗ | Trước | Sau |
|---|---|---|
| Tiêu đề tab | "Kairo Social Commerce" | Lấy `manifest.name` → **Alumdoor** (đúng cho mọi tenant) |
| Phiếu nhập | **không có ô tổng nào** | `grand_total` + `total_qty`, cộng ngay khi gõ (FormView) |
| Thứ tự cột dòng | Ghi chú đứng trước Đơn giá | Đơn giá → Thành tiền → Ghi chú |
| Nhãn ĐVT chứng từ mua | "ĐVT" | **"ĐVT mua"** |
| Cột ghi chú | 12rem, phình chiếm nửa bảng | 8rem; **mọi cột đều khai bề rộng** |

> Về bề rộng: để trống một cột nghĩa là "cột này nhận phần CÒN LẠI", và phần còn lại không có
> giới hạn — cũng chính chỗ trống đó từng cho ra **cột rộng 0px** khi phần còn lại âm. Khai hết
> thì `table-fixed` giãn đều theo tỉ lệ và không cột nào biến mất được.

---

## 0.8 Danh mục màu — đã nạp bảng thật và dọn mã cũ

Trước: 13 mã là chữ viết tắt nhặt từ sheet ĐM (`GS`, `VK`, `XN-VK`…) — không phải bảng màu.
Sau: **23 màu thật** + trường mới `applies_to` (Nhóm SP áp dụng).

| Loại (`finish`) | Số | Áp dụng |
|---|---|---|
| Sơn tĩnh điện | 18 | Cửa CN Đức, Úc, Siêu Trường, Đài Loan, Lưới, Phụ kiện |
| Mạ | 5 | Cửa Úc / Đài Loan tuỳ màu |

Mã màu dùng **tên đầy đủ**, không viết tắt: bảng có CẢ "XANH LÁ CÂY" lẫn "XÁM LÔNG CHUỘT" —
cùng viết tắt `XLC`. Đoán một trong hai là gán sai màu cho cửa đã bán, mà sai màu thì sơn lại cả bộ.

### Đã dọn

Soát trước khi xoá — **cả 1 257 lô nhôm đều trỏ vào mã cũ** (THÔ 883, GS 260, VK 110). Xoá thẳng
là 1 257 lô mất màu. Nên: quy đổi trước, xoá sau.

```sql
-- 372 lô đổi màu, chạy bằng D1 json_set (1 257 lô × 2 lời gọi API thì quá lâu)
GS → GHI SẦN · VK → VÀNG KEM · CF → CAFÉ · 9512 ( TRẮNG ) → TRẮNG
```

Đã xoá **10 mã** đã sạch tham chiếu: `XN-XLC` `GU-KU` `KU-GU` `TR-XLC` `XR-CF` `XN-VK`
`9512 ( TRẮNG )` `VK` `GS` `CF`.

### CÒN LẠI 3 mã, cố ý chưa xoá

| Mã | Lô đang dùng | Vì sao chưa xoá |
|---|---:|---|
| `THÔ` | **883** | Nhôm **chưa sơn** — là một TÌNH TRẠNG thật, không phải màu sơn. Bảng chuẩn là bảng màu sơn nên không có mục cho nó. Xoá là 883 lô mất màu mà không có chỗ nào để chuyển tới. |
| `XF` | 1 | Không rõ là XINGFA nào (bảng có NÂU / XÁM / ĐEN XINGFA) |
| `4004` | 1 | Không rõ |

`THÔ` nên **giữ lại** (`finish = Thô`). Hai mã còn lại chờ chủ xưởng chỉ đích danh.

## 0.9 ĐANG CHỜ CHỦ XƯỞNG — đừng tự quyết

### (a) Bảng quy đổi 13 mã màu cũ

| Mã cũ | Suy đoán | Trạng thái |
|---|---|---|
| `GS` / `VK` / `CF` | GHI SẦN / VÀNG KEM / CAFÉ | chờ xác nhận |
| `XN-VK` / `GU-KU` / `XR-CF` | XANH NGỌC–VÀNG KEM / GHI ÚC–KEM ÚC / XANH RÊU–CAFÉ | chờ xác nhận |
| `XLC` · `TR-XLC` · `XN-XLC` | **không rõ** (xanh lá cây hay xám lông chuột?) | phải hỏi |
| `XF` · `4004` · `9512 ( TRẮNG )` | **không rõ** | phải hỏi |
| `KU-GU` | đảo của `GU-KU`? | phải hỏi |

Có bảng rồi mới quy đổi Item + định mức đang trỏ vào mã cũ, rồi ngừng dùng chúng.

### (b) 186 mã có cờ `disabled` bỏ TRỐNG

Bộ lọc `link_filters` bật hôm nay coi ô trống là "không được mua", nên 186 mã **biến mất khỏi ô
chọn** — gồm cả các mã vừa tạo từ sheet ĐM. Trước đó vẫn chọn được.

Script sẵn sàng: `scratchpad/va-co.mjs --apply` (đọc `modified` rồi PUT — thiếu nó là
`TimestampMismatchError`). Đã hỏi 5 lần, chủ xưởng chưa trả lời. **Không tự chạy.**

Trống ở đây nghĩa là *chưa ai trả lời*, không phải "không". Câu trả lời của schema cho trường
hợp chưa trả lời chính là mặc định của nó: mua 1, bán 1, chưa ngừng.

### (c) "không có m2" — chưa rõ ý

Chủ xưởng nhắn đúng ba chữ đó. Chưa biết là: (a) không cần cột m², (b) ô ĐVT không chọn được
`m2`, hay (c) cột "SL tính tiền" trên phiếu bán biến mất. Phải hỏi lại trước khi động vào.

---

## 0.10 Nạp định mức từ sheet ĐM — ĐANG DỞ

Nguồn: `C:\Users\Admin\Downloads\MS LIÊN BS.xlsx`, sheet **`ĐM`** (1 179 dòng) và **`GHI CHÚ`**.
Script: `scratchpad/nap-dm3.mjs` + `dm-lib.mjs`. Sao lưu trước khi động: 10,9 MB (mục 0.12).

### Ba luật đọc sheet — từ bố cục thật, không phải đoán

1. **Cột `[1]` có STT ⇒ dòng TIÊU ĐỀ**, khai báo thành phẩm (mã ở `[3]`, tên ở `[4]`, giá ở
   `[7]`). Không có STT ⇒ dòng NGUYÊN LIỆU. Đọc lẫn hai loại sinh ra định mức **tự trỏ vào chính
   nó** — nổ ra là lặp vô hạn. Bản đầu dính đúng lỗi này.
2. **Đuôi tên thành phẩm là MÀU** (`- GS`, `- MSK`, `XN-VK`…). Hệ thống để màu là thuộc tính của
   ĐỊNH MỨC (`Bill of Materials.color`), không phải của mặt hàng → tách đuôi rồi khớp vào mặt
   hàng NỀN. `MSK` ≡ `THÔ` (cột mã của chính sheet nói ra điều đó).
3. **Đuôi `_TRỌN BỘ_3-4m²` là BẬC DIỆN TÍCH, không phải sản phẩm.** Bậc nhỏ nhất mang danh sách
   nguyên liệu đầy đủ (21 dòng), các bậc sau chỉ ghi phần chênh (3 dòng). **Không đẻ 33 mã bậc**
   — đó đúng là lỗi 56 mã bậc giá đã lập bảng đối chiếu để gỡ.

Phân giải ưu tiên **MÃ trước TÊN**: phiên này đã đổi tên vài mặt hàng ("LÁ YẾM" → "LÁ YẾM ĐỨC"),
khớp theo tên là khớp vào thứ đã cũ.

### Kết quả chạy thử gần nhất

```
định mức dựng được : 152   (có màu: 79)
dòng có số / trống : 357 / 118
nhân theo          : {chiều cao 140 · cố định 300 · chiều rộng 20 · diện tích 15}
cần tạo — màu 0 · thành phẩm 26 · vật tư 158
bậc diện tích bỏ qua: 29
```

### Chặn: tạo mã mới bị bộ kiểm chặn ba vòng liên tiếp

Mỗi vòng chỉ lộ ra một lỗi nên phải chạy lại:
1. `Nhóm hàng Nguyên vật liệu là nhóm chứa; hãy chọn một nhóm lá` → `leafGroup()` trong `dm-lib.mjs`
2. `cần Giai đoạn vật tư và Nguồn cung` → thêm `material_stage` + `supply_type`
3. (chưa chạy lại sau khi vá vòng 2)

Danh mục đã tăng 299 → 477 mã, tức vài vòng `--create` có tạo được một phần. **Chạy lại
`nap-dm3.mjs` (không cờ) trước để xem còn thiếu gì**, đừng cho `--apply` ngay.

### Mô hình đã mở rộng để chứa từ vựng định mức thật

`BOM Item`: `uom` (ĐVT định mức) · `qty_basis` (Cố định / Theo chiều cao / rộng / diện tích / số
lá) · `source_note`. `Bill of Materials`: `color`.

Hơn **một phần tư** dòng định mức phụ thuộc kích thước cửa — mô hình cũ chứa được 0 dòng trong
số đó.

### Sheet `GHI CHÚ` là bảng CÔNG THỨC, chưa mô hình hoá

23 bản lá + công thức chia lá, và ba công thức tính tiền theo dòng cửa:

```
Số lá = (CPB − 130) ÷ bản lá        ← DƯỚI 20,5 thì TRỪ 1 lá, TRÊN 20,5 thì KHÔNG trừ
```

Luật "−1 lá" **không phải theo profile mà theo NGƯỠNG 20,5** — chỗ này từng bị đọc nhầm thành
mâu thuẫn giữa AL548 và AL70. AL71C là ngoại lệ duy nhất không có "−1 lá".

| Dòng cửa | Tiền | Khẩu độ |
|---|---|---|
| Đức | CPB × RPBN | RPBN = RCL + 0,02 · RPBR = RCL + 0,08 |
| Úc | CPB × RPBR | RPBR = RCL + 0,03 = RLL + 0,14 |
| Đài Loan + Lưới | CPB × RCL (mua cả bộ tính RPBR) | RCL = RLL + 0,11 |

CPB = CLL + 0,5 m = số lá × bản lá.

**Sheet xác nhận độc lập luật 0,02 / 0,08** mà chủ xưởng đã chốt (`ALUMDOOR-LUAT-DO-VA-GIA.md`),
và cả quan hệ suy ra `RPBR = RPBN + 0,06`. `Cutting Policy` đã có phần **trừ bề rộng**; phần
**chia lá** thì CHƯA ở đâu cả.

---

## 0.11 Danh mục vẫn còn nợ

- **6 ray còn ĐVT Mét**: ray inox 6P/7P/8P, ron lông cạnh ray, `PK_TANGRAY`, TRỤC PHI 90
- **3 BẮN BƯỚM SẮT** thiếu kg/m²
- **`min_area_sqm` = 0/117** — cần cho luật m² tối thiểu
- **439 khách hàng** chưa phân đại lý / lẻ (321 còn giữ mặc định cũ)
- **`TP-MT-YHLD1000KG`** đang là "Dịch vụ" thay vì hàng tồn kho
- **Ron nhựa**: bàn giao ghi 0,10 kg/m, sheet ĐM ghi **0,263** (ron inox 0,12 vs 0,124) — chưa
  ghi đè, chờ chủ xưởng
- **Bảng đối chiếu thành phẩm**: `C:\Users\Admin\Downloads\ALUMDOOR - DOI CHIEU THANH PHAM.xlsx`
  — 56 trong 117 "thành phẩm" là **bậc giá** (7 sản phẩm × 7–8 bậc diện tích), không phải sản
  phẩm. Khách điền xong mới gộp về Chính sách giá.

---

## 0.12 Lỗi nền tảng CHƯA sửa

**Tên bản ghi đã xoá không dùng lại được.** `TP-LATG-UC` và vài mã khác trả 404 "Document not
found" vĩnh viễn, trong khi mã hoàn toàn mới thì tạo được bình thường. Không tìm thấy vết trong
`documents`, `document_search`, `master_records` hay `versions`. Đã né bằng cách đặt mã mới
(`TP-LATRUNGGIAN-UC`). **Chưa tìm ra nguyên nhân.**

---

## 0.13 Hạ tầng, sao lưu, cách triển khai

Sao lưu trước đợt này: `server/backups/alu/alu-2026-07-29T11-00-32-417Z.sql`
— 10 961 189 byte · sha256 `5fcd1cef1fea2e9089c7a21058ec4c76ceb8d14fcee2de5c3682e2f24c40b2d0`

```powershell
cd C:\Forge\server

# 1. brief → manifest (luôn --dry-run trước)
node scripts/forge-app.mjs briefs/alumdoor.json --dry-run --out imports/alumdoor-<ver>.manifest.json

# 2. manifest → 14 phần SQL (trần 100 câu lệnh/lần cài; alumdoor cần 212)
node scripts/build-alumdoor-remaining-release-metadata.mjs imports/alumdoor-<ver>.manifest.json imports/alumdoor-release-<ver>.sql

# 3. nạp từng phần
npx wrangler d1 execute cloudforge-alu --remote --yes --file=imports/alumdoor-release-<ver>.part-01.sql
#    … tới part-14

# 4. client
cd C:\Forge\client; npm run build
cd C:\Forge\server; node scripts/stage-client-bundle.mjs; npm run deploy:gateway

# 5. tenant worker (chỉ khi đổi mã nền tảng)
npm run deploy:tenant -- --tenant alu --execute --confirm alu --allow-dirty

# 6. app worker — BẮT BUỘC có --dispatch-namespace
npx wrangler deploy --config apps-src/alumdoor-worker/wrangler.jsonc --dispatch-namespace cloudforge-production
```

**Deploy app worker thiếu `--dispatch-namespace` là đẩy lên account root**, và mã cũ trong
namespace vẫn tiếp tục trả lời — trông y hệt "bản vá không ăn".

**Dispatch lan 40–110 giây.** Trong khoảng đó, 401 và "vá không ăn" đều là giả. Đừng sửa tiếp
khi chưa chờ đủ; phiên này đã suýt đuổi theo một lỗi ma vì tin kết quả đo ngay sau deploy.

Script kiểm nhanh trong scratchpad: `api.mjs` (đăng nhập cookie + CSRF), `thu-luu.mjs` (lưu đơn
mua 3 dòng — **phải có `company` và `currency`**), `ai2.mjs`, `kiem.mjs`, `dem.mjs`, `nap-mau.mjs`.

---

## 0.14 Chốt release production 1.27.0

Ngày 29/07/2026 đã gộp toàn bộ nhánh công thức cửa và các thay đổi phiên trước vào nhánh chuẩn
`master`, sau đó deploy đủ tenant Worker, app Worker trong `cloudforge-production`, metadata và
gateway/UI.

- Commit đầu nhánh production: `a3f009d`.
- App production: `alumdoor@1.27.0`.
- Content hash: `6da6fa8c5877c3613d012e2674c3b8d3d807dc7ca9fbddb2883ccd5b892c1357`.
- Backup ngay trước deploy: `server/backups/alu/alu-2026-07-29T13-59-28-792Z.sql`,
  12.231.662 byte, SHA-256 `6cfb5d787f6377f3d6673289e3c70df3053ea1de9791b0b7943f8aebf49a7d74`.
- Diễn tập 14 phần SQL trên backup: `quick_check=ok`; chạy lần hai ghi `0` dòng.
- Kiểm thử: client selfcheck 83/83; server unit 485/485; toàn bộ test migration SQL đạt.
- Production hậu kiểm: HTTP app 200, API guest trả JSON 403 đúng lớp quyền; 4.435 chứng từ vẫn
  còn; ba child doctype mua đều có `actual_weight_kg`; 5 chính sách cửa hoạt động và 2 chính
  sách Đức cũ bị vô hiệu hoá.

Giới hạn kiểm tra: phiên Browser cô lập không có cookie đăng nhập, nên hậu kiểm không tạo/sửa
chứng từ production. Cần người dùng mở lại một Đơn mua/Phiếu nhập thật để kiểm tra trực quan
bảng lớn; pilot ghi sổ end-to-end vẫn là việc bắt buộc trước khi coi phân hệ kho/sản xuất kín.
