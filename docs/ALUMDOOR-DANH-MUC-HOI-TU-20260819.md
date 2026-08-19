# Alumdoor — hội tụ danh mục 2026-08-19

Bản ghi quyết định cho đợt chuẩn hoá danh mục. Giữ vì nó trả lời hai câu mà code không trả lời
được: **cái gì cố ý không làm**, và **điều kiện nào thì mở lại**.

Điều kiện chi phối toàn đợt: **xưởng sản xuất sẽ không dùng phần mềm này nhiều.** Thợ cắt, lò
sơn, tổ lắp đặt không ngồi nhập liệu — người dùng thật là bán hàng và kế toán. Vì vậy mọi thứ
chạm **tiền** hoặc **danh tính mặt hàng** làm chắc; mọi thứ chỉ phục vụ thao tác tại xưởng làm
mức tối thiểu-an-toàn hoặc hoãn. Tối thiểu-an-toàn ở đây nghĩa là **thà từ chối và báo lỗi còn
hơn tính ra một con số sai trong im lặng**.

---

## 1. Đã làm

| # | Việc | Vì sao thuộc nhóm bắt buộc |
|---|---|---|
| M1a | `Pricing Scope` + `BOM Rule` khai vào `server/briefs/alumdoor-v2.json` | Cả hai đang sống ngoài brief ⇒ dựng lại tenant là mất. Pricing Scope còn tệ hơn: engine giá đọc nó mỗi lần tính đơn mà chủ xưởng không sửa được qua giao diện |
| M1b | Bản lá ra khỏi `slats.ts` thành danh mục `Quy cách cửa` | `chiều cao tính tiền = tổng số lá × bản lá của mã`. Sai bản lá là sai m², là sai hoá đơn — chạm tiền, không chạm máy cắt |
| M1c | Màn hình Danh mục mở thêm 4 mục; 4 doctype rỗng nhận `menu: false` | Phường Xã 3.321 và Tỉnh Thành 34 bản ghi là dữ liệu thật không ai vào xem được |
| M4 | `ray_type` vào khoá phân giải chính sách cắt | Rộng cắt lá tham gia cơ sở tính tiền khi bán tách món ⇒ chạm tiền |
| M5 | Bảng màu về một nguồn; `Nguyên nhân cửa lỗi` | Hai bản ghi cho cùng một màu là chẻ tồn kho; bên chịu trách nhiệm là dữ liệu của nỗi đau #1 |

Chi tiết nằm trong ba commit trên `agent-live`, không chép lại ở đây.

### Một chỗ suýt hỏng, ghi lại để không tái diễn

`readDoorPolicies` **không lấy trường `ray_type`**. Ngay khi resolver bắt đầu lọc theo loại ray,
mọi chính sách đọc về đều không mang loại ray ⇒ một dòng có khai ray sẽ không khớp được chính
sách nào — hỏng **cả U75 lẫn U100**, không riêng loại thiếu dữ liệu. Đường dự phòng trong
`sales-production-core.ts` thiếu đúng trường đó.

Bài học: đổi khoá phân giải thì phải soi **mọi projection đọc bảng đó**, không chỉ hàm chọn.

---

## 2. Cố ý hoãn — và điều kiện mở lại

Tất cả đều là cụm sản xuất. Đầu tư vào đây là đầu tư vào màn hình không ai mở.

| # | Hoãn | Điều kiện mở lại |
|---|---|---|
| H1 | Kho `Đầu thừa` chạy thật + `scrap_threshold_m` | Khi xưởng bắt đầu nhập chiều dài đầu thừa. Brief đã có `K36-DT`/`K12-DT` với `stock_role: Kho đầu thừa`; ngưỡng vẫn **để trống, chặn cắt** đúng Giả định A2 — không bịa số |
| H2 | Danh mục `Loại lá` (yếm 0,02 · trung gian 0,05 · đáy lớn 0,09 · lá 75MM 0,085 · yếm siêu trường 0,5) | Khi cần lệnh cắt chi tiết. Nó phục vụ chiều cao **vật lý**, không phải chiều cao tính tiền |
| H3 | Bù 106/338 hàng bán chưa có BOM | Khi mở trừ kho sản xuất. BOM vẫn là nháp có chủ đích theo audit 16/08 |
| H4 | Gom 900 dòng applicability BOM Rule từ `ITEM` sang `DOOR_TYPE`/`ITEM_GROUP` | Khi số mặt hàng tăng tới mức nhập tay không kham nổi. Đây là việc tối ưu, không phải việc đúng/sai |
| H5 | `Production Standard` mở rộng | Khi làm lịch sản xuất |
| H6 | Màn hình nhập cửa lỗi **tại xưởng** | DocType và 11 nguyên nhân đã tạo; chủ hoặc kế toán nhập sau khi nghe báo |
| H7 | Bộ danh mục bảng giá: Độ dày (LY) · Bậc diện tích · Chất liệu lưới · Kiểu vận hành · ngưỡng Motor/UPS theo diện tích | Đợt sau. Thuộc scope đầy đủ của `apps/alumdoor/docs/BRD.md`, ngoài phạm vi QĐ-4 |

