# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git và nguồn sự thật

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default HEAD kiểm tra gần nhất: `cd60f8c09c48105db84a82c12ad3b32d9f075064` (`ci: split production observation workflow`).
- Baseline production code/schema đã qua CI trước đó: `591ca359937d6ae12803d36c74996db8482060af`.
- Không commit `server/work/`, `tmp/`, backup SQL, `.env`, secret hoặc generated artifacts.

## Nhánh tồn kho, sản xuất và Item catalog

- Branch: `feat/inventory-manufacturing-item-catalog-20260731`.
- Base: `cd60f8c09c48105db84a82c12ad3b32d9f075064`.
- Code HEAD trước các commit trạng thái: `bdd43c82c37a39436b9096f13fe4e726859547b0`.
- Metadata authoritative: `server/briefs/alumdoor-v2.json`, version `2.0.34`.
- `server/briefs/alumdoor.json` version `1.27.3` chỉ giữ tương thích/đối chiếu; không nhận thay đổi nghiệp vụ song song.

### Gate

- G0 Scope: **complete**.
- G1 BRD: **approved by user delegation**.
- G2 Technical plan: **approved for Slice A**.
- G3 Local verification: **partial**.
- G4 Exact-head CI: **not started / no GitHub status evidence**.
- G5 Staging: **not started**.

### Tài liệu authoritative của nhánh

- `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-ITEM-AUDIT.md`.
- `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-BRD.md`.
- `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-TECHNICAL-PLAN.md`.

Commit tài liệu chính:

- `1bfd7f1d88199525b11f0fd001f198fc0f93fc9e` — BRD tồn kho/sản xuất/Item.
- `8ad0898fbd3a7d3706367c7a9d6e7039db23f2aa` — technical plan và gate triển khai.

### Slice A đã implement

Các file mới:

- `server/scripts/alumdoor-catalog-audit-planner.mjs`
  - Planner thuần dữ liệu cho Item, Item Group, UOM, Measurement Profile, Warehouse, BOM và Production Standard.
  - Trả finding có severity/code ổn định, count và SHA-256 checksum xác định.
  - Phát hiện mâu thuẫn Item theo loại, thiếu UOM/conversion, profile/kho sai, thiếu BOM, BOM trùng và vòng lặp.
- `server/scripts/audit-alumdoor-catalog.mjs`
  - CLI **read-only**.
  - Hỗ trợ fixture `--input` và remote tenant `--tenant`.
  - Remote mặc định redacted; report có tên chỉ được ghi ngoài repository.
  - Từ chối `--execute`, `--apply`, `--fix`, `--write-back`.
- `server/tests/alumdoor-catalog-audit.test.mjs`
  - Cover catalog hợp lệ, lỗi Item/UOM/BOM, BOM trùng/vòng lặp, checksum ổn định, redaction và CLI read-only.
- `server/package.json`
  - Thêm `audit:alumdoor-catalog`.

Commit Slice A:

- `700fff0a1ad34379cd06b58caa851d8898fa3a4b` — planner.
- `81d8a60ff8bab75cb6353afbe9fee20a7f0b6d5d` — CLI read-only.
- `5284bc30a7cea81a41026bc93cc097ffe3c7534e` — fixture tests.
- `bdd43c82c37a39436b9096f13fe4e726859547b0` — package command.

### Kiểm tra đã chạy

```text
node --check server/scripts/alumdoor-catalog-audit-planner.mjs  PASS
node --check server/scripts/audit-alumdoor-catalog.mjs          PASS
node --test server/tests/alumdoor-catalog-audit.test.mjs        PASS 6/6
```

Đây là focused local evidence trên đúng nội dung các file đã commit. Chưa chạy full repository unit/SQL tests, typecheck, build hoặc Browser QA. Không coi G3/G4 hoàn thành.

### Kết luận kiến trúc hiện tại

- Item v2.0.34 là nền tốt, không tạo một Item model thứ hai.
- Existing ERPNext controllers đã có BOM, Work Order và Manufacture Stock Entry cơ bản.
- Blocker thật còn lại:
  - dữ liệu live chưa được audit;
  - warehouse chưa có vai trò NVL/WIP/thành phẩm/chờ kiểm/phế;
  - generic Stock Entry chưa giữ canonical Alumdoor lot/dimension identity;
  - BOM chưa có revision/effective date/UOM conversion/circular guard đầy đủ;
  - Work Order snapshot còn mỏng;
  - manufacturing progress chưa giữ BOM row, lot, scrap/offcut và variance.

## Điều phối với PR mua hàng

- Draft PR `#14` vẫn mở, chưa merge.
- Head kiểm tra gần nhất: `2768188b438d8ce0cd41d7b792aab1848f48210f`.
- PR #14 đang dùng migration `0030` và cùng chạm procurement/stock contracts.
- Nhánh tồn kho/sản xuất **không được tạo migration mới trước khi PR #14 merge hoặc migration head được xác nhận lại**.
- Sau merge phải rebase nhánh này và chạy lại toàn bộ gate.

## Production hiện hành

- Sidebar Gateway đã được phát hành trước đó; production traffic đã được người vận hành xác nhận trên Cloudflare.
- FIFO Purchase Receipt production vẫn phải giữ **disabled** cho tới khi PR #14 hoàn thành backfill, staging và activation approval.
- Nhánh tồn kho/sản xuất chưa deploy, chưa migration tenant `alu`, chưa chạy remote catalog audit, chưa thay đổi secret và chưa bật bất kỳ rollout nào.
