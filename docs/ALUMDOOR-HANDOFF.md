# ALUMDOOR — BÀN GIAO CHO PHIÊN SAU

> Cập nhật: **2026-07-30 11:01 (UTC+7)**
> Mã nguồn release: **`C:\Forge-worktrees\platform-design`**
> Production: **<https://alu.kairo.vn>** — app **Alumdoor 2.0.0**
> Tenant `alu` · D1 `cloudforge-alu` · id `6781cbc1-8635-4b6e-af46-09297c120cff`

> **V2 đã go-live ngày 2026-07-30:** nhánh `feat/platform-design-screens`, commit release
> `f484662`, đã nhập Alumdoor V2 và giao diện design. Đọc
> `docs/brd-v2/IMPLEMENTATION_EVIDENCE.md`, `PHASE_TRACKER.md` và `RELEASE_RUNBOOK.md`
> để xem bằng chứng backup, restore drill, migration, deploy và hậu kiểm.

**Đọc mục 0 trước mọi mục khác.** Nó ghi những thứ vừa đổi và những quyết định đang CHỜ chủ
xưởng — làm tiếp mà không biết chúng thì sẽ làm lại thứ vừa xong, hoặc đoán bừa chỗ cố ý bỏ ngỏ.

## 0. Release hiện hành — 2.0.0

Mốc release phải nhớ:

- Nhánh release là `feat/platform-design-screens`, commit `f484662`; merge V2 ở `f5187ee`.
- Gói production là `alumdoor@2.0.0`, content hash
  `b62cb1818d0aafc28f71a8ad5735dff8e866d0ec0f37a08c7c2d2fd449e74387`.
- 69 DocType, 1 workflow, 57 fixture, 67 mục điều hướng; migration tenant đạt 25/25.
- 529/529 unit server, toàn bộ SQL, 132/132 tenant Worker, 3/3 query Worker,
  83 nhóm selfcheck client, typecheck và production build đều đạt.
- Backup release đã kiểm checksum và restore thành công vào hai D1 drill độc lập.
- Gateway, tenant Worker, app Worker, metadata V2 và giao diện design đều đã lên production.
- Hậu kiểm D1 `quick_check=ok`; HTTP health 200, shell 200, guest API 403 đúng bảo vệ.
- Browser production đăng nhập thật, mở được home `Tồn nhôm theo khổ`, `Cắt nhôm` và
  `Kiểm kê kho`.
- Dữ liệu thật từ ba workbook đã được nhập vào production theo dạng master/chứng từ lịch sử:
  **3.562 hồ sơ**, gồm 1.257 lô, 439 khách hàng và 1.474 đơn hàng cũ; import chạy đúng một
  lần, không sinh stock/GL/payment ledger giả.
- Đã sửa thiếu phạm vi danh mục: nhập đủ **277 mặt hàng kinh doanh + 17 mã nhôm lô = 294
  Item**, **292 dòng giá** và **24 màu chuẩn**. Tổng production hiện là **4.191 hồ sơ**;
  mã màu cũ trong lô đã đổi sang tên đầy đủ.
- Chưa tạo giao dịch nghiệp vụ giả trên production. Pilot có ghi ledger và đối chiếu
  cây/kg/giá trị vẫn là việc vận hành cần thực hiện sau khi có số kg cân thật.

## 1. Đọc phần này trước — quyết định nghiệp vụ mới nhất

Mô hình đã được chủ xưởng chốt lại, các tài liệu cũ nói khác phải coi là **lỗi thời**:

1. **Mua/nhập nhôm:** nhập và định giá theo **kg thực cân**.
2. **Sổ tồn kế toán của nhôm nguyên liệu:** giữ theo **kg**.
3. **Tồn vật lý để xem và trích sản xuất:** giữ thêm **mã nhôm + màu + tình trạng + khổ/chiều dài + số cây/lá + kho/lô**.
4. **Trích sản xuất:** người dùng chọn theo **khẩu độ/khổ và số cây/lá**; không bắt người dùng quy đổi tay sang kg.
5. **Bán cửa/thành phẩm:** tính tiền theo **m²**; phụ kiện có thể bán theo Mét/Cái/Bộ/Cặp tùy Item.
6. Không được đổi hàng nhôm sang tồn theo **Bộ**. `Bộ` chỉ có thể là đơn vị vật lý của thành phẩm nếu sau này chốt quản lý tồn thành phẩm theo bộ; giá bán vẫn có thể theo m².