⚠️ **Ràng buộc kéo theo H7:** khi đặt mã hàng, **không** nhồi độ dày–bậc diện tích–kiểu vận hành
trở lại vào mã chỉ vì chưa có danh mục cho chúng. Thà thiếu còn hơn nhồi — mã hàng là khoá bản
ghi, gỡ ra sau tốn gấp bội.

---

## 3. Giả định đã tự quyết

Theo nguyên tắc "được quyết thay, đừng đứng chờ" của đợt này.

| Điểm | Quyết | Đổi thì sửa ở đâu |
|---|---|---|
| `scrap_threshold_m` | Để trống. BRD chốt trống thì **chặn cắt** — mà cắt thì xưởng không dùng phần mềm, nên nó tự hết là vấn đề | `Measurement Profile` / Settings |
| `Batch.condition` | Giữ enum cứng Thô/Đã sơn/Lỗi | `docs/brd-v2/BRD.md` §4.2 rồi mới tới brief |
| Màu `4004` | Không nạp. BRD ghi chưa xác nhận, nghi ĐỎ ĐÔ | `lib/alumdoor-color-catalog.mjs` |
| Phạm vi `CỬA ÚC` trong Pricing Scope | Không nạp — `docs/ALUMDOOR_PRICING_SCOPE.md` chỉ khai 3 phạm vi | Tài liệu trước, dữ liệu sau |
| `Supplier Item` | **Giữ** trên menu dù 0 bản ghi | Đây là master mua hàng hợp lệ, chỉ chưa seed. Gỡ nó là mất đường đối chiếu mã theo NCC |
| `Cửa Úc` không có Item Group nào | **Giữ chính sách**, không xoá | Không phải chính sách chết: `Kiểu Úc` (`CPB÷0,465+k`) và `Kiểu tấm liền Úc` (`(CPB−0,13)÷0,068`) là hai công thức chia lá khác hẳn nhau. Nguồn xưởng liệt ÚC là một dòng sản xuất thật; danh mục hiện chỉ bán biến thể tấm liền |
| `Cửa kéo Đài Loan` chưa Geometry Profile nào phủ | Để nguyên, ghi lại | `inferDoorType` đã map nhóm này về `Cửa Đài Loan`, nên công thức vẫn chạy. Chỉ thiếu bộ quy cách hình học riêng — 1 mặt hàng |

### Một chỗ CHƯA KHỚP NGUỒN, cố ý không tự sửa

`AL552`. Ba nguồn nói ba kiểu:

- sheet `GHI CHÚ`: `AL552C` = 0,05 · `AL552N` = 0,057
- bảng đang thi hành (`SLAT_PROFILES`): chỉ có `AL552 (CŨ)` = **0,057**, không khai đời MỚI
- `BRD §4.1`: liệt `AL552` là 56/0,057

Nghĩa là đời CŨ đang mang giá trị của đời MỚI, và `profileKey("AL552","")` sẽ ném lỗi vì không
có khoá đời MỚI. Sửa một ước số chia là đổi số lá thật, nên **giữ nguyên giá trị đang tính tiền**
và chờ chủ xưởng chốt. Ghi trong `lib/alumdoor-slat-catalog.mjs`.

---

## 4. Pha dữ liệu — đã chạy

Ba adapter chạy trọn qua runner có bảo vệ, giữ nguyên lock / backup / post-verify / idempotency:

