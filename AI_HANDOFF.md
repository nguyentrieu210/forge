# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status ở `CURRENT_STATUS.md`; hàng đợi ở `NEXT_TASKS.md`; delivery gate ở `DELIVERY_POLICY.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho exact `main`, branch, PR, CI, merge và release evidence.
- Đọc `RUNBOOK.md` -> `CURRENT_STATUS.md` -> `NEXT_TASKS.md` -> file này -> `DELIVERY_POLICY.md`.
- Mọi SHA/branch dưới đây là checkpoint lịch sử; phải xác minh GitHub trước khi dùng.
- Phân loại task `FAST`, `STANDARD` hoặc `CRITICAL`; blast radius tăng thì phải nâng tier.

## Quality tier canonical

- PR `#234` đã merge tại `c453df3026095b314f82f79e338bd56af90632ca`.
- `FAST`: presentation/UI nhỏ, không đổi business logic/API/data/permission/tenant/schema; kiểm tra tối thiểu theo blast radius.
- `STANDARD`: CRUD/API/product behavior thông thường; chạy test và quality gates phù hợp.
- `CRITICAL`: accounting/cash/AR-AP/inventory/costing/manufacturing/auth/permission/tenant/migration/data; giữ regression/integration/security/data-integrity gates đầy đủ.
- `RUNBOOK.md` và `DELIVERY_POLICY.md` là source of truth cho tier policy.

## Active checkpoint — UI hotfix lane

- Guarded auto-deploy lane đã merge qua PR `#231` tại `cd1f76dbb47432e2312c6f5577eb955b48c3a856`; PR `#230` là stale iteration đã đóng.
- Theme hotfix replay hiện ở PR `#232`; phải kiểm exact GitHub release evidence trước khi kết luận trạng thái môi trường chạy thật.

## Merged checkpoint — Alumdoor Warehouse Cash integration

- Canonical PR `#233` squash-merge tại `c3dbcd20a7a88c17c1a9f10c4fff82b329e27855`.
- Final validated feature head `162bc010692d3a2997ddbc9bd5e9a59e11cb5d60`: **6/6 required workflows PASS**.
- Ownership invariant: Warehouse Cash schema/controller/ledger thuộc `vn-accounting`; Alumdoor chỉ consume qua integration metadata và generic MetaForge routes.
- `server/briefs/alumdoor-v2.integrations.json` khai `vn-accounting >= 1.1.0` và external ownership cho `Warehouse Cash Fund`, `Warehouse Cash Voucher`, `Warehouse Cash Transfer`, `Warehouse Cash Count`.
- `server/scripts/lib/read-brief-source.mjs` merge integration sidecar và fail closed trên unsupported key, duplicate dependency ID hoặc duplicate external DocType.
- `server/scripts/verify-alumdoor-meta-completeness.mjs` phải đọc merged canonical brief source.
- `AlumdoorOperationsCenter` có role-gated tab `Quỹ kho`; browser regression khóa warehouse-role visibility, canonical Voucher navigation và sales-role denial.
- Four-eyes approval vẫn do Warehouse Cash backend authoritative; UI không tự cấp quyền.
- Party dimension không đồng nghĩa settle AR/AP. Purchase/Sales Invoice settlement phải dùng canonical Payment Entry/payment allocation.
- PR `#233` không đổi Warehouse Cash GL/controller/migration.

## Merged checkpoint — Warehouse Petty Cash backend

- PR `#214` squash-merge tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: 6/6 required workflows PASS.
- `gl_entries` là source of truth; Warehouse Cash Balance/Daily Usage chỉ là rebuildable projection.
- Correction của Cash Count phải qua adjustment voucher, không mutate balance trực tiếp.

## Checkpoint — Bulk Transaction v1 Purchase Receipt

- PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.
- Final validated head `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`: 6/6 required workflows PASS.
- Generic Bulk View vẫn master-only; transaction/submittable/ledger fail closed.

## Remaining Bulk Transaction

- Stock Reconciliation controller-backed grid.
- BOM parent + child/version grid.
- First-class AppAction input-table transport.
- Batch Print / QR label queue.

## Release boundary

- Merge code không đồng nghĩa trạng thái release môi trường chạy thật; luôn kiểm GitHub release evidence theo đúng lane.
- Không dùng UI fast lane cho backend/business logic/data chỉ để tiết kiệm thời gian.
- Không commit `.env`, `server/work/`, `tmp/` hoặc credential/generated evidence không thuộc source control.
