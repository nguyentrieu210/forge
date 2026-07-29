# ALUMDOOR — BÀN GIAO CHO PHIÊN SAU

> Cập nhật: **2026-07-29 13:35 (UTC+7)**  
> Mã nguồn chính: **`C:\Forge`**  
> Nhánh đang làm: **`feat/alumdoor-warehouse-tree`**  
> Commit chốt: **`a69c943 feat(alumdoor): align aluminium lot stock columns`**  
> Production: **<https://alu.kairo.vn>** — app **Alumdoor 1.20.1**

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
- App đang cài: `alumdoor@1.20.1`
- Content hash: `eb35d29e4c886d8adae48e185247494bb9e7067e95a4ac2383bc4ac3b092bc0d`
- Bản cập nhật 1.20.1 chỉ thay metadata + vá dữ liệu lô; không cần deploy lại frontend/Worker.

### 2.2 Bản sao trước khi cập nhật 1.20.1

- SQL: `C:\Forge\server\backups\alu\alu-2026-07-29T05-33-01-513Z.sql`
- Manifest: cùng tên, đuôi `.sql.json`
- SHA-256: `816443c07dc1405df613b713f364059de0490dbc8c61a687c5b5d29c4ecf429d`
- Dung lượng: `10,310,738` byte

### 2.3 Số liệu đã đọc lại trực tiếp sau deploy

| Hạng mục | Kết quả |
|---|---:|
| Tổng chứng từ trong tenant | 4.231 |
| Lô nhôm hiện hữu | 1.257 |
| Tổng số lá/cây trong các lô | 43.601 |
| Dòng được đánh dấu “Chọn cắt” | 4 |
| Dòng có “Nhập/Ghi chú” | 163 |
| Trạng thái “Sắp hết” | 55 |
| Trạng thái “Hết” | 53 |
| Dòng có `remaining_kg` từ Excel | 0 |
| Stock ledger | 0 |
| GL ledger | 0 |
| Payment ledger | 0 |

Ba ledger bằng 0 không phải lỗi của đợt 1.20.1: dữ liệu lịch sử được nhập vào doctype tham chiếu để tránh tự sinh bút toán giả. Nhưng đây cũng có nghĩa là cần chạy một giao dịch thật end-to-end trước khi coi phân hệ vận hành xong.

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
- 277 Item và 292 dòng giá đã được giữ từ dữ liệu đã làm sạch trước đó.
- 17 mã/profile nhôm, 7 mã màu xuất hiện trong sổ tồn.
- 1.474 đơn hàng cũ / 4.653 dòng đơn.
- 254 nhật ký nhập cũ.
- 86 bảo hành.
- 6 định mức công đoạn.
- Dữ liệu lịch sử nằm trong doctype tham chiếu, không tự sinh sổ kho/kế toán.

Nguồn hiện còn ở:

- `C:\Users\Admin\Downloads\2026 ĐƠN HÀNG - XUẤT HÀNG.xlsx`
- `C:\Users\Admin\Downloads\TỒN NHÔM 2026 NEW.xlsx`
- `C:\Users\Admin\Downloads\CTY SÁU HỒNG.xlsx`

Audit nguồn: `server/imports/alumdoor-lot-columns-2026-07-29.audit.json` và `server/imports/alumdoor-remaining-2026-07-29.audit.json`.

## 5. Việc cần làm tiếp — theo đúng thứ tự

### P0 — Nối Phiếu nhập mua với Lô nhôm

Đây là việc quan trọng nhất và chưa hoàn thiện:

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

### P1 — Dọn các khoảng trống quy đổi Item

Audit gần nhất còn các mã cần kiểm tra/khôi phục quy đổi:

- `RNHUA-DR`: Kg ↔ Mét, dữ liệu định mức đang có `0,10 kg/m`.
- `RNINOX-DR`: Kg ↔ Mét, dữ liệu định mức đang có `0,12 kg/m`.
- `TRỤC 114_1.8LY`: Kg ↔ Mét, khoảng `4,40 kg/m`.
- `TRỤC 114_2.1LY`: Kg ↔ Mét, khoảng `4,70 kg/m`.
- Một số Item cửa thành phẩm đang có stock UOM Kg nhưng sales UOM m²; phải xử lý sau quyết định P0 ở trên.

Trước khi migrate phải chạy `server/scripts/audit-alumdoor-item-uom.mjs`, đọc stock ledger và chỉ sửa các Item không có lịch sử hoặc có phương án chuyển đổi rõ.

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
cd C:\Forge\server
npm.cmd run test:unit
```

Mốc hiện tại: **469/469 test đạt**.

### Đọc version production

```powershell
cd C:\Forge\server
npx.cmd wrangler d1 execute cloudforge-alu --remote --command "SELECT app_id,version,content_hash FROM installed_apps WHERE tenant_id='alu' AND app_id='alumdoor';" --json
```

Không deploy migration mới trước khi:

1. Có backup D1 mới.
2. Diễn tập migration trên backup SQLite.
3. Kiểm tra migration chạy lần hai không phát sinh thay đổi.
4. Chạy test liên quan.
5. Đọc lại production sau deploy.

## 10. Câu mở đầu đề xuất cho phiên sau

> Đọc `C:\Forge\docs\ALUMDOOR-HANDOFF.md`, kiểm tra code và production hiện tại. Không audit lại từ đầu và không đổi mô hình đã chốt. Bắt đầu P0: nối Phiếu nhập mua nhôm (kg thực cân + khổ + số cây + màu + kho) với Aluminium Lot và stock ledger Kg, có idempotency, cancel/reversal và test end-to-end. Sau đó mới làm trừ sản xuất đồng thời theo cây/lá và kg.