Tài liệu `docs/ALUMDOOR-QUY-TRINH.md` và `docs/ALUMDOOR-MUA-HANG-THIET-KE.md` chứa nhiều phân tích hữu ích nhưng một số đoạn cũ còn viết “tồn nhôm theo số cây/lá”. Khi mâu thuẫn, **file bàn giao này + code hiện tại là nguồn đúng**.

## 2. Trạng thái production đã xác minh

### 2.1 Hạ tầng

- Tenant: `alu`
- D1: `cloudforge-alu`
- D1 database id: `6781cbc1-8635-4b6e-af46-09297c120cff`
- App đang cài: `alumdoor@2.0.0`
- Content hash: `b62cb1818d0aafc28f71a8ad5735dff8e866d0ec0f37a08c7c2d2fd449e74387`
- Tenant migration: `25/25`, mới nhất `0025_alumdoor_inventory_views.sql`
- Gateway version: `27f09d52-40c9-4b44-9533-e656c3469440`
- App Worker version: `641348f5-3aa8-46aa-affe-9180c7865def`
- Bản V2 đã deploy đủ frontend/gateway, tenant Worker, app Worker và metadata.

### 2.2 Bản sao trước khi cập nhật V2

- SQL: `C:\Forge-worktrees\platform-design\server\backups\alu\alu-2026-07-29T20-45-09-596Z.sql`
- Manifest: cùng tên, đuôi `.sql.json`
- SHA-256: `b0a169e3c7eb056843bb9af842f35cba9e2b258a7da6100047d9fbe2df5b1a4f`
- Dung lượng: `3.233.930` byte
- Bản mã hoá DPAPI ngoài Cloudflare:
  `C:\AppWeb\_BanGiao\backups\Alumdoor\alu-2026-07-29T20-45-09-596Z.sql.dpapi`
- Restore drill A: `cloudforge-drill-alumdoor-v2-a`
  (`5572e403-2251-4604-aa63-1da30030a179`) — 64 bảng, integrity đạt.
- Restore drill B: `cloudforge-drill-alumdoor-v2-b`
  (`47a59332-549c-4bde-a1ce-8d6dfa71e1b5`) — 64 bảng, integrity đạt.

### 2.3 Bản sao ngay trước khi nhập dữ liệu thật

- SQL: `C:\Forge-worktrees\platform-design\server\backups\alu\alu-2026-07-29T21-20-23-660Z.sql`
- Manifest: cùng tên, đuôi `.sql.json`
- SHA-256: `94915e4d0d3697f28c097ebdf9f01e085804dc04bf8901f2684176b87f9a0cc4`
- Dung lượng: `3.452.683` byte
- Bản mã hoá DPAPI ngoài Cloudflare:
  `C:\AppWeb\_BanGiao\backups\Alumdoor\alu-2026-07-29T21-20-23-660Z.sql.dpapi`
- Restore drill: `cloudforge-drill-alumdoor-data-20260730`
  (`23f0dd12-0431-414b-b083-99043531a80c`) — 67 bảng, `quick_check=ok`, không đổi route.
- Cùng bộ import đã được áp hai lần trên drill; số khóa vẫn giữ nguyên 3.562, chứng minh
  cơ chế upsert không nhân bản dữ liệu.

### 2.4 Bản sao trước khi sửa danh mục mặt hàng và màu

- SQL: `C:\Forge-worktrees\platform-design\server\backups\alu\alu-2026-07-30T03-57-41-654Z.sql`
- SHA-256: `f9b12f831a692cd5ebd2bf951ff22e9e813b2b07f34bde047e48c96dbc7c4f85`
- Dung lượng: `8.070.355` byte
- Bản mã hoá DPAPI:
  `C:\AppWeb\_BanGiao\backups\Alumdoor\alu-2026-07-30T03-57-41-654Z.sql.dpapi`
