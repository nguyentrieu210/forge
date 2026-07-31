# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

## P0 — đóng gate PR #82 Slice D foundation

Working branch: `feat/inventory-physical-stock-ui-reports-slice-d-20260731`.

1. Lấy exact final head sau hai cập nhật status docs.
2. Chờ đủ exact-head workflows:
   - PR Validation;
   - CI;
   - Inventory and Manufacturing CI;
   - Purchase Feature CI;
   - Sales Feature CI;
   - UI Pull Request Validation.
3. Xác nhận PR mergeable và `behind_by=0`.
4. Xác nhận không có unresolved review thread.
5. Cập nhật PR body với:
   - exact final head;
   - endpoint/native/Frappe wiring;
   - one-snapshot export authorization;
   - cursor `422`;
   - lineage explicit opt-in;
   - final workflow run IDs.
6. Khi mọi gate xanh, mark PR #82 ready for review.
7. **Không merge** nếu chưa có yêu cầu rõ.
8. Không deploy Cloudflare, không migration, không mutate tenant data.

## P0 — Slice D physical-stock UI

1. Tạo Physical Stock Explorer dùng endpoint authoritative, không dựng stock book thứ hai ở client.
2. Filter:
   - Company;
   - Warehouse / Warehouse Role;
   - Item;
   - inventory mode / measurement profile;
   - màu / condition / generation;
   - dimensions;
   - batch / serial.
3. Hiển thị quantity, value, physical count, first/last posting.
4. Lineage drill-down chỉ request `include_lineage: true` khi người dùng mở chi tiết.
5. Export phải dùng endpoint CSV riêng; không export từ rows đang phân trang trên client.
6. Phân biệt loading, empty, permission denied, invalid cursor và source-limit failure.

## P0 — nghiệp vụ kho và sản xuất

1. Quarantine/release view:
   - tồn theo warehouse role;
   - quality release reference;
   - condition/ageing;
   - không thêm write path nếu chưa có command model và audit.
2. Work Order progress:
   - BOM revision snapshot;
   - issued/consumed/produced/scrap/offcut;
   - planned-vs-actual quantity và value;
   - exact reversal lineage.
3. Các báo cáo tiếp theo:
   - WIP;
   - shortage;
   - planned-vs-actual variance;
   - scrap/offcut;
   - ageing;
   - condition;
   - warehouse-role movement.

## P0 — browser QA

1. Tạo runtime harness cho physical-stock explorer.
2. Playwright desktop/mobile:
   - load report;
   - đổi filters;
   - pagination;
   - invalid/stale cursor;
   - permission denial;
   - lineage opt-in;
   - CSV download;
   - empty and large-result states.
3. Không ghi cookie, credential hoặc tenant data thật vào evidence.

## P1 — performance và hardening

1. Benchmark ledger scan ở 20k rows và source-limit fail-closed.
2. Giảm child snapshot query khỏi toàn company nếu profiling cho thấy bottleneck; vẫn phải giữ tenant/company binding.
3. Đo latency first-primary, report pagination và CSV export.
4. Kiểm cursor behavior khi filter/dataset thay đổi.
5. Rà line-key unknown direction và future ledger formats; không silently đoán source/target semantics.

## P0 — production functional smoke còn tồn

### Sales

- Hard refresh `https://alu.kairo.vn`.
- Authenticated Sales Order smoke với `TRỤC 114_1.8LY`, ĐVT `Mét`, rate `180000 VND`.
- Đổi Item/UOM/bảng giá để xác minh không lấy chéo hoặc giữ giá cũ.
- Huỷ/xoá chứng từ thử an toàn.

### Purchase

- Authenticated Purchase Order/Purchase Receipt create-save-submit-cancel smoke.
- Desktop/mobile, item picker, UOM, rate và dropdown.
- FIFO phải tiếp tục disabled.

## Purchase/FIFO activation gates

- Staging hoặc production-shaped sanitized copy.
- Read-only readiness `unresolved_count=0`.
- Exact approved checksum trước mọi write mode.
- Backup mới, functional acceptance và contention/latency evidence.
- Production activation chỉ sau explicit approval riêng.

## Không được làm

- Không merge PR #82 nếu chưa được yêu cầu rõ.
- Không deploy Cloudflare hoặc sửa production secrets/DNS.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
