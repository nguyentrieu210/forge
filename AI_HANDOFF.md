# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status ở `CURRENT_STATUS.md`; hàng đợi ở `NEXT_TASKS.md`; delivery gate ở `DELIVERY_POLICY.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho exact `main`, branch, PR, CI, merge và release evidence.
- Đọc `RUNBOOK.md` -> `CURRENT_STATUS.md` -> `NEXT_TASKS.md` -> file này -> `DELIVERY_POLICY.md`.
- Mọi SHA/branch dưới đây là checkpoint lịch sử; phải xác minh GitHub trước khi dùng.

## Active checkpoint — UI hotfix auto-deploy

- Guarded auto-deploy lane đã merge qua PR `#231` tại `cd1f76dbb47432e2312c6f5577eb955b48c3a856`; PR `#230` là stale iteration đã đóng.
- `.github/workflows/hotfix-ui-one-click.yml` tự chạy production path khi push branch `hotfix/ui-*` có `client/**`; `workflow_dispatch` là fallback.
- Fail-closed invariant: current `main` phải là ancestor; phải có client change; ngoài `client/**` chỉ cho `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`; tối đa 10 file/300 changed lines; backend/package/migration/business metadata/secret/DNS/data không thuộc allowlist.
- Theme hotfix replay hiện ở PR `#232`; phải kiểm exact workflow/release evidence trước khi kết luận production deploy.

## Merged checkpoint — Alumdoor Warehouse Cash integration

- Canonical PR `#233` squash-merge tại `c3dbcd20a7a88c17c1a9f10c4fff82b329e27855`.
- Final validated feature head `162bc010692d3a2997ddbc9bd5e9a59e11cb5d60`: **6/6 required workflows PASS**.
- Ownership invariant: Warehouse Cash schema/controller/ledger tiếp tục thuộc `vn-accounting`; Alumdoor chỉ consume qua integration metadata và generic MetaForge routes.
- `server/briefs/alumdoor-v2.integrations.json` khai dependency `vn-accounting >= 1.1.0` và `externalDocTypes` cho:
  - `Warehouse Cash Fund`
  - `Warehouse Cash Voucher`
  - `Warehouse Cash Transfer`
  - `Warehouse Cash Count`
- `server/scripts/lib/read-brief-source.mjs` là canonical brief reader; integration sidecar chỉ nhận contract được hỗ trợ và fail closed trên unsupported key, duplicate dependency ID hoặc duplicate external DocType.
- `server/scripts/verify-alumdoor-meta-completeness.mjs` phải đọc merged canonical brief source, không bypass sidecar.
- `AlumdoorOperationsCenter` có role-gated tab `Quỹ kho`; route mở DocType canonical, không tạo màn ledger riêng.
- Browser regression khóa hai invariant UX: warehouse role thấy/mở đúng Voucher; sales role không thấy Quỹ kho.
- Four-eyes approval vẫn do Warehouse Cash backend authoritative; UI chỉ thể hiện boundary, không tự cấp quyền.
- Supplier/Customer/Employee có thể là party dimension nhưng không đồng nghĩa settle AR/AP. Purchase/Sales Invoice settlement phải dùng canonical Payment Entry/payment allocation.
- Không đổi Warehouse Cash GL/controller/migration trong PR `#233`; không deploy production trong task này.

## Merged checkpoint — Warehouse Petty Cash backend

- Canonical PR `#214` squash-merge tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: 6/6 required workflows PASS.
- `gl_entries` là source of truth; Warehouse Cash Balance/Daily Usage chỉ là rebuildable projection.
- Correction của Cash Count phải qua adjustment voucher, không mutate balance trực tiếp.
- Purchase/Sales Invoice settlement cần canonical payment allocation; không coi GL party dimension là settlement.

## Checkpoint — Bulk Transaction v1 Purchase Receipt

- Canonical PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.
- Final validated head `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`: 6/6 required workflows PASS.
- Bulk action tạo một Purchase Receipt nháp, reuse canonical FIFO, có idempotency/duplicate guard, same-company/currency guard và tenant guard.
- Generic Bulk View vẫn master-only; transaction/submittable/ledger fail closed.

## Remaining Bulk Transaction

- Stock Reconciliation controller-backed grid.
- BOM parent + child/version grid.
- First-class AppAction input-table transport.
- Batch Print / QR label queue.

## Release boundary

- Merge code không đồng nghĩa deploy production, ngoại trừ guarded UI fast lane khi user đã chủ động dùng đúng `hotfix/ui-*` flow và scope guard PASS.
- Không dùng UI fast lane cho backend/business logic/data chỉ để tiết kiệm thời gian.
- Không đổi DNS/secrets hoặc mutate customer data nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence không được quản lý.