- SHA-256 bản mã hoá: `1cf70ddf948d527fc339d08a93fb576d05fef0331a61b0b4b7468298c2e464a5`
- Restore drill: `cloudforge-drill-alumdoor-catalog-20260730`
  (`0fea97f4-a195-41cc-9428-c07b7e171a43`) — 67 bảng, không đổi route.
- Bản sửa được áp hai lần trên drill; count và khóa duy nhất không đổi, ledger vẫn bằng 0,
  `quick_check=ok`.

### 2.5 Số liệu đọc lại trực tiếp sau import production

| Hạng mục | Kết quả |
|---|---:|
| Tổng hồ sơ trong tenant | 4.191 |
| Khách hàng | 439 |
| Nhà cung cấp | 22 |
| Item | 294 = 277 danh mục + 17 mã nhôm lô |
| Item Price | 292 |
| Màu chuẩn | 24 = 18 sơn tĩnh điện + 5 mạ + 1 THÔ |
| Lô nhôm | 1.257 |
| Tổng số cây/lá trong lô | 43.601 |
| Đơn hàng cũ | 1.474 |
| Nhật ký nhập cũ | 254 |
| Bảo hành | 86 |
| Định mức công đoạn | 6 |
| Master records | 57 |
| DocType thuộc app | 69 |
| Custom Field thuộc app | 10 |
| Print Format thuộc app | 7 |
| Stock ledger | 0 |
| GL / Payment ledger | 0 / 0 |
| Search index / hồ sơ | 4.191 / 4.191 |
| Migration tenant | 25 |
| D1 quick check | `ok` |

Đăng nhập thật qua API production đã đọc đúng 294 Item, 292 Item Price, 24 Item Color và
1.257 lô. Màu `XANH NGỌC - VÀNG KEM` đọc được đúng bề mặt `Mạ` và hai phạm vi Cửa tấm
liền Úc / Cửa Đài Loan. Con số 4.435 chứng từ ở bản bàn giao cũ không phải số hiện hành;
D1 production và audit import này là nguồn có thẩm quyền.

## 3. Việc vừa hoàn thành ở 1.20.1

Màn **Lô nhôm tồn / Aluminium Lot** đã sắp cột theo bảng của xưởng, giữ thêm hai khóa định danh cần thiết:

1. Mã nhôm
2. Ngày nhập nhôm
3. Màu
4. Tình trạng
5. Khổ (m)
6. Số lá
7. Ngày nhập lại
8. Theo dõi tồn
9. Chọn cắt
10. LM/Phế
11. Số kg tồn
12. Nhập/Ghi chú
13. Ghi chú
14. Kho

Chi tiết:

- `generation` đã đổi nhãn từ “Đời sản phẩm” thành **Tình trạng**.
- `stock_state` nhận `TỒN`, `SẮP HẾT`, `HẾT`.
- Thêm `selected_for_cut: Check`.
- Đổi `scrap_note` thành nhãn **LM/Phế**.
- Thêm `remaining_kg: Float` — **Số kg tồn**.
- Thêm `intake_note: Small Text` — **Nhập/Ghi chú**.
- `quality_status` vẫn tồn tại để tương thích nghiệp vụ cũ nhưng đã ẩn khỏi form.
- File Excel nguồn không có một giá trị kg nào ở cột `SỐ KG TỔNG`, vì vậy không bịa số và không backfill `remaining_kg`.
- Bộ nhập dữ liệu đã được sửa để đọc đủ `Theo dõi tồn`, `Chọn cắt`, `Số kg`, `Nhập/Ghi chú`.
- Bản vá dữ liệu chỉ cập nhật các `Aluminium Lot` có `_migration_source=alumdoor-current-lots-2026`; không ghi đè khách hàng, NCC, đơn hàng hay ledger.

## 4. Các phần lớn đã có trước đó

