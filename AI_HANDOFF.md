# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head sau release preparation: `077d9944b1cfc1f436da87472f070ee2bd864b44`.
- Working branch: `docs/sales-price-unicode-release-status-20260731`.
- GitHub là nguồn sự thật cho code, CI và release evidence.

## Đã hoàn tất

Sửa và release production case Sales Order hiện `TRỤC 114_1.8LY` và ĐVT `Mét` nhưng `Đơn giá` trống.

### Code

- `server/apps-src/alumdoor-worker/src/sales-item-context.ts`
  - chuẩn hóa Price List, Item, UOM, Currency và Warehouse về Unicode NFC;
  - legacy Item Price lookup trước;
  - exact-name probe lỗi không chặn field fallback;
  - fallback query Price List + Item rồi so UOM canonical trong code.
- `server/packages/clouderp-pricing/src/index.ts`
  - áp cùng canonical matching cho pricing lúc lưu/submit;
  - legacy trước exact;
  - UOM và currency validation dùng text đã chuẩn hóa.
- `server/tests/sales-price-unicode-normalization.test.mjs`
  - UOM Unicode tương đương;
  - exact probe HTTP 400 vẫn fallback được;
  - authoritative pricing trả `180000.00` và UOM `Mét`.

### Merge và CI

- Feature PR `#91` squash-merge SHA `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Exact feature head `c0d9df33a9fbde7540683107fd948c388a026682`.
- Required workflows đều PASS:
  - CI `30647911536`;
  - Inventory and Manufacturing CI `30647910730`;
  - UI Pull Request Validation `30647910724`;
  - Purchase Feature CI `30647908408`;
  - PR Validation `30647908313`;
  - Sales Feature CI `30647908363`.

### Production release

- Release preparation PR `#93` merge SHA `077d9944b1cfc1f436da87472f070ee2bd864b44`.
- Execution PR `#95` đã đóng không merge.
- Release run `30648518868`: SUCCESS.
- Target SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Worker: `cloudforge-tenant-alu`.
- Version ID: `09ab6ce6-3998-4f76-8b45-c9005eeb1152`.
- Deployment time: `2026-07-31T16:49:07.992Z`.
- Backup, recorded migrations, deploy, `/health=200` và guest boot `403`: PASS.
- Không deploy Gateway, không sửa DNS/secrets, FIFO vẫn disabled.

## Việc tiếp theo

1. Người dùng hard refresh `alu.kairo.vn`.
2. Mở Sales Order mới.
3. Chọn `Giá niêm yết`, `TRỤC 114_1.8LY`, ĐVT `Mét`.
4. Xác minh Đơn giá `180000 VND`, Thành tiền và save-time pricing.
5. Đổi Item/UOM/bảng giá để xác minh không lấy chéo hoặc giữ giá cũ.
6. Huỷ/xoá chứng từ thử an toàn.

## Safety

- Không sửa production secrets hoặc DNS.
- Không mutate Item Price hay dữ liệu khách hàng.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
