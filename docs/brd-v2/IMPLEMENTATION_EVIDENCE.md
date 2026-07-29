# ALUMDOOR V2 — IMPLEMENTATION EVIDENCE

> Ngày kiểm: 2026-07-30  
> Worktree: `C:\Forge-worktrees\alumdoor-v2`  
> Nhánh: `feat/alumdoor-v2-kho`  
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

- `pnpm run test`: **515/515 unit PASS** và toàn bộ SQL PASS, gồm 25 migration và các bài tranh chấp 100 request.
- Worker Workerd/D1: **131/131 tenant PASS** và **3/3 query PASS**; test app-registry dùng đúng quy mô **69 DocType + 57 fixture**.
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

## 5. Ranh giới bằng chứng

Tài liệu này chứng minh **build và QA trước release**, không phải bằng chứng production:

- Production vẫn chạy `alumdoor@1.27.0`.
- Chưa tạo backup mới cho lần nâng V2.
- Chưa chạy hai restore drill từ backup mới.
- Chưa chạy pilot ghi dữ liệu V2 trên staging/production.
- Chưa có phê duyệt deploy production.

Vì vậy Pha 7 phải giữ trạng thái chờ cho tới khi hoàn tất `RELEASE_RUNBOOK.md`.