### 4.1 Giao diện nền tảng

- Vẫn giữ mô hình **3 cột**: sidebar/list/form chi tiết và form nhanh dạng modal/drawer.
- List mặc định ưu tiên rộng; có cuộn ngang khi nhiều cột.
- Header/cột chọn/STT đã sửa sticky và nền không trong suốt.
- Form dùng bố cục gọn 2–3 cột, checkbox thẳng hàng, có section phân nhóm.
- Ctrl+K, link picker, recent links, tạo nhanh bản ghi liên kết đã được khôi phục/cải tiến.
- Có xuất Excel/PDF cho list.
- Tree Item Group/Warehouse và sidebar danh mục đã trải qua nhiều vòng chỉnh; trạng thái chốt là **Danh mục ở sidebar như ban đầu**, tree nằm ở vùng nội dung chứ không làm tab treo.
- Có thêm nhiều theme, gồm Sakura và gradient.

Không nên viết lại toàn bộ UI nữa nếu không có lỗi tái hiện rõ. Các điểm cần kiểm tra phải dựa trên trang live và ảnh lỗi cụ thể.

### 4.2 Danh mục Item

- Có `Item Group`, `UOM`, `Warehouse`, `Item Color`, `Brand/Manufacturer`, `Material Grade`, `Material Specification`, `Item Attribute`, `Supplier Item`, `Measurement Profile`, `Item Default`, `Item Reorder`, barcode và biến thể.
- Mã Item có thể tự sinh và người dùng được sửa.
- Item dùng một nguồn quy tắc chung cho mua/bán; các đơn vị giao dịch không hoạt động đã bị bỏ qua khi tự điền.
- Màu là mã danh mục thật (`Item Color`), không phải ghi chú tự do.
- Kho thật hiện chốt:
  - `Kho Alumdoor`: nút nhóm.
  - `K36`: kho vật lý.
  - `K12`: kho vật lý.
- 1.257 lô nhập từ Excel đang được gán K36 vì file nguồn không có cột kho. Việc tách dòng thực tế sang K12 **chưa làm**.

### 4.3 Mua hàng

- Có chuỗi: Yêu cầu vật tư → Hỏi giá NCC → Báo giá NCC → Đơn mua → Phiếu nhập → Hóa đơn mua → Phiếu chi.
- Theo yêu cầu rút gọn vận hành, sidebar ưu tiên **Đơn mua hàng** và **Phiếu nhập mua**; các bước khác vẫn tồn tại ở nền tảng.
- Đơn mua/Phiếu nhập nhận nhiều dòng, mỗi Item có cách tính riêng.
- Với `inventory_mode = Nhôm cây/lá`:
  - `qty` trên mua/nhập là **kg thực cân**.
  - Bắt buộc thêm chiều dài/khổ và số cây (`length_m`, `qty_bar`).
  - Tự tính tổng mét và kg/m thực tế để đối chiếu.
  - Stock ledger vẫn theo Kg.
- Hàng thường tự lấy ĐVT và quy đổi từ Item, người dùng không phải chọn lại nếu Item đã quy định.
- Form mua hàng đã rút gọn và tự điền từ Item/NCC/đơn nguồn nhiều hơn trước.

### 4.4 Bán hàng

- Báo giá → Đơn hàng → Phiếu xuất → Hóa đơn → Thu tiền đã có controller và kiểm thử.
- Thành phẩm theo m² tự tính từ rộng × cao × số bộ và diện tích tối thiểu.
- Người bán chọn ĐVT bán nằm trong các đơn vị Item cho phép; hệ số quy đổi không được gõ tùy ý.
- Dòng từ báo giá sang đơn và từ đơn sang phiếu xuất giữ snapshot Item, màu, quy cách và quy đổi.

### 4.5 Sản xuất/cắt nhôm