| Adapter | Kết quả | Bằng chứng |
|---|---|---|
| `layer0` | `EXECUTION_STATUS=SUCCESS` | 25 màu · 4 bề mặt · 17 quy cách · 7 bộ đo · 8+5 hình học · 18 ĐVT |
| `bom-rule` | `IDEMPOTENT_SECOND_PASS=PASS` | pass 1 và pass 2 đều `templates_updated=0 rules_updated=0 unchanged=780` |
| `item-master` | `IDEMPOTENCE_PASS` | 587 mặt hàng, `created=0 existing=587`, verify PASS |

Đường hợp lệ là `forge-live apply`: nó dựng kho bare cục bộ, trình commit `agent-live` cho
importer như một `main` local-only, rồi trả nguyên trạng. **Điều kiện duy nhất là local phải
bằng `origin/agent-live`** — tức push, không phải promote lên `main`. Bản ghi trước của tài liệu
này đọc nhầm cổng nguồn thành một điểm chặn không gỡ được; nó không phải.

### Bảy danh mục hội tụ

`documents` (đang dùng) khớp `master_records` ở cả bảy. Không còn giá trị ma nào.

| Danh mục | Sau | Trước |
|---|---|---|
| Item Color | 25 / 25 | `master_records` **47** — 22 slug ASCII |
| Item Group | 20 / 20 | `master_records` **33** — 13 nhóm ERP tổng quát |
| UOM | 18 / 18 | `documents` **22** — Thùng, Tấn, m², Chiếc |
| Surface Finish · Measurement Profile · Geometry Field · Geometry Profile | 4 · 7 · 8 · 5 | đã khớp sẵn |

Đơn vị thừa dùng `disabled` chứ không xoá, theo BRD §2: `Thùng` còn đúng một dòng trỏ tới.

Một bẫy suýt sập: `VAN_GO` có dấu gạch dưới nhưng **là mã chuẩn** (màu VÂN GỖ của hai phụ thu
vân gỗ). Lọc slug theo hình dạng tên sẽ xoá đúng nó và làm chết hai chính sách phụ thu — nên
luật là "không nằm trong catalog chuẩn", không phải "tên có gạch dưới".

### Sáu lỗi của chính tầng thực thi phải vá mới chạy được

Không cái nào là lỗi dữ liệu. Cả sáu đều là **luật viết ở nhiều nơi rồi trôi dạt**, hoặc
**hai người ghi giành nhau một trường**.

| # | Lỗi | Bản chất |
|---|---|---|
| 1 | `requireApi` bắn một phát 5 giây rồi bỏ cuộc; `restoreRuntime` chỉ chờ Desk, không chờ backend | layer0 ghi D1 xong rồi tự đánh trượt ở bước ngay sau, lần nào cũng hệt nhau |
| 2 | Hằng số `19` khoá cứng ở **năm** nơi: chốt chặn seed, hậu kiểm layer0, test catalog, tiền kiểm item-master, tiền kiểm real-purchase | Gỡ `Thùng` theo E07 làm cả năm đỏ; một chỗ còn báo hỏng với `canonical=18 existing=18` — hai số khớp nhau |
| 3 | `bom_rule_formula_snapshot` có hai định dạng, hai người ghi, mỗi bên so cả chuỗi với hình dạng của mình | Vòng ghi đè vô tận: `templates=330 rules=780 unchanged=0` lặp y hệt mọi pass |
| 4 | `Item.uom_conversions`: item-master coi danh sách rỗng của nguồn là lệnh "xoá hết" | Xoá 9 hệ số do BOM Rule tạo là đẩy 9 dòng BOM sang `pending`, công thức im lặng ngừng quy đổi |
| 5 | `readDoorPolicies` không lấy `ray_type` | Sau khi resolver lọc theo ray, mọi dòng có khai ray không khớp chính sách nào — hỏng cả U75 |
| 6 | `forge-live apply` không chuyển tham số xuống runner | `item-master` bắt buộc `--source` nên nằm trong ALLOWED mà không cách nào gọi được |

Luật chung rút ra: **chốt cái bất biến, đừng chốt ảnh chụp.** Một chốt chặn đếm số sẽ đỏ mỗi
lần danh mục thay đổi hợp lệ, và người sửa chỉ việc nâng con số lên — nó không bảo vệ được gì.

