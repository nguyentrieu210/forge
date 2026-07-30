# ALUMDOOR V2 — IMPLEMENTATION EVIDENCE

> Ngày kiểm: 2026-07-30  
> Worktree release: `C:\Forge-worktrees\platform-design`
> Nhánh: `feat/platform-design-screens`
> Gói: `alumdoor@2.0.0`  
> Mốc bắt đầu của lượt hoàn thiện: `6bb394d`

## 1. Phạm vi đã thi hành

| Spec | Bằng chứng thi hành |
|---|---|
| Tồn hai đơn vị | Ledger/store/tracking mang số lượng và kg; nhập, xuất, chuyển kho, huỷ và kiểm kê đều có test |
| Vị trí lô hiện hành | Reservation, đề xuất và cắt đọc kho từ ledger hiện tại, không dùng `received_warehouse` đã lỗi thời |
| Cắt và đầu thừa | `alumdoor-inventory.ts`, action Worker và test bao phủ kerf, kg thực thắng barem, lô đầu thừa, cắt tiếp đầu thừa, hoàn cắt và trả hàng |
| Giữ chỗ | Availability theo ngưỡng chiều dài; cắt chặn giữ chỗ của chứng từ khác; apply idempotent; maintenance tự nhả sau hạn |
| Kiểm kê | Snapshot hai đơn vị, lý do bắt buộc, điều chỉnh weight-only, cảnh báo voucher phát sinh sau snapshot |
| Báo cáo | Migration 0025 tạo các view tồn/khả dụng; report `Tồn nhôm theo khổ` là home của V2 |
| Dung sai nhập | Migration 0026 khóa tổng phiếu nhận theo dung sai trên Supplier; Worker phân bổ số cây FIFO theo đơn cũ nhất |
| Khóa kỳ | Current row + event ledger; D1 batch atomic; role/company/date/reason được kiểm ở server |
| AI | Action chỉ đọc theo quyền người gọi; câu trả lời thành công ghi `ai_logs`; không tự ghi chứng từ |
| Lịch nền tảng | Nhả giữ chỗ, nhắc kiểm kê tháng/quý, báo cáo cuối ngày có lệch cân; health có last run/failure/stale |
| QR/in | QR thực trong mẫu in bằng `qrcode-generator`; renderer và fieldtype có test |
| Cài gói V2 | Installer gom nhiều hàng/statement để gói 69 DocType + 57 fixture vẫn nằm dưới trần 100 statement và giữ một transaction D1 |
| Giao diện | Bổ sung toàn bộ icon V2 còn thiếu; report và action hiển thị đúng ở desktop/mobile |

## 2. Cổng kiểm tự động

Chạy từ `server/`:

```powershell
pnpm.cmd run build
pnpm.cmd run test
pnpm.cmd run typecheck:workers
pnpm.cmd run test:workers
pnpm.cmd run brief:check
pnpm.cmd run verify
```

Kết quả:

- `pnpm run test:unit`: **529/529 unit PASS** sau merge design, bổ sung kiểm thử restore D1
  và khóa phạm vi correction mặt hàng Kg/mặt hàng con.
- Toàn bộ SQL PASS, gồm 25 migration và các bài tranh chấp 100 request.
- Worker Workerd/D1: **132/132 tenant PASS** và **3/3 query PASS**; test app-registry dùng đúng quy mô **69 DocType + 57 fixture**.
- Worker typecheck, brief schema/dry-run và repo/secrets verify: PASS.

Chạy từ `client/`:

```powershell
pnpm.cmd run typecheck
pnpm.cmd test
pnpm.cmd run build
```

Kết quả:

- Typecheck PASS.
- **83 nhóm selfcheck PASS**.
- Production build PASS. Vite chỉ còn cảnh báo kích thước chunk đã tồn tại; không có lỗi build.

## 3. Cài gói thật ở môi trường cục bộ