- Có công thức chia lá cho 19 mã và test theo ví dụ thật của xưởng.
- `alumdoor.cut.propose` chọn lô có khổ đủ và nhỏ nhất để giảm phế.
- `alumdoor.cut.apply` trừ số lá và ghi `Aluminium Cut`.
- Có hoàn cắt và trả hàng, dùng optimistic concurrency qua `modified` để tránh hai người cùng trừ một lô.
- Hiện cắt mới trừ `sheet_count`; chưa nối hoàn chỉnh sang kg tồn kế toán — xem việc cần làm tiếp.

### 4.6 Dữ liệu đã nhập

- 439 khách hàng.
- 22 nhà cung cấp.
- 277 mặt hàng từ workbook `Hàng hoá _ Vật tư-20260728-2018.xlsx`, cộng 17 Item/profile
  nhôm phục vụ sổ lô: tổng 294 Item; 292 dòng giá, không có dòng giá trỏ Item thiếu.
- 24 màu chuẩn: 18 sơn tĩnh điện, 5 mạ màu và `THÔ`. Sáu mã cũ trên lô đã chuẩn hoá:
  `GS→GHI SẦN`, `VK→VÀNG KEM`, `CF→CAFÉ`, `XF→XÁM XINGFA`, `4004→ĐỎ ĐÔ`,
  `9512 ( TRẮNG )→TRẮNG`.
- 1.257 lô nhôm / 43.601 cây-lá; 106 lô LM/phế, 4 lô được đánh dấu chọn cắt,
  163 lô có ghi chú nhập.
- Trạng thái lô: 1.149 `TỒN`, 55 `SẮP HẾT`, 53 `HẾT`.
- 1.474 đơn hàng cũ / 4.653 dòng đơn.
- 254 nhật ký nhập cũ.
- 86 bảo hành.
- 6 định mức công đoạn.
- Dữ liệu lịch sử nằm trong doctype tham chiếu, không tự sinh sổ kho/kế toán. Workbook không
  có kg tồn nên cả 1.257 lô đều chưa có `remaining_kg`; báo cáo V2 theo ledger/kg vì vậy vẫn
  chỉ phản ánh giao dịch vận hành mới, không được bịa số dư mở đầu.

Nguồn hiện còn ở:

- `C:\Users\Admin\Downloads\2026 ĐƠN HÀNG - XUẤT HÀNG.xlsx`
- `C:\Users\Admin\Downloads\TỒN NHÔM 2026 NEW.xlsx`
- `C:\Users\Admin\Downloads\CTY SÁU HỒNG.xlsx`

Audit nguồn: `server/imports/alumdoor-lot-columns-2026-07-29.audit.json` và `server/imports/alumdoor-remaining-2026-07-29.audit.json`.

## 5. Việc cần làm tiếp — theo đúng thứ tự

### P0 — Nối Phiếu nhập mua với Lô nhôm

Đã có hook bước đầu ở `lots-from-receipt.ts`: submit/cancel Phiếu nhập có thể cộng/trừ số
cây/lá vào lô theo mã + màu + tình trạng + khổ + kho. Tuy nhiên cầu nối vẫn **chưa hoàn thiện**:
hook chưa đưa `qty` kg vào `remaining_kg`, chưa có test end-to-end riêng và chưa pilot thật trên
production. Vì vậy các yêu cầu dưới đây vẫn là P0, không được coi commit có hook là đã khép kín.

1. Khi submit `Purchase Receipt` cho Item `Nhôm cây/lá`, stock ledger tăng bằng **kg thực cân**.
2. Đồng thời tạo/cập nhật `Aluminium Lot` theo mã nhôm, màu, tình trạng, khổ, số cây/lá, kho và nguồn phiếu nhập.
3. `remaining_kg` của lô lấy từ kg thực cân của chính dòng phiếu nhập; không suy từ số cây nếu đã có cân thật.
4. Cần chống chạy lặp/idempotency: submit/retry không được tạo lô hai lần.
5. Khi hủy phiếu nhập, hoàn đúng lô và kg; không cho hủy nếu lô đã được dùng mà chưa có luồng đảo hợp lệ.

### P0 — Trừ sản xuất đồng thời theo cây/lá và kg