## 5. Quy ước mã hàng — đã dựng bộ chuẩn hoá, chờ soát

`docs/ALUMDOOR-QUY-UOC-MA.md` chốt 29/07 nhưng chưa áp: 0% dùng 10 tiền tố chuẩn, 39% nhồi màu,
96 mã nhồi cả cách bán lẫn bậc diện tích.

Nay đã có `server/scripts/lib/alumdoor-item-code-convention.mjs` thi hành bốn luật cứng §2, và
`build-alumdoor-item-code-mapping.mjs` (CHỈ ĐỌC) sinh bảng ánh xạ đầy đủ.

**Kết quả trên 587 mã thật: 587 → 424 mã chuẩn**, 163 mã bị hấp thụ vào 52 họ,
**0 mã không suy được tiền tố**, 13 mã vượt 24 ký tự.

Bảng để soát: `docs/ALUMDOOR-ANH-XA-MA-HANG-20260819.md` (người đọc) và
`docs/alumdoor-item-code-mapping.json` (máy đọc).

### Bốn quyết định thiết kế, mỗi cái do dữ liệu thật ép ra

1. **Tiền tố suy từ NHÓM HÀNG, không từ tên.** `TP-TD-AL70` nằm ở nhóm "Cửa CN Đức" với
   `material_stage = Thành phẩm` ⇒ `CUA`, dù tài liệu có ví dụ `NHOM-AL70` — ví dụ đó nói về
   nhôm nguyên liệu, một mặt hàng khác.
2. **Nhóm dòng sản phẩm thắng gợi ý vật liệu trong tên.** 29 mặt hàng `TP-TOLEKEM124*` là CỬA
   bán theo m², chỉ tình cờ làm bằng tôn.
3. **Không suy được thì trả `null`, không chọn bừa.** Mã là khoá bản ghi; đoán sai một tiền tố
   là gán sai danh tính vĩnh viễn.
4. **Mã quá dài được BÁO chứ không cắt bừa.** Cắt là bịa ra một cái tên xưởng không đọc được.

### Một lỗi thật mà chính bảng ánh xạ bắt được

`NVL-TOLE1.4x270x1.4ly-CRON+TD` bị gộp vào `...CRON`. Nhưng `+TD` ở đuôi là **TỰ DỪNG** — tên
đầy đủ "RAY SẮT U100-1.4ly (CÓ RON+TỰ DỪNG)" — không phải nhà cung cấp TIẾN ĐẠT. Gộp là mất
hẳn một biến thể sản phẩm. Nay token nhà cung cấp chỉ bị gỡ khi đứng ĐẦU, và có test ghim.

Đây đúng là lý do phải **sinh bảng để soát** thay vì áp luật mù: một quy tắc đọc trên giấy thì
hợp lý, chạy trên 587 mã thật mới lộ ra chỗ nó ăn nhầm.

### Ba nhóm cần chủ xưởng quyết trước khi đổi mã

| Nhóm | Số lượng | Vì sao máy không quyết được |
|---|---:|---|
| Vượt 24 ký tự | 13 | Rút ngắn là đặt tên, mà tên phải để xưởng đọc được |
| Họ bị gộp | 52 | Gộp là ĐÍCH (§5 nêu ví dụ 5 mã `AL595` về một), nhưng phải cố ý |
| Chưa suy được tiền tố | 0 | — |

### Còn lại: bước đổi mã thật

Bộ chuẩn hoá và bảng ánh xạ đã xong; bước **thi hành** thì chưa, và cố ý chưa:

- mã đi vào Item Price, BOM, BOM Rule applicability, lô tồn và mọi chứng từ, nên đổi mã phải
  là một adapter có bảo vệ riêng, không phải vài câu SQL;
- và nó đóng cứng danh tính mặt hàng, nên phải chạy **sau khi** chủ xưởng duyệt 13 tên rút gọn
  và 52 họ gộp ở trên.

Riêng `TRONBO` trong mã cần nói rõ: nhồi cách bán vào mã hàng chính là **dựng lại `Sales Option`
qua cửa sau** — thứ đã bị xoá ở `46cff213` và audit 16/08 cấm đưa lại.