Đã áp đủ 25 migration lên D1 cục bộ, build server rồi tạo/cài chính gói V2:

- Nâng cấp thành công: **69 DocType, 1 workflow, 57 fixture**.
- Client manifest phân giải thành công: **67 mục điều hướng**.
- Home: `/report/Tồn nhôm theo khổ`.
- Context scope nhận đúng Warehouse.

`apps-src/alumdoor-worker` chỉ là mã Worker, không phải app-source có `app.json`; vì vậy `pack-app.mjs` không phải cổng hợp lệ cho thư mục này. Cổng đúng của V2 là `forge-app.mjs briefs/alumdoor-v2.json --dry-run`, đã PASS.

## 4. Browser QA

QA dùng runtime build và gói V2 cài thật trên D1 cục bộ:

- Đăng nhập thành công, home mở thẳng `Tồn nhôm theo khổ`.
- Report hiển thị đủ cột, empty state và trạng thái Export đúng.
- Action `Giữ chỗ nhôm`, `Hỏi trợ lý`, `Khoá kỳ`, `Mở kỳ` hiển thị đúng trường bắt buộc và mô tả an toàn.
- Viewport desktop và **390×844** đều không vỡ layout; bảng report cuộn ngang có kiểm soát.
- Console không có error.
- Sau khi bổ sung icon registry, bundle hiện hành không còn cảnh báo “Không có icon”.

Không submit chứng từ nghiệp vụ trong Browser QA; các side effect đã được kiểm bằng unit/integration/SQL test.

## 5. Bằng chứng production

- Người dùng phê duyệt rõ ràng việc nhập nhánh design và deploy.
- Merge V2 vào nhánh design: `f5187ee`; đồng bộ lockfile: `fb83520`; bản sửa restore:
  `f484662`.
- Backup release: `alu-2026-07-29T20-45-09-596Z.sql`, 3.233.930 byte,
  SHA-256 `b0a169e3c7eb056843bb9af842f35cba9e2b258a7da6100047d9fbe2df5b1a4f`.
- Hai restore drill độc lập cùng từ backup trên đều đạt 64 bảng, `quick_check=ok`,
  `routes_changed=false`.
- Production D1 đã áp migration 24–25; tổng 25/25, `quick_check=ok`.
- Tenant Worker, app Worker và gateway/client design đã deploy; app metadata nâng cấp thành
  `alumdoor@2.0.0`, hash
  `b62cb1818d0aafc28f71a8ad5735dff8e866d0ec0f37a08c7c2d2fd449e74387`.
- Production đọc lại đúng 69 DocType, 57 fixture, 67 nav; `/health` 200, shell 200,
  guest API 403.
- Browser production đăng nhập thành công; home `Tồn nhôm theo khổ`, action `Cắt nhôm`
  và danh sách `Kiểm kê kho` đều mở được.
- Trước khi nhập dữ liệu thật đã tạo backup `alu-2026-07-29T21-20-23-660Z.sql`
  (SHA-256 `94915e4d0d3697f28c097ebdf9f01e085804dc04bf8901f2684176b87f9a0cc4`) và
  restore thành công vào D1 drill `cloudforge-drill-alumdoor-data-20260730` với 67 bảng,
  `quick_check=ok`, không đổi route.
- Ba workbook nguồn khớp SHA audit; SQL import đầy đủ được áp hai lần trên drill và giữ đúng
  3.562 khóa duy nhất, không nhân bản, không phát sinh stock/GL/payment ledger.
- Import production chạy một lần và đối chiếu đạt: 1.257 lô / 43.601 cây-lá, 439 khách hàng,
  22 nhà cung cấp, 17 Item nhôm, 7 màu, 1.474 đơn hàng cũ, 254 nhật ký nhập, 86 bảo hành,
  6 định mức; `documents=search_rows=distinct_keys=3.562`, migration 25/25,
  `quick_check=ok`.