Hiện `Aluminium Cut` mới trừ `sheet_count`. Cần:

1. Ghi thêm `kg_consumed` trên phiếu cắt/phiếu xuất vật tư.
2. Trừ `remaining_kg` và tạo stock ledger theo kg.
3. Cách mặc định hợp lý khi không cân lại: `kg của số cây lấy = remaining_kg trước cắt × số cây lấy / số cây trước cắt`.
4. Nếu xưởng cân thực tế lúc xuất sản xuất, số cân thực phải thắng tỷ lệ lý thuyết và lưu chênh lệch.
5. Hoàn cắt phải trả lại cả số cây/lá lẫn đúng `kg_consumed`, không tính lại bằng số hiện tại.
6. Trả hàng sau cắt phải tạo lô khổ mới; không nhập lại khổ gốc.

Không sửa riêng `remaining_kg` mà bỏ stock ledger; như vậy báo cáo lô và báo cáo kho sẽ lệch nhau.

### P0 — Chốt và sửa chiến lược thành phẩm m²

User chỉ chốt **bán theo m²**, chưa chốt tồn thành phẩm theo m² hay theo Bộ. Hiện có bất nhất cần audit:

- `Measurement Profile: Thành phẩm theo m2` trong generator đang khai `stock_uom = Bộ`.
- Nhiều Item thành phẩm production lại đang giữ `stock_uom = m2`; một số Item còn là Kg.
- Không được ép tất cả sang Bộ chỉ vì profile đang ghi Bộ.

Phiên sau phải xác định một trong hai mô hình:

1. **Made-to-order:** cửa bán m², không giữ tồn thành phẩm; chỉ xuất vật tư/BOM theo từng đơn.
2. **Có tồn thành phẩm:** tồn số Bộ, bán m² với hệ số động từ kích thước và số bộ.

Sau khi chốt mới migrate Item; phải kiểm tra stock ledger trước khi đổi UOM tồn.

### ✅ Đã dọn mặt hàng Kg và mặt hàng ghép ngày 2026-07-30

- 17 mã ron, lá đáy, ray và trục đã chuẩn hóa mua/tồn `Kg`; mã bán lẻ giữ ĐVT bán `Mét`.
- Ron nhựa chốt `0,263 kg/m`, ron inox `0,124 kg/m`; hai trục giữ `4,40` và `4,70 kg/m`.
- 12 mã NCC Tiến Đạt đã khớp `Supplier Item`; tạo thêm năm mặt hàng nguyên tử còn thiếu:
  `TD-TG-ALD`, `RHM8(2.4MM)`, `CQ-VM111`, `TDU26`, `AL-YST`.
- Gỡ hẳn khỏi danh mục ba mã ghép `RONNHUA_INOX`, `TP-BO3LADAY`,
  `BỘ BA LÁ ĐÁY + LÁ ĐẦU`.
- Sáu lô bộ lịch sử được tách thành 24 lô con: mỗi bộ sinh một cái `TP-TD325`, `TP-TD326`,
  `TP-TD327`, `TP-A282` cùng chiều dài. ĐVT nhập/tồn của các mã con vẫn là Kg; không bịa kg
  vì workbook nguồn không có số cân thật.
- Tên hiển thị hai mã con được rút gọn rõ ràng thành `RON NHỰA` và `RON INOX`.
- Production hiện có 296 Item sau khi thêm năm mã nguyên tử và gỡ ba mã ghép; 17
  `Material Specification`, 12 `Supplier Item`, một `Measurement Profile` được tạo. Sáu lô
  bộ cũ đã được thay bằng 24 lô con nên tổng lô là 1.275. Migration chạy lại ghi 0 dòng,
  ledger vẫn 0, `quick_check=ok`.

Đây là correction danh mục thuần dữ liệu. Không đưa công thức đặt hàng, tự tính kg, FIFO hàng
về hoặc công nợ của commit thử nghiệm vào production. Cửa thành phẩm có stock UOM Kg nhưng
sales UOM m² vẫn thuộc quyết định P0 riêng ở trên, không bị đổi trong correction này.

