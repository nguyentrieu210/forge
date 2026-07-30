# ALUMDOOR V2 — RELEASE / ROLLBACK RUNBOOK

> Production hiện hành: `alumdoor@2.0.0` trên tenant `alu` từ 2026-07-30.
> Release đã nâng cấp từ bản thực tế đọc trực tiếp `alumdoor@1.26.2`, cùng app id `alumdoor`.
> Tài liệu này không cấp quyền deploy. Chỉ chạy bước production sau khi có phê duyệt rõ ràng.

## 1. Cổng “không được đi tiếp”

Phải dừng release nếu thiếu bất kỳ mục nào:

- Worktree/commit release đã được chốt và toàn bộ cổng trong `IMPLEMENTATION_EVIDENCE.md` PASS.
- Có cửa sổ bảo trì và người có quyền quyết định rollback.
- Có backup D1 **mới ngay trước release**, checksum manifest khớp.
- Backup plaintext đã được sao sang nơi lưu mã hóa ngoài tài khoản Cloudflare.
- Cùng backup đó đã restore thành công **hai lần** vào hai D1 drill mới khác nhau.
- Có checklist pilot và người đối chiếu ledger.

## 2. Chuẩn bị artifact

Chạy trong `server/`:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd run build
pnpm.cmd run test
pnpm.cmd run typecheck:workers
pnpm.cmd run test:workers
pnpm.cmd run brief:check
pnpm.cmd run verify
node scripts/forge-app.mjs briefs/alumdoor-v2.json --dry-run --out work/alumdoor-v2.package.json
```

`pnpm run build` phải chạy **trước** `forge-app.mjs`; checkout sạch chưa có `dist/` sẽ không biên dịch brief được.

Xác nhận package:

- id `alumdoor`, version `2.0.0`;
- 69 DocType, 1 workflow, 57 fixture;
- home `report:Tồn nhôm theo khổ`;
- không có bí mật trong package.

## 3. Backup và hai restore drill

### 3.1 Backup production

Dry-run trước:

```powershell
pnpm.cmd run tenant:backup -- --tenant alu
```

Khi đúng tenant/database/output:

```powershell
pnpm.cmd run tenant:backup -- --tenant alu --execute
```

Giữ lại cả `.sql` và `.sql.json`; kiểm `sha256`. Không chỉnh sửa file SQL sau khi tạo manifest.

### 3.2 Restore drill lần 1

Tạo một D1 trống có tên theo mẫu `cloudforge-drill-alumdoor-v2-a`, rồi:

```powershell
pnpm.cmd run tenant:restore-drill -- --tenant alu --target cloudforge-drill-alumdoor-v2-a --file <đường-dẫn-backup.sql>
pnpm.cmd run tenant:restore-drill -- --tenant alu --target cloudforge-drill-alumdoor-v2-a --file <đường-dẫn-backup.sql> --execute --confirm cloudforge-drill-alumdoor-v2-a
```

Lưu file evidence `.restore.json`; xác nhận `routes_changed:false`, `PRAGMA quick_check` đạt và số bảng hợp lý.

### 3.3 Restore drill lần 2

Lặp lại trên **D1 trống mới** `cloudforge-drill-alumdoor-v2-b`. Không xóa/rỗng rồi tái sử dụng đích lần 1.

Hai evidence phải cùng trỏ tới SHA-256 của backup release.

## 4. Staging/pilot

1. Đóng băng ghi nghiệp vụ trong lúc chụp backup và nâng cấp.
2. Áp migration tenant theo thứ tự tới `0025_alumdoor_inventory_views.sql`.
3. Cài package `alumdoor@2.0.0` như một **upgrade của cùng app id**, không cài app song song.
4. Deploy tenant Worker/platform tương thích trước khi mở UI V2.
5. Deploy runtime client đã build.
6. Kiểm `/health`: service OK, migration hiện hành, maintenance không failed/stale.
7. Đăng nhập bằng role Chủ xưởng và Thủ kho; kiểm permission/navigation.

Pilot tối thiểu:

- nhập một lô có số cây + kg thực + giá trị;
- tạo/nhả giữ chỗ và chứng minh tồn khả dụng đổi nhưng tồn thực không đổi;
- cắt có kerf, sinh đầu thừa đúng kho con và cắt tiếp đầu thừa;
- thử chặn cắt vào phần đã giữ cho chứng từ khác;
- snapshot kiểm kê, tạo phát sinh sau snapshot, xác nhận cảnh báo rồi duyệt;
- kiểm `Stock Ledger`, `Tồn nhôm theo khổ`, lệch cân, hao hụt và notification cuối ngày;
- in một chứng từ có QR và quét đọc được.

Đối chiếu tổng số lượng, tổng kg và giá trị trước/sau từng pilot. Chỉ mở lại ghi nghiệp vụ khi tất cả đạt.

## 5. Nâng production

Chỉ thực hiện sau khi staging/pilot đạt và có phê duyệt:

1. Thông báo cửa sổ bảo trì, dừng ghi.
2. Chụp backup production cuối cùng nếu backup gate không còn sát thời điểm.
3. Áp migration tới 0025.
4. Deploy platform/tenant Worker tương thích.
5. Cài `alumdoor@2.0.0`.
6. Deploy client.
7. Chạy health/smoke và pilot rút gọn.
8. Đối chiếu ledger/report; ghi thời điểm mở lại hệ thống.
9. Cập nhật `docs/ALUMDOOR-HANDOFF.md` và sổ go-live chỉ sau khi production thật sự đạt.

## 6. Điểm kích hoạt rollback

Rollback ngay nếu có một trong các dấu hiệu:

- migration/cài package lỗi hoặc health failed/stale;
- ledger lệch số cây, kg hay giá trị;
- cắt/hoàn cắt/giữ chỗ không idempotent;
- permission cho phép sai role;
- report khả dụng không khớp ledger;
- lỗi UI chặn quy trình pilot;
- không thể hoàn tất smoke trong cửa sổ bảo trì.

## 7. Quy trình rollback

Installer không cho hạ version tại chỗ. Không cố “cài lại 1.27.0” trên database đã migration V2.

1. Giữ hệ thống ở trạng thái dừng ghi.
2. Ghi lại mốc lỗi, deployment/version và mọi giao dịch pilot sau backup.
3. Chuyển về Worker/client V1 đã biết tốt.
4. Khôi phục D1 từ **backup release đã qua hai restore drill** theo quy trình vận hành được phê duyệt.
5. Chỉ đổi route/binding sau khi database phục hồi đạt integrity/health.
6. Kiểm app `alumdoor@1.27.0`, counts chính, ledger và đăng nhập.
7. Mở lại ghi; ghi rõ các giao dịch phát sinh sau backup cần nhập lại thủ công.

Không rollback bằng cách sửa trực tiếp `installed_apps`, xóa migration row hoặc chạy câu SQL đảo tự chế.

## 8. Trạng thái hiện tại

Đã thực hiện ngày 2026-07-30:

- backup release + checksum + bản mã hoá DPAPI ngoài Cloudflare;
- hai restore drill độc lập đạt 64 bảng và `quick_check=ok`;
- migration production tới 25/25;
- deploy tenant Worker, app Worker, gateway/client design;
- cài `alumdoor@2.0.0` và hậu kiểm D1/HTTP/Browser production;
- tạo thêm backup ngay trước import dữ liệu thật, restore drill 67 bảng đạt;
- xác minh bộ import idempotent hai lần trên drill, sau đó nhập một lần vào production;
- đối chiếu đạt 3.562 hồ sơ/khóa/search row, gồm 1.257 lô và 43.601 cây-lá;
  stock/GL/payment ledger vẫn bằng 0, migration 25/25, `quick_check=ok`;
- smoke đăng nhập đọc đúng count danh sách chính, đăng xuất thành công; health/shell 200 và
  guest API 403.
- correction catalogue ngày 2026-07-30: backup mới + restore drill riêng đạt; nhập đủ 277
  mặt hàng danh mục cộng 17 profile, 292 dòng giá và 24 màu chuẩn; sáu mã màu lô cũ đã đổi
  sang tên đầy đủ;
- hậu kiểm production: 4.191 hồ sơ/search row, Item Price không trỏ mã thiếu, không còn alias
  Item Color cũ, ledger vẫn 0 và `quick_check=ok`; API đăng nhập đọc đúng count.
- correction mặt hàng Kg/mặt hàng con: backup mới
  `alu-2026-07-30T05-17-21-159Z.sql` (SHA-256
  `1b24d419fa78e0d59d1679b8c39dfa4ed3d33724498ed2ccb67782255915f602`) có bản DPAPI;
  hai restore drill độc lập đạt 67 bảng và `quick_check=ok`;
- production hiện có 299 Item; 17 mã mục tiêu mua/tồn Kg, 12 ánh xạ mã Tiến Đạt, năm Item
  nguyên tử mới và ba mã ghép bị vô hiệu hóa. Migration chạy lại ghi 0 dòng, ledger vẫn 0.
  Correction này không triển khai công thức đơn mua/FIFO/công nợ.

Chưa chạy pilot có ghi ledger. Dữ liệu vừa nhập là master/chứng từ lịch sử tham chiếu; workbook
tồn không có kg nên không thể tạo số dư mở đầu đáng tin cậy. Checklist pilot mục 4 vẫn phải
chạy với kg cân thật hoặc staging chuyên dụng trước khi chuyển Pha 7 từ vàng sang hoàn tất.