- Smoke đăng nhập production sau import đọc đúng count của bốn danh sách chính và đăng xuất
  thành công; `/health` 200, shell 200, guest API vẫn 403.
- Hậu kiểm phát hiện lượt import đầu chỉ lấy 17 profile và 7 mã màu phát sinh trong workbook
  tồn, chưa lấy workbook danh mục. Đã đối chiếu `Hàng hoá _ Vật tư-20260728-2018.xlsx`:
  277/277 mã duy nhất khớp bộ SQL catalogue đã audit, không có mã thừa/thiếu.
- Bảng màu chủ xưởng được hiện thực đủ 24 dòng: 18 sơn tĩnh điện, 5 mạ màu, 1 THÔ; mã cũ
  của lô được chuẩn hoá sang tên đầy đủ và mã NCC `9512`/`4004` được giữ trên TRẮNG/ĐỎ ĐÔ.
- Trước correction đã backup `alu-2026-07-30T03-57-41-654Z.sql`, SHA-256
  `f9b12f831a692cd5ebd2bf951ff22e9e813b2b07f34bde047e48c96dbc7c4f85`; restore vào
  `cloudforge-drill-alumdoor-catalog-20260730` đạt 67 bảng, không đổi route.
- Catalogue + color correction áp hai lần trên drill vẫn giữ đúng 294 Item, 292 Item Price,
  24 Item Color, 1.257 Aluminium Lot và khóa duy nhất tương ứng; ledger 0, `quick_check=ok`.
- Production correction áp một lần; `documents=document_search=4.191`, không còn Item Color
  alias cũ, không có Item Price trỏ Item thiếu. Smoke đăng nhập đọc đúng count và phạm vi màu.
- Correction mặt hàng nguyên tử dùng backup
  `alu-2026-07-30T05-17-21-159Z.sql`, SHA-256
  `1b24d419fa78e0d59d1679b8c39dfa4ed3d33724498ed2ccb67782255915f602`; bản DPAPI được
  lưu riêng ngoài thư mục Cloudflare.
- Cùng backup đã restore độc lập vào
  `cloudforge-drill-alumdoor-catalog-a-20260730` và
  `cloudforge-drill-alumdoor-catalog-b-20260730`: 67 bảng, `quick_check=ok`, không đổi route.
- Migration danh mục chạy hai lần trên drill; lần hai ghi 0 dòng. Production tạo năm Item còn
  thiếu, chuẩn hóa đủ 17 mã mục tiêu về mua/tồn Kg, tạo 12 ánh xạ mã Tiến Đạt và gỡ hẳn ba
  mã ghép. Sáu lô bộ lịch sử được tách thành 24 lô con, không tự đặt số kg khi nguồn không có
  cân thực. Trạng thái cuối là 296 Item và 1.275 lô; chạy lại production ghi 0 dòng, stock
  ledger vẫn 0, `quick_check=ok`.
- Backup ngay trước bước tách lô: `alu-2026-07-30T05-34-14-166Z.sql`, SHA-256
  `43d62ad131b4217c7bae90e985d6b99f5091b54b34a56274cec1f2709a9b4de7`; bản DPAPI lưu
  ngoài thư mục Cloudflare.
- Phạm vi correction được khóa bằng test: không có công thức đơn mua, tự tính kg, phân bổ hàng
  nhập FIFO hoặc logic công nợ.

## 6. Ranh giới còn lại

Không submit chứng từ nghiệp vụ giả trên production. Import vừa thực hiện chỉ đưa master và
chứng từ lịch sử vào các DocType tham chiếu. Workbook tồn không có giá trị kg, nên không thể
tạo số dư mở đầu hoặc stock ledger đáng tin cậy. Pilot nhập có kg cân thật — giữ chỗ —
cắt/đầu thừa — kiểm kê và đối chiếu cây/kg/giá trị vẫn là cổng vận hành còn mở; không phải lỗi
build/deploy.