### 🚧 Form Đơn đặt hàng `2.0.1`

- Form nhôm dùng các cột: ngày, mã hàng, kích thước (chiều rộng), trọng lượng định mức kg/m,
  số cây/lá, số kg barem, đơn giá, thành tiền, màu và dập/không dập.
- Định mức lấy từ `Material Specification`; kg barem = kích thước × định mức × số cây/lá.
- `qty` của Đơn mua nhôm là kg barem dự kiến; kg thực cân chỉ xuất hiện ở Phiếu nhập mua.
- Client tự tính để người lập soát ngay; Worker tính lại khi lưu để chặn sửa payload/API.
- Phạm vi này chưa thay thế bước phân bổ FIFO hàng về, dung sai ±5% và báo cáo nợ cây/mét.

### P1 — Phân bổ tồn K36/K12

- File Excel không có kho nên toàn bộ lô được gán K36.
- Cần người dùng cung cấp danh sách lô thực ở K12 hoặc kiểm kê trực tiếp.
- Chỉ đổi trường `warehouse` của lô khi chưa có ledger; khi đã phát sinh stock ledger phải dùng Phiếu chuyển kho.

### P1 — Chạy pilot thật end-to-end

Chọn một giao dịch nhỏ, có thể hoàn tác:

1. Tạo Item nhôm chuẩn hoặc dùng một mã đã xác nhận.
2. Đơn mua nhiều mặt hàng: một dòng nhôm kg + một dòng hàng thường.
3. Phiếu nhập: điền kg thực, khổ, số cây, màu, tình trạng, K36/K12.
4. Xác minh stock ledger kg và `Aluminium Lot` cùng tăng đúng.
5. Tạo đơn bán cửa m².
6. Tạo lệnh/cắt, kiểm tra số cây/lá và kg cùng giảm.
7. Phiếu xuất + hóa đơn + thu tiền; kiểm tra GL/stock/payment ledger.
8. Hủy/hoàn toàn bộ pilot rồi xác minh sổ quay về ban đầu.

### P2 — BOM/combo/dữ liệu ngành

- Hoàn thiện BOM cho cửa Đức, ray, trục, con lăn, ron, lá đầu/lá đáy và phụ kiện.
- Mô tơ + điều khiển + tay điều khiển + nút âm tường là **combo bán hàng/BOM**, không phải một Item tồn kho duy nhất nếu từng bộ phận còn cần quản lý riêng.
- Chốt quy tắc chọn motor 400/600/800/1000 kg.
- Chốt puly theo chiều rộng/trọng lượng, công thức chiều dài trục/ray, luồng sơn/dập và hao hụt.

## 6. Rủi ro không được quên

1. **Hai hệ tồn chưa nối kín:** stock ledger Kg và Aluminium Lot khổ/cây hiện chưa tự đồng bộ theo giao dịch.
2. **Cột kg của 1.257 lô lịch sử đang trống:** Excel nguồn cũng trống; không được bịa hoặc chia đều toàn kho.
3. **K36/K12 chưa phân bổ thật:** hiện dữ liệu lô cũ đều ở K36 theo giả định import.
4. **Profile m² còn bất nhất UOM:** không migrate hàng loạt trước khi chốt mô hình tồn thành phẩm.
5. **Tài liệu cũ có đoạn lỗi thời:** đặc biệt phần nói nhôm tồn chính theo cây/lá.
6. **Không xóa/import lại toàn bộ Item:** danh mục hiện đã được làm sạch và có liên kết giá, màu, quy cách.
7. **Không chạy lại full remaining import trên production:** nếu cần vá lô, dùng chế độ `--lot-columns-only` hoặc migration hẹp có guard.
8. **Nhiều phiên Codex có thể cùng sửa:** luôn kiểm tra `git status`, `git log -5`, diff và production version trước khi code/deploy.

## 7. File/code cần đọc khi tiếp tục

