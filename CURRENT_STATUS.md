# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default/base branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/inventory-physical-stock-ui-reports-slice-d-20260731`.
- Pull request: `#82` — `feat(inventory): add physical stock read model and Slice D foundation`.
- Base head: `f27d4c6efe37a0cca91e3f1672a199d33b09cbab`.
- Code checkpoint head: `bdc07ed6ada9e60382e429715d7704005bd6984c`.
- Branch so với base: `behind_by=0`; PR open, draft và mergeable.
- Không commit `.env`, secret, `server/work/`, `tmp`, backup hoặc generated evidence.

## Inventory Slice D foundation

### Authoritative physical-stock read model

- Đọc từ append-only `stock_ledger_entries`; không tạo sổ tồn thứ hai.
- Nhóm theo tenant, company, Item, warehouse, canonical physical identity, batch và serial.
- Hỗ trợ filter warehouse role, inventory mode/profile, màu, condition, generation, dimensions, batch và serial.
- Cộng quantity, value và physical count bằng safe integers.
- Reconcile lineage và totals; exact reversal được giữ trong lineage.
- Cursor pagination deterministic, giới hạn tối đa 500 rows.
- Cursor sai trả validation `422`, không biến lỗi client thành `500`.

### Bounded D1 reader

- Parameter-bind tenant/company khi đọc ledger và document snapshots.
- Map source, target, finished-good và reversal rows.
- Join child-row hoặc finished-good physical identity snapshots.
- Chia physical count theo tỷ lệ trên split batch rows và giữ đúng tổng.
- Fail closed khi scan vượt hạn mức, tenant/company leakage, malformed JSON hoặc unsafe integer.

### Tenant report endpoint

- Native routes:
  - `POST /api/v1/reports/physical-stock`;
  - `POST /api/v1/reports/physical-stock/export`.
- Frappe methods:
  - `metaforge.inventory.physical_stock`;
  - `metaforge.inventory.physical_stock_export`.
- Tenant chỉ lấy từ authenticated server context; body không được chọn `tenant_id`/`tenantId`.
- Native route dùng trusted identity; Frappe route dùng cookie session + CSRF hoặc app callback trusted identity.
- D1 request dùng `first-primary` session.
- Quyền dựa trên `Stock Entry` report/export và User Permission cho Company, Warehouse, Warehouse Role.
- Owner/share-only read scope bị từ chối vì ledger không có owner/share semantics an toàn.
- Lineage mặc định redacted; chỉ trả khi request explicit `include_lineage: true` và scope cho phép.
- CSV có UTF-8 BOM, spreadsheet-formula protection, private no-store và không chấp nhận pagination controls.
- Export dùng đúng một permission/scope snapshot để tránh authorization TOCTOU.

### Entrypoint/build

- Router tenant cũ được giữ trong `server/apps/tenant-worker/src/index-core.ts`.
- `index.ts` là wrapper nhỏ chỉ intercept physical-stock routes; route và scheduled task cũ delegate vào core.
- `server/scripts/ensure-tenant-worker-core.mjs` bắt buộc emit `index-core.js/.d.ts/.map` sau `tsc` và fail rõ nếu output thiếu.

### Regression

- `server/tests/physical-stock-read-model.test.mjs`.
- `server/tests/physical-stock-report-service.test.mjs`.
- `server/tests/d1-physical-stock-ledger-reader.test.mjs`.
- `server/tests/physical-stock-api.test.mjs`.
- Bao phủ tenant injection, Company/Warehouse scope, owner/share rejection, Frappe args/envelope, export permission, BOM bytes, formula safety, single-scope export, explicit lineage opt-in và cursor `422`.

## Code checkpoint validation

Exact code head `bdc07ed6ada9e60382e429715d7704005bd6984c`:

- CI `30653484654`: **SUCCESS**.
- Sales Feature CI `30653484739`: **SUCCESS**.
- Purchase Feature CI `30653484672`: **SUCCESS**.
- PR Validation `30653484621`: tests/typecheck PASS, build đang hoàn tất khi cập nhật file này.
- Inventory and Manufacturing CI `30653484708`: focused tests, SQL, briefs và lint PASS; full repository gates đang chạy khi cập nhật file này.
- UI Pull Request Validation `30653484644`: lint/tests/typecheck/build PASS; browser/auth smoke đang chạy khi cập nhật file này.
- Release Alumdoor App Worker và production observation: skipped đúng điều kiện PR.

## Review fixes trong đợt này

- Sửa build thiếu `index-core.js` bằng targeted TypeScript emit có diagnostics.
- Sửa test header theo `jsonResponse` platform semantics.
- Kiểm BOM CSV bằng raw bytes vì `Response.text()` loại BOM khi decode.
- Khóa export permission và data scope vào một snapshot.
- Đổi invalid cursor thành validation `422`.
- Đổi lineage thành explicit opt-in.
- Review threads hiện tại: `0`.

## Việc còn lại của Slice D

- Physical-stock explorer và lineage drill-down UI.
- Quarantine/release và Work Order progress views.
- WIP, shortage, planned-vs-actual variance, scrap/offcut, ageing và condition reports.
- Runtime harness và Playwright desktop/mobile cho các màn Slice D.
- Benchmark source scan, pagination, CSV và large-tenant behavior.

## Trạng thái release khác cần giữ

- Sales Unicode Item Price đã release đúng app Worker `cloudforge-app-alumdoor`, production Version ID `734fd53b-94ce-401d-86e8-ca4cd0ffee2e`.
- Tenant Worker release nền tảng trước đó vẫn là `cloudforge-tenant-alu`, version `ed5852cf-94ef-4a02-b0b9-1e64020c2d0d`.
- FIFO rollout vẫn **disabled**.

## Safety

- Không deploy Cloudflare trong PR #82.
- Không sửa production secrets hoặc DNS.
- Không migration hoặc mutate tenant data.
- Không bật FIFO.