| Mục đích | File |
|---|---|
| Brief/doctype Alumdoor | `server/briefs/alumdoor.json` |
| Worker nghiệp vụ Item/mua/bán/cắt | `server/apps-src/alumdoor-worker/src/index.ts` |
| Controller mua + kho/kế toán lõi | `server/packages/clouderp-core/src/controllers.ts` |
| Controller ERPNext mở rộng/trả hàng | `server/packages/clouderp-erpnext/src/controllers.ts` |
| Controller bán | `server/packages/clouderp-selling/src/controllers.ts` |
| Form/bảng dòng frontend | `client/packages/views/src/form/FormView.tsx` và `ChildGrid.tsx` |
| Bộ điều khiển Link/checkbox | `client/packages/controls/src/controls.tsx` |
| Generator master Alumdoor | `server/scripts/build-alumdoor-master-data.mjs` |
| Import dữ liệu còn lại/lô | `server/scripts/build-alumdoor-remaining-import.mjs` |
| Audit UOM production | `server/scripts/audit-alumdoor-item-uom.mjs` |
| Build metadata release | `server/scripts/build-alumdoor-remaining-release-metadata.mjs` |
| Test Item/mua/bán | `server/tests/alumdoor-item-model.test.mjs` |
| Test dữ liệu/lô | `server/tests/alumdoor-remaining-data.test.mjs` |
| Test full mua/bán/kho | `server/tests/buying.test.mjs`, `erpnext-core.test.mjs`, `o2c.test.mjs` |

## 8. Commit quan trọng gần nhất

| Commit | Nội dung |
|---|---|
| `a69c943` | Cột tồn nhôm 1.20.1 + backfill nguồn Excel |
| `38b0c3b` | Bỏ qua ĐVT giao dịch đã ngừng hoạt động |
| `c8d7437` | Thống nhất luồng Item cho mua và bán, auto-fill, m², nhôm kg |
| `f85549c` | Sắp xếp sidebar |
| `6dfd1c1` | Import NCC/khách/đơn cũ/nhật ký/bảo hành/lô |
| `4a8d0a8` | Cache metadata và bỏ request waterfall gây chậm |
| `12d0a40` | Hoàn thiện cơ chế màu Item |
| `b076131` | Chia metadata migration thành gói D1 an toàn |

## 9. Kiểm tra và triển khai

### Kiểm tra tối thiểu trước khi sửa

```powershell
cd C:\Forge
git status --short
git log -5 --oneline
```

### Kiểm tra brief/Item

```powershell
cd C:\Forge\server
node --test tests/alumdoor-remaining-data.test.mjs tests/alumdoor-item-model.test.mjs
node scripts/forge-app.mjs briefs/alumdoor.json --dry-run
```

### Kiểm tra đầy đủ server

```powershell
cd C:\Forge-worktrees\platform-design\server
npm.cmd run test:unit
```

Mốc release hiện tại: **529/529 test đạt**.

### Đọc version production

```powershell
cd C:\Forge-worktrees\platform-design\server
npx.cmd wrangler d1 execute cloudforge-alu --remote --command "SELECT app_id,version,content_hash FROM installed_apps WHERE tenant_id='alu' AND app_id='alumdoor';" --json
```

Không deploy migration mới trước khi:

1. Có backup D1 mới.
2. Diễn tập migration trên backup SQLite.
3. Kiểm tra migration chạy lần hai không phát sinh thay đổi.
4. Chạy test liên quan.
5. Đọc lại production sau deploy.

## 10. Câu mở đầu đề xuất cho phiên sau

> Đọc `C:\Forge-worktrees\platform-design\docs\ALUMDOOR-HANDOFF.md` và bộ
> `docs/brd-v2/`. Kiểm tra production phải là `alumdoor@2.0.0`, migration 25/25 và D1 id
> `6781cbc1-8635-4b6e-af46-09297c120cff`. Không audit lại từ đầu và không chạy lại full
> import cũ. Việc vận hành còn lại là pilot có dữ liệu thật hoặc staging chuyên dụng:
> nhập — giữ chỗ — cắt/đầu thừa — kiểm kê, rồi đối chiếu cây/kg/giá trị, report và QR.
